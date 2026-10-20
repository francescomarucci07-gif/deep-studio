// Mostrato al posto delle pagine che usano Supabase finché web/.env.local non è compilato.
export function SupabaseMissing() {
  return (
    <section className="ds-module">
      <h1 className="ds-module-title">Supabase non collegato</h1>
      <p className="ds-lead">
        Copia <code>web/.env.example</code> in <code>web/.env.local</code> e inserisci URL e anon key del
        progetto Supabase (in locale li stampa <code>supabase start</code>). Poi riavvia <code>npm run dev</code>.
      </p>
    </section>
  );
}
