// I progetti modello: da dove parte "Nuovo progetto". Ognuno è un piccolo progetto già pronto per un genere (tempo,
// swing, kit, scala, suoni, un groove e un break messi in una canzone breve), da ascoltare e poi cambiare.
// Come i template di FL: non sono "la traccia", sono un punto di partenza che insegna come è fatto il genere.
import { normalize, starterProject, STEPS, type Chord, type DrumId, type Project } from "./project";

type Hits = Partial<Record<DrumId, number[]>>;
type PatInput = {
  bars?: 1 | 2;
  drums?: Hits;
  bass?: Record<number, number>;
  chords?: Record<number, Chord[]>; // battito → accordi
  lead?: Record<number, number[]>;
  lead2?: Record<number, number[]>;
  len?: Record<string, number>;
  vel?: Record<string, number>;
};

// un pattern dai soli step "accesi": tutto il resto vuoto
function pat(i: PatInput) {
  const n = STEPS * (i.bars ?? 1);
  const row = (at: number[] = []) => Array.from({ length: n }, (_, k) => at.includes(k));
  const all = Array.from({ length: n }, (_, k) => k);
  return {
    ...(i.bars && i.bars > 1 ? { bars: i.bars } : {}),
    drums: Object.fromEntries((["kick", "clap", "hat", "openhat", "perc", "tom", "shaker"] as DrumId[]).map((d) => [d, row(i.drums?.[d])])),
    bass: all.map((k) => i.bass?.[k] ?? null),
    chords: Array.from({ length: (n / STEPS) * 4 }, (_, b) => i.chords?.[b] ?? []),
    lead: all.map((k) => i.lead?.[k] ?? []),
    lead2: all.map((k) => i.lead2?.[k] ?? []),
    ...(i.len ? { len: i.len } : {}),
    ...(i.vel ? { vel: i.vel } : {}),
  };
}
const every = (from: number, step: number, n = STEPS) => Array.from({ length: Math.ceil((n - from) / step) }, (_, k) => from + k * step);
const velAll = (d: string, steps: number[], v: number) => Object.fromEntries(steps.map((s) => [`${d}${s}`, v]));
const ch = (root: number, type: Chord["type"]): Chord[] => [{ root, type }];
// un arpeggio: per ogni battito (4 step) le note di un accordo in giro, una ogni 1/16; chords = un giro per ogni 2 battiti
function arp(chords: number[][], n: number): Record<number, number[]> {
  return Object.fromEntries(Array.from({ length: n }, (_, s) => [s, [chords[Math.floor(s / 8) % chords.length][s % 4]]]));
}
// Re m7, Si♭ maj7, Fa maj7, Do 7: le loro note in alto (da Si♭4 a La5), per il pluck del progressive
const PROG_ARP = [
  [74, 77, 81, 77],
  [70, 74, 77, 74],
  [72, 77, 81, 77],
  [72, 76, 79, 76],
];
const song = (...parts: [string, number][]) => parts.flatMap(([s, n]) => Array(n).fill(s));

export const TEMPLATES = {
  vuoto: {
    label: "Vuoto",
    hint: "nessuna nota: parti da zero",
    make: (): Project => normalize({ version: 2, bpm: 122, swing: 0.1, patterns: {}, song: [] }),
  },
  house: {
    label: "House",
    hint: "122 BPM, il groove classico: kick in 4, clap, hat in levare, basso e un accordo",
    make: (): Project => {
      const p = starterProject();
      // B = il break: lo stesso groove senza kick e senza basso, per l'intro e prima dell'ultimo drop
      const A = p.patterns.A;
      const B = { ...structuredClone(A), drums: { ...structuredClone(A.drums), kick: A.drums.kick.map(() => false) }, bass: A.bass.map(() => null) };
      return normalize({ ...p, key: { root: 9, mode: "minore" }, patterns: { ...p.patterns, B }, song: song(["B", 4], ["A", 8], ["B", 2], ["A", 2]) });
    },
  },
  deep: {
    label: "Deep house",
    hint: "120 BPM, Re dorico: swing morbido, accordi pad caldi, basso in levare, shaker e conga",
    make: (): Project =>
      normalize({
        ...starterProject(),
        bpm: 120,
        swing: 0.16,
        kit: "deep",
        key: { root: 2, mode: "dorico" },
        bassSound: { wave: "sub", cutoff: 600, length: "corta" },
        chordSound: { style: "pad", cutoff: 1300 },
        lead2Sound: { wave: "epiano", cutoff: 2400, length: "corta" },
        patterns: {
          A: pat({
            drums: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], perc: [7, 13], shaker: every(1, 2) },
            bass: { 3: 38, 7: 38, 10: 41, 14: 36 },
            len: { b7: 2 },
            chords: { 0: ch(2, "min9"), 2: ch(7, "dom7") },
            lead2: { 0: [74], 6: [77], 10: [71] },
            vel: { ...velAll("shaker", every(1, 2), 0.45), hat2: 0.6, hat10: 0.6, perc13: 0.5 },
          }),
          B: pat({
            drums: { hat: [2, 6, 10, 14], shaker: every(1, 2) },
            chords: { 0: ch(2, "min9"), 2: ch(7, "dom7") },
            vel: velAll("shaker", every(1, 2), 0.4),
          }),
        },
        song: song(["B", 4], ["A", 8], ["B", 2], ["A", 2]),
      }),
  },
  tech: {
    label: "Tech house",
    hint: "126 BPM, Fa minore: kick secco 909, hat fitti, open hat in levare, basso corto che rotola, stab",
    make: (): Project =>
      normalize({
        ...starterProject(),
        bpm: 126,
        swing: 0.05,
        kit: "909",
        key: { root: 5, mode: "minore" },
        bassSound: { wave: "acid", cutoff: 520, length: "corta" },
        chordSound: { style: "stab", cutoff: 2200 },
        patterns: {
          A: pat({
            drums: { kick: [0, 4, 8, 12], clap: [4, 12], hat: every(0, 1), openhat: [2, 6, 10, 14], perc: [3, 11, 14] },
            bass: { 1: 41, 3: 41, 6: 44, 9: 41, 11: 41, 14: 39 },
            chords: { 1: ch(5, "min7") },
            vel: { ...velAll("hat", every(0, 1), 0.4), ...velAll("hat", [2, 6, 10, 14], 0.7), perc14: 0.5 },
          }),
          B: pat({
            drums: { hat: every(0, 1), openhat: [2, 6, 10, 14], perc: [3, 11] },
            bass: { 1: 41, 3: 41, 6: 44, 9: 41, 11: 41, 14: 39 },
            vel: velAll("hat", every(0, 1), 0.4),
          }),
        },
        song: song(["B", 4], ["A", 8], ["B", 2], ["A", 2]),
      }),
  },
  progressive: {
    label: "Progressive",
    hint: "124 BPM, Re minore: giro di accordi su due battute, arpeggio pluck, basso dritto, build lungo",
    make: (): Project =>
      normalize({
        ...starterProject(),
        bpm: 124,
        swing: 0,
        kit: "house",
        key: { root: 2, mode: "minore" },
        bassSound: { wave: "sawtooth", cutoff: 650, length: "corta" },
        chordSound: { style: "strings", cutoff: 1800 },
        lead2Sound: { wave: "pluck", cutoff: 3600, length: "corta" },
        patterns: {
          A: pat({
            bars: 2,
            drums: { kick: every(0, 4, 32), clap: [4, 12, 20, 28], hat: every(2, 4, 32) },
            // il basso in levare sulla fondamentale dell'accordo: Re, Si bemolle, Fa, Do
            bass: { 2: 38, 6: 38, 10: 34, 14: 34, 18: 41, 22: 41, 26: 36, 30: 36 },
            chords: { 0: ch(2, "min7"), 2: ch(10, "maj7"), 4: ch(5, "maj7"), 6: ch(0, "dom7") },
            // l'arpeggio: le note dell'accordo, una ogni 1/16
            lead2: arp(PROG_ARP, 32),
            vel: { ...velAll("m", every(1, 2, 32), 0.55), ...velAll("hat", every(2, 4, 32), 0.7) },
          }),
          B: pat({
            bars: 2,
            chords: { 0: ch(2, "min7"), 2: ch(10, "maj7"), 4: ch(5, "maj7"), 6: ch(0, "dom7") },
            lead2: arp(PROG_ARP, 32),
            vel: velAll("m", every(0, 1, 32), 0.5),
          }),
        },
        song: song(["B", 4], ["A", 8], ["B", 2], ["A", 2]),
      }),
  },
  afro: {
    label: "Afro house",
    hint: "122 BPM, La minore: percussioni che girano (conga, tom, shaker), basso sincopato, pluck",
    make: (): Project =>
      normalize({
        ...starterProject(),
        bpm: 122,
        swing: 0.12,
        kit: "deep",
        key: { root: 9, mode: "minore" },
        bassSound: { wave: "sub", cutoff: 700, length: "corta" },
        chordSound: { style: "pad", cutoff: 1500 },
        lead2Sound: { wave: "pluck", cutoff: 3000, length: "corta" },
        patterns: {
          A: pat({
            drums: { kick: [0, 4, 8, 12], clap: [12], hat: [2, 6, 10, 14], perc: [3, 6, 10, 11, 14], tom: [7, 15], shaker: every(0, 1) },
            bass: { 3: 33, 6: 36, 10: 33, 13: 40 },
            chords: { 0: ch(9, "min7") },
            lead2: { 0: [76], 3: [74], 6: [72], 10: [69] },
            vel: { ...velAll("shaker", every(0, 1), 0.35), ...velAll("shaker", [2, 6, 10, 14], 0.6), perc11: 0.5, tom15: 0.6 },
          }),
          B: pat({
            drums: { perc: [3, 6, 10, 11, 14], tom: [7, 15], shaker: every(0, 1) },
            chords: { 0: ch(9, "min7") },
            lead2: { 0: [76], 3: [74], 6: [72], 10: [69] },
            vel: velAll("shaker", every(0, 1), 0.35),
          }),
        },
        song: song(["B", 4], ["A", 8], ["B", 2], ["A", 2]),
      }),
  },
} as const;

export type TemplateId = keyof typeof TEMPLATES;
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];
export const isTemplate = (v: unknown): v is TemplateId => typeof v === "string" && v in TEMPLATES;
