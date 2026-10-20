export const metadata = { title: "Privacy · Deep Studio" };

// Testo dalla storia 5 di docs/USER-STORIES-FASE1.md (bozza, da confermare con Spencer).
export default function Privacy() {
  return (
    <section className="ds-module">
      <h1 className="ds-module-title">Privacy</h1>
      <div className="ds-prose">
        <p className="ds-heading">La tua musica resta tua.</p>

        <h2>Cosa carichi</h2>
        <p>
          Il mix della tua traccia e, se vuoi, gli stem. Servono solo per misurarli e darti le note del coach.
        </p>

        <h2>Chi li vede</h2>
        <p>
          Solo tu. I file stanno in uno spazio privato collegato al tuo account: nessun altro utente può aprirli, e
          noi non li ascoltiamo, salvo che tu ce lo chieda (per esempio per risolvere un problema tecnico).
        </p>

        <h2>Per quanto tempo</h2>
        <p>
          L’audio viene cancellato dopo <strong>30 giorni</strong> dal caricamento. Restano le misure (numeri come
          loudness e bilanciamento) e le note, così puoi confrontare le versioni della traccia.
        </p>

        <h2>Cosa non facciamo</h2>
        <p>
          Non usiamo la tua musica per addestrare modelli di intelligenza artificiale. Non la condividiamo con
          nessuno senza il tuo consenso esplicito.
        </p>

        <h2>Chi ci aiuta</h2>
        <p>
          Database e file sono su Supabase, in un data center nell’Unione Europea. Le misure vengono calcolate su
          Modal; le note del coach le scrive Claude (Anthropic), che riceve solo le misure, mai l’audio.
        </p>

        <h2>Cancellare tutto</h2>
        <p>
          Puoi chiederci di cancellare il tuo account e tutti i tuoi dati in qualsiasi momento: scrivici e lo
          facciamo.
        </p>

        <p className="ds-hint">
          Bozza del 20 ottobre 2026. Da verificare prima della beta: giorni di conservazione, regione dei calcoli su
          Modal e trasferimento dati UE/USA (GDPR).
        </p>
      </div>
    </section>
  );
}
