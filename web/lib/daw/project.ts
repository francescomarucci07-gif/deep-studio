// Il progetto dello studio nel browser: una battuta da 16 step, batteria + bassline + mixer.
// È anche il JSON salvato in projects.data, quindi ogni campo ha un default (vedi normalize).

export const STEPS = 16;

export const DRUMS = [
  { id: "kick", label: "Kick" },
  { id: "clap", label: "Clap" },
  { id: "hat", label: "Hi-hat" },
  { id: "openhat", label: "Open hat" },
  { id: "perc", label: "Perc" },
] as const;
export type DrumId = (typeof DRUMS)[number]["id"];
export type ChannelId = DrumId | "bass";

// Righe del piano roll del basso, dall'alto in basso: da La2 a La1 (MIDI 45 → 33)
export const BASS_LOW = 33;
export const BASS_HIGH = 45;
export type Wave = "sawtooth" | "square";

export type Channel = { volume: number; muted: boolean };

export type Project = {
  version: 1;
  bpm: number;
  swing: number; // 0–0.5: quanto ritardano gli step pari, come lo swing di FL
  drums: Record<DrumId, boolean[]>;
  bass: (number | null)[]; // una nota MIDI per step, oppure null
  bassSound: { wave: Wave; cutoff: number };
  sidechain: boolean; // il kick abbassa il basso
  mixer: Record<ChannelId, Channel>;
};

const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
export function noteName(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

const on = (...steps: number[]) => Array.from({ length: STEPS }, (_, i) => steps.includes(i));

// Il groove da cui parte un progetto nuovo: house classica, così si sente subito qualcosa.
export function starterProject(): Project {
  const bass: (number | null)[] = Array(STEPS).fill(null);
  bass[2] = 33;
  bass[6] = 33;
  bass[10] = 36;
  bass[14] = 40;
  return {
    version: 1,
    bpm: 122,
    swing: 0.1,
    drums: {
      kick: on(0, 4, 8, 12),
      clap: on(4, 12),
      hat: on(2, 6, 10, 14),
      openhat: on(),
      perc: on(),
    },
    bass,
    bassSound: { wave: "sawtooth", cutoff: 700 },
    sidechain: true,
    mixer: {
      kick: { volume: 0.9, muted: false },
      clap: { volume: 0.6, muted: false },
      hat: { volume: 0.45, muted: false },
      openhat: { volume: 0.4, muted: false },
      perc: { volume: 0.5, muted: false },
      bass: { volume: 0.7, muted: false },
    },
  };
}

const clamp = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

// Legge un progetto dal database o dal browser: tutto ciò che manca o è strano torna al default.
export function normalize(raw: unknown): Project {
  const d = starterProject();
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Project>;
  const steps = (a: unknown) =>
    Array.from({ length: STEPS }, (_, i) => (Array.isArray(a) ? a[i] === true : false));
  const empty = Object.keys(r).length === 0;
  return {
    version: 1,
    bpm: clamp(r.bpm, 60, 200, d.bpm),
    swing: clamp(r.swing, 0, 0.5, d.swing),
    drums: Object.fromEntries(
      DRUMS.map(({ id }) => [id, empty ? d.drums[id] : steps(r.drums?.[id])]),
    ) as Project["drums"],
    bass: empty
      ? d.bass
      : Array.from({ length: STEPS }, (_, i) => {
          const n = Array.isArray(r.bass) ? r.bass[i] : null;
          return typeof n === "number" && n >= BASS_LOW && n <= BASS_HIGH ? Math.round(n) : null;
        }),
    bassSound: {
      wave: r.bassSound?.wave === "square" ? "square" : "sawtooth",
      cutoff: clamp(r.bassSound?.cutoff, 150, 4000, d.bassSound.cutoff),
    },
    sidechain: typeof r.sidechain === "boolean" ? r.sidechain : d.sidechain,
    mixer: Object.fromEntries(
      (Object.keys(d.mixer) as ChannelId[]).map((id) => [
        id,
        {
          volume: clamp(r.mixer?.[id]?.volume, 0, 1, d.mixer[id].volume),
          muted: r.mixer?.[id]?.muted === true,
        },
      ]),
    ) as Project["mixer"],
  };
}

// Il progetto in parole e griglie: è quello che legge il coach.
export function describe(p: Project, title: string) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const ch = (id: ChannelId) => `vol ${pct(p.mixer[id].volume)}${p.mixer[id].muted ? ", MUTO" : ""}`;
  const lines = [
    `Progetto "${title}": ${p.bpm} BPM, swing ${pct(p.swing)}, sidechain kick→basso ${p.sidechain ? "acceso" : "spento"}.`,
    "Una battuta da 16 step (1 step = 1/16; step 1, 5, 9, 13 sono i quarti). x = colpo, . = vuoto.",
    "Batteria:",
    ...DRUMS.map(({ id, label }) => `${label.padEnd(9)} ${p.drums[id].map((s) => (s ? "x" : ".")).join("")}  (${ch(id)})`),
    `Bassline (onda ${p.bassSound.wave === "sawtooth" ? "dente di sega" : "quadra"}, filtro ${Math.round(p.bassSound.cutoff)} Hz, ${ch("bass")}):`,
  ];
  const notes = p.bass.map((n, i) => (n === null ? null : `step ${i + 1}: ${noteName(n)}`)).filter(Boolean);
  lines.push(notes.length ? notes.join(", ") : "nessuna nota");
  return lines.join("\n");
}
