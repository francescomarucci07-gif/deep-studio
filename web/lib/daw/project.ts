// Il progetto dello studio nel browser: 4 pattern da una battuta (A–D) con batteria + bassline,
// una canzone di 16 battute che dice quale pattern suona, suono del basso e mixer.
// È anche il JSON salvato in projects.data, quindi ogni campo ha un default (vedi normalize).

export const STEPS = 16;
export const SONG_BARS = 16;

export const DRUMS = [
  { id: "kick", label: "Kick" },
  { id: "clap", label: "Clap" },
  { id: "hat", label: "Hi-hat" },
  { id: "openhat", label: "Open hat" },
  { id: "perc", label: "Perc" },
] as const;
export type DrumId = (typeof DRUMS)[number]["id"];
export type ChannelId = DrumId | "bass";

export const SLOTS = ["A", "B", "C", "D"] as const;
export type Slot = (typeof SLOTS)[number];
export const isSlot = (v: unknown): v is Slot => SLOTS.includes(v as Slot);

// Righe del piano roll del basso, dall'alto in basso: da La2 a La1 (MIDI 45 → 33)
export const BASS_LOW = 33;
export const BASS_HIGH = 45;
export type Wave = "sawtooth" | "square";
export type NoteLength = "corta" | "lunga"; // lunga = la nota tiene fino alla successiva, come un 808

export type Channel = { volume: number; muted: boolean };

export type Pattern = {
  drums: Record<DrumId, boolean[]>;
  bass: (number | null)[]; // una nota MIDI per step, oppure null
};

export type Project = {
  version: 2;
  bpm: number;
  swing: number; // 0–0.5: quanto ritardano gli step pari, come lo swing di FL
  patterns: Record<Slot, Pattern>;
  song: (Slot | null)[]; // SONG_BARS battute; null = battuta vuota
  bassSound: { wave: Wave; cutoff: number; length: NoteLength };
  sidechain: boolean; // il kick abbassa il basso
  mixer: Record<ChannelId, Channel>;
};

const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
export function noteName(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

const on = (...steps: number[]) => Array.from({ length: STEPS }, (_, i) => steps.includes(i));

export function emptyPattern(): Pattern {
  return {
    drums: Object.fromEntries(DRUMS.map(({ id }) => [id, on()])) as Pattern["drums"],
    bass: Array(STEPS).fill(null),
  };
}

export const isEmptyPattern = (p: Pattern) =>
  p.bass.every((n) => n === null) && DRUMS.every(({ id }) => p.drums[id].every((s) => !s));

// La canzone dura fino all'ultima battuta usata (almeno 1)
export function songLength(p: Project) {
  let last = 0;
  p.song.forEach((s, i) => s && (last = i + 1));
  return Math.max(1, last);
}

// Il groove da cui parte un progetto nuovo: house classica, così si sente subito qualcosa.
export function starterProject(): Project {
  const bass: (number | null)[] = Array(STEPS).fill(null);
  bass[2] = 33;
  bass[6] = 33;
  bass[10] = 36;
  bass[14] = 40;
  return {
    version: 2,
    bpm: 122,
    swing: 0.1,
    patterns: {
      A: { drums: { kick: on(0, 4, 8, 12), clap: on(4, 12), hat: on(2, 6, 10, 14), openhat: on(), perc: on() }, bass },
      B: emptyPattern(),
      C: emptyPattern(),
      D: emptyPattern(),
    },
    song: ["A", "A", "A", "A", ...Array(SONG_BARS - 4).fill(null)],
    bassSound: { wave: "sawtooth", cutoff: 700, length: "corta" },
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

function normalizePattern(raw: unknown): Pattern {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Pattern>;
  const steps = (a: unknown) => Array.from({ length: STEPS }, (_, i) => (Array.isArray(a) ? a[i] === true : false));
  return {
    drums: Object.fromEntries(DRUMS.map(({ id }) => [id, steps(r.drums?.[id])])) as Pattern["drums"],
    bass: Array.from({ length: STEPS }, (_, i) => {
      const n = Array.isArray(r.bass) ? r.bass[i] : null;
      return typeof n === "number" && n >= BASS_LOW && n <= BASS_HIGH ? Math.round(n) : null;
    }),
  };
}

// Legge un progetto dal database o dal browser: tutto ciò che manca o è strano torna al default.
// I progetti della versione 1 (una sola battuta: drums e bass in cima) diventano il pattern A.
export function normalize(raw: unknown): Project {
  const d = starterProject();
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Project> & Partial<Pattern>;
  if (Object.keys(r).length === 0) return d;
  const v1 = !r.patterns && (r.drums || r.bass);
  const patterns = Object.fromEntries(
    SLOTS.map((s) => [s, v1 ? (s === "A" ? normalizePattern(r) : emptyPattern()) : normalizePattern(r.patterns?.[s])]),
  ) as Project["patterns"];
  const song = v1
    ? d.song
    : Array.from({ length: SONG_BARS }, (_, i) => (Array.isArray(r.song) && isSlot(r.song[i]) ? r.song[i] : null));
  return {
    version: 2,
    bpm: clamp(r.bpm, 60, 200, d.bpm),
    swing: clamp(r.swing, 0, 0.5, d.swing),
    patterns,
    song,
    bassSound: {
      wave: r.bassSound?.wave === "square" ? "square" : "sawtooth",
      cutoff: clamp(r.bassSound?.cutoff, 150, 4000, d.bassSound.cutoff),
      length: r.bassSound?.length === "lunga" ? "lunga" : "corta",
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
export function describe(p: Project, title: string, editing: Slot) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const ch = (id: ChannelId) => `vol ${pct(p.mixer[id].volume)}${p.mixer[id].muted ? ", MUTO" : ""}`;
  const lines = [
    `Progetto "${title}": ${p.bpm} BPM, swing ${pct(p.swing)}, sidechain kick→basso ${p.sidechain ? "acceso" : "spento"}.`,
    `Mixer: ${DRUMS.map(({ id, label }) => `${label} ${ch(id)}`).join("; ")}; Bass ${ch("bass")}.`,
    `Basso: onda ${p.bassSound.wave === "sawtooth" ? "dente di sega" : "quadra"}, filtro ${Math.round(p.bassSound.cutoff)} Hz, note ${p.bassSound.length === "lunga" ? "lunghe (808)" : "corte"}.`,
    "Ogni pattern è una battuta da 16 step (1 step = 1/16; step 1, 5, 9, 13 sono i quarti). x = colpo, . = vuoto.",
    `Il producer sta modificando il pattern ${editing}.`,
  ];
  for (const s of SLOTS) {
    const pat = p.patterns[s];
    if (isEmptyPattern(pat)) {
      lines.push(`Pattern ${s}: vuoto.`);
      continue;
    }
    lines.push(`Pattern ${s}:`);
    for (const { id, label } of DRUMS) lines.push(`  ${label.padEnd(9)} ${pat.drums[id].map((x) => (x ? "x" : ".")).join("")}`);
    const notes = pat.bass.map((n, i) => (n === null ? null : `${i + 1}:${noteName(n)}`)).filter(Boolean);
    lines.push(`  Bass      ${notes.length ? notes.join(" ") : "nessuna nota"}`);
  }
  lines.push(`Canzone (${SONG_BARS} battute, - = vuota): ${p.song.map((s) => s ?? "-").join(" ")}`);
  return lines.join("\n");
}
