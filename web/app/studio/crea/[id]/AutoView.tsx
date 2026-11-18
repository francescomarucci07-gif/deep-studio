"use client";

// La pagina Auto: le automazioni del filtro e del volume, battuta per battuta.
import { AUTO_TARGETS, type AutoTarget, MIX_TARGETS, type MixTarget, isBus, laneValue } from "@/lib/daw/project";
import { CHANNELS } from "./ui";
import type { Studio } from "./useStudio";

export function AutoView({ studio }: { studio: Studio }) {
  const {
    autoBase,
    autoLabel,
    autoMin,
    autoParam,
    autoScroll,
    autoTarget,
    bar,
    clearLane,
    isVol,
    lane,
    playing,
    project,
    setAutoParam,
    setAutoTarget,
    setPoint,
    setVolTarget,
    songMode,
    volTarget,
  } = studio;
  return (
    <section className="hw-panel hw-auto" data-panel="auto" aria-label="Automazione">
      <div className="hw-seq-head">
        <h2 className="hw-title">Automazione · {isVol ? "volume" : "filtro"}</h2>
        <div className="hw-patterns">
          <div className="hw-seg" role="group" aria-label="Cosa automatizzare">
            {(["filter", "volume"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className="hw-btn hw-btn--small"
                aria-pressed={autoParam === k}
                onClick={() => setAutoParam(k)}
              >
                <span className="hw-btn-led" />
                {k === "filter" ? "Filtro" : "Volume"}
              </button>
            ))}
          </div>
          <label className="hw-visually-hidden" htmlFor="auto-target">
            Di quale canale
          </label>
          {isVol ? (
            <select
              id="auto-target"
              className="hw-select"
              value={volTarget}
              onChange={(e) => setVolTarget(e.target.value as MixTarget)}
            >
              {MIX_TARGETS.filter((t) => !isBus(t) || project.buses[t].shown || project.volAuto?.[t]).map((t) => (
                <option key={t} value={t}>
                  {project.volAuto?.[t] ? "● " : ""}
                  {t === "master" ? "Master" : isBus(t) ? `Bus ${project.buses[t].name}` : CHANNELS.find((c) => c.id === t)?.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              id="auto-target"
              className="hw-select"
              value={autoTarget}
              onChange={(e) => setAutoTarget(e.target.value as AutoTarget)}
            >
              {AUTO_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {project.automation[t] ? "● " : ""}
                  {t === "master" ? "Master" : CHANNELS.find((c) => c.id === t)?.label}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="hw-btn hw-btn--small" disabled={!lane} onClick={clearLane}>
            Cancella
          </button>
        </div>
      </div>
      <div className="hw-auto-scroll" ref={autoScroll}>
      <div className="hw-auto-grid" style={{ "--bars": project.song.length } as React.CSSProperties}>
        {/* la curva: il valore all'inizio di ogni battuta e come scorre fino alla successiva */}
        <svg
          className="hw-auto-curve"
          viewBox={`0 0 ${project.song.length} 2`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="0" y1="1" x2={project.song.length} y2="1" className="hw-auto-zero" />
          {lane && (
            <polyline
              points={Array.from({ length: project.song.length + 1 }, (_, b) => {
                const v = laneValue(lane, Math.min(b, project.song.length - 1), autoBase);
                return `${b},${isVol ? 2 - 2 * v : 1 - v}`;
              }).join(" ")}
            />
          )}
        </svg>
        {project.song.map((_, b) => {
          const v = lane?.[b] ?? null;
          return (
            <div key={b} className="hw-auto-bar" data-now={songMode && playing && b === bar} data-point={v !== null}>
              <input
                className="hw-auto-fader"
                type="range"
                min={autoMin}
                max={1}
                step={isVol ? 0.01 : 0.02}
                value={v ?? laneValue(lane, b, autoBase)}
                aria-label={`Battuta ${b + 1}: ${isVol ? "volume" : "filtro"} ${v === null ? "senza punto" : autoLabel(v)}`}
                onChange={(e) => setPoint(b, Number(e.target.value))}
                onDoubleClick={() => setPoint(b, null)}
              />
              <span className="hw-bar-num">{b + 1}</span>
              <span className="hw-value">{v === null ? "·" : autoLabel(v)}</span>
            </div>
          );
        })}
      </div>
      </div>
      <p className="hw-hint">
        {isVol ? (
          <>
            Volume: trascina un cursore per mettere un punto, doppio clic per toglierlo; tra due punti il volume
            scorre da solo (fade-in, fade-out). In alto = fader al massimo. Mute e Solo vincono sempre.
          </>
        ) : (
          <>
            Filtro: trascina un cursore per mettere un punto, doppio clic per toglierlo: tra due punti il filtro scorre
            da solo. In alto = si apre verso il passa-alto, in basso = si chiude (passa-basso), al centro spento.
            Esempio di build: battuta 5 in basso, battuta 8 al centro, drop alla 9.
          </>
        )}{" "}
        Suona in <strong>Song</strong> e nell&apos;export.
      </p>
    </section>
  );
}
