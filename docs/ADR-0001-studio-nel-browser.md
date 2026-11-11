# ADR-0001 · Studio nel browser con coach integrato

Data: 3 nov 2026 · Deciso da: Francesco · **Da confermare con Spencer** (cambia il P6)

## Contesto

Primo test vero del prototipo (traccia "pause", 26 ott – 3 nov): il percorso mix → analisi → coach funziona,
ma Francesco giudica design, testo e voce non all'altezza. Soprattutto vuole **produrre dentro Deep Studio**,
"un po' come FL Studio", con l'AI che fa da coach mentre si crea, non solo dopo l'export.

## Opzioni

1. **Restare un coach per FL Studio**: migliorare testo, voce e design; in Fase 2 uno script FL legge mixer e plugin.
2. **Mini-DAW nel browser**: step sequencer, piano roll del basso, mixer; il coach vede il progetto in tempo reale.
3. Entrambe a tappe.

## Decisione

Opzione 2, tenendo il percorso "analizza un mix" che esiste già (serve a chi produce in FL).

- Audio con la **Web Audio API** del browser: suoni sintetizzati (kick, clap, hat, perc, basso), nessuna libreria.
  Tone.js (MIT) resta un'opzione se servono sample, effetti e arrangiamento.
- Progetto salvato come JSON in `projects.data` (migrazione 0004), RLS come le altre tabelle.
- Il coach riceve lo stato del pattern come griglie di testo (`lib/daw/project.ts → describe`), risponde in 2–4 frasi
  (prompt `crea-v1`), conversazione in `coach_messages.project_id`.
- Voce del coach con **ElevenLabs** (`/api/voce`, chiave solo lato server), 6 voci italiane selezionabili;
  ripiego sulla voce del browser se ElevenLabs non è configurato.

## Conseguenze

- Il prodotto si allontana dal "Gate" originale (note gold sui mix): le metriche di qualità del coach vanno ripensate.
- Nuovo fornitore e costo: ElevenLabs si paga a caratteri (le risposte del coach sono 200–500 caratteri).
- Una DAW cresce in fretta: prossimi passi in ordine — più battute e arrangiamento, accordi/pad, sample,
  effetti (riverbero, delay, filtro), il coach che propone modifiche applicabili con un clic, export WAV.
- Il piano Supabase Free mette in pausa il progetto dopo una settimana senza uso (successo il 3 nov):
  con utenti veri serve il piano Pro, come già previsto nel P6.

## Aggiornamento 3 nov 2026 (sera)

- Interfaccia da console hardware: display LCD, tasti di trasporto con LED, manopole (`components/hw/Knob.tsx`),
  drum pad in gomma (tastiera Z X C V B N, registrazione con Rec), step a colori tipo TR-808, mixer con fader.
- Il coach può **scrivere il pattern** (strumento `scrivi_pattern`, `lib/daw/coach-tool.ts`): spiega come lo
  costruisce, lo studio lo applica e si può annullare. Prompt `crea-v2`, risponde nella lingua del producer.
- Basso con note lunghe tipo 808 (`bassSound.length`), per trap e hip hop.

## Aggiornamento 9 nov 2026 · arrangiamento

- Il progetto passa alla versione 2: 4 pattern da una battuta (A–D) e una canzone di 16 battute (`song`).
  I progetti versione 1 diventano il pattern A in `normalize()`, nessuna migrazione del database.
- Console: tasti A–D (LED verde = pattern che suona), Duplica nel primo slot libero, Svuota,
  modalità Pattern/Song, fila delle battute (clic: A → B → C → D → vuota).
- Coach: secondo strumento `scrivi_canzone`; può scrivere più pattern e la canzone nella stessa risposta
  (prompt `crea-v3`), lingua dell'ultimo messaggio. Prova del 9 nov: beat trap scritto dal coach, costo $0,019.

## Aggiornamento 9 nov 2026 · cronologia e accordi

- Cronologia: migrazione 0005 (`project_versions`), versioni automatiche e manuali, ripristino.
- Accordi: uno per battito in ogni pattern (8 tipi), synth pad o stab con filtro, canale Chords nel mixer
  (passa dal sidechain). Il coach li scrive con `scrivi_pattern` (prompt `crea-v4`).
- I suoni stanno in `graph.ts`, separati dall'orologio (`engine.ts`), per poter renderizzare il WAV offline.

## Aggiornamento 9 nov 2026 · suoni ed export

- Suoni ancora sintetizzati (nessun campione: niente licenze e niente audio nel repository), ma più realistici:
  hi-hat alla TR-808 con choke, clap a quattro mani, kick con click e saturazione, basso con sub, riverbero send.
- Export WAV 24 bit dal browser (OfflineAudioContext, stessa catena del play). Verifica sul file esportato con
  `analysis/deep_studio_analyze.py`: -13,7 LUFS, true peak -1,5 dBTP, 122 BPM riconosciuti, nessun allarme.

## Aggiornamento 9 nov 2026 · melodie

- Lead monofonico in ogni pattern (Do4–Do6), synth saw/square/triangle con filtro, legato e delay a 3/16.
- Piano roll con schede Bass/Lead; pad Lead (tasto ","), canale Lead nel mixer.
- Il coach scrive la melodia con `scrivi_pattern` (prompt `crea-v5`: motivi corti, note dell'accordo sui battiti
  forti, domanda e risposta, spazio per il delay). Export di prova: -13,5 LUFS, true peak -1,3 dBTP.

## Aggiornamento 9 nov 2026 · effetti e automazioni

- Ogni canale: filtro DJ (-1…1: passa-basso a sinistra, passa-alto a destra), send di riverbero e di delay a 3/16.
  Filtro DJ anche sul master. Il vecchio `leadSound.delay` diventa il send Dly del lead (normalize).
- Automazioni dei filtri (master o canale) per battuta, con passaggio graduale tra i punti; suonano in Song e
  nell'export. Verifica sul WAV: con il master da -0,85 a 0 nelle battute 5–7 il centroide spettrale sale da
  ~200 Hz a ~3,4 kHz. Master a 0,72 di guadagno: true peak -1,7 dBTP.
- Il coach usa il nuovo strumento `scrivi_effetti` (prompt `crea-v6`), per esempio per il build prima del drop.

## Aggiornamento 10 nov 2026 · il coach ascolta l'export

- Pulsante **◉ Parere**: renderizza come l'export (Song o 4 giri del pattern), misura l'audio nel browser
  (`web/lib/daw/measure.ts`, port di `analysis/deep_studio_analyze.py`: LUFS con gate, true peak ×4, LRA,
  crest, bande, stereo con split a 120 Hz, energia e brillantezza per battuta) e manda le misure al coach.
  Verifica: sullo stesso WAV le misure coincidono con quelle del Python.
- Le misure vanno solo nel messaggio a Claude, non nella storia salvata (cambiano a ogni ascolto). Nessun audio
  lascia il browser. Il coach risponde con priorità e numeri (prompt `crea-v8`) e può correggere con
  `scrivi_effetti`, che ora regola anche i volumi dei canali e del master.

## Aggiornamento 10 nov 2026 · kit di batteria

- Quattro kit (`web/lib/daw/kits.ts`): House (quello di prima), 909, 808, Trap. Sempre sintetizzati: un kit è una
  tabella di numeri (tono e coda del kick, timbro del clap con o senza corpo da rullante, decay degli hat) più il
  tipo di perc (conga, rim, cowbell). Campo `kit` nel progetto; i progetti di prima restano House.
- Kick e hat ora hanno un "choke" con un gain dedicato: un colpo nuovo taglia la coda di quello prima, così la
  coda lunga dell'808 non si accumula (e l'open hat non resta a pieno volume prima del taglio).
- Il coach sceglie il kit con `scrivi_pattern` (prompt `crea-v9`). Export di prova sullo stesso pattern:
  da -15,1 LUFS (909) a -11,9 LUFS (Trap), true peak sempre sotto -2,2 dBTP, nessun allarme.

## Aggiornamento 10 nov 2026 · nuovo aspetto e console a pagine

- Palette "Neon morbido" (scelta tra 5 anteprime e 2 varianti ammorbidite): fondo viola-notte, accento viola,
  colori degli strumenti poco saturi (kick rosa, clap viola, hat ciano, perc verde, basso indaco, accordi lavanda,
  lead ambra), bagliori leggeri. Tutto in `web/design/tokens.css`; stile piatto al posto del metallo.
- Font (licenza OFL, ospitati dal sito con `next/font`): Geist per i testi, Chakra Petch per etichette e pulsanti,
  Geist Mono per display e numeri (cifre a larghezza fissa: il display non "balla" durante il play).
- Computer (da 1200 px): la console occupa lo schermo e non scorre, come FL Studio. Barra in alto (trasporto),
  pad e kit a sinistra, coach a destra (si chiude), al centro una vista alla volta scelta con le icone
  Beat, Roll, Accordi, Song, Mixer, Auto (tasti 1–6). La vista e il coach aperto restano scelti nel browser.
- Telefono: la stessa console in colonna, a scorrimento, come prima. Una sola pagina per entrambi: cambia solo
  il CSS, quindi le due versioni non possono andare fuori sincrono.
- 10 nov, dopo la prova dell'utente: la console a pagine parte da 1000 px (i portatili Windows con lo zoom
  al 125% sono larghi ~1100 px e prima finivano nella versione a scorrimento). Step, piano roll, pad e fader
  si adattano all'altezza dello schermo; la chat del coach scorre al suo interno. I synth Bass/Lead stanno
  nella vista Roll e il Chord synth negli Accordi (il mixer ha solo canali ed effetti). La barra spaziatrice
  fa sempre Play/Stop, tranne quando si scrive (titolo, chat).

## Aggiornamento 10 nov 2026 · canzoni lunghe

- La canzone non è più fissa a 16 battute: parte da 16 e cresce con +4/+8 (−4 toglie, con conferma se le
  battute non sono vuote) fino a 256 battute (a 124 BPM più di 8 minuti). Il tetto protegge l'export: il WAV
  si costruisce tutto in memoria nel browser (256 battute a 124 BPM ≈ 170 MB durante il render).
- `resizeSong()` allunga o accorcia anche le corsie di automazione; `normalize()` accetta canzoni di ogni
  lunghezza tra 16 e 256. Motore ed export usavano già la lunghezza della canzone: nessun cambio lì.
- Coach (prompt `crea-v10`): `scrivi_canzone` scrive canzoni lunghe quanto la lista (strutture da club in
  sezioni da 8/16 battute); un punto di automazione oltre la fine allunga la canzone. Nel testo per il coach
  la canzone va a righe da 16 e le automazioni sono solo i punti (meno token con canzoni lunghe).
- Le misure del Parere per battuta passano fino a 24.000 caratteri (prima 8.000): bastano per 256 battute.

## Aggiornamento 10 nov 2026 · 16 pattern

- I pattern passano da 4 (A–D) a 16 (A–P); i progetti di prima ricevono 12 pattern vuoti. Nello studio si
  vedono solo i pattern usati più uno libero; otto colori che si ripetono (la lettera li distingue).
- Canzone come la playlist di FL: si sceglie il "pennello" (un pattern) e si cliccano le battute; un clic su
  una battuta con lo stesso pattern la svuota. Il pennello segue il pattern aperto nel sequencer.
- Coach (prompt `crea-v11`): un pattern per sezione (intro, groove, break, build, drop, variazioni, outro),
  usa gli slot vuoti senza sovrascrivere i pattern pieni; nel testo per il coach i pattern vuoti stanno in
  una riga sola.

## Aggiornamento 10 nov 2026 · limiter sul master

- Il vecchio "limiter" era un DynamicsCompressorNode del browser: ginocchio morbido e guadagno di
  compensazione automatico, quindi non era un tetto (una canzone dell'utente arrivava a +0,04 dBTP).
- Nuovo limiter in `web/lib/daw/limiter.ts`, come AudioWorklet (incluso nel browser, nessun pacchetto):
  lookahead 5 ms, picco stimato anche tra i campioni (interpolazione cubica a 1/4, 1/2, 3/4), tetto -1,3 dB,
  release 80 ms. Il tetto è garantito per costruzione (minimo su 2·L campioni, poi media su L).
  Stessa catena nel play e nell'export; finché il worklet non è caricato resta un compressore a ginocchio duro.
- Export: rete di sicurezza in `render.ts`, se il true peak misurato supera -1,05 dBTP il file viene abbassato.
- Prove: segnale a +12,5 dBTP → uscita -1,52 dBFS di picco e -0,01 dBTP (onda quadra aliasata, caso estremo);
  la canzone dell'utente da +0,04 a -1,07 dBTP, -13,8 LUFS, nessun allarme. Spia nella striscia Master.

## Aggiornamento 11 nov 2026 · marker di inizio della canzone

- Nella vista Song il numero di ogni battuta è un pulsante: mette il marker ▶ (come nella playlist di FL).
  Il play in modalità Song parte dal marker e a fine canzone torna al marker (loop sulla parte che si sta
  lavorando). Un clic sul marker lo riporta alla battuta 1. Il marker è uno stato dell'interfaccia,
  ricordato nel browser per progetto (non nel progetto: non cambia la musica). L'export resta dall'inizio.

## Aggiornamento 11 nov 2026 · tastiera musicale

- Come la typing keyboard di FL: pulsante PAD / TASTIERA (e tasto Tab; Maiusc+Tab resta per la navigazione).
  In modalità tastiera la fila Z–M e S D G H J suona un'ottava, Q–P e 2 3 5 6 7 9 0 quella sopra, sullo
  strumento scelto (Bass, Lead, Chord). Si usa `KeyboardEvent.code` (posizione fisica): funziona con la
  tastiera italiana. Le note fuori gamma (basso La1–La2, lead Do4–Do6) scendono o salgono di ottava, così
  quello che si sente è quello che si scrive. Su Chord il tasto è la fondamentale, il tipo si sceglie.
- Con Rec + Play le note (e gli accordi, sul battito) si scrivono sullo step che sta suonando, come i pad.
- In modalità tastiera i pad non hanno tasti e i numeri non cambiano vista (alcuni sono note).
