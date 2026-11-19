"use client";

// Segna una segnalazione come risolta (o di nuovo da guardare). Il database lascia cambiare solo questa colonna, e
// solo agli admin (migrazione 0008).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function Risolta({ id, done }: { id: string; done: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const toggle = async () => {
    setBusy(true);
    setError(false);
    const { error: e } = await createClient()
      .from("segnalazioni")
      .update({ risolta_at: done ? null : new Date().toISOString() })
      .eq("id", id);
    setBusy(false);
    if (e) setError(true);
    else router.refresh();
  };
  return (
    <button type="button" className="ds-pad" disabled={busy} onClick={toggle} title={error ? "Non sono riuscito a salvarlo: riprova" : undefined}>
      {error ? "Riprova" : done ? "Riapri" : "Risolta"}
    </button>
  );
}
