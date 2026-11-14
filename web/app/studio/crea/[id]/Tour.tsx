"use client";

// Il tour guidato della prima volta: il coach accompagna tappa per tappa, evidenzia la parte dello studio
// di cui parla e apre lui la vista giusta. Non blocca niente: mentre lo segui puoi già cliccare e provare.
// I testi sono scritti qui (non generati): uguali per tutti, si controllano e non costano token.
import { useCallback, useEffect, useState } from "react";
import { speak, stopSpeaking } from "@/lib/voice-client";
import { DEFAULT_VOICE, isVoice } from "@/lib/voices";

export type TourView = "beat" | "roll" | "song" | "mixer" | "auto";

type Step = {
  title: string;
  text: string;
  target?: string; // selettore CSS della parte da evidenziare; senza = scheda al centro
  view?: TourView; // la vista da aprire prima di mostrare la tappa
  coach?: boolean; // apre il pannello del coach
  wide?: boolean; // solo sul computer (le pagine non ci sono sul telefono)
};

export const TOUR: Step[] = [
  {
    title: "Benvenuto in Deep Studio",
    text: "Ciao! Sono il tuo coach. In un paio di minuti ti faccio vedere dove stanno le cose e come si costruisce una traccia house, un pezzo alla volta. Puoi saltare quando vuoi e rivedere il tour con il pulsante Tutorial.",
  },
  {
    title: "Play, Stop, Rec",
    text: "Questo è il trasporto. Play fa partire la musica, Stop la ferma; anche la barra spaziatrice fa Play e Stop. Nel display vedi i BPM, il pattern che suona e lo step. Le manopole Tempo e Swing sono a destra.",
    target: ".hw-transport",
    view: "beat",
  },
  {
    title: "Lo studio è a pagine",
    text: "Come in FL Studio, ogni lavoro ha la sua pagina: Beat per la batteria, Roll per le note, Song per la canzone, Mixer per volumi ed effetti, Auto per le automazioni. Le apriamo una alla volta.",
    target: ".hw-views-tabs",
    view: "beat",
    wide: true,
  },
  {
    title: "Il beat",
    text: "Questo è lo step sequencer: una battuta divisa in 16 step. Clicca una casella per accendere un colpo. Il kick sugli step 1, 5, 9 e 13 è il battito della house. Ogni riga è uno strumento, e il pulsante S lo fa suonare da solo.",
    target: '[data-panel="beat"] .hw-seq-grid',
    view: "beat",
  },
  {
    title: "Pattern diversi",
    text: "Un pattern è un blocco di una battuta, e ne hai 16, da A a P. Scegli una lettera e scrivi qualcosa di diverso: per esempio A per il groove e B per il break. Duplica copia il pattern nel primo libero, così fai una variazione in un attimo.",
    target: '[data-panel="beat"] .hw-patterns',
    view: "beat",
  },
  {
    title: "Pad e kit",
    text: "A sinistra ci sono i pad e i kit di batteria. Clicca un pad, oppure usa le lettere della tastiera del computer, per suonarlo. Con Registra acceso quello che suoni si scrive nel pattern: prima senti quattro click di count-in, poi si parte.",
    target: ".console-side",
    view: "beat",
  },
  {
    title: "Le note: basso, lead, accordi",
    text: "Nel Roll scrivi le note. Bass è il basso, Lead la melodia, Chord gli accordi. Clicca nella griglia per mettere una nota, oppure suona con la tastiera: Z X C V B N M sono Do Re Mi Fa Sol La Si. In alto scegli su quale pattern stai lavorando.",
    target: '[data-panel="roll"]',
    view: "roll",
  },
  {
    title: "I suoni",
    text: "Qui c'è il synth dello strumento. Clicca un suono per sentirlo e scegliere, e gira il Cutoff per renderlo più scuro o più brillante. Con Tutti il suono vale per ogni pattern; con Solo vale solo per il pattern che stai modificando.",
    target: '[data-panel="roll"] .hw-synths',
    view: "roll",
  },
  {
    title: "La canzone",
    text: "Nella Song costruisci la traccia intera. Scegli un pattern come pennello e clicca le battute per dipingerlo: intro, groove, break, drop. È come la playlist di FL. Accendi la modalità Song per ascoltare tutta la canzone.",
    target: '[data-panel="song"]',
    view: "song",
  },
  {
    title: "Il mixer",
    text: "Il Mixer ha un canale per ogni strumento: il volume, M per il mute, S per il solo e FX per gli effetti, come EQ, compressore, riverbero e delay. Il sidechain abbassa il basso a ogni kick: è il classico respiro della house.",
    target: '[data-panel="mixer"]',
    view: "mixer",
  },
  {
    title: "Le automazioni",
    text: "In Auto disegni come cambia un filtro lungo la canzone. Per esempio, un filtro che si apre piano piano nel build-up, prima del drop.",
    target: '[data-panel="auto"]',
    view: "auto",
  },
  {
    title: "Esporta e chiedi un parere",
    text: "Quando sei pronto, WAV esporta la traccia. Parere mi fa ascoltare l'export e ti dico cosa sistemare nel mix. Versioni ti riporta a come era prima, se sbagli qualcosa.",
    target: ".hw-transport",
    view: "beat",
  },
  {
    title: "Il tuo coach",
    text: "E qui ci sono io. Chiedimi quello che vuoi: ti spiego un concetto, ti do un consiglio, oppure scrivo io un pattern direttamente nello studio. Con Voce ti rispondo ad alta voce.",
    target: ".console-coach",
    view: "beat",
    coach: true,
  },
  {
    title: "Tocca a te",
    text: "Per cominciare, chiedimi: fammi un groove deep house a 122 BPM. Oppure accendi qualche step nel Beat e premi Play. Buona musica!",
  },
];

type Rect = { top: number; left: number; width: number; height: number };
const CARD_W = 360;
const MIN_SIDE = 270; // di fianco la scheda può stringersi fino a qui
const PAD = 8; // margine dell'evidenziazione intorno alla parte

export function Tour({
  onView,
  onCoach,
  onClose,
}: {
  onView: (v: TourView) => void;
  onCoach: () => void;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const step = TOUR[i];
  const last = i === TOUR.length - 1;

  // la vista giusta per la tappa, poi la parte da evidenziare portata sullo schermo
  useEffect(() => {
    if (step.view) onView(step.view);
    if (step.coach) onCoach();
    const t = setTimeout(() => {
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      el?.scrollIntoView({ block: window.innerWidth < 640 ? "start" : "nearest", behavior: "smooth" });
    }, 60);
    return () => clearTimeout(t);
  }, [i, step, onView, onCoach]);

  // la posizione si aggiorna mentre la pagina si muove (scroll, finestra ridimensionata, vista che cambia)
  useEffect(() => {
    const measure = () => {
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    measure();
    const id = setInterval(measure, 150);
    return () => clearInterval(id);
  }, [step]);

  const go = useCallback(
    (n: number) => {
      // salta le tappe di parti che su questo schermo non ci sono (sul telefono non ci sono le pagine)
      const dir = n >= i ? 1 : -1;
      let next = Math.max(0, Math.min(TOUR.length - 1, n));
      while (next > 0 && next < TOUR.length - 1 && !shown(TOUR[next])) next += dir;
      setI(next);
      // la voce parte dopo un clic: i browser non lasciano suonare l'audio senza un gesto dell'utente
      if (voiceOn) void speak(TOUR[next].text, voiceId());
    },
    [voiceOn, i],
  );
  const close = useCallback(() => {
    stopSpeaking();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      stopSpeaking();
    };
  }, [close]);

  return (
    <>
      {rect ? (
        <div
          className="ds-tour-spot"
          aria-hidden="true"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD }}
        />
      ) : (
        <div className="ds-tour-dim" aria-hidden="true" />
      )}
      <div className="ds-tour-card" role="dialog" aria-modal="false" aria-labelledby="ds-tour-title" style={cardPlace(rect)}>
        <div className="ds-tour-head">
          <span className="ds-tour-who">Coach · tappa {i + 1} di {TOUR.length}</span>
          <button type="button" className="ds-tour-x" aria-label="Chiudi il tour" onClick={close}>
            ✕
          </button>
        </div>
        <h2 id="ds-tour-title" className="ds-tour-title">
          {step.title}
        </h2>
        <p className="ds-tour-text">{step.text}</p>
        <div className="ds-tour-dots" aria-hidden="true">
          {TOUR.map((_, n) => (
            <span key={n} data-on={n === i} />
          ))}
        </div>
        <div className="ds-tour-actions">
          <button
            type="button"
            className="hw-btn hw-btn--small"
            aria-pressed={voiceOn}
            title="Il coach legge le spiegazioni ad alta voce"
            onClick={() => {
              if (voiceOn) stopSpeaking();
              else void speak(step.text, voiceId());
              setVoiceOn(!voiceOn);
            }}
          >
            <span className="hw-btn-led" />
            Voce
          </button>
          <span className="ds-tour-grow" />
          {i === 0 ? (
            <button type="button" className="hw-btn hw-btn--small" onClick={close}>
              Salta
            </button>
          ) : (
            <button type="button" className="hw-btn hw-btn--small" onClick={() => go(i - 1)}>
              Indietro
            </button>
          )}
          <button type="button" className="hw-btn hw-btn--small ds-tour-next" onClick={() => (last ? close() : go(i + 1))}>
            {i === 0 ? "Iniziamo" : last ? "Fine" : "Avanti"}
          </button>
        </div>
      </div>
    </>
  );
}

// la tappa vale su questo schermo? (stessa soglia della console a pagine)
function shown(s: Step) {
  return !s.wide || window.matchMedia("(min-width: 1000px)").matches;
}

// la voce scelta per il coach (stessa scelta della chat), se c'è
function voiceId() {
  try {
    const v = localStorage.getItem("ds-coach-voce-id");
    return v === "browser" || isVoice(v) ? v : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

// La scheda accanto alla parte evidenziata: sotto, sopra, di fianco (anche più stretta), altrimenti nell'angolo
// in basso a destra della parte. Mai nel mezzo: coprirebbe proprio quello di cui parla il coach.
function cardPlace(r: Rect | null): React.CSSProperties {
  if (typeof window === "undefined" || !r) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 640) return { left: 12, right: 12, bottom: 12, width: "auto" }; // telefono: in basso
  const w = Math.min(CARD_W, vw - 24);
  const h = 290; // altezza indicativa della scheda
  const gap = PAD + 12;
  const clampX = (x: number, cw = w) => Math.max(12, Math.min(vw - cw - 12, x));
  const clampY = (y: number) => Math.max(12, Math.min(vh - h - 12, y));
  if (r.top + r.height + gap + h < vh) return { top: r.top + r.height + gap, left: clampX(r.left), width: w };
  if (r.top - gap - h > 0) return { top: r.top - gap - h, left: clampX(r.left), width: w };
  const right = vw - (r.left + r.width + gap) - 12;
  if (right >= MIN_SIDE) return { top: clampY(r.top + 40), left: r.left + r.width + gap, width: Math.min(CARD_W, right) };
  const left = r.left - gap - 12;
  if (left >= MIN_SIDE) {
    const cw = Math.min(CARD_W, left);
    return { top: clampY(r.top + 40), left: r.left - gap - cw, width: cw };
  }
  return { top: clampY(r.top + r.height - h - 16), left: clampX(r.left + r.width - w - 16), width: w };
}
