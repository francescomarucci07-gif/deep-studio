"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoachChat, type Msg } from "@/components/CoachChat";
import { Engine } from "@/lib/daw/engine";
import {
  BASS_HIGH,
  BASS_LOW,
  DRUMS,
  STEPS,
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
  const [save, setSave] = useState<SaveState>("salvato");

  // il motore legge sempre il progetto più recente, anche a metà battuta
  const projectRef = useRef(project);
  projectRef.current = project;
  const titleRef = useRef(title);
  titleRef.current = title;
  const engineRef = useRef<Engine | null>(null);

  const engine = useCallback(() => {
    engineRef.current ??= new Engine(() => projectRef.current, setStep);
    return engineRef.current;
  }, []);

  const togglePlay = useCallback(async () => {
    const e = engine();
    if (e.playing) {
      e.stop();
      setPlaying(false);
    } else {
      await e.start();
      setPlaying(true);
    }
  }, [engine]);

  useEffect(() => () => engineRef.current?.close(), []);

  // barra spaziatrice = play/stop, come in FL (ma non mentre scrivi)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.code === "Space" && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)) {
        e.preventDefault();
        void togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay]);

  useEffect(() => {
    engineRef.current?.applyMixer();
  }, [project.mixer]);

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

  const update = (fn: (p: Project) => void) =>
    setProject((p) => {
      const next = structuredClone(p);
      fn(next);
      return next;
    });

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

  const channelControls = (c: ChannelId, label: string) => (
    <>
      <button type="button" className="daw-name" onClick={() => void engine().preview(c)} title={`Ascolta ${label}`}>
        {label}
      </button>
      <button
        type="button"
        className="daw-mute"
        aria-pressed={project.mixer[c].muted}
        aria-label={`Mute ${label}`}
        onClick={() => setChannel(c, { muted: !project.mixer[c].muted })}
      >
        M
      </button>
      <input
        className="daw-vol"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={project.mixer[c].volume}
        aria-label={`Volume ${label}`}
        title={`Volume ${pct(project.mixer[c].volume)}`}
        onChange={(e) => setChannel(c, { volume: Number(e.target.value) })}
      />
    </>
  );

  return (
    <div className="daw">
      <header className="daw-transport ds-module">
        <button type="button" className="ds-pad ds-pad--primary daw-play" onClick={() => void togglePlay()}>
          {playing ? "■ Stop" : "▶ Play"}
        </button>
        <label className="daw-field">
          <span className="ds-label">BPM</span>
          <input
            className="daw-lcd"
            type="number"
            min={60}
            max={200}
            value={project.bpm}
            onChange={(e) =>
              update((p) => {
                p.bpm = Math.min(200, Math.max(60, Number(e.target.value) || 122));
              })
            }
          />
        </label>
        <label className="daw-field">
          <span className="ds-label">Swing {pct(project.swing)}</span>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={project.swing}
            onChange={(e) =>
              update((p) => {
                p.swing = Number(e.target.value);
              })
            }
          />
        </label>
        <button
          type="button"
          className="ds-pad ds-pad--small"
          aria-pressed={project.sidechain}
          onClick={() =>
            update((p) => {
              p.sidechain = !p.sidechain;
            })
          }
        >
          <span className="ds-led" data-state={project.sidechain ? "on" : "off"} aria-hidden="true" />
          Sidechain
        </button>
        <label className="daw-field daw-title">
          <span className="ds-label">Progetto</span>
          <input className="ds-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <span className="daw-save" aria-live="polite">
          <span
            className="ds-led"
            data-state={save === "salvato" ? "ok" : save === "errore" ? "error" : "on"}
            data-blink={save === "salvo"}
            aria-hidden="true"
          />
          {save === "errore" ? "Non salvato" : save === "salvato" ? "Salvato" : "Salvo…"}
        </span>
      </header>

      <div className="daw-body">
        <div className="ds-stack">
          <section className="ds-module" aria-label="Batteria e basso">
            <div className="ds-row ds-row--between">
              <h2 className="ds-module-title">Channel rack</h2>
              <Link href="/studio" className="ds-link-button">
                ← Studio
              </Link>
            </div>
            <div className="daw-rack">
              {DRUMS.map(({ id: d, label }) => (
                <div key={d} className="daw-row">
                  {channelControls(d, label)}
                  <div className="daw-steps">
                    {project.drums[d].map((on, i) => (
                      <button
                        key={i}
                        type="button"
                        className="daw-step"
                        aria-pressed={on}
                        aria-label={`${label} step ${i + 1}`}
                        data-now={i === step}
                        data-beat={Math.floor(i / 4) % 2 === 0}
                        onClick={() => toggleDrum(d, i)}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="daw-row">
                {channelControls("bass", "Bassline")}
                <div className="daw-steps">
                  {project.bass.map((n, i) => (
                    <span key={i} className="daw-step daw-step--note" data-on={n !== null} data-now={i === step} data-beat={Math.floor(i / 4) % 2 === 0}>
                      {n !== null ? noteName(n).replace(/\d$/, "") : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <p className="ds-hint">Clicca gli step per accendere i colpi, il nome per ascoltare il suono. Barra spaziatrice: play/stop.</p>
          </section>

          <section className="ds-module" aria-label="Piano roll della bassline">
            <div className="ds-row ds-row--between">
              <h2 className="ds-module-title">Piano roll · Bassline</h2>
              <div className="ds-row">
                <div className="ds-segmented">
                  {(["sawtooth", "square"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      className="ds-pad"
                      aria-pressed={project.bassSound.wave === w}
                      onClick={() =>
                        update((p) => {
                          p.bassSound.wave = w;
                        })
                      }
                    >
                      {w === "sawtooth" ? "Saw" : "Square"}
                    </button>
                  ))}
                </div>
                <label className="daw-field">
                  <span className="ds-label">Filtro {Math.round(project.bassSound.cutoff)} Hz</span>
                  <input
                    type="range"
                    min={150}
                    max={4000}
                    step={10}
                    value={project.bassSound.cutoff}
                    onChange={(e) =>
                      update((p) => {
                        p.bassSound.cutoff = Number(e.target.value);
                      })
                    }
                  />
                </label>
              </div>
            </div>
            <div className="daw-roll" aria-label="Note della bassline">
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
          suggestions={["Cosa aggiungo adesso?", "Il groove è abbastanza deep?", "Rendi la bassline più interessante", "Cos'è lo swing?"]}
          intro="Sono qui con te. Premi Play, poi chiedimi cosa aggiungere: vedo il tuo pattern mentre lo cambi."
        />
      </div>
    </div>
  );
}
