# Deep Studio · User stories Fase 1

Ricostruite il 20 ottobre 2026 dalla guida M1 e dai documenti P2, P6 e LEGGIMI.
**Da rivedere con Spencer.** Le storie 1–5 sono la M1 (scheletro); le altre sono
solo un indice per le milestone successive.

Utenti della Fase 1: Francesco e Spencer, producer house (deep, tech, progressive)
che lavorano in FL Studio. Lingua dell'interfaccia: italiano (inglese in seguito).

---

## Storia 1 · Accesso

**Come** producer **voglio** entrare con la mia email **così che** le mie tracce
restino solo mie.

Criteri di finito:
- [ ] La pagina `/accedi` chiede solo l'email e manda un link magico (Supabase Auth, `@supabase/ssr`).
- [ ] Cliccando il link arrivo su `/studio`; se non ho fatto l'accesso, `/studio` mi rimanda ad `/accedi`.
- [ ] Al primo accesso viene creato il mio profilo (`profiles`), con lingua `it`.
- [ ] Posso uscire (logout) da `/studio`.
- [ ] Prova con due utenti: ognuno vede solo le proprie tracce, anche chiamando il database
      direttamente dal browser (row-level security, non un filtro nella pagina).
- [ ] Nessuna chiave nel codice: URL e anon key in `web/.env.local`, che non va su git.
- [ ] Licenza controllata per ogni pacchetto aggiunto (niente AGPL).

## Storia 2 · Carico il mix

**Come** producer **voglio** caricare l'export della mia traccia con poche informazioni
**così che** l'analisi sappia cosa sta ascoltando.

Criteri di finito:
- [ ] La schermata "Nuova analisi" (mockup P5) chiede: titolo, sottogenere
      (deep / tech / progressive), stadio (idea grezza / mix a metà / finita),
      export (con master / senza master) e il file del mix.
- [ ] Accetta WAV (e FLAC); rifiuta altri formati con un messaggio chiaro, prima di caricare.
- [ ] Il file va nel bucket privato `audio` nel percorso `<utente>/<traccia>/<versione>/<file>`.
- [ ] Vedo l'avanzamento del caricamento; se fallisce posso riprovare senza ricompilare tutto.
- [ ] Alla fine esistono le righe in `tracks`, `track_versions` (versione 1), `uploads` (kind `mix`)
      e un job in `jobs` con stato `in_coda`; poi arrivo alla schermata "Analisi in corso".
- [ ] Caricare di nuovo la stessa traccia crea la versione 2, non una traccia nuova (scelgo la traccia esistente).

## Storia 3 · Aggiungo gli stem (facoltativi)

**Come** producer **voglio** aggiungere gli stem esportati da FL ("Split mixer tracks")
**così che** l'analisi possa misurare kick, bassline e bilanciamento con precisione.

Criteri di finito:
- [ ] Nella stessa schermata posso trascinare più WAV di stem; sono facoltativi.
- [ ] Per ogni stem la dashboard propone il ruolo dall'**ultima parola del nome**, con la stessa
      tabella di `role_of()` in `analysis/deep_studio_analyze.py`
      (es. `Sunset_Kick.wav` → kick, `Lead Synth.wav` → lead, parola sconosciuta → other).
- [ ] Posso correggere il ruolo a mano da un menu (kick, bass, drums, perc, clap, lead, pad, fx, vox, other).
- [ ] Gli stem finiscono nello stesso percorso del mix e in `uploads` con kind `stem` e il ruolo scelto.
- [ ] Senza stem si procede lo stesso; un messaggio dice che con gli stem l'analisi è più precisa.

## Storia 4 · Vedo a che punto è l'analisi

**Come** producer **voglio** vedere lo stato dell'analisi in tempo reale **così che**
non debba ricaricare la pagina né chiedermi se si è bloccata.

Criteri di finito:
- [ ] La schermata "Analisi in corso" mostra una fila di LED:
      in coda → in analisi → separazione stem → coach → pronta.
- [ ] Lo stato arriva da Supabase Realtime sulla tabella `jobs`, senza ricaricare.
- [ ] I LED già passati sono verdi, quello attuale lampeggia, i successivi spenti.
      "Separazione stem" si salta (LED spento) se ho caricato gli stem.
- [ ] Ogni stato ha un messaggio chiaro in italiano (es. "In coda: parte tra poco").
- [ ] Se lo stato è `errore`, il LED è rosso, vedo il messaggio e un pulsante **Riprova**
      che chiama `retry_job()` e rimette il job in coda.
- [ ] Per provarla senza worker c'è uno script di sviluppo che fa avanzare gli stati a mano
      (usa la service role key, solo in locale).

## Storia 5 · Privacy della mia musica

**Come** producer **voglio** sapere cosa succede ai miei file **così che** possa caricare
musica non ancora uscita senza preoccupazioni.

Criteri di finito:
- [ ] La pagina `/privacy` riporta il testo qui sotto ed è raggiungibile dal piè di pagina
      e dalla schermata "Nuova analisi" (link vicino al pulsante di caricamento).
- [ ] Le promesse del testo sono vere nel codice: bucket privato, `audio_expires_at` a 30 giorni,
      nessuna condivisione.
- [ ] Il testo è marcato come bozza finché Spencer non conferma i punti aperti (P6, sezione 6).

### Testo della pagina `/privacy` (bozza)

> **La tua musica resta tua.**
>
> **Cosa carichi.** Il mix della tua traccia e, se vuoi, gli stem. Servono solo per misurarli
> e darti le note del coach.
>
> **Chi li vede.** Solo tu. I file stanno in uno spazio privato collegato al tuo account:
> nessun altro utente può aprirli, e noi non li ascoltiamo, salvo che tu ce lo chieda
> (per esempio per risolvere un problema tecnico).
>
> **Per quanto tempo.** L'audio viene cancellato dopo **30 giorni** dal caricamento.
> Restano le misure (numeri come loudness e bilanciamento) e le note, così puoi confrontare
> le versioni della traccia.
>
> **Cosa non facciamo.** Non usiamo la tua musica per addestrare modelli di intelligenza
> artificiale. Non la condividiamo con nessuno senza il tuo consenso esplicito.
>
> **Chi ci aiuta.** Database e file sono su Supabase, in un data center nell'Unione Europea.
> Le misure vengono calcolate su Modal; le note del coach le scrive Claude (Anthropic),
> che riceve solo le misure, mai l'audio.
>
> **Cancellare tutto.** Puoi chiederci di cancellare il tuo account e tutti i tuoi dati
> in qualsiasi momento: scrivici e lo facciamo.
>
> *Bozza del 20 ottobre 2026. Da verificare prima della beta: giorni di conservazione,
> regione dei calcoli su Modal e trasferimento dati UE/USA (GDPR).*

---

## Dopo la M1 (indice)

- **M2 · Analisi:** il worker Modal prende i job `in_coda`, scarica l'audio, lancia
  `analysis/deep_studio_analyze.py` (`analyze_file()`), separa con Demucs se mancano gli stem,
  salva il JSON 1.0 in `analyses` e aggiorna lo stato. Serve la conferma dello stack da Spencer.
- **M3 · Coach:** input compatto dall'analisi, Claude API con il prompt del P4, note in `notes`,
  costo in `coach_reports`.
- **M4 · Note e memoria:** schermata delle note, stati applicata/ignorata/sbagliata, rubrica in
  `feedback`, problemi ricorrenti tra le versioni.
