"use client";

// Il lettore del link di ascolto: fa suonare la fotografia del progetto con lo stesso motore dello studio (Engine), in
// modalità Song dall'inizio alla fine. Se la canzone è vuota suona in loop il primo pattern pieno.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Engine } from "@/lib/daw/engine";
import { SLOTS, isEmptyPattern, songLength, songSeconds, type Project, type Slot } from "@/lib/daw/project";
import { createClient } from "@/lib/supabase/client";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function Player({ codice, title, project, updatedAt }: { codice: string; title: string; project: Project; updatedAt: string }) {
  const hasSong = project.song.some(Boolean);
  const loopSlot: Slot = useMemo(() => SLOTS.find((s) => !isEmptyPattern(project.patterns[s])) ?? "A", [project]);
  const bars = hasSong ? songLength(project) : 0;
  const [playing, setPlaying] = useState(false);
  const [bar, setBar] = useState(-1);
  const engine = useRef<Engine | null>(null);
  const counted = useRef(false);
  const lastBar = useRef(-1);

  useEffect(() => () => engine.current?.close(), []);

  const stop = () => {
    engine.current?.stop();
    setPlaying(false);
    setBar(-1);
    lastBar.current = -1;
  };
  const play = async () => {
    if (!engine.current) {
      engine.current = new Engine(
        () => project,
        () => ({ song: hasSong, editing: loopSlot }),
        (_s, b) => {
          // la canzone è finita quando il motore torna indietro alla prima battuta
          if (hasSong && b >= 0 && b < lastBar.current) {
            stop();
            return;
          }
          if (b >= 0) lastBar.current = b;
          setBar(b);
        },
      );
    }
    await engine.current.start(0);
    setPlaying(true);
    // il contatore degli ascolti: una volta per visita
    if (!counted.current) {
      counted.current = true;
      // (la richiesta parte solo con then/await: senza, supabase-js la prepara e basta)
      void createClient()
        .rpc("ascolto_play", { p_codice: codice })
        .then(() => undefined);
    }
  };

  const total = hasSong ? songSeconds(project) : 0;
  const done = hasSong && bar >= 0 ? (bar / bars) * total : 0;
  return (
    <div className="ds-stack ds-listen">
      <section className="ds-module ds-listen-card">
        <p className="ds-meta">Ascolta · fatta con Deep Studio</p>
        <h1 className="ds-heading">{title}</h1>
        <p className="ds-lead">
          {project.bpm} BPM · {hasSong ? `${bars} battute · ${clock(total)}` : `pattern ${loopSlot} in loop`} · aggiornata il{" "}
          {new Date(updatedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long" })}
        </p>
        <div className="ds-row">
          <button type="button" className="ds-pad ds-pad--primary ds-listen-play" onClick={() => (playing ? stop() : void play())}>
            {playing ? "■ Stop" : "▶ Ascolta"}
          </button>
          {hasSong && (
            <span className="ds-listen-time" aria-live="off">
              {clock(done)} / {clock(total)}
            </span>
          )}
        </div>
        {hasSong && (
          <div className="ds-listen-bar" role="progressbar" aria-label="Avanzamento" aria-valuemin={0} aria-valuemax={bars} aria-valuenow={Math.max(0, bar)}>
            <span style={{ width: `${bar >= 0 ? ((bar + 1) / bars) * 100 : 0}%` }} />
          </div>
        )}
        <p className="ds-meta">I suoni nascono nel tuo browser mentre ascolti: alza il volume e usa le cuffie per il basso.</p>
      </section>
      <section className="ds-module">
        <h2 className="ds-module-title">Vuoi farne una tua?</h2>
        <p className="ds-lead">Deep Studio è uno studio house nel browser, con un coach che ti insegna mentre produci.</p>
        <Link href="/accedi" className="ds-pad">
          Prova Deep Studio
        </Link>
      </section>
    </div>
  );
}
