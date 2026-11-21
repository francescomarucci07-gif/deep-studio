"use client";

// Le azioni su un progetto nella pagina Il tuo studio: Rinomina, Duplica, Elimina. Le fa il browser con la sessione
// dell'utente: la RLS di projects (migrazione 0004) lascia toccare solo i propri progetti. Eliminando un progetto se ne
// vanno anche cronologia, messaggi del coach e link di ascolto (on delete cascade).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ProjectActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError("");
    const { error: e } = await fn();
    setBusy(false);
    if (e) setError(e.message);
    else router.refresh();
    return !e;
  };
  const db = () => createClient().from("projects");

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = name.trim().slice(0, 120);
    if (!t || t === title) return setRenaming(false);
    if (await run(() => db().update({ title: t }).eq("id", id))) setRenaming(false);
  };
  const duplicate = () =>
    run(async () => {
      const { data, error: e } = await db().select("title, bpm, data").eq("id", id).single();
      if (e || !data) return { error: e ?? { message: "progetto non trovato" } };
      return db().insert({ title: `${data.title} (copia)`.slice(0, 120), bpm: data.bpm, data: data.data });
    });
  const remove = () => {
    if (!window.confirm(`Eliminare "${title}"? Se ne vanno anche la cronologia, la chat con il coach e il link di ascolto. Non si può annullare.`)) return;
    void run(() => db().delete().eq("id", id));
  };

  if (renaming)
    return (
      <form className="ds-row ds-project-rename" onSubmit={rename}>
        <label className="hw-visually-hidden" htmlFor={`nome-${id}`}>
          Nuovo nome
        </label>
        <input
          id={`nome-${id}`}
          className="ds-rename-input"
          value={name}
          maxLength={120}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (setName(title), setRenaming(false))}
        />
        <button type="submit" className="ds-pad ds-pad--small" disabled={busy}>
          Salva
        </button>
        <button type="button" className="ds-pad ds-pad--small" onClick={() => (setName(title), setRenaming(false))}>
          Annulla
        </button>
      </form>
    );
  return (
    <div className="ds-row ds-project-actions">
      <button type="button" className="ds-pad ds-pad--small" disabled={busy} onClick={() => setRenaming(true)}>
        Rinomina
      </button>
      <button type="button" className="ds-pad ds-pad--small" disabled={busy} onClick={() => void duplicate()}>
        Duplica
      </button>
      <button type="button" className="ds-pad ds-pad--small ds-pad--danger" disabled={busy} onClick={remove}>
        Elimina
      </button>
      {error && (
        <span className="ds-message" data-tone="error" role="alert">
          Non ci sono riuscito: {error}
        </span>
      )}
    </div>
  );
}
