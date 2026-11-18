// Export MIDI: un file .mid standard (tipo 1, una traccia per strumento) da trascinare in FL Studio.
// Un file MIDI è una lista di eventi nel tempo: "accendi la nota 60 con forza 100", "spegnila". Il tempo si conta in
// tick: qui 96 per quarto, quindi uno step (1/16) = 24 tick. La batteria va sul canale 10 con le note General MIDI.
// Lo swing non si scrive: in FL si rimette con lo swing del Channel rack.
import { CHORD_STYLES, STEPS, barOf, chordNotes, noteLen, soundOf, velOf, type Pattern, type Project, type Slot } from "./project";
import { KITS } from "./kits";

const PPQ = 96;
const STEP = PPQ / 4;

type Ev = { tick: number; data: number[] }; // data: i byte dell'evento (note on/off, program change)

// numero a lunghezza variabile: 7 bit per byte, il bit alto dice "continua"
function vlq(n: number) {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}

function track(name: string, events: Ev[], extra: number[] = []) {
  // a parità di tick prima gli "spegni" (0x80) poi gli "accendi": due note uguali di fila non si pestano i piedi
  const sorted = [...events].sort((a, b) => a.tick - b.tick || (a.data[0] & 0xf0) - (b.data[0] & 0xf0));
  const bytes: number[] = [];
  const nameBytes = [...new TextEncoder().encode(name)];
  bytes.push(0, 0xff, 0x03, ...vlq(nameBytes.length), ...nameBytes, ...extra);
  let last = 0;
  for (const e of sorted) {
    bytes.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  bytes.push(0, 0xff, 0x2f, 0); // fine traccia
  const len = bytes.length;
  return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...bytes];
}

const v127 = (v: number) => Math.max(1, Math.min(127, Math.round(v * 127)));

// quanti step mancano alla prossima nota della battuta (per le note "legate" e per l'808 long)
function toNext(line: (number | null)[], s: number) {
  const end = (Math.floor(s / STEPS) + 1) * STEPS; // dentro la battuta, come nello studio
  for (let k = s + 1; k < end; k++) if (line[k] !== null) return k - s;
  return end - s;
}

// la nota della batteria General MIDI; la perc dipende dal kit (conga, rim o cowbell)
const GM = { kick: 36, clap: 39, hat: 42, openhat: 46 } as const;
const GM_PERC = { conga: 63, rim: 37, cowbell: 56 } as const;

export function projectToMidi(p: Project, bars: (Slot | null)[]): Uint8Array<ArrayBuffer> {
  const ev = { bass: [] as Ev[], lead: [] as Ev[], chords: [] as Ev[], drums: [] as Ev[] };
  const note = (list: Ev[], ch: number, n: number, at: number, len: number, vel: number) => {
    list.push({ tick: at, data: [0x90 | ch, n, vel] });
    list.push({ tick: at + Math.max(1, len), data: [0x80 | ch, n, 0] });
  };
  bars.forEach((slot, b) => {
    if (!slot) return;
    const pat: Pattern = p.patterns[slot];
    const start = b * STEPS * STEP;
    const off = barOf(p, bars, b) * STEPS; // la battuta del pattern (pattern lunghi)
    const bs = soundOf(p, pat, "bass");
    const ls = soundOf(p, pat, "lead");
    const cs = soundOf(p, pat, "chords");
    const leadLine = pat.lead.map((n) => (n.length ? n[0] : null));
    for (let j = 0; j < STEPS; j++) {
      const s = off + j; // lo step dall'inizio del pattern
      const at = start + j * STEP;
      const bn = pat.bass[s];
      if (bn !== null) {
        const L = noteLen(pat, "bass", s, bn);
        const steps = L > 1 ? L : bs.length === "lunga" ? toNext(pat.bass, s) : 1;
        note(ev.bass, 0, bn, at, steps * STEP - 2, v127(velOf(pat, `b${s}`)));
      }
      for (const m of pat.lead[s]) {
        const L = noteLen(pat, "lead", s, m);
        const steps = L > 1 ? L : ls.length === "lunga" ? toNext(leadLine, s) : 1;
        note(ev.lead, 1, m, at, steps * STEP - 2, v127(velOf(pat, `l${s}`)));
      }
      const kit = KITS[p.kit] ?? KITS.house;
      for (const d of ["kick", "clap", "hat", "openhat", "perc"] as const) {
        if (!pat.drums[d][s]) continue;
        const n = d === "perc" ? GM_PERC[kit.perc] : GM[d];
        note(ev.drums, 9, n, at, STEP / 2, v127(velOf(pat, `${d}${s}`)));
      }
      if (s % 4 === 0 && pat.chords[s / 4].length) {
        const beat = s / 4;
        const end = (Math.floor(beat / 4) + 1) * 4; // fine della battuta
        let next = end;
        for (let k = beat + 1; k < end; k++) if (pat.chords[k].length) { next = k; break; }
        const steps = CHORD_STYLES[cs.style].hold ? (next - beat) * 4 : 2;
        const notes = [...new Set(pat.chords[beat].flatMap(chordNotes))];
        for (const n of notes) note(ev.chords, 2, n, at, steps * STEP - 2, v127(velOf(pat, `c${beat}`)));
      }
    }
  });
  // traccia 0: tempo (microsecondi per quarto) e tempo in chiave 4/4
  const us = Math.round(60_000_000 / p.bpm);
  const conductor = [0, 0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff, 0, 0xff, 0x58, 4, 4, 2, 24, 8];
  const program = (ch: number, n: number) => [0, 0xc0 | ch, n]; // il suono General MIDI di partenza
  const tracks = [
    track("Deep Studio", [], conductor),
    track("Bass", ev.bass, program(0, 38)), // Synth Bass 1
    track("Lead", ev.lead, program(1, 81)), // Lead 2 (sawtooth)
    track("Chords", ev.chords, program(2, 89)), // Pad 2 (warm)
    track("Drums", ev.drums),
  ];
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 0xff, PPQ & 0xff];
  return new Uint8Array([...head, ...tracks.flat()]);
}
