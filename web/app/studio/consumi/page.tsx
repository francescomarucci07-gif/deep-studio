import Link from "next/link";
import { notFound } from "next/navigation";
import { SupabaseMissing } from "@/components/SupabaseMissing";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// I consumi del coach, per chi gestisce il prodotto: risposte, token e costo per giorno e per persona. I numeri vengono
// dalla funzione consumi_coach del database (migrazione 0010), che dà solo totali (mai il testo dei messaggi) e solo agli
// admin. Il costo è quello salvato a ogni risposta (lib/coach/pricing.ts), in dollari come lo fattura Anthropic.
export const dynamic = "force-dynamic";
export const metadata = { title: "Consumi del coach · Deep Studio" };

type Row = {
  giorno: string;
  persona: number;
  e_tu: boolean;
  risposte: number;
  tokens_in: number | string;
  tokens_out: number | string;
  costo_usd: number | string;
};
const PERIODI = [7, 30, 90] as const;

const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
const k = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)} M` : v >= 1000 ? `${Math.round(v / 1000)} k` : String(v));

export default async function Consumi({ searchParams }: { searchParams: Promise<{ giorni?: string }> }) {
  if (!hasSupabase()) return <SupabaseMissing />;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) notFound();

  const g = Number((await searchParams).giorni);
  const giorni = (PERIODI as readonly number[]).includes(g) ? g : 30;
  const { data, error } = await supabase.rpc("consumi_coach", { p_giorni: giorni });
  const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, tin: Number(r.tokens_in), tout: Number(r.tokens_out), costo: Number(r.costo_usd) }));

  const tot = rows.reduce(
    (a, r) => ({ risposte: a.risposte + r.risposte, tin: a.tin + r.tin, tout: a.tout + r.tout, costo: a.costo + r.costo }),
    { risposte: 0, tin: 0, tout: 0, costo: 0 },
  );
  const perRisposta = tot.risposte ? tot.costo / tot.risposte : 0;
  const days = [...new Set(rows.map((r) => r.giorno))].map((d) => {
    const rs = rows.filter((r) => r.giorno === d);
    return { d, persone: rs.length, risposte: rs.reduce((a, r) => a + r.risposte, 0), costo: rs.reduce((a, r) => a + r.costo, 0) };
  });
  const people = [...new Set(rows.map((r) => r.persona))].map((n) => {
    const rs = rows.filter((r) => r.persona === n);
    return { n, tu: rs[0].e_tu, giorni: rs.length, risposte: rs.reduce((a, r) => a + r.risposte, 0), costo: rs.reduce((a, r) => a + r.costo, 0) };
  });
  // stima: quanto costa al mese una persona che usa il coach come la media di chi l'ha usato nel periodo
  const perPersonaMese = people.length ? (tot.costo / people.length) * (30 / giorni) : 0;
  const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="ds-stack">
      <div className="ds-row ds-row--between">
        <div>
          <h1 className="ds-heading">Consumi del coach</h1>
          <p className="ds-lead">
            Risposte del coach, token e costo (in dollari, come li fattura Anthropic). Solo totali: i messaggi non si vedono.
          </p>
        </div>
        <Link href="/studio" className="ds-pad">
          Torna allo studio
        </Link>
      </div>

      <div className="ds-row" role="group" aria-label="Periodo">
        {PERIODI.map((p) => (
          <Link key={p} href={`/studio/consumi?giorni=${p}`} className="ds-pad ds-pad--small" aria-current={p === giorni ? "page" : undefined}>
            Ultimi {p} giorni
          </Link>
        ))}
      </div>

      {error ? (
        <p className="ds-message" data-tone="error" role="alert">
          Non riesco a leggere i consumi: {error.message}
        </p>
      ) : (
        <>
          <section className="ds-module">
            <h2 className="ds-module-title">Ultimi {giorni} giorni</h2>
            <div className="ds-stats">
              <div>
                <strong>{usd(tot.costo)}</strong>
                <span>costo totale</span>
              </div>
              <div>
                <strong>{tot.risposte}</strong>
                <span>risposte del coach</span>
              </div>
              <div>
                <strong>{usd(perRisposta)}</strong>
                <span>in media per risposta</span>
              </div>
              <div>
                <strong>{people.length}</strong>
                <span>{people.length === 1 ? "persona" : "persone"} che l&apos;hanno usato</span>
              </div>
              <div>
                <strong>{usd(perPersonaMese)}</strong>
                <span>al mese per persona, a questo ritmo</span>
              </div>
              <div>
                <strong>
                  {k(tot.tin)} / {k(tot.tout)}
                </strong>
                <span>token letti / scritti</span>
              </div>
            </div>
            <p className="ds-meta">
              Con 20 amici che lo usano così: circa {usd(perPersonaMese * 20)} al mese. Non sono contati la voce (ElevenLabs) e i
              costi fissi di Vercel e Supabase.
            </p>
          </section>

          <section className="ds-module">
            <h2 className="ds-module-title">Per persona</h2>
            {people.length === 0 ? (
              <p className="ds-lead">Nessuno ha usato il coach in questo periodo.</p>
            ) : (
              <ul className="ds-list">
                {people.map((p) => (
                  <li key={p.n}>
                    <div>
                      <strong>{p.tu ? "Tu" : `Persona ${p.n}`}</strong>
                      <div className="ds-meta">
                        {p.risposte} risposte in {p.giorni} {p.giorni === 1 ? "giorno" : "giorni"}
                      </div>
                    </div>
                    <strong>{usd(p.costo)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ds-module">
            <h2 className="ds-module-title">Per giorno</h2>
            {days.length === 0 ? (
              <p className="ds-lead">Niente in questo periodo.</p>
            ) : (
              <ul className="ds-list">
                {days.map((d) => (
                  <li key={d.d}>
                    <div>
                      <strong>{day(d.d)}</strong>
                      <div className="ds-meta">
                        {d.risposte} risposte · {d.persone} {d.persone === 1 ? "persona" : "persone"}
                      </div>
                    </div>
                    <strong>{usd(d.costo)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
