"use client";

// La pagina Roll: il piano roll di Bass, Lead e Chord, con i synth e i suoni.
import { Knob } from "@/components/hw/Knob";
import {
  BASS_WAVES,
  CHORD_LAYERS,
  CHORD_STYLES,
  CHORD_TYPES,
  type ChordStyle,
  type ChordType,
  LEAD_SOUNDS,
  LEAD_WAVES,
  NOTE_NAMES,
  type Wave,
  chordName,
  noteLen,
  noteName,
} from "@/lib/daw/project";
import { CHORD_ROOTS, ROLLS, ROLL_TABS, TYPE_LABEL, isSharp } from "./ui";
import type { Studio } from "./useStudio";

export function RollView({ studio }: { studio: Studio }) {
  const {
    barControls,
    bassS,
    beatCols,
    chordS,
    cols,
    editing,
    engine,
    fxJump,
    hasNote,
    keyChord,
    keyHit,
    leadS,
    lightKey,
    noteAt,
    pat,
    patternButtons,
    playing,
    playingSlot,
    roll,
    rollDown,
    sel,
    setKeyChord,
    setNote,
    setRoll,
    setSound,
    soloButton,
    soundScope,
    step,
    tryOut,
    update,
  } = studio;
  return (
    <section
      className="hw-panel hw-roll-panel"
      data-panel="roll"
      aria-label={`Piano roll · ${ROLL_TABS.find((t) => t.id === roll)?.label}`}
    >
      <div className="hw-seq-head">
        <h2
          className="hw-title"
          title="Premi e trascina: disegni o allunghi una nota. Ctrl o Shift + trascina: selezioni. Frecce: sposti (Shift = ottava o battito). Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D (duplica), Ctrl+A (tutto), Canc."
        >
          Piano roll · {ROLL_TABS.find((t) => t.id === roll)?.label}
        </h2>
        <div className="hw-patterns hw-roll-patterns" role="group" aria-label="Pattern nel piano roll">
          {patternButtons}
          {barControls}
        </div>
        <div className="hw-patterns" role="group" aria-label="Strumento nel piano roll">
          {ROLL_TABS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="hw-btn hw-btn--small"
              aria-pressed={roll === r.id}
              onClick={() => setRoll(r.id)}
            >
              <span className="hw-btn-led" />
              {r.label}
            </button>
          ))}
          {soloButton(roll, ROLL_TABS.find((t) => t.id === roll)?.label ?? roll)}
          {roll === "chords" && (
            <>
              <label className="hw-visually-hidden" htmlFor="roll-chord">
                Tipo di accordo
              </label>
              <select
                id="roll-chord"
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
          )}
        </div>
      </div>
      {roll === "chords" ? (
        // accordi: una riga per fondamentale, una casella per battito (4 step)
        <div className="daw-roll" data-roll="chords">
          {CHORD_ROOTS.map((root) => (
            <div
              key={root}
              className="daw-roll-row"
              data-sharp={isSharp(root)}
              data-hit={keyHit?.inst === "chords" && keyHit.value === root}
            >
              <button
                type="button"
                className="daw-key"
                onClick={() => {
                  void engine().preview("chords", { chord: { root, type: keyChord } });
                  lightKey("chords", root);
                }}
              >
                {NOTE_NAMES[root]}
              </button>
              {beatCols.map((b) => {
                // gli accordi del battito con questa fondamentale (di solito uno)
                const here = pat.chords[b].filter((x) => x.root === root);
                const on = here.length > 0;
                const full = !on && pat.chords[b].length >= CHORD_LAYERS;
                return (
                  <button
                    key={b}
                    type="button"
                    className="daw-cell daw-cell--beat"
                    aria-pressed={on}
                    disabled={full}
                    title={full ? `Già ${CHORD_LAYERS} accordi su questo battito` : undefined}
                    aria-label={`Battito ${b + 1}: ${on ? `${here.map(chordName).join(" + ")}, clic per togliere` : `aggiungi ${chordName({ root, type: keyChord })}`}`}
                    data-now={Math.floor(step / 4) === b && playingSlot === editing}
                    onClick={() => {
                      const next = { root, type: keyChord };
                      update((p) => {
                        const layers = p.patterns[editing].chords[b];
                        // clic su una casella accesa: tolgo quell'accordo, gli altri del battito restano
                        p.patterns[editing].chords[b] = on ? layers.filter((x) => x.root !== root) : [...layers, next];
                      });
                      if (!on && !playing) void engine().preview("chords", { chord: next });
                    }}
                  >
                    {on ? here.map(chordName).join(" + ") : ""}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="daw-roll" data-roll={roll}>
          {ROLLS[roll].rows.map((note) => (
            <div
              key={note}
              className="daw-roll-row"
              data-sharp={isSharp(note)}
              data-hit={keyHit?.inst === roll && keyHit.value === note}
            >
              <button
                type="button"
                className="daw-key"
                onClick={() => {
                  void engine().preview(roll, { note });
                  lightKey(roll, note);
                }}
              >
                {noteName(note)}
              </button>
              {cols.map((i) => {
                const head = hasNote(roll, i, note);
                const at = head ? i : noteAt(roll, i, note);
                const len = at >= 0 ? noteLen(pat, roll, at, note) : 0;
                return (
                  <button
                    key={i}
                    type="button"
                    className="daw-cell"
                    aria-pressed={head}
                    aria-label={`${noteName(note)} step ${i + 1}${head && len > 1 ? `, lunga ${len} step` : ""}`}
                    data-step={i}
                    data-note={note}
                    data-selected={head && sel.has(`${i}:${note}`)}
                    data-tail={!head && at >= 0}
                    data-last={at >= 0 && at + len - 1 === i}
                    data-long={head && len > 1}
                    data-now={i === step && playingSlot === editing}
                    data-beat={i % 4 === 0}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      rollDown(roll, i, note, e);
                    }}
                    // Invio o spazio da tastiera (detail = 0): il clic del mouse lo gestisce rollDown
                    onClick={(e) => e.detail === 0 && setNote(roll, i, note)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
      {roll === "chords" && (
        <>
          <p className="hw-hint">
            Clic su una casella: aggiunge l&apos;accordo con quella fondamentale e il tipo scelto su quel battito (fino a{" "}
            {CHORD_LAYERS} accordi sovrapposti nella stessa colonna); clic di nuovo per toglierlo. In <strong>Pad</strong> un
            accordo tiene finché non arriva il successivo; in <strong>Stab</strong> è un colpo corto sul battito.
          </p>
      <div className="hw-synths">
        <div className="hw-strip hw-strip--synth hw-strip--chords">
          <div className="hw-synth-head">
            <div className="hw-synth-title">
              <span className="hw-label">Chord synth</span>
              {fxJump("chords")}
            </div>
            {soundScope("chords")}
          </div>
          <div className="hw-seg">
            {(Object.keys(CHORD_STYLES) as ChordStyle[]).map((st) => (
              <button
                key={st}
                type="button"
                className="hw-btn hw-btn--small"
                aria-pressed={chordS.style === st}
                title={CHORD_STYLES[st].hint}
                onClick={() => {
                  setSound("chords", (x) => {
                    x.style = st;
                  });
                  tryOut("chords");
                }}
              >
                <span className="hw-btn-led" />
                {CHORD_STYLES[st].label}
              </button>
            ))}
          </div>
          <Knob
            label="Cutoff"
            value={chordS.cutoff}
            min={300}
            max={8000}
            step={10}
            defaultValue={1800}
            display={`${Math.round(chordS.cutoff)} Hz`}
            onChange={(v) =>
              setSound("chords", (x) => {
                x.cutoff = v;
              })
            }
          />
        </div>
      </div>
        </>
      )}
      {roll !== "chords" && (
      <div className="hw-synths">
        {roll === "bass" ? (
            <div className="hw-strip hw-strip--synth">
              <div className="hw-synth-head">
                <div className="hw-synth-title">
                  <span className="hw-label">Bass synth</span>
                  {fxJump("bass")}
                </div>
                {soundScope("bass")}
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-pressed={bassS.length === "lunga"}
                  onClick={() =>
                    setSound("bass", (x) => {
                      x.length = x.length === "lunga" ? "corta" : "lunga";
                    })
                  }
                >
                  <span className="hw-btn-led" />
                  808 long
                </button>
              </div>
              <div className="hw-seg">
                {(Object.keys(BASS_WAVES) as Wave[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    className="hw-btn hw-btn--small"
                    aria-pressed={bassS.wave === w}
                    title={BASS_WAVES[w].hint}
                    onClick={() => {
                      setSound("bass", (x) => {
                        x.wave = w;
                      });
                      tryOut("bass");
                    }}
                  >
                    <span className="hw-btn-led" />
                    {BASS_WAVES[w].label}
                  </button>
                ))}
              </div>
              <Knob
                label="Cutoff"
                value={bassS.cutoff}
                min={150}
                max={4000}
                step={10}
                defaultValue={700}
                display={`${Math.round(bassS.cutoff)} Hz`}
                onChange={(v) =>
                  setSound("bass", (x) => {
                    x.cutoff = v;
                  })
                }
              />
            </div>
        ) : (
            <div className="hw-strip hw-strip--synth hw-strip--chords hw-strip--lead">
              <div className="hw-synth-head">
                <div className="hw-synth-title">
                  <span className="hw-label">Lead synth</span>
                  {fxJump("lead")}
                </div>
                {soundScope("lead")}
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-pressed={leadS.length === "lunga"}
                  onClick={() =>
                    setSound("lead", (x) => {
                      x.length = x.length === "lunga" ? "corta" : "lunga";
                    })
                  }
                >
                  <span className="hw-btn-led" />
                  Legato
                </button>
              </div>
              <div className="hw-seg">
                {LEAD_WAVES.map((w) => (
                  <button
                    key={w}
                    type="button"
                    className="hw-btn hw-btn--small"
                    aria-pressed={leadS.wave === w}
                    title={LEAD_SOUNDS[w].hint}
                    onClick={() => {
                      setSound("lead", (x) => {
                        x.wave = w;
                      });
                      tryOut("lead");
                    }}
                  >
                    <span className="hw-btn-led" />
                    {LEAD_SOUNDS[w].label}
                  </button>
                ))}
              </div>
              <Knob
                  label="Cutoff"
                  value={leadS.cutoff}
                  min={300}
                  max={9000}
                  step={10}
                  defaultValue={2600}
                  display={`${Math.round(leadS.cutoff)} Hz`}
                  onChange={(v) =>
                    setSound("lead", (x) => {
                      x.cutoff = v;
                    })
                  }
                />
            </div>
        )}
      </div>
      )}
    </section>
  );
}
