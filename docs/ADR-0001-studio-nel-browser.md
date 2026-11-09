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
