// I kit di batteria: stessi quattro strumenti (kick, clap, hat, perc), timbri diversi.
// Tutto sintetizzato come prima: ogni kit è solo una tabella di numeri che graph.ts legge a ogni colpo.

export const KIT_IDS = ["house", "909", "808", "trap"] as const;
export type KitId = (typeof KIT_IDS)[number];

export type Kit = {
  label: string;
  hint: string;
  kick: {
    start: number; // Hz all'attacco
    knee: number; // Hz dopo la discesa veloce
    end: number; // Hz finali (la nota del kick)
    sweep: number; // secondi della discesa veloce
    decay: number; // secondi della coda
    click: number; // volume del click d'attacco
  };
  clap: {
    tone: number; // centro del filtro passa-banda
    tail: number; // secondi della coda
    body: number; // corpo di rullante (sinusoide), 0 = solo clap
  };
  hat: {
    closed: number; // decay hat chiuso
    open: number; // decay open hat
    center: number; // centro del passa-banda
    cut: number; // passa-alto
    level: number;
  };
  perc: "conga" | "rim" | "cowbell";
};

export const KITS: Record<KitId, Kit> = {
  house: {
    label: "House",
    hint: "kick rotondo, clap largo, conga",
    kick: { start: 230, knee: 55, end: 44, sweep: 0.07, decay: 0.45, click: 0.35 },
    clap: { tone: 1500, tail: 0.32, body: 0 },
    hat: { closed: 0.055, open: 0.38, center: 10000, cut: 7000, level: 0.85 },
    perc: "conga",
  },
  "909": {
    label: "909",
    hint: "kick secco che spinge, hat brillanti, rim",
    kick: { start: 320, knee: 62, end: 50, sweep: 0.035, decay: 0.32, click: 0.55 },
    clap: { tone: 1200, tail: 0.24, body: 0.25 },
    hat: { closed: 0.04, open: 0.3, center: 11500, cut: 8500, level: 0.9 },
    perc: "rim",
  },
  "808": {
    label: "808",
    hint: "kick lungo e morbido, hat corti, cowbell",
    kick: { start: 150, knee: 52, end: 46, sweep: 0.03, decay: 0.9, click: 0.08 },
    clap: { tone: 1000, tail: 0.4, body: 0 },
    hat: { closed: 0.07, open: 0.45, center: 8500, cut: 6500, level: 0.8 },
    perc: "cowbell",
  },
  trap: {
    label: "Trap",
    hint: "808 profondo, rullante con corpo, hat secchi",
    kick: { start: 180, knee: 50, end: 41, sweep: 0.04, decay: 1.4, click: 0.2 },
    clap: { tone: 1800, tail: 0.18, body: 0.6 },
    hat: { closed: 0.03, open: 0.26, center: 10500, cut: 8000, level: 0.8 },
    perc: "rim",
  },
};

export const isKit = (v: unknown): v is KitId => KIT_IDS.includes(v as KitId);
