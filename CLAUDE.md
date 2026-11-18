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
            0004 progetti dello studio (projects) + coach_messages.project_id, 0005 cronologia (project_versions),
            0006–0007 segnalazioni dallo studio (tabella segnalazioni, limite di 30 al giorno con un trigger)
web/        app Next.js 15 (login, studio, nuova analisi, stato job, privacy); design/tokens.css =
            unica fonte di colori e stili (palette "Neon morbido"; font Geist, Chakra Petch, Geist Mono
            caricati in app/layout.tsx con next/font). Collegamento a Supabase e Vercel: docs/DEPLOY.md
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
  A–P + canzone da 16 a 256 battute; lead polifonico, fino a 6 note per step; fino a 3 accordi per battito; `normalize()` converte i progetti v1; `describe()` per il coach), `web/lib/daw/graph.ts` (suoni sintetizzati, kit di batteria in `kits.ts`, mixer, sidechain: usato
  in tempo reale e per l'export), `web/lib/daw/engine.ts` (l'orologio del sequencer, swing, pattern/song), `Daw.tsx` (UI, salvataggio automatico in `projects`). Coach dello studio:
  `/api/coach/crea` + `lib/coach/prompt-crea.ts`; il coach scrive nello studio con gli strumenti di
  `lib/daw/coach-tool.ts` (scrivi_pattern, scrivi_canzone, scrivi_effetti con i plugin); plugin degli insert in `lib/daw/plugins.ts`; streaming condiviso in `lib/coach/stream.ts`.
- **Tour guidato** (`web/app/studio/crea/[id]/Tour.tsx`): 14 tappe scritte a mano (`TOUR`), evidenzia la parte
  dello studio e apre la vista giusta; parte da solo la prima volta (`user_metadata.tour_done` nell'account,
  più `ds-tour-visto` nel browser), pulsante Tutorial per rivederlo; voce del coach se accesa. Su telefono salta
  le tappe `wide`.
  Al primo login (`auth/callback`), se l'account non ha progetti e non ha visto il tour, si crea un progetto
  (`lib/daw/new-project.ts`) e si apre subito: il tour parte senza passare dalla pagina "Il tuo studio".
- **Lunghezza delle note** (basso e lead): `pattern.len` (chiavi `lenKey`: `b5`, `l5:72`; solo note da 2 step in su,
  `setNoteLen`/`maxLen`/`noteLen` in `project.ts`: dentro la battuta, senza coprire la nota dopo). Nel Roll: premi e
  trascini = disegni o allunghi, clic su una nota = la togli, pennello = lunghezza dell'ultima; in registrazione la
  nota dura quanto tieni il tasto. Coach: campo `lunghezza` in `scrivi_pattern` (`crea-v20`).
- **Velocity**: `pattern.vel` (chiavi `hat3`, `b5`, `l5` = tutte le note del lead dello step, `c2` = accordi del
  battito; 0.1–1, `VEL_DEFAULT` 0.8 = come prima e non si salva; `velGain` = v/0.8). Nel Beat il pulsante Vel: trascini
  su e giù sulle barre (il clic non accende step). Coach: campo `velocity` in `scrivi_pattern` (`crea-v21`).
- **Tastiera MIDI** (`lib/daw/midi.ts`, Web MIDI: Chrome/Edge, non Safari): pulsante MIDI accanto al titolo dei pad;
  nel Roll suona lo strumento della scheda (`playKey` con `midi`, nota portata nell'estensione con `fold`), altrove i
  tasti 35–51 suonano la batteria (mappa General MIDI, `gmDrum`). Con REC scrive nota, lunghezza (quanto tieni il
  tasto, `releaseKey`) e velocity (`midiVel`: 1–127 → 0.1–1). Si ricollega da solo se il permesso è già dato.
- **Segnala un problema** (`Segnala.tsx`): pulsante Segnala nella barra delle viste (sul telefono sotto il coach);
  salva messaggio, vista, progetto e dati tecnici (browser, schermo) in `segnalazioni` (RLS: ognuno le sue; 30 al
  giorno). Si leggono da Supabase → Table editor → segnalazioni. (La tabella `feedback` è un'altra cosa: M4.)
- **Mixer e bus**: ogni canale esce sul master o in un bus (`mixer.X.out`); i bus (`buses`, `BUS_IDS`) hanno fader
  (`BUS_UNITY` = 0 dB), mute e 8 insert, poi vanno al master. In `graph.ts` il routing si ricollega in `applyMixer`.
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

## Prossimi passi (chiesti da Francesco l'11 nov 2026, da fare alla ripresa)

1. ~~Plugin~~ **fatto il 12 nov**: 8 slot di insert per canale e master (`web/lib/daw/plugins.ts`), 12 plugin
   (EQ, Compressore, Saturazione, Lo-fi, Chorus, Phaser, Auto filter, Tremolo, Auto-pan, Delay, Riverbero,
   Stereo); pulsante FX nel Mixer.
2. ~~Tasto REC in alto~~ **fatto il 12 nov**: REC e "Registra" sono lo stesso interruttore (fanno partire il Play).
3. ~~Vista Accordi~~ **tolta il 12 nov**: accordi e Chord synth nella scheda Chord del Roll.
4. ~~Suoni nuovi~~ **fatti il 13 nov**: basso 7 suoni, accordi 6, lead 8, kit 6 (nomi e descrizioni in
   `project.ts`: `BASS_WAVES`, `CHORD_STYLES`, `LEAD_SOUNDS`; kit in `kits.ts`). Tastiera senza interruttore:
   nel Roll suona le note, altrove i pad.
5. ~~Solo~~ **fatto il 13 nov**: pulsante S nel Mixer, nelle righe del Beat e nel Roll; Ctrl+clic per più canali;
   vale in Pattern e Song, non si salva e non entra nell'export.
6. ~~Suono per pattern~~ **fatto il 13 nov**: interruttore Tutti / Solo X nei synth del Roll (`patterns.X.sounds`,
   `soundOf()` in `project.ts`); pulsanti dei pattern anche nel Roll.

**Per il 14 nov (chiesto da Francesco il 13 nov):**
- Controllo generale dello studio con Francesco (tutte le viste, suoni, Solo, plugin, export, coach).
- ~~Link per gli amici~~ **fatto il 14 nov**: https://deep-studio-azure.vercel.app (Accedi con link magico; al primo
  login si apre subito un progetto con il tour). Le segnalazioni per ora arrivano a Francesco su WhatsApp.
- ~~Pulsante "Segnala un problema"~~ **fatto il 17 nov** (vedi "Cose da sapere").
  Prima segnalazione (17 nov, Francesco): "non riesco a mettere gli effetti sul lead" dal Roll → ~~fatto~~: pulsante FX
  accanto al nome del synth nel Roll (`fxJump` in `Daw.tsx`), apre il Mixer con gli insert di quello strumento.
- ~~Tutorial~~ **fatto il 14 nov**: tour guidato del coach alla prima apertura dello studio (vedi "Cose da sapere").
- ~~Count-in~~ **fatto il 14 nov**: REC da fermo suona 4 click (una battuta, il primo più acuto) e poi parte;
  il display conta 4-3-2-1; interruttore "1234" accanto a Registra (scelta salvata nel browser). Click in
  `graph.ts` (`click()`, dritto alle casse, non entra nell'export), conto in `engine.ts` (`start(fromBar, countIn)`).

**Prova di un amico (15 nov):**
- ~~Automazioni che "saltano" al cambio di pattern~~ **corretto**: la rampa del filtro finiva esattamente all'inizio della
  battuta dopo; per un arrotondamento a volte veniva cancellata e il filtro restava fermo tutta la battuta (a 120, 128,
  140 BPM; anche nell'export). Ora finisce 1 ms prima (`automateBar` in `graph.ts`).
- ~~Legato del lead: note che si sovrappongono~~ **corretto**: con Legato una nota nuova chiude quelle di prima
  (`voiceGain` in `graph.ts`, come un synth mono; le note dello stesso step restano insieme); l'ultima nota tiene al
  massimo fino a fine battuta. Il basso è sempre mono.
- ~~Non si capisce dove si scrivono gli accordi~~ **fatto**: riga Chord nel Beat (un accordo per battito); le righe Bass,
  Lead e Chord del Beat portano al Roll con un clic.
- ~~Routing del mixer~~ **fatto il 15 nov**: 4 bus come in FL (`buses`, `mixer.X.out`, insert sui bus; ADR); nei
  progetti nuovi la batteria entra nel bus Drums. Uscita sotto ogni canale, "+ Bus" nella striscia del Master.

**17 nov:** ~~Lunghezza delle note nel Roll~~ **fatta** (vedi "Cose da sapere"). ~~Annulla/Ripeti~~ **fatto**: Ctrl+Z,
Ctrl+Y / Ctrl+Shift+Z e i pulsanti ↶ ↷ accanto a Versioni; pila di 100 passi in `Daw.tsx` (`remember`, `undoEdit`,
`redoEdit`): ogni `update` salva il progetto di prima, le modifiche entro 450 ms diventano un passo solo; il coach e i
ripristini sono sempre un passo a sé. Non si salva tra una visita e l'altra. ~~Velocity e accenti~~ **fatti** (vedi
"Cose da sapere").

**Idee per i prossimi giorni (lista del 17 nov; ✱ = consigliate per prime):**
- Studio: ~~tastiera MIDI vera~~ **fatta il 18 nov**; pattern da 2 o 4 battute; ✱ export MIDI e
  degli stem (ponte verso FL); più strumenti (secondo lead, pad, perc); sample propri (spazio file, licenze); Roll più
  comodo (selezione multipla, copia/incolla, trasposizione, quantize, velocity per nota); automazioni di volume, send,
  plugin e bus; send verso i bus e bus dentro bus; metronomo durante la registrazione.
- Coach: ✱ lezioni guidate ("missioni" con controllo di quello che hai fatto); parere in tempo reale (es. basso che
  copre il kick).
- Prodotto: pagina delle segnalazioni nel sito (solo per Francesco); link di ascolto pubblico; email di accesso con
  SMTP (oltre 3–4 amici); controllo generale dello studio (dal 14 nov).
- Codice: dividere `Daw.tsx` (oltre 2.500 righe) in componenti; test Playwright nel repo; M2 worker su Modal (serve Spencer).

Fatti l'10–11 nov: marker di inizio della canzone, tastiera musicale (typing keyboard), Roll con Bass/Lead/Chord,
registrazione quantizzata, lead polifonico (6 voci), accordi sovrapposti (3 per battito), limiter, 16 pattern,
canzoni fino a 256 battute.

## Milestone

- **M1 · Scheletro** (ora): login, upload mix e stem, stato del job in tempo reale, pagina privacy.
  Prompt passo per passo in `docs/PROMPT-M1.md`.
- **M2 · Analisi**: worker Modal + JSON 1.0 in `analyses` (serve la conferma dello stack da Spencer).
  Intanto c'è `analysis/worker_locale.py`: stesso lavoro, ma gira sul PC (niente Demucs, niente coach),
  e la pagina del job mostra i risultati (`web/components/AnalysisResults.tsx`) quando è "pronta".
- **M3 · Coach**, **M4 · Note e memoria**: vedi `docs/USER-STORIES-FASE1.md`.
