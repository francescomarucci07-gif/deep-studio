"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ledStates, messageFor, type JobStatus as Status } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/client";

type Job = { id: string; status: Status; error_message: string | null };

export function JobStatus({ initial, hasStems }: { initial: Job; hasStems: boolean }) {
  const [job, setJob] = useState(initial);
  // ultimo stato prima dell'errore, per colorare di rosso il LED giusto
  const [lastStep, setLastStep] = useState<Status>(initial.status === "errore" ? "in_coda" : initial.status);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // Realtime: Supabase ci avvisa a ogni UPDATE di questo job (la RLS vale anche qui)
    const channel = supabase
      .channel(`job-${initial.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${initial.id}` },
        (payload) => {
          const next = payload.new as Job;
          setJob(next);
          if (next.status !== "errore") setLastStep(next.status);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [initial.id]);

  async function riprova() {
    setRetrying(true);
    setRetryError(null);
    const { data, error } = await createClient().rpc("retry_job", { p_job_id: job.id });
    if (error) setRetryError(error.message);
    else {
      setJob(data as Job);
      setLastStep("in_coda");
    }
    setRetrying(false);
  }

  const leds = ledStates(job.status, { skipSeparation: hasStems, failedAt: lastStep });

  return (
    <div className="ds-stack">
      <ol className="ds-led-row" aria-label="Avanzamento dell'analisi">
        {leds.map((l) => (
          <li
            key={l.status}
            className="ds-led-step"
            aria-current={l.state === "on" || l.state === "error" ? "step" : undefined}
          >
            <span className="ds-led" data-state={l.state} data-blink={l.blink} aria-hidden="true" />
            {l.label}
            {l.skipped && <span className="ds-visually-hidden">(saltato: hai caricato gli stem)</span>}
          </li>
        ))}
      </ol>

      <p
        className="ds-message"
        data-tone={job.status === "errore" ? "error" : job.status === "pronta" ? "ok" : undefined}
        role="status"
      >
        {messageFor(job.status, job.error_message)}
      </p>

      {job.status === "errore" && (
        <div className="ds-row">
          <button type="button" className="ds-pad ds-pad--primary" onClick={riprova} disabled={retrying}>
            {retrying ? "Rimetto in coda…" : "Riprova"}
          </button>
          {retryError && (
            <p className="ds-message" data-tone="error" role="alert">
              {retryError}
            </p>
          )}
        </div>
      )}

      <div className="ds-row">
        <Link href="/studio" className="ds-pad">
          Torna allo studio
        </Link>
      </div>
    </div>
  );
}
