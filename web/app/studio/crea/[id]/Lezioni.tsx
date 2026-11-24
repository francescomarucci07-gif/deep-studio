"use client";

// "Impara": il tour dello studio e le lezioni guidate. La lezione in corso sta in una scheda piccola in basso: dice cosa
// fare, controlla da sola quando l'hai fatto (lessons.ts) e passa al passo dopo. Si può ridurre a una pillola.
import { useEffect, useRef, useState } from "react";
import { LESSONS, type LessonCtx, type LessonView } from "@/lib/daw/lessons";
import { TOUR } from "./Tour";
import { speak } from "@/lib/voice-client";
import { DEFAULT_VOICE, isVoice } from "@/lib/voices";

const KEY = "ds-lezioni"; // le lezioni finite, nel browser

function doneList(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
// la voce del coach, se è accesa nella chat
function voiceOn() {
  try {
    return localStorage.getItem("ds-coach-voce") === "1";
  } catch {
    return false;
  }
}
function voiceId() {
  try {
    const v = localStorage.getItem("ds-coach-voce-id");
    return v === "browser" || isVoice(v) ? v : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

export function Lezioni({
  ctx,
  menu,
  onMenu,
  onView,
  onRoll,
  onFreshPattern,
  onAsk,
  onTour,
}: {
  ctx: LessonCtx;
  menu: boolean; // il menu "Impara" è aperto
  onMenu: (open: boolean) => void;
  onView: (v: LessonView) => void;
  onRoll: (r: "bass" | "lead" | "chords") => void;
  onFreshPattern: () => string | null; // apre un pattern vuoto; restituisce la lettera (null se non serve o non c'è)
  onAsk: (text: string) => void;
  onTour: () => void;
}) {
  const [done, setDone] = useState<string[]>([]);
  const [active, setActive] = useState<{ lesson: number; step: number; note: string } | null>(null);
  const [hint, setHint] = useState(false);
  const [small, setSmall] = useState(false);
  const [ok, setOk] = useState(false); // "fatto!" per un attimo, prima del passo dopo
  useEffect(() => setDone(doneList()), []);

  const lesson = active ? LESSONS[active.lesson] : null;
  const finished = !!(lesson && active && active.step >= lesson.steps.length);
  const step = lesson && active && !finished ? lesson.steps[active.step] : null;

  // a ogni passo: apro la pagina giusta e, se la voce è accesa, lo leggo
  const lastSpoken = useRef("");
  useEffect(() => {
    if (!lesson || !active) return;
    const text = finished ? lesson.outro : step?.text;
    if (step?.view) onView(step.view);
    if (step?.roll) onRoll(step.roll);
    if (text && voiceOn() && lastSpoken.current !== text) {
      lastSpoken.current = text;
      void speak(text, voiceId());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo quando cambia passo
  }, [active?.lesson, active?.step]);

  // il controllo: quando il passo è fatto, "fatto!"...
  useEffect(() => {
    if (step && !ok && step.done(ctx)) setOk(true);
  }, [ctx, step, ok]);
  // ...e dopo un attimo il passo dopo (un timer a parte: lo studio si ridisegna spesso e non deve fermarlo)
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => {
      setOk(false);
      setHint(false);
      setActive((a) => (a ? { ...a, step: a.step + 1 } : a));
    }, 900);
    return () => clearTimeout(t);
  }, [ok]);

  // fine lezione: la segno come fatta
  useEffect(() => {
    if (!finished || !lesson) return;
    setDone((d) => {
      const next = d.includes(lesson.id) ? d : [...d, lesson.id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // storage non disponibile
      }
      return next;
    });
  }, [finished, lesson]);

  const start = (i: number) => {
    onMenu(false);
    setSmall(false);
    setHint(false);
    setOk(false);
    // la prima lezione parte da un pattern vuoto, così il groove lo costruisci tu
    const fresh = i === 0 ? onFreshPattern() : null;
    setActive({ lesson: i, step: 0, note: fresh ? `Ti ho aperto il pattern ${fresh}, vuoto: si parte da zero.` : "" });
  };

  return (
    <>
      {menu && (
        <div className="ds-report-back" onClick={() => onMenu(false)}>
          <div className="ds-report ds-learn" role="dialog" aria-modal="true" aria-labelledby="ds-learn-title" onClick={(e) => e.stopPropagation()}>
            <div className="ds-tour-head">
              <h2 id="ds-learn-title" className="ds-tour-title">
                Impara con il coach
              </h2>
              <button type="button" className="ds-tour-x" aria-label="Chiudi" onClick={() => onMenu(false)}>
                ✕
              </button>
            </div>
            <p className="ds-tour-text">
              Lezioni brevi, una dopo l&apos;altra: ti dico cosa fare e controllo io quando l&apos;hai fatto.
            </p>
            <ul className="ds-learn-list">
              <li>
                <button type="button" onClick={() => (onMenu(false), onTour())}>
                  <strong>Tour dello studio</strong>
                  <span>dove stanno le cose, in {TOUR.length} tappe</span>
                </button>
              </li>
              {LESSONS.map((l, i) => (
                <li key={l.id}>
                  <button type="button" onClick={() => start(i)}>
                    <strong>
                      {i + 1}. {l.title} {done.includes(l.id) && <span className="ds-learn-done">✓ fatta</span>}
                    </strong>
                    <span>{l.intro}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {lesson && active && (
        <div className="ds-lesson" data-small={small} role="region" aria-label={`Lezione: ${lesson.title}`} aria-live="polite">
          <div className="ds-tour-head">
            <button type="button" className="ds-lesson-title" onClick={() => setSmall(!small)} title={small ? "Apri la lezione" : "Riduci"}>
              Lezione · {lesson.title}
              {!finished && (
                <span>
                  {" "}
                  · {Math.min(active.step + 1, lesson.steps.length)}/{lesson.steps.length}
                </span>
              )}
            </button>
            <button type="button" className="ds-tour-x" aria-label="Esci dalla lezione" onClick={() => setActive(null)}>
              ✕
            </button>
          </div>
          {!small && (
            <>
              {active.step === 0 && <p className="ds-lesson-intro">{lesson.intro}</p>}
              {active.note && active.step === 0 && <p className="ds-lesson-intro">{active.note}</p>}
              {finished ? (
                <p className="ds-tour-text">
                  <strong>Lezione finita!</strong> {lesson.outro}
                </p>
              ) : (
                <p className="ds-tour-text" data-ok={ok}>
                  {ok ? "✓ Fatto!" : step?.text}
                </p>
              )}
              {hint && step && !ok && <p className="ds-lesson-hint">{step.hint}</p>}
              <div className="ds-tour-dots" aria-hidden="true">
                {lesson.steps.map((_, n) => (
                  <span key={n} data-on={n === active.step} data-done={n < active.step} />
                ))}
              </div>
              <div className="ds-tour-actions">
                {finished ? (
                  <>
                    <span className="ds-tour-grow" />
                    {active.lesson + 1 < LESSONS.length && (
                      <button type="button" className="hw-btn hw-btn--small ds-tour-next" onClick={() => start(active.lesson + 1)}>
                        Prossima lezione
                      </button>
                    )}
                    <button type="button" className="hw-btn hw-btn--small" onClick={() => setActive(null)}>
                      Chiudi
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="hw-btn hw-btn--small" aria-pressed={hint} onClick={() => setHint(!hint)}>
                      Suggerimento
                    </button>
                    <button
                      type="button"
                      className="hw-btn hw-btn--small"
                      onClick={() => onAsk(`Sono alla lezione "${lesson.title}", passo: ${step?.text} Come si fa?`)}
                    >
                      Chiedi al coach
                    </button>
                    <span className="ds-tour-grow" />
                    <button
                      type="button"
                      className="hw-btn hw-btn--small"
                      title="Salta questo passo"
                      onClick={() => setActive({ ...active, step: active.step + 1 })}
                    >
                      Salta
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
