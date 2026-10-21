// Contesto della traccia per il coach: analisi compatta (senza le curve lunghe, che costano
// token e non servono a parlare), versione precedente per il confronto.

type Json = Record<string, unknown>;

const DROP_KEYS = new Set(["short_term_curve", "per_window", "correlation_per_window", "checks_note", "note"]);

export function compactAnalysis(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(compactAnalysis);
  if (data && typeof data === "object") {
    const out: Json = {};
    for (const [k, v] of Object.entries(data as Json)) {
      if (!DROP_KEYS.has(k)) out[k] = compactAnalysis(v);
    }
    return out;
  }
  return data;
}

export function buildContext(opts: {
  title: string;
  subgenre: string;
  stage: string;
  versionNo: number;
  analysis: unknown | null;
  previous: { versionNo: number; analysis: unknown } | null;
}) {
  const lines = [
    `Traccia: "${opts.title}" · sottogenere ${opts.subgenre} · stadio ${opts.stage} · versione ${opts.versionNo}.`,
  ];
  lines.push(
    opts.analysis
      ? `Analisi della versione ${opts.versionNo} (JSON):\n${JSON.stringify(compactAnalysis(opts.analysis))}`
      : "Analisi della versione attuale: non ancora pronta.",
  );
  if (opts.previous) {
    lines.push(
      `Analisi della versione precedente (v${opts.previous.versionNo}), per il confronto:\n${JSON.stringify(
        compactAnalysis(opts.previous.analysis),
      )}`,
    );
  } else {
    lines.push("Nessuna versione precedente da confrontare.");
  }
  return lines.join("\n\n");
}
