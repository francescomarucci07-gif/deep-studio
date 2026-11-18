"use client";

// La pagina Beat: lo step sequencer con batteria, Bass, Lead e Chord, pattern, lunghezza e velocity.
import { DRUMS, STEPS, chordName, noteName } from "@/lib/daw/project";
import type { Studio } from "./useStudio";

export function BeatView({ studio }: { studio: Studio }) {
  const {
    barControls,
    beatCols,
    chooseView,
    clearPattern,
    cols,
    duplicate,
    editing,
    engine,
    firstFree,
    holds,
    openRoll,
    pat,
    patternButtons,
    playingSlot,
    setRoll,
    setVelMode,
    setVelShown,
    soloButton,
    step,
    toggleDrum,
    velBar,
    velMode,
    velProps,
    velShown,
  } = studio;
  return (
    <section className="hw-panel hw-seq" data-panel="beat" aria-label="Step sequencer">
      <div className="hw-seq-head">
        <h2 className="hw-title">Beat · Pattern {editing}</h2>
        <div className="hw-patterns" role="group" aria-label="Pattern da modificare">
          {patternButtons}
          <button type="button" className="hw-btn hw-btn--small" disabled={!firstFree} onClick={duplicate}>
            Duplica{firstFree ? ` → ${firstFree}` : ""}
          </button>
          <button type="button" className="hw-btn hw-btn--small" onClick={clearPattern}>
            Svuota
          </button>
          {barControls}
          <button
            type="button"
            className="hw-btn hw-btn--small"
            aria-pressed={velMode}
            title="Velocity: la forza di ogni colpo e nota. Acceso: trascina su e giù sui colpi (80% = normale, 100% = accento)"
            onClick={() => {
              setVelMode(!velMode);
              setVelShown(null);
            }}
          >
            <span className="hw-btn-led" />
            {velMode && velShown !== null ? `Vel ${velShown}%` : "Vel"}
          </button>
        </div>
      </div>
      <div className="hw-seq-grid">
        {DRUMS.map(({ id: d, label }) => (
          <div key={d} className="hw-seq-row" data-row={d}>
            <div className="hw-seq-label">
              <button type="button" className="hw-seq-name" onClick={() => void engine().preview(d)}>
                {label}
              </button>
              {soloButton(d, label)}
            </div>
            {cols.map((i) => [pat.drums[d][i], i] as const).map(([on, i]) => (
              <button
                key={i}
                type="button"
                className="hw-key"
                data-group={Math.floor((i % STEPS) / 4)}
                aria-pressed={on}
                aria-label={`${label} step ${i + 1}`}
                data-now={i === step && playingSlot === editing}
                onClick={() => !velMode && toggleDrum(d, i)}
                {...velProps(`${d}${i}`, on)}
              >
                <span className="hw-key-led" />
                {velBar(`${d}${i}`, on)}
              </button>
            ))}
          </div>
        ))}
        <div className="hw-seq-row" data-row="bass">
          <div className="hw-seq-label">
            <button type="button" className="hw-seq-name" onClick={() => openRoll("bass")}>
              Bass
            </button>
            {soloButton("bass", "Bass")}
          </div>
          {cols.map((i) => [pat.bass[i], i] as const).map(([n, i]) => (
            <span
              key={i}
              className="hw-key hw-key--note"
              data-group={Math.floor((i % STEPS) / 4)}
              data-on={n !== null}
              data-hold={n === null && holds.bass.has(i)}
              data-now={i === step && playingSlot === editing}
              title="Le note del basso si scrivono nel Roll: clic per aprirlo"
              onClick={() => !velMode && openRoll("bass")}
              {...velProps(`b${i}`, n !== null)}
            >
              {velBar(`b${i}`, n !== null)}
              {n !== null ? noteName(n).replace(/\d$/, "") : ""}
            </span>
          ))}
        </div>
        <div className="hw-seq-row" data-row="lead">
          <div className="hw-seq-label">
            <button
              type="button"
              className="hw-seq-name"
              onClick={() => {
                setRoll("lead");
                chooseView("roll");
              }}
            >
              Lead
            </button>
            {soloButton("lead", "Lead")}
          </div>
          {cols.map((i) => [pat.lead[i], i] as const).map(([n, i]) => (
            <span
              key={i}
              className="hw-key hw-key--note hw-key--lead"
              data-group={Math.floor((i % STEPS) / 4)}
              data-on={n.length > 0}
              data-hold={n.length === 0 && holds.lead.has(i)}
              data-now={i === step && playingSlot === editing}
              title={`${n.length ? `${n.map(noteName).join(" + ")} · ` : ""}la melodia si scrive nel Roll: clic per aprirlo`}
              onClick={() => !velMode && openRoll("lead")}
              {...velProps(`l${i}`, n.length > 0)}
            >
              {velBar(`l${i}`, n.length > 0)}
              {/* più note insieme: la più bassa e quante ce ne sono in tutto */}
              {n.length ? `${noteName(n[0]).replace(/\d$/, "")}${n.length > 1 ? `+${n.length - 1}` : ""}` : ""}
            </span>
          ))}
        </div>
        {/* gli accordi: uno per battito (4 step); si scrivono nella scheda Chord del Roll */}
        <div className="hw-seq-row" data-row="chords">
          <div className="hw-seq-label">
            <button type="button" className="hw-seq-name" onClick={() => openRoll("chords")}>
              Chord
            </button>
            {soloButton("chords", "Chord")}
          </div>
          {beatCols.map((b) => [pat.chords[b], b] as const).map(([c, b]) => (
            <span
              key={b}
              className="hw-key hw-key--note hw-key--chord"
              data-on={c.length > 0}
              data-now={Math.floor(step / 4) === b && playingSlot === editing}
              title="Gli accordi si scrivono nel Roll, scheda Chord: clic per aprirlo"
              onClick={() => !velMode && openRoll("chords")}
              {...velProps(`c${b}`, c.length > 0)}
            >
              {velBar(`c${b}`, c.length > 0)}
              {c.map(chordName).join(" + ")}
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
  );
}
