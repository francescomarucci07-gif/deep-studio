# ADR-0002 · Sample propri nello studio

Data: 20 nov 2026 · Proposto da: Claude per Francesco · **Da decidere con Francesco e Spencer** (tocca P6: storage e costi)

## Contesto

Oggi tutti i suoni dello studio sono sintetizzati (`graph.ts`, kit in `kits.ts`). Va bene per il groove, ma per la house
contano i suoni propri: un kick scelto, un vocal chop, un loop di percussioni. Francesco li ha chiesti nella lista del 17 nov.

Caricare audio cambia cose difficili da cambiare dopo:
- **Dove stanno i file** e chi li vede (RLS, bucket), e per quanto restano (la regola "audio cancellato dopo 30 giorni"
  vale per i mix da analizzare, non può valere per suoni usati dentro un progetto).
- **Quanto spazio** usa ogni persona: il piano Free di Supabase ha 1 GB di storage in tutto e 50 MB per file.
- **Diritti**: chi carica un sample deve averne i diritti; il link di ascolto (`/ascolta`) li farebbe sentire a chiunque.
- **Il formato del progetto**: il progetto dovrà dire quale sample suona dove, e l'export e il link di ascolto dovranno
  caricare i file prima di suonare.

## Opzioni

### Dove si usano

1. **Il sample sostituisce un suono della batteria** (per esempio "Kick: mio_kick.wav" al posto del kick del kit).
   Nessun canale nuovo: il Beat, il mixer e l'export restano come sono. Copre kick, clap, hat e perc personali.
2. **Righe "Sample 1–4" nuove nel Beat**, ognuna con il suo canale e, nel Roll, l'altezza (per suonare un vocal chop
   sulla tastiera). Più potente, ma tocca Beat, Roll, mixer, MIDI e coach come il Lead 2.
3. **Loop audio sulla canzone** (una traccia audio nella Song). È un'altra cosa: un mini-arrangiatore audio. Non ora.

### Dove stanno i file

A. **Bucket privato nuovo `samples`**, percorso `<utente>/<sample>.wav`, RLS per cartella come il bucket `audio`.
B. Nello stesso bucket `audio` dei mix: più semplice, ma mescola file con regole di durata diverse.

### In che formato

- **Così come arrivano** (WAV, MP3, OGG, FLAC…): ogni browser li decodifica a modo suo (Safari non legge OGG).
- **Convertiti nel browser prima di salvarli** in WAV 44,1 kHz, 16 bit, al massimo 10 secondi: si usa `decodeAudioData`
  del browser e il codificatore WAV che abbiamo già (`render.ts`). Nessun pacchetto nuovo, file piccoli e uguali per tutti.

## Proposta

- **Fase 1: opzione 1** (il sample sostituisce un suono della batteria, per progetto: `project.samples = { kick: id, … }`),
  con l'**altezza** regolabile (±12 semitoni) e il **taglio** inizio/fine. Fase 2 (dopo): righe Sample con il Roll, se
  la fase 1 viene usata davvero.
- **Bucket privato `samples` (opzione A)**, tabella `samples` (id, owner_id, nome, durata, percorso, creato) con RLS.
  I sample **non scadono**: restano finché li cancelli tu; la pagina "I miei sample" mostra lo spazio usato.
- **Conversione nel browser** in WAV 44,1 kHz 16 bit, mono o stereo, **massimo 10 secondi** (circa 1,7 MB).
  Il bucket accetta solo `audio/wav` fino a **2 MB** per file.
- **Limite per persona: 40 sample e 40 MB** (con il piano Free bastano per circa 20 persone; con il Pro, 100 GB, non è
  più un problema). Il limite lo controlla il database con un trigger, come le segnalazioni.
- **Diritti**: al caricamento una casella "Ho i diritti per usare questo suono" (obbligatoria) e una riga nella pagina
  Privacy. I sample sono **privati**: nessuna libreria pubblica, nessuna condivisione tra utenti.
- **Link di ascolto**: quando crei il link, i sample usati vengono **copiati** in una cartella del link
  (`samples/condivisi/<codice>/…`) leggibile solo da chi ha il codice; "Togli il link" li cancella. Così il link suona
  uguale e i tuoi sample originali restano privati.
- **Export e coach**: l'export carica i sample prima di suonare (stessa catena); negli stem e nel MIDI non cambia niente
  (il MIDI resta sulla nota della batteria). Il coach vede il nome del sample, la durata e quale suono sostituisce,
  non lo "sente" (per il parere c'è già l'export).

## Conseguenze

- Prima volta che lo studio salva audio dell'utente in modo permanente: va scritto nella pagina Privacy e nei costi (P6).
- Il progetto dipende da file esterni: un sample cancellato lascia un buco. Il suono torna quello del kit e lo studio
  lo dice ("sample mancante: suona il kick del kit").
- Lavoro stimato per la fase 1: migrazione (tabella, bucket, trigger), pagina "I miei sample", scelta del sample nel
  pannello del kit, motore ed export che caricano i buffer, link di ascolto con la copia dei file, prove.
- Da rivedere quando si passa al piano Pro di Supabase (limiti più alti) e se si aggiunge la fase 2.

## Da decidere

1. Fase 1 come proposta (sostituire i suoni della batteria) o subito le righe Sample con il Roll?
2. Limiti: 10 secondi, 2 MB per file, 40 sample / 40 MB a persona vanno bene?
3. Il testo sui diritti e la riga nella Privacy: li scriviamo noi o servono parole di un legale?
4. Spencer: bucket separato e copia dei sample per il link di ascolto vanno bene per il P6?
