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
