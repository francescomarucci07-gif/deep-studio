// Il "banco" audio dello studio: strumenti, canali del mixer, sidechain e master.
// Funziona con qualunque contesto Web Audio: quello in tempo reale (Engine) e quello offline
// che renderizza il WAV (render.ts), così il file esportato suona come quello che senti.
import {
  BEATS,
  DRUMS,
  STEPS,
  chordNotes,
  type ChannelId,
  type Chord,
  type DrumId,
  type Pattern,
  type Project,
} from "./project";

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

export class Graph {
  readonly channels: Record<ChannelId, GainNode>;
  private duck: GainNode;
  private noise: AudioBuffer;

  constructor(
    readonly ctx: BaseAudioContext,
    private getProject: () => Project,
  ) {
    const master = ctx.createGain();
    master.gain.value = 0.8;
    // un limiter morbido sul master, così il browser non va mai in clip
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter).connect(ctx.destination);

    // basso e accordi passano dal "duck": il sidechain del kick li abbassa a ogni colpo
    this.duck = ctx.createGain();
    this.duck.connect(master);
    const make = (to: AudioNode) => {
      const g = ctx.createGain();
      g.connect(to);
      return g;
    };
    this.channels = {
      ...(Object.fromEntries(DRUMS.map(({ id }) => [id, make(master)])) as Record<DrumId, GainNode>),
      bass: make(this.duck),
      chords: make(this.duck),
    };

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.applyMixer();
  }

  // Volumi e mute: chiamato a ogni modifica del mixer, cambia il suono senza scatti
  applyMixer() {
    const p = this.getProject();
    for (const id of Object.keys(this.channels) as ChannelId[]) {
      const c = p.mixer[id];
      this.channels[id].gain.setTargetAtTime(c.muted ? 0 : c.volume, this.ctx.currentTime, 0.01);
    }
  }

  // Tutto quello che suona allo step s del pattern, al tempo t
  playStep(pat: Pattern, s: number, t: number, stepDur: number) {
    const p = this.getProject();
    for (const { id } of DRUMS) if (pat.drums[id][s]) this.drum(id, t);
    if (pat.drums.kick[s] && p.sidechain) this.sidechain(t, stepDur);
    const n = pat.bass[s];
    if (n !== null) {
      const len = p.bassSound.length === "lunga" ? this.stepsToNextNote(pat, s) - 0.05 : 0.9;
      this.bassNote(t, n, stepDur * len);
    }
    if (s % 4 === 0) {
      const chord = pat.chords[s / 4];
      if (chord) {
        const beats = p.chordSound.style === "pad" ? this.beatsToNextChord(pat, s / 4) : 0.5;
        this.chord(t, chord, beats * 4 * stepDur);
      }
    }
  }

  preview(id: ChannelId, t: number, opts: { note?: number; chord?: Chord } = {}) {
    const stepDur = 60 / this.getProject().bpm / 4;
    if (id === "bass") this.bassNote(t, opts.note ?? 33, stepDur * 2);
    else if (id === "chords") this.chord(t, opts.chord ?? { root: 9, type: "min7" }, stepDur * 8);
    else this.drum(id, t);
  }

  // quanti step mancano alla prossima nota del basso (ricominciando dall'inizio della battuta)
  private stepsToNextNote(pat: Pattern, s: number) {
    for (let k = 1; k < STEPS; k++) if (pat.bass[(s + k) % STEPS] !== null) return k;
    return STEPS;
  }

  // il pad tiene fino al prossimo accordo della battuta (o fino alla fine della battuta)
  private beatsToNextChord(pat: Pattern, b: number) {
    for (let k = b + 1; k < BEATS; k++) if (pat.chords[k]) return k - b;
    return BEATS - b;
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

  // Accordo: per ogni nota due oscillatori dente di sega un po' stonati tra loro (il "chorus" dei
  // synth analogici), poi un filtro passa-basso. Pad = attacco lento e coda; stab = colpo corto.
  private chord(t: number, c: Chord, dur: number) {
    const { style, cutoff } = this.getProject().chordSound;
    const ctx = this.ctx;
    const notes = chordNotes(c);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.8;
    const g = ctx.createGain();
    const peak = 0.32 / Math.sqrt(notes.length);
    const attack = style === "pad" ? 0.18 : 0.004;
    const release = style === "pad" ? 0.35 : 0.12;
    const end = t + Math.max(dur, attack + 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (style === "pad") {
      f.frequency.setValueAtTime(cutoff, t);
      g.gain.setValueAtTime(peak, end - 0.02);
    } else {
      // lo stab "si chiude": il filtro scende subito, come un accordo pizzicato
      f.frequency.setValueAtTime(cutoff * 2.5, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.6), t + 0.18);
      g.gain.exponentialRampToValueAtTime(peak * 0.25, end - 0.01);
    }
    g.gain.linearRampToValueAtTime(0, end + release);
    f.connect(g).connect(this.channels.chords);
    for (const n of notes) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = mtof(n);
        o.detune.value = detune;
        o.connect(f);
        o.start(t);
        o.stop(end + release + 0.05);
      }
    }
  }
}
