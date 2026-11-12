// I plugin degli insert, come gli slot del mixer di FL: effetti messi in fila su un canale o sul master.
// Nel browser non si caricano VST: ogni plugin è costruito qui con i nodi del Web Audio.
// Per aggiungerne uno: una voce in PLUGINS (nome, manopole, come si costruisce). Il resto (slot, salvataggio,
// export, coach) funziona da solo.

export const INSERT_SLOTS = 4; // slot per canale, come i primi insert di FL

export type PluginParam = {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  format: (v: number) => string;
};

// un plugin acceso: un ingresso, un'uscita e un modo per cambiare le manopole
export type PluginInstance = {
  input: AudioNode;
  output: AudioNode;
  set: (params: Record<string, number>, immediate: boolean) => void;
  dispose: () => void;
};

type PluginDef = {
  label: string;
  hint: string;
  params: PluginParam[];
  build: (ctx: BaseAudioContext) => PluginInstance;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const PLUGINS = {
  // Chorus: due copie del suono ritardate di ~15 ms, con il ritardo che oscilla piano (LFO).
  // Una a sinistra e una a destra, in controfase: il suono si allarga e "respira".
  chorus: {
    label: "Chorus",
    hint: "allarga e fa respirare lead e accordi",
    params: [
      { id: "rate", label: "Rate", min: 0.05, max: 4, default: 0.6, format: (v: number) => `${v.toFixed(2)} Hz` },
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
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      const sides = [-1, 1].map((side) => {
        const d = ctx.createDelay(0.05);
        d.delayTime.value = side < 0 ? 0.014 : 0.017; // due tempi un po' diversi: meno "metallico"
        const depth = ctx.createGain();
        const pan = ctx.createStereoPanner();
        pan.pan.value = side * 0.8;
        lfo.connect(depth).connect(d.delayTime);
        input.connect(d).connect(pan).connect(wet);
        return { depth, side };
      });
      lfo.start();
      return {
        input,
        output,
        set(p, immediate) {
          const now = ctx.currentTime;
          const to = (param: AudioParam, v: number) =>
            immediate ? param.setValueAtTime(v, now) : param.setTargetAtTime(v, now, 0.02);
          to(lfo.frequency, p.rate);
          // fino a ±4 ms di oscillazione; il lato destro in controfase (segno opposto)
          for (const s of sides) to(s.depth.gain, s.side * p.depth * 0.004);
          to(dry.gain, 1 - p.mix * 0.5);
          to(wet.gain, p.mix * 0.8);
        },
        dispose() {
          lfo.stop();
          input.disconnect();
          output.disconnect();
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
