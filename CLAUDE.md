# Deep Studio

Coach di mixaggio per producer **house** (deep, tech, progressive) che lavorano in **FL Studio**.
Il producer carica il mix (e gli stem, se vuole); l'analisi misura la traccia; il coach (Claude API)
scrive 3–5 note prioritarie con passi concreti in FL Studio.

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
db/         migrations/0001_init.sql (tabelle, RLS, bucket audio, realtime)
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

- **Ruolo degli stem**: `role_of()` in `analysis/deep_studio_analyze.py` usa l'ultima parola del
  nome file (`Sunset_Kick.wav` → kick). La dashboard deve usare **la stessa tabella** (`ROLE_WORDS`);
  i ruoli validi sono anche l'enum `stem_role` nel database.
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
