// Gli strumenti che il coach usa per scrivere nello studio: un pattern (A–D) e la canzone.
// Claude manda step da 1 a 16 e note MIDI; qui diventa un Project valido (normalize scarta il resto).
// Il coach può chiamarli più volte nella stessa risposta: ogni chiamata parte dal risultato della precedente.
import type Anthropic from "@anthropic-ai/sdk";
import {
  BASS_HIGH,
  BASS_LOW,
  BEATS,
  CHORD_TYPES,
  DRUMS,
  SLOTS,
  SONG_BARS,
  STEPS,
  isSlot,
  normalize,
  type Pattern,
  type Project,
  type Slot,
} from "./project";

const stepList = (label: string) => ({
  type: "array",
  description: `Step (1–16) in cui suona ${label}. Lista vuota = non suona.`,
  items: { type: "integer", minimum: 1, maximum: STEPS },
});

const PATTERN_TOOL: Anthropic.Beta.BetaTool = {
  name: "scrivi_pattern",
  description:
    "Scrive un pattern (una battuta da 16 step: batteria e bassline) in uno dei 4 slot A, B, C, D dello studio, sostituendo quello che c'era. Può anche cambiare BPM, swing, sidechain e suono del basso, che valgono per tutta la traccia. I volumi del mixer restano. Usalo quando il producer ti chiede di creare, generare o riscrivere un beat. Prima di chiamarlo spiega in poche frasi cosa costruisci e perché.",
  input_schema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Titolo breve di quello che scrivi, es. 'Trap half-time' o 'Drop'." },
      slot: { type: "string", enum: [...SLOTS], description: "Dove scriverlo. Se non lo dici, nel pattern che il producer sta modificando." },
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
      accordi: {
        type: "array",
        description:
          "Accordi del pattern, uno per battito (1–4). radice: 0 Do, 1 Do#, 2 Re, 3 Re#, 4 Mi, 5 Fa, 6 Fa#, 7 Sol, 8 Sol#, 9 La, 10 La#, 11 Si. Un battito senza accordo continua quello prima (pad). Lista vuota = niente accordi.",
        items: {
          type: "object",
          properties: {
            battito: { type: "integer", minimum: 1, maximum: BEATS },
            radice: { type: "integer", minimum: 0, maximum: 11 },
            tipo: { type: "string", enum: [...CHORD_TYPES] },
          },
          required: ["battito", "radice", "tipo"],
        },
      },
      stile_accordi: {
        type: "string",
        enum: ["pad", "stab"],
        description: "pad = tappeto lungo (deep house); stab = colpo corto sul battito (house, tech house).",
      },
      filtro_accordi: { type: "number", minimum: 300, maximum: 8000, description: "Cutoff degli accordi in Hz: basso = morbido." },
    },
    required: ["nome", "kick", "clap", "hat", "basso"],
  },
  eager_input_streaming: true,
};

const SONG_TOOL: Anthropic.Beta.BetaTool = {
  name: "scrivi_canzone",
  description: `Scrive l'arrangiamento: quale pattern (A, B, C, D) suona in ognuna delle ${SONG_BARS} battute della canzone, in ordine. "-" = battuta vuota (silenzio). Usalo quando il producer ti chiede una traccia intera, una struttura o un arrangiamento (intro, groove, break, drop), insieme a scrivi_pattern per i pattern che servono.`,
  input_schema: {
    type: "object",
    properties: {
      battute: {
        type: "array",
        description: `Fino a ${SONG_BARS} elementi, es. ["A","A","B","B","C","D","D","D"]. Le battute oltre l'ultima restano vuote.`,
        items: { type: "string", enum: [...SLOTS, "-"] },
        maxItems: SONG_BARS,
      },
      nome: { type: "string", description: "Nome breve della struttura, es. 'Intro, groove, break, drop'." },
    },
    required: ["battute"],
  },
  eager_input_streaming: true,
};

export const STUDIO_TOOLS = [PATTERN_TOOL, SONG_TOOL];

type PatternInput = Partial<Record<"kick" | "clap" | "hat" | "openhat" | "perc", unknown>> & {
  nome?: unknown;
  slot?: unknown;
  bpm?: unknown;
  swing?: unknown;
  sidechain?: unknown;
  basso?: unknown;
  onda?: unknown;
  filtro?: unknown;
  durata?: unknown;
  accordi?: unknown;
  stile_accordi?: unknown;
  filtro_accordi?: unknown;
};

const steps = (v: unknown) => {
  const on = Array(STEPS).fill(false);
  if (Array.isArray(v)) for (const s of v) if (Number.isInteger(s) && s >= 1 && s <= STEPS) on[s - 1] = true;
  return on;
};

const label = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : d);

// Un "registro" delle modifiche del coach: parte dal progetto attuale e applica ogni chiamata in ordine.
export function createStudioWriter(current: Project, editing: Slot) {
  let project = current;
  const names: string[] = [];
  let focus: Slot = editing; // il pattern da mostrare dopo: l'ultimo scritto
  let songWritten = false;

  function run(name: string, raw: unknown): string | null {
    const i = (raw && typeof raw === "object" ? raw : {}) as PatternInput & { battute?: unknown };
    if (name === "scrivi_pattern") {
      const slot: Slot = isSlot(i.slot) ? i.slot : editing;
      const bass: (number | null)[] = Array(STEPS).fill(null);
      if (Array.isArray(i.basso)) {
        for (const n of i.basso as { step?: unknown; nota?: unknown }[]) {
          if (Number.isInteger(n?.step) && Number.isInteger(n?.nota)) bass[(n.step as number) - 1] = n.nota as number;
        }
      }
      const chords: Pattern["chords"] = Array(BEATS).fill(null);
      if (Array.isArray(i.accordi)) {
        for (const c of i.accordi as { battito?: unknown; radice?: unknown; tipo?: unknown }[]) {
          if (Number.isInteger(c?.battito) && (c.battito as number) >= 1 && (c.battito as number) <= BEATS) {
            chords[(c.battito as number) - 1] = { root: c.radice, type: c.tipo } as Pattern["chords"][number];
          }
        }
      }
      const pattern: Pattern = {
        drums: Object.fromEntries(DRUMS.map(({ id }) => [id, steps(i[id])])) as Pattern["drums"],
        bass,
        chords, // normalize scarta radici e tipi non validi
      };
      project = normalize({
        ...project,
        bpm: i.bpm ?? project.bpm,
        swing: i.swing ?? project.swing,
        sidechain: typeof i.sidechain === "boolean" ? i.sidechain : project.sidechain,
        patterns: { ...project.patterns, [slot]: pattern },
        bassSound: {
          wave: i.onda ?? project.bassSound.wave,
          cutoff: i.filtro ?? project.bassSound.cutoff,
          length: i.durata ?? project.bassSound.length,
        },
        chordSound: {
          style: i.stile_accordi ?? project.chordSound.style,
          cutoff: i.filtro_accordi ?? project.chordSound.cutoff,
        },
      });
      focus = slot;
      const n = `${slot}: ${label(i.nome, "pattern")}`;
      names.push(n);
      return `Pattern ${n} scritto nello studio`;
    }
    if (name === "scrivi_canzone" && Array.isArray(i.battute)) {
      const song = Array.from({ length: SONG_BARS }, (_, k) => (isSlot(i.battute && (i.battute as unknown[])[k]) ? (i.battute as Slot[])[k] : null));
      project = normalize({ ...project, song });
      songWritten = true;
      names.push(label(i.nome, "arrangiamento"));
      return `Canzone scritta: ${song.map((s) => s ?? "-").join(" ")}`;
    }
    return null;
  }

  return {
    run,
    changed: () => names.length > 0,
    result: () => ({ project, name: names.join(" · "), focus, song: songWritten }),
  };
}
