// Lo strumento che il coach usa per scrivere un pattern nello studio ("creami un beat trap").
// Claude manda step da 1 a 16 e note MIDI; qui diventa un Project valido (normalize scarta il resto).
import { BASS_HIGH, BASS_LOW, DRUMS, STEPS, normalize, type Project } from "./project";

const stepList = (label: string) => ({
  type: "array",
  description: `Step (1–16) in cui suona ${label}. Lista vuota = non suona.`,
  items: { type: "integer", minimum: 1, maximum: STEPS },
});

export const PATTERN_TOOL = {
  name: "scrivi_pattern",
  description:
    "Scrive un pattern completo nello studio del producer (sostituisce batteria, bassline, BPM, swing e suono del basso; i volumi del mixer restano). Usalo quando il producer ti chiede di creare, generare o riscrivere un beat o una bassline. Prima di chiamarlo spiega in poche frasi cosa costruisci e perché.",
  input_schema: {
    type: "object" as const,
    properties: {
      nome: { type: "string", description: "Titolo breve del pattern, es. 'Trap half-time'." },
      bpm: { type: "number", minimum: 60, maximum: 200 },
      swing: { type: "number", minimum: 0, maximum: 0.5, description: "0 = dritto, 0.1–0.2 = groove house." },
      sidechain: { type: "boolean", description: "Il kick abbassa il basso." },
      kick: stepList("il kick"),
      clap: stepList("il clap (o snare)"),
      hat: stepList("l'hi-hat chiuso"),
      openhat: stepList("l'open hat"),
      perc: stepList("la perc"),
      basso: {
        type: "array",
        description: `Note della bassline: una per step. MIDI da ${BASS_LOW} (La1) a ${BASS_HIGH} (La2): 33 La, 34 La#, 35 Si, 36 Do, 37 Do#, 38 Re, 39 Re#, 40 Mi, 41 Fa, 42 Fa#, 43 Sol, 44 Sol#, 45 La.`,
        items: {
          type: "object",
          properties: {
            step: { type: "integer", minimum: 1, maximum: STEPS },
            nota: { type: "integer", minimum: BASS_LOW, maximum: BASS_HIGH },
          },
          required: ["step", "nota"],
        },
      },
      onda: { type: "string", enum: ["sawtooth", "square"], description: "Timbro del basso." },
      filtro: { type: "number", minimum: 150, maximum: 4000, description: "Cutoff del basso in Hz: basso = scuro e caldo." },
      durata: {
        type: "string",
        enum: ["corta", "lunga"],
        description: "corta = note staccate (house); lunga = ogni nota tiene fino alla successiva, come un 808 (trap).",
      },
    },
    required: ["nome", "bpm", "kick", "clap", "hat", "basso"],
  },
  eager_input_streaming: true,
};

type Input = Partial<Record<"kick" | "clap" | "hat" | "openhat" | "perc", unknown>> & {
  nome?: unknown;
  bpm?: unknown;
  swing?: unknown;
  sidechain?: unknown;
  basso?: unknown;
  onda?: unknown;
  filtro?: unknown;
  durata?: unknown;
};

const steps = (v: unknown) => {
  const on = Array(STEPS).fill(false);
  if (Array.isArray(v)) for (const s of v) if (Number.isInteger(s) && s >= 1 && s <= STEPS) on[s - 1] = true;
  return on;
};

// Dal tool al progetto: tiene i volumi attuali, tutto il resto viene dal coach (e passa da normalize).
export function patternFromTool(raw: unknown, current: Project): { project: Project; name: string } {
  const i = (raw && typeof raw === "object" ? raw : {}) as Input;
  const bass: (number | null)[] = Array(STEPS).fill(null);
  if (Array.isArray(i.basso)) {
    for (const n of i.basso as { step?: unknown; nota?: unknown }[]) {
      if (Number.isInteger(n?.step) && Number.isInteger(n?.nota)) bass[(n.step as number) - 1] = n.nota as number;
    }
  }
  const project = normalize({
    bpm: i.bpm ?? current.bpm,
    swing: i.swing ?? current.swing,
    sidechain: typeof i.sidechain === "boolean" ? i.sidechain : current.sidechain,
    drums: Object.fromEntries(DRUMS.map(({ id }) => [id, steps(i[id])])),
    bass,
    bassSound: {
      wave: i.onda ?? current.bassSound.wave,
      cutoff: i.filtro ?? current.bassSound.cutoff,
      length: i.durata ?? current.bassSound.length,
    },
    mixer: current.mixer,
  });
  const name = typeof i.nome === "string" && i.nome.trim() ? i.nome.trim().slice(0, 60) : "Pattern del coach";
  return { project, name };
}
