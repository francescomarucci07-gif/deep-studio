# Piano: area beat, lezioni e canto (proposta del 26 nov 2026, niente codice ancora)

Richiesta: un'area di produzione e beat making con il canto, per un educatore e beat maker. Ordine di consegna:
strumenti per i beat → canto dal testo (dopo il sì scritto di ElevenLabs) → cambio voce (solo se le prove suonano bene).

> **Da verificare**: i documenti e i termini di ElevenLabs non sono stati letti (rete della sessione). Tutto quello che
> riguarda ElevenLabs (`music_v2_5`, limiti di `composition_plan`, `finetune_id`, prezzi, "Model Resale") è da
> controllare su https://elevenlabs.io/docs/overview/capabilities/music e https://elevenlabs.io/music-terms.

## Cosa c'è già
Step sequencer e pad (7 suoni di batteria), tempo, swing, pattern e canzone, export WAV, stem e MIDI, lezioni guidate,
progetti modello, coach Claude, voce ElevenLabs (solo lettura di testo). Motore audio nostro con Web Audio.

## Fase 1: strumenti per i beat (si può fare subito)

| Cosa | Proposta | Licenza |
| :--- | :--- | :--- |
| Sequencer con Tone.js | No: avremmo due motori audio che fanno la stessa cosa; teniamo il nostro | Tone.js MIT |
| Forma d'onda, taglio e loop | wavesurfer.js per audio caricato o registrato; serve prima l'ADR-0002 (sample propri) | BSD-3 |
| Audio → MIDI | Basic Pitch (Spotify), versione JS nel browser, zero costi di server | Apache-2.0 |
| Separazione stem | Demucs su Modal (già previsto per M2, serve Spencer) | MIT |
| **Modalità lezione** | Ruolo insegnante; tabella `esercizi` con RLS (come `ascolti`); link all'esercizio; "Copia nel mio studio" crea un progetto dello studente | nessuna libreria |
| Plugin VST | Solo una pagina di download consigliati: Vital, Surge XT (codice GPL3), Spitfire LABS, Valhalla Supermassive, TDR Nova (gratis, non open source). Non si incorporano | link esterni |

Stima: modalità lezione ~2 giorni; forma d'onda e loop 2–3 giorni; audio → MIDI 1–2 giorni.

## Fase 2: canto dal testo (dopo il sì scritto di ElevenLabs)
- **Editor del testo**: sezioni (strofa, ritornello), stile, durata; limiti controllati prima dell'invio.
- **Il cantante**: un campo "descrivi il cantante" (estensione, timbro, lingua, stile), niente finto selettore di voci.
  Se le voci della libreria stanno solo nell'app di ElevenLabs: pulsante "Carica la canzone finita". Da provare se un
  `finetune_id` fatto con le nostre tracce dà una voce costante.
- **Sicurezza**:
  - chiave solo sul server, come `/api/voce`;
  - filtro su artisti, titoli e testi protetti (lista nostra più gli errori dell'API);
  - limite di generazioni per persona;
  - tetto di spesa mensile, con il costo di ogni generazione salvato in una tabella (come i token di Claude).
- **Prima di costruire**: mail a ElevenLabs su rivendita del modello, uso didattico, età degli studenti e piano
  necessario (bozza da preparare; la manda Francesco). Serve anche un ADR.
- Stima: 3–4 giorni.

## Fase 3: cambio voce su musica esistente (solo se le prove suonano bene)
- Prima una prova fuori dall'app: separare o registrare una voce guida, convertirla con il Voice Changer
  (`/v1/voice-changer/{voice_id}`), rimetterla nel mix; si ascoltano i risultati prima di costruire.
- Nell'app: casella obbligatoria "possiedo questa musica o ho il permesso scritto"; solo voci con licenza, niente
  clonazione senza consenso.

## Costi al mese (stime)

| Voce | Costo |
| :--- | :--- |
| Vercel Pro | 20 $ (il piano Hobby non permette uso commerciale) |
| Supabase Pro | 25 $ (serviva già per i file oltre i 50 MB) |
| Demucs su Modal | pochi centesimi a brano (da misurare) |
| Basic Pitch, wavesurfer, modalità lezione | 0 $ |
| ElevenLabs Music | da verificare: piano a pagamento più costo per minuto; il tetto di spesa decide il massimo |
| Coach Claude | come oggi (/studio/consumi) |

## Da decidere alla ripresa
1. Partire dalla modalità lezione (non dipende né da Spencer né da ElevenLabs)?
2. Leggere i termini di ElevenLabs: permesso di scaricare le pagine da elevenlabs.io dal terminale, oppure Francesco
   incolla il testo. Poi aggiornare la Fase 2 e scrivere la bozza della mail.
