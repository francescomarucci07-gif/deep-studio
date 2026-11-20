import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SupabaseMissing } from "@/components/SupabaseMissing";
import { normalize } from "@/lib/daw/project";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { Player } from "./Player";

// La pagina pubblica del link di ascolto (migrazione 0009): niente login. La funzione ascolto(codice) del database
// restituisce la fotografia del progetto solo a chi ha il codice; la pagina la fa suonare con il motore dello studio.
export const dynamic = "force-dynamic";

type Row = { title: string; data: unknown; updated_at: string };

async function load(codice: string): Promise<Row | null> {
  if (!hasSupabase() || !/^[A-Za-z0-9_-]{16,40}$/.test(codice)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("ascolto", { p_codice: codice });
  return ((data as Row[] | null) ?? [])[0] ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ codice: string }> }): Promise<Metadata> {
  const row = await load((await params).codice);
  // il titolo per l'anteprima del link (WhatsApp, Telegram…); i motori di ricerca non devono indicizzarla
  return row
    ? { title: `${row.title} · Deep Studio`, description: "Una traccia fatta con Deep Studio: ascoltala nel browser.", robots: { index: false } }
    : { title: "Deep Studio", robots: { index: false } };
}

export default async function Ascolta({ params }: { params: Promise<{ codice: string }> }) {
  if (!hasSupabase()) return <SupabaseMissing />;
  const { codice } = await params;
  const row = await load(codice);
  if (!row) notFound();
  return <Player codice={codice} title={row.title} project={normalize(row.data)} updatedAt={row.updated_at} />;
}
