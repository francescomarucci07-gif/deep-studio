// I plugin degli insert, come gli slot del mixer di FL: effetti messi in fila su un canale o sul master.
// Nel browser non si caricano VST: ogni plugin è costruito qui con i nodi del Web Audio.
// Per aggiungerne uno: una voce in PLUGINS (nome, famiglia, manopole, come si costruisce). Il resto (slot,
// salvataggio, export, coach) funziona da solo.

export const INSERT_SLOTS = 8; // slot per canale e per il master

export type PluginParam = {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  format: (v: number) => string;
};

// quello che il plugin sa del progetto: il tempo, per gli effetti a tempo (delay, tremolo…)
export type PluginEnv = { bpm: number };

// un plugin acceso: un ingresso, un'uscita e un modo per cambiare le manopole
export type PluginInstance = {
  input: AudioNode;
  output: AudioNode;
  set: (params: Record<string, number>, immediate: boolean, env: PluginEnv) => void;
  dispose: () => void;
};

export const PLUGIN_GROUPS = ["EQ e dinamica", "Colore", "Modulazione", "Spazio"] as const;

type PluginDef = {
  label: string;
  group: (typeof PLUGIN_GROUPS)[number];
  hint: string;
  params: PluginParam[];
  build: (ctx: BaseAudioContext) => PluginInstance;
};

// ---------- formati delle manopole ----------
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`);
const db = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
const rate = (v: number) => `${v.toFixed(2)} Hz`;
const ms = (v: number) => `${Math.round(v)} ms`;

// ---------- pezzi comuni ----------
type Setter = (param: AudioParam, v: number) => void;
const setter = (ctx: BaseAudioContext, immediate: boolean): Setter => {
  const now = ctx.currentTime;
  return (param, v) => (immediate ? param.setValueAtTime(v, now) : param.setTargetAtTime(v, now, 0.02));
};

// un effetto con il Mix: il suono pulito (dry) più quello trattato (wet).
// "send" (delay, riverbero, phaser): il pulito resta quasi tutto e il trattato si aggiunge sopra.
// "crossfade" (saturazione, lo-fi): al 100% si sente solo il trattato.
function wetDry(ctx: BaseAudioContext, law: "send" | "crossfade" = "send") {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  const mix = (to: Setter, m: number) => {
    to(dry.gain, law === "crossfade" ? 1 - m : 1 - m * 0.5); // send: il pulito scende meno, il volume resta simile
    to(wet.gain, m);
  };
  return { input, output, wet, mix };
}

// un LFO (oscillatore lento) che muove qualcosa; si ferma quando il plugin viene tolto
function lfo(ctx: BaseAudioContext, type: OscillatorType = "sine") {
  const o = ctx.createOscillator();
  o.type = type;
  o.start();
  return o;
}

// curva di saturazione morbida (tanh), normalizzata: il picco resta lo stesso, cambia il colore
function satCurve(k: number) {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

// curva "a scalini": meno bit = meno gradini = suono più sporco e vintage
function stepCurve(bits: number) {
  const n = 8192;
  const levels = 2 ** Math.round(bits);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.round(x * (levels / 2)) / (levels / 2);
  }
  return c;
}

// la risposta di una stanza generata: rumore che si spegne in "seconds"
function roomImpulse(ctx: BaseAudioContext, seconds: number) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

export const PLUGINS = {
  // ======================= EQ e dinamica =======================
  eq: {
    label: "EQ 3 bande",
    group: "EQ e dinamica",
    hint: "togli fango o dai aria: bassi, medi (con la frequenza), alti",
    params: [
      { id: "low", label: "Low", min: -15, max: 15, default: 0, format: db },
      { id: "midFreq", label: "Mid Hz", min: 200, max: 8000, default: 1000, format: hz },
      { id: "mid", label: "Mid", min: -15, max: 15, default: 0, format: db },
      { id: "high", label: "High", min: -15, max: 15, default: 0, format: db },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 120;
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.Q.value = 0.9;
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 8000;
      low.connect(mid).connect(high);
      return {
        input: low,
        output: high,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          to(low.gain, p.low);
          to(mid.frequency, p.midFreq);
          to(mid.gain, p.mid);
          to(high.gain, p.high);
        },
        dispose() {
          low.disconnect();
          high.disconnect();
        },
      };
    },
  },
  compressor: {
    label: "Compressore",
    group: "EQ e dinamica",
    hint: "tiene a bada i picchi e dà punch: kick, clap, basso, bus",
    params: [
      { id: "threshold", label: "Soglia", min: -48, max: 0, default: -18, format: db },
      { id: "ratio", label: "Ratio", min: 1, max: 20, default: 4, format: (v: number) => `${v.toFixed(1)}:1` },
      { id: "attack", label: "Attacco", min: 0.5, max: 100, default: 10, format: ms },
      { id: "release", label: "Rilascio", min: 20, max: 1000, default: 150, format: ms },
      { id: "gain", label: "Guadagno", min: -12, max: 12, default: 3, format: db },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const comp = ctx.createDynamicsCompressor();
      comp.knee.value = 6;
      const out = ctx.createGain();
      comp.connect(out);
      return {
        input: comp,
        output: out,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          to(comp.threshold, p.threshold);
          to(comp.ratio, p.ratio);
          to(comp.attack, p.attack / 1000);
          to(comp.release, p.release / 1000);
          // il compressore del browser alza da solo il volume (makeup = (1/guadagno a 0 dBFS)^0,6, dalle
          // specifiche Web Audio): lo tolgo, così "Guadagno" 0 dB vuol dire davvero niente in più
          const atFullScale = p.threshold * (1 - 1 / p.ratio); // dB di riduzione su un segnale a 0 dBFS
          const makeup = -0.6 * atFullScale - 1; // -1 dB: il ginocchio di 6 dB (misurato su un tono sotto la soglia)
          to(out.gain, 10 ** ((p.gain - makeup) / 20));
        },
        dispose() {
          comp.disconnect();
          out.disconnect();
        },
      };
    },
  },

  // ======================= Colore =======================
  saturation: {
    label: "Saturazione",
    group: "Colore",
    hint: "calore o sporco: basso e lead escono di più nel mix",
    params: [
      { id: "drive", label: "Drive", min: 0, max: 1, default: 0.35, format: pct },
      { id: "tone", label: "Tono", min: 500, max: 16000, default: 9000, format: hz },
      { id: "mix", label: "Mix", min: 0, max: 1, default: 1, format: pct },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const w = wetDry(ctx, "crossfade");
      const shaper = ctx.createWaveShaper();
      shaper.oversample = "4x"; // meno "aliasing": la distorsione resta pulita sugli acuti
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      const trim = ctx.createGain(); // compensa il volume: più drive non deve voler dire più forte
      w.input.connect(shaper).connect(tone).connect(trim).connect(w.wet);
      let lastDrive = -1;
      return {
        input: w.input,
        output: w.output,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          const d = Math.round(p.drive * 50) / 50; // ricalcolo la curva solo quando cambia davvero
          if (d !== lastDrive) {
            const k = 1 + d * 24;
            shaper.curve = satCurve(k);
            // a un livello tipico (0,3) la curva amplifica di tanh(0,3k)/(0,3·tanh k): lo divido via
            trim.gain.value = (0.3 * Math.tanh(k)) / Math.tanh(0.3 * k);
            lastDrive = d;
          }
          to(tone.frequency, p.tone);
          w.mix(to, p.mix);
        },
        dispose() {
          w.input.disconnect();
          w.output.disconnect();
        },
      };
    },
  },
  lofi: {
    label: "Lo-fi",
    group: "Colore",
    hint: "pochi bit e niente acuti: suono vintage, da campionatore anni '90",
    params: [
      { id: "bits", label: "Bit", min: 2, max: 12, default: 6, format: (v: number) => `${Math.round(v)} bit` },
      { id: "tone", label: "Tono", min: 800, max: 16000, default: 5000, format: hz },
      { id: "mix", label: "Mix", min: 0, max: 1, default: 0.7, format: pct },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const w = wetDry(ctx, "crossfade");
      const crush = ctx.createWaveShaper();
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      w.input.connect(crush).connect(tone).connect(w.wet);
      let lastBits = -1;
      return {
        input: w.input,
        output: w.output,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          const b = Math.round(p.bits);
          if (b !== lastBits) {
            crush.curve = stepCurve(b);
            lastBits = b;
          }
          to(tone.frequency, p.tone);
          w.mix(to, p.mix);
        },
        dispose() {
          w.input.disconnect();
          w.output.disconnect();
        },
      };
    },
  },

  // ======================= Modulazione =======================
  // Chorus: due copie del suono ritardate di ~15 ms, con il ritardo che oscilla piano (LFO).
  // Una a sinistra e una a destra, in controfase: il suono si allarga e "respira".
  chorus: {
    label: "Chorus",
    group: "Modulazione",
    hint: "allarga e fa respirare lead e accordi",
    params: [
      { id: "rate", label: "Rate", min: 0.05, max: 4, default: 0.6, format: rate },
      { id: "depth", label: "Depth", min: 0, max: 1, default: 0.5, format: pct },
      { id: "mix", label: "Mix", min: 0, max: 1, default: 0.45, format: pct },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      input.connect(dry).connect(output);
      wet.connect(output);
      const osc = lfo(ctx);
      const sides = [-1, 1].map((side) => {
        const d = ctx.createDelay(0.05);
        d.delayTime.value = side < 0 ? 0.014 : 0.017; // due tempi un po' diversi: meno "metallico"
        const depth = ctx.createGain();
        const pan = ctx.createStereoPanner();
        pan.pan.value = side * 0.8;
        osc.connect(depth).connect(d.delayTime);
        input.connect(d).connect(pan).connect(wet);
        return { depth, side };
      });
      return {
        input,
        output,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          to(osc.frequency, p.rate);
          // fino a ±4 ms di oscillazione; il lato destro in controfase (segno opposto)
          for (const s of sides) to(s.depth.gain, s.side * p.depth * 0.004);
          to(dry.gain, 1 - p.mix * 0.5);
          to(wet.gain, p.mix * 0.8);
        },
        dispose() {
          osc.stop();
          input.disconnect();
          output.disconnect();
        },
      };
    },
  },
  phaser: {
    label: "Phaser",
    group: "Modulazione",
    hint: "il \"giro\" che scorre nel suono: accordi, pad, hat",
    params: [
      { id: "rate", label: "Rate", min: 0.05, max: 5, default: 0.4, format: rate },
      { id: "depth", label: "Depth", min: 0, max: 1, default: 0.6, format: pct },
      { id: "feedback", label: "Feedback", min: 0, max: 0.8, default: 0.35, format: pct },
      { id: "mix", label: "Mix", min: 0, max: 1, default: 0.5, format: pct },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const w = wetDry(ctx);
      const osc = lfo(ctx);
      const sweep = ctx.createGain(); // quanto l'LFO sposta i filtri (in cent)
      osc.connect(sweep);
      const stages = [400, 800, 1600, 3200].map((f) => {
        const a = ctx.createBiquadFilter();
        a.type = "allpass";
        a.frequency.value = f;
        a.Q.value = 0.7;
        sweep.connect(a.detune);
        return a;
      });
      for (let i = 0; i < stages.length - 1; i++) stages[i].connect(stages[i + 1]);
      const first = stages[0];
      const last = stages[stages.length - 1];
      // il feedback rientra in cima: nel Web Audio un anello deve passare da un ritardo, anche minimo
      const fb = ctx.createGain();
      const loop = ctx.createDelay(0.01);
      loop.delayTime.value = 0.001;
      last.connect(fb).connect(loop).connect(first);
      w.input.connect(first);
      last.connect(w.wet);
      return {
        input: w.input,
        output: w.output,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          to(osc.frequency, p.rate);
          to(sweep.gain, p.depth * 2400);
          to(fb.gain, p.feedback);
          w.mix(to, p.mix);
        },
        dispose() {
          osc.stop();
          w.input.disconnect();
          w.output.disconnect();
          fb.disconnect();
        },
      };
    },
  },
  autofilter: {
    label: "Auto filter",
    group: "Modulazione",
    hint: "un passa-basso che si apre e chiude da solo: il \"wobble\" su basso e accordi",
    params: [
      { id: "cutoff", label: "Cutoff", min: 100, max: 12000, default: 1500, format: hz },
      { id: "resonance", label: "Reso", min: 0.5, max: 15, default: 4, format: (v: number) => v.toFixed(1) },
      { id: "rate", label: "Rate", min: 0.05, max: 8, default: 0.5, format: rate },
      { id: "depth", label: "Depth", min: 0, max: 1, default: 0.5, format: pct },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      const osc = lfo(ctx);
      const amount = ctx.createGain(); // in cent: ±2 ottave al massimo
      osc.connect(amount).connect(f.detune);
      return {
        input: f,
        output: f,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          to(f.frequency, p.cutoff);
          to(f.Q, p.resonance);
          to(osc.frequency, p.rate);
          to(amount.gain, p.depth * 2400);
        },
        dispose() {
          osc.stop();
          f.disconnect();
        },
      };
    },
  },
  tremolo: {
    label: "Tremolo",
    group: "Modulazione",
    hint: "il volume che pulsa: accordi e pad più ritmici",
    params: [
      { id: "rate", label: "Rate", min: 0.5, max: 16, default: 4, format: rate },
      { id: "depth", label: "Depth", min: 0, max: 1, default: 0.5, format: pct },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const g = ctx.createGain();
      const osc = lfo(ctx);
      const amount = ctx.createGain();
      osc.connect(amount).connect(g.gain);
      return {
        input: g,
        output: g,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          to(osc.frequency, p.rate);
          // il volume oscilla tra 1 - depth e 1
          to(g.gain, 1 - p.depth / 2);
          to(amount.gain, p.depth / 2);
        },
        dispose() {
          osc.stop();
          g.disconnect();
        },
      };
    },
  },
  autopan: {
    label: "Auto-pan",
    group: "Modulazione",
    hint: "il suono che si muove tra sinistra e destra: perc, hat, lead",
    params: [
      { id: "rate", label: "Rate", min: 0.05, max: 8, default: 0.5, format: rate },
      { id: "depth", label: "Depth", min: 0, max: 1, default: 0.6, format: pct },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const pan = ctx.createStereoPanner();
      const osc = lfo(ctx);
      const amount = ctx.createGain();
      osc.connect(amount).connect(pan.pan);
      return {
        input: pan,
        output: pan,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          to(osc.frequency, p.rate);
          to(amount.gain, p.depth);
        },
        dispose() {
          osc.stop();
          pan.disconnect();
        },
      };
    },
  },

  // ======================= Spazio =======================
  delay: {
    label: "Delay ping-pong",
    group: "Spazio",
    hint: "eco a tempo che rimbalza tra sinistra e destra",
    params: [
      { id: "time", label: "Tempo", min: 1, max: 8, default: 3, format: (v: number) => `${Math.round(v)}/16` },
      { id: "feedback", label: "Feedback", min: 0, max: 0.85, default: 0.35, format: pct },
      { id: "mix", label: "Mix", min: 0, max: 1, default: 0.3, format: pct },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const w = wetDry(ctx);
      const tone = ctx.createBiquadFilter(); // le eco senza bassi: non impastano il low end
      tone.type = "highpass";
      tone.frequency.value = 300;
      const left = ctx.createDelay(2);
      const right = ctx.createDelay(2);
      const fbL = ctx.createGain();
      const fbR = ctx.createGain();
      const panL = ctx.createStereoPanner();
      const panR = ctx.createStereoPanner();
      panL.pan.value = -0.9;
      panR.pan.value = 0.9;
      // ping-pong: l'eco a sinistra entra a destra, quella a destra rientra a sinistra
      w.input.connect(tone).connect(left);
      left.connect(panL).connect(w.wet);
      left.connect(fbL).connect(right);
      right.connect(panR).connect(w.wet);
      right.connect(fbR).connect(left);
      return {
        input: w.input,
        output: w.output,
        set(p, immediate, env) {
          const to = setter(ctx, immediate);
          const t = Math.min(2, (Math.round(p.time) * 60) / env.bpm / 4);
          to(left.delayTime, t);
          to(right.delayTime, t);
          to(fbL.gain, p.feedback);
          to(fbR.gain, p.feedback);
          w.mix(to, p.mix);
        },
        dispose() {
          w.input.disconnect();
          w.output.disconnect();
          fbL.disconnect();
          fbR.disconnect();
        },
      };
    },
  },
  reverb: {
    label: "Riverbero",
    group: "Spazio",
    hint: "una stanza solo per questo canale (oltre al send di riverbero comune)",
    params: [
      { id: "size", label: "Durata", min: 0.3, max: 6, default: 2, format: (v: number) => `${v.toFixed(1)} s` },
      { id: "mix", label: "Mix", min: 0, max: 1, default: 0.25, format: pct },
    ],
    build(ctx: BaseAudioContext): PluginInstance {
      const w = wetDry(ctx);
      const conv = ctx.createConvolver();
      const lowCut = ctx.createBiquadFilter();
      lowCut.type = "highpass";
      lowCut.frequency.value = 200;
      w.input.connect(conv).connect(lowCut).connect(w.wet);
      let lastSize = -1;
      return {
        input: w.input,
        output: w.output,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          const size = Math.round(p.size * 5) / 5; // rigenero la stanza solo a passi di 0,2 s
          if (size !== lastSize) {
            conv.buffer = roomImpulse(ctx, size);
            lastSize = size;
          }
          w.mix(to, p.mix);
        },
        dispose() {
          w.input.disconnect();
          w.output.disconnect();
        },
      };
    },
  },
  stereo: {
    label: "Stereo",
    group: "Spazio",
    hint: "larghezza: 0% = mono (basso, kick), 100% = com'è, 200% = più largo",
    params: [{ id: "width", label: "Larghezza", min: 0, max: 2, default: 1, format: pct }],
    build(ctx: BaseAudioContext): PluginInstance {
      // L' = a·L + b·R, R' = b·L + a·R con a = (1+w)/2, b = (1-w)/2: w = 0 mono, w = 1 invariato
      const input = ctx.createGain();
      input.channelCount = 2;
      input.channelCountMode = "explicit";
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);
      const ll = ctx.createGain();
      const lr = ctx.createGain();
      const rl = ctx.createGain();
      const rr = ctx.createGain();
      input.connect(split);
      split.connect(ll, 0).connect(merge, 0, 0);
      split.connect(rl, 1).connect(merge, 0, 0);
      split.connect(lr, 0).connect(merge, 0, 1);
      split.connect(rr, 1).connect(merge, 0, 1);
      return {
        input,
        output: merge,
        set(p, immediate) {
          const to = setter(ctx, immediate);
          const a = (1 + p.width) / 2;
          const b = (1 - p.width) / 2;
          to(ll.gain, a);
          to(rr.gain, a);
          to(rl.gain, b);
          to(lr.gain, b);
        },
        dispose() {
          input.disconnect();
          merge.disconnect();
        },
      };
    },
  },
} satisfies Record<string, PluginDef>;

export type PluginType = keyof typeof PLUGINS;
export const PLUGIN_TYPES = Object.keys(PLUGINS) as PluginType[];
export const isPluginType = (v: unknown): v is PluginType => typeof v === "string" && v in PLUGINS;

// uno slot pieno: quale plugin, acceso o no (bypass), le sue manopole
export type PluginSlot = { type: PluginType; on: boolean; params: Record<string, number> };

export const pluginParams = (type: PluginType): PluginParam[] => PLUGINS[type].params;

export function defaultSlot(type: PluginType): PluginSlot {
  return { type, on: true, params: Object.fromEntries(pluginParams(type).map((p) => [p.id, p.default])) };
}

// uno slot letto dal database o scritto dal coach: tipo valido, manopole dentro i limiti
export function normalizeSlot(raw: unknown): PluginSlot | null {
  const r = raw as Partial<PluginSlot> | null;
  if (!r || !isPluginType(r.type)) return null;
  const params = Object.fromEntries(
    pluginParams(r.type).map((p) => {
      const v = r.params?.[p.id];
      return [p.id, typeof v === "number" && Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default];
    }),
  );
  return { type: r.type, on: r.on !== false, params };
}
