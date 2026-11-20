"use client";
import { useCallback } from "react";
import { CoachChat } from "@/components/CoachChat";
import { VersionsPanel } from "@/components/hw/VersionsPanel";
import { SLOTS, isEmptyPattern } from "@/lib/daw/project";
import { Ascolto } from "./Ascolto";
import { Condividi } from "./Condividi";
import { Lezioni } from "./Lezioni";
import { Segnala } from "./Segnala";
import { Tour } from "./Tour";
import { CHANNELS, VIEWS } from "./ui";
import { AutoView } from "./AutoView";
import { BeatView } from "./BeatView";
import { MixerView } from "./MixerView";
import { RollView } from "./RollView";
import { SidePanel } from "./SidePanel";
import { SongView } from "./SongView";
import { TopBar } from "./TopBar";
import { useStudio, type StudioProps } from "./useStudio";

// Lo studio: mette insieme le viste. La logica sta in useStudio.tsx, le costanti in ui.ts, ogni pagina nel suo file.
export function Daw(props: StudioProps) {
  const studio = useStudio(props);
  const {
    applyFromCoach,
    ask,
    chooseView,
    closeReport,
    coachMessages,
    coachOpen,
    editing,
    endTour,
    exported,
    id,
    learnMenu,
    measures,
    openCoach,
    playbackRef,
    playing,
    project,
    projectRef,
    remember,
    reporting,
    restore,
    setAsk,
    setCoachOpen,
    setEditing,
    setLearnMenu,
    setMeasures,
    setProject,
    setReporting,
    setRoll,
    setShowVersions,
    setSolo,
    setTouring,
    setUndo,
    showVersions,
    snapshot,
    solo,
    songMode,
    titleRef,
    toggleCoach,
    ascolto,
    sharing,
    setSharing,
    touring,
    undo,
    versionsTick,
    view,
  } = studio;
  const closeShare = useCallback(() => setSharing(false), [setSharing]);
  return (
    <div className="console" data-coach={coachOpen ? "on" : "off"}>
      {touring && <Tour onView={chooseView} onCoach={openCoach} onClose={endTour} />}
      {reporting && <Segnala projectId={id} view={view} onClose={closeReport} />}
      {sharing && <Condividi projectId={id} title={titleRef.current} getProject={() => projectRef.current} onClose={closeShare} />}
      <Lezioni
        ctx={{ project, editing, playing, songMode, exported }}
        menu={learnMenu}
        onMenu={setLearnMenu}
        onView={chooseView}
        onRoll={setRoll}
        onFreshPattern={() => {
          if (isEmptyPattern(project.patterns[editing])) return null;
          const free = SLOTS.find((x) => isEmptyPattern(project.patterns[x]));
          if (free) setEditing(free);
          return free ?? null;
        }}
        onAsk={(text) => {
          setCoachOpen(true);
          setAsk({ id: Date.now(), text });
        }}
        onTour={() => setTouring(true)}
      />
      <Ascolto
        notice={ascolto.notice}
        onClose={ascolto.dismiss}
        onNever={ascolto.never}
        onAsk={(n) => {
          setCoachOpen(true);
          const live = ascolto.summary();
          setAsk({ id: Date.now(), text: n.ask, ...(live ? { extra: { ascolto: { avviso: n.id, ...live } } } : {}) });
          ascolto.dismiss();
        }}
      />
      {/* ---- pannello superiore: marchio, display, trasporto, manopole ---- */}
      <TopBar studio={studio} />

      <div className="console-body">
        {/* ---- colonna sinistra: kit e pad ---- */}
        <SidePanel studio={studio} />

        {/* ---- centro: sul computer una vista alla volta (schede in alto), sul telefono tutto in colonna ---- */}
        <div className="console-stage" data-view={view}>
          <nav className="hw-views" aria-label="Viste dello studio">
            <div className="hw-views-tabs">
              {VIEWS.map((v, n) => (
                <button
                  key={v.id}
                  type="button"
                  className="hw-view"
                  aria-pressed={view === v.id}
                  title={`${v.label} (tasto ${n + 1})`}
                  onClick={() => chooseView(v.id)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={v.icon} />
                  </svg>
                  {v.label}
                </button>
              ))}
            </div>
            {solo.length > 0 && (
              <button
                type="button"
                className="hw-solo-chip"
                title="Clic per tornare a sentire tutti i canali"
                onClick={() => setSolo([])}
              >
                Solo: {solo.map((c) => CHANNELS.find((x) => x.id === c)?.label ?? c).join(", ")} ✕
              </button>
            )}
            <button
              type="button"
              className="hw-btn hw-btn--small hw-views-end"
              aria-pressed={reporting}
              title="Qualcosa non va o manca? Scrivilo qui"
              onClick={() => setReporting(true)}
            >
              <span className="hw-btn-led" />
              Segnala
            </button>
            <button
              type="button"
              className="hw-btn hw-btn--small"
              aria-pressed={touring || learnMenu}
              title="Il tour dello studio e le lezioni guidate del coach"
              onClick={() => setLearnMenu(true)}
            >
              <span className="hw-btn-led" />
              Impara
            </button>
            <button type="button" className="hw-btn hw-btn--small" aria-pressed={coachOpen} onClick={toggleCoach}>
              <span className="hw-btn-led" />
              Coach
            </button>
          </nav>

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

          {measures && (
            <section className="hw-panel hw-measures" aria-label="Misure dell'ultimo ascolto">
              <div className="hw-seq-head">
                <h2 className="hw-title">Ultimo ascolto del coach</h2>
                <button type="button" className="hw-btn hw-btn--small" onClick={() => setMeasures(null)}>
                  Chiudi
                </button>
              </div>
              <div className="hw-meas-row">
                {[
                  ["Loudness", measures.integrated_lufs === null ? "—" : String(measures.integrated_lufs), "LUFS"],
                  ["True peak", String(measures.true_peak_dbtp), "dBTP"],
                  ["Dinamica", String(measures.crest_factor_db), "dB crest"],
                  ["Variazione", measures.lra_lu === null ? "—" : String(measures.lra_lu), "LU"],
                  ["Low end mono", measures.stereo.side_ratio_low <= 0.1 ? "sì" : "no", `side ${measures.stereo.side_ratio_low}`],
                ].map(([label, value, unit]) => (
                  <div key={label} className="hw-meas">
                    <span className="hw-label">{label}</span>
                    <span className="hw-meas-value">{value}</span>
                    <span className="hw-value">{unit}</span>
                  </div>
                ))}
              </div>
              <div className="hw-meas-bands" aria-label="Bilancio delle frequenze">
                {Object.entries(measures.bands_db).map(([band, v]) => (
                  <div key={band} className="hw-meas-band" title={`${band}: ${v} dB`}>
                    <span className="hw-meas-bar" style={{ height: `${Math.max(4, Math.min(100, ((v + 40) / 40) * 100))}%` }} />
                    <span className="hw-value">{band.replace("_", " ")}</span>
                    <span className="hw-value">{v}</span>
                  </div>
                ))}
              </div>
              {measures.bars.length > 1 && (
                <div className="hw-meas-energy" aria-label="Energia per battuta">
                  {measures.bars.map((b) => (
                    <span
                      key={b.bar}
                      title={`Battuta ${b.bar} (${b.slot}): ${b.rms_db} dB, brillantezza ${b.above_6k_db} dB`}
                      style={{ height: `${Math.max(4, Math.min(100, ((b.rms_db + 40) / 40) * 100))}%`, opacity: 0.35 + Math.max(0, Math.min(1, (b.above_6k_db + 40) / 30)) * 0.65 }}
                    />
                  ))}
                </div>
              )}
              {measures.checks.length > 0 && (
                <p className="hw-hint">Allarmi: {measures.checks.map((c) => c.detail).join(" · ")}</p>
              )}
            </section>
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
                  remember(true);
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

          {/* ---- step sequencer: ogni riga ha il colore del suo strumento ---- */}
          <BeatView studio={studio} />

          {/* ---- arrangiamento: quale pattern suona in ogni battuta ---- */}
          <SongView studio={studio} />

          {/* ---- automazioni dei filtri, battuta per battuta ---- */}
          <AutoView studio={studio} />

          {/* ---- mixer ---- */}
          <MixerView studio={studio} />

          {/* ---- piano roll: una schermata con la sua tastiera per Bass, Lead e Chord ---- */}
          <RollView studio={studio} />
        </div>

        {/* ---- colonna destra: il coach (sul computer si può chiudere) ---- */}
        <aside className="console-coach">
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
            ask={ask}
            suggestions={[
              "Fammi una traccia deep house con intro, break e drop",
              "Make me a trap beat",
              "Fammi un build prima del drop",
              "Cosa aggiungo adesso?",
            ]}
            intro="Sono qui con te. Chiedimi di creare un beat (lo scrivo io nello studio e ti spiego come l'ho fatto) oppure fallo tu e ti do consigli mentre lo cambi."
          />
          {/* sul telefono la barra delle viste non c'è: il pulsante sta qui */}
          <div className="ds-report-mobile">
            <button type="button" className="hw-btn hw-btn--small" onClick={() => setLearnMenu(true)}>
              Impara
            </button>
            <button type="button" className="hw-btn hw-btn--small" onClick={() => setReporting(true)}>
              Segnala un problema
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
