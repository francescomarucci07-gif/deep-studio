# Deep Studio · Analisi locale delle tracce (P3)

> Nota del 20 ott 2026: questo documento descrive la v0.2 (schema 0.1). Lo script nel repository
> ora è la v0.3 e scrive lo schema 1.0; uso e nomi dei file restano gli stessi, in più ci sono
> `--sottogenere`, `--stadio` e `--crea-riferimenti`.

Lo script misura le tue tracce sul tuo computer e scrive i risultati in file di testo. **L'audio non esce mai dal PC**: su Drive vanno solo i risultati.

## 1\. Preparazione (una volta sola, 5 minuti)

1. Scarica Python da **python.org** (sezione Downloads, Windows) e installalo. Nella prima schermata spunta **"Add python.exe to PATH"**.  
2. Scarica in una cartella del PC i due file `deep_studio_analyze.py` e `analizza.bat` (devono stare insieme).  
3. La prima volta che lanci l'analisi, `analizza.bat` installa da solo numpy e scipy.

## 2\. Export da FL Studio

- **File \> Export \> WAV**, modalità canzone intera, **24 bit**, sample rate del progetto.  
- **Senza master chain** (sempre): prima dell'export disattiva gli effetti sull'insert Master. Nome: `T01_titolo_nomaster.wav`  
- **Con master chain** (se la traccia è "finita"): riattivali ed esporta di nuovo. Nome: `T01_titolo_master.wav`  
- **Stem**: esporta con "Split mixer tracks" (master chain spenta) e metti i file in una sottocartella chiamata `T01_stem`. Non serve rinominarli: basta che il kick abbia "kick" nel nome e la bassline "bass".  
- `T01` è l'ID della traccia nel foglio *Deep Studio · Test set P1*.

Esempio di cartella:

tracce\\

  T01\_sunset\_nomaster.wav

  T01\_sunset\_master.wav

  T01\_stem\\

     Sunset\_Kick.wav

     Sunset\_Bass.wav

     Sunset\_Pad.wav

## 3\. Lanciare l'analisi

Trascina la cartella `tracce` sopra `analizza.bat`. Per una traccia di 5 minuti servono circa 30–60 secondi.

Il BPM viene rilevato da solo (cerca tra 110 e 135, la zona house). Se su una traccia sbaglia, mettila in una cartella da sola e lanciala indicando il BPM:

py deep\_studio\_analyze.py "C:\\percorso\\tracce" \--bpm 124

## 4\. Cosa esce

Nella cartella `tracce\_analisi`:

- un **JSON per ogni mix** con tutte le misure (formato schema 0.1, lo stesso che userà il plugin in Fase 2);  
- **riepilogo.csv** con i numeri principali, uno per riga, da aprire in Excel o Google Sheets.

Carica il contenuto di `_analisi` nella cartella Drive **Deep Studio / analisi / risultati**. Da lì lo leggo e lo confrontiamo con le tue note nel foglio P1.

## Cosa misura

- **Loudness integrata (LUFS), true peak, LRA, clipping:** volume, picchi, spazio dinamico.  
- **Energia per banda** (sub, low, low-mid, mid, high-mid, high): bilancio tonale, da confrontare con un riferimento.  
- **Crest factor per finestra:** quanto il mix è compresso, e dove.  
- **Correlazione sopra 120 Hz, side sotto 120 Hz, perdita in mono:** fase, low end stereo, compatibilità mono.  
- **BPM e sezioni su griglia di 4 battute:** arrangiamento ed energia (intro, drop, break, outro).  
- **Kick contro bassline e profondità del sidechain** (con gli stem): il clash principale della house.

## Da sapere

- I **"controlli"** nel JSON usano soglie provvisorie: servono per la colonna P3 del foglio, non sono le note del coach. Le taramo sulle vostre note.  
- La loudness è verificata con il test della norma BS.1770 (sinusoide 1 kHz: −3.0 LUFS a 0 dBFS su un canale, −23.0 a −20 dBFS, anche a 24 bit e 48 kHz).  
- Le etichette delle sezioni sono stime: "drop" è la parte più forte, non necessariamente il drop musicale.  
- Nessun costo: tutto gira sul tuo PC.