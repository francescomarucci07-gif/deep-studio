// Le lezioni guidate: piccole "missioni" del coach, divise in passi. Ogni passo ha un'istruzione, un suggerimento e
// un controllo che guarda il progetto mentre lavori: quando il passo è fatto, la lezione va avanti da sola, come un
// insegnante che ti guarda le mani. I testi sono scritti qui (uguali per tutti, si controllano, non costano token).
import { BUS_IDS, BUS_UNITY, DRUMS, isBus, MIX_TARGETS, songLength, type BusId, type Pattern, type Project, type Slot } from "./project";

// quello che la lezione può vedere: il progetto e qualche cosa dello studio
export type LessonCtx = {
  project: Project;
  editing: Slot;
  playing: boolean;
  songMode: boolean;
  exported: boolean; // ha esportato o chiesto un parere in questa visita
};

export type LessonView = "beat" | "roll" | "song" | "mixer" | "auto";

export type LessonStep = {
  text: string; // cosa fare
  hint: string; // se ti blocchi
  view?: LessonView; // la pagina da aprire per questo passo
  roll?: "bass" | "lead" | "chords"; // la scheda del Roll
  done: (c: LessonCtx) => boolean;
};

export type Lesson = { id: string; title: string; intro: string; outro: string; steps: LessonStep[] };

const pat = (c: LessonCtx): Pattern => c.project.patterns[c.editing];
const on = (c: LessonCtx, d: (typeof DRUMS)[number]["id"], steps: number[]) => steps.every((s) => pat(c).drums[d][s]);
const notesIn = (a: (number | null)[]) => a.filter((n) => n !== null).length;
// il bus in cui entra la batteria (di solito Drums) e quello in cui entrano gli accordi, se ci sono
const drumBus = (c: LessonCtx): BusId | null => {
  const o = c.project.mixer.kick.out;
  return isBus(o) ? o : null;
};
const synthBus = (c: LessonCtx): BusId | null => {
  const o = c.project.mixer.chords.out;
  return isBus(o) && o !== drumBus(c) ? o : null;
};

export const LESSONS: Lesson[] = [
  {
    id: "groove",
    title: "Il primo groove",
    intro: "Costruiamo il battito della house: il four on the floor, cioè il kick su ogni quarto, più clap e hi-hat.",
    outro: "Questo è il groove di base di quasi tutta la house. Da qui si costruisce tutto il resto.",
    steps: [
      {
        text: "Nel Beat metti il kick sugli step 1, 5, 9 e 13: un colpo su ogni quarto.",
        hint: "Clicca le caselle della riga Kick sotto i numeri 1, 5, 9 e 13. Sono le prime di ogni gruppo da quattro.",
        view: "beat",
        done: (c) => on(c, "kick", [0, 4, 8, 12]),
      },
      {
        text: "Aggiungi il clap sul 5 e sul 13: il secondo e il quarto quarto, dove nel rock c'è il rullante.",
        hint: "Riga Clap, caselle 5 e 13.",
        view: "beat",
        done: (c) => on(c, "clap", [4, 12]),
      },
      {
        text: "Ora l'hi-hat in levare: step 3, 7, 11 e 15, a metà tra un kick e l'altro.",
        hint: "Riga Hi-hat, caselle 3, 7, 11 e 15. È il classico \"tss\" che fa ballare.",
        view: "beat",
        done: (c) => on(c, "hat", [2, 6, 10, 14]),
      },
      {
        text: "Premi Play (o la barra spaziatrice) e ascolta.",
        hint: "Il pulsante Play è in alto, accanto a Stop.",
        done: (c) => c.playing,
      },
      {
        text: "Dai più groove: gira la manopola Swing in alto fin verso il 20% e ascolta la differenza.",
        hint: "Trascina la manopola Swing verso l'alto. Lo swing ritarda un poco gli step in levare: il beat diventa meno rigido, più umano.",
        done: (c) => c.project.swing >= 0.18,
      },
    ],
  },
  {
    id: "bassline",
    title: "La bassline",
    intro: "Il basso è il motore della house: lavora insieme al kick, di solito tra un colpo e l'altro.",
    outro: "Kick e basso che si alternano, e il sidechain che li fa respirare: è il cuore del low end house.",
    steps: [
      {
        text: "Apri il Roll, scheda Bass, e scrivi almeno 4 note di basso nel pattern.",
        hint: "Clicca nella griglia del Roll: ogni riga è una nota. Prova La1 e Do2, per esempio.",
        view: "roll",
        roll: "bass",
        done: (c) => notesIn(pat(c).bass) >= 4,
      },
      {
        text: "Metti almeno una nota in levare, cioè fuori dagli step del kick (1, 5, 9, 13).",
        hint: "Un basso sugli step 3, 7, 11 o 15 risponde al kick invece di sovrapporsi: è il trucco della house.",
        view: "roll",
        roll: "bass",
        done: (c) => pat(c).bass.some((n, i) => n !== null && i % 4 !== 0),
      },
      {
        text: "Scegli un suono di basso diverso da Saw, per esempio Sub per un low end pulito o Reese per uno più scuro.",
        hint: "I suoni sono nel pannello Bass synth sotto il Roll: clicca un nome e lo senti subito.",
        view: "roll",
        roll: "bass",
        done: (c) => (pat(c).sounds?.bass ?? c.project.bassSound).wave !== "sawtooth",
      },
      {
        text: "Controlla che il sidechain sia acceso (in alto a destra): il kick abbassa il basso a ogni colpo.",
        hint: "È l'interruttore Sidechain accanto a Tempo e Swing.",
        done: (c) => c.project.sidechain,
      },
    ],
  },
  {
    id: "melodia",
    title: "Accordi e melodia",
    intro: "Ora l'armonia: gli accordi danno il colore (scuro, caldo, sognante), la melodia dà l'idea che resta in testa.",
    outro: "Accordi più melodia, con un po' di spazio grazie al riverbero: hai la parte musicale della traccia.",
    steps: [
      {
        text: "Nel Roll, scheda Chord, metti almeno 2 accordi in battiti diversi.",
        hint: "Scegli il tipo (per esempio m7, minore settima, molto deep) e clicca la fondamentale sul battito 1, poi sul 3.",
        view: "roll",
        roll: "chords",
        done: (c) => pat(c).chords.filter((x) => x.length).length >= 2,
      },
      {
        text: "Scheda Lead: scrivi una melodia di almeno 4 note.",
        hint: "Restare sulle note dell'accordo funziona sempre. Puoi anche suonarla con la tastiera e il pulsante Registra.",
        view: "roll",
        roll: "lead",
        done: (c) => pat(c).lead.filter((n) => n.length).length >= 4,
      },
      {
        text: "Allunga una nota della melodia: premi su una nota e trascina verso destra.",
        hint: "Una nota lunga tra tante corte dà respiro alla melodia, come una frase che finisce.",
        view: "roll",
        roll: "lead",
        done: (c) => Object.keys(pat(c).len ?? {}).some((k) => k.startsWith("l")),
      },
      {
        text: "Nel Mixer alza il riverbero (Rev) del Lead almeno al 20%.",
        hint: "La manopola Rev sotto il canale Lead: il riverbero mette la melodia in una stanza, più lontana e più ampia.",
        view: "mixer",
        done: (c) => c.project.fx.lead.reverb >= 0.2,
      },
    ],
  },
  {
    id: "canzone",
    title: "Costruisci la canzone",
    intro: "Una traccia è fatta di parti diverse: intro, groove, break, drop. Ogni parte è un pattern messo nella Song.",
    outro: "Hai una struttura: è da qui che una loop diventa una traccia.",
    steps: [
      {
        text: "Crea una seconda parte: con Duplica copia il pattern in B, poi cambia qualcosa in B (togli il kick, per un break).",
        hint: "Duplica è accanto ai pattern, nel Beat. Poi scegli B e modifica.",
        view: "beat",
        done: (c) => {
          const used = Object.entries(c.project.patterns).filter(([, p]) => DRUMS.some((d) => p.drums[d.id].some(Boolean)) || p.bass.some((n) => n !== null));
          return used.length >= 2;
        },
      },
      {
        text: "Nella Song metti almeno due pattern diversi nella canzone.",
        hint: "Scegli il pennello (A, B…) e clicca le battute: come la playlist di FL.",
        view: "song",
        done: (c) => new Set(c.project.song.filter(Boolean)).size >= 2,
      },
      {
        text: "Fai una canzone di almeno 8 battute.",
        hint: "Per esempio: 4 battute di A, 2 di B, 2 di A. Le battute vuote in mezzo valgono come silenzio.",
        view: "song",
        done: (c) => songLength(c.project) >= 8,
      },
      {
        text: "Accendi la modalità Song e premi Play: ascolta la traccia intera.",
        hint: "Il pulsante Song è nella pagina Song, accanto a Pattern.",
        view: "song",
        done: (c) => c.songMode && c.playing,
      },
    ],
  },
  {
    id: "drop",
    title: "Build, drop e mix",
    intro: "Ultimi ritocchi da produttore: un build che sale prima del drop, un effetto, un gruppo nel mixer e l'export.",
    outro: "Hai fatto tutto il percorso: groove, basso, armonia, struttura e mix. Ora fammi sentire cosa crei!",
    steps: [
      {
        text: "Nella pagina Auto disegna un'automazione con almeno 2 punti: un filtro che si apre, o il volume che sale (fade-in).",
        hint: "Scegli Master, clicca due battute diverse e trascina il valore: tra i due punti il filtro scorre.",
        view: "auto",
        done: (c) =>
          [...Object.values(c.project.automation), ...Object.values(c.project.volAuto ?? {})].some(
            (l) => (l ?? []).filter((v) => v !== null).length >= 2,
          ),
      },
      {
        text: "Metti un plugin su un canale o sul master: per esempio un Delay sul lead o un Compressore sul bus Drums.",
        hint: "Nel Mixer premi FX sotto un canale e scegli un plugin dal primo slot.",
        view: "mixer",
        done: (c) => MIX_TARGETS.some((t) => c.project.inserts[t].some(Boolean)),
      },
      {
        text: "Crea un gruppo per i synth: manda Chords e Lead nello stesso bus (l'uscita sotto i due canali, nel Mixer).",
        hint: "Sotto Chords scegli \"+ Nuovo bus\", poi sotto Lead scegli lo stesso bus. Rinominalo Synth: ora li regoli con un fader solo, come la batteria nel bus Drums.",
        view: "mixer",
        done: (c) => c.project.mixer.chords.out !== "master" && c.project.mixer.chords.out === c.project.mixer.lead.out,
      },
      {
        text: "Esporta la traccia (Export → Mix WAV) oppure chiedimi un Parere.",
        hint: "Export e Parere sono in alto. Con Parere ascolto l'export e ti dico cosa sistemare nel mix.",
        done: (c) => c.exported,
      },
    ],
  },
  {
    id: "bus",
    title: "Il mixer e i bus",
    intro:
      "Un bus è un gruppo di canali, come in FL: ci mandi più canali e li regoli insieme con un fader e i suoi plugin. È come un'unica manopola per tutto il kit di un batterista, invece di sette.",
    outro:
      "Ora sai raggruppare i canali: un fader e un effetto per tutto il gruppo, e con il Send un po' di suono in più dove serve. È così che si tiene in ordine un mix grande.",
    steps: [
      {
        text: "Nel Mixer premi Play e poi M (mute) sulla striscia del bus Drums: sparisce tutta la batteria insieme.",
        hint: "Sotto kick, clap e hat c'è scritto → Drums: entrano tutti lì. Se la batteria esce sul Master, sceglilo tu nel menu in fondo alla striscia del Kick (→ Drums o + Nuovo bus).",
        view: "mixer",
        done: (c) => c.playing && (drumBus(c) ? c.project.buses[drumBus(c) as BusId].muted : false),
      },
      {
        text: "Togli il mute e abbassa un po' il fader del bus Drums: tutta la batteria scende insieme, anche se i fader dei singoli canali restano dove sono.",
        hint: "Il fader è la levetta in alto nella striscia Drums; il numero sotto dice di quanti dB stai abbassando (0 dB = come prima).",
        view: "mixer",
        done: (c) => {
          const b = drumBus(c);
          return !!b && !c.project.buses[b].muted && c.project.buses[b].volume < BUS_UNITY - 0.04;
        },
      },
      {
        text: "Crea un bus nuovo con la striscia tratteggiata + Nuovo bus, prima del Master. Se vuoi rinominalo Synth (clic sul nome).",
        hint: "Compare una striscia nuova, \"Bus 2\": per ora è vuota, nessun canale ci entra.",
        view: "mixer",
        done: (c) => BUS_IDS.some((b) => c.project.buses[b].shown && b !== drumBus(c)),
      },
      {
        text: "Manda Chords e Lead nel bus nuovo: sotto ciascuno dei due canali, nel menu in fondo, scegli il bus.",
        hint: "Quando ci sono entrati, sotto il nome del bus leggi \"Chords · Lead\".",
        view: "mixer",
        done: (c) => !!synthBus(c) && c.project.mixer.lead.out === synthBus(c),
      },
      {
        text: "Metti un plugin sul bus (FX sulla sua striscia), per esempio un Riverbero: lo senti su accordi e lead insieme.",
        hint: "Premi FX sul bus e scegli il plugin nel primo slot. Prova ad accenderlo e spegnerlo mentre suona.",
        view: "mixer",
        done: (c) => {
          const b = synthBus(c);
          return !!b && c.project.inserts[b].some(Boolean);
        },
      },
      {
        text: "Ora il Send: premi Send sul bus e alza la manopola sotto il Clap. Il clap resta nel bus Drums, ma un po' del suo suono va anche nel tuo bus.",
        hint: "Il Send è una seconda uscita, più piccola: utile per mettere un po' di riverbero comune su strumenti di gruppi diversi.",
        view: "mixer",
        done: (c) => {
          const b = synthBus(c);
          return !!b && (c.project.mixer.clap.sends?.[b] ?? 0) > 0.01;
        },
      },
    ],
  },
];
