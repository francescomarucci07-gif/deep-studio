import { NextResponse, type NextRequest } from "next/server";
import { buildContext } from "@/lib/coach/context";
import { COACH_SYSTEM } from "@/lib/coach/prompt";
import { streamCoach, trimHistory, type Turn } from "@/lib/coach/stream";
import { STAGES, SUBGENRES, labelOf } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";

// Il coach delle analisi (mix caricato). Gira solo sul server: la chiave Anthropic non arriva al browser.
export const runtime = "nodejs";
export const maxDuration = 60;

const HISTORY_LIMIT = 30;

type Body = { versionId?: string; message?: string };

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Il coach non è ancora attivo: manca ANTHROPIC_API_KEY nelle variabili di Vercel." },
      { status: 503 },
    );
  }
  const { versionId, message } = (await request.json().catch(() => ({}))) as Body;
  const text = message?.trim();
  if (!versionId || !text) return NextResponse.json({ error: "Messaggio vuoto." }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "Messaggio troppo lungo." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Rientra da /accedi." }, { status: 401 });

  // Tutte le letture passano dalla RLS: se la versione non è dell'utente, non la vede.
  const { data: version } = await supabase
    .from("track_versions")
    .select("id, version_no, stage, track_id, tracks(title, subgenre)")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return NextResponse.json({ error: "Versione non trovata." }, { status: 404 });
  const track = version.tracks as unknown as { title: string; subgenre: string };

  const latestAnalysis = async (vid: string) =>
    (
      await supabase
        .from("analyses")
        .select("data")
        .eq("version_id", vid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.data ?? null;

  const { data: prevVersion } = await supabase
    .from("track_versions")
    .select("id, version_no")
    .eq("track_id", version.track_id)
    .lt("version_no", version.version_no)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevAnalysis = prevVersion ? await latestAnalysis(prevVersion.id) : null;

  const context = buildContext({
    title: track.title,
    subgenre: labelOf(SUBGENRES, track.subgenre),
    stage: labelOf(STAGES, version.stage),
    versionNo: version.version_no,
    analysis: await latestAnalysis(version.id),
    previous: prevVersion && prevAnalysis ? { versionNo: prevVersion.version_no, analysis: prevAnalysis } : null,
  });

  const { data: history } = await supabase
    .from("coach_messages")
    .select("role, content")
    .eq("version_id", version.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const past = trimHistory(((history ?? []) as Turn[]).reverse());

  const { error: insertError } = await supabase
    .from("coach_messages")
    .insert({ version_id: version.id, role: "user", content: text });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return streamCoach({
    // il contesto cambia solo con una nuova analisi: in cache insieme alle istruzioni
    system: [{ text: COACH_SYSTEM }, { text: context, cache: true }],
    messages: [...past, { role: "user", content: text }],
    maxTokens: 2000,
    effort: "medium",
    save: (answer, meta) =>
      supabase.from("coach_messages").insert({ version_id: version.id, role: "assistant", content: answer, ...meta }),
  });
}
