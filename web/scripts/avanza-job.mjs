// Solo sviluppo (storia 4): fa avanzare a mano lo stato di un job, al posto del worker della M2.
//
//   npm run job:avanza -- <jobId>                    stato successivo
//   npm run job:avanza -- <jobId> errore "messaggio"  simula un errore
//   npm run job:avanza -- <jobId> in_analisi         stato preciso
//
// Usa la SERVICE ROLE key (salta la RLS): mettila in web/.env.local come
// SUPABASE_SERVICE_ROLE_KEY, solo in locale, MAI con prefisso NEXT_PUBLIC_ e mai su Vercel per ora.
import { createClient } from "@supabase/supabase-js";

const ORDER = ["in_coda", "in_analisi", "separazione_stem", "coach", "pronta"];
const [jobId, wanted, ...msg] = process.argv.slice(2);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in web/.env.local");
  process.exit(1);
}
if (!jobId) {
  console.error("Uso: npm run job:avanza -- <jobId> [stato] [messaggio]");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: job, error } = await supabase.from("jobs").select("id, status").eq("id", jobId).single();
if (error) {
  console.error("Job non trovato:", error.message);
  process.exit(1);
}

let next = wanted;
if (!next) {
  const i = ORDER.indexOf(job.status);
  if (i === -1 || i === ORDER.length - 1) {
    console.log(`Il job è in "${job.status}": niente da far avanzare.`);
    process.exit(0);
  }
  next = ORDER[i + 1];
}
if (![...ORDER, "errore"].includes(next)) {
  console.error(`Stato sconosciuto: ${next}. Validi: ${[...ORDER, "errore"].join(", ")}`);
  process.exit(1);
}

const patch = { status: next, error_message: next === "errore" ? msg.join(" ") || "Errore di prova." : null };
if (next === "in_analisi") patch.started_at = new Date().toISOString();
if (next === "pronta" || next === "errore") patch.finished_at = new Date().toISOString();

const { error: upErr } = await supabase.from("jobs").update(patch).eq("id", jobId);
if (upErr) {
  console.error("Aggiornamento fallito:", upErr.message);
  process.exit(1);
}
console.log(`${job.status} → ${next}`);
