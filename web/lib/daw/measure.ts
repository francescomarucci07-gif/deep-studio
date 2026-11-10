// Le misure dell'export, calcolate nel browser: un port delle formule di analysis/deep_studio_analyze.py
// (stesse bande, stesso K-weighting BS.1770, stesse soglie), più l'energia per battuta che qui conosciamo
// esattamente. Lavora su array di campioni, così si prova anche in Node contro il Python.

export const BANDS: [string, number, number][] = [
  ["sub", 20, 60],
  ["low", 60, 250],
  ["low_mid", 250, 500],
  ["mid", 500, 2000],
  ["high_mid", 2000, 6000],
  ["high", 6000, 20000],
];

// Soglie provvisorie, le stesse del Python (THRESHOLDS)
const T = { truePeakMax: -1, lowSideMax: 0.1, corrHighMin: 0.2, monoLossMax: 3, crestMin: 6 };

export type Measures = {
  duration_s: number;
  integrated_lufs: number | null;
  true_peak_dbtp: number;
  sample_peak_dbfs: number;
  lra_lu: number | null;
  clipped_samples: number;
  crest_factor_db: number;
  bands_db: Record<string, number>;
  stereo: { correlation_above_120hz: number; side_ratio_low: number; mono_loss_above_120hz_db: number };
  bars: { bar: number; slot: string; rms_db: number; above_6k_db: number }[];
  checks: { check: string; detail: string }[];
};

type Biquad = { b: [number, number, number]; a: [number, number, number] };

function biquad(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  const [b0, b1, b2] = f.b;
  const [, a1, a2] = f.a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

// K-weighting (shelf + passa-alto), formule di B. De Man come nel Python
function kWeighting(sr: number): [Biquad, Biquad] {
  let K = Math.tan((Math.PI * 1681.974450955533) / sr);
  const Q1 = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q1 + K * K;
  const shelf: Biquad = {
    b: [(Vh + (Vb * K) / Q1 + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q1 + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q1 + K * K) / a0],
  };
  K = Math.tan((Math.PI * 38.13547087602444) / sr);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const hp: Biquad = { b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q2 + K * K) / a0] };
  return [shelf, hp];
}

// Butterworth del 2° ordine (passa-basso o passa-alto): due in fila = pendenza come il Python a 120 Hz
function butter2(sr: number, fc: number, type: "lp" | "hp"): Biquad {
  const K = Math.tan((Math.PI * fc) / sr);
  const q = Math.SQRT1_2;
  const a0 = 1 + K / q + K * K;
  const a: [number, number, number] = [1, (2 * (K * K - 1)) / a0, (1 - K / q + K * K) / a0];
  return type === "lp"
    ? { b: [(K * K) / a0, (2 * K * K) / a0, (K * K) / a0], a }
    : { b: [1 / a0, -2 / a0, 1 / a0], a };
}

const db = (v: number) => 10 * Math.log10(Math.max(v, 1e-20));
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

// Loudness di blocchi (win, hop in secondi) sul segnale K-filtrato: [lufs, potenza] per blocco
function blocks(k: Float32Array[], sr: number, winS: number, hopS: number) {
  const n = k[0].length;
  const win = Math.min(n, Math.floor(winS * sr));
  const hop = Math.floor(hopS * sr);
  const cums = k.map((c) => {
    const s = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) s[i + 1] = s[i] + c[i] * c[i];
    return s;
  });
  const out: { lufs: number; power: number }[] = [];
  for (let start = 0; start + win <= n; start += hop) {
    let power = 0;
    for (const s of cums) power += (s[start + win] - s[start]) / win;
    out.push({ lufs: -0.691 + db(power), power });
  }
  return out;
}

function loudness(ch: Float32Array[], sr: number) {
  const [shelf, hp] = kWeighting(sr);
  const k = ch.map((c) => biquad(biquad(c, shelf), hp));
  const b400 = blocks(k, sr, 0.4, 0.1).filter((b) => b.lufs > -70);
  let integrated: number | null = null;
  if (b400.length) {
    const rel = -0.691 + db(b400.reduce((s, b) => s + b.power, 0) / b400.length) - 10;
    const ok = b400.filter((b) => b.lufs > rel);
    integrated = -0.691 + db(ok.reduce((s, b) => s + b.power, 0) / ok.length);
  }
  let lra: number | null = null;
  const b3 = blocks(k, sr, 3, 1).filter((b) => b.lufs > -70);
  if (b3.length >= 2) {
    const rel = -0.691 + db(b3.reduce((s, b) => s + b.power, 0) / b3.length) - 20;
    const vals = b3.filter((b) => b.lufs > rel).map((b) => b.lufs).sort((a, b) => a - b);
    if (vals.length >= 2) {
      const pct = (p: number) => {
        const i = (vals.length - 1) * p;
        const lo = Math.floor(i);
        return vals[lo] + (vals[Math.min(lo + 1, vals.length - 1)] - vals[lo]) * (i - lo);
      };
      lra = pct(0.95) - pct(0.1);
    }
  }
  return { integrated, lra };
}

// True peak: interpolazione x4 con un sinc a finestra (come il resample_poly del Python)
export function truePeak(ch: Float32Array[]) {
  const TAPS = 16;
  const kernels = [0.25, 0.5, 0.75].map((frac) =>
    Array.from({ length: 2 * TAPS }, (_, j) => {
      const t = j - TAPS + 1 - frac;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / (TAPS + 1));
      return (Math.abs(t) < 1e-9 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)) * w;
    }),
  );
  let peak = 0;
  for (const x of ch) {
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
      if (a < peak * 0.5) continue; // l'interpolazione supera il campione solo vicino ai picchi
      for (const k of kernels) {
        let v = 0;
        for (let j = 0; j < k.length; j++) {
          const idx = i + j - TAPS + 1;
          if (idx >= 0 && idx < x.length) v += x[idx] * k[j];
        }
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
    }
  }
  return peak;
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - tr;
        im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr;
        im[i + k] += ti;
      }
    }
  }
}

// Spettro di potenza medio (finestre di Hann, overlap 50%): come il welch del Python
function powerSpectrum(ch: Float32Array[], from: number, to: number, n = 8192) {
  const p = new Float64Array(n / 2 + 1);
  const hann = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  const re = new Float64Array(n), im = new Float64Array(n);
  for (const x of ch) {
    for (let s = from; s + n <= to; s += n / 2) {
      for (let i = 0; i < n; i++) {
        re[i] = x[s + i] * hann[i];
        im[i] = 0;
      }
      fft(re, im);
      for (let i = 0; i <= n / 2; i++) p[i] += re[i] * re[i] + im[i] * im[i];
    }
  }
  return p;
}

function bandsDb(p: Float64Array, sr: number, n = 8192) {
  const hz = (i: number) => (i * sr) / n;
  let total = 1e-20;
  for (let i = 0; i < p.length; i++) if (hz(i) >= 20 && hz(i) <= 20000) total += p[i];
  return Object.fromEntries(
    BANDS.map(([name, lo, hi]) => {
      let e = 0;
      for (let i = 0; i < p.length; i++) if (hz(i) >= lo && hz(i) < hi) e += p[i];
      return [name, round(db(e / total + 1e-20))];
    }),
  );
}

function stereo(ch: Float32Array[], sr: number) {
  const [L, R] = ch.length > 1 ? ch : [ch[0], ch[0]];
  const split = (x: Float32Array, type: "lp" | "hp") => biquad(biquad(x, butter2(sr, 120, type)), butter2(sr, 120, type));
  const Lh = split(L, "hp"), Rh = split(R, "hp"), Ll = split(L, "lp"), Rl = split(R, "lp");
  let ab = 0, aa = 0, bb = 0, mono = 0, st = 0;
  for (let i = 0; i < Lh.length; i++) {
    ab += Lh[i] * Rh[i];
    aa += Lh[i] * Lh[i];
    bb += Rh[i] * Rh[i];
    mono += ((Lh[i] + Rh[i]) / 2) ** 2;
    st += (Lh[i] ** 2 + Rh[i] ** 2) / 2;
  }
  let em = 0, es = 0, total = 1e-20;
  for (let i = 0; i < L.length; i++) {
    em += ((Ll[i] + Rl[i]) / 2) ** 2;
    es += ((Ll[i] - Rl[i]) / 2) ** 2;
    total += L[i] * L[i] + R[i] * R[i];
  }
  return {
    correlation_above_120hz: round(aa * bb > 0 ? ab / Math.sqrt(aa * bb) : 1, 2),
    side_ratio_low: round(2 * (em + es) < total * 1e-4 ? 0 : es / (em + es), 3),
    mono_loss_above_120hz_db: round(db((st + 1e-20) / (mono + 1e-20))),
  };
}

// barStarts: dove inizia ogni battuta (in campioni) e quale pattern suona
export function measure(
  ch: Float32Array[],
  sr: number,
  barPlan: { start: number; length: number; slot: string }[] = [],
): Measures {
  const n = ch[0].length;
  const { integrated, lra } = loudness(ch, sr);
  let samplePeak = 0, sumSq = 0, clipped = 0;
  for (const x of ch) {
    let run = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(x[i]);
      if (a > samplePeak) samplePeak = a;
      sumSq += x[i] * x[i];
      // come il Python: campioni in sequenze di almeno 3 a fondo scala
      if (a >= 0.999) run++;
      else {
        if (run >= 3) clipped += run;
        run = 0;
      }
    }
    if (run >= 3) clipped += run;
  }
  const rms = Math.sqrt(sumSq / (n * ch.length)) + 1e-12;
  const tp = truePeak(ch);
  const bars = barPlan.map(({ start, length, slot }, b) => {
    let e = 0;
    for (const x of ch) for (let i = start; i < Math.min(n, start + length); i++) e += x[i] * x[i];
    const sp = powerSpectrum(ch, start, Math.min(n, start + length), 4096);
    let hi = 0, all = 1e-20;
    for (let i = 0; i < sp.length; i++) {
      all += sp[i];
      if ((i * sr) / 4096 > 6000) hi += sp[i];
    }
    return { bar: b + 1, slot, rms_db: round(db(e / (length * ch.length))), above_6k_db: round(db(hi / all)) };
  });

  const m: Measures = {
    duration_s: round(n / sr),
    integrated_lufs: integrated === null ? null : round(integrated, 2),
    true_peak_dbtp: round(20 * Math.log10(Math.max(tp, 1e-12)), 2),
    sample_peak_dbfs: round(20 * Math.log10(Math.max(samplePeak, 1e-12)), 2),
    lra_lu: lra === null ? null : round(lra),
    clipped_samples: clipped,
    crest_factor_db: round(20 * Math.log10((samplePeak + 1e-12) / rms)),
    bands_db: bandsDb(powerSpectrum(ch, 0, n), sr),
    stereo: stereo(ch, sr),
    bars,
    checks: [],
  };
  if (m.clipped_samples > 0) m.checks.push({ check: "clipping", detail: `${m.clipped_samples} campioni a fondo scala` });
  if (m.true_peak_dbtp > T.truePeakMax) m.checks.push({ check: "true_peak_alto", detail: `true peak ${m.true_peak_dbtp} dBTP (> ${T.truePeakMax})` });
  if (m.stereo.side_ratio_low > T.lowSideMax) m.checks.push({ check: "low_end_stereo", detail: `side sotto 120 Hz = ${m.stereo.side_ratio_low}` });
  if (m.stereo.correlation_above_120hz < T.corrHighMin) m.checks.push({ check: "fase", detail: `correlazione sopra 120 Hz = ${m.stereo.correlation_above_120hz}` });
  if (m.stereo.mono_loss_above_120hz_db > T.monoLossMax) m.checks.push({ check: "perdita_in_mono", detail: `${m.stereo.mono_loss_above_120hz_db} dB persi in mono sopra 120 Hz` });
  if (m.crest_factor_db < T.crestMin) m.checks.push({ check: "sovracompressione", detail: `crest factor ${m.crest_factor_db} dB` });
  return m;
}
