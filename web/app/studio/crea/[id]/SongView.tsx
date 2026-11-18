"use client";

// La pagina Song: la canzone battuta per battuta, il pennello dei pattern e il marker di partenza.
import {
  MAX_SONG_BARS,
  MIN_SONG_BARS,
  barOf,
  isEmptyPattern,
  patBars,
  slotColor,
  songLength,
  songSeconds,
} from "@/lib/daw/project";
import { clock } from "./ui";
import type { Studio } from "./useStudio";

export function SongView({ studio }: { studio: Studio }) {
  const {
    addBars,
    bar,
    brush,
    chooseStart,
    effStart,
    paintBar,
    playing,
    project,
    removeBars,
    setBrush,
    setSongMode,
    shown,
    songMode,
  } = studio;
  return (
    <section className="hw-panel hw-song" data-panel="song" aria-label="Arrangiamento">
      <div className="hw-seq-head">
        <h2 className="hw-title">
          Song · {songLength(project)} battute · {clock(songSeconds(project))}
        </h2>
        <div className="hw-patterns" role="group" aria-label="Lunghezza della canzone">
          <button
            type="button"
            className="hw-btn hw-btn--small"
            disabled={project.song.length >= MAX_SONG_BARS}
            onClick={() => addBars(4)}
          >
            +4
          </button>
          <button
            type="button"
            className="hw-btn hw-btn--small"
            disabled={project.song.length >= MAX_SONG_BARS}
            onClick={() => addBars(8)}
          >
            +8
          </button>
          <button
            type="button"
            className="hw-btn hw-btn--small"
            disabled={project.song.length <= MIN_SONG_BARS}
            onClick={removeBars}
          >
            −4
          </button>
        </div>
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
      <div className="hw-brushes" role="group" aria-label="Pattern da mettere nella canzone">
        <span className="hw-label">Pennello</span>
        {shown.map((s) => (
          <button
            key={s}
            type="button"
            className="hw-btn hw-btn--small hw-brush"
            data-c={slotColor(s)}
            data-empty={isEmptyPattern(project.patterns[s])}
            aria-pressed={brush === s}
            title={isEmptyPattern(project.patterns[s]) ? `Pattern ${s} (vuoto)` : `Pattern ${s}`}
            onClick={() => setBrush(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="hw-song-bars">
        {project.song.map((s, b) => (
          <div key={b} className="hw-bar-cell" data-start={b === effStart}>
            <button
              type="button"
              className="hw-bar-mark"
              aria-pressed={b === effStart}
              aria-label={
                b === effStart && b > 0
                  ? `La canzone parte dalla battuta ${b + 1}. Clic per tornare alla 1`
                  : `Fai partire la canzone dalla battuta ${b + 1}`
              }
              onClick={() => chooseStart(b)}
            >
              {b === effStart ? "▶" : ""}
              {b + 1}
            </button>
            <button
              type="button"
              className="hw-bar"
              data-slot={s ?? "none"}
              data-c={s ? slotColor(s) : undefined}
              data-now={songMode && playing && b === bar}
              aria-label={`Battuta ${b + 1}: ${s ? `pattern ${s}` : "vuota"}. Clic: ${s === brush ? "svuota" : `metti ${brush}`}`}
              onClick={() => paintBar(b)}
            >
              <span className="hw-bar-slot">
                {s ?? "–"}
                {s && patBars(project.patterns[s]) > 1 && <sub>{barOf(project, project.song, b) + 1}</sub>}
              </span>
            </button>
          </div>
        ))}
      </div>
      <p className="hw-hint">
        Scegli il <strong>pennello</strong> (un pattern) e clicca le battute per metterlo; un clic su una battuta che ha
        già quel pattern la svuota. Clic sul <strong>numero</strong> di una battuta: la canzone parte da lì (▶) e a fine
        canzone torna lì; clic di nuovo per tornare alla 1. <strong>+4</strong> e <strong>+8</strong> allungano la canzone
        (fino a {MAX_SONG_BARS} battute), <strong>−4</strong> toglie le ultime quattro. In <strong>Song</strong> suona la
        canzone dal marker ▶; in <strong>Pattern</strong> solo il pattern che stai modificando, in loop.
      </p>
    </section>
  );
}
