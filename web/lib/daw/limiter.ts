// Limiter del master: l'ultimo anello della catena, come Fruity Limiter sul master di FL.
// Guarda 5 ms avanti (lookahead) e abbassa il volume PRIMA che arrivi il picco, così il tetto non viene
// mai superato. Gira come AudioWorklet: un piccolo programma che il browser esegue a ogni campione,
// sia nel play in tempo reale sia nell'export offline.
//
// Come garantisce il tetto (per ogni campione t):
//   target(t) = quanto abbassare per stare sotto il tetto (1 = niente)
//   hold(t)   = il minimo di target sugli ultimi 2·L campioni (L = lookahead)
//   rel(t)    = scende subito con hold, risale piano (release)
//   gain(t)   = media di rel sugli ultimi L campioni, applicata al campione di L+2 campioni fa
// Ogni valore nella media è ≤ target del campione in uscita, quindi anche la media lo è.
// Il picco non è solo quello dei campioni: stimo anche tre punti tra un campione e l'altro (interpolazione
// cubica, come il sovracampionamento ×4 del true peak). Per questo l'uscita ritarda 2 campioni in più.

export const LIMITER_CEILING_DB = -1.6; // tetto: la stima dei picchi tra i campioni sbaglia fino a ~0,4 dB, così il true peak resta sotto -1,05 dBTP

const PROCESSOR = /* js */ `
class DsLimiter extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.ceiling = Math.pow(10, (o.ceilingDb ?? -1.6) / 20);
    this.L = Math.max(1, Math.round((o.lookahead ?? 0.005) * sampleRate));
    this.rel = 1 - Math.exp(-1 / ((o.release ?? 0.08) * sampleRate));
    const H = 2 * this.L;
    this.H = H;
    this.D = this.L + 2; // ritardo dell'uscita: lookahead più i 2 campioni dell'interpolazione
    this.delayL = new Float32Array(this.D);
    this.delayR = new Float32Array(this.D);
    this.dpos = 0;
    this.hL = [0, 0, 0, 0]; // ultimi 4 campioni per l'interpolazione
    this.hR = [0, 0, 0, 0];
    // minimo scorrevole su H campioni: coda monotona (indici e valori)
    this.qv = new Float32Array(H + 1);
    this.qi = new Float64Array(H + 1);
    this.qh = 0; this.qt = 0; this.qn = 0;
    this.n = 0;
    this.r = 1;
    // media scorrevole su L campioni
    this.avg = new Float64Array(this.L).fill(1);
    this.apos = 0;
    this.sum = this.L;
    this.minGain = 1;
    this.counter = 0;
  }
  // il picco tra h[1] e h[2] (Catmull-Rom a 1/4, 1/2, 3/4) e sul campione nuovo h[3]
  peakOf(h) {
    const a = h[0], b = h[1], c = h[2], d = h[3];
    let p = Math.abs(d);
    for (const u of [0.25, 0.5, 0.75]) {
      const v = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
      p = Math.max(p, Math.abs(v));
    }
    return p;
  }
  push(v) {
    const cap = this.H + 1;
    while (this.qn > 0) {
      const last = (this.qt - 1 + cap) % cap;
      if (this.qv[last] >= v) { this.qt = last; this.qn--; } else break;
    }
    this.qv[this.qt] = v; this.qi[this.qt] = this.n; this.qt = (this.qt + 1) % cap; this.qn++;
    while (this.qi[this.qh] <= this.n - this.H) { this.qh = (this.qh + 1) % cap; this.qn--; }
    return this.qv[this.qh];
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const inL = inp[0], inR = inp[1] || inp[0];
    const oL = out[0], oR = out[1] || out[0];
    const frames = oL.length;
    for (let i = 0; i < frames; i++) {
      const xL = inL ? inL[i] : 0, xR = inR ? inR[i] : 0;
      this.hL.shift(); this.hL.push(xL);
      this.hR.shift(); this.hR.push(xR);
      const peak = Math.max(this.peakOf(this.hL), this.peakOf(this.hR));
      const target = peak > this.ceiling ? this.ceiling / peak : 1;
      const hold = this.push(target);
      this.n++;
      this.r = hold < this.r ? hold : this.r + (hold - this.r) * this.rel;
      this.sum += this.r - this.avg[this.apos];
      this.avg[this.apos] = this.r;
      this.apos = (this.apos + 1) % this.L;
      const g = Math.min(1, this.sum / this.L);
      const dL = this.delayL[this.dpos], dR = this.delayR[this.dpos];
      this.delayL[this.dpos] = xL; this.delayR[this.dpos] = xR;
      this.dpos = (this.dpos + 1) % this.D;
      oL[i] = dL * g;
      if (oR !== oL) oR[i] = dR * g;
      if (g < this.minGain) this.minGain = g;
    }
    // ogni ~50 ms dico allo studio quanto ho abbassato (per la spia nel mixer)
    this.counter += frames;
    if (this.counter >= sampleRate * 0.05) {
      this.port.postMessage(20 * Math.log10(this.minGain));
      this.counter = 0;
      this.minGain = 1;
    }
    return true;
  }
}
registerProcessor("ds-limiter", DsLimiter);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();

// Carica il limiter nel contesto audio (una volta sola). false se il browser non ha gli AudioWorklet.
export function loadLimiter(ctx: BaseAudioContext): Promise<boolean> {
  let p = loaded.get(ctx);
  if (!p) {
    p = (async () => {
      if (!ctx.audioWorklet || typeof URL === "undefined") return false;
      const url = URL.createObjectURL(new Blob([PROCESSOR], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
        return true;
      } catch {
        return false;
      } finally {
        URL.revokeObjectURL(url);
      }
    })();
    loaded.set(ctx, p);
  }
  return p;
}

export function createLimiterNode(ctx: BaseAudioContext): AudioWorkletNode {
  return new AudioWorkletNode(ctx, "ds-limiter", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { ceilingDb: LIMITER_CEILING_DB, lookahead: 0.005, release: 0.08 },
  });
}

// Limiter di riserva finché quello vero non è pronto (o se il browser non ha gli AudioWorklet):
// il compressore del browser con ginocchio duro. Ferma quasi tutto, ma non garantisce il tetto.
export function createFallbackLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -3;
  c.knee.value = 0;
  c.ratio.value = 20;
  c.attack.value = 0.001;
  c.release.value = 0.1;
  return c;
}
