// Ruolo di uno stem dal nome del file. La tabella è web/lib/stem-roles.json, copia identica di
// analysis/stem_roles.json (un test controlla che siano uguali): stessa logica di role_of() in Python.
import table from "./stem-roles.json";

export type StemRole = string;
export type RoleInfo = { id: StemRole; label: string; group: string };

export const ROLE_LIST: RoleInfo[] = table.roles;
export const ROLES: StemRole[] = ROLE_LIST.map((r) => r.id);
export const VOCAL_ROLES = ["vox", "backing_vox", "vocal_chop", "choir"];
const ROLE_WORDS: Record<string, StemRole> = table.words;

export const ROLE_GROUPS: { group: string; label: string; roles: RoleInfo[] }[] = [
  { group: "drums", label: "Batteria" },
  { group: "bass", label: "Basso" },
  { group: "synth", label: "Synth" },
  { group: "strumenti", label: "Strumenti" },
  { group: "voci", label: "Voci" },
  { group: "altro", label: "Altro" },
].map((g) => ({ ...g, roles: ROLE_LIST.filter((r) => r.group === g.group) }));

export function roleLabel(id: string) {
  return ROLE_LIST.find((r) => r.id === id)?.label ?? id;
}

export function roleOf(name: string): StemRole {
  const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  const words = stem.toLowerCase().split(/[\s_\-.]+/).filter(Boolean);
  // "Pad 2.wav": il numero non dice il ruolo; "808" invece sì
  while (words.length && /^\d+$/.test(words[words.length - 1]) && !(words[words.length - 1] in ROLE_WORDS)) {
    words.pop();
  }
  if (!words.length) return "other";
  const pair = words.length >= 2 ? `${words[words.length - 2]}_${words[words.length - 1]}` : "";
  if (pair && pair in ROLE_WORDS) return ROLE_WORDS[pair];
  const w = words[words.length - 1];
  return ROLE_WORDS[w] ?? ROLE_WORDS[w.replace(/s+$/, "")] ?? "other";
}
