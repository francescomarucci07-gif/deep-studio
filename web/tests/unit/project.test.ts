// Il formato del progetto: i progetti di prima si aprono uguali, e ogni campo strano torna a un valore sicuro.
import { describe, expect, it } from "vitest";
import {
  barOf,
  busTargets,
  isEmptyPattern,
  BUS_UNITY,
  maxLen,
  normalize,
  noteLen,
  patBars,
  resizeSong,
  setNoteLen,
  setPatternBars,
  setSend,
  setVel,
  starterProject,
  STEPS,
  VEL_DEFAULT,
  velOf,
} from "@/lib/daw/project";

describe("normalize", () => {
  it("un progetto vuoto diventa il groove di partenza", () => {
    const p = normalize({});
    expect(p.bpm).toBe(122);
    expect(p.patterns.A.drums.kick.filter(Boolean)).toHaveLength(4);
  });

  it("un progetto della versione 1 (una battuta) diventa il pattern A", () => {
    const p = normalize({ drums: { kick: [true, false, false, false, true] }, bass: [33] });
    expect(p.version).toBe(2);
    expect(p.patterns.A.drums.kick.slice(0, 5)).toEqual([true, false, false, false, true]);
    expect(p.patterns.A.bass[0]).toBe(33);
  });

  it("i progetti di prima: tutto al master, bus nascosti, niente lunghezze né velocity", () => {
    const p = normalize({ version: 2, bpm: 128, mixer: { kick: { volume: 0.9 } } });
    expect(p.mixer.kick.out).toBe("master");
    expect(Object.values(p.buses).some((b) => b.shown)).toBe(false);
    expect(p.patterns.A.len).toBeUndefined();
    expect(p.patterns.A.vel).toBeUndefined();
    expect(patBars(p.patterns.A)).toBe(1);
  });

  it("valori fuori scala tornano dentro", () => {
    const p = normalize({ version: 2, bpm: 999, swing: -3, volAuto: { lead: [2, -1, null] }, automation: { master: [5] } });
    expect(p.bpm).toBe(200);
    expect(p.swing).toBe(0);
    expect(p.volAuto?.lead?.slice(0, 3)).toEqual([1, 0, null]);
    expect(p.automation.master?.[0]).toBe(1);
  });

  it("i progetti nuovi mandano la batteria nel bus Drums", () => {
    const p = starterProject();
    expect(p.mixer.kick.out).toBe("bus1");
    expect(p.buses.bus1).toMatchObject({ name: "Drums", shown: true, volume: BUS_UNITY });
    expect(p.mixer.bass.out).toBe("master");
  });
});

describe("lunghezza delle note", () => {
  it("una nota lunga si ferma prima della nota dopo e a fine battuta", () => {
    const p = normalize({ version: 2, patterns: { A: { bass: [36, null, null, null, 38], len: { b0: 8, b4: 99 } } } });
    expect(noteLen(p.patterns.A, "bass", 0, 36)).toBe(4);
    expect(noteLen(p.patterns.A, "bass", 4, 38)).toBe(STEPS - 4);
  });

  it("le chiavi senza nota spariscono; 1 step = nessuna chiave", () => {
    const p = normalize({ version: 2, patterns: { A: { lead: [[72]], len: { "l0:72": 3, "l5:60": 4 } } } });
    expect(p.patterns.A.len).toEqual({ "l0:72": 3 });
    setNoteLen(p.patterns.A, "lead", 0, 72, 1);
    expect(p.patterns.A.len).toBeUndefined();
    expect(maxLen(p.patterns.A, "lead", 0, 72)).toBe(STEPS);
  });
});

describe("velocity", () => {
  it("0.8 è il normale e non si salva; 1 è l'accento", () => {
    const p = starterProject();
    const A = p.patterns.A;
    setVel(A, "kick0", 1);
    setVel(A, "kick4", VEL_DEFAULT);
    expect(A.vel).toEqual({ kick0: 1 });
    expect(velOf(A, "kick4")).toBe(VEL_DEFAULT);
  });

  it("normalize tiene solo la velocity dove c'è un colpo", () => {
    const p = normalize({ version: 2, patterns: { A: { drums: { hat: [false, false, true] }, vel: { hat2: 0.5, hat3: 0.5, x9: 1 } } } });
    expect(p.patterns.A.vel).toEqual({ hat2: 0.5 });
  });
});

describe("pattern lunghi", () => {
  it("allungare copia le battute (con lunghezze e velocity), accorciare le toglie", () => {
    const p = normalize({ version: 2, patterns: { A: { drums: { kick: [true] }, lead: [[], [], [72]], len: { "l2:72": 3 }, vel: { kick0: 1 } } } });
    const A = p.patterns.A;
    setPatternBars(A, 2);
    expect(A.drums.kick).toHaveLength(32);
    expect(A.drums.kick[16]).toBe(true);
    expect(A.len).toEqual({ "l2:72": 3, "l18:72": 3 });
    expect(A.vel).toEqual({ kick0: 1, kick16: 1 });
    setPatternBars(A, 1);
    expect(A.drums.kick).toHaveLength(16);
    expect(A.bars).toBeUndefined();
  });

  it("nella canzone le caselle di fila suonano le battute del pattern", () => {
    const p = normalize({ version: 2, patterns: { A: { bars: 2 } }, song: ["A", "A", "A", "B", "A", "A"] });
    expect(p.song.slice(0, 6).map((_, b) => barOf(p, p.song, b))).toEqual([0, 1, 0, 0, 0, 1]);
  });

  it("si salva e si riapre uguale", () => {
    const p = normalize({ version: 2, patterns: { A: { bars: 4 } } });
    const again = normalize(JSON.parse(JSON.stringify(p)));
    expect(patBars(again.patterns.A)).toBe(4);
    expect(again.patterns.A.chords).toHaveLength(16);
  });
});

describe("canzone", () => {
  it("allungare la canzone allunga anche le corsie di automazione", () => {
    const p = normalize({ version: 2, automation: { master: [0.5] }, volAuto: { lead: [0, null, 0.8] } });
    resizeSong(p, 32);
    expect(p.song).toHaveLength(32);
    expect(p.automation.master).toHaveLength(32);
    expect(p.volAuto?.lead).toHaveLength(32);
  });
});

describe("tom e shaker nei progetti di prima", () => {
  it("righe vuote e routing come il kick", () => {
    const p = normalize({ version: 2, patterns: { A: { drums: { kick: [true] } } }, mixer: { kick: { volume: 0.9, out: "bus1" } } });
    expect(p.patterns.A.drums.tom).toHaveLength(16);
    expect(p.patterns.A.drums.shaker.some(Boolean)).toBe(false);
    expect(p.mixer.tom.out).toBe("bus1");
    expect(p.mixer.shaker.out).toBe("bus1");
  });
  it("senza routing restano sul master, come gli altri canali", () => {
    const p = normalize({ version: 2, patterns: {} , bpm: 124 });
    expect(p.mixer.tom.out).toBe("master");
  });
});

describe("Lead 2", () => {
  it("i progetti di prima hanno il Lead 2 vuoto, con suono pluck e canale al master", () => {
    const p = normalize({ version: 2, patterns: { A: { lead: [[72]] } } });
    expect(p.patterns.A.lead2.every((n) => n.length === 0)).toBe(true);
    expect(p.lead2Sound.wave).toBe("pluck");
    expect(p.mixer.lead2.out).toBe("master");
  });
  it("lunghezze e velocity del Lead 2 non si mescolano con quelle del Lead", () => {
    const p = normalize({
      version: 2,
      patterns: { A: { lead: [[72]], lead2: [[72]], len: { "l0:72": 2, "m0:72": 6 }, vel: { l0: 0.5, m0: 1, m3: 1 } } },
    });
    const a = p.patterns.A;
    expect(noteLen(a, "lead", 0, 72)).toBe(2);
    expect(noteLen(a, "lead2", 0, 72)).toBe(6);
    expect(a.vel).toEqual({ l0: 0.5, m0: 1 }); // m3: lì il Lead 2 non suona
  });
  it("il pattern con solo il Lead 2 non è vuoto, e si allunga a 2 battute", () => {
    const p = normalize({ version: 2, patterns: { B: { lead2: [[], [76]] } } });
    expect(isEmptyPattern(p.patterns.B)).toBe(false);
    setPatternBars(p.patterns.B, 2);
    expect(p.patterns.B.lead2[17]).toEqual([76]);
  });
});

describe("send verso i bus", () => {
  it("normalize tiene solo bus veri e valori tra 0 e 1; il bus che riceve un send si vede", () => {
    const p = normalize({ version: 2, mixer: { clap: { volume: 0.6, out: "bus1", sends: { bus3: 0.4, bus9: 1, bus2: 0, bus4: 7 } } } });
    expect(p.mixer.clap.sends).toEqual({ bus3: 0.4, bus4: 1 });
    expect(p.buses.bus3.shown).toBe(true);
    expect(p.mixer.kick.sends).toBeUndefined();
  });
  it("setSend scrive e toglie", () => {
    const c = { volume: 1, muted: false, out: "master" as const };
    setSend(c, "bus2", 0.333);
    expect(c).toMatchObject({ sends: { bus2: 0.33 } });
    setSend(c, "bus2", 0);
    expect(c).not.toHaveProperty("sends");
  });
});

describe("bus dentro bus", () => {
  it("un giro chiuso torna al master; il bus di arrivo si vede", () => {
    const shown = { shown: true };
    const p = normalize({
      version: 2,
      buses: { bus1: { ...shown, out: "bus2" }, bus2: { ...shown, out: "bus1" }, bus3: { ...shown, out: "bus4" }, bus4: { shown: false } },
    });
    // bus1 → bus2 → bus1: il primo che chiude il giro torna al master
    expect([p.buses.bus1.out, p.buses.bus2.out].filter(Boolean)).toHaveLength(1);
    expect(p.buses.bus3.out).toBe("bus4");
    expect(p.buses.bus4.shown).toBe(true);
  });
  it("busTargets non offre i bus che riportano indietro", () => {
    const p = normalize({ version: 2, buses: { bus1: { shown: true, out: "bus2" }, bus2: { shown: true }, bus3: { shown: true } } });
    expect(busTargets(p, "bus2")).toEqual(["bus3"]); // non bus1: bus1 esce già in bus2
    expect(busTargets(p, "bus1")).toEqual(["bus2", "bus3"]);
    expect(busTargets(p, "bus3")).toEqual(["bus1", "bus2"]);
  });
  it("un bus nascosto non esce in un altro bus", () => {
    const p = normalize({ version: 2, buses: { bus2: { shown: false, out: "bus3" }, bus3: { shown: true } } });
    expect(p.buses.bus2.out).toBeUndefined();
  });
});
