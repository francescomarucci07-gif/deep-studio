import Link from "next/link";
import { notFound } from "next/navigation";
import { SupabaseMissing } from "@/components/SupabaseMissing";
import { hasSupabase } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { Risolta } from "./Risolta";

// Le segnalazioni dallo studio, per chi gestisce il prodotto (tabella admins, migrazione 0008). Chi non è admin riceve
// "pagina non trovata"; in ogni caso il database gli darebbe solo le sue (RLS).
export const dynamic = "force-dynamic";
export const metadata = { title: "Segnalazioni · Deep Studio" };

type Row = {
  id: string;
  owner_id: string;
  project_id: string | null;
  message: string;
  view: string | null;
  info: { browser?: string; schermo?: string; zoom?: number; pagina?: string };
  created_at: string;
  risolta_at: string | null;
};

const VIEW_LABEL: Record<string, string> = { beat: "Beat", roll: "Roll", song: "Song", mixer: "Mixer", auto: "Auto" };

// il browser in due parole, da una stringa lunga come "Mozilla/5.0 (Windows NT 10.0…) … Chrome/141…"
function browserName(ua = "") {
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${b} · ${os}` : b;
}

export default async function Segnalazioni() {
  if (!hasSupabase()) return <SupabaseMissing />;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) notFound();

  const { data } = await supabase
    .from("segnalazioni")
    .select("id, owner_id, project_id, message, view, info, created_at, risolta_at")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as Row[];
  const open = rows.filter((r) => !r.risolta_at);
  const done = rows.filter((r) => r.risolta_at);
  // chi ha scritto: un numero per persona (1 = la prima persona in elenco), senza mostrare email o id
  const people = [...new Set(rows.map((r) => r.owner_id))];
  const who = (r: Row) => (r.owner_id === user.id ? "tu" : `persona ${people.indexOf(r.owner_id) + 1}`);
  const when = (iso: string) =>
    new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

  const list = (items: Row[]) => (
    <ul className="ds-list ds-reports">
      {items.map((r) => (
        <li key={r.id} data-risolta={!!r.risolta_at}>
          <div>
            <p className="ds-report-msg">{r.message}</p>
            <div className="ds-meta">
              {when(r.created_at)} · {who(r)} · vista {VIEW_LABEL[r.view ?? ""] ?? r.view ?? "?"} · {r.info.schermo ?? "schermo ?"} ·{" "}
              {browserName(r.info.browser)}
              {r.risolta_at ? ` · risolta il ${when(r.risolta_at)}` : ""}
            </div>
          </div>
          <Risolta id={r.id} done={!!r.risolta_at} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="ds-stack">
      <div className="ds-row ds-row--between">
        <div>
          <h1 className="ds-heading">Segnalazioni</h1>
          <p className="ds-lead">
            Quello che gli amici scrivono con “Segnala” nello studio. {open.length} da guardare, {done.length} risolte.
          </p>
        </div>
        <Link href="/studio" className="ds-pad">
          Torna allo studio
        </Link>
      </div>
      <section className="ds-module">
        <h2 className="ds-module-title">Da guardare</h2>
        {open.length ? list(open) : <p className="ds-lead">Niente di nuovo: tutto sistemato.</p>}
      </section>
      {done.length > 0 && (
        <section className="ds-module">
          <h2 className="ds-module-title">Risolte</h2>
          {list(done)}
        </section>
      )}
    </div>
  );
}
