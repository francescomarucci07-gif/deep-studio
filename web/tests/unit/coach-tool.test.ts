// Gli strumenti con cui il coach scrive nello studio: quello che manda diventa un progetto valido.
import { describe, expect, it } from "vitest";
import { createStudioWriter } from "@/lib/daw/coach-tool";
import { describe as describeProject, patBars, starterProject } from "@/lib/daw/project";

const base = { nome: "prova", kick: [1, 5, 9, 13], clap: [5, 13], hat: [], basso: [] };

describe("scrivi_pattern", () => {
  it("scrive note lunghe, velocity e pattern da 2 battute", () => {
    const w = createStudioWriter(starterProject(), "A");
    w.run("scrivi_pattern", {
      ...base,
      slot: "B",
      lunghezza_battute: 2,
      kick: [1, 17],
      basso: [{ step: 17, nota: 36, lunghezza: 8 }],
      velocity: [{ riga: "kick", step: 17, valore: 1 }],
    });
    const B = w.result().project.patterns.B;
    expect(patBars(B)).toBe(2);
    expect(B.drums.kick[16]).toBe(true);
    expect(B.len).toEqual({ b16: 8 });
    expect(B.vel).toEqual({ kick16: 1 });
    expect(describeProject(w.result().project, "t", "B")).toContain("Pattern B (2 battute");
  });

  it("suoni_solo_qui dà il suono al pattern; senza, cambia il suono di base", () => {
    const w = createStudioWriter(starterProject(), "A");
    w.run("scrivi_pattern", { ...base, slot: "B", onda_lead: "bell", suoni_solo_qui: true });
    w.run("scrivi_pattern", { ...base, slot: "C", onda_lead: "pluck" });
    const p = w.result().project;
    expect(p.patterns.B.sounds?.lead?.wave).toBe("bell");
    expect(p.leadSound.wave).toBe("pluck");
  });
});

describe("scrivi_effetti", () => {
  it("routing nei bus, plugin sul bus e automazione del volume", () => {
    const w = createStudioWriter(starterProject(), "A");
    w.run("scrivi_effetti", {
      nome: "mix",
      bus: [{ bus: "bus2", nome: "Synth", canali: ["chords", "lead"] }],
      plugin: [{ bersaglio: "bus2", slot: 1, tipo: "reverb" }],
      automazioni: [{ parametro: "volume", bersaglio: "lead", punti: [{ battuta: 1, valore: 0 }, { battuta: 4, valore: 0.6 }] }],
    });
    const p = w.result().project;
    expect(p.mixer.lead.out).toBe("bus2");
    expect(p.buses.bus2).toMatchObject({ name: "Synth", shown: true });
    expect(p.inserts.bus2[0]?.type).toBe("reverb");
    expect(p.volAuto?.lead?.slice(0, 4)).toEqual([0, null, null, 0.6]);
  });
});

describe("tom, shaker, Lead 2 e send", () => {
  it("il coach scrive tom, shaker e melodia_2 con il suo suono", () => {
    const w = createStudioWriter(starterProject(), "A");
    w.run("scrivi_pattern", {
      ...base,
      tom: [13, 15],
      shaker: [2, 4],
      melodia_2: [{ step: 3, nota: 79, lunghezza: 2 }],
      onda_lead2: "bell",
      velocity: [{ riga: "melodia_2", step: 3, valore: 1 }],
    });
    const p = w.result().project;
    const A = p.patterns.A;
    expect(A.drums.tom[12] && A.drums.shaker[1]).toBe(true);
    expect(A.lead2[2]).toEqual([79]);
    expect(A.len).toEqual({ "m2:79": 2 });
    expect(A.vel).toEqual({ m2: 1 });
    expect(p.lead2Sound.wave).toBe("bell");
    expect(p.leadSound.wave).toBe("sawtooth"); // il primo lead non cambia
  });

  it("send verso un bus Rev", () => {
    const w = createStudioWriter(starterProject(), "A");
    w.run("scrivi_effetti", { bus: [{ bus: "bus2", nome: "Rev", send: [{ canale: "clap", quantita: 0.3 }, { canale: "lead", quantita: 0.25 }] }] });
    const p = w.result().project;
    expect(p.mixer.clap.sends).toEqual({ bus2: 0.3 });
    expect(p.mixer.lead.sends).toEqual({ bus2: 0.25 });
    expect(p.mixer.clap.out).toBe("bus1"); // l'uscita normale resta dov'era
    expect(p.buses.bus2).toMatchObject({ name: "Rev", shown: true });
    expect(describeProject(p, "t", "A")).toContain("send: Clap 30%, Lead 25%");
  });
});
