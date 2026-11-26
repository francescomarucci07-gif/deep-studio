import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "Copia nel mio studio": la funzione esercizio_copia (migrazione 0011) crea il progetto dello studente e lo apriamo.
// Senza login si passa da Accedi e poi si torna alla pagina dell'esercizio. È un POST (da un form): il prefetch dei
// link non crea copie a caso.
export async function POST(request: NextRequest, { params }: { params: Promise<{ codice: string }> }) {
  const { codice } = await params;
  const pagina = `/esercizio/${encodeURIComponent(codice)}`;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/accedi?next=${encodeURIComponent(pagina)}`, request.url), 303);

  const { data, error } = await supabase.rpc("esercizio_copia", { p_codice: codice });
  if (error || typeof data !== "string") {
    if (error) console.error("copia esercizio", error.message);
    return NextResponse.redirect(new URL(data === null && !error ? "/studio" : `${pagina}?errore=1`, request.url), 303);
  }
  return NextResponse.redirect(new URL(`/studio/crea/${data}`, request.url), 303);
}
