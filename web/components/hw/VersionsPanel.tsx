"use client";

import { useEffect, useState } from "react";
import { listVersions, type Version } from "@/lib/daw/versions";

// Pannello della cronologia: salva una versione con un nome, oppure ripristinane una.
export function VersionsPanel({
  projectId,
  refresh,
  onSave,
  onRestore,
  onClose,
}: {
  projectId: string;
  refresh: number; // cambia quando è stata salvata una versione nuova
  onSave: (label: string) => Promise<void>;
  onRestore: (v: Version) => Promise<void>;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void listVersions(projectId).then((v) => alive && setVersions(v));
    return () => {
      alive = false;
    };
  }, [projectId, refresh]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <section className="hw-panel hw-versions" aria-label="Versioni del progetto">
      <div className="hw-seq-head">
        <h2 className="hw-title">Versioni</h2>
        <button type="button" className="hw-btn hw-btn--small" onClick={onClose}>
          Chiudi
        </button>
      </div>
      <form
        className="hw-versions-save"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave(label.trim() || "Salvata a mano");
          setLabel("");
          setBusy(false);
        }}
      >
        <label className="hw-visually-hidden" htmlFor="nome-versione">
          Nome della versione
        </label>
        <input
          id="nome-versione"
          className="ds-input"
          value={label}
          maxLength={80}
          placeholder="Nome della versione, es. “drop con open hat”"
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" className="hw-btn hw-btn--small" disabled={busy}>
          Salva versione
        </button>
      </form>
      {versions === null ? (
        <p className="hw-hint">Carico…</p>
      ) : versions.length === 0 ? (
        <p className="hw-hint">
          Ancora nessuna versione. Si salvano da sole prima di ogni modifica del coach e ogni 10 minuti di lavoro.
        </p>
      ) : (
        <ul className="hw-versions-list">
          {versions.map((v) => (
            <li key={v.id}>
              <span>
                <strong>{v.label}</strong>
                <span className="hw-value">
                  {when(v.created_at)} · {v.title}
                </span>
              </span>
              <button
                type="button"
                className="hw-btn hw-btn--small"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onRestore(v);
                  setBusy(false);
                }}
              >
                Ripristina
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hw-hint">Prima di ripristinare salvo la versione attuale, così puoi sempre tornare indietro.</p>
    </section>
  );
}
