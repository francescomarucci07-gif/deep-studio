"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoachChat, type Msg } from "@/components/CoachChat";
import { Knob } from "@/components/hw/Knob";
import { Engine } from "@/lib/daw/engine";
import {
  BASS_HIGH,
  BASS_LOW,
  DRUMS,
  STEPS,
  normalize,
  noteName,
  type ChannelId,
  type DrumId,
  type Project,
} from "@/lib/daw/project";
import { createClient } from "@/lib/supabase/client";

type SaveState = "salvato" | "modificato" | "salvo" | "errore";

const BASS_ROWS = Array.from({ length: BASS_HIGH - BASS_LOW + 1 }, (_, i) => BASS_HIGH - i);
const isSharp = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const two = (n: number) => String(n).padStart(2, "0");

// I pad: colore della retroilluminazione e tasto della tastiera del computer (come un controller)
const PADS: { id: ChannelId; label: string; key: string; color: string }[] = [
  { id: "kick", label: "Kick", key: "z", color: "red" },
  { id: "clap", label: "Clap", key: "x", color: "orange" },
  { id: "hat", label: "Hi-hat", key: "c", color: "yellow" },
  { id: "openhat", label: "Open hat", key: "v", color: "yellow" },
  { id: "perc", label: "Perc", key: "b", color: "teal" },
  { id: "bass", label: "Bass", key: "n", color: "green" },
];
const CHANNELS: { id: ChannelId; label: string }[] = [...DRUMS, { id: "bass", label: "Bass" }];

export function Daw({
  id,
  initialTitle,
  initialProject,
  coachMessages,
}: {
  id: string;
  initialTitle: string;
  initialProject: Project;
  coachMessages: Msg[];
}) {
  const [project, setProject] = useState(initialProject);
  const [title, setTitle] = useState(initialTitle);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rec, setRec] = useState(false);
  const [flash, setFlash] = useState<ChannelId | null>(null);
  const [save, setSave] = useState<SaveState>("salvato");
  const [undo, setUndo] = useState<{ project: Project; name: string } | null>(null);

  // il motore e la chat leggono sempre lo stato più recente, anche a metà battuta
  const projectRef = useRef(project);
  projectRef.current = project;
  const titleRef = useRef(title);
  titleRef.current = title;
  const stepRef = useRef(step);
  stepRef.current = step;
  const engineRef = useRef<Engine | null>(null);

  const engine = useCallback(() => {
    engineRef.current ??= new Engine(() => projectRef.current, setStep);
    return engineRef.current;
  }, []);

  const play = useCallback(async () => {
    const e = engine();
    if (!e.playing) await e.start();
    setPlaying(true);
  }, [engine]);
  const stop = useCallback(() => {
    engineRef.current?.stop();
    setPlaying(false);
  }, []);
  const togglePlay = useCallback(() => (engineRef.current?.playing ? stop() : void play()), [play, stop]);

  useEffect(() => () => engineRef.current?.close(), []);
  useEffect(() => {
    engineRef.current?.applyMixer();
  }, [project.mixer]);

  const update = useCallback(
    (fn: (p: Project) => void) =>
      setProject((p) => {
        const next = structuredClone(p);
        fn(next);
        return next;
      }),
    [],
  );

  // Un colpo sul pad: suona sempre; con REC acceso e Play, scrive il colpo sullo step che sta suonando
  const hitPad = useCallback(
    (c: ChannelId) => {
      void engine().preview(c, c === "bass" ? projectRef.current.bass.find((n) => n !== null) ?? BASS_LOW : undefined);
      setFlash(c);
      setTimeout(() => setFlash((f) => (f === c ? null : f)), 140);
      const s = stepRef.current;
      if (rec && engineRef.current?.playing && s >= 0 && c !== "bass") {
        update((p) => {
          p.drums[c][s] = true;
        });
      }
    },
    [engine, rec, update],
  );

  // tastiera: spazio = play/stop, Z X C V B N = pad (non mentre scrivi)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.metaKey || e.ctrlKey || e.repeat) return;
      if (e.code === "Space" && tag !== "BUTTON") {
        e.preventDefault();
        togglePlay();
        return;
      }
      const pad = PADS.find((p) => p.key === e.key.toLowerCase());
      if (pad) hitPad(pad.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, hitPad]);

  // salvataggio automatico, un attimo dopo l'ultima modifica
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("modificato");
    const t = setTimeout(async () => {
      setSave("salvo");
      const { error } = await createClient()
        .from("projects")
        .update({ title: title.trim() || "Senza titolo", bpm: project.bpm, data: project })
        .eq("id", id);
      setSave(error ? "errore" : "salvato");
    }, 1200);
    return () => clearTimeout(t);
  }, [project, title, id]);

  const toggleDrum = (d: DrumId, i: number) => {
    const turningOn = !project.drums[d][i];
    update((p) => {
      p.drums[d][i] = turningOn;
    });
    if (turningOn && !playing) void engine().preview(d);
  };

  const setBass = (i: number, note: number) => {
    const removing = project.bass[i] === note;
    update((p) => {
      p.bass[i] = removing ? null : note;
    });
    if (!removing && !playing) void engine().preview("bass", note);
  };

  const setChannel = (c: ChannelId, patch: Partial<Project["mixer"][ChannelId]>) =>
    update((p) => {
      p.mixer[c] = { ...p.mixer[c], ...patch };
    });

  // il coach ha scritto un pattern: lo applico e tengo il precedente per "Annulla"
  const applyFromCoach = (data: unknown) => {
    const d = data as { pattern?: unknown; name?: string };
    if (!d?.pattern) return;
    setUndo({ project: projectRef.current, name: d.name ?? "pattern" });
    setProject(normalize(d.pattern));
    void play();
    return `Pattern scritto nello studio: ${d.name ?? "nuovo pattern"}`;
  };

  const hitNow = (c: ChannelId) =>
    flash === c || (playing && step >= 0 && (c === "bass" ? project.bass[step] !== null : project.drums[c][step]));

  return (
    <div className="console">
      {/* ---- pannello superiore: marchio, display, trasporto, manopole ---- */}
      <section className="hw-panel hw-top" aria-label="Trasporto">
        <div className="hw-brand">
          <Link href="/studio" className="hw-brand-name">
            DEEP STUDIO
          </Link>
          <span className="hw-brand-model">DS-16 · Groovebox</span>
        </div>

        <div className="hw-lcd">
          <label className="hw-visually-hidden" htmlFor="titolo">
            Titolo del progetto
          </label>
          <input id="titolo" className="hw-lcd-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <div className="hw-lcd-row">
            <span className="hw-lcd-big">{project.bpm}</span>
            <span className="hw-lcd-unit">BPM</span>
            <span className="hw-lcd-small">
              STEP {step >= 0 ? two(step + 1) : "--"}/16
              <br />
              {save === "errore" ? "NON SALVATO" : save === "salvato" ? "SALVATO" : "SALVO…"}
            </span>
          </div>
          <div className="hw-lcd-dots" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} data-on={i === step} />
            ))}
          </div>
        </div>

        <div className="hw-transport">
          <button type="button" className="hw-btn hw-btn--play" aria-pressed={playing} onClick={() => void play()}>
            <span className="hw-btn-led" />▶ Play
          </button>
          <button type="button" className="hw-btn" onClick={stop}>
            <span className="hw-btn-led" />■ Stop
          </button>
          <button type="button" className="hw-btn hw-btn--rec" aria-pressed={rec} onClick={() => setRec(!rec)}>
            <span className="hw-btn-led" />● Rec
          </button>
        </div>

        <div className="hw-knobs">
          <Knob
            label="Tempo"
            value={project.bpm}
            min={60}
            max={200}
            step={1}
            defaultValue={122}
            display={`${project.bpm} BPM`}
            onChange={(v) =>
              update((p) => {
                p.bpm = v;
              })
            }
          />
          <Knob
            label="Swing"
            value={project.swing}
            min={0}
            max={0.5}
            defaultValue={0.1}
            display={pct(project.swing)}
            onChange={(v) =>
              update((p) => {
                p.swing = v;
              })
            }
          />
          <button
            type="button"
            className="hw-switch"
            aria-pressed={project.sidechain}
            onClick={() =>
              update((p) => {
                p.sidechain = !p.sidechain;
              })
            }
          >
            <span className="hw-switch-led" />
            <span className="hw-switch-cap" />
            <span className="hw-label">Sidechain</span>
          </button>
        </div>
      </section>

      {undo && (
        <div className="hw-toast" role="status">
          <span>
            Il coach ha scritto <strong>“{undo.name}”</strong>. Modificalo come vuoi.
          </span>
          <button
            type="button"
            className="hw-btn hw-btn--small"
            onClick={() => {
              setProject(undo.project);
              setUndo(null);
            }}
          >
            Annulla
          </button>
          <button type="button" className="hw-btn hw-btn--small" onClick={() => setUndo(null)}>
            Tieni
          </button>
        </div>
      )}

      <div className="console-body">
        <div className="console-main">
          {/* ---- drum pad ---- */}
          <section className="hw-panel hw-pads-panel" aria-label="Drum pad">
            <h2 className="hw-title">Pads</h2>
            <div className="hw-pads">
              {PADS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="hw-pad"
                  data-color={p.color}
                  data-hit={hitNow(p.id)}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    hitPad(p.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") hitPad(p.id);
                  }}
                >
                  <span className="hw-pad-name">{p.label}</span>
                  <span className="hw-pad-key">{p.key.toUpperCase()}</span>
                </button>
              ))}
            </div>
            <p className="hw-hint">
              Tocca i pad o usa Z X C V B N. Con <strong>Rec</strong> e <strong>Play</strong> accesi i colpi si registrano nel
              pattern.
            </p>
          </section>

          {/* ---- step sequencer, colori a gruppi di 4 come una TR-808 ---- */}
          <section className="hw-panel hw-seq" aria-label="Step sequencer">
            <h2 className="hw-title">Step sequencer</h2>
            <div className="hw-seq-grid">
              {DRUMS.map(({ id: d, label }) => (
                <div key={d} className="hw-seq-row">
                  <button type="button" className="hw-seq-name" onClick={() => void engine().preview(d)}>
                    {label}
                  </button>
                  {project.drums[d].map((on, i) => (
                    <button
                      key={i}
                      type="button"
                      className="hw-key"
                      data-group={Math.floor(i / 4)}
                      aria-pressed={on}
                      aria-label={`${label} step ${i + 1}`}
                      data-now={i === step}
                      onClick={() => toggleDrum(d, i)}
                    >
                      <span className="hw-key-led" />
                    </button>
                  ))}
                </div>
              ))}
              <div className="hw-seq-row">
                <button type="button" className="hw-seq-name" onClick={() => void engine().preview("bass")}>
                  Bass
                </button>
                {project.bass.map((n, i) => (
                  <span key={i} className="hw-key hw-key--note" data-group={Math.floor(i / 4)} data-on={n !== null} data-now={i === step}>
                    {n !== null ? noteName(n).replace(/\d$/, "") : ""}
                  </span>
                ))}
              </div>
              <div className="hw-seq-row hw-seq-numbers" aria-hidden="true">
                <span />
                {Array.from({ length: STEPS }, (_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
            </div>
          </section>

          {/* ---- mixer ---- */}
          <section className="hw-panel hw-mixer" aria-label="Mixer">
            <h2 className="hw-title">Mixer</h2>
            <div className="hw-strips">
              {CHANNELS.map(({ id: c, label }) => (
                <div key={c} className="hw-strip">
                  <span className="hw-meter" data-hit={hitNow(c) && !project.mixer[c].muted} aria-hidden="true" />
                  <input
                    className="hw-fader"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={project.mixer[c].volume}
                    aria-label={`Volume ${label}`}
                    onChange={(e) => setChannel(c, { volume: Number(e.target.value) })}
                  />
                  <span className="hw-value">{pct(project.mixer[c].volume)}</span>
                  <button
                    type="button"
                    className="hw-btn hw-btn--small hw-btn--mute"
                    aria-pressed={project.mixer[c].muted}
                    aria-label={`Mute ${label}`}
                    onClick={() => setChannel(c, { muted: !project.mixer[c].muted })}
                  >
                    <span className="hw-btn-led" />M
                  </button>
                  <span className="hw-strip-name">{label}</span>
                </div>
              ))}
              <div className="hw-strip hw-strip--synth">
                <span className="hw-label">Bass synth</span>
                <div className="hw-seg">
                  {(["sawtooth", "square"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      className="hw-btn hw-btn--small"
                      aria-pressed={project.bassSound.wave === w}
                      onClick={() =>
                        update((p) => {
                          p.bassSound.wave = w;
                        })
                      }
                    >
                      <span className="hw-btn-led" />
                      {w === "sawtooth" ? "Saw" : "Sqr"}
                    </button>
                  ))}
                </div>
                <Knob
                  label="Cutoff"
                  value={project.bassSound.cutoff}
                  min={150}
                  max={4000}
                  step={10}
                  defaultValue={700}
                  display={`${Math.round(project.bassSound.cutoff)} Hz`}
                  onChange={(v) =>
                    update((p) => {
                      p.bassSound.cutoff = v;
                    })
                  }
                />
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-pressed={project.bassSound.length === "lunga"}
                  onClick={() =>
                    update((p) => {
                      p.bassSound.length = p.bassSound.length === "lunga" ? "corta" : "lunga";
                    })
                  }
                >
                  <span className="hw-btn-led" />
                  808 long
                </button>
              </div>
            </div>
          </section>

          {/* ---- piano roll del basso ---- */}
          <section className="hw-panel hw-roll-panel" aria-label="Piano roll della bassline">
            <h2 className="hw-title">Piano roll · Bass</h2>
            <div className="daw-roll">
              {BASS_ROWS.map((note) => (
                <div key={note} className="daw-roll-row" data-sharp={isSharp(note)}>
                  <button type="button" className="daw-key" onClick={() => void engine().preview("bass", note)}>
                    {noteName(note)}
                  </button>
                  {Array.from({ length: STEPS }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      className="daw-cell"
                      aria-pressed={project.bass[i] === note}
                      aria-label={`${noteName(note)} step ${i + 1}`}
                      data-now={i === step}
                      data-beat={i % 4 === 0}
                      onClick={() => setBass(i, note)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>

        <CoachChat
          compact
          endpoint="/api/coach/crea"
          payload={() => ({ projectId: id, project: projectRef.current, title: titleRef.current })}
          initial={coachMessages}
          onData={applyFromCoach}
          suggestions={["Creami un beat deep house", "Make me a trap beat", "Cosa aggiungo adesso?", "Rendi la bassline più interessante"]}
          intro="Sono qui con te. Chiedimi di creare un beat (lo scrivo io nello studio e ti spiego come l'ho fatto) oppure fallo tu e ti do consigli mentre lo cambi."
        />
      </div>
    </div>
  );
}
