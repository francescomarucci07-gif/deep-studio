"use client";

// La colonna di sinistra: kit, MIDI, tastiera del computer, Registra, count-in, metronomo e pad.
import { OCTAVES } from "@/lib/daw/keyboard";
import { KITS, KIT_IDS } from "@/lib/daw/kits";
import { CHORD_TYPES, type ChordType } from "@/lib/daw/project";
import { PADS, TYPE_LABEL } from "./ui";
import type { Studio } from "./useStudio";

export function SidePanel({ studio }: { studio: Studio }) {
  const {
    chooseView,
    countInOn,
    counting,
    engine,
    hitNow,
    hitPad,
    keyChord,
    keyInst,
    keyMode,
    lastKey,
    metroOn,
    midiButton,
    octaves,
    project,
    projectRef,
    rec,
    setKeyChord,
    setRoll,
    shiftOctave,
    toggleCountIn,
    toggleMetro,
    toggleRec,
    update,
  } = studio;
  return (
    <aside className="console-side">
      <section className="hw-panel hw-pads-panel" aria-label="Drum pad">
        <div className="hw-seq-head">
          <div className="hw-pads-title">
            <h2 className="hw-title">Kit {KITS[project.kit].label}</h2>
            {midiButton}
          </div>
          <div className="hw-seg" role="group" aria-label="Kit di batteria">
            {KIT_IDS.map((k) => (
              <button
                key={k}
                type="button"
                className="hw-btn hw-btn--small"
                aria-pressed={project.kit === k}
                title={KITS[k].hint}
                onClick={() => {
                  update((p) => {
                    p.kit = k;
                  });
                  // senti subito il kick del kit nuovo (il ref prima del render, senza registrare)
                  projectRef.current = { ...projectRef.current, kit: k };
                  void engine().preview("kick");
                }}
              >
                <span className="hw-btn-led" />
                {KITS[k].label}
              </button>
            ))}
          </div>
        </div>
        <div className="hw-keys" role="group" aria-label="Tastiera del computer">
          {/* un clic apre il Roll di quello strumento: da lì la tastiera suona le sue note.
              Nel Roll lo strumento si sceglie in alto nel Roll: qui sparisce e la colonna resta corta */}
          {keyMode !== "keys" && (
          <div className="hw-seg" role="group" aria-label="Strumento della tastiera">
            {(["bass", "lead", "chords"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className="hw-btn hw-btn--small"
                title={`Apre il Roll di ${k === "chords" ? "Chord" : k === "bass" ? "Bass" : "Lead"}: la tastiera ne suona le note (Z X C V B N M = Do Re Mi Fa Sol La Si, S D G H J = diesis, Q W E R T Y U = ottava sopra)`}
                onClick={() => {
                  setRoll(k);
                  chooseView("roll");
                }}
              >
                {k === "bass" ? "Bass" : k === "lead" ? "Lead" : "Chord"}
              </button>
            ))}
          </div>
          )}
          {keyMode === "keys" && (
            <div className="hw-keys-row">
              {keyInst === "chords" ? (
                <>
                  <label className="hw-label" htmlFor="key-chord">
                    Tipo
                  </label>
                  <select
                    id="key-chord"
                    className="hw-select"
                    value={keyChord}
                    onChange={(e) => setKeyChord(e.target.value as ChordType)}
                  >
                    {CHORD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <span className="hw-label">Ottava</span>
                  <button
                    type="button"
                    className="hw-btn hw-btn--small"
                    aria-label="Ottava giù"
                    disabled={octaves[keyInst] <= OCTAVES[keyInst].min}
                    onClick={() => shiftOctave(-1)}
                  >
                    ‹
                  </button>
                  <span className="hw-value">{octaves[keyInst]}</span>
                  <button
                    type="button"
                    className="hw-btn hw-btn--small"
                    aria-label="Ottava su"
                    disabled={octaves[keyInst] >= OCTAVES[keyInst].max}
                    onClick={() => shiftOctave(1)}
                  >
                    ›
                  </button>
                </>
              )}
              <span className="hw-keys-last" aria-live="polite">
                {lastKey}
              </span>
            </div>
          )}
          <div className="hw-keys-recrow">
            <button
              type="button"
              className="hw-btn hw-btn--small hw-btn--rec hw-keys-rec"
              aria-pressed={rec}
              title="Accende Rec e fa partire il Play: pad e note che suoni si scrivono nel pattern"
              onClick={toggleRec}
            >
              <span className="hw-btn-led" />
              {counting > 0 ? `Pronti… ${counting}` : rec ? "Registro… (clic per smettere)" : "● Registra"}
            </button>
            <button
              type="button"
              className="hw-btn hw-btn--small"
              aria-pressed={countInOn}
              title="Count-in: prima di registrare una battuta di click (4), per prepararti alla prima battuta"
              onClick={toggleCountIn}
            >
              <span className="hw-btn-led" />
              1234
            </button>
            <button
              type="button"
              className="hw-btn hw-btn--small"
              aria-pressed={metroOn}
              title="Metronomo: un click su ogni battito mentre suona (non entra nell'export)"
              onClick={toggleMetro}
            >
              <span className="hw-btn-led" />
              Metro
            </button>
          </div>
          <p className="hw-keys-map">
            {keyMode === "keys" ? (
              <>
                Tastiera = note: Z X C V B N M = Do Re Mi Fa Sol La Si · S D G H J = diesis · Q W E R T Y U = ottava
                sopra. I pad si suonano con il mouse.
              </>
            ) : (
              <>Tastiera = pad (Z X C V B N M). Apri il Roll (o Bass, Lead, Chord qui sopra) per suonare le note.</>
            )}
          </p>
        </div>
        <div className="hw-pads" data-keys={keyMode === "keys"}>
          {PADS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="hw-pad"
              data-color={p.color}
              data-hit={hitNow(p.id)}
              onPointerDown={(e) => {
                e.preventDefault();
                hitPad(p.id, e.timeStamp);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") hitPad(p.id, e.timeStamp);
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

    </aside>
  );
}
