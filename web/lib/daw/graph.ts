// Il "banco" audio dello studio: strumenti, canali del mixer, riverbero, sidechain e master.
// Funziona con qualunque contesto Web Audio: quello in tempo reale (Engine) e quello offline
// che renderizza il WAV (render.ts), così il file esportato suona come quello che senti.
// Tutti i suoni sono sintetizzati: niente campioni da scaricare o licenziare.
import {
  AUTO_TARGETS,
  BEATS,
  CHANNEL_IDS,
  CHORD_STYLES,
  DRUMS,
  STEPS,
  chordNotes,
  filterFreqs,
  laneValue,
  soundOf,
  type AutoTarget,
  type BassSound,
  type ChordSound,
  type LeadSound,
  type Slot,
  type ChannelId,
  type Chord,
  type DrumId,
  type Pattern,
  type Project,
} from "./project";
import { KITS } from "./kits";
import { createFallbackLimiter, createLimiterNode } from "./limiter";
import { INSERT_SLOTS, PLUGINS, type PluginInstance } from "./plugins";

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
  // "choke": un colpo nuovo taglia la coda di quello prima (hat chiuso → open hat; kick → kick,
  // così la coda lunga dell'808 non si accumula). Un gain a parte, senza toccare l'inviluppo.
  private chokes: { kick: GainNode | null; hat: GainNode | null } = { kick: null, hat: null };
  private out: GainNode;
  private limiter: AudioNode;
  limiterDb = 0; // quanto sta abbassando il limiter adesso (dB, 0 = niente)
  // i canali in solo (vuoto = tutti suonano). Solo per l'ascolto: l'export non lo usa mai.
  private solo = new Set<ChannelId>();
  setSolo(ids: Iterable<ChannelId>) {
    this.solo = new Set(ids);
    this.applyMixer();
  }
  private chains: Record<AutoTarget, { from: AudioNode; to: AudioNode }>;
  // i plugin vivi di ogni fila, e com'era la fila l'ultima volta (per ricollegarla solo se cambia)
  private inserts: Partial<Record<AutoTarget, (PluginInstance | null)[]>> = {};
  private insertTypes: Partial<Record<AutoTarget, string[]>> = {};
  private insertWiring: Partial<Record<AutoTarget, string>> = {};

  constructor(
    readonly ctx: BaseAudioContext,
    private getProject: () => Project,
  ) {
    // master: un compressore leggero che "incolla" il mix, poi il limiter che tiene il true peak sotto -1 dBTP
    const master = ctx.createGain();
    master.gain.value = 0.72; // margine: con filtri risonanti e automazioni il true peak resta sotto -1 dBTP
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.01;
    glue.release.value = 0.2;
    // l'uscita passa dal limiter: quello di riserva subito, quello vero (limiter.ts) appena è caricato
    this.out = ctx.createGain();
    this.limiter = createFallbackLimiter(ctx);
    const masterFilter = this.djFilter();
    master.connect(masterFilter.lp);
    masterFilter.hp.connect(glue);
    glue.connect(this.out).connect(this.limiter).connect(ctx.destination);
    // la fila dei plugin del master sta tra il filtro DJ e la colla (il limiter resta l'ultimo anello)
    const chains: Partial<Record<AutoTarget, { from: AudioNode; to: AudioNode }>> = {
      master: { from: masterFilter.hp, to: glue },
    };

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
      chains[id] = { from: g, to: f.lp }; // la fila dei plugin: dopo il fader, prima del filtro e dei send
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
    this.chains = chains as Record<AutoTarget, { from: AudioNode; to: AudioNode }>;
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
  // Mette il limiter vero al posto di quello di riserva (dopo loadLimiter). false se non si può.
  useRealLimiter(): boolean {
    try {
      const node = createLimiterNode(this.ctx);
      node.port.onmessage = (e: MessageEvent<number>) => {
        this.limiterDb = e.data;
      };
      this.out.disconnect();
      this.limiter.disconnect();
      this.out.connect(node).connect(this.ctx.destination);
      this.limiter = node;
      return true;
    } catch {
      return false;
    }
  }

  applyMixer(immediate = false) {
    const p = this.getProject();
    const now = this.ctx.currentTime;
    const set = (param: AudioParam, v: number) =>
      immediate ? param.setValueAtTime(v, now) : param.setTargetAtTime(v, now, 0.01);
    for (const id of CHANNEL_IDS) {
      const c = p.mixer[id];
      // solo: se qualche canale è in solo, gli altri tacciono (anche i loro send, che partono dopo il fader)
      const silenced = c.muted || (this.solo.size > 0 && !this.solo.has(id));
      set(this.channels[id].gain, silenced ? 0 : c.volume);
      set(this.sends[id].reverb.gain, p.fx[id].reverb);
      set(this.sends[id].delay.gain, p.fx[id].delay * DELAY_MAX);
    }
    set(this.delay.delayTime, (60 / p.bpm / 4) * 3);
    this.applyInserts(immediate);
    // i filtri con un'automazione, in modalità song, li muove automateBar
    for (const t of AUTO_TARGETS) {
      if (this.automating && p.automation[t]) continue;
      this.setFilter(this.filters[t], t === "master" ? p.masterFilter : p.fx[t].filter, immediate);
    }
  }

  // I plugin degli insert: creo quelli nuovi, chiudo quelli tolti, aggiorno le manopole e, se è cambiato
  // qualcosa nella fila (un plugin in più o in meno, acceso o spento), la ricollego.
  private applyInserts(immediate: boolean) {
    const p = this.getProject();
    for (const t of AUTO_TARGETS) {
      const slots = p.inserts[t];
      const live = (this.inserts[t] ??= Array(INSERT_SLOTS).fill(null));
      const types = (this.insertTypes[t] ??= Array(INSERT_SLOTS).fill(""));
      slots.forEach((slot, i) => {
        const type = slot?.type ?? "";
        if (types[i] !== type) {
          live[i]?.dispose();
          live[i] = slot ? PLUGINS[slot.type].build(this.ctx) : null;
          types[i] = type;
          this.insertWiring[t] = undefined; // la fila va ricollegata
        }
        if (slot && live[i]) live[i].set(slot.params, immediate, { bpm: p.bpm });
      });
      const wiring = slots.map((s) => (s ? `${s.type}${s.on ? 1 : 0}` : "-")).join(",");
      if (this.insertWiring[t] === wiring) continue;
      this.insertWiring[t] = wiring;
      const { from, to } = this.chains[t];
      from.disconnect();
      for (const inst of live) inst?.output.disconnect();
      let prev: AudioNode = from;
      slots.forEach((slot, i) => {
        const inst = live[i];
        if (!slot?.on || !inst) return; // slot vuoto o spento (bypass): il suono lo salta
        prev.connect(inst.input);
        prev = inst.output;
      });
      prev.connect(to);
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
      const base = target === "master" ? p.masterFilter : p.fx[target].filter;
      const v0 = laneValue(lane, bar, base);
      // fine battuta: dove arriva la curva (prima del primo punto resta su base, niente anticipo)
      const v1 = bar + 1 <= lastBar ? laneValue(lane, bar + 0.999, base) : v0;
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
    // ogni pattern suona con il suo suono, se ce l'ha, altrimenti con quello del progetto
    const bs = soundOf(p, pat, "bass"), ls = soundOf(p, pat, "lead"), cs = soundOf(p, pat, "chords");
    const n = pat.bass[s];
    if (n !== null) {
      const len = bs.length === "lunga" ? this.stepsToNext(pat.bass, s) - 0.05 : 0.9;
      this.bassNote(t, n, stepDur * len, bs);
    }
    const chord = pat.lead[s];
    if (chord.length) {
      const line = pat.lead.map((n) => (n.length ? n[0] : null));
      const len = ls.length === "lunga" ? this.stepsToNext(line, s) - 0.05 : 0.8;
      // più voci insieme: ognuna un po' più piano, così un accordo non è 4 volte più forte di una nota
      const level = 1 / Math.sqrt(chord.length);
      for (const m of chord) this.leadNote(t, m, stepDur * len, ls, level);
    }
    if (s % 4 === 0) {
      const layers = pat.chords[s / 4];
      if (layers.length) {
        const beats = CHORD_STYLES[cs.style].hold ? this.beatsToNextChord(pat, s / 4) : 0.5;
        // accordi sovrapposti: ognuno un po' più piano, come per il lead
        for (const c of layers) this.chord(t, c, beats * 4 * stepDur, cs, 1 / Math.sqrt(layers.length));
      }
    }
  }

  // un colpo di prova con il suono del pattern "slot" (quello che stai modificando)
  preview(id: ChannelId, t: number, opts: { note?: number; chord?: Chord; slot?: Slot } = {}) {
    const p = this.getProject();
    const pat = p.patterns[opts.slot ?? "A"];
    const stepDur = 60 / p.bpm / 4;
    if (id === "bass") this.bassNote(t, opts.note ?? 33, stepDur * 2, soundOf(p, pat, "bass"));
    else if (id === "lead") this.leadNote(t, opts.note ?? 69, stepDur * 2, soundOf(p, pat, "lead"));
    else if (id === "chords") this.chord(t, opts.chord ?? { root: 9, type: "min7" }, stepDur * 8, soundOf(p, pat, "chords"));
    else this.drum(id, t);
  }

  // quanti step mancano alla prossima nota (ricominciando dall'inizio della battuta)
  private stepsToNext(line: (number | null)[], s: number) {
    for (let k = 1; k < STEPS; k++) if (line[(s + k) % STEPS] !== null) return k;
    return STEPS;
  }

  // il pad tiene fino al prossimo accordo della battuta (o fino alla fine della battuta)
  private beatsToNextChord(pat: Pattern, b: number) {
    for (let k = b + 1; k < BEATS; k++) if (pat.chords[k].length) return k - b;
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

  private choke(group: "kick" | "hat", t: number) {
    this.chokes[group]?.gain.setTargetAtTime(0, t, group === "kick" ? 0.004 : 0.008);
    const g = this.ctx.createGain();
    this.chokes[group] = g;
    return g;
  }

  private shaper() {
    const s = this.ctx.createWaveShaper();
    s.curve = this.drive;
    return s;
  }

  private drum(id: DrumId, t: number) {
    const out = this.channels[id];
    const ctx = this.ctx;
    const kit = KITS[this.getProject().kit] ?? KITS.house;
    if (id === "kick") {
      // corpo: sinusoide che scende di tono (il "boom"), saturata un filo per il calore.
      // 909 = discesa rapida e coda corta (punch); 808/trap = coda lunga che fa da nota
      const k = kit.kick;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(k.start, t);
      o.frequency.exponentialRampToValueAtTime(k.knee, t + k.sweep);
      o.frequency.exponentialRampToValueAtTime(k.end, t + Math.max(0.4, k.decay));
      const body = this.env(t, 1, k.decay, 0.002);
      o.connect(body).connect(this.choke("kick", t)).connect(this.shaper()).connect(out);
      o.start(t);
      o.stop(t + k.decay + 0.1);
      // attacco: un click cortissimo che fa sentire il kick anche sulle casse piccole
      if (k.click > 0) {
        this.noiseSource(t, 0.02).connect(this.filter("highpass", 3000)).connect(this.env(t, k.click, 0.008)).connect(out);
      }
    } else if (id === "clap") {
      // quattro "mani" quasi insieme, poi la coda della stanza
      const c = kit.clap;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      for (const dt of [0, 0.009, 0.018, 0.027]) {
        g.gain.setValueAtTime(1, t + dt);
        g.gain.exponentialRampToValueAtTime(0.15, t + dt + 0.008);
      }
      g.gain.setValueAtTime(0.6, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + c.tail);
      this.noiseSource(t, c.tail + 0.04)
        .connect(this.filter("bandpass", c.tone, 1.2))
        .connect(this.filter("highpass", 600))
        .connect(g)
        .connect(out);
      // corpo da rullante: un tono a ~190 Hz che scende, sotto il rumore (909 e trap)
      if (c.body > 0) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(240, t);
        o.frequency.exponentialRampToValueAtTime(180, t + 0.05);
        o.connect(this.env(t, c.body, 0.09)).connect(out);
        o.start(t);
        o.stop(t + 0.15);
      }
    } else if (id === "hat" || id === "openhat") {
      // choke: un hat nuovo (chiuso o aperto) taglia l'open hat che sta ancora suonando
      const h = kit.hat;
      const decay = id === "hat" ? h.closed : h.open;
      const g = this.env(t, h.level, decay);
      const band = this.filter("bandpass", h.center, 0.8);
      const cut = this.choke("hat", t);
      band.connect(this.filter("highpass", h.cut)).connect(g).connect(cut).connect(out);
      if (id === "hat") this.chokes.hat = null; // l'hat chiuso taglia l'open hat, ma non se stesso
      for (const f of HAT_FREQS) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        o.connect(band);
        o.start(t);
        o.stop(t + decay + 0.05);
      }
    } else if (kit.perc === "cowbell") {
      // cowbell della 808: due onde quadre stonate tra loro (540 e 800 Hz) in un passa-banda
      const band = this.filter("bandpass", 900, 2);
      const g = this.env(t, 0.5, 0.22);
      band.connect(g).connect(out);
      for (const f of [540, 800]) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f;
        o.connect(band);
        o.start(t);
        o.stop(t + 0.3);
      }
    } else if (kit.perc === "rim") {
      // rimshot: un "tock" cortissimo, due toni alti più un click
      for (const [f, peak] of [
        [480, 0.5],
        [1650, 0.3],
      ]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        o.connect(this.env(t, peak, 0.03)).connect(out);
        o.start(t);
        o.stop(t + 0.06);
      }
      this.noiseSource(t, 0.015).connect(this.filter("highpass", 2500)).connect(this.env(t, 0.3, 0.006)).connect(out);
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

  // un oscillatore che parte a t e si ferma a stop (accorcia il codice dei synth)
  private osc(type: OscillatorType, freq: number, t: number, stop: number, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.start(t);
    o.stop(stop);
    return o;
  }

  // FM come un DX7: un oscillatore (modulatore) fa vibrare la frequenza di un altro (portante).
  // Più "indice" = più armonici metallici; l'indice che scende fa la campana o il "tine" del Rhodes.
  private fm(freq: number, ratio: number, index: number, decay: number, t: number, stop: number) {
    const carrier = this.osc("sine", freq, t, stop);
    const mod = this.osc("sine", freq * ratio, t, stop);
    const amount = this.ctx.createGain();
    amount.gain.setValueAtTime(freq * index, t);
    amount.gain.exponentialRampToValueAtTime(Math.max(0.01, freq * index * 0.05), t + decay);
    mod.connect(amount).connect(carrier.frequency);
    return carrier;
  }

  // Basso: un suono a scelta (BASS_WAVES), sempre monofonico. "lunga" = 808: parte più alto e scende sulla nota.
  private bassNote(t: number, midi: number, dur: number, snd: BassSound) {
    const { wave, cutoff, length } = snd;
    const ctx = this.ctx;
    const freq = mtof(midi);
    const end = t + Math.max(dur, 0.04);
    const stop = end + 0.03;
    const g = ctx.createGain();
    const plucked = wave === "pluck";
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.005);
    if (plucked) {
      g.gain.exponentialRampToValueAtTime(0.02, Math.min(end, t + 0.35)); // si spegne da solo
    } else {
      g.gain.setValueAtTime(0.5, t + (end - t) * 0.85);
    }
    g.gain.linearRampToValueAtTime(0, end);
    g.connect(this.shaper()).connect(this.channels.bass);

    const oscs: OscillatorNode[] = [];
    const add = (o: OscillatorNode, gain: number, to: AudioNode = g) => {
      const v = ctx.createGain();
      v.gain.value = gain;
      o.connect(v).connect(to);
      oscs.push(o);
    };
    // filtro che si apre e chiude a ogni nota (quanto e quanto in fretta dipende dal suono)
    const envFilter = (q: number, from: number, to: number, time: number) => {
      const f = this.filter("lowpass", cutoff, q);
      f.frequency.setValueAtTime(Math.min(18000, from), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + time);
      f.connect(g);
      return f;
    };
    if (wave === "sawtooth" || wave === "square") {
      add(this.osc(wave, freq, t, stop), 1, envFilter(5, cutoff * 3, cutoff, 0.09));
      add(this.osc("sine", freq, t, stop), 0.55); // sub sotto, fuori dal filtro
    } else if (wave === "sub") {
      add(this.osc("sine", freq, t, stop), 1);
      add(this.osc("sine", freq * 2, t, stop), 0.12); // un filo di seconda armonica: si sente anche sulle casse piccole
    } else if (wave === "reese") {
      const f = envFilter(1.5, cutoff * 1.4, cutoff, 0.2);
      add(this.osc("sawtooth", freq, t, stop, -14), 0.6, f);
      add(this.osc("sawtooth", freq, t, stop, 14), 0.6, f);
      add(this.osc("sine", freq, t, stop), 0.5);
    } else if (wave === "acid") {
      add(this.osc("sawtooth", freq, t, stop), 0.9, envFilter(14, cutoff * 6, cutoff * 0.8, 0.16));
      add(this.osc("sine", freq, t, stop), 0.25);
    } else if (wave === "organ") {
      // registri d'organo: fondamentale, ottava e quinta sopra, con un piccolo "click" d'attacco
      const f = envFilter(0.7, cutoff * 2.5, cutoff * 2, 0.05);
      add(this.osc("sine", freq, t, stop), 0.7, f);
      add(this.osc("sine", freq * 2, t, stop), 0.35, f);
      add(this.osc("sine", freq * 3, t, stop), 0.18, f);
      add(this.osc("square", freq * 4, t, t + 0.012), 0.06, f);
    } else {
      // pluck
      add(this.osc("sawtooth", freq, t, stop), 0.9, envFilter(3, cutoff * 4, cutoff * 0.5, 0.12));
      add(this.osc("sine", freq, t, stop), 0.45);
    }
    if (length === "lunga") {
      for (const o of oscs) {
        const f0 = o.frequency.value;
        o.frequency.setValueAtTime(f0 * 1.5, t);
        o.frequency.exponentialRampToValueAtTime(f0, t + 0.04);
      }
    }
  }

  // Lead: polifonico, una voce per nota, un suono a scelta (LEAD_SOUNDS). Il filtro si apre all'attacco;
  // vibrato leggero sulle note lunghe.
  private leadNote(t: number, midi: number, dur: number, snd: LeadSound, level = 1) {
    const { wave, cutoff } = snd;
    const ctx = this.ctx;
    const freq = mtof(midi);
    const end = t + Math.max(dur, 0.05);
    const decaying = wave === "pluck" || wave === "bell" || wave === "epiano";
    const tail = wave === "bell" ? 1.4 : wave === "epiano" ? 0.9 : 0.06; // campane e piani suonano oltre la nota
    const stop = end + tail + 0.1;
    const f = this.filter("lowpass", cutoff, wave === "pluck" ? 4 : 2);
    if (wave === "pluck") {
      f.frequency.setValueAtTime(Math.min(16000, cutoff * 4), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.5), t + 0.18);
    } else {
      f.frequency.setValueAtTime(Math.min(16000, cutoff * 2.2), t);
      f.frequency.exponentialRampToValueAtTime(cutoff, t + 0.15);
    }
    const g = ctx.createGain();
    const peak = 0.32 * level;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + (wave === "organ" ? 0.01 : 0.006));
    if (decaying) {
      const half = wave === "pluck" ? 0.25 : wave === "bell" ? 1.2 : 0.8;
      g.gain.exponentialRampToValueAtTime(peak * 0.02, t + half);
      g.gain.linearRampToValueAtTime(0, Math.max(t + half, end + tail));
    } else {
      g.gain.setValueAtTime(peak, end - 0.015);
      g.gain.linearRampToValueAtTime(0, end + tail);
    }
    f.connect(g).connect(this.channels.lead);

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(dur > 0.3 && !decaying ? 9 : 0, t + 0.25); // cent: solo sulle note lunghe
    vibrato.connect(depth);
    vibrato.start(t);
    vibrato.stop(stop);

    const voice = (o: OscillatorNode, gain: number, pan = 0) => {
      const v = ctx.createGain();
      v.gain.value = gain;
      depth.connect(o.detune);
      if (pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        o.connect(v).connect(p).connect(f);
      } else o.connect(v).connect(f);
    };
    if (wave === "sawtooth") {
      for (const d of [-6, 6]) voice(this.osc("sawtooth", freq, t, stop, d), 0.7);
    } else if (wave === "square" || wave === "triangle") {
      voice(this.osc(wave, freq, t, stop), 1);
    } else if (wave === "supersaw") {
      // 7 seghe stonate e aperte nello stereo: il muro dei lead progressive e trance
      [-25, -15, -7, 0, 7, 15, 25].forEach((d, i) => voice(this.osc("sawtooth", freq, t, stop, d), 0.38, (i - 3) / 4));
    } else if (wave === "pluck") {
      // un colpo corto: più voce all'attacco, così il picco arriva al livello degli altri suoni
      voice(this.osc("sawtooth", freq, t, stop), 1.3);
      voice(this.osc("square", freq * 2, t, stop), 0.25);
    } else if (wave === "bell") {
      voice(this.fm(freq, 3.5, 4, 1.2, t, stop), 0.9);
    } else if (wave === "epiano") {
      voice(this.fm(freq, 1, 2.2, 0.5, t, stop), 0.9);
      voice(this.fm(freq, 14, 0.35, 0.06, t, stop), 0.25); // il "tine": un tocco metallico all'attacco
    } else {
      // organ
      voice(this.osc("sine", freq, t, stop), 0.6);
      voice(this.osc("sine", freq * 2, t, stop), 0.35);
      voice(this.osc("sine", freq * 4, t, stop), 0.15);
    }
  }

  // Accordo: un suono a scelta (CHORD_STYLES) per tutte le note. I suoni "hold" tengono fino al prossimo accordo.
  private chord(t: number, c: Chord, dur: number, snd: ChordSound, level = 1) {
    const { style, cutoff } = snd;
    const ctx = this.ctx;
    const notes = chordNotes(c);
    const f = this.filter("lowpass", cutoff, 0.8);
    const g = ctx.createGain();
    const peak = (0.3 / Math.sqrt(notes.length)) * level;
    const attack = style === "pad" ? 0.18 : style === "strings" ? 0.35 : style === "organ" ? 0.008 : 0.004;
    const release = style === "pad" ? 0.35 : style === "strings" ? 0.6 : style === "epiano" ? 0.4 : 0.12;
    const end = t + Math.max(dur, attack + 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (style === "stab" || style === "pluck") {
      // lo stab "si chiude": il filtro scende subito, come un accordo pizzicato
      f.frequency.setValueAtTime(cutoff * (style === "pluck" ? 4 : 2.5), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * (style === "pluck" ? 0.4 : 0.6)), t + 0.18);
      g.gain.exponentialRampToValueAtTime(peak * (style === "pluck" ? 0.05 : 0.25), end - 0.01);
    } else if (style === "epiano") {
      f.frequency.setValueAtTime(cutoff * 1.5, t);
      g.gain.exponentialRampToValueAtTime(peak * 0.15, Math.max(t + 0.1, Math.min(end, t + 2.5))); // si spegne piano
    } else {
      f.frequency.setValueAtTime(cutoff, t);
      g.gain.setValueAtTime(peak, end - 0.02);
    }
    g.gain.linearRampToValueAtTime(0, end + release);
    f.connect(g).connect(this.channels.chords);
    const stop = end + release + 0.05;
    for (const n of notes) {
      const freq = mtof(n);
      const voice = (o: OscillatorNode, gain: number, pan = 0) => {
        const v = ctx.createGain();
        v.gain.value = gain;
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        o.connect(v).connect(p).connect(f);
      };
      if (style === "pad" || style === "stab") {
        // due seghe un po' stonate e aperte a destra e sinistra (il "chorus" dei synth analogici)
        for (const side of [-1, 1]) voice(this.osc("sawtooth", freq, t, stop, 7 * side), 1, 0.35 * side);
      } else if (style === "strings") {
        for (const [d, pan] of [[-11, -0.5], [0, 0], [11, 0.5]]) voice(this.osc("sawtooth", freq, t, stop, d), 0.75, pan);
      } else if (style === "organ") {
        voice(this.osc("sine", freq, t, stop), 0.9);
        voice(this.osc("sine", freq * 2, t, stop), 0.5, -0.2);
        voice(this.osc("sine", freq * 4, t, stop), 0.25, 0.2);
      } else if (style === "epiano") {
        voice(this.fm(freq, 1, 2, 0.6, t, stop), 1.2);
        voice(this.fm(freq, 14, 0.3, 0.05, t, stop), 0.3);
      } else {
        // pluck (più forte all'attacco: si spegne subito)
        for (const side of [-1, 1]) voice(this.osc("sawtooth", freq, t, stop, 5 * side), 1.45, 0.3 * side);
      }
    }
  }
}
