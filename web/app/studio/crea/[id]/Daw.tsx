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
  BEATS,
  CHORD_TYPES,
  DRUMS,
  LEAD_HIGH,
  LEAD_LOW,
  LEAD_WAVES,
  NOTE_NAMES,
  SLOTS,
  STEPS,
  emptyPattern,
  isEmptyPattern,
  normalize,
  noteName,
  songLength,
  chordName,
  type ChannelId,
  type ChordType,
  type DrumId,
  type Project,
  type Slot,
} from "@/lib/daw/project";
import { encodeWav, renderAudio } from "@/lib/daw/render";
import { AUTO_EVERY_MS, loadVersion, saveVersion, type Version } from "@/lib/daw/versions";
import { createClient } from "@/lib/supabase/client";

type SaveState = "salvato" | "modificato" | "salvo" | "errore";

// righe del piano roll, dall'alto in basso, per ogni strumento con le note
const rows = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
const ROLLS = {
  bass: { label: "Bass", rows: rows(BASS_LOW, BASS_HIGH) },
  lead: { label: "Lead", rows: rows(LEAD_LOW, LEAD_HIGH) },
} as const;
type RollId = keyof typeof ROLLS;
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
  { id: "chords", label: "Chord", key: "m", color: "purple" },
  { id: "lead", label: "Lead", key: ",", color: "blue" },
];
const CHANNELS: { id: ChannelId; label: string }[] = [
  ...DRUMS,
  { id: "bass", label: "Bass" },
  { id: "chords", label: "Chords" },
  { id: "lead", label: "Lead" },
];
const isDrum = (c: ChannelId): c is DrumId => c !== "bass" && c !== "chords" && c !== "lead";
const WAVE_LABEL: Record<(typeof LEAD_WAVES)[number], string> = { sawtooth: "Saw", square: "Sqr", triangle: "Tri" };
const TYPE_LABEL: Record<ChordType, string> = {
  min: "minore",
  maj: "maggiore",
  min7: "m7",
  maj7: "maj7",
  dom7: "7",
  min9: "m9",
  sus2: "sus2",
  sus4: "sus4",
};

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
  const [roll, setRoll] = useState<RollId>("bass");
  const [exporting, setExporting] = useState<"no" | "sì" | "errore">("no");
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
  }, [project.mixer, project.bpm, project.leadSound.delay]);

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
      void engine().preview(c, {
        note: c === "lead" ? (cur.lead.find((n) => n !== null) ?? 69) : (cur.bass.find((n) => n !== null) ?? BASS_LOW),
        chord: cur.chords.find((x) => x !== null) ?? undefined,
      });
      setFlash(c);
      setTimeout(() => setFlash((f) => (f === c ? null : f)), 140);
      const s = stepRef.current;
      // in modalità song registra nel pattern che sta suonando, altrimenti in quello che modifichi
      const slot = playbackRef.current.song ? playingSlotRef.current : playbackRef.current.editing;
      if (rec && engineRef.current?.playing && s >= 0 && isDrum(c) && slot) {
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

  // una nota nel piano roll (basso o lead): clic su una nota accesa = la spegne
  const setNote = (roll: RollId, i: number, note: number) => {
    const removing = pat[roll][i] === note;
    update((p) => {
      p.patterns[editing][roll][i] = removing ? null : note;
    });
    if (!removing && !playing) void engine().preview(roll, { note });
  };

  // accordo del battito b: nota "" = nessun accordo
  const setChord = (b: number, root: string, type?: ChordType) => {
    const prev = pat.chords[b];
    const next = root === "" ? null : { root: Number(root), type: type ?? prev?.type ?? "min7" };
    update((p) => {
      p.patterns[editing].chords[b] = next;
    });
    if (next && !playing) void engine().preview("chords", { chord: next });
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

  // Export WAV: in Song tutta la canzone, in Pattern 4 giri del loop che stai modificando
  const exportWav = async () => {
    setExporting("sì");
    try {
      const buf = await renderAudio(projectRef.current, songMode ? { song: true } : { song: false, slot: editing });
      const url = URL.createObjectURL(encodeWav(buf));
      const a = document.createElement("a");
      const name = (titleRef.current.trim() || "deep-studio").replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "deep-studio";
      a.href = url;
      a.download = `${name}${songMode ? "" : ` - pattern ${editing}`}.wav`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setExporting("no");
    } catch (e) {
      console.error("export", e);
      setExporting("errore");
    }
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
    (sounding !== null &&
      step >= 0 &&
      (c === "bass" || c === "lead"
        ? sounding[c][step] !== null
        : c === "chords"
          ? step % 4 === 0 && sounding.chords[step / 4] !== null
          : sounding.drums[c][step]));

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
          <button
            type="button"
            className="hw-btn"
            aria-pressed={exporting === "sì"}
            disabled={exporting === "sì"}
            title={songMode ? "Esporta tutta la canzone" : `Esporta 4 giri del pattern ${editing}`}
            onClick={() => void exportWav()}
          >
            <span className="hw-btn-led" />
            {exporting === "sì" ? "Esporto…" : exporting === "errore" ? "Riprova WAV" : "⤓ WAV"}
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
              <div className="hw-seq-row">
                <button type="button" className="hw-seq-name" onClick={() => setRoll("lead")}>
                  Lead
                </button>
                {pat.lead.map((n, i) => (
                  <span
                    key={i}
                    className="hw-key hw-key--note hw-key--lead"
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

          {/* ---- accordi del pattern: uno per battito ---- */}
          <section className="hw-panel hw-chords" aria-label="Accordi">
            <div className="hw-seq-head">
              <h2 className="hw-title">Accordi · Pattern {editing}</h2>
              <span className="hw-value">
                {pat.chords.some(Boolean) ? pat.chords.map((c) => (c ? chordName(c) : "·")).join("  ") : "nessun accordo"}
              </span>
            </div>
            <div className="hw-chord-row">
              {Array.from({ length: BEATS }, (_, b) => {
                const c = pat.chords[b];
                return (
                  <div key={b} className="hw-chord" data-on={c !== null} data-now={playingSlot === editing && Math.floor(step / 4) === b}>
                    <span className="hw-label">Battito {b + 1}</span>
                    <span className="hw-chord-name">{c ? chordName(c) : "–"}</span>
                    <label className="hw-visually-hidden" htmlFor={`nota-${b}`}>
                      Nota dell&apos;accordo, battito {b + 1}
                    </label>
                    <select
                      id={`nota-${b}`}
                      className="hw-select"
                      value={c ? String(c.root) : ""}
                      onChange={(e) => setChord(b, e.target.value)}
                    >
                      <option value="">{b === 0 ? "nessuno" : "tiene il prima"}</option>
                      {NOTE_NAMES.map((n, i) => (
                        <option key={n} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <label className="hw-visually-hidden" htmlFor={`tipo-${b}`}>
                      Tipo di accordo, battito {b + 1}
                    </label>
                    <select
                      id={`tipo-${b}`}
                      className="hw-select"
                      value={c?.type ?? "min7"}
                      disabled={!c}
                      onChange={(e) => c && setChord(b, String(c.root), e.target.value as ChordType)}
                    >
                      {CHORD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <p className="hw-hint">
              Un accordo per battito. In <strong>Pad</strong> un accordo tiene finché non arriva il successivo; in{" "}
              <strong>Stab</strong> è un colpo corto sul battito. Per la deep house prova La m7 → Fa maj7 → Do maj7 → Sol.
            </p>
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
              <div className="hw-strip hw-strip--synth hw-strip--chords hw-strip--lead">
                <span className="hw-label">Lead synth</span>
                <div className="hw-seg">
                  {LEAD_WAVES.map((w) => (
                    <button
                      key={w}
                      type="button"
                      className="hw-btn hw-btn--small"
                      aria-pressed={project.leadSound.wave === w}
                      onClick={() =>
                        update((p) => {
                          p.leadSound.wave = w;
                        })
                      }
                    >
                      <span className="hw-btn-led" />
                      {WAVE_LABEL[w]}
                    </button>
                  ))}
                </div>
                <div className="hw-seg">
                  <Knob
                    size={44}
                    label="Cutoff"
                    value={project.leadSound.cutoff}
                    min={300}
                    max={9000}
                    step={10}
                    defaultValue={2600}
                    display={`${Math.round(project.leadSound.cutoff)} Hz`}
                    onChange={(v) =>
                      update((p) => {
                        p.leadSound.cutoff = v;
                      })
                    }
                  />
                  <Knob
                    size={44}
                    label="Delay"
                    value={project.leadSound.delay}
                    min={0}
                    max={0.6}
                    defaultValue={0.3}
                    display={pct(project.leadSound.delay / 0.6)}
                    onChange={(v) =>
                      update((p) => {
                        p.leadSound.delay = v;
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-pressed={project.leadSound.length === "lunga"}
                  onClick={() =>
                    update((p) => {
                      p.leadSound.length = p.leadSound.length === "lunga" ? "corta" : "lunga";
                    })
                  }
                >
                  <span className="hw-btn-led" />
                  Legato
                </button>
              </div>
              <div className="hw-strip hw-strip--synth hw-strip--chords">
                <span className="hw-label">Chord synth</span>
                <div className="hw-seg">
                  {(["pad", "stab"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      className="hw-btn hw-btn--small"
                      aria-pressed={project.chordSound.style === st}
                      onClick={() =>
                        update((p) => {
                          p.chordSound.style = st;
                        })
                      }
                    >
                      <span className="hw-btn-led" />
                      {st === "pad" ? "Pad" : "Stab"}
                    </button>
                  ))}
                </div>
                <Knob
                  label="Cutoff"
                  value={project.chordSound.cutoff}
                  min={300}
                  max={8000}
                  step={10}
                  defaultValue={1800}
                  display={`${Math.round(project.chordSound.cutoff)} Hz`}
                  onChange={(v) =>
                    update((p) => {
                      p.chordSound.cutoff = v;
                    })
                  }
                />
              </div>
            </div>
          </section>

          {/* ---- piano roll: basso o melodia ---- */}
          <section className="hw-panel hw-roll-panel" aria-label={`Piano roll · ${ROLLS[roll].label}`}>
            <div className="hw-seq-head">
              <h2 className="hw-title">
                Piano roll · {ROLLS[roll].label} · Pattern {editing}
              </h2>
              <div className="hw-patterns" role="group" aria-label="Strumento nel piano roll">
                {(Object.keys(ROLLS) as RollId[]).map((r) => (
                  <button key={r} type="button" className="hw-btn hw-btn--small" aria-pressed={roll === r} onClick={() => setRoll(r)}>
                    <span className="hw-btn-led" />
                    {ROLLS[r].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="daw-roll" data-roll={roll}>
              {ROLLS[roll].rows.map((note) => (
                <div key={note} className="daw-roll-row" data-sharp={isSharp(note)}>
                  <button type="button" className="daw-key" onClick={() => void engine().preview(roll, { note })}>
                    {noteName(note)}
                  </button>
                  {Array.from({ length: STEPS }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      className="daw-cell"
                      aria-pressed={pat[roll][i] === note}
                      aria-label={`${noteName(note)} step ${i + 1}`}
                      data-now={i === step && playingSlot === editing}
                      data-beat={i % 4 === 0}
                      onClick={() => setNote(roll, i, note)}
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
            "Scrivi una melodia per il drop",
            "Cosa aggiungo adesso?",
          ]}
          intro="Sono qui con te. Chiedimi di creare un beat (lo scrivo io nello studio e ti spiego come l'ho fatto) oppure fallo tu e ti do consigli mentre lo cambi."
        />
      </div>
    </div>
  );
}
