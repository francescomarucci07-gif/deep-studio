"use client";

// "Segnala un problema": chi prova lo studio scrive cosa non va. Con il messaggio si salvano da soli la vista aperta,
// il progetto e qualche dato tecnico (browser, schermo), così si capisce dov'era. Va nella tabella segnalazioni
// (migrazione 0006): ognuno vede solo le sue, Francesco le legge dalla dashboard di Supabase.
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Stato = "scrivo" | "invio" | "inviata" | "errore";

export function Segnala({ projectId, view, onClose }: { projectId: string; view: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [stato, setStato] = useState<Stato>("scrivo");
  const [errore, setErrore] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    box.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setStato("invio");
    const info = {
      browser: navigator.userAgent.slice(0, 300),
      schermo: `${window.innerWidth}x${window.innerHeight}`,
      zoom: window.devicePixelRatio,
      pagina: window.location.pathname,
    };
    const { error } = await createClient()
      .from("segnalazioni")
      .insert({ message: text.trim().slice(0, 4000), project_id: projectId, view, info });
    if (error) {
      // il database ne accetta 30 al giorno per persona (trigger della migrazione 0007)
      setErrore(/troppe segnalazioni/i.test(error.message) ? "hai già mandato molte segnalazioni oggi: riprova domani." : error.message);
      setStato("errore");
      return;
    }
    setStato("inviata");
  }

  return (
    <div className="ds-report-back" onClick={onClose}>
      <div
        className="ds-report"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ds-report-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ds-tour-head">
          <h2 id="ds-report-title" className="ds-tour-title">
            Segnala un problema
          </h2>
          <button type="button" className="ds-tour-x" aria-label="Chiudi" onClick={onClose}>
            ✕
          </button>
        </div>
        {stato === "inviata" ? (
          <>
            <p className="ds-tour-text">Grazie! La segnalazione è arrivata: la leggiamo e sistemiamo.</p>
            <div className="ds-tour-actions">
              <span className="ds-tour-grow" />
              <button type="button" className="hw-btn hw-btn--small ds-tour-next" onClick={onClose}>
                Chiudi
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={invia}>
            <p className="ds-tour-text">
              Cosa non va, o cosa manca? Scrivi dov&apos;eri, cosa hai cliccato e cosa ti aspettavi. La vista aperta e il
              browser li aggiungo io.
            </p>
            <label className="hw-visually-hidden" htmlFor="ds-report-text">
              Il problema
            </label>
            <textarea
              id="ds-report-text"
              ref={box}
              className="ds-report-text"
              rows={5}
              maxLength={4000}
              value={text}
              placeholder="Per esempio: nel Roll, se allungo una nota del basso, non suona fino alla fine…"
              onChange={(e) => setText(e.target.value)}
            />
            {stato === "errore" && (
              <p className="ds-message" data-tone="error" role="alert">
                Non sono riuscito a inviarla: {errore}
              </p>
            )}
            <div className="ds-tour-actions">
              <span className="ds-tour-grow" />
              <button type="button" className="hw-btn hw-btn--small" onClick={onClose}>
                Annulla
              </button>
              <button type="submit" className="hw-btn hw-btn--small ds-tour-next" disabled={!text.trim() || stato === "invio"}>
                {stato === "invio" ? "Invio…" : "Invia"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
