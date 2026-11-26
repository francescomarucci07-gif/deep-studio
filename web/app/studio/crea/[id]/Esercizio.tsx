"use client";

// "Esercizio" (modalità lezione, migrazione 0011): l'insegnante scrive titolo e consegna e crea un link
// /esercizio/<codice>. Chi lo apre legge la consegna, ascolta e copia il progetto nel suo studio. Si condivide una
// fotografia del progetto com'è adesso, con la consegna dentro; "Aggiorna" la rifà, "Togli" spegne il link.
import { useEffect, useState } from "react";
import { ESERCIZIO_CONSEGNA_MAX, ESERCIZIO_TITOLO_MAX, type Project } from "@/lib/daw/project";
import { createClient } from "@/lib/supabase/client";

type Row = { codice: string; title: string; consegna: string; copie: number; updated_at: string };
type Stato = "carico" | "pronto" | "lavoro" | "errore";
const COLS = "codice, title, consegna, copie, updated_at";

export function Esercizio({
  projectId,
  title,
  getProject,
  onClose,
}: {
  projectId: string;
  title: string;
  getProject: () => Project;
  onClose: () => void;
}) {
  const [row, setRow] = useState<Row | null>(null);
  const [titolo, setTitolo] = useState(title);
  const [consegna, setConsegna] = useState("");
  const [stato, setStato] = useState<Stato>("carico");
  const [errore, setErrore] = useState("");
  const [copiato, setCopiato] = useState(false);
  const url = row ? `${typeof window !== "undefined" ? window.location.origin : ""}/esercizio/${row.codice}` : "";

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    void createClient()
      .from("esercizi")
      .select(COLS)
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setErrore(error.message);
          setStato("errore");
          return;
        }
        const r = (Array.isArray(data) ? data[0] : (data as Row | null)) ?? null;
        setRow(r);
        if (r) {
          setTitolo(r.title);
          setConsegna(r.consegna);
        }
        setStato("pronto");
      });
    return () => window.removeEventListener("keydown", key);
  }, [projectId, onClose]);

  const fai = async (azione: "crea" | "aggiorna" | "togli") => {
    setStato("lavoro");
    setCopiato(false);
    const db = createClient().from("esercizi");
    const t = titolo.trim().slice(0, ESERCIZIO_TITOLO_MAX) || "Esercizio";
    const c = consegna.trim().slice(0, ESERCIZIO_CONSEGNA_MAX);
    // la fotografia porta con sé la consegna: lo studente la ritrova nel suo progetto (e la legge il coach)
    const data = { ...getProject(), esercizio: { titolo: t, consegna: c } };
    const res =
      azione === "crea"
        ? await db.insert({ project_id: projectId, title: t, consegna: c, data }).select(COLS).single()
        : azione === "aggiorna"
          ? await db
              .update({ title: t, consegna: c, data, updated_at: new Date().toISOString() })
              .eq("project_id", projectId)
              .select(COLS)
              .single()
          : await db.delete().eq("project_id", projectId);
    if (res.error) {
      setErrore(res.error.message);
      setStato("errore");
      return;
    }
    const r = Array.isArray(res.data) ? res.data[0] : res.data;
    setRow(azione === "togli" ? null : ((r as Row | null) ?? null));
    setStato("pronto");
  };
  const copia = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
    } catch {
      setCopiato(false); // senza permesso: il link resta selezionabile nel campo
    }
  };

  return (
    <div className="ds-report-back" onClick={onClose}>
      <div className="ds-report" role="dialog" aria-modal="true" aria-labelledby="ds-ex-title" onClick={(e) => e.stopPropagation()}>
        <div className="ds-tour-head">
          <h2 id="ds-ex-title" className="ds-tour-title">
            Esercizio per gli studenti
          </h2>
          <button type="button" className="ds-tour-x" aria-label="Chiudi" onClick={onClose}>
            ✕
          </button>
        </div>
        {stato === "carico" ? (
          <p className="ds-tour-text">Un attimo…</p>
        ) : (
          <>
            <p className="ds-tour-text">
              {row
                ? `Chi apre il link legge la consegna, ascolta e copia il progetto nel suo studio per modificarlo. Copiato ${row.copie} ${row.copie === 1 ? "volta" : "volte"}.`
                : "Trasforma questo progetto in un esercizio: scrivi cosa deve fare lo studente e crea il link. Lo studente copia il progetto com'è adesso nel suo studio e lo modifica; il tuo resta com'è."}
            </p>
            <label className="ds-label" htmlFor="ds-ex-titolo">
              Titolo
            </label>
            <input
              id="ds-ex-titolo"
              className="ds-rename-input"
              value={titolo}
              maxLength={ESERCIZIO_TITOLO_MAX}
              onChange={(e) => setTitolo(e.target.value)}
            />
            <label className="ds-label" htmlFor="ds-ex-consegna">
              Consegna
            </label>
            <textarea
              id="ds-ex-consegna"
              className="ds-report-text"
              rows={5}
              maxLength={ESERCIZIO_CONSEGNA_MAX}
              placeholder="Es.: il groove c'è già. Scrivi una bassline in levare nel pattern A, dentro la scala, e mettila nella canzone dopo il break."
              value={consegna}
              onChange={(e) => setConsegna(e.target.value)}
            />
            {row && (
              <>
                <label className="hw-visually-hidden" htmlFor="ds-ex-url">
                  Il link dell&apos;esercizio
                </label>
                <input id="ds-ex-url" className="ds-share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
              </>
            )}
            <div className="ds-tour-actions">
              {row ? (
                <>
                  <button type="button" className="hw-btn hw-btn--small ds-tour-next" onClick={() => void copia()}>
                    {copiato ? "✓ Copiato" : "Copia il link"}
                  </button>
                  <button
                    type="button"
                    className="hw-btn hw-btn--small"
                    disabled={stato === "lavoro"}
                    onClick={() => void fai("aggiorna")}
                    title="Salva titolo e consegna e rifà la fotografia del progetto com'è adesso"
                  >
                    Aggiorna
                  </button>
                  <span className="ds-tour-grow" />
                  <button type="button" className="hw-btn hw-btn--small" disabled={stato === "lavoro"} onClick={() => void fai("togli")} title="Il link smette di funzionare; le copie degli studenti restano">
                    Togli il link
                  </button>
                </>
              ) : (
                <>
                  <span className="ds-tour-grow" />
                  <button type="button" className="hw-btn hw-btn--small ds-tour-next" disabled={stato === "lavoro"} onClick={() => void fai("crea")}>
                    {stato === "lavoro" ? "Creo…" : "Crea l'esercizio"}
                  </button>
                </>
              )}
            </div>
          </>
        )}
        {stato === "errore" && (
          <p className="ds-message" data-tone="error" role="alert">
            Non ci sono riuscito: {errore}
          </p>
        )}
      </div>
    </div>
  );
}
