import { NextResponse, type NextRequest } from "next/server";
import { COACH_CREA_SYSTEM } from "@/lib/coach/prompt-crea";
import { streamCoach, trimHistory, type Turn } from "@/lib/coach/stream";
import { createStudioWriter, STUDIO_TOOLS } from "@/lib/daw/coach-tool";
import { describe, isSlot, normalize } from "@/lib/daw/project";
import { createClient } from "@/lib/supabase/server";

// Il coach dello studio nel browser: riceve il pattern attuale (anche se non ancora salvato) e risponde corto.
export const runtime = "nodejs";
export const maxDuration = 60;

const HISTORY_LIMIT = 20;

type Body = {
  projectId?: string;
  message?: string;
  project?: unknown;
  title?: string;
  editing?: unknown;
  misure?: unknown; // le misure dell'export calcolate nel browser ("Fammi un parere")
};

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Il coach non è ancora attivo: manca ANTHROPIC_API_KEY." }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const text = body.message?.trim();
  if (!body.projectId || !text) return NextResponse.json({ error: "Messaggio vuoto." }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Messaggio troppo lungo." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Rientra da /accedi." }, { status: 401 });

  // La RLS garantisce che il progetto sia dell'utente
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, data")
    .eq("id", body.projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Progetto non trovato." }, { status: 404 });

  // Il pattern che il producer sta ascoltando adesso: quello del browser, normalizzato.
  const current = normalize(body.project ?? project.data);
  const editing = isSlot(body.editing) ? body.editing : "A";
  const state = describe(current, body.title?.slice(0, 120) || project.title, editing);

  const { data: history } = await supabase
    .from("coach_messages")
    .select("role, content")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const past = trimHistory(((history ?? []) as Turn[]).reverse());

  // le misure vanno solo a Claude, non nella storia salvata: sono tante e cambiano a ogni export
  const misure = body.misure && typeof body.misure === "object" ? JSON.stringify(body.misure) : "";
  // con 256 battute le misure per battuta sono ~15.000 caratteri: il tetto è più alto, ma resta un tetto
  const listening = misure.length > 0 && misure.length < 24000 ? `\n\n[Misure dell'export]\n${misure}` : "";

  const { error: insertError } = await supabase
    .from("coach_messages")
    .insert({ project_id: project.id, role: "user", content: text });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return streamCoach({
    system: [{ text: COACH_CREA_SYSTEM, cache: true }],
    // lo stato del pattern va nell'ultimo messaggio: cambia a ogni modifica, la storia no
    messages: [...past, { role: "user", content: `${text}\n\n[Stato attuale del progetto]\n${state}${listening}` }],
    maxTokens: 6000,
    effort: "low",
    // il coach può scrivere il pattern nello studio; il browser lo applica e si può annullare
    tools: { definitions: STUDIO_TOOLS, ...createStudioWriter(current, editing) },
    save: (answer, meta) =>
      supabase.from("coach_messages").insert({ project_id: project.id, role: "assistant", content: answer, ...meta }),
  });
}
