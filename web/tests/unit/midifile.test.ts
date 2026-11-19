// L'export MIDI: un file .mid standard che FL Studio legge.
import { describe, expect, it } from "vitest";
import { projectToMidi } from "@/lib/daw/midifile";
import { normalize, starterProject } from "@/lib/daw/project";

// legge le tracce e le note accese (nota, forza, canale, tick)
function parse(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));
  expect(text(0)).toBe("MThd");
  const tracks = dv.getUint16(10);
  const ppq = dv.getUint16(12);
  let pos = 14;
  const out: { name: string; on: { tick: number; note: number; vel: number; ch: number }[]; tempo?: number }[] = [];
  for (let t = 0; t < tracks; t++) {
    expect(text(pos)).toBe("MTrk");
    const len = dv.getUint32(pos + 4);
    let i = pos + 8;
    const end = i + len;
    let tick = 0;
    const tr: (typeof out)[number] = { name: "", on: [] };
    const vlq = () => {
      let n = 0;
      for (;;) {
        const c = bytes[i++];
        n = (n << 7) | (c & 0x7f);
        if (c < 0x80) return n;
      }
    };
    while (i < end) {
      tick += vlq();
      const st = bytes[i++];
      if (st === 0xff) {
        const type = bytes[i++];
        const l = vlq();
        if (type === 0x03) tr.name = new TextDecoder().decode(bytes.slice(i, i + l));
        if (type === 0x51) tr.tempo = Math.round(60_000_000 / ((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]));
        i += l;
      } else if ((st & 0xf0) === 0x90 || (st & 0xf0) === 0x80) {
        const note = bytes[i++], vel = bytes[i++];
        if ((st & 0xf0) === 0x90 && vel > 0) tr.on.push({ tick, note, vel, ch: st & 0x0f });
      } else i += 1; // program change
    }
    out.push(tr);
    pos = end;
  }
  return { ppq, tracks: out };
}

describe("projectToMidi", () => {
  it("tom e shaker: note General MIDI 47 e 70 sul canale 10", () => {
    const p = normalize({ version: 2, patterns: { A: { drums: { tom: [true], shaker: [false, true] } } } });
    const drums = parse(projectToMidi(p, ["A"])).tracks[4].on;
    expect(drums.map((d) => [d.tick, d.note, d.ch])).toEqual([
      [0, 47, 9],
      [24, 70, 9],
    ]);
  });

  it("tipo 1, 96 tick per quarto, tempo, una traccia per strumento", () => {
    const p = { ...starterProject(), bpm: 120 };
    const { ppq, tracks } = parse(projectToMidi(p, ["A"]));
    expect(ppq).toBe(96);
    expect(tracks.map((t) => t.name)).toEqual(["Deep Studio", "Bass", "Lead", "Chords", "Drums"]);
    expect(tracks[0].tempo).toBe(120);
  });

  it("la batteria va sul canale 10 con le note General MIDI e la velocity", () => {
    const p = normalize({ version: 2, patterns: { A: { drums: { kick: [true], hat: [false, false, true] }, vel: { hat2: 0.4 } } } });
    const drums = parse(projectToMidi(p, ["A"])).tracks[4].on;
    expect(drums).toEqual([
      { tick: 0, note: 36, vel: 102, ch: 9 },
      { tick: 48, note: 42, vel: 51, ch: 9 },
    ]);
  });

  it("un pattern lungo suona le sue battute una dopo l'altra", () => {
    const kick = Array(32).fill(false);
    kick[0] = true; // battuta 1
    kick[20] = true; // battuta 2, step 5
    const p = normalize({ version: 2, patterns: { A: { bars: 2, drums: { kick } } } });
    const ticks = parse(projectToMidi(p, ["A", "A"])).tracks[4].on.map((n) => n.tick);
    expect(ticks).toEqual([0, 16 * 24 + 4 * 24]);
  });
});
