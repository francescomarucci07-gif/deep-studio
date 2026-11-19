"use client";

// L'avviso del parere in tempo reale: una scheda piccola in basso a destra, con il problema, il perché e due
// strade: chiedere al coach come sistemarlo, oppure chiudere (o non sentirlo più).
import type { Issue, IssueId } from "@/lib/daw/listen";

export function Ascolto({
  notice,
  onAsk,
  onClose,
  onNever,
}: {
  notice: Issue | null;
  onAsk: (n: Issue) => void;
  onClose: () => void;
  onNever: (id: IssueId) => void;
}) {
  if (!notice) return null;
  return (
    <div className="ds-ascolto" role="status" aria-live="polite" data-issue={notice.id}>
      <div className="ds-tour-head">
        <strong className="ds-ascolto-title">
          <span className="ds-ascolto-led" aria-hidden="true" />
          {notice.title}
        </strong>
        <button type="button" className="ds-tour-x" aria-label="Chiudi l'avviso" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="ds-tour-text">{notice.text}</p>
      <div className="ds-tour-actions">
        <button type="button" className="hw-btn hw-btn--small ds-tour-next" onClick={() => onAsk(notice)}>
          Chiedi al coach
        </button>
        <span className="ds-tour-grow" />
        <button type="button" className="hw-btn hw-btn--small" onClick={() => onNever(notice.id)} title="Non mostrare più questo avviso">
          Non dirmelo più
        </button>
      </div>
    </div>
  );
}
