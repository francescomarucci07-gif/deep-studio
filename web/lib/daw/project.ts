// Il progetto dello studio nel browser: 4 pattern da una battuta (A–D) con batteria, bassline, accordi
// e melodia (lead), una canzone di 16 battute che dice quale pattern suona, suoni dei synth, mixer.
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
export type ChannelId = DrumId | "bass" | "chords" | "lead";

// Accordi: uno per battito (4 per battuta). root = nota da 0 (Do) a 11 (Si)
export const BEATS = 4;
export const CHORD_TYPES = ["min", "maj", "min7", "maj7", "dom7", "min9", "sus2", "sus4"] as const;
export type ChordType = (typeof CHORD_TYPES)[number];
export type Chord = { root: number; type: ChordType };
export type ChordStyle = "pad" | "stab";
const CHORD_INTERVALS: Record<ChordType, number[]> = {
  min: [0, 3, 7],
  maj: [0, 4, 7],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dom7: [0, 4, 7, 10],
  min9: [0, 3, 7, 10, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};
const CHORD_SUFFIX: Record<ChordType, string> = {
  min: "m",
  maj: "",
  min7: "m7",
  maj7: "maj7",
  dom7: "7",
  min9: "m9",
  sus2: "sus2",
  sus4: "sus4",
};
// Note MIDI dell'accordo: fondamentale nell'ottava di Do3 (48–59), il resto sopra
export const chordNotes = (c: Chord) => CHORD_INTERVALS[c.type].map((i) => 48 + c.root + i);

export const SLOTS = ["A", "B", "C", "D"] as const;
export type Slot = (typeof SLOTS)[number];
export const isSlot = (v: unknown): v is Slot => SLOTS.includes(v as Slot);

// Righe del piano roll del basso, dall'alto in basso: da La2 a La1 (MIDI 45 → 33)
export const BASS_LOW = 33;
export const BASS_HIGH = 45;
export type Wave = "sawtooth" | "square";
export type NoteLength = "corta" | "lunga"; // lunga = la nota tiene fino alla successiva, come un 808

// Melodia (lead): due ottave, da Do4 a Do6 (MIDI 60 → 84)
export const LEAD_LOW = 60;
export const LEAD_HIGH = 84;
export const LEAD_WAVES = ["sawtooth", "square", "triangle"] as const;
export type LeadWave = (typeof LEAD_WAVES)[number];

export type Channel = { volume: number; muted: boolean };

export type Pattern = {
  drums: Record<DrumId, boolean[]>;
  bass: (number | null)[]; // una nota MIDI per step, oppure null
  chords: (Chord | null)[]; // uno per battito; null = continua l'accordo prima (pad) o niente (stab)
  lead: (number | null)[]; // la melodia: una nota MIDI per step, oppure null
};

export type Project = {
  version: 2;
  bpm: number;
  swing: number; // 0–0.5: quanto ritardano gli step pari, come lo swing di FL
  patterns: Record<Slot, Pattern>;
  song: (Slot | null)[]; // SONG_BARS battute; null = battuta vuota
  bassSound: { wave: Wave; cutoff: number; length: NoteLength };
  chordSound: { style: ChordStyle; cutoff: number };
  leadSound: { wave: LeadWave; cutoff: number; length: NoteLength; delay: number }; // delay: 0–0.6, quanto eco
  sidechain: boolean; // il kick abbassa il basso
  mixer: Record<ChannelId, Channel>;
};

export const NOTE_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
export const chordName = (c: Chord) => `${NOTE_NAMES[c.root]}${CHORD_SUFFIX[c.type]}`;
export function noteName(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

const on = (...steps: number[]) => Array.from({ length: STEPS }, (_, i) => steps.includes(i));

export function emptyPattern(): Pattern {
  return {
    drums: Object.fromEntries(DRUMS.map(({ id }) => [id, on()])) as Pattern["drums"],
    bass: Array(STEPS).fill(null),
    chords: Array(BEATS).fill(null),
    lead: Array(STEPS).fill(null),
  };
}

export const isEmptyPattern = (p: Pattern) =>
  p.bass.every((n) => n === null) &&
  p.lead.every((n) => n === null) &&
  p.chords.every((c) => c === null) &&
  DRUMS.every(({ id }) => p.drums[id].every((s) => !s));

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
      A: {
        drums: { kick: on(0, 4, 8, 12), clap: on(4, 12), hat: on(2, 6, 10, 14), openhat: on(), perc: on() },
        bass,
        chords: [{ root: 9, type: "min7" }, null, null, null],
        lead: Array(STEPS).fill(null),
      },
      B: emptyPattern(),
      C: emptyPattern(),
      D: emptyPattern(),
    },
    song: ["A", "A", "A", "A", ...Array(SONG_BARS - 4).fill(null)],
    bassSound: { wave: "sawtooth", cutoff: 700, length: "corta" },
    chordSound: { style: "pad", cutoff: 1800 },
    leadSound: { wave: "sawtooth", cutoff: 2600, length: "corta", delay: 0.3 },
    sidechain: true,
    mixer: {
      kick: { volume: 0.9, muted: false },
      clap: { volume: 0.6, muted: false },
      hat: { volume: 0.45, muted: false },
      openhat: { volume: 0.4, muted: false },
      perc: { volume: 0.5, muted: false },
      bass: { volume: 0.7, muted: false },
      chords: { volume: 0.45, muted: false },
      lead: { volume: 0.5, muted: false },
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
    bass: notes(r.bass, BASS_LOW, BASS_HIGH),
    chords: Array.from({ length: BEATS }, (_, i) => normalizeChord(Array.isArray(r.chords) ? r.chords[i] : null)),
    lead: notes(r.lead, LEAD_LOW, LEAD_HIGH),
  };
}

// una nota MIDI per step, dentro l'estensione dello strumento; tutto il resto diventa null
function notes(a: unknown, lo: number, hi: number) {
  return Array.from({ length: STEPS }, (_, i) => {
    const n = Array.isArray(a) ? a[i] : null;
    return typeof n === "number" && n >= lo && n <= hi ? Math.round(n) : null;
  });
}

function normalizeChord(raw: unknown): Chord | null {
  const c = raw as Partial<Chord> | null;
  if (!c || !Number.isInteger(c.root) || (c.root as number) < 0 || (c.root as number) > 11) return null;
  return { root: c.root as number, type: CHORD_TYPES.includes(c.type as ChordType) ? (c.type as ChordType) : "min" };
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
    chordSound: {
      style: r.chordSound?.style === "stab" ? "stab" : "pad",
      cutoff: clamp(r.chordSound?.cutoff, 300, 8000, d.chordSound.cutoff),
    },
    leadSound: {
      wave: LEAD_WAVES.includes(r.leadSound?.wave as LeadWave) ? (r.leadSound?.wave as LeadWave) : d.leadSound.wave,
      cutoff: clamp(r.leadSound?.cutoff, 300, 9000, d.leadSound.cutoff),
      length: r.leadSound?.length === "lunga" ? "lunga" : "corta",
      delay: clamp(r.leadSound?.delay, 0, 0.6, d.leadSound.delay),
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
    `Mixer: ${DRUMS.map(({ id, label }) => `${label} ${ch(id)}`).join("; ")}; Bass ${ch("bass")}; Accordi ${ch("chords")}; Lead ${ch("lead")}.`,
    `Accordi: suono ${p.chordSound.style === "pad" ? "pad (tiene fino all'accordo dopo)" : "stab (colpo corto sul battito)"}, filtro ${Math.round(p.chordSound.cutoff)} Hz.`,
    `Lead: onda ${p.leadSound.wave}, filtro ${Math.round(p.leadSound.cutoff)} Hz, note ${p.leadSound.length === "lunga" ? "legate" : "corte"}, delay ${pct(p.leadSound.delay)}.`,
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
    lines.push(`  Accordi   ${pat.chords.map((c, b) => `battito ${b + 1}: ${c ? chordName(c) : "-"}`).join(", ")}`);
    const lead = pat.lead.map((n, i) => (n === null ? null : `${i + 1}:${noteName(n)}`)).filter(Boolean);
    lines.push(`  Lead      ${lead.length ? lead.join(" ") : "nessuna nota"}`);
  }
  lines.push(`Canzone (${SONG_BARS} battute, - = vuota): ${p.song.map((s) => s ?? "-").join(" ")}`);
  return lines.join("\n");
}
