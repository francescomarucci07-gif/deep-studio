"use client";

// "Link di ascolto": crea un link pubblico alla traccia (/ascolta/<codice>, migrazione 0009). Si condivide una fotografia
// del progetto, non un file audio: chi apre il link la fa suonare con il motore dello studio. Le modifiche fatte dopo
// non si vedono finché non premi "Aggiorna"; "Togli il link" lo spegne per sempre (un link nuovo avrà un codice nuovo).
import { useEffect, useState } from "react";
import type { Project } from "@/lib/daw/project";
import { createClient } from "@/lib/supabase/client";

type Link = { codice: string; ascolti: number; updated_at: string };
type Stato = "carico" | "pronto" | "lavoro" | "errore";

export function Condividi({
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
  const [link, setLink] = useState<Link | null>(null);
  const [stato, setStato] = useState<Stato>("carico");
  const [errore, setErrore] = useState("");
  const [copiato, setCopiato] = useState(false);
  const url = link ? `${typeof window !== "undefined" ? window.location.origin : ""}/ascolta/${link.codice}` : "";

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    void createClient()
      .from("ascolti")
      .select("codice, ascolti, updated_at")
      .eq("project_id", projectId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setErrore(error.message);
          setStato("errore");
        } else {
          setLink((Array.isArray(data) ? data[0] : (data as Link | null)) ?? null);
          setStato("pronto");
        }
      });
    return () => window.removeEventListener("keydown", key);
  }, [projectId, onClose]);

  const fai = async (azione: "crea" | "aggiorna" | "togli") => {
    setStato("lavoro");
    setCopiato(false);
    const db = createClient().from("ascolti");
    const nome = title.trim().slice(0, 120) || "Senza titolo";
    const res =
      azione === "crea"
        ? await db.insert({ project_id: projectId, title: nome, data: getProject() }).select("codice, ascolti, updated_at").single()
        : azione === "aggiorna"
          ? await db
              .update({ title: nome, data: getProject(), updated_at: new Date().toISOString() })
              .eq("project_id", projectId)
              .select("codice, ascolti, updated_at")
              .single()
          : await db.delete().eq("project_id", projectId);
    if (res.error) {
      setErrore(res.error.message);
      setStato("errore");
      return;
    }
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    setLink(azione === "togli" ? null : ((row as Link | null) ?? null));
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
      <div className="ds-report" role="dialog" aria-modal="true" aria-labelledby="ds-share-title" onClick={(e) => e.stopPropagation()}>
        <div className="ds-tour-head">
          <h2 id="ds-share-title" className="ds-tour-title">
            Link di ascolto
          </h2>
          <button type="button" className="ds-tour-x" aria-label="Chiudi" onClick={onClose}>
            ✕
          </button>
        </div>
        {stato === "carico" ? (
          <p className="ds-tour-text">Un attimo…</p>
        ) : link ? (
          <>
            <p className="ds-tour-text">
              Chi apre il link ascolta la traccia nel browser, anche senza account, ma non può modificarla. Suona com&apos;era
              all&apos;ultimo aggiornamento ({new Date(link.updated_at).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              ){link.ascolti ? ` · ascoltata ${link.ascolti} ${link.ascolti === 1 ? "volta" : "volte"}` : ""}.
            </p>
            <label className="hw-visually-hidden" htmlFor="ds-share-url">
              Il link
            </label>
            <input id="ds-share-url" className="ds-share-url" readOnly value={url} onFocus={(e) => e.target.select()} />
            <div className="ds-tour-actions">
              <button type="button" className="hw-btn hw-btn--small ds-tour-next" onClick={() => void copia()}>
                {copiato ? "✓ Copiato" : "Copia il link"}
              </button>
              <button type="button" className="hw-btn hw-btn--small" disabled={stato === "lavoro"} onClick={() => void fai("aggiorna")} title="Il link suonerà la traccia com'è adesso">
                Aggiorna
              </button>
              <span className="ds-tour-grow" />
              <button type="button" className="hw-btn hw-btn--small" disabled={stato === "lavoro"} onClick={() => void fai("togli")} title="Il link smette di funzionare">
                Togli il link
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="ds-tour-text">
              Crea un link per far ascoltare questa traccia a chi vuoi: la sente nel browser, anche senza account, e non può
              modificarla. Condivido una fotografia del progetto com&apos;è adesso; se poi lo cambi, premi Aggiorna.
            </p>
            <div className="ds-tour-actions">
              <span className="ds-tour-grow" />
              <button type="button" className="hw-btn hw-btn--small ds-tour-next" disabled={stato === "lavoro"} onClick={() => void fai("crea")}>
                {stato === "lavoro" ? "Creo…" : "Crea il link"}
              </button>
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
