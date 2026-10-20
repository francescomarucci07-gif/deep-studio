// Ruolo di uno stem dall'ultima parola del nome file.
// COPIA di ROLE_WORDS / role_of() in analysis/deep_studio_analyze.py: se cambi una, cambia l'altra.

export const ROLES = ["kick", "bass", "drums", "perc", "clap", "lead", "pad", "fx", "vox", "other"] as const;
export type StemRole = (typeof ROLES)[number];

const ROLE_WORDS: Record<string, StemRole> = {
  kick: "kick", kik: "kick", bd: "kick", cassa: "kick",
  bass: "bass", bassline: "bass", sub: "bass", basso: "bass", "808": "bass",
  drums: "drums", drum: "drums", batteria: "drums", loop: "drums",
  perc: "perc", percs: "perc", percussion: "perc", percussioni: "perc",
  hats: "perc", hat: "perc", hihat: "perc", shaker: "perc",
  clap: "clap", claps: "clap", snare: "clap", rim: "clap",
  lead: "lead", synth: "lead", melody: "lead", melodia: "lead",
  arp: "lead", pluck: "lead", keys: "lead", chords: "lead", stab: "lead",
  pad: "pad", pads: "pad", atmo: "pad", atmosfera: "pad", atmosfere: "pad",
  strings: "pad",
  fx: "fx", sfx: "fx", riser: "fx", noise: "fx", impact: "fx", sweep: "fx",
  vox: "vox", vocal: "vox", vocals: "vox", voce: "vox", chop: "vox",
};

export function roleOf(name: string): StemRole {
  const stem = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  const words = stem.toLowerCase().split(/[\s_\-.]+/).filter(Boolean);
  for (const w of words.reverse()) {
    if (w in ROLE_WORDS) return ROLE_WORDS[w];
    if (/^\d+$/.test(w)) continue; // "Pad 2.wav": il numero non dice il ruolo
    return ROLE_WORDS[w.replace(/s+$/, "")] ?? "other";
  }
  return "other";
}
