import { SupabaseMissing } from "@/components/SupabaseMissing";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { NewAnalysisForm } from "./NewAnalysisForm";

// Sempre al momento della richiesta: dipende da chi ha fatto il login.
export const dynamic = "force-dynamic";

export const metadata = { title: "Nuova analisi · Deep Studio" };

export default async function NuovaAnalisi() {
  if (!hasSupabase()) return <SupabaseMissing />;
  const supabase = await createClient();
  const { data } = await supabase.from("tracks").select("id, title, subgenre").order("created_at", { ascending: false });

  return (
    <section className="ds-module">
      <h1 className="ds-module-title">Nuova analisi</h1>
      <NewAnalysisForm tracks={data ?? []} />
    </section>
  );
}
