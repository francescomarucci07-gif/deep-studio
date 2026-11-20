// La tonalità del progetto: una fondamentale (0 = Do … 11 = Si) e un modo. Serve al Roll (note della scala illuminate,
// "Piega" che nasconde le altre) e al coach, che scrive melodie e accordi dentro la scala.
// Teoria in breve: una scala è una scelta di 7 note su 12; le melodie che restano lì "suonano giuste" insieme.
import { chordNotes, type Chord, type ChordType, type Project } from "./project";

export const MODES = {
  minore: { label: "minore", hint: "la più usata nella house: scura, malinconica", steps: [0, 2, 3, 5, 7, 8, 10] },
  maggiore: { label: "maggiore", hint: "luminosa, solare (house classica, piano house)", steps: [0, 2, 4, 5, 7, 9, 11] },
  dorico: { label: "dorica", hint: "minore con un raggio di luce: la scala della deep house", steps: [0, 2, 3, 5, 7, 9, 10] },
  frigio: { label: "frigia", hint: "minore ancora più scura e tesa (tech house, techno)", steps: [0, 1, 3, 5, 7, 8, 10] },
} as const;
export type Mode = keyof typeof MODES;
export const MODE_IDS = Object.keys(MODES) as Mode[];
export type Key = { root: number; mode: Mode };

export const isMode = (v: unknown): v is Mode => typeof v === "string" && v in MODES;

// la tonalità salvata nel progetto (manca = nessuna)
export function normKey(raw: unknown): Key | undefined {
  const k = raw as Partial<Key> | null;
  if (!k || !Number.isInteger(k.root) || (k.root as number) < 0 || (k.root as number) > 11 || !isMode(k.mode)) return undefined;
  return { root: k.root as number, mode: k.mode };
}

export const inScale = (key: Key, midi: number) => (MODES[key.mode].steps as readonly number[]).includes((((midi - key.root) % 12) + 12) % 12);

const NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
export const keyName = (k: Key) => `${NAMES[k.root]} ${MODES[k.mode].label}`;

// L'accordo "della scala" che parte da una nota: impilo terze dentro la scala (1-3-5-7) e guardo che intervalli escono.
// Esempio in La minore: da La esce La m7, da Do esce Do maj7, da Mi esce Mi m7.
export function diatonicChord(key: Key, root: number): ChordType | null {
  const steps = MODES[key.mode].steps as readonly number[];
  const deg = steps.indexOf((((root - key.root) % 12) + 12) % 12);
  if (deg < 0) return null;
  const at = (n: number) => (steps[(deg + n) % 7] - steps[deg] + 12) % 12;
  const [third, fifth, seventh] = [at(2), at(4), at(6)];
  if (third === 3 && fifth === 7) return seventh === 10 ? "min7" : "min";
  if (third === 4 && fifth === 7) return seventh === 11 ? "maj7" : seventh === 10 ? "dom7" : "maj";
  return null; // diminuito: nello studio non c'è, meglio non proporlo
}

// Trova la tonalità più probabile dalle note che ci sono (basso, lead, note degli accordi): per ogni tonalità conto quante note
// stanno dentro la scala (le note del basso valgono doppio, e una fondamentale che coincide con le note più usate
// aiuta). A parità vince il minore: nella house è il caso più comune.
export function guessKey(p: Project): Key | null {
  const count = new Array(12).fill(0);
  const add = (n: number, w = 1) => (count[((n % 12) + 12) % 12] += w);
  for (const pat of Object.values(p.patterns)) {
    for (const n of pat.bass) if (n !== null) add(n, 2);
    for (const r of [pat.lead, pat.lead2]) for (const step of r) for (const n of step) add(n);
    // gli accordi: tutte le loro note, e la fondamentale un po' di più
    for (const beat of pat.chords)
      for (const c of beat as Chord[]) {
        for (const n of chordNotes(c)) add(n);
        add(c.root);
      }
  }
  const total = count.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  let best: { key: Key; score: number } | null = null;
  for (const mode of ["minore", "maggiore", "dorico", "frigio"] as Mode[]) {
    for (let root = 0; root < 12; root++) {
      const key = { root, mode };
      let score = 0;
      for (let pc = 0; pc < 12; pc++) score += inScale(key, pc) ? count[pc] : -2 * count[pc];
      score += count[root] * 0.5; // la tonica suona spesso
      if (mode !== "minore") score -= 0.25; // a parità, minore
      if (!best || score > best.score) best = { key, score };
    }
  }
  return best?.key ?? null;
}
