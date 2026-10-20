"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Dropzone } from "@/components/Dropzone";
import { Segmented } from "@/components/Segmented";
import {
  AUDIO_EXTENSIONS,
  EXPORTS,
  MAX_FILE_BYTES,
  STAGES,
  SUBGENRES,
  type ExportKind,
  type Stage,
  type Subgenre,
} from "@/lib/options";
import { ROLES, roleOf, type StemRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";

type ExistingTrack = { id: string; title: string; subgenre: Subgenre };
type Item = { key: string; file: File; kind: "mix" | "stem"; role: StemRole | null };
type FileState = "attesa" | "caricamento" | "ok" | "errore";

function checkFile(f: File): string | null {
  const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
  if (!AUDIO_EXTENSIONS.includes(ext)) return `${f.name}: serve un WAV o un FLAC.`;
  if (f.size > MAX_FILE_BYTES) return `${f.name}: supera i 500 MB.`;
  return null;
}

function safeName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_");
}

let counter = 0;
const newKey = () => `f${++counter}`;

export function NewAnalysisForm({ tracks }: { tracks: ExistingTrack[] }) {
  const router = useRouter();
  const [trackId, setTrackId] = useState(""); // "" = traccia nuova
  const [title, setTitle] = useState("");
  const [subgenre, setSubgenre] = useState<Subgenre | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [exportKind, setExportKind] = useState<ExportKind | null>(null);
  const [mix, setMix] = useState<Item | null>(null);
  const [stems, setStems] = useState<Item[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [fileState, setFileState] = useState<Record<string, FileState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quello che è già stato creato resta qui: "Riprova" riparte da dove si era fermato.
  const created = useRef<{ trackId?: string; versionId?: string; done: Set<string> }>({ done: new Set() });
  const started = created.current.versionId !== undefined;

  const existing = tracks.find((t) => t.id === trackId);
  const effectiveSubgenre = existing ? existing.subgenre : subgenre;
  const ready = (existing || title.trim()) && effectiveSubgenre && stage && exportKind && mix;
  const items = [mix, ...stems].filter((x): x is Item => x !== null);
  const doneCount = items.filter((i) => fileState[i.key] === "ok").length;

  function addMix(files: File[]) {
    const f = files[0];
    if (!f) return;
    const err = checkFile(f);
    setFileErrors(err ? [err] : []);
    if (!err) setMix({ key: newKey(), file: f, kind: "mix", role: null });
  }

  function addStems(files: File[]) {
    const errs: string[] = [];
    const ok: Item[] = [];
    for (const f of files) {
      const err = checkFile(f);
      if (err) errs.push(err);
      else ok.push({ key: newKey(), file: f, kind: "stem", role: roleOf(f.name) });
    }
    setFileErrors(errs);
    setStems((s) => [...s, ...ok]);
  }

  async function analizza() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const c = created.current;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessione scaduta: rientra da /accedi.");

      // 1. traccia (nuova o esistente)
      if (!c.trackId) {
        if (existing) c.trackId = existing.id;
        else {
          const { data, error } = await supabase
            .from("tracks")
            .insert({ title: title.trim(), subgenre: effectiveSubgenre })
            .select("id")
            .single();
          if (error) throw error;
          c.trackId = data.id;
        }
      }

      // 2. versione: la prossima libera per questa traccia
      if (!c.versionId) {
        const { data: last } = await supabase
          .from("track_versions")
          .select("version_no")
          .eq("track_id", c.trackId)
          .order("version_no", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { data, error } = await supabase
          .from("track_versions")
          .insert({
            track_id: c.trackId,
            version_no: (last?.version_no ?? 0) + 1,
            stage,
            export_kind: exportKind,
          })
          .select("id")
          .single();
        if (error) throw error;
        c.versionId = data.id;
      }

      // 3. file, uno alla volta, nel percorso <utente>/<traccia>/<versione>/
      let failed = 0;
      for (const [i, item] of items.entries()) {
        if (c.done.has(item.key)) continue;
        setFileState((s) => ({ ...s, [item.key]: "caricamento" }));
        const prefix = item.kind === "mix" ? "mix" : `stem-${String(i).padStart(2, "0")}`;
        const path = `${user.id}/${c.trackId}/${c.versionId}/${prefix}-${safeName(item.file.name)}`;
        const up = await supabase.storage
          .from("audio")
          .upload(path, item.file, { contentType: item.file.type || "audio/wav" });
        // se esiste già, è un "Riprova" dopo un caricamento riuscito a metà: va bene così
        const alreadyThere = up.error && /exists|duplicate/i.test(up.error.message);
        if (up.error && !alreadyThere) {
          failed++;
          setFileState((s) => ({ ...s, [item.key]: "errore" }));
          continue;
        }
        const { error } = await supabase.from("uploads").insert({
          version_id: c.versionId,
          kind: item.kind,
          role: item.role,
          file_name: item.file.name,
          storage_path: path,
          size_bytes: item.file.size,
        });
        if (error && !/duplicate/i.test(error.message)) {
          failed++;
          setFileState((s) => ({ ...s, [item.key]: "errore" }));
          continue;
        }
        c.done.add(item.key);
        setFileState((s) => ({ ...s, [item.key]: "ok" }));
      }
      if (failed > 0) throw new Error(`${failed} file non caricati. Controlla la connessione e premi Riprova.`);

      // 4. il job "in coda": da qui in poi lavora il worker
      const { data: job, error } = await supabase
        .from("jobs")
        .insert({ version_id: c.versionId })
        .select("id")
        .single();
      if (error) throw error;
      router.push(`/studio/analisi/${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <form
      className="ds-stack"
      onSubmit={(e) => {
        e.preventDefault();
        analizza();
      }}
    >
      {tracks.length > 0 && (
        <div className="ds-field">
          <label htmlFor="traccia" className="ds-label">
            Traccia
          </label>
          <select
            id="traccia"
            className="ds-select"
            value={trackId}
            disabled={started}
            onChange={(e) => setTrackId(e.target.value)}
          >
            <option value="">Traccia nuova</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                Nuova versione di “{t.title}”
              </option>
            ))}
          </select>
        </div>
      )}

      {!existing && (
        <>
          <div className="ds-field">
            <label htmlFor="titolo" className="ds-label">
              Titolo
            </label>
            <input
              id="titolo"
              className="ds-input"
              value={title}
              disabled={started}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sunset"
            />
          </div>
          <Segmented
            label="Sottogenere"
            options={SUBGENRES}
            value={subgenre}
            onChange={setSubgenre}
            disabled={started}
          />
        </>
      )}

      <Segmented label="Stadio" options={STAGES} value={stage} onChange={setStage} disabled={started} />
      <div>
        <Segmented
          label="Export"
          options={EXPORTS}
          value={exportKind}
          onChange={setExportKind}
          disabled={started}
        />
        <p className="ds-hint">Consiglio: esporta sempre anche senza master chain.</p>
      </div>

      <div className="ds-field">
        <span className="ds-label">Mix (WAV 24 bit)</span>
        {mix ? (
          <ul className="ds-list">
            <li>
              <span>{mix.file.name}</span>
              <span className="ds-meta">{fileState[mix.key] ?? `${(mix.file.size / 1e6).toFixed(1)} MB`}</span>
              {!started && (
                <button type="button" className="ds-icon-button" aria-label="Togli il mix" onClick={() => setMix(null)}>
                  ×
                </button>
              )}
            </li>
          </ul>
        ) : (
          <Dropzone label="Trascina qui il mix o clicca per sceglierlo" onFiles={addMix} />
        )}
      </div>

      <div className="ds-field">
        <span className="ds-label">Stem (facoltativi)</span>
        {!started && (
          <Dropzone label="Trascina gli stem di “Split mixer tracks”" multiple onFiles={addStems} />
        )}
        {stems.length > 0 && (
          <ul className="ds-list">
            {stems.map((s) => (
              <li key={s.key}>
                <span>{s.file.name}</span>
                <span className="ds-row">
                  {fileState[s.key] && <span className="ds-meta">{fileState[s.key]}</span>}
                  <label className="ds-visually-hidden" htmlFor={`ruolo-${s.key}`}>
                    Ruolo di {s.file.name}
                  </label>
                  <select
                    id={`ruolo-${s.key}`}
                    className="ds-select"
                    value={s.role ?? "other"}
                    disabled={started}
                    onChange={(e) =>
                      setStems((all) =>
                        all.map((x) => (x.key === s.key ? { ...x, role: e.target.value as StemRole } : x)),
                      )
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {!started && (
                    <button
                      type="button"
                      className="ds-icon-button"
                      aria-label={`Togli ${s.file.name}`}
                      onClick={() => setStems((all) => all.filter((x) => x.key !== s.key))}
                    >
                      ×
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="ds-hint">
          Senza stem va bene lo stesso, ma con kick e bassline separati l’analisi del low end è molto più precisa.
        </p>
      </div>

      {fileErrors.map((e) => (
        <p key={e} className="ds-message" data-tone="error" role="alert">
          {e}
        </p>
      ))}

      {busy && items.length > 0 && (
        <div className="ds-field" aria-live="polite">
          <div className="ds-progress">
            <span style={{ width: `${(doneCount / items.length) * 100}%` }} />
          </div>
          <p className="ds-hint">
            {doneCount} di {items.length} file caricati
          </p>
        </div>
      )}

      {error && (
        <p className="ds-message" data-tone="error" role="alert">
          {error}
        </p>
      )}

      <div className="ds-row ds-row--between">
        <p className="ds-hint">
          L’audio resta privato e si cancella dopo 30 giorni · <Link href="/privacy">Privacy</Link>
        </p>
        <button type="submit" className="ds-pad ds-pad--primary" disabled={!ready || busy}>
          {busy ? "Carico…" : error && started ? "Riprova" : "Analizza"}
        </button>
      </div>
    </form>
  );
}
