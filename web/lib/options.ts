// Valori degli enum nel database (db/migrations/0001_init.sql) e le loro etichette.

export const SUBGENRES = [
  { value: "deep", label: "Deep" },
  { value: "tech", label: "Tech" },
  { value: "progressive", label: "Progressive" },
] as const;

export const STAGES = [
  { value: "idea_grezza", label: "Idea grezza" },
  { value: "mix_a_meta", label: "Mix a metà" },
  { value: "finita", label: "Finita" },
] as const;

export const EXPORTS = [
  { value: "nomaster", label: "Senza master" },
  { value: "master", label: "Con master" },
] as const;

export type Subgenre = (typeof SUBGENRES)[number]["value"];
export type Stage = (typeof STAGES)[number]["value"];
export type ExportKind = (typeof EXPORTS)[number]["value"];

export function labelOf(list: readonly { value: string; label: string }[], value: string) {
  return list.find((o) => o.value === value)?.label ?? value;
}

export const AUDIO_EXTENSIONS = [".wav", ".flac"];
export const MAX_FILE_BYTES = 500 * 1024 * 1024; // come file_size_limit del bucket "audio"
