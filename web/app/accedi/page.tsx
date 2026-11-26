import { redirect } from "next/navigation";
import { SupabaseMissing } from "@/components/SupabaseMissing";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

// Sempre al momento della richiesta: dipende da chi ha fatto il login.
export const dynamic = "force-dynamic";

export const metadata = { title: "Accedi · Deep Studio" };

// next = dove tornare dopo il login (es. la pagina di un esercizio); solo percorsi del sito
const safe = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/studio");

export default async function Accedi({ searchParams }: { searchParams: Promise<{ errore?: string; next?: string }> }) {
  if (!hasSupabase()) return <SupabaseMissing />;
  const supabase = await createClient();
  const { errore, next } = await searchParams;
  if ((await supabase.auth.getUser()).data.user) redirect(safe(next));

  return (
    <section className="ds-module">
      <h1 className="ds-module-title">Accedi</h1>
      {errore && (
        <p className="ds-message" data-tone="error" role="alert">
          Il link non è valido o è scaduto. Chiedine uno nuovo.
        </p>
      )}
      <LoginForm next={safe(next)} />
    </section>
  );
}
