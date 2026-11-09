"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoachChat, type Msg } from "@/components/CoachChat";
import { Knob } from "@/components/hw/Knob";
import { VersionsPanel } from "@/components/hw/VersionsPanel";
import { Engine } from "@/lib/daw/engine";
import {
  BASS_HIGH,
  BASS_LOW,
  DRUMS,
  SLOTS,
  STEPS,
  emptyPattern,
  isEmptyPattern,
  normalize,
  noteName,
  songLength,
  type ChannelId,
  type DrumId,
  type Project,
  type Slot,
} from "@/lib/daw/project";
import { AUTO_EVERY_MS, loadVersion, saveVersion, type Version } from "@/lib/daw/versions";
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
  const [editing, setEditing] = useState<Slot>("A"); // il pattern che vedi e modifichi
  const [songMode, setSongMode] = useState(false);
  const [bar, setBar] = useState(-1);
  const [playingSlot, setPlayingSlot] = useState<Slot | null>(null);
  const pat = project.patterns[editing];
  const [showVersions, setShowVersions] = useState(false);
  const [versionsTick, setVersionsTick] = useState(0);

  // il motore e la chat leggono sempre lo stato più recente, anche a metà battuta
  const projectRef = useRef(project);
  projectRef.current = project;
  const titleRef = useRef(title);
  titleRef.current = title;
  const stepRef = useRef(step);
  stepRef.current = step;
  const playbackRef = useRef({ song: songMode, editing });
  playbackRef.current = { song: songMode, editing };
  const playingSlotRef = useRef(playingSlot);
  playingSlotRef.current = playingSlot;
  const engineRef = useRef<Engine | null>(null);

  const engine = useCallback(() => {
    engineRef.current ??= new Engine(
      () => projectRef.current,
      () => playbackRef.current,
      (s, b, slot) => {
        setStep(s);
        setBar(b);
        setPlayingSlot(slot);
      },
    );
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
      const cur = projectRef.current.patterns[playbackRef.current.editing];
      void engine().preview(c, c === "bass" ? cur.bass.find((n) => n !== null) ?? BASS_LOW : undefined);
      setFlash(c);
      setTimeout(() => setFlash((f) => (f === c ? null : f)), 140);
      const s = stepRef.current;
      // in modalità song registra nel pattern che sta suonando, altrimenti in quello che modifichi
      const slot = playbackRef.current.song ? playingSlotRef.current : playbackRef.current.editing;
      if (rec && engineRef.current?.playing && s >= 0 && c !== "bass" && slot) {
        update((p) => {
          p.patterns[slot].drums[c][s] = true;
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

  // una "fotografia" nella cronologia (la lista nel pannello si aggiorna)
  const snapshot = useCallback(
    async (label: string, data = projectRef.current, t = titleRef.current) => {
      const ok = await saveVersion(id, t, data, label);
      if (ok) setVersionsTick((n) => n + 1);
      return ok;
    },
    [id],
  );

  // salvataggio automatico, un attimo dopo l'ultima modifica. Alla prima modifica salvo anche
  // com'era il progetto all'apertura, poi una fotografia ogni 10 minuti di lavoro.
  const first = useRef(true);
  const lastSnapshot = useRef(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("modificato");
    const t = setTimeout(async () => {
      setSave("salvo");
      if (lastSnapshot.current === 0) {
        lastSnapshot.current = Date.now();
        await snapshot("Com'era all'apertura", initialProject, initialTitle);
      } else if (Date.now() - lastSnapshot.current > AUTO_EVERY_MS) {
        lastSnapshot.current = Date.now();
        await snapshot("Automatica");
      }
      const { error } = await createClient()
        .from("projects")
        .update({ title: title.trim() || "Senza titolo", bpm: project.bpm, data: project })
        .eq("id", id);
      setSave(error ? "errore" : "salvato");
    }, 1200);
    return () => clearTimeout(t);
  }, [project, title, id, snapshot, initialProject, initialTitle]);

  const restore = async (v: Version) => {
    const saved = await loadVersion(v.id);
    if (!saved) return;
    await snapshot(`Prima del ripristino di “${v.label}”`);
    setUndo(null);
    setProject(normalize(saved.data));
    setTitle(saved.title);
  };

  const toggleDrum = (d: DrumId, i: number) => {
    const turningOn = !pat.drums[d][i];
    update((p) => {
      p.patterns[editing].drums[d][i] = turningOn;
    });
    if (turningOn && !playing) void engine().preview(d);
  };

  const setBass = (i: number, note: number) => {
    const removing = pat.bass[i] === note;
    update((p) => {
      p.patterns[editing].bass[i] = removing ? null : note;
    });
    if (!removing && !playing) void engine().preview("bass", note);
  };

  const setChannel = (c: ChannelId, patch: Partial<Project["mixer"][ChannelId]>) =>
    update((p) => {
      p.mixer[c] = { ...p.mixer[c], ...patch };
    });

  // il coach ha scritto pattern e/o canzone: li applico e tengo il progetto di prima per "Annulla"
  const applyFromCoach = (data: unknown) => {
    const d = data as { project?: unknown; name?: string; focus?: Slot; song?: boolean };
    if (!d?.project) return;
    setUndo({ project: projectRef.current, name: d.name || "pattern" });
    void snapshot(`Prima del coach: ${d.name || "modifica"}`);
    setProject(normalize(d.project));
    if (d.focus && SLOTS.includes(d.focus)) setEditing(d.focus);
    if (d.song) setSongMode(true);
    void play();
    return `Scritto nello studio: ${d.name || "nuovo pattern"}`;
  };

  // un pattern nuovo da uno vuoto: copia quello che stai modificando nel primo slot libero
  const firstFree = SLOTS.find((s) => s !== editing && isEmptyPattern(project.patterns[s]));
  const duplicate = () => {
    if (!firstFree) return;
    update((p) => {
      p.patterns[firstFree] = structuredClone(p.patterns[editing]);
    });
    setEditing(firstFree);
  };
  const clearPattern = () => {
    if (isEmptyPattern(pat) || !window.confirm(`Svuoto il pattern ${editing}?`)) return;
    update((p) => {
      p.patterns[editing] = emptyPattern();
    });
  };
  const cycleBar = (b: number) =>
    update((p) => {
      const order: (Slot | null)[] = [...SLOTS, null];
      p.song[b] = order[(order.indexOf(p.song[b]) + 1) % order.length];
    });

  // cosa suona adesso (per accendere pad e meter): il pattern in riproduzione, non quello in modifica
  const sounding = playing && playingSlot ? project.patterns[playingSlot] : null;
  const hitNow = (c: ChannelId) =>
    flash === c ||
    (sounding !== null && step >= 0 && (c === "bass" ? sounding.bass[step] !== null : sounding.drums[c][step]));

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
              {songMode ? `SONG · BAR ${bar >= 0 ? two(bar + 1) : "--"}/${two(songLength(project))}` : `PATTERN ${editing}`}
              {" · "}
              {playingSlot ? `PAT ${playingSlot}` : "PAT -"}
              <br />
              STEP {step >= 0 ? two(step + 1) : "--"}/16 ·{" "}
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
          <button type="button" className="hw-btn" aria-pressed={showVersions} onClick={() => setShowVersions(!showVersions)}>
            <span className="hw-btn-led" />↺ Versioni
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

      {showVersions && (
        <VersionsPanel
          projectId={id}
          refresh={versionsTick}
          onSave={async (label) => {
            await snapshot(label);
          }}
          onRestore={restore}
          onClose={() => setShowVersions(false)}
        />
      )}

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
            <div className="hw-seq-head">
              <h2 className="hw-title">Step sequencer · Pattern {editing}</h2>
              <div className="hw-patterns" role="group" aria-label="Pattern da modificare">
                {SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="hw-btn hw-btn--small hw-btn--slot"
                    aria-pressed={editing === s}
                    data-playing={playingSlot === s}
                    data-empty={isEmptyPattern(project.patterns[s])}
                    onClick={() => setEditing(s)}
                  >
                    <span className="hw-btn-led" />
                    {s}
                  </button>
                ))}
                <button type="button" className="hw-btn hw-btn--small" disabled={!firstFree} onClick={duplicate}>
                  Duplica{firstFree ? ` → ${firstFree}` : ""}
                </button>
                <button type="button" className="hw-btn hw-btn--small" onClick={clearPattern}>
                  Svuota
                </button>
              </div>
            </div>
            <div className="hw-seq-grid">
              {DRUMS.map(({ id: d, label }) => (
                <div key={d} className="hw-seq-row">
                  <button type="button" className="hw-seq-name" onClick={() => void engine().preview(d)}>
                    {label}
                  </button>
                  {pat.drums[d].map((on, i) => (
                    <button
                      key={i}
                      type="button"
                      className="hw-key"
                      data-group={Math.floor(i / 4)}
                      aria-pressed={on}
                      aria-label={`${label} step ${i + 1}`}
                      data-now={i === step && playingSlot === editing}
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
                {pat.bass.map((n, i) => (
                  <span
                    key={i}
                    className="hw-key hw-key--note"
                    data-group={Math.floor(i / 4)}
                    data-on={n !== null}
                    data-now={i === step && playingSlot === editing}
                  >
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

          {/* ---- arrangiamento: quale pattern suona in ogni battuta ---- */}
          <section className="hw-panel hw-song" aria-label="Arrangiamento">
            <div className="hw-seq-head">
              <h2 className="hw-title">Song · {songLength(project)} battute</h2>
              <div className="hw-patterns" role="group" aria-label="Modalità">
                <button type="button" className="hw-btn hw-btn--small" aria-pressed={!songMode} onClick={() => setSongMode(false)}>
                  <span className="hw-btn-led" />
                  Pattern
                </button>
                <button type="button" className="hw-btn hw-btn--small" aria-pressed={songMode} onClick={() => setSongMode(true)}>
                  <span className="hw-btn-led" />
                  Song
                </button>
              </div>
            </div>
            <div className="hw-song-bars">
              {project.song.map((s, b) => (
                <button
                  key={b}
                  type="button"
                  className="hw-bar"
                  data-slot={s ?? "none"}
                  data-now={songMode && playing && b === bar}
                  aria-label={`Battuta ${b + 1}: ${s ? `pattern ${s}` : "vuota"}. Clic per cambiare`}
                  onClick={() => cycleBar(b)}
                >
                  <span className="hw-bar-num">{b + 1}</span>
                  <span className="hw-bar-slot">{s ?? "–"}</span>
                </button>
              ))}
            </div>
            <p className="hw-hint">
              Clic su una battuta: A → B → C → D → vuota. In <strong>Song</strong> suona la canzone dall&apos;inizio; in{" "}
              <strong>Pattern</strong> solo il pattern che stai modificando, in loop.
            </p>
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
                      aria-pressed={pat.bass[i] === note}
                      aria-label={`${noteName(note)} step ${i + 1}`}
                      data-now={i === step && playingSlot === editing}
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
          payload={() => ({
            projectId: id,
            project: projectRef.current,
            title: titleRef.current,
            editing: playbackRef.current.editing,
          })}
          initial={coachMessages}
          onData={applyFromCoach}
          suggestions={[
            "Fammi una traccia deep house con intro, break e drop",
            "Make me a trap beat",
            "Crea una variazione nel pattern B",
            "Cosa aggiungo adesso?",
          ]}
          intro="Sono qui con te. Chiedimi di creare un beat (lo scrivo io nello studio e ti spiego come l'ho fatto) oppure fallo tu e ti do consigli mentre lo cambi."
        />
      </div>
    </div>
  );
}
