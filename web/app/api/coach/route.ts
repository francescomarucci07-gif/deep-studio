import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { buildContext } from "@/lib/coach/context";
import { costUsd } from "@/lib/coach/pricing";
import { COACH_SYSTEM } from "@/lib/coach/prompt";
import { STAGES, SUBGENRES, labelOf } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";

// Il coach gira solo sul server: la chiave Anthropic non arriva mai al browser.
export const runtime = "nodejs";
export const maxDuration = 60;

// Sonnet 5.5 come da documento P6; si cambia con la variabile COACH_MODEL su Vercel.
const MODEL = process.env.COACH_MODEL || "claude-sonnet-5-5";
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
  const past = (history ?? []).reverse() as { role: "user" | "assistant"; content: string }[];
  while (past.length && past[0].role !== "user") past.shift(); // la conversazione deve iniziare dall'utente

  const { error: insertError } = await supabase
    .from("coach_messages")
    .insert({ version_id: version.id, role: "user", content: text });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      try {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 8000,
          output_config: { effort: "medium" },
          // se i filtri di sicurezza rifiutano per errore, l'API riprova da sola con un altro modello
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: [
            { type: "text", text: COACH_SYSTEM },
            // il contesto della traccia cambia solo con una nuova analisi: in cache insieme alle istruzioni
            { type: "text", text: context, cache_control: { type: "ephemeral" } },
          ],
          messages: [...past, { role: "user", content: text }],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            answer += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\n(Non posso rispondere a questa richiesta. Proviamo a parlare della traccia?)";
          answer += note;
          controller.enqueue(encoder.encode(note));
        }
        if (answer.trim()) {
          await supabase.from("coach_messages").insert({
            version_id: version.id,
            role: "assistant",
            content: answer.slice(0, 20000),
            model: final.model,
            tokens_in:
              final.usage.input_tokens +
              (final.usage.cache_read_input_tokens ?? 0) +
              (final.usage.cache_creation_input_tokens ?? 0),
            tokens_out: final.usage.output_tokens,
            cost_usd: costUsd(MODEL, final.usage),
          });
        }
      } catch (e) {
        let msg = "Il coach non risponde in questo momento. Riprova tra poco.";
        if (e instanceof Anthropic.RateLimitError) msg = "Troppe richieste al coach: riprova tra un minuto.";
        else if (e instanceof Anthropic.AuthenticationError) msg = "La chiave del coach non è valida: controllala su Vercel.";
        else if (e instanceof Anthropic.APIError) console.error("coach", e.status, e.message);
        else console.error("coach", e);
        controller.enqueue(encoder.encode(`${answer ? "\n\n" : ""}${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
