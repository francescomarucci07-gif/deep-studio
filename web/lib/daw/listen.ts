// Il parere in tempo reale: mentre suona, lo studio guarda i "meter" del mix ogni decimo di secondo e, quando trova un
// problema chiaro e che dura, lo dice con un avviso breve. Sono regole scritte qui (niente Claude, niente token): il
// coach entra in gioco solo se chiedi "come lo sistemo?". Come un fonico che guarda l'analizzatore mentre suoni.
//
// Le misure arrivano dagli analizzatori (AnalyserNode) sul kick, sul basso e sul master (graph.ts, tap): spettri in dB.
// Qui ci sono solo numeri, così le regole si provano anche senza audio (tests/unit/listen.test.ts).

export type Frame = {
  kickLow: number; // energia del kick sotto i 150 Hz (dB)
  bassLow: number; // energia del basso sotto i 150 Hz (dB), dopo il sidechain
  master: Record<MasterBand, number>; // energia del master per banda (dB)
  limiterDb: number; // quanto sta abbassando il limiter (dB, 0 = niente)
};

export const MASTER_BANDS = {
  low: [60, 250],
  low_mid: [250, 500],
  mid: [500, 2000],
  high_mid: [2000, 6000],
  high: [6000, 16000],
} as const;
export type MasterBand = keyof typeof MASTER_BANDS;

export type IssueId = "kick_basso" | "limiter" | "fango" | "aspro";
export type Issue = { id: IssueId; title: string; text: string; ask: string };

// energia media di una banda in dB, da uno spettro in dB (getFloatFrequencyData): media delle potenze, non dei dB
export function bandDb(spec: Float32Array | number[], sampleRate: number, lo: number, hi: number) {
  const binHz = sampleRate / 2 / spec.length;
  const a = Math.max(1, Math.floor(lo / binHz));
  const b = Math.min(spec.length - 1, Math.ceil(hi / binHz));
  let sum = 0;
  let n = 0;
  for (let i = a; i <= b; i++) {
    const v = spec[i];
    if (Number.isFinite(v)) sum += 10 ** (v / 10);
    n++;
  }
  return n && sum > 0 ? 10 * Math.log10(sum / n) : -160;
}

// Soglie provvisorie, tarate sui progetti di prova dello studio (come quelle dell'analisi: si ritoccano con l'uso).
export const LISTEN = {
  window: 40, // quante misure guardo insieme (40 × 100 ms = 4 secondi: almeno due battute)
  present: -60, // kick e basso: sotto questo un suono "non c'è"
  silence: -90, // master: sotto questo nei medi non suona niente (nei mix dello studio i medi stanno intorno a -60)
  clash: -4, // basso entro 4 dB dal kick, mentre il kick suona = si pestano
  clashShare: 0.5, // in più di metà dei colpi
  limiter: 3, // il limiter abbassa in media più di 3 dB
  // le bande sono "densità" (energia media per frequenza): nei mix dello studio i medio-bassi stanno 8–10 dB sopra i medi
  mud: 13, // oltre 13 dB = fango

  harsh: 1, // alti (6–16 kHz) più forti degli alti-medi (2–6 kHz): nei mix dello studio stanno da 2 a 13 dB sotto
  cooldownMs: 90_000, // lo stesso avviso non torna prima di un minuto e mezzo
};

const ISSUES: Record<IssueId, Omit<Issue, "id">> = {
  kick_basso: {
    title: "Kick e basso si pestano",
    text: "Sotto i 150 Hz il basso suona forte proprio quando colpisce il kick: il low end si impasta e perde punch.",
    ask: "Lo studio dice che kick e basso si pestano sotto i 150 Hz. Come lo sistemo in questo progetto?",
  },
  limiter: {
    title: "Il master è troppo forte",
    text: "Il limiter sta schiacciando il mix di oltre 3 dB: i colpi perdono dinamica. Abbassa un po' i canali più forti.",
    ask: "Lo studio dice che il limiter del master schiaccia troppo. Quali canali abbasso e di quanto?",
  },
  fango: {
    title: "Troppo fango sui medio-bassi",
    text: "Tra 250 e 500 Hz c'è più energia del normale: il mix suona chiuso e confuso.",
    ask: "Lo studio dice che c'è fango tra 250 e 500 Hz. Da quale canale arriva e come lo pulisco?",
  },
  aspro: {
    title: "Alti troppo brillanti",
    text: "Sopra i 6 kHz c'è molta energia: hat e lead possono stancare l'orecchio, soprattutto in cuffia.",
    ask: "Lo studio dice che gli alti sopra i 6 kHz sono troppo brillanti. Cosa abbasso o filtro?",
  },
};

export class Listener {
  private frames: Frame[] = [];
  private last: Partial<Record<IssueId, number>> = {};

  // muted: gli avvisi che il producer non vuole più
  constructor(private muted: () => ReadonlySet<IssueId> = () => new Set()) {}

  reset() {
    this.frames = [];
  }

  // una misura nuova; restituisce un avviso quando ce n'è uno nuovo da mostrare. canShow = false: c'è già un avviso
  // aperto, quindi misuro ma non propongo niente (l'avviso nuovo arriva dopo, quando il producer chiude quello)
  push(f: Frame, now: number, canShow = true): Issue | null {
    this.frames.push(f);
    if (this.frames.length > LISTEN.window) this.frames.shift();
    if (this.frames.length < LISTEN.window || !canShow) return null;
    for (const id of this.find()) {
      if (this.muted().has(id)) continue;
      if (now - (this.last[id] ?? -Infinity) < LISTEN.cooldownMs) continue;
      this.last[id] = now;
      return { id, ...ISSUES[id] };
    }
    return null;
  }

  // i problemi presenti nella finestra, dal più importante
  find(): IssueId[] {
    const fr = this.frames;
    const out: IssueId[] = [];
    // kick e basso: guardo solo i momenti in cui il kick suona davvero (vicino al suo massimo)
    const kickPeak = Math.max(...fr.map((x) => x.kickLow));
    const hits = fr.filter((x) => x.kickLow > Math.max(LISTEN.present, kickPeak - 6));
    if (hits.length >= 4) {
      const clash = hits.filter((x) => x.bassLow > LISTEN.present && x.bassLow - x.kickLow > LISTEN.clash).length;
      if (clash / hits.length > LISTEN.clashShare) out.push("kick_basso");
    }
    const avg = (fn: (x: Frame) => number) => fr.reduce((a, x) => a + fn(x), 0) / fr.length;
    if (avg((x) => x.limiterDb) > LISTEN.limiter) out.push("limiter");
    // le bande del master solo quando suona qualcosa (i silenzi tra una battuta e l'altra non contano)
    const loud = fr.filter((x) => x.master.mid > LISTEN.silence);
    if (loud.length >= LISTEN.window / 2) {
      const band = (b: MasterBand) => 10 * Math.log10(loud.reduce((a, x) => a + 10 ** (x.master[b] / 10), 0) / loud.length);
      if (band("low_mid") - band("mid") > LISTEN.mud) out.push("fango");
      if (band("high") - band("high_mid") > LISTEN.harsh) out.push("aspro");
    }
    return out;
  }

  // le misure medie della finestra (per il coach e per tarare le soglie)
  summary() {
    const fr = this.frames;
    if (!fr.length) return null;
    const mean = (fn: (x: Frame) => number) => Math.round((fr.reduce((a, x) => a + fn(x), 0) / fr.length) * 10) / 10;
    return {
      kickLow: mean((x) => x.kickLow),
      bassLow: mean((x) => x.bassLow),
      limiterDb: mean((x) => x.limiterDb),
      master: Object.fromEntries((Object.keys(MASTER_BANDS) as MasterBand[]).map((b) => [b, mean((x) => x.master[b])])),
    };
  }
}
