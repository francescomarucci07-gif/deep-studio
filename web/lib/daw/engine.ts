// Il motore in tempo reale dello studio: Web Audio API del browser, niente librerie.
// Come un sequencer hardware: un orologio guarda 100 ms avanti e programma i colpi con precisione
// sul tempo dell'AudioContext (setInterval da solo "balla", il clock audio no).
// I suoni stanno in graph.ts, condivisi con l'export WAV.
import { Graph } from "./graph";
import { STEPS, songLength, type ChannelId, type Chord, type Project, type Slot } from "./project";

const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;

// Cosa suona: in modalità pattern il pattern che stai modificando, in modalità song la canzone
export type Playback = { song: boolean; editing: Slot };

export class Engine {
  private ctx: AudioContext;
  private graph: Graph;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private bar = 0;
  private nextTime = 0;

  constructor(
    private getProject: () => Project,
    private getPlayback: () => Playback,
    private onStep: (step: number, bar: number, slot: Slot | null) => void,
  ) {
    this.ctx = new AudioContext();
    this.graph = new Graph(this.ctx, getProject);
  }

  get playing() {
    return this.timer !== null;
  }

  async start() {
    await this.ctx.resume();
    this.step = 0;
    this.bar = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onStep(-1, -1, null);
  }

  close() {
    this.stop();
    void this.ctx.close();
  }

  applyMixer() {
    this.graph.applyMixer();
  }

  async preview(id: ChannelId, opts: { note?: number; chord?: Chord } = {}) {
    await this.ctx.resume();
    this.graph.preview(id, this.ctx.currentTime + 0.01, opts);
  }

  private tick() {
    const p = this.getProject();
    const { song, editing } = this.getPlayback();
    const stepDur = 60 / p.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD_S) {
      const s = this.step;
      const bar = song ? this.bar % songLength(p) : 0;
      const slot = song ? p.song[bar] : editing;
      // swing: gli step in levare (2, 4, 6… contando da 1) arrivano un po' dopo
      const t = this.nextTime + (s % 2 === 1 ? p.swing * stepDur : 0);
      if (slot) this.graph.playStep(p.patterns[slot], s, t, stepDur);
      const delay = Math.max(0, (t - this.ctx.currentTime) * 1000);
      setTimeout(() => this.timer && this.onStep(s, bar, slot), delay);
      this.nextTime += stepDur;
      this.step = (s + 1) % STEPS;
      if (this.step === 0) this.bar = (bar + 1) % songLength(p);
    }
  }
}
