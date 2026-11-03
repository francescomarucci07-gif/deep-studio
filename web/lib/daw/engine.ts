// Il motore audio dello studio: Web Audio API del browser, niente librerie.
// Come un sequencer hardware: un orologio guarda 100 ms avanti e programma i colpi con precisione
// sul tempo dell'AudioContext (setInterval da solo "balla", il clock audio no).
import { DRUMS, STEPS, type ChannelId, type DrumId, type Project } from "./project";

const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Engine {
  private ctx: AudioContext;
  private channels: Record<ChannelId, GainNode>;
  private duck: GainNode;
  private noise: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;

  constructor(
    private getProject: () => Project,
    private onStep: (step: number) => void,
  ) {
    this.ctx = new AudioContext();
    const master = this.ctx.createGain();
    master.gain.value = 0.8;
    // un limiter morbido sul master, così il browser non va mai in clip
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(this.ctx.destination);

    this.duck = this.ctx.createGain();
    this.duck.connect(master);
    const make = (to: AudioNode) => {
      const g = this.ctx.createGain();
      g.connect(to);
      return g;
    };
    this.channels = {
      ...(Object.fromEntries(DRUMS.map(({ id }) => [id, make(master)])) as Record<DrumId, GainNode>),
      bass: make(this.duck),
    };

    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.applyMixer();
  }

  get playing() {
    return this.timer !== null;
  }

  async start() {
    await this.ctx.resume();
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onStep(-1);
  }

  close() {
    this.stop();
    void this.ctx.close();
  }

  // Volumi e mute: chiamato a ogni modifica del mixer, cambia il suono senza scatti
  applyMixer() {
    const p = this.getProject();
    for (const id of Object.keys(this.channels) as ChannelId[]) {
      const c = p.mixer[id];
      this.channels[id].gain.setTargetAtTime(c.muted ? 0 : c.volume, this.ctx.currentTime, 0.01);
    }
  }

  async preview(id: ChannelId, note?: number) {
    await this.ctx.resume();
    const t = this.ctx.currentTime + 0.01;
    if (id === "bass") this.bassNote(t, note ?? 33, 60 / this.getProject().bpm / 2);
    else this.drum(id, t);
  }

  private tick() {
    const p = this.getProject();
    const stepDur = 60 / p.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD_S) {
      const s = this.step;
      // swing: gli step in levare (2, 4, 6… contando da 1) arrivano un po' dopo
      const t = this.nextTime + (s % 2 === 1 ? p.swing * stepDur : 0);
      for (const { id } of DRUMS) if (p.drums[id][s]) this.drum(id, t);
      if (p.drums.kick[s] && p.sidechain) this.sidechain(t, stepDur);
      const n = p.bass[s];
      if (n !== null) this.bassNote(t, n, stepDur * (p.bassSound.length === "lunga" ? this.stepsToNext(p, s) - 0.05 : 0.9));
      const delay = Math.max(0, (t - this.ctx.currentTime) * 1000);
      setTimeout(() => this.timer && this.onStep(s), delay);
      this.nextTime += stepDur;
      this.step = (s + 1) % STEPS;
    }
  }

  // quanti step mancano alla prossima nota del basso (ricominciando dall'inizio della battuta)
  private stepsToNext(p: Project, s: number) {
    for (let k = 1; k < STEPS; k++) if (p.bass[(s + k) % STEPS] !== null) return k;
    return STEPS;
  }

  private sidechain(t: number, stepDur: number) {
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.2, t);
    g.linearRampToValueAtTime(1, t + stepDur * 2.5);
  }

  private noiseSource(t: number, dur: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t);
    src.stop(t + dur);
    return src;
  }

  private env(t: number, peak: number, decay: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    return g;
  }

  private drum(id: DrumId, t: number) {
    const out = this.channels[id];
    const ctx = this.ctx;
    if (id === "kick") {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      o.connect(this.env(t, 1, 0.5)).connect(out);
      o.start(t);
      o.stop(t + 0.5);
    } else if (id === "clap") {
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1300;
      f.Q.value = 0.9;
      const g = ctx.createGain();
      // tre "mani" ravvicinate e una coda: il trucco classico della 909
      g.gain.setValueAtTime(0, t);
      for (const dt of [0, 0.011, 0.022]) {
        g.gain.setValueAtTime(0.9, t + dt);
        g.gain.exponentialRampToValueAtTime(0.2, t + dt + 0.01);
      }
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      this.noiseSource(t, 0.3).connect(f).connect(g).connect(out);
    } else if (id === "hat" || id === "openhat") {
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 7000;
      const decay = id === "hat" ? 0.05 : 0.35;
      this.noiseSource(t, decay + 0.05).connect(f).connect(this.env(t, 0.5, decay)).connect(out);
    } else {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(550, t + 0.06);
      o.connect(this.env(t, 0.7, 0.12)).connect(out);
      o.start(t);
      o.stop(t + 0.15);
    }
  }

  private bassNote(t: number, midi: number, dur: number) {
    const { wave, cutoff } = this.getProject().bassSound;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 5;
    f.frequency.setValueAtTime(cutoff * 3, t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.005);
    g.gain.setValueAtTime(0.5, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f).connect(g).connect(this.channels.bass);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
