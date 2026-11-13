// Il motore in tempo reale dello studio: Web Audio API del browser, niente librerie.
// Come un sequencer hardware: un orologio guarda 100 ms avanti e programma i colpi con precisione
// sul tempo dell'AudioContext (setInterval da solo "balla", il clock audio no).
// I suoni stanno in graph.ts, condivisi con l'export WAV.
import { Graph } from "./graph";
import { loadLimiter } from "./limiter";
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
  private loopFrom = 0;
  // gli ultimi step programmati, con il loro orario: servono a registrare sullo step più vicino
  private recent: { t: number; step: number; slot: Slot | null }[] = [];

  constructor(
    private getProject: () => Project,
    private getPlayback: () => Playback,
    private onStep: (step: number, bar: number, slot: Slot | null) => void,
  ) {
    this.ctx = new AudioContext();
    this.graph = new Graph(this.ctx, getProject);
    // il limiter vero si carica in sottofondo; play e anteprime lo aspettano (pochi millisecondi)
    this.ready = loadLimiter(this.ctx).then((ok) => {
      if (ok) this.graph.useRealLimiter();
    });
  }

  private ready: Promise<void>;

  // quanto sta abbassando il limiter del master (dB, 0 = niente): per la spia nel mixer
  get limiterDb() {
    return this.graph.limiterDb;
  }

  get playing() {
    return this.timer !== null;
  }

  // fromBar: in modalità song la battuta da cui partire (il marker); a fine canzone si torna lì
  async start(fromBar = 0) {
    await this.ready;
    await this.ctx.resume();
    this.step = 0;
    this.recent = [];
    this.bar = fromBar;
    this.loopFrom = fromBar;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  // Dove scrivere una nota suonata adesso (quantizzazione come in FL): lo step il cui suono arriva alle
  // casse più vicino a questo istante. Conto la latenza dell'uscita audio: suoni su quello che senti.
  // pressedAt: l'istante in cui il tasto è stato premuto (event.timeStamp), non quello in cui il programma
  // se ne accorge: se lo studio sta ridisegnando, l'evento arriva qualche decina di ms dopo.
  recordPosition(pressedAt?: number): { step: number; slot: Slot | null } | null {
    if (!this.playing || this.recent.length === 0) return null;
    const ctx = this.ctx;
    let heard = ctx.currentTime - (ctx.outputLatency || 0) - (ctx.baseLatency || 0);
    // getOutputTimestamp: quale istante dell'audio esce dalle casse in quel momento (latenza compresa)
    const out = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
    if (pressedAt !== undefined && out?.contextTime && out.performanceTime) {
      heard = out.contextTime + (pressedAt - out.performanceTime) / 1000;
    }
    let best = this.recent[0];
    for (const r of this.recent) if (Math.abs(r.t - heard) < Math.abs(best.t - heard)) best = r;
    return { step: best.step, slot: best.slot };
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

  // i canali da ascoltare da soli (vuoto = tutti)
  setSolo(ids: Iterable<ChannelId>) {
    this.graph.setSolo(ids);
  }

  async preview(id: ChannelId, opts: { note?: number; chord?: Chord } = {}) {
    await this.ready;
    await this.ctx.resume();
    this.graph.preview(id, this.ctx.currentTime + 0.01, opts);
  }

  private tick() {
    const p = this.getProject();
    const { song, editing } = this.getPlayback();
    const stepDur = 60 / p.bpm / 4;
    this.graph.setAutomating(song);
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD_S) {
      const s = this.step;
      const len = songLength(p);
      const back = this.loopFrom < len ? this.loopFrom : 0; // il marker, se è dentro la canzone
      const bar = song ? (this.bar < len ? this.bar : back) : 0;
      const slot = song ? p.song[bar] : editing;
      // swing: gli step in levare (2, 4, 6… contando da 1) arrivano un po' dopo
      const t = this.nextTime + (s % 2 === 1 ? p.swing * stepDur : 0);
      if (song && s === 0) this.graph.automateBar(bar, this.nextTime, STEPS * stepDur, songLength(p) - 1);
      if (slot) this.graph.playStep(p.patterns[slot], s, t, stepDur);
      this.recent.push({ t, step: s, slot });
      if (this.recent.length > 32) this.recent.shift();
      const delay = Math.max(0, (t - this.ctx.currentTime) * 1000);
      setTimeout(() => this.timer && this.onStep(s, bar, slot), delay);
      this.nextTime += stepDur;
      this.step = (s + 1) % STEPS;
      if (this.step === 0) this.bar = bar + 1 < len ? bar + 1 : back;
    }
  }
}
