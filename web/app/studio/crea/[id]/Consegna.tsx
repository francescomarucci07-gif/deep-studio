"use client";

// La consegna di un esercizio (modalità lezione): nei progetti copiati da /esercizio/<codice> resta in basso a sinistra,
// aperta o ridotta a una pillola. "Chiedi al coach" apre la chat: il coach conosce la consegna e dà indizi.
import { useState } from "react";
import type { Esercizio } from "@/lib/daw/project";

export function Consegna({ esercizio, onAsk }: { esercizio: Esercizio; onAsk: () => void }) {
  const [small, setSmall] = useState(false);
  return (
    <div className="ds-lesson ds-consegna" data-small={small} role="region" aria-label={`Esercizio: ${esercizio.titolo}`}>
      <div className="ds-tour-head">
        <button type="button" className="ds-lesson-title" onClick={() => setSmall(!small)} title={small ? "Apri la consegna" : "Riduci"}>
          Esercizio · {esercizio.titolo}
        </button>
        {!small && (
          <button type="button" className="ds-tour-x" aria-label="Riduci la consegna" onClick={() => setSmall(true)}>
            –
          </button>
        )}
      </div>
      {!small && (
        <>
          <p className="ds-tour-text ds-consegna-text">{esercizio.consegna || "L'insegnante non ha scritto una consegna: ascolta il progetto e chiedi al coach."}</p>
          <div className="ds-tour-actions">
            <span className="ds-tour-grow" />
            <button type="button" className="hw-btn hw-btn--small ds-tour-next" onClick={onAsk}>
              Chiedi al coach
            </button>
          </div>
        </>
      )}
    </div>
  );
}
