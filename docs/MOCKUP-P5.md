# Deep Studio · Mockup P5

Ricostruito il 20 ottobre 2026 (il mockup originale non era su Drive). Wireframe delle due
schermate della M1. Tutto è fatto con le classi di `web/design/tokens.css`
(`.ds-module`, `.ds-pad`, `.ds-segmented`, `.ds-dropzone`, `.ds-led-row`).

## Schermata "Nuova analisi" (storie 2 e 3)

```
┌─ ● ─────────────────────────────────────────────────── ● ─┐
│  NUOVA ANALISI                                    .ds-module-title
│                                                           │
│  TITOLO                                           .ds-label
│  [ Sunset                                            ]    .ds-input
│  (oppure: ▾ nuova versione di una traccia esistente)      │
│                                                           │
│  SOTTOGENERE                                              │
│  [ DEEP ] [ TECH ] [ PROGRESSIVE ]                .ds-segmented
│                                                           │
│  STADIO                                                   │
│  [ IDEA GREZZA ] [ MIX A METÀ ] [ FINITA ]                │
│                                                           │
│  EXPORT                                                   │
│  [ SENZA MASTER ] [ CON MASTER ]                          │
│  Consiglio: esporta sempre anche senza master chain.      │
│                                                           │
│  MIX (WAV 24 bit)                                         │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐       .ds-dropzone
│    Trascina qui il mix o clicca per sceglierlo            │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘       │
│                                                           │
│  STEM (FACOLTATIVI)                                       │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐       │
│    Trascina gli stem di "Split mixer tracks"              │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘       │
│  Sunset_Kick.wav      [ kick   ▾ ]   ✕                    │
│  Sunset_Bass.wav      [ bass   ▾ ]   ✕                    │
│  Lead Synth.wav       [ lead   ▾ ]   ✕                    │
│  Mistero.wav          [ other  ▾ ]   ✕   ← correggi a mano│
│                                                           │
│  ███████████░░░░░░░  62 %  caricamento Sunset_Bass.wav    │
│                                                           │
│                          [ ANALIZZA ]   .ds-pad--primary  │
│  L'audio resta privato e si cancella dopo 30 giorni · Privacy
└───────────────────────────────────────────────────────────┘
```

Comportamento:
- **Analizza** resta disattivato finché mancano titolo, sottogenere, stadio, export o mix.
- Il ruolo proposto viene da `role_of()` (ultima parola del nome file) e si cambia dal menu.
- Errori in linea, sotto il campo: formato non WAV/FLAC, file troppo grande, caricamento fallito
  (con **Riprova** sul singolo file).

## Schermata "Analisi in corso" (storia 4)

```
┌─ ● ─────────────────────────────────────────────────── ● ─┐
│  SUNSET · V1 · DEEP · MIX A METÀ                          │
│                                                           │
│    ●          ●            ○              ○         ○     │
│  IN CODA   IN ANALISI   SEPARAZIONE      COACH    PRONTA  │
│  (verde)  (lampeggia)     STEM                            │
│                                                           │
│  Sto misurando loudness, stereo e sezioni.                │  .ds-message
│  Di solito ci vuole meno di un minuto.                    │
│                                                           │
│  — in caso di errore —                                    │
│    ●          ●(rosso)                                    │
│  Non sono riuscito a leggere il file. Riprova; se succede │  data-tone="error"
│  ancora, esporta di nuovo il WAV da FL.                   │
│                               [ RIPROVA ]                 │
└───────────────────────────────────────────────────────────┘
```

Messaggi per stato:

| Stato | Messaggio |
| :--- | :--- |
| `in_coda` | In coda: parte tra poco. |
| `in_analisi` | Sto misurando loudness, stereo e sezioni. |
| `separazione_stem` | Separo gli stem dal mix (solo se non li hai caricati): qualche minuto. |
| `coach` | Il coach sta scrivendo le note. |
| `pronta` | Fatto! Le note sono pronte. → pulsante **Apri le note** (M4) |
| `errore` | Testo da `jobs.error_message`, più il pulsante **Riprova**. |
