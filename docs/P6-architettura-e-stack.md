# **Deep Studio · P6 · Architettura e stack (decision record)**

Versione 0.1 · 18 ottobre 2026 · proposta preparata da Claude con Francesco · **da confermare da Spencer**, che guida il P6

## **1\. Lo stack proposto**

| Parte | Scelta proposta | Perché | Costo (vedi "P6 · Modello dei costi") |
| :---- | :---- | :---- | :---- |
| Analisi audio | Python con numpy/scipy (lo script attuale), poi eventualmente librosa e pyloudnorm, tutte a licenza permissiva | È già scritto e verificato; la stessa logica si porta poi nel plugin C++ | quasi nulla: \~\$0,001 per analisi |
| Dove gira l'analisi | **Modal** (funzioni serverless, si paga al secondo, GPU solo quando serve) | Niente server sempre acceso da gestire; Demucs su GPU solo per gli upload senza stem; \$30/mese di crediti gratuiti | \$0 fino a circa 100 utenti |
| Separazione stem | Demucs (licenza MIT) su GPU T4 | Serve per gli upload solo mix; il risultato si salva e non si ricalcola | \~\$0,016 per traccia senza stem \[stima da misurare\] |
| Coach | Claude API, **Sonnet 5.5** come punto di partenza, prompt v1 del P4 | Buon equilibrio qualità/costo; Haiku costa 20 volte meno, Opus il doppio: si decide nel P4 confrontando le note | \~\$0,02 per analisi con Sonnet |
| Dashboard | Next.js su **Vercel** | Standard, veloce da costruire; Hobby gratis solo per uso interno non commerciale, Pro quando partono i beta | \$0 noi due, \$40/mese dopo (2 seat) |
| Dati, login, file | **Supabase Pro** (Postgres, Auth, Storage), regione UE | Un solo servizio per database, utenti e file; il piano Free non basta (1 GB di storage e il progetto si mette in pausa dopo una settimana senza uso) | \$25/mese |
| Coda dei lavori | Tabella jobs in Supabase \+ funzione Modal | Niente servizio in più: la dashboard crea il job, Modal lo esegue e scrive i risultati | incluso |

## **2\. Come scorrono i dati**

> 1. Il producer carica il mix (e gli stem, se ci sono) dalla dashboard: i file vanno in Supabase Storage, la dashboard crea un job.  
> 2. Modal prende il job: se mancano gli stem lancia Demucs, poi l'analisi, e salva il JSON 1.0 nel database.  
> 3. Modal prepara l'input compatto (coach\_input.py), chiama la Claude API con il prompt del coach e salva le note.  
> 4. La dashboard mostra note, timeline e spettro. Il producer segna ogni nota come applicata, ignorata o sbagliata: è il feedback che misura il 7/10 anche dopo il Gate 0, e alimenta la memoria (M4).  
> 5. In Fase 2 il plugin manda direttamente il JSON 1.0 dalle finestre live, senza audio: dal punto 3 in poi non cambia niente.

## **3\. Modello dati (prima versione)**

| Tabella | Contenuto |
| :---- | :---- |
| profiles | utente, lingua (it/en), sottogeneri preferiti, livello |
| tracks | traccia del producer: titolo, sottogenere |
| track\_versions | v1, v2…, stadio (idea grezza, mix a metà, finita) |
| uploads | file: mix o stem, ruolo, percorso, export con/senza master, data di scadenza dell'audio |
| analyses | JSON dell'analisi 1.0, versione dello schema e dell'analizzatore |
| coach\_reports | risposta del coach in JSON, modello, token in/out, costo |
| notes | una riga per nota: categoria, priorità, azione, stato (aperta, applicata, ignorata, sbagliata) |
| reference\_sets | media dei riferimenti per sottogenere (deep, tech, progressive) |
| feedback | le 4 domande della rubrica per nota (problema giusto, fix giusto, utile in FL, la applicherei) |

## **4\. Privacy della musica**

> * L'audio si conserva per un periodo limitato (proposta: 30 giorni) e poi si cancella; restano solo le misure e le note. Il valore esatto è da decidere: l'opzione "Ascolta la correzione" ha bisogno degli stem più a lungo.  
> * Nessun addestramento di modelli sulla musica degli utenti e nessuna condivisione senza consenso esplicito.  
> * Dati in UE dove possibile (Supabase regione UE). Modal: regione dei calcoli e trasferimento dati tra UE e USA \[DA VERIFICARE prima dei beta, anche per il GDPR\].

## **5\. Costi stimati (dal foglio "P6 · Modello dei costi", prezzi verificati il 18 ott 2026\)**

| Scenario | Analisi al mese | Totale al mese | Per utente |
| :---- | :---- | :---- | :---- |
| Noi due | 40 | \~\$26 | \~\$13 |
| Beta (50 utenti) | 400 | \~\$74 | \~\$1,5 |
| 100 utenti | 800 | \~\$85 | \~\$0,85 |
| 1.000 utenti | 6.000 | \~\$260 | \~\$0,26 |
| 10.000 utenti | 60.000 | \~\$2.400 | \~\$0,24 |

> * Il costo fisso domina all'inizio (Supabase \$25 \+ Vercel \$40); da circa 1.000 utenti pesa di più il coach (circa metà del totale).  
> * Le cifre dipendono da stime da misurare: token reali per traccia, secondi di Demucs, quota di upload senza stem, quante analisi fa un utente. Nel foglio sono le celle gialle.  
> * Esclusi: dominio, licenza JUCE e certificati di firma (Fase 2), commissioni di pagamento, tasse.

## **6\. Decisioni per Spencer**

> 1. Confermare Modal come piattaforma di calcolo, oppure preferire un server sempre acceso.  
> 2. Confermare Supabase e la regione UE.  
> 3. Giorni di conservazione dell'audio (proposta 30\) e formato degli stem salvati (FLAC per dimezzare lo spazio).  
> 4. Il modello del coach si decide nel P4, con le tracce vere: si confrontano Haiku, Sonnet e Opus sulle 10 note gold.