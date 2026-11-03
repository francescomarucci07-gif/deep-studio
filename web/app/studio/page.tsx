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
type Project = { id: string; title: string; bpm: number; updated_at: string };

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

  // La RLS restituisce solo le righe dell'utente loggato: nessun filtro owner_id qui.
  const [{ data, error }, { data: projectRows }] = await Promise.all([
    supabase
      .from("tracks")
      .select("id, title, subgenre, track_versions(id, version_no, stage, jobs(id, status, created_at))")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, title, bpm, updated_at").order("updated_at", { ascending: false }),
  ]);
  const tracks = (data ?? []) as Track[];
  const projects = (projectRows ?? []) as Project[];

  return (
    <div className="ds-stack">
      <div className="ds-row ds-row--between">
        <div>
          <h1 className="ds-heading">Il tuo studio</h1>
          <p className="ds-lead">{user?.email}</p>
        </div>
        <div className="ds-row">
          <form action="/studio/crea/nuovo" method="post">
            <button type="submit" className="ds-pad ds-pad--primary">
              Nuovo progetto
            </button>
          </form>
          <form action="/auth/esci" method="post">
            <button type="submit" className="ds-pad">
              Esci
            </button>
          </form>
        </div>
      </div>

      <section className="ds-module">
        <h2 className="ds-module-title">Progetti</h2>
        {projects.length === 0 ? (
          <p className="ds-lead">
            Crea il primo groove: batteria, bassline e un coach che ti segue mentre produci. Premi “Nuovo progetto”.
          </p>
        ) : (
          <ul className="ds-list">
            {projects.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.title}</strong>
                  <div className="ds-meta">
                    {Number(p.bpm)} BPM · {new Date(p.updated_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                  </div>
                </div>
                <Link href={`/studio/crea/${p.id}`} className="ds-pad">
                  Apri
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ds-module">
        <div className="ds-row ds-row--between">
          <h2 className="ds-module-title">Mix da FL Studio</h2>
          <Link href="/studio/nuova" className="ds-pad ds-pad--small">
            Analizza un mix
          </Link>
        </div>
        {error && (
          <p className="ds-message" data-tone="error">
            Non riesco a leggere le tracce: {error.message}
          </p>
        )}
        {!error && tracks.length === 0 && (
          <p className="ds-lead">Hai un mix fatto in FL Studio? Caricalo con “Analizza un mix”: lo misuro e il coach ti dice cosa sistemare.</p>
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
