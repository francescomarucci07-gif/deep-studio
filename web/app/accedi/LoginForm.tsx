"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Stato = { tipo: "pronto" } | { tipo: "invio" } | { tipo: "inviato"; email: string } | { tipo: "errore"; testo: string };

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [stato, setStato] = useState<Stato>({ tipo: "pronto" });

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setStato({ tipo: "invio" });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/studio` },
    });
    setStato(error ? { tipo: "errore", testo: error.message } : { tipo: "inviato", email });
  }

  if (stato.tipo === "inviato") {
    return (
      <p className="ds-message" data-tone="ok" role="status">
        Ti ho mandato un link a <strong>{stato.email}</strong>. Aprilo da questo dispositivo per entrare.
      </p>
    );
  }

  return (
    <form onSubmit={invia} className="ds-stack">
      <div className="ds-field">
        <label htmlFor="email" className="ds-label">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="ds-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@esempio.it"
        />
        <p className="ds-hint">Niente password: ricevi un link magico per entrare.</p>
      </div>
      <div className="ds-row">
        <button type="submit" className="ds-pad ds-pad--primary" disabled={stato.tipo === "invio"}>
          {stato.tipo === "invio" ? "Invio…" : "Mandami il link"}
        </button>
      </div>
      {stato.tipo === "errore" && (
        <p className="ds-message" data-tone="error" role="alert">
          Non sono riuscito a mandare il link: {stato.testo}
        </p>
      )}
    </form>
  );
}
