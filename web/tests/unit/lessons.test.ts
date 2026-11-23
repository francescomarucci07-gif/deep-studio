// Le lezioni: ogni passo si controlla da solo; su un pattern vuoto nessun passo deve risultare già fatto.
import { describe, expect, it } from "vitest";
import { LESSONS, type LessonCtx } from "@/lib/daw/lessons";
import { normalize, starterProject } from "@/lib/daw/project";

const ctx = (project = normalize({ version: 2, swing: 0, sidechain: false }), extra: Partial<LessonCtx> = {}): LessonCtx => ({
  project: { ...project, patterns: { ...project.patterns, A: normalize({ version: 2 }).patterns.B } },
  editing: "A",
  playing: false,
  songMode: false,
  exported: false,
  ...extra,
});

describe("lezioni", () => {
  it("su un pattern vuoto, con lo studio fermo, nessun passo è già fatto", () => {
    const c = ctx();
    c.project.mixer.chords.out = "master";
    c.project.mixer.lead.out = "master";
    for (const l of LESSONS) for (const s of l.steps) expect(s.done(c), `${l.title}: ${s.text}`).toBe(false);
  });

  it("il primo groove: kick sui quarti, poi clap, hat, Play e swing", () => {
    const steps = LESSONS[0].steps;
    const c = ctx();
    const A = c.project.patterns.A;
    for (const i of [0, 4, 8, 12]) A.drums.kick[i] = true;
    expect(steps[0].done(c)).toBe(true);
    for (const i of [4, 12]) A.drums.clap[i] = true;
    expect(steps[1].done(c)).toBe(true);
    for (const i of [2, 6, 10, 14]) A.drums.hat[i] = true;
    expect(steps[2].done(c)).toBe(true);
    expect(steps[3].done({ ...c, playing: true })).toBe(true);
    expect(steps[4].done({ ...c, project: { ...c.project, swing: 0.1 } })).toBe(false); // il 10% di partenza non basta
    expect(steps[4].done({ ...c, project: { ...c.project, swing: 0.2 } })).toBe(true);
  });

  it("l'ultima lezione chiede un gruppo Synth vero, non il bus Drums di partenza", () => {
    const step = LESSONS[4].steps[2];
    const p = starterProject();
    expect(step.done({ ...ctx(p), project: p })).toBe(false);
    p.mixer.chords.out = "bus2";
    p.mixer.lead.out = "bus2";
    expect(step.done({ ...ctx(p), project: p })).toBe(true);
  });

  it("il mixer e i bus: mute e fader del bus Drums, bus nuovo, Chords e Lead dentro, plugin, Send del clap", () => {
    const steps = LESSONS[5].steps;
    const p = starterProject(); // la batteria nel bus Drums (bus1)
    const c = (extra: Partial<LessonCtx> = {}): LessonCtx => ({ project: p, editing: "A", playing: true, songMode: false, exported: false, ...extra });
    expect(steps[0].done(c())).toBe(false);
    p.buses.bus1.muted = true;
    expect(steps[0].done(c({ playing: false }))).toBe(false); // serve il Play, per sentirlo
    expect(steps[0].done(c())).toBe(true);
    expect(steps[1].done(c())).toBe(false); // ancora in mute
    p.buses.bus1.muted = false;
    expect(steps[1].done(c())).toBe(false); // fader a 0 dB
    p.buses.bus1.volume = 0.6;
    expect(steps[1].done(c())).toBe(true);
    expect(steps[2].done(c())).toBe(false);
    p.buses.bus2.shown = true;
    expect(steps[2].done(c())).toBe(true);
    p.mixer.chords.out = "bus2";
    expect(steps[3].done(c())).toBe(false); // manca il Lead
    p.mixer.lead.out = "bus2";
    expect(steps[3].done(c())).toBe(true);
    expect(steps[4].done(c())).toBe(false);
    p.inserts.bus2[0] = { type: "reverb", on: true, params: {} } as never;
    expect(steps[4].done(c())).toBe(true);
    expect(steps[5].done(c())).toBe(false);
    p.mixer.clap.sends = { bus2: 0.3 };
    expect(steps[5].done(c())).toBe(true);
  });
});
