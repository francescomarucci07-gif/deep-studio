import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SupabaseMissing } from "@/components/SupabaseMissing";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { EsercizioView, type EsercizioRow } from "./EsercizioView";

// La pagina di un esercizio (modalità lezione, migrazione 0011): consegna, ascolto e "Copia nel mio studio". Si legge
// anche senza login (la funzione esercizio(codice) dà solo questa riga, senza autore); per copiare serve il login.
export const dynamic = "force-dynamic";

type Row = EsercizioRow;

async function load(codice: string): Promise<Row | null> {
  if (!hasSupabase() || !/^[A-Za-z0-9_-]{16,40}$/.test(codice)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("esercizio", { p_codice: codice });
  return ((data as Row[] | null) ?? [])[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ codice: string }> }): Promise<Metadata> {
  const row = await load((await params).codice);
  return row
    ? { title: `Esercizio: ${row.title} · Deep Studio`, description: "Un esercizio di produzione: ascoltalo e copialo nel tuo studio.", robots: { index: false } }
    : { title: "Deep Studio", robots: { index: false } };
}

export default async function EsercizioPage({
  params,
  searchParams,
}: {
  params: Promise<{ codice: string }>;
  searchParams: Promise<{ errore?: string }>;
}) {
  if (!hasSupabase()) return <SupabaseMissing />;
  const { codice } = await params;
  const row = await load(codice);
  if (!row) notFound();
  const { errore } = await searchParams;
  const supabase = await createClient();
  const loggato = Boolean((await supabase.auth.getUser()).data.user);
  return <EsercizioView codice={codice} row={row} loggato={loggato} errore={Boolean(errore)} />;
}
