"use client";

// La pagina Roll: il piano roll di Bass, Lead, Lead 2 e Chord, con i synth e i suoni.
import { Knob } from "@/components/hw/Knob";
import {
  BASS_WAVES,
  CHORD_LAYERS,
  CHORD_STYLES,
  CHORD_TYPES,
  type ChordStyle,
  type ChordType,
  LEAD_LABEL,
  LEAD_SOUNDS,
  LEAD_WAVES,
  type LeadInst,
  NOTE_NAMES,
  type Wave,
  chordName,
  noteLen,
  noteName,
} from "@/lib/daw/project";
import { useEffect, useState } from "react";
import { MODES, MODE_IDS, type Mode, diatonicChord, guessKey, inScale, keyName } from "@/lib/daw/scale";
import { CHORD_ROOTS, ROLLS, ROLL_TABS, TYPE_LABEL, isSharp, store, stored } from "./ui";
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
    lead2S,
    lightKey,
    noteAt,
    pat,
    patternButtons,
    project,
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
  // il synth del Lead o del Lead 2: stesso pannello, suono e canale diversi
  const key = project.key;
  // Piega (come il "fold" di FL): nasconde le note fuori scala. Accordi della scala: un clic mette l'accordo della
  // tonalità per quella fondamentale. Sono scelte di comodo, salvate nel browser.
  const [fold, setFold] = useState(false);
  const [scaleChords, setScaleChords] = useState(true);
  useEffect(() => {
    setFold(stored("ds-roll-piega") === "1");
    setScaleChords(stored("ds-roll-accordi-scala") !== "0");
  }, []);
  const [guessMsg, setGuessMsg] = useState("");
  const setKey = (root: number | null, mode?: Mode) =>
    update((p) => {
      if (root === null) delete p.key;
      else p.key = { root, mode: mode ?? p.key?.mode ?? "minore" };
    });
  const scaleOf = (midi: number) => (!key ? undefined : (((midi - key.root) % 12) + 12) % 12 === 0 ? "root" : inScale(key, midi) ? "in" : "out");
  // l'accordo che un clic mette su questa fondamentale
  const chordFor = (root: number): ChordType => (key && scaleChords ? (diatonicChord(key, root) ?? keyChord) : keyChord);
  const lr: LeadInst = roll === "lead2" ? "lead2" : "lead";
  const ls = lr === "lead2" ? lead2S : leadS;
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
        <div className="hw-patterns hw-scale" role="group" aria-label="Scala">
          <label className="hw-label" htmlFor="roll-key">
            Scala
          </label>
          <select
            id="roll-key"
            className="hw-select"
            value={key ? String(key.root) : ""}
            title="La tonalità del progetto: nel Roll le sue note si illuminano"
            onChange={(e) => setKey(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">nessuna</option>
            {NOTE_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
          {key && (
            <>
              <label className="hw-visually-hidden" htmlFor="roll-mode">
                Modo della scala
              </label>
              <select
                id="roll-mode"
                className="hw-select"
                value={key.mode}
                title={MODES[key.mode].hint}
                onChange={(e) => setKey(key.root, e.target.value as Mode)}
              >
                {MODE_IDS.map((m) => (
                  <option key={m} value={m} title={MODES[m].hint}>
                    {MODES[m].label}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            className="hw-btn hw-btn--small"
            title="Guarda le note che hai scritto (basso, lead, accordi) e sceglie la tonalità più probabile"
            onClick={() => {
              const g = guessKey(project);
              if (!g) return setGuessMsg("scrivi prima qualche nota");
              setKey(g.root, g.mode);
              setGuessMsg(`→ ${keyName(g)}`);
            }}
          >
            Trova
          </button>
          {guessMsg && <span className="hw-label hw-scale-msg">{guessMsg}</span>}
          {key && (
            <button
              type="button"
              className="hw-btn hw-btn--small"
              aria-pressed={fold}
              title="Mostra solo le note della scala"
              onClick={() => {
                setFold(!fold);
                store("ds-roll-piega", fold ? "0" : "1");
              }}
            >
              <span className="hw-btn-led" />
              Piega
            </button>
          )}
          {key && roll === "chords" && (
            <button
              type="button"
              className="hw-btn hw-btn--small"
              aria-pressed={scaleChords}
              title="Un clic mette l'accordo della scala per quella fondamentale (in La minore: Do → Do maj7, Re → Re m7)"
              onClick={() => {
                setScaleChords(!scaleChords);
                store("ds-roll-accordi-scala", scaleChords ? "0" : "1");
              }}
            >
              <span className="hw-btn-led" />
              Accordi della scala
            </button>
          )}
        </div>
      </div>
      {roll === "chords" ? (
        // accordi: una riga per fondamentale, una casella per battito (4 step)
        <div className="daw-roll" data-roll="chords">
          {CHORD_ROOTS.filter((root) => !(fold && key && !inScale(key, root))).map((root) => (
            <div
              key={root}
              className="daw-roll-row"
              data-sharp={isSharp(root)}
              data-scale={scaleOf(root)}
              data-hit={keyHit?.inst === "chords" && keyHit.value === root}
            >
              <button
                type="button"
                className="daw-key"
                onClick={() => {
                  void engine().preview("chords", { chord: { root, type: chordFor(root) } });
                  lightKey("chords", root);
                }}
              >
                {NOTE_NAMES[root]}
                {key && scaleChords && diatonicChord(key, root) && <span className="daw-key-chord">{TYPE_LABEL[diatonicChord(key, root)!]}</span>}
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
                    aria-label={`Battito ${b + 1}: ${on ? `${here.map(chordName).join(" + ")}, clic per togliere` : `aggiungi ${chordName({ root, type: chordFor(root) })}`}`}
                    data-now={Math.floor(step / 4) === b && playingSlot === editing}
                    onClick={() => {
                      const next = { root, type: chordFor(root) };
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
          {ROLLS[roll].rows.filter((note) => !(fold && key && !inScale(key, note))).map((note) => (
            <div
              key={note}
              className="daw-roll-row"
              data-sharp={isSharp(note)}
              data-scale={scaleOf(note)}
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
                  <span className="hw-label">{LEAD_LABEL[lr]} synth</span>
                  {fxJump(lr)}
                </div>
                {soundScope(lr)}
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-pressed={ls.length === "lunga"}
                  onClick={() =>
                    setSound(lr, (x) => {
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
                    aria-pressed={ls.wave === w}
                    title={LEAD_SOUNDS[w].hint}
                    onClick={() => {
                      setSound(lr, (x) => {
                        x.wave = w;
                      });
                      tryOut(lr);
                    }}
                  >
                    <span className="hw-btn-led" />
                    {LEAD_SOUNDS[w].label}
                  </button>
                ))}
              </div>
              <Knob
                  label="Cutoff"
                  value={ls.cutoff}
                  min={300}
                  max={9000}
                  step={10}
                  defaultValue={lr === "lead" ? 2600 : 3200}
                  display={`${Math.round(ls.cutoff)} Hz`}
                  onChange={(v) =>
                    setSound(lr, (x) => {
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
