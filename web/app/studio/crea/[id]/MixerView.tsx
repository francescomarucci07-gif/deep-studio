"use client";

// La pagina Mixer: canali, bus, master, routing e il rack dei plugin (insert).
import { Knob } from "@/components/hw/Knob";
import {
  INSERT_SLOTS,
  PLUGINS,
  PLUGIN_GROUPS,
  PLUGIN_TYPES,
  defaultSlot,
  isPluginType,
  pluginParams,
} from "@/lib/daw/plugins";
import { BUS_IDS, BUS_UNITY, type Out, filterLabel } from "@/lib/daw/project";
import { CHANNELS, pct } from "./ui";
import type { Studio } from "./useStudio";

export function MixerView({ studio }: { studio: Studio }) {
  const {
    fxLabel,
    fxOpen,
    fxTarget,
    hitNow,
    limiterDb,
    moveSlot,
    nextBus,
    openFx,
    project,
    removeBus,
    routeTo,
    selSlot,
    setBus,
    setChannel,
    setFx,
    setFxOpen,
    setSelSlot,
    setSlot,
    setSlotParam,
    shownSlots,
    solo,
    soloButton,
    update,
  } = studio;
  return (
    <section className="hw-panel hw-mixer" data-panel="mixer" data-rack={fxOpen} aria-label="Mixer">
      <h2 className="hw-title">Mixer</h2>
      <div className="hw-strips">
        {CHANNELS.map(({ id: c, label }) => (
          <div key={c} className="hw-strip">
            <span
              className="hw-meter"
              data-hit={hitNow(c) && !project.mixer[c].muted && (solo.length === 0 || solo.includes(c))}
              aria-hidden="true"
            />
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
            <div className="hw-strip-btns">
              <button
                type="button"
                className="hw-btn hw-btn--small hw-btn--mute"
                aria-pressed={project.mixer[c].muted}
                aria-label={`Mute ${label}`}
                onClick={() => setChannel(c, { muted: !project.mixer[c].muted })}
              >
                <span className="hw-btn-led" />M
              </button>
              {soloButton(c, label)}
              <button
                type="button"
                className="hw-btn hw-btn--small hw-fx-btn"
                aria-pressed={fxOpen && fxTarget === c}
                aria-label={`Plugin di ${label}`}
                onClick={() => openFx(c)}
              >
                FX{project.inserts[c].some(Boolean) ? ` ${project.inserts[c].filter(Boolean).length}` : ""}
              </button>
            </div>
            <div className="hw-strip-fx">
              <Knob
                size={30}
                label="Filter"
                value={project.fx[c].filter}
                min={-1}
                max={1}
                defaultValue={0}
                display={filterLabel(project.fx[c].filter)}
                onChange={(v) => setFx(c, { filter: v })}
              />
              <Knob
                size={30}
                label="Rev"
                value={project.fx[c].reverb}
                min={0}
                max={1}
                defaultValue={0}
                display={pct(project.fx[c].reverb)}
                onChange={(v) => setFx(c, { reverb: v })}
              />
              <Knob
                size={30}
                label="Dly"
                value={project.fx[c].delay}
                min={0}
                max={1}
                defaultValue={0}
                display={pct(project.fx[c].delay)}
                onChange={(v) => setFx(c, { delay: v })}
              />
            </div>
            <label className="hw-visually-hidden" htmlFor={`out-${c}`}>
              Uscita di {label}
            </label>
            <select
              id={`out-${c}`}
              className="hw-select hw-out"
              value={project.mixer[c].out}
              title="Dove esce il canale: dritto al master o in un bus (gruppo), come il routing di FL"
              onChange={(e) => routeTo(c, e.target.value as Out)}
            >
              <option value="master">→ Master</option>
              {BUS_IDS.filter((b) => project.buses[b].shown).map((b) => (
                <option key={b} value={b}>
                  → {project.buses[b].name}
                </option>
              ))}
              {nextBus && <option value={nextBus}>+ Nuovo bus</option>}
            </select>
            <span className="hw-strip-name">{label}</span>
          </div>
        ))}
        {/* i bus: tracce di gruppo, come gli insert di FL in cui mandi più canali */}
        {BUS_IDS.filter((b) => project.buses[b].shown).map((b) => {
          const bus = project.buses[b];
          const inside = CHANNELS.filter((c) => project.mixer[c.id].out === b);
          const db = 20 * Math.log10(Math.max(1e-4, bus.volume / BUS_UNITY));
          return (
            <div key={b} className="hw-strip hw-strip--bus">
              <span
                className="hw-meter"
                data-hit={!bus.muted && inside.some((c) => hitNow(c.id) && !project.mixer[c.id].muted)}
                aria-hidden="true"
              />
              <input
                className="hw-fader"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={bus.volume}
                aria-label={`Volume del bus ${bus.name}`}
                title="Doppio clic: volume invariato (0 dB)"
                onDoubleClick={() => setBus(b, { volume: BUS_UNITY })}
                onChange={(e) => setBus(b, { volume: Number(e.target.value) })}
              />
              <span className="hw-value">{bus.volume <= 0.001 ? "−∞" : `${db > 0.05 ? "+" : ""}${db.toFixed(1)} dB`}</span>
              <div className="hw-strip-btns">
                <button
                  type="button"
                  className="hw-btn hw-btn--small hw-btn--mute"
                  aria-pressed={bus.muted}
                  aria-label={`Mute del bus ${bus.name}`}
                  onClick={() => setBus(b, { muted: !bus.muted })}
                >
                  <span className="hw-btn-led" />M
                </button>
                <button
                  type="button"
                  className="hw-btn hw-btn--small hw-fx-btn"
                  aria-pressed={fxOpen && fxTarget === b}
                  aria-label={`Plugin del bus ${bus.name}`}
                  onClick={() => openFx(b)}
                >
                  FX{project.inserts[b].some(Boolean) ? ` ${project.inserts[b].filter(Boolean).length}` : ""}
                </button>
              </div>
              <span className="hw-bus-in" title={inside.length ? `Entrano: ${inside.map((c) => c.label).join(", ")}` : undefined}>
                {inside.length ? inside.map((c) => c.label).join(" · ") : "nessun canale: scegli il bus nell'uscita di un canale"}
              </span>
              <label className="hw-visually-hidden" htmlFor={`bus-${b}`}>
                Nome del bus
              </label>
              <input
                id={`bus-${b}`}
                className="hw-strip-name hw-bus-name"
                value={bus.name}
                maxLength={16}
                onChange={(e) => setBus(b, { name: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && setBus(b, { name: `Bus ${BUS_IDS.indexOf(b) + 1}` })}
              />
              <button
                type="button"
                className="hw-bus-x"
                title="Togli il bus: i suoi canali tornano dritti al master"
                aria-label={`Togli il bus ${bus.name}`}
                onClick={() => removeBus(b)}
              >
                ✕
              </button>
            </div>
          );
        })}
        <div className="hw-strip hw-strip--master">
          <span className="hw-label">Master</span>
          <button
            type="button"
            className="hw-btn hw-btn--small hw-fx-btn"
            aria-pressed={fxOpen && fxTarget === "master"}
            aria-label="Plugin del master"
            onClick={() => openFx("master")}
          >
            FX{project.inserts.master.some(Boolean) ? ` ${project.inserts.master.filter(Boolean).length}` : ""}
          </button>
          <button
            type="button"
            className="hw-btn hw-btn--small hw-fx-btn"
            disabled={!nextBus}
            title="Un bus è una traccia di gruppo: ci mandi più canali (per esempio tutta la batteria) e li regoli insieme"
            onClick={() => nextBus && setBus(nextBus, { shown: true })}
          >
            + Bus
          </button>
          <Knob
            label="Filter"
            value={project.masterFilter}
            min={-1}
            max={1}
            defaultValue={0}
            display={filterLabel(project.masterFilter)}
            onChange={(v) =>
              update((p) => {
                p.masterFilter = v;
              })
            }
          />
          <span className="hw-value">
            {project.automation.master ? "automatizzato in Song" : "doppio clic: spento"}
          </span>
          {/* il limiter tiene il true peak sotto -1 dBTP; la spia si accende quando abbassa */}
          <span className="hw-limiter" data-on={limiterDb < -0.5}>
            <span className="hw-btn-led" />
            Limiter {limiterDb < -0.1 ? `${limiterDb.toFixed(1)} dB` : "a riposo"}
          </span>
        </div>
      </div>
      {/* ---- il rack dei plugin del canale scelto (come gli slot degli insert di FL) ---- */}
      {fxOpen && (
      <div className="hw-rack" role="group" aria-label={`Plugin · ${fxLabel(fxTarget)}`}>
        <div className="hw-seq-head">
          <h3 className="hw-title">Insert · {fxLabel(fxTarget)}</h3>
          <button
            type="button"
            className="hw-btn hw-btn--small"
            aria-label="Chiudi i plugin"
            onClick={() => setFxOpen(false)}
          >
            ✕
          </button>
        </div>
        {/* come in FL: la fila degli slot è compatta, le manopole sono solo quelle dello slot scelto */}
        <div className="hw-rack-slots">
          {project.inserts[fxTarget].slice(0, shownSlots(fxTarget)).map((slot, i) => (
            <div
              key={i}
              className="hw-slot"
              data-full={slot !== null}
              data-on={slot?.on ?? false}
              data-selected={slot !== null && i === selSlot}
              onClick={() => slot && setSelSlot(i)}
            >
              <span className="hw-slot-num">{i + 1}</span>
              <label className="hw-visually-hidden" htmlFor={`slot-${i}`}>
                Plugin nello slot {i + 1}
              </label>
              <select
                id={`slot-${i}`}
                className="hw-select"
                value={slot?.type ?? ""}
                onChange={(e) => {
                  setSlot(fxTarget, i, isPluginType(e.target.value) ? defaultSlot(e.target.value) : null);
                  if (isPluginType(e.target.value)) setSelSlot(i);
                }}
              >
                <option value="">{slot ? "— togli —" : "+ aggiungi plugin"}</option>
                {PLUGIN_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {PLUGIN_TYPES.filter((t) => PLUGINS[t].group === g).map((t) => (
                      <option key={t} value={t}>
                        {PLUGINS[t].label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {slot && (
                <button
                  type="button"
                  className="hw-btn hw-btn--small hw-slot-power"
                  aria-pressed={slot.on}
                  aria-label={slot.on ? `Escludi lo slot ${i + 1} (bypass)` : `Riaccendi lo slot ${i + 1}`}
                  title={slot.on ? "Acceso: clic per escluderlo (bypass)" : "Escluso: clic per riaccenderlo"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSlot(fxTarget, i, { ...slot, on: !slot.on });
                  }}
                >
                  <span className="hw-btn-led" />
                </button>
              )}
            </div>
          ))}
        </div>
        {(() => {
          const slot = project.inserts[fxTarget][selSlot];
          if (!slot) return null;
          return (
            <div className="hw-rack-detail" data-on={slot.on}>
              <div className="hw-rack-detail-head">
                <span className="hw-label">
                  Slot {selSlot + 1} · {PLUGINS[slot.type].label}
                  {slot.on ? "" : " (escluso)"}
                </span>
                <span className="hw-value">{PLUGINS[slot.type].hint}</span>
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-label="Sposta prima"
                  disabled={selSlot === 0}
                  onClick={() => {
                    moveSlot(fxTarget, selSlot, -1);
                    setSelSlot(selSlot - 1);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-label="Sposta dopo"
                  disabled={selSlot === INSERT_SLOTS - 1}
                  onClick={() => {
                    moveSlot(fxTarget, selSlot, 1);
                    setSelSlot(selSlot + 1);
                  }}
                >
                  ↓
                </button>
              </div>
              <div className="hw-slot-knobs">
                {pluginParams(slot.type).map((q) => (
                  <Knob
                    key={q.id}
                    size={30}
                    label={q.label}
                    value={slot.params[q.id]}
                    min={q.min}
                    max={q.max}
                    defaultValue={q.default}
                    display={q.format(slot.params[q.id])}
                    onChange={(v) => setSlotParam(fxTarget, selSlot, q.id, v)}
                  />
                ))}
              </div>
            </div>
          );
        })()}
        <p className="hw-hint">
          Il suono passa dagli slot in ordine (fino a {INSERT_SLOTS}). Clic su uno slot per le sue manopole; il LED lo
          accende o lo esclude (bypass) senza toglierlo.
        </p>
      </div>
      )}
    </section>
  );
}
