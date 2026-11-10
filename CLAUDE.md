# Deep Studio

Studio per creare musica **house** (deep, tech, progressive) nel browser, con un coach AI (Claude API) che
vede il progetto mentre lo crei e ti insegna, anche a voce (ElevenLabs). Resta anche il percorso per chi
produce in **FL Studio**: carichi il mix, l'analisi lo misura e il coach spiega cosa sistemare.
Decisione del 3 nov 2026: `docs/ADR-0001-studio-nel-browser.md` (da confermare con Spencer).

- **Francesco**: product e sviluppo, impara a costruire e mantenere il codice.
- **Spencer**: guida il P6 (architettura e stack), conferma le decisioni difficili da cambiare.

> Questo file e gran parte di `docs/`, `db/`, `web/design/` e `analysis/tests/` sono stati
> ricostruiti il 20 ott 2026 perché gli originali non erano su Drive. Se ritrovi gli originali,
> confrontali con questi prima di sostituirli.

## Come lavorare con Francesco (modalità insegnamento)

1. Prima del codice: un paragrafo su cosa costruiamo e dove si inserisce nel sistema.
2. Passi piccoli: ogni passo funziona da solo e mostra un risultato visibile.
3. Dopo il codice: "cosa è successo", in parole semplici, con i file toccati.
4. Concetti nuovi: spiegali una volta, con un'analogia musicale se aiuta.
5. Commenti nel codice solo dove il *perché* non è ovvio.
6. Parla in italiano; termini tecnici in inglese (sidechain, insert, low end).
7. **Non installare niente senza chiedere.** Controlla la licenza di ogni pacchetto nuovo:
   niente AGPL nel prodotto ospitato senza una decisione esplicita.

## Regole

- **Segreti** solo in variabili d'ambiente (`web/.env.local`, mai su git). Non chiedere e non
  incollare chiavi in chat. La service role key di Supabase si usa solo lato server/script locali.
- **L'audio non va mai su git** (`.gitignore` esclude wav/flac/mp3, `riferimenti_*.json`, `.env`).
- **Row-level security su ogni tabella**: ogni riga ha `owner_id`; l'utente vede solo le sue.
- **Bucket privato** `audio`, percorso `<utente>/<traccia>/<versione>/<file>`, audio cancellato
  dopo 30 giorni (proposta, da confermare).
- **Costi**: dal primo giorno registra token Claude e secondi di calcolo per analisi.
- **Decisioni difficili da cambiare**: un breve ADR in `docs/` (contesto, opzioni, decisione, conseguenze).

## Stack (proposta P6, da confermare con Spencer)

| Parte | Scelta |
| :--- | :--- |
| Dashboard | Next.js (App Router, TypeScript, niente Tailwind) su Vercel |
| Dati, login, file | Supabase: Postgres, Auth (link magico, `@supabase/ssr`), Storage, Realtime; regione UE |
| Analisi | Python 3.11+, numpy/scipy (`analysis/deep_studio_analyze.py`) |
| Worker (M2) | Modal: prende i job, Demucs (MIT) se mancano gli stem, salva il JSON 1.0 |
| Coach (M3) | Claude API dal server, prompt versionati |

## Struttura

```
analysis/   deep_studio_analyze.py (v0.3, JSON 1.0), schema 1.0, tests/, script di prova P3/P4
db/         migrations/ 0001 init (tabelle, RLS, bucket, realtime), 0002 advisor, 0003 strumenti + coach,
            0004 progetti dello studio (projects) + coach_messages.project_id, 0005 cronologia (project_versions)
web/        app Next.js 15 (login, studio, nuova analisi, stato job, privacy); design/tokens.css =
            unica fonte di colori e stili. Collegamento a Supabase e Vercel: docs/DEPLOY.md
docs/       USER-STORIES-FASE1.md, MOCKUP-P5.md, P6 architettura, LEGGIMI analisi, PROMPT-M1.md
```

## Comandi

```bash
# analisi (dalla radice del progetto)
python -m venv analysis/.venv
# Windows: analysis\.venv\Scripts\activate   ·   Mac/Linux: source analysis/.venv/bin/activate
pip install numpy scipy soundfile jsonschema pytest
python -m pytest analysis/tests -q          # 17 test, pochi secondi
python analysis/deep_studio_analyze.py <cartella-wav> --sottogenere deep --stadio finita

# worker locale (prototipo M2): prende i job in coda da Supabase e salva le analisi
# doppio clic su avvia-worker.bat (Windows) o avvia-worker.command (Mac): prepara tutto da solo
python analysis/worker_locale.py            # legge URL e service role key da web/.env.local

# database locale (serve Docker acceso)
supabase init
supabase start
# applica la migrazione: copiala nella cartella delle migrazioni della CLI e resetta
#   cp db/migrations/0001_init.sql supabase/migrations/20261020000000_init.sql
#   supabase db reset
# in supabase/config.toml: [storage] file_size_limit = "500MiB" (i WAV superano i 50 MB)

# dashboard
cd web && npm run dev
```

## Cose da sapere

- **Ruolo degli stem** (28 strumenti, voci comprese): tabella unica `analysis/stem_roles.json`, copia
  identica in `web/lib/stem-roles.json` (un test controlla che coincidano). `role_of()` (Python) e
  `roleOf()` (TS) usano le ultime due parole, poi l'ultima (`Backing Vocals` → backing_vox). I ruoli
  sono anche l'enum `stem_role` nel database: un ruolo nuovo = JSON (tutte e due) + `alter type`.
- **Voce**: per gli stem vox/backing_vox/vocal_chop/choir l'analisi aggiunge `vocal` (intonazione in
  cent con YIN, sibilanti, fango sotto 150 Hz, dinamica) e i controlli `intonazione`, `sibilanti`, `fango_voce`.
- **Coach (chat)**: `web/app/api/coach/route.ts` (Claude API, streaming, solo server; modello da
  `COACH_MODEL`, default `claude-sonnet-5-5` come da P6), istruzioni in `web/lib/coach/prompt.ts`
  (versionate), contesto = analisi compatta + versione precedente. Messaggi e costi in `coach_messages`.
  Serve `ANTHROPIC_API_KEY` tra le variabili di Vercel. Voce in/out con la Web Speech API del browser.
- **Studio nel browser** (`/studio/crea/[id]`): `web/lib/daw/project.ts` (formato del progetto v2: pattern
  A–D + canzone di 16 battute; `normalize()` converte i progetti v1; `describe()` per il coach), `web/lib/daw/graph.ts` (suoni sintetizzati, mixer, sidechain: usato
  in tempo reale e per l'export), `web/lib/daw/engine.ts` (l'orologio del sequencer, swing, pattern/song), `Daw.tsx` (UI, salvataggio automatico in `projects`). Coach dello studio:
  `/api/coach/crea` + `lib/coach/prompt-crea.ts`; il coach scrive nello studio con gli strumenti di
  `lib/daw/coach-tool.ts` (scrivi_pattern, scrivi_canzone, scrivi_effetti); streaming condiviso in `lib/coach/stream.ts`.
- **Export WAV**: `web/lib/daw/render.ts` suona la stessa catena di `graph.ts` in un OfflineAudioContext
  (Song = la canzone, Pattern = 4 giri) e scrive un WAV 24 bit / 44,1 kHz: si può caricare nell'analisi.
- **Parere del coach**: `web/lib/daw/measure.ts` misura il render nel browser (stesse misure dell'analisi
  Python); `Daw.tsx` le manda a `/api/coach/crea` nel campo `misure` (solo per Claude, non salvate).
- **Cronologia**: `project_versions` (ultime 60 per progetto, trigger di pulizia); il browser salva una versione
  alla prima modifica, prima di ogni modifica del coach, ogni 10 minuti e a mano (`lib/daw/versions.ts`).
- **Voce**: `/api/voce` → ElevenLabs (variabili `ELEVENLABS_API_KEY`, opzionali `ELEVENLABS_VOICE_ID`,
  `ELEVENLABS_MODEL`), voci in `lib/voices.ts`; senza chiave si usa la voce del browser.
- **Stati del job** (enum `job_status`): `in_coda → in_analisi → separazione_stem → coach → pronta`,
  più `errore`. L'utente crea solo job `in_coda` e può rimettere in coda un job in errore con
  `retry_job(id)`; tutti gli altri cambi di stato li fa il worker.
- **Stadi** nel database: `idea_grezza`, `mix_a_meta`, `finita` (nell'analisi: "idea grezza",
  "mix a meta'", "finita").
- **Limite file**: un WAV 24 bit di 6 minuti pesa ~100 MB; il piano Free hosted di Supabase ha un
  limite di 50 MB per file (per gli utenti veri serve il piano Pro, P6).
- Le soglie dei "checks" nell'analisi sono provvisorie: si tarano sulle note gold (P2).

## Milestone

- **M1 · Scheletro** (ora): login, upload mix e stem, stato del job in tempo reale, pagina privacy.
  Prompt passo per passo in `docs/PROMPT-M1.md`.
- **M2 · Analisi**: worker Modal + JSON 1.0 in `analyses` (serve la conferma dello stack da Spencer).
  Intanto c'è `analysis/worker_locale.py`: stesso lavoro, ma gira sul PC (niente Demucs, niente coach),
  e la pagina del job mostra i risultati (`web/components/AnalysisResults.tsx`) quando è "pronta".
- **M3 · Coach**, **M4 · Note e memoria**: vedi `docs/USER-STORIES-FASE1.md`.
