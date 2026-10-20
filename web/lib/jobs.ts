// Stati del job (enum job_status) nell'ordine dei LED della schermata "Analisi in corso".

export const JOB_STEPS = [
  { status: "in_coda", label: "In coda", message: "In coda: parte tra poco." },
  { status: "in_analisi", label: "In analisi", message: "Sto misurando loudness, stereo e sezioni." },
  {
    status: "separazione_stem",
    label: "Separazione stem",
    message: "Separo gli stem dal mix (solo se non li hai caricati): qualche minuto.",
  },
  { status: "coach", label: "Coach", message: "Il coach sta scrivendo le note." },
  { status: "pronta", label: "Pronta", message: "Fatto! Le note sono pronte." },
] as const;

export type JobStatus = (typeof JOB_STEPS)[number]["status"] | "errore";

export type LedState = "off" | "on" | "ok" | "error";

/** Stato di ogni LED: passati verdi, attuale acceso (lampeggia), successivi spenti.
 *  In errore, il LED dello step in cui si è fermato diventa rosso. */
export function ledStates(
  status: JobStatus,
  opts: { skipSeparation: boolean; failedAt?: JobStatus },
): { status: string; label: string; state: LedState; blink: boolean; skipped: boolean }[] {
  const order = JOB_STEPS.map((s) => s.status as string);
  const current = status === "errore" ? (opts.failedAt ?? "in_coda") : status;
  const idx = order.indexOf(current);
  return JOB_STEPS.map((s, i) => {
    const skipped = s.status === "separazione_stem" && opts.skipSeparation;
    let state: LedState = "off";
    if (i < idx) state = skipped ? "off" : "ok";
    else if (i === idx) state = status === "errore" ? "error" : status === "pronta" ? "ok" : "on";
    return { status: s.status, label: s.label, state, blink: state === "on", skipped };
  });
}

export function messageFor(status: JobStatus, errorMessage?: string | null) {
  if (status === "errore") return errorMessage || "Qualcosa è andato storto durante l'analisi.";
  return JOB_STEPS.find((s) => s.status === status)?.message ?? "";
}
