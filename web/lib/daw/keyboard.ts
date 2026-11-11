// La tastiera del computer come tastiera musicale, come la "typing keyboard" di FL Studio.
// Uso la posizione fisica dei tasti (KeyboardEvent.code), non la lettera: così funziona uguale con la
// tastiera italiana, inglese o tedesca.
//
//   fila bassa:   S D   G H J   L          (tasti neri)
//                Z X C V B N M , .         Do Re Mi Fa Sol La Si Do Re
//   fila alta:    2 3   5 6 7   9 0        (tasti neri, un'ottava sopra)
//                Q W E R T Y U I O P       Do Re Mi Fa Sol La Si Do Re Mi
import { BASS_HIGH, BASS_LOW, LEAD_HIGH, LEAD_LOW } from "./project";

// semitoni sopra il Do dell'ottava scelta
export const KEY_NOTES: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21,
  Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
};

export type KeyInstrument = "bass" | "lead" | "chords";

// l'ottava di partenza (Do della fila bassa) e quelle che si possono scegliere, per strumento
export const OCTAVES: Record<"bass" | "lead", { start: number; min: number; max: number; low: number; high: number }> = {
  bass: { start: 2, min: 1, max: 2, low: BASS_LOW, high: BASS_HIGH },
  lead: { start: 4, min: 4, max: 5, low: LEAD_LOW, high: LEAD_HIGH },
};

// una nota fuori dalla gamma dello strumento si sposta di ottava finché ci rientra:
// quello che senti è quello che viene scritto nel pattern
export function fold(note: number, low: number, high: number) {
  let n = note;
  while (n < low) n += 12;
  while (n > high) n -= 12;
  return n;
}

// La nota MIDI per un tasto (null se il tasto non è una nota). Do4 = 60, quindi ottava 4 → 60.
export function keyNote(code: string, inst: "bass" | "lead", octave: number): number | null {
  const offset = KEY_NOTES[code];
  if (offset === undefined) return null;
  const r = OCTAVES[inst];
  return fold(12 * (octave + 1) + offset, r.low, r.high);
}

// Su Chord il tasto sceglie la fondamentale (0 = Do … 11 = Si)
export function keyRoot(code: string): number | null {
  const offset = KEY_NOTES[code];
  return offset === undefined ? null : offset % 12;
}
