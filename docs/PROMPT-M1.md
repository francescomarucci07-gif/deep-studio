# Deep Studio · Prompt per Claude Code, M1 · Scheletro

Apri la cartella `deep-studio` nel terminale, avvia `claude` e incolla un prompt alla volta.
Passa al successivo solo quando il passo funziona e sai spiegare cosa fa.
Claude Code legge da solo `CLAUDE.md`.

Per vedere un passo nel terminale: `python passi.py 3` (oppure `python passi.py` per l'elenco).

**Aggiornamento 20 ott 2026:** il codice dei Passi 2 e 4–7 è già in `web/`. Su quei passi
Claude Code deve **controllare e spiegarti** il codice esistente (non riscriverlo) e aiutarti a
provarlo; per collegare Supabase e Vercel segui `docs/DEPLOY.md`.

Prima di cominciare:

- Node.js 20 o più recente.
- Python 3.11 o più recente.
- Git.
- Docker Desktop acceso (serve a `supabase start`).
- Un account Supabase, piano Free per lo sviluppo: il piano Pro serve solo con utenti veri (vedi P6).
- La Supabase CLI.

Le chiavi vanno in `web/.env.local` e non si incollano mai nella chat.

## Passo 0 · Controllo dell'ambiente

```
Leggi CLAUDE.md e docs/USER-STORIES-FASE1.md. Poi controlla che sul mio PC ci siano Node, Python, Git, Docker e la Supabase CLI, e dimmi cosa manca e come installarlo. Crea il repository git con un .gitignore adatto (deve escludere audio, .env e riferimenti_*.json) e un primo commit sul branch m1-scheletro. Non installare niente senza chiedermelo.
```

Atteso: elenco di cosa c'è e cosa manca; primo commit sul branch `m1-scheletro`.

## Passo 1 · I test dell'analisi

```
Installa numpy, scipy, jsonschema e pytest in un ambiente virtuale in analysis/.venv e lancia python -m pytest analysis/tests -q. Spiegami cosa verificano i test e cosa vuol dire il risultato.
```

Atteso: 13 test passati in pochi secondi.

## Passo 2 · L'app Next.js vuota con lo stile Deep Studio

```
Crea l'app Next.js in web/ (App Router, TypeScript, ESLint, niente Tailwind) senza cancellare web/design/. Importa web/design/tokens.css nel CSS globale e fai una home che mostri un solo modulo .ds-module con il titolo DEEP STUDIO e un pulsante .ds-pad. Usa solo i token. Spiegami la struttura delle cartelle di Next.js.
```

Atteso: `npm run dev` apre una pagina scura con un modulo "hardware".

## Passo 3 · Supabase locale e schema del database

```
Inizializza Supabase in locale (supabase init, supabase start) e applica db/migrations/0001_init.sql copiandolo in supabase/migrations/ e lanciando supabase db reset. Alza file_size_limit dello storage a 500MiB in supabase/config.toml. Spiegami ogni tabella e come funziona la row-level security, con un esempio: perché Spencer non può vedere le mie tracce.
```

Atteso: Supabase Studio (http://localhost:54323) mostra le tabelle e il bucket privato `audio`.

## Passo 4 · Login (storia 1)

```
Aggiungi il login a web/ con Supabase Auth via email con link magico, usando @supabase/ssr. Pagina /accedi e pagina /studio protetta. Fai un test manuale con due utenti e mostrami che ognuno vede solo i propri dati. Controlla la licenza di ogni pacchetto che aggiungi.
```

Atteso: in locale le email arrivano in Inbucket/Mailpit (http://localhost:54324).

## Passo 5 · Upload del mix e degli stem (storie 2 e 3)

```
Crea la schermata "Nuova analisi" seguendo docs/MOCKUP-P5.md: titolo, sottogenere (deep/tech/progressive), stadio (idea grezza/mix a metà/finita), export (con/senza master), il mix e gli stem facoltativi. I file vanno nel bucket privato audio di Supabase Storage nel percorso <utente>/<traccia>/<versione>/. Il ruolo degli stem si ricava dall'ultima parola del nome con la stessa logica di role_of() in analysis/deep_studio_analyze.py, e si può correggere a mano. Alla fine crea le righe in tracks, track_versions, uploads e un job "in coda".
```

## Passo 6 · Stato dell'analisi (storia 4)

```
Crea la schermata "Analisi in corso" che legge lo stato del job da Supabase in tempo reale e lo mostra come una fila di LED (in coda → in analisi → separazione stem → coach → pronta), con un messaggio chiaro e il pulsante "riprova" (funzione retry_job) in caso di errore. Per provarla aggiungi uno script di sviluppo che fa avanzare gli stati a mano.
```

## Passo 7 · Pagina privacy (storia 5)

```
Crea la pagina /privacy dal testo della storia 5 in docs/USER-STORIES-FASE1.md. Poi rivedi tutta la M1 contro i criteri di finito delle storie 1–5 e dimmi cosa manca.
```

Fine della M1: tutti e due potete fare login, caricare una traccia e vederla in coda.
Poi si passa alla M2: il worker Modal che esegue `analysis/deep_studio_analyze.py` e salva il
JSON 1.0. Per quel passo serve la conferma dello stack da parte di Spencer.
