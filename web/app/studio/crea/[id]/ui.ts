// Costanti e piccole funzioni dello studio (Daw.tsx e le sue viste): viste, pad, canali, righe del Roll, scritte.
import { type KeyInstrument } from "@/lib/daw/keyboard";
import {
  BASS_HIGH,
  BASS_LOW,
  type ChannelId,
  type ChordType,
  DRUMS,
  type DrumId,
  LEAD_HIGH,
  LEAD_LOW,
} from "@/lib/daw/project";

export type SaveState = "salvato" | "modificato" | "salvo" | "errore";

// durata in minuti:secondi, per il titolo della canzone
export const clock = (seconds: number) => {
  const t = Math.round(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// Le viste della console sul computer (una alla volta, come le finestre di FL Studio).
// Icone disegnate con un solo tracciato SVG 24×24.
export const VIEWS = [
  { id: "beat", label: "Beat", icon: "M4 6h4v4H4zM10 6h4v4h-4zM16 6h4v4h-4zM4 14h4v4H4zM16 14h4v4h-4z" },
  { id: "roll", label: "Roll", icon: "M3 6h7M8 11h9M5 16h6M14 19h7" },
  { id: "song", label: "Song", icon: "M3 5h7v4H3zM12 5h9v4h-9zM6 11h9v4H6zM3 17h12v3H3z" },
  { id: "mixer", label: "Mixer", icon: "M6 3v18M12 3v18M18 3v18M4 14h4M10 8h4M16 16h4" },
  { id: "auto", label: "Auto", icon: "M3 18c4 0 4-12 9-12s5 8 9 8" },
] as const;
export type ViewId = (typeof VIEWS)[number]["id"];
export const isView = (v: unknown): v is ViewId => VIEWS.some((x) => x.id === v);

export function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage non disponibile: la scelta vale solo per questa visita
  }
}

// righe del piano roll, dall'alto in basso, per ogni strumento con le note
export const rows = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
// Le schermate con la tastiera: una per ogni strumento che si suona a note (come il piano roll di FL)
export const ROLLS = {
  bass: { label: "Bass", rows: rows(BASS_LOW, BASS_HIGH) },
  lead: { label: "Lead", rows: rows(LEAD_LOW, LEAD_HIGH) },
} as const;
export type RollId = keyof typeof ROLLS;
export type RollTab = KeyInstrument; // bass, lead o chords: è anche lo strumento della tastiera del computer
export const ROLL_TABS: { id: RollTab; label: string }[] = [
  { id: "bass", label: "Bass" },
  { id: "lead", label: "Lead" },
  { id: "chords", label: "Chord" },
];
export const CHORD_ROOTS = Array.from({ length: 12 }, (_, i) => 11 - i); // Si in alto, Do in basso
export const isSharp = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
export const pct = (v: number) => `${Math.round(v * 100)}%`;
// la forza di un tasto MIDI (1–127) nella velocity dello studio (0.1–1): un tasto premuto "normale" (~100) ≈ 80%
export const midiVel = (v: number) => Math.max(0.1, Math.min(1, v / 125));
export const two = (n: number) => String(n).padStart(2, "0");

// I pad: colore della retroilluminazione e tasto della tastiera del computer (come un controller)
export const PADS: { id: ChannelId; label: string; key: string; color: string }[] = [
  { id: "kick", label: "Kick", key: "z", color: "red" },
  { id: "clap", label: "Clap", key: "x", color: "orange" },
  { id: "hat", label: "Hi-hat", key: "c", color: "yellow" },
  { id: "openhat", label: "Open hat", key: "v", color: "yellow" },
  { id: "perc", label: "Perc", key: "b", color: "teal" },
  { id: "tom", label: "Tom", key: ".", color: "orange" },
  { id: "shaker", label: "Shaker", key: "-", color: "teal" },
  { id: "bass", label: "Bass", key: "n", color: "green" },
  { id: "chords", label: "Chord", key: "m", color: "purple" },
  { id: "lead", label: "Lead", key: ",", color: "blue" },
];
export const CHANNELS: { id: ChannelId; label: string }[] = [
  ...DRUMS,
  { id: "bass", label: "Bass" },
  { id: "chords", label: "Chords" },
  { id: "lead", label: "Lead" },
];
export const isDrum = (c: ChannelId): c is DrumId => c !== "bass" && c !== "chords" && c !== "lead";
export const TYPE_LABEL: Record<ChordType, string> = {
  min: "minore",
  maj: "maggiore",
  min7: "m7",
  maj7: "maj7",
  dom7: "7",
  min9: "m9",
  sus2: "sus2",
  sus4: "sus4",
};
