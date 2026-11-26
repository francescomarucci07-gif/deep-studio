"use client";

// La barra in alto: marchio, display, trasporto (Pattern/Song, Play, Rec, Versioni, Annulla, Export, Parere), Tempo e Swing.
import { Knob } from "@/components/hw/Knob";
import { STEPS, patBars, songLength } from "@/lib/daw/project";
import { pct, two } from "./ui";
import Link from "next/link";
import type { Studio } from "./useStudio";

export function TopBar({ studio }: { studio: Studio }) {
  const {
    bar,
    counting,
    editing,
    effStart,
    exportMenu,
    exportMidi,
    exportMsg,
    exportStems,
    exportWav,
    exporting,
    hist,
    listen,
    listening,
    play,
    playing,
    playingSlot,
    project,
    rec,
    redoEdit,
    save,
    setExportMenu,
    setSharing,
    setExercising,
    setSongMode,
    setShowVersions,
    setTitle,
    showVersions,
    songMode,
    step,
    stop,
    title,
    toggleRec,
    undoEdit,
    update,
  } = studio;
  return (
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
          <span className="hw-lcd-big" data-count={counting > 0}>
            {counting > 0 ? counting : project.bpm}
          </span>
          <span className="hw-lcd-unit">{counting > 0 ? "COUNT" : "BPM"}</span>
          <span className="hw-lcd-small">
            {songMode
              ? `SONG · BAR ${bar >= 0 ? two(bar + 1) : `▶${two(effStart + 1)}`}/${two(songLength(project))}`
              : `PATTERN ${editing}`}
            {" · "}
            {playingSlot ? `PAT ${playingSlot}` : "PAT -"}
            <br />
            STEP {step >= 0 ? two((step % STEPS) + 1) : "--"}/16
            {patBars(project.patterns[playingSlot ?? editing]) > 1 && step >= 0 ? `·${Math.floor(step / STEPS) + 1}` : ""} ·{" "}
            {save === "errore" ? "NON SALVATO" : save === "salvato" ? "SALVATO" : "SALVO…"}
          </span>
        </div>
        <div className="hw-lcd-dots" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <span key={i} data-on={i === step % STEPS} />
          ))}
        </div>
      </div>

      <div className="hw-transport">
        {/* Pattern / Song come in FL: un selettore sempre qui in alto, da qualunque vista (anche mentre suona) */}
        <button
          type="button"
          className="hw-btn hw-pat-song"
          data-mode={songMode ? "song" : "pat"}
          aria-label={songMode ? "Modalità Song: passa a Pattern" : "Modalità Pattern: passa a Song"}
          title={
            songMode
              ? "Song: suona la canzone come la playlist di FL. Clic: torna a Pattern"
              : `Pattern: suona in loop il pattern ${editing}. Clic: passa a Song (la canzone)`
          }
          onClick={() => setSongMode(!songMode)}
        >
          <span className="hw-pat-song-led" data-on={!songMode}>Pat</span>
          <span className="hw-pat-song-led" data-on={songMode}>Song</span>
        </button>
        <button type="button" className="hw-btn hw-btn--play" aria-pressed={playing} onClick={() => void play(0)}>
          <span className="hw-btn-led" />▶ Play
        </button>
        <button type="button" className="hw-btn" onClick={stop}>
          <span className="hw-btn-led" />■ Stop
        </button>
        <button
          type="button"
          className="hw-btn hw-btn--rec"
          aria-pressed={rec}
          title="Registra: pad e tastiera scrivono nel pattern sullo step più vicino (da fermo: count-in di 4 click, poi parte)"
          onClick={toggleRec}
        >
          <span className="hw-btn-led" />● Rec
        </button>
        <button
          type="button"
          className="hw-btn"
          aria-pressed={showVersions}
          aria-label="Versioni"
          title="Versioni salvate del progetto"
          onClick={() => setShowVersions(!showVersions)}
        >
          <span className="hw-btn-led" />↺<span className="hw-btn-text"> Versioni</span>
        </button>
        <button
          type="button"
          className="hw-btn hw-btn--icon"
          disabled={hist.undo === 0}
          aria-label="Annulla"
          title="Annulla l'ultima modifica (Ctrl+Z)"
          onClick={undoEdit}
        >
          ↶
        </button>
        <button
          type="button"
          className="hw-btn hw-btn--icon"
          disabled={hist.redo === 0}
          aria-label="Ripeti"
          title="Ripeti quello che hai annullato (Ctrl+Y)"
          onClick={redoEdit}
        >
          ↷
        </button>
        <span className="hw-export">
          <button
            type="button"
            className="hw-btn"
            aria-pressed={exporting === "sì" || exportMenu}
            aria-expanded={exportMenu}
            disabled={exporting === "sì"}
            aria-label={exporting === "sì" ? undefined : "Export"}
            title={songMode ? "Export: esporta tutta la canzone" : `Export: esporta 4 giri del pattern ${editing}`}
            onClick={() => setExportMenu(!exportMenu)}
          >
            <span className="hw-btn-led" />
            {exporting === "sì" ? exportMsg || "Esporto…" : exporting === "errore" ? "Riprova" : (
              <>
                ⤓<span className="hw-btn-text"> Export</span>
              </>
            )}
          </button>
          {exportMenu && (
            <span className="hw-export-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void exportWav()}>
                <strong>Mix WAV</strong>
                <span>tutta la traccia, 24 bit</span>
              </button>
              <button type="button" role="menuitem" onClick={() => void exportStems()}>
                <strong>Stem</strong>
                <span>un WAV per strumento, senza il master (zip)</span>
              </button>
              <button type="button" role="menuitem" onClick={() => void exportMidi()}>
                <strong>MIDI</strong>
                <span>le note, da trascinare in FL Studio (.mid)</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setExportMenu(false);
                  setSharing(true);
                }}
              >
                <strong>Link di ascolto</strong>
                <span>chi lo apre ascolta la traccia, anche senza account</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setExportMenu(false);
                  setExercising(true);
                }}
              >
                <strong>Esercizio</strong>
                <span>una consegna e un link: gli studenti copiano il progetto e lo modificano</span>
              </button>
            </span>
          )}
        </span>
        <button
          type="button"
          className="hw-btn hw-btn--listen"
          aria-pressed={listening}
          disabled={listening}
          aria-label={listening ? undefined : "Parere"}
          title={songMode ? "Parere: il coach ascolta tutta la canzone" : `Parere: il coach ascolta il pattern ${editing}`}
          onClick={() => void listen()}
        >
          <span className="hw-btn-led" />
          {listening ? (
            "Ascolto…"
          ) : (
            <>
              ◉<span className="hw-btn-text"> Parere</span>
            </>
          )}
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
  );
}
