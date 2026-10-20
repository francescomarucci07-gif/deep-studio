import Link from "next/link";
import { SupabaseMissing } from "@/components/SupabaseMissing";
import { JOB_STEPS } from "@/lib/jobs";
import { STAGES, SUBGENRES, labelOf } from "@/lib/options";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Sempre al momento della richiesta: dipende da chi ha fatto il login.
export const dynamic = "force-dynamic";

export const metadata = { title: "Studio · Deep Studio" };

type Job = { id: string; status: string; created_at: string };
type Version = { id: string; version_no: number; stage: string; jobs: Job[] };
type Track = { id: string; title: string; subgenre: string; track_versions: Version[] };

function statusLabel(status: string) {
  if (status === "errore") return "Errore";
  return JOB_STEPS.find((s) => s.status === status)?.label ?? status;
}

export default async function Studio() {
  if (!hasSupabase()) return <SupabaseMissing />;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La RLS restituisce solo le tracce dell'utente loggato: nessun filtro owner_id qui.
  const { data, error } = await supabase
    .from("tracks")
    .select("id, title, subgenre, track_versions(id, version_no, stage, jobs(id, status, created_at))")
    .order("created_at", { ascending: false });
  const tracks = (data ?? []) as Track[];

  return (
    <div className="ds-stack">
      <div className="ds-row ds-row--between">
        <div>
          <h1 className="ds-heading">Il tuo studio</h1>
          <p className="ds-lead">{user?.email}</p>
        </div>
        <div className="ds-row">
          <Link href="/studio/nuova" className="ds-pad ds-pad--primary">
            Nuova analisi
          </Link>
          <form action="/auth/esci" method="post">
            <button type="submit" className="ds-pad">
              Esci
            </button>
          </form>
        </div>
      </div>

      <section className="ds-module">
        <h2 className="ds-module-title">Tracce</h2>
        {error && (
          <p className="ds-message" data-tone="error">
            Non riesco a leggere le tracce: {error.message}
          </p>
        )}
        {!error && tracks.length === 0 && (
          <p className="ds-lead">Ancora niente qui. Carica il primo mix con “Nuova analisi”.</p>
        )}
        {tracks.length > 0 && (
          <ul className="ds-list">
            {tracks.map((t) => {
              const v = [...t.track_versions].sort((a, b) => b.version_no - a.version_no)[0];
              const job = v ? [...v.jobs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : undefined;
              return (
                <li key={t.id}>
                  <div>
                    <strong>{t.title}</strong>
                    <div className="ds-meta">
                      {labelOf(SUBGENRES, t.subgenre)}
                      {v && ` · v${v.version_no} · ${labelOf(STAGES, v.stage)}`}
                    </div>
                  </div>
                  {job && (
                    <Link href={`/studio/analisi/${job.id}`} className="ds-pad">
                      {statusLabel(job.status)}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
