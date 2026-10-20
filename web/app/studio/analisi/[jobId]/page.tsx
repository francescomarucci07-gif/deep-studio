import { notFound } from "next/navigation";
import { AnalysisResults, type Analysis } from "@/components/AnalysisResults";
import { SupabaseMissing } from "@/components/SupabaseMissing";
import type { JobStatus as Status } from "@/lib/jobs";
import { STAGES, SUBGENRES, labelOf } from "@/lib/options";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { JobStatus } from "./JobStatus";

// Sempre al momento della richiesta: dipende da chi ha fatto il login.
export const dynamic = "force-dynamic";

export const metadata = { title: "Analisi in corso · Deep Studio" };

type Row = {
  id: string;
  status: Status;
  error_message: string | null;
  track_versions: {
    version_no: number;
    stage: string;
    tracks: { title: string; subgenre: string };
    uploads: { kind: string }[];
  };
};

export default async function Analisi({ params }: { params: Promise<{ jobId: string }> }) {
  if (!hasSupabase()) return <SupabaseMissing />;
  const { jobId } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, status, error_message, track_versions(version_no, stage, tracks(title, subgenre), uploads(kind))")
    .eq("id", jobId)
    .maybeSingle();
  if (!data) notFound(); // non esiste, oppure è di un altro utente (RLS)

  const job = data as unknown as Row;
  const v = job.track_versions;
  const hasStems = v.uploads.some((u) => u.kind === "stem");

  let analysis: Analysis | null = null;
  if (job.status === "pronta") {
    const { data: a } = await supabase
      .from("analyses")
      .select("data")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    analysis = (a?.data as Analysis) ?? null;
  }

  return (
    <div className="ds-stack">
      <section className="ds-module">
        <h1 className="ds-module-title">
          {v.tracks.title} · v{v.version_no} · {labelOf(SUBGENRES, v.tracks.subgenre)} · {labelOf(STAGES, v.stage)}
        </h1>
        <JobStatus initial={{ id: job.id, status: job.status, error_message: job.error_message }} hasStems={hasStems} />
      </section>
      {analysis && <AnalysisResults data={analysis} />}
    </div>
  );
}
