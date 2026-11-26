// La pagina di un esercizio senza il database intorno (la usa anche /prova-studio nei test): il lettore, la consegna e
// il pulsante "Copia nel mio studio".
import { normalize } from "@/lib/daw/project";
import { Player } from "../../ascolta/[codice]/Player";

export type EsercizioRow = { title: string; consegna: string; data: unknown; copie: number; updated_at: string };

export function EsercizioView({ codice, row, loggato, errore }: { codice: string; row: EsercizioRow; loggato: boolean; errore: boolean }) {
  return (
    <Player codice={codice} title={row.title} project={normalize(row.data)} updatedAt={row.updated_at} count={false} label="Esercizio · Deep Studio">
      <section className="ds-module" aria-labelledby="ds-consegna-titolo">
        <h2 id="ds-consegna-titolo" className="ds-module-title">
          La consegna
        </h2>
        <p className="ds-lead ds-consegna-text">{row.consegna || "Ascolta il progetto, copialo nel tuo studio e prova a migliorarlo."}</p>
        <form action={`/esercizio/${codice}/copia`} method="post">
          <button type="submit" className="ds-pad ds-pad--primary">
            Copia nel mio studio
          </button>
        </form>
        <p className="ds-meta">
          {loggato
            ? "Nasce un progetto tuo con la consegna dentro: lo modifichi come vuoi, l'originale non cambia."
            : "Serve un account (gratis, niente password): ti mando un link per email e poi torni qui."}
        </p>
        {errore && (
          <p className="ds-message" data-tone="error" role="alert">
            Non sono riuscito a copiare l&apos;esercizio. Riprova tra poco.
          </p>
        )}
      </section>
    </Player>
  );
}
