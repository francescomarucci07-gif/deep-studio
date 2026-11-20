// La tonalità del progetto: scale, accordi della scala e "Trova".
import { describe, expect, it } from "vitest";
import { createStudioWriter } from "@/lib/daw/coach-tool";
import { describe as describeProject, normalize, starterProject } from "@/lib/daw/project";
import { diatonicChord, guessKey, inScale, keyName, normKey } from "@/lib/daw/scale";

const LA_MIN = { root: 9, mode: "minore" } as const;

describe("scale", () => {
  it("le note della scala di La minore sono i tasti bianchi", () => {
    const bianchi = [60, 62, 64, 65, 67, 69, 71]; // Do Re Mi Fa Sol La Si
    for (let n = 60; n < 72; n++) expect(inScale(LA_MIN, n)).toBe(bianchi.includes(n));
    expect(inScale({ root: 2, mode: "dorico" }, 71)).toBe(true); // Re dorico ha il Si naturale
    expect(inScale({ root: 4, mode: "frigio" }, 65)).toBe(true); // Mi frigio ha il Fa
    expect(keyName(LA_MIN)).toBe("La minore");
  });

  it("gli accordi della scala di La minore", () => {
    const nomi = [9, 0, 2, 4, 5, 7].map((r) => diatonicChord(LA_MIN, r));
    expect(nomi).toEqual(["min7", "maj7", "min7", "min7", "maj7", "dom7"]);
    expect(diatonicChord(LA_MIN, 11)).toBeNull(); // Si diminuito: nello studio non c'è
    expect(diatonicChord(LA_MIN, 1)).toBeNull(); // fuori scala
  });

  it("Trova: la bassline e gli accordi del progetto di partenza sono in La minore", () => {
    expect(guessKey(starterProject())).toEqual(LA_MIN);
    // Do Mi Sol da soli stanno sia in Do maggiore sia in Mi minore: con il Do che torna spesso (la tonica) vince Do
    expect(guessKey(normalize({ version: 2, patterns: { A: { bass: [36, null, 40, null, 43, null, 36, null, 36] } } }))).toEqual({ root: 0, mode: "maggiore" });
    expect(guessKey(normalize({ version: 2, patterns: {} }))).toBeNull();
    // Mi m7, Re m7 e un La: con il Mi m7, che ha il Si naturale, vince una scala che contiene il Si
    const g = guessKey(normalize({ version: 2, patterns: { A: { chords: [[{ root: 4, type: "min7" }], [], [{ root: 2, type: "min7" }], []], lead: [[69]] } } }));
    expect(g && inScale(g, 71)).toBe(true);
  });

  it("normalize tiene solo tonalità valide; il coach la vede e la può scrivere", () => {
    expect(normKey({ root: 12, mode: "minore" })).toBeUndefined();
    expect(normKey({ root: 2, mode: "lidio" })).toBeUndefined();
    expect(normalize({ version: 2, key: { root: 2, mode: "dorico" } }).key).toEqual({ root: 2, mode: "dorico" });
    const w = createStudioWriter(starterProject(), "A");
    w.run("scrivi_pattern", { kick: [1], tonalita: { radice: 7, modo: "frigio" } });
    const p = w.result().project;
    expect(p.key).toEqual({ root: 7, mode: "frigio" });
    expect(describeProject(p, "t", "A")).toContain("Tonalità: Sol frigia");
    // un pattern scritto senza tonalità non la cambia
    w.run("scrivi_pattern", { kick: [1, 5] });
    expect(w.result().project.key).toEqual({ root: 7, mode: "frigio" });
  });
});
