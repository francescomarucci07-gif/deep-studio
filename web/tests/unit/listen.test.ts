// Il parere in tempo reale: le regole che decidono quando avvisare, provate con misure finte.
import { describe, expect, it } from "vitest";
import { bandDb, type Frame, LISTEN, Listener } from "@/lib/daw/listen";

// un mix "normale" (come i progetti di prova dello studio) con qualche ritocco
const frame = (o: Omit<Partial<Frame>, "master"> & { master?: Partial<Frame["master"]> } = {}): Frame => ({
  kickLow: -40,
  bassLow: -55,
  limiterDb: 0,
  ...o,
  master: { low: -40, low_mid: -52, mid: -61, high_mid: -77, high: -88, ...o.master },
});
// 4 secondi di misure: un colpo di kick ogni 5 misure, in mezzo il kick si spegne
const window4s = (hit: Omit<Partial<Frame>, "master">, between: Omit<Partial<Frame>, "master"> = { kickLow: -90 }) =>
  Array.from({ length: LISTEN.window }, (_, i) => frame(i % 5 === 0 ? hit : between));

function run(frames: Frame[], l = new Listener()) {
  let issue: ReturnType<Listener["push"]> = null;
  for (const [i, f] of frames.entries()) issue = l.push(f, i * 100) ?? issue;
  return issue;
}

describe("bandDb", () => {
  it("media delle potenze nella banda", () => {
    const spec = new Float32Array(1024).fill(-100);
    spec.fill(-20, 1, 8); // le caselle da 1 a 7 (23–164 Hz a 48 kHz): quelle che toccano la banda 40–150 Hz
    expect(bandDb(spec, 48000, 40, 150)).toBeCloseTo(-20, 0);
    expect(bandDb(spec, 48000, 1000, 2000)).toBeCloseTo(-100, 0);
  });
});

describe("Listener", () => {
  it("un mix normale non dà avvisi", () => {
    expect(run(window4s({ kickLow: -40, bassLow: -55 }))).toBeNull();
  });

  it("basso forte quanto il kick nei colpi: kick e basso si pestano", () => {
    const issue = run(window4s({ kickLow: -40, bassLow: -38 }, { kickLow: -90, bassLow: -30 }));
    expect(issue?.id).toBe("kick_basso");
    expect(issue?.ask).toContain("kick e basso");
  });

  it("con il sidechain il basso si abbassa sui colpi: niente avviso", () => {
    expect(run(window4s({ kickLow: -40, bassLow: -50 }, { kickLow: -90, bassLow: -30 }))).toBeNull();
  });

  it("limiter, fango e alti", () => {
    expect(run(Array.from({ length: LISTEN.window }, () => frame({ limiterDb: 5 })))?.id).toBe("limiter");
    expect(run(Array.from({ length: LISTEN.window }, () => frame({ master: { low_mid: -45, mid: -61 } })))?.id).toBe("fango");
    expect(run(Array.from({ length: LISTEN.window }, () => frame({ master: { high_mid: -70, high: -66 } })))?.id).toBe("aspro");
  });

  it("serve una finestra piena; lo stesso avviso non torna prima della pausa; muto = mai", () => {
    const l = new Listener();
    const bad = Array.from({ length: LISTEN.window }, () => frame({ limiterDb: 6 }));
    expect(run(bad.slice(0, LISTEN.window - 1), l)).toBeNull();
    expect(l.push(bad[0], 5_000)?.id).toBe("limiter");
    expect(l.push(bad[0], 5_100)).toBeNull(); // subito dopo: no
    expect(l.push(bad[0], 5_000 + LISTEN.cooldownMs + 1)?.id).toBe("limiter");
    const muted = new Listener(() => new Set(["limiter"]));
    expect(run(bad, muted)).toBeNull();
  });

  it("con un avviso aperto misura ma non propone", () => {
    const l = new Listener();
    const bad = Array.from({ length: LISTEN.window }, () => frame({ limiterDb: 6 }));
    bad.forEach((f, i) => expect(l.push(f, i * 100, false)).toBeNull());
    expect(l.push(bad[0], 10_000)?.id).toBe("limiter");
  });
});
