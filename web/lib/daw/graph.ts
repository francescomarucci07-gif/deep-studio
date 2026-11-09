// Il "banco" audio dello studio: strumenti, canali del mixer, riverbero, sidechain e master.
// Funziona con qualunque contesto Web Audio: quello in tempo reale (Engine) e quello offline
// che renderizza il WAV (render.ts), così il file esportato suona come quello che senti.
// Tutti i suoni sono sintetizzati: niente campioni da scaricare o licenziare.
import {
  AUTO_TARGETS,
  BEATS,
  CHANNEL_IDS,
  DRUMS,
  STEPS,
  chordNotes,
  filterFreqs,
  laneValue,
  type AutoTarget,
  type ChannelId,
  type Chord,
  type DrumId,
  type Pattern,
  type Project,
} from "./project";

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

// Posizione nello stereo di ogni canale
const PAN: Record<ChannelId, number> = { kick: 0, clap: 0, hat: 0.18, openhat: -0.15, perc: -0.28, bass: 0, chords: 0, lead: 0.05 };
const DELAY_MAX = 0.6; // send del delay al massimo della manopola: oltre, l'eco copre il canale

// Il filtro DJ: un passa-basso e un passa-alto in fila, mossi insieme da un solo valore -1…1
type DjFilter = { lp: BiquadFilterNode; hp: BiquadFilterNode };

// Le frequenze "metalliche" degli hi-hat della TR-808: sei onde quadre che non sono armoniche tra loro
const HAT_FREQS = [205.3, 304.4, 369.6, 522.7, 540, 800];

export class Graph {
  readonly channels: Record<ChannelId, GainNode>;
  private duck: GainNode;
  private reverb: ConvolverNode;
  private delay: DelayNode;
  private filters: Record<AutoTarget, DjFilter>;
  private sends: Record<ChannelId, { reverb: GainNode; delay: GainNode }>;
  private automating = false; // in modalità song le corsie di automazione comandano i loro filtri
  private noise: AudioBuffer;
  private drive: Float32Array<ArrayBuffer>;
  private openHat: GainNode | null = null; // per il "choke": l'hat chiuso taglia l'open hat

  constructor(
    readonly ctx: BaseAudioContext,
    private getProject: () => Project,
  ) {
    // master: un compressore leggero che "incolla" il mix, poi un limiter che evita il clip
    const master = ctx.createGain();
    master.gain.value = 0.72; // margine: con filtri risonanti e automazioni il true peak resta sotto -1 dBTP
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.01;
    glue.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    const masterFilter = this.djFilter();
    master.connect(masterFilter.lp);
    masterFilter.hp.connect(glue).connect(limiter).connect(ctx.destination);

    // riverbero condiviso: una "stanza" generata, con le basse tagliate per non impastare il low end
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2);
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = "highpass";
    lowCut.frequency.value = 250;
    this.reverb.connect(lowCut).connect(master);

    // delay a tempo: eco a 3/16 (il "rimbalzo" degli hook house), con le basse tagliate
    this.delay = ctx.createDelay(2);
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const delayTone = this.filter("highpass", 400);
    this.delay.connect(delayTone);
    delayTone.connect(feedback).connect(this.delay);
    delayTone.connect(master);

    // basso e accordi passano dal "duck": il sidechain del kick li abbassa a ogni colpo
    this.duck = ctx.createGain();
    this.duck.connect(master);

    // ogni canale: fader → filtro DJ → pan → uscita; i send di riverbero e delay partono dopo il filtro
    const filters: Partial<Record<AutoTarget, DjFilter>> = { master: masterFilter };
    const sends: Partial<Record<ChannelId, { reverb: GainNode; delay: GainNode }>> = {};
    const make = (id: ChannelId, to: AudioNode) => {
      const g = ctx.createGain();
      const f = this.djFilter();
      const pan = ctx.createStereoPanner();
      pan.pan.value = PAN[id];
      g.connect(f.lp);
      f.hp.connect(pan).connect(to);
      const reverb = ctx.createGain();
      const delay = ctx.createGain();
      f.hp.connect(reverb).connect(this.reverb);
      f.hp.connect(delay).connect(this.delay);
      filters[id] = f;
      sends[id] = { reverb, delay };
      return g;
    };
    this.channels = {
      ...(Object.fromEntries(DRUMS.map(({ id }) => [id, make(id, master)])) as Record<DrumId, GainNode>),
      bass: make("bass", this.duck),
      chords: make("chords", this.duck),
      lead: make("lead", master),
    };
    this.filters = filters as Record<AutoTarget, DjFilter>;
    this.sends = sends as Record<ChannelId, { reverb: GainNode; delay: GainNode }>;

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // curva di saturazione morbida (tanh): scalda kick e basso come un preamp spinto
    this.drive = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) this.drive[i] = Math.tanh(((i / 1023) * 2 - 1) * 2.2) / Math.tanh(2.2);
    this.applyMixer(true);
  }

  private djFilter(): DjFilter {
    const lp = this.filter("lowpass", 20000, 1.1);
    const hp = this.filter("highpass", 10, 1.1);
    lp.connect(hp);
    return { lp, hp };
  }

  private setFilter(f: DjFilter, v: number, immediate: boolean) {
    const { lowpass, highpass } = filterFreqs(v);
    const now = this.ctx.currentTime;
    for (const [param, hz] of [
      [f.lp.frequency, lowpass],
      [f.hp.frequency, highpass],
    ] as const) {
      param.cancelScheduledValues(now);
      if (immediate) param.setValueAtTime(hz, now);
      else param.setTargetAtTime(hz, now, 0.03);
    }
  }

  // Volumi, mute, effetti e tempo del delay: chiamato a ogni modifica, cambia il suono senza scatti.
  // immediate = subito al valore giusto (export offline: niente rampa all'inizio del file)
  applyMixer(immediate = false) {
    const p = this.getProject();
    const now = this.ctx.currentTime;
    const set = (param: AudioParam, v: number) =>
      immediate ? param.setValueAtTime(v, now) : param.setTargetAtTime(v, now, 0.01);
    for (const id of CHANNEL_IDS) {
      const c = p.mixer[id];
      set(this.channels[id].gain, c.muted ? 0 : c.volume);
      set(this.sends[id].reverb.gain, p.fx[id].reverb);
      set(this.sends[id].delay.gain, p.fx[id].delay * DELAY_MAX);
    }
    set(this.delay.delayTime, (60 / p.bpm / 4) * 3);
    // i filtri con un'automazione, in modalità song, li muove automateBar
    for (const t of AUTO_TARGETS) {
      if (this.automating && p.automation[t]) continue;
      this.setFilter(this.filters[t], t === "master" ? p.masterFilter : p.fx[t].filter, immediate);
    }
  }

  // Song sì/no: le automazioni valgono solo quando suona la canzone
  setAutomating(on: boolean) {
    if (this.automating === on) return;
    this.automating = on;
    this.applyMixer();
  }

  // Inizio della battuta "bar": ogni filtro automatizzato scorre dal suo valore a quello della battuta dopo
  automateBar(bar: number, t: number, barDur: number, lastBar: number) {
    const p = this.getProject();
    for (const target of AUTO_TARGETS) {
      const lane = p.automation[target];
      if (!lane) continue;
      const v0 = laneValue(lane, bar);
      if (v0 === null) continue;
      const v1 = bar + 1 <= lastBar ? (laneValue(lane, bar + 1) ?? v0) : v0;
      const a = filterFreqs(v0);
      const b = filterFreqs(v1);
      const f = this.filters[target];
      for (const [param, from, to] of [
        [f.lp.frequency, a.lowpass, b.lowpass],
        [f.hp.frequency, a.highpass, b.highpass],
      ] as const) {
        param.cancelScheduledValues(t);
        param.setValueAtTime(from, t);
        param.exponentialRampToValueAtTime(to, t + barDur);
      }
    }
  }

  // Tutto quello che suona allo step s del pattern, al tempo t
  playStep(pat: Pattern, s: number, t: number, stepDur: number) {
    const p = this.getProject();
    for (const { id } of DRUMS) if (pat.drums[id][s]) this.drum(id, t);
    if (pat.drums.kick[s] && p.sidechain) this.sidechain(t, stepDur);
    const n = pat.bass[s];
    if (n !== null) {
      const len = p.bassSound.length === "lunga" ? this.stepsToNext(pat.bass, s) - 0.05 : 0.9;
      this.bassNote(t, n, stepDur * len);
    }
    const m = pat.lead[s];
    if (m !== null) {
      const len = p.leadSound.length === "lunga" ? this.stepsToNext(pat.lead, s) - 0.05 : 0.8;
      this.leadNote(t, m, stepDur * len);
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
    else if (id === "lead") this.leadNote(t, opts.note ?? 69, stepDur * 2);
    else if (id === "chords") this.chord(t, opts.chord ?? { root: 9, type: "min7" }, stepDur * 8);
    else this.drum(id, t);
  }

  // quanti step mancano alla prossima nota (ricominciando dall'inizio della battuta)
  private stepsToNext(line: (number | null)[], s: number) {
    for (let k = 1; k < STEPS; k++) if (line[(s + k) % STEPS] !== null) return k;
    return STEPS;
  }

  // il pad tiene fino al prossimo accordo della battuta (o fino alla fine della battuta)
  private beatsToNextChord(pat: Pattern, b: number) {
    for (let k = b + 1; k < BEATS; k++) if (pat.chords[k]) return k - b;
    return BEATS - b;
  }

  // Risposta all'impulso di una stanza: rumore stereo che si spegne in modo esponenziale
  private impulse(seconds: number) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
    }
    return buf;
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
    // ogni colpo parte da un punto diverso del rumore: due clap di fila non sono mai identici
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
    return src;
  }

  private env(t: number, peak: number, decay: number, attack = 0.001) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private shaper() {
    const s = this.ctx.createWaveShaper();
    s.curve = this.drive;
    return s;
  }

  private drum(id: DrumId, t: number) {
    const out = this.channels[id];
    const ctx = this.ctx;
    if (id === "kick") {
      // corpo: sinusoide che scende di tono (il "boom"), saturata un filo per il calore
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(230, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.4);
      const body = this.env(t, 1, 0.45, 0.002);
      o.connect(body).connect(this.shaper()).connect(out);
      o.start(t);
      o.stop(t + 0.5);
      // attacco: un click cortissimo che fa sentire il kick anche sulle casse piccole
      this.noiseSource(t, 0.02).connect(this.filter("highpass", 3000)).connect(this.env(t, 0.35, 0.008)).connect(out);
    } else if (id === "clap") {
      // quattro "mani" quasi insieme, poi la coda della stanza
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      for (const dt of [0, 0.009, 0.018, 0.027]) {
        g.gain.setValueAtTime(1, t + dt);
        g.gain.exponentialRampToValueAtTime(0.15, t + dt + 0.008);
      }
      g.gain.setValueAtTime(0.6, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      this.noiseSource(t, 0.36)
        .connect(this.filter("bandpass", 1500, 1.2))
        .connect(this.filter("highpass", 600))
        .connect(g)
        .connect(out);
    } else if (id === "hat" || id === "openhat") {
      // choke: un hat nuovo (chiuso o aperto) taglia l'open hat che sta ancora suonando
      if (this.openHat) {
        this.openHat.gain.cancelScheduledValues(t);
        this.openHat.gain.setTargetAtTime(0, t, 0.008);
        this.openHat = null;
      }
      const decay = id === "hat" ? 0.055 : 0.38;
      const g = this.env(t, 0.85, decay);
      const band = this.filter("bandpass", 10000, 0.8);
      band.connect(this.filter("highpass", 7000)).connect(g).connect(out);
      for (const f of HAT_FREQS) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        o.connect(band);
        o.start(t);
        o.stop(t + decay + 0.05);
      }
      if (id === "openhat") this.openHat = g;
    } else {
      // perc tipo conga: tono che scende un po' più un armonico, e un piccolo click di pelle
      for (const [f0, f1, peak] of [
        [340, 270, 0.6],
        [680, 560, 0.18],
      ]) {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + 0.05);
        o.connect(this.env(t, peak, 0.18)).connect(out);
        o.start(t);
        o.stop(t + 0.22);
      }
      this.noiseSource(t, 0.02).connect(this.filter("bandpass", 2200, 1.5)).connect(this.env(t, 0.25, 0.012)).connect(out);
    }
  }

  private bassNote(t: number, midi: number, dur: number) {
    const { wave, cutoff, length } = this.getProject().bassSound;
    const ctx = this.ctx;
    const freq = mtof(midi);
    const end = t + Math.max(dur, 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.005);
    g.gain.setValueAtTime(0.5, t + (end - t) * 0.85);
    g.gain.linearRampToValueAtTime(0, end);
    g.connect(this.shaper()).connect(this.channels.bass);

    // timbro: dente di sega o quadra nel filtro, che si apre e si chiude a ogni nota
    const o = ctx.createOscillator();
    o.type = wave;
    const f = this.filter("lowpass", cutoff, 5);
    f.frequency.setValueAtTime(cutoff * 3, t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + 0.09);
    o.connect(f).connect(g);

    // sub: una sinusoide sulla stessa nota, fuori dal filtro, per il peso sulle casse grandi
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    subGain.gain.value = 0.55;
    sub.connect(subGain).connect(g);

    for (const osc of [o, sub]) {
      // l'808 "lungo" parte un po' più alto e scende sulla nota: il colpo tipico della trap
      if (length === "lunga") {
        osc.frequency.setValueAtTime(freq * 1.5, t);
        osc.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
      } else {
        osc.frequency.value = freq;
      }
      osc.start(t);
      osc.stop(end + 0.02);
    }
  }

  // Lead: un synth monofonico. Saw = due oscillatori un po' stonati (pieno), square = vuoto e "8 bit",
  // triangle = morbido come un flauto. Il filtro si apre all'attacco; un vibrato leggero dopo un attimo.
  private leadNote(t: number, midi: number, dur: number) {
    const { wave, cutoff } = this.getProject().leadSound;
    const ctx = this.ctx;
    const end = t + Math.max(dur, 0.05);
    const f = this.filter("lowpass", cutoff, 2);
    f.frequency.setValueAtTime(Math.min(16000, cutoff * 2.2), t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.006);
    g.gain.setValueAtTime(0.32, end - 0.015);
    g.gain.linearRampToValueAtTime(0, end + 0.06);
    f.connect(g).connect(this.channels.lead);

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(dur > 0.3 ? 9 : 0, t + 0.25); // cent: solo sulle note lunghe
    vibrato.connect(depth);
    vibrato.start(t);
    vibrato.stop(end + 0.1);

    for (const detune of wave === "sawtooth" ? [-6, 6] : [0]) {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.value = mtof(midi);
      o.detune.value = detune;
      depth.connect(o.detune);
      o.connect(f);
      o.start(t);
      o.stop(end + 0.1);
    }
  }

  // Accordo: per ogni nota due oscillatori dente di sega un po' stonati tra loro e aperti a destra
  // e sinistra (il "chorus" dei synth analogici), poi un filtro. Pad = attacco lento; stab = colpo corto.
  private chord(t: number, c: Chord, dur: number) {
    const { style, cutoff } = this.getProject().chordSound;
    const ctx = this.ctx;
    const notes = chordNotes(c);
    const f = this.filter("lowpass", cutoff, 0.8);
    const g = ctx.createGain();
    const peak = 0.3 / Math.sqrt(notes.length);
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
      for (const side of [-1, 1]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = mtof(n);
        o.detune.value = 7 * side;
        const pan = ctx.createStereoPanner();
        pan.pan.value = 0.35 * side;
        o.connect(pan).connect(f);
        o.start(t);
        o.stop(end + release + 0.05);
      }
    }
  }
}
