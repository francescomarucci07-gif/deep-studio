// Export WAV: la stessa catena audio dello studio (graph.ts), suonata in un OfflineAudioContext.
// Offline il browser calcola l'audio più veloce del tempo reale e senza perdere colpi.
import { Graph } from "./graph";
import { STEPS, songLength, type Project, type Slot } from "./project";

export const SAMPLE_RATE = 44100;
const TAIL_S = 2.5; // coda dopo l'ultima battuta: riverbero e release degli accordi
const PATTERN_BARS = 4; // in modalità pattern esporto 4 giri del loop

export type RenderWhat = { song: true } | { song: false; slot: Slot };

export function renderPlan(p: Project, what: RenderWhat): (Slot | null)[] {
  return what.song ? p.song.slice(0, songLength(p)) : Array(PATTERN_BARS).fill(what.slot);
}

export async function renderAudio(p: Project, what: RenderWhat): Promise<AudioBuffer> {
  const bars = renderPlan(p, what);
  const stepDur = 60 / p.bpm / 4;
  const seconds = 0.05 + bars.length * STEPS * stepDur + TAIL_S;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  const graph = new Graph(ctx, () => p);
  graph.applyMixer(true);
  bars.forEach((slot, b) => {
    if (!slot) return;
    for (let s = 0; s < STEPS; s++) {
      const t = 0.05 + (b * STEPS + s) * stepDur + (s % 2 === 1 ? p.swing * stepDur : 0);
      graph.playStep(p.patterns[slot], s, t, stepDur);
    }
  });
  return ctx.startRendering();
}

// WAV PCM a 24 bit, stereo: il formato che FL Studio e l'analisi di Deep Studio leggono
export function encodeWav(buf: AudioBuffer): Blob {
  const channels = buf.numberOfChannels;
  const frames = buf.length;
  const bytes = 3;
  const dataSize = frames * channels * bytes;
  const out = new DataView(new ArrayBuffer(44 + dataSize));
  const text = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  out.setUint32(4, 36 + dataSize, true);
  text(8, "WAVE");
  text(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, channels, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * channels * bytes, true);
  out.setUint16(32, channels * bytes, true);
  out.setUint16(34, bytes * 8, true);
  text(36, "data");
  out.setUint32(40, dataSize, true);
  const data = Array.from({ length: channels }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      const n = Math.round(v < 0 ? v * 0x800000 : v * 0x7fffff);
      out.setUint8(o, n & 0xff);
      out.setUint8(o + 1, (n >> 8) & 0xff);
      out.setUint8(o + 2, (n >> 16) & 0xff);
      o += 3;
    }
  }
  return new Blob([out.buffer], { type: "audio/wav" });
}
