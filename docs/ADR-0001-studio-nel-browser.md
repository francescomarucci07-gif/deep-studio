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
