import Link from "next/link";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Sempre al momento della richiesta: dipende da chi ha fatto il login.
export const dynamic = "force-dynamic";

export default async function Home() {
  let loggedIn = false;
  if (hasSupabase()) {
    const supabase = await createClient();
    loggedIn = !!(await supabase.auth.getUser()).data.user;
  }

  return (
    <section className="ds-module">
      <h1 className="ds-module-title">Deep Studio</h1>
      <div className="ds-stack">
        <p className="ds-heading">Il tuo mix, ascoltato da un mentore che parla FL Studio.</p>
        <p className="ds-lead">
          Carica l&apos;export della traccia (e gli stem, se vuoi): misuriamo loudness, low end, stereo e
          sezioni, e il coach ti dà 3–5 note da provare subito sul mixer.
        </p>
        <div className="ds-row">
          <Link href={loggedIn ? "/studio" : "/accedi"} className="ds-pad ds-pad--primary">
            {loggedIn ? "Vai allo studio" : "Entra"}
          </Link>
        </div>
      </div>
    </section>
  );
}
