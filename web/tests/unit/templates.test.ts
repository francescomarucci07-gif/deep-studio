// I progetti modello: validi, nella loro scala, con una canzone che suona.
import { describe, expect, it } from "vitest";
import { chordNotes, isEmptyPattern, normalize, songLength, SLOTS } from "@/lib/daw/project";
import { inScale } from "@/lib/daw/scale";
import { TEMPLATES, TEMPLATE_IDS } from "@/lib/daw/templates";

describe("progetti modello", () => {
  it("Vuoto non ha note né canzone", () => {
    const p = TEMPLATES.vuoto.make();
    expect(SLOTS.every((s) => isEmptyPattern(p.patterns[s]))).toBe(true);
    expect(p.song.some(Boolean)).toBe(false);
  });

  for (const id of TEMPLATE_IDS.filter((t) => t !== "vuoto")) {
    it(`${TEMPLATES[id].label}: valido, tutte le note nella scala, una canzone che usa groove e break`, () => {
      const p = TEMPLATES[id].make();
      expect(normalize(JSON.parse(JSON.stringify(p)))).toEqual(p); // già normalizzato: si salva e si rilegge uguale
      const key = p.key!;
      expect(key).toBeDefined();
      const fuori: string[] = [];
      for (const s of SLOTS) {
        const pat = p.patterns[s];
        pat.bass.forEach((n, i) => n !== null && !inScale(key, n) && fuori.push(`${s} basso ${i + 1}: ${n}`));
        for (const r of ["lead", "lead2"] as const)
          pat[r].forEach((ns, i) => ns.forEach((n) => !inScale(key, n) && fuori.push(`${s} ${r} ${i + 1}: ${n}`)));
        pat.chords.forEach((cs, b) => cs.forEach((c) => chordNotes(c).forEach((n) => !inScale(key, n) && fuori.push(`${s} accordo ${b + 1}: ${n}`))));
      }
      expect(fuori).toEqual([]);
      // le note dei lead non "sfregano" con l'accordo che suona sotto: o sono note dell'accordo, o stanno ad almeno
      // un tono da tutte (un Mi sopra Sol7, a un semitono dal Fa, suonava stonato: 23 nov)
      const sfregano: string[] = [];
      for (const s of SLOTS) {
        const pat = p.patterns[s];
        for (const r of ["lead", "lead2"] as const)
          pat[r].forEach((ns, i) => {
            let b = Math.floor(i / 4);
            while (b > 0 && !pat.chords[b].length && b % 4 !== 0) b--; // l'accordo che tiene (pad: fino al prossimo)
            const tones = new Set(pat.chords[b].flatMap(chordNotes).map((n) => n % 12));
            if (!tones.size) return;
            for (const n of ns) {
              const pc = n % 12;
              if (!tones.has(pc) && (tones.has((pc + 1) % 12) || tones.has((pc + 11) % 12))) sfregano.push(`${s} ${r} step ${i + 1}: ${n}`);
            }
          });
      }
      expect(sfregano).toEqual([]);
      expect(songLength(p)).toBe(16);
      expect(new Set(p.song.filter(Boolean))).toEqual(new Set(["A", "B"]));
      expect(isEmptyPattern(p.patterns.A)).toBe(false);
      expect(p.patterns.A.drums.kick.some(Boolean)).toBe(true); // il groove ha il kick
    });
  }
});
