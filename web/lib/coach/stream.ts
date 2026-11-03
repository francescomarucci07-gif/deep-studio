import Anthropic from "@anthropic-ai/sdk";
import { costUsd } from "./pricing";
import { DATA_MARK } from "./text";

// Sonnet 5.5 come da documento P6; si cambia con la variabile COACH_MODEL su Vercel.
export const MODEL = process.env.COACH_MODEL || "claude-sonnet-5-5";

export type Turn = { role: "user" | "assistant"; content: string };
type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};
export type Saved = { model: string; tokens_in: number; tokens_out: number; cost_usd: number | null };


// Uno strumento che il coach può chiamare: run() valida l'input e dice cosa mandare al browser.
export type CoachTool = {
  definition: Anthropic.Beta.BetaTool;
  run: (input: unknown) => { data: unknown; note: string };
};

// La conversazione deve iniziare dall'utente: tolgo le risposte rimaste in testa alla storia.
export function trimHistory(rows: Turn[]) {
  const past = [...rows];
  while (past.length && past[0].role !== "user") past.shift();
  return past;
}

// Chiama Claude in streaming e restituisce il testo man mano che arriva; alla fine salva risposta e costi.
export function streamCoach(opts: {
  system: { text: string; cache?: boolean }[];
  messages: Turn[];
  maxTokens: number;
  effort: "low" | "medium";
  save: (answer: string, meta: Saved) => PromiseLike<unknown>;
  tool?: CoachTool;
}) {
  const client = new Anthropic();
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      try {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: opts.maxTokens,
          output_config: { effort: opts.effort },
          // se i filtri di sicurezza rifiutano per errore, l'API riprova da sola con un altro modello
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: opts.system.map((b) => ({
            type: "text" as const,
            text: b.text,
            ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
          })),
          messages: opts.messages,
          ...(opts.tool ? { tools: [opts.tool.definition] } : {}),
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            answer += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\nSu questo non posso aiutarti. Torniamo alla traccia?";
          answer += note;
          controller.enqueue(encoder.encode(note));
        }
        // input troncato (max_tokens) = pattern incompleto: meglio non applicarlo
        const call = final.content.find((b) => b.type === "tool_use");
        if (opts.tool && call?.type === "tool_use" && final.stop_reason !== "max_tokens") {
          const { data, note } = opts.tool.run(call.input);
          // la nota resta nella storia, così il coach sa cosa ha già scritto nello studio
          answer += `${answer ? "\n\n" : ""}[${note}]`;
          controller.enqueue(encoder.encode(DATA_MARK + JSON.stringify(data)));
        }
        if (answer.trim()) {
          const u = final.usage as Usage;
          await opts.save(answer.slice(0, 20000), {
            model: final.model,
            tokens_in: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
            tokens_out: u.output_tokens,
            cost_usd: costUsd(MODEL, u),
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
