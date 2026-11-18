"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CoachChat, type Msg } from "@/components/CoachChat";
import { Knob } from "@/components/hw/Knob";
import { VersionsPanel } from "@/components/hw/VersionsPanel";
import { Engine } from "@/lib/daw/engine";
import {
  BASS_HIGH,
  BASS_LOW,
  BEATS,
  CHORD_LAYERS,
  CHORD_TYPES,
  DRUMS,
  LEAD_HIGH,
  LEAD_VOICES,
  LEAD_LOW,
  LEAD_WAVES,
  LEAD_SOUNDS,
  BASS_WAVES,
  CHORD_STYLES,
  NOTE_NAMES,
  SLOTS,
  slotColor,
  visibleSlots,
  STEPS,
  emptyPattern,
  isEmptyPattern,
  normalize,
  noteName,
  songLength,
  chordName,
  AUTO_TARGETS,
  MAX_SONG_BARS,
  MIN_SONG_BARS,
  resizeSong,
  songSeconds,
  filterLabel,
  laneValue,
  BUS_IDS,
  BUS_UNITY,
  CHANNEL_IDS,
  isBus,
  type BusId,
  type MixTarget,
  type Out,
  soundOf,
  noteLen,
  maxLen,
  setNoteLen,
  setVel,
  velOf,
  velGain,
  VEL_DEFAULT,
  VEL_MIN,
  SOUND_KEY,
  type SoundInst,
  type Sounds,
  type AutoTarget,
  type ChannelFx,
  type ChannelId,
  type Chord,
  type ChordStyle,
  type ChordType,
  type Wave,
  type DrumId,
  type Project,
  type Slot,
} from "@/lib/daw/project";
import {
  defaultSlot,
  INSERT_SLOTS,
  isPluginType,
  PLUGIN_GROUPS,
  pluginParams,
  PLUGIN_TYPES,
  PLUGINS,
  type PluginSlot,
} from "@/lib/daw/plugins";
import { fold, KEY_NOTES, keyNote, keyRoot, OCTAVES, type KeyInstrument } from "@/lib/daw/keyboard";
import { connectMidi, gmDrum, midiGranted, midiSupported } from "@/lib/daw/midi";
import { KIT_IDS, KITS } from "@/lib/daw/kits";
import { measure, type Measures } from "@/lib/daw/measure";
import { encodeWav, renderAudio, renderPlan, SAMPLE_RATE } from "@/lib/daw/render";
import { AUTO_EVERY_MS, loadVersion, saveVersion, type Version } from "@/lib/daw/versions";
import { createClient } from "@/lib/supabase/client";
import { Segnala } from "./Segnala";
import { Tour } from "./Tour";

type SaveState = "salvato" | "modificato" | "salvo" | "errore";

// durata in minuti:secondi, per il titolo della canzone
const clock = (seconds: number) => {
  const t = Math.round(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

// Le viste della console sul computer (una alla volta, come le finestre di FL Studio).
// Icone disegnate con un solo tracciato SVG 24×24.
const VIEWS = [
  { id: "beat", label: "Beat", icon: "M4 6h4v4H4zM10 6h4v4h-4zM16 6h4v4h-4zM4 14h4v4H4zM16 14h4v4h-4z" },
  { id: "roll", label: "Roll", icon: "M3 6h7M8 11h9M5 16h6M14 19h7" },
  { id: "song", label: "Song", icon: "M3 5h7v4H3zM12 5h9v4h-9zM6 11h9v4H6zM3 17h12v3H3z" },
  { id: "mixer", label: "Mixer", icon: "M6 3v18M12 3v18M18 3v18M4 14h4M10 8h4M16 16h4" },
  { id: "auto", label: "Auto", icon: "M3 18c4 0 4-12 9-12s5 8 9 8" },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];
const isView = (v: unknown): v is ViewId => VIEWS.some((x) => x.id === v);

function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage non disponibile: la scelta vale solo per questa visita
  }
}

// righe del piano roll, dall'alto in basso, per ogni strumento con le note
const rows = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => hi - i);
// Le schermate con la tastiera: una per ogni strumento che si suona a note (come il piano roll di FL)
const ROLLS = {
  bass: { label: "Bass", rows: rows(BASS_LOW, BASS_HIGH) },
  lead: { label: "Lead", rows: rows(LEAD_LOW, LEAD_HIGH) },
} as const;
type RollId = keyof typeof ROLLS;
type RollTab = KeyInstrument; // bass, lead o chords: è anche lo strumento della tastiera del computer
const ROLL_TABS: { id: RollTab; label: string }[] = [
  { id: "bass", label: "Bass" },
  { id: "lead", label: "Lead" },
  { id: "chords", label: "Chord" },
];
const CHORD_ROOTS = Array.from({ length: 12 }, (_, i) => 11 - i); // Si in alto, Do in basso
const isSharp = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
const pct = (v: number) => `${Math.round(v * 100)}%`;
// la forza di un tasto MIDI (1–127) nella velocity dello studio (0.1–1): un tasto premuto "normale" (~100) ≈ 80%
const midiVel = (v: number) => Math.max(0.1, Math.min(1, v / 125));
const two = (n: number) => String(n).padStart(2, "0");

// I pad: colore della retroilluminazione e tasto della tastiera del computer (come un controller)
const PADS: { id: ChannelId; label: string; key: string; color: string }[] = [
  { id: "kick", label: "Kick", key: "z", color: "red" },
  { id: "clap", label: "Clap", key: "x", color: "orange" },
  { id: "hat", label: "Hi-hat", key: "c", color: "yellow" },
  { id: "openhat", label: "Open hat", key: "v", color: "yellow" },
  { id: "perc", label: "Perc", key: "b", color: "teal" },
  { id: "bass", label: "Bass", key: "n", color: "green" },
  { id: "chords", label: "Chord", key: "m", color: "purple" },
  { id: "lead", label: "Lead", key: ",", color: "blue" },
];
const CHANNELS: { id: ChannelId; label: string }[] = [
  ...DRUMS,
  { id: "bass", label: "Bass" },
  { id: "chords", label: "Chords" },
  { id: "lead", label: "Lead" },
];
const isDrum = (c: ChannelId): c is DrumId => c !== "bass" && c !== "chords" && c !== "lead";
const TYPE_LABEL: Record<ChordType, string> = {
  min: "minore",
  maj: "maggiore",
  min7: "m7",
  maj7: "maj7",
  dom7: "7",
  min9: "m9",
  sus2: "sus2",
  sus4: "sus4",
};

export function Daw({
  id,
  initialTitle,
  initialProject,
  coachMessages,
  tourDone = true,
}: {
  id: string;
  initialTitle: string;
  initialProject: Project;
  coachMessages: Msg[];
  tourDone?: boolean; // l'account ha già visto il tour guidato
}) {
  const [project, setProject] = useState(initialProject);
  const [title, setTitle] = useState(initialTitle);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rec, setRec] = useState(false);
  // count-in: una battuta di click (4) prima di registrare; la scelta resta nel browser
  const [countInOn, setCountInOn] = useState(true);
  const [counting, setCounting] = useState(0); // 4, 3, 2, 1 durante il conto, 0 = niente
  useEffect(() => setCountInOn(stored("ds-count-in") !== "0"), []);
  const toggleCountIn = () =>
    setCountInOn((o) => {
      store("ds-count-in", o ? "0" : "1");
      return !o;
    });
  const [flash, setFlash] = useState<ChannelId | null>(null);
  const [save, setSave] = useState<SaveState>("salvato");
  const [undo, setUndo] = useState<{ project: Project; name: string } | null>(null);
  const [editing, setEditing] = useState<Slot>("A"); // il pattern che vedi e modifichi
  const [brush, setBrush] = useState<Slot>("A"); // il pattern che "dipingi" sulle battute della canzone
  // il marker di inizio della canzone (battuta da 0), come nella playlist di FL; ricordato nel browser
  const [startBar, setStartBar] = useState(0);
  useEffect(() => {
    const v = Number(stored(`ds-inizio-${id}`));
    if (Number.isInteger(v) && v > 0) setStartBar(v);
  }, [id]);
  const chooseStart = (b: number) => {
    const next = b === startBar ? 0 : b; // clic sul marker: torna alla battuta 1
    setStartBar(next);
    store(`ds-inizio-${id}`, String(next));
  };
  const effStart = startBar < songLength(project) ? startBar : 0; // oltre la fine della canzone non vale
  const startRef = useRef(0);
  startRef.current = effStart;
  useEffect(() => setBrush(editing), [editing]); // come in FL: il pattern che apri è anche quello che metti
  const [songMode, setSongMode] = useState(false);
  const [bar, setBar] = useState(-1);
  const [playingSlot, setPlayingSlot] = useState<Slot | null>(null);
  const pat = project.patterns[editing];
  const [showVersions, setShowVersions] = useState(false);
  const [roll, setRoll] = useState<RollTab>("bass"); // scheda del Roll = strumento della tastiera
  // la nota (o la fondamentale dell'accordo) appena suonata si accende sulla tastiera della schermata
  const [keyHit, setKeyHit] = useState<{ inst: RollTab; value: number } | null>(null);
  const lightKey = useCallback((inst: RollTab, value: number) => {
    setKeyHit({ inst, value });
    setTimeout(() => setKeyHit((h) => (h && h.inst === inst && h.value === value ? null : h)), 180);
  }, []);
  const [view, setView] = useState<ViewId>("beat"); // la vista al centro (sul computer)
  const [coachOpen, setCoachOpen] = useState(true);
  useEffect(() => {
    const v = stored("ds-vista");
    if (isView(v)) setView(v);
    if (stored("ds-coach-aperto") === "0") setCoachOpen(false);
  }, []);
  const chooseView = useCallback((v: ViewId) => {
    setView(v);
    store("ds-vista", v);
  }, []);
  // Tour guidato: parte da solo la prima volta (account o browser che non l'hanno mai visto)
  const [touring, setTouring] = useState(false);
  useEffect(() => {
    if (!tourDone && stored("ds-tour-visto") !== "1") setTouring(true);
  }, [tourDone]);
  const endTour = useCallback(() => {
    setTouring(false);
    store("ds-tour-visto", "1");
    // nell'account, così non riparte su un altro computer
    if (!tourDone) void createClient().auth.updateUser({ data: { tour_done: true } }).catch(() => {});
  }, [tourDone]);
  const openCoach = useCallback(() => setCoachOpen(true), []);
  const [reporting, setReporting] = useState(false); // il riquadro "Segnala un problema"
  const closeReport = useCallback(() => setReporting(false), []);
  const openRoll = (k: "bass" | "lead" | "chords") => {
    setRoll(k);
    chooseView("roll");
  };
  const toggleCoach = () => {
    setCoachOpen((o) => {
      store("ds-coach-aperto", o ? "0" : "1");
      return !o;
    });
  };
  const [autoTarget, setAutoTarget] = useState<AutoTarget>("master");
  const [exporting, setExporting] = useState<"no" | "sì" | "errore">("no");
  const [listening, setListening] = useState(false);
  const [measures, setMeasures] = useState<Measures | null>(null);
  const [ask, setAsk] = useState<{ id: number; text: string; extra?: Record<string, unknown> }>();
  const [versionsTick, setVersionsTick] = useState(0);

  // il motore e la chat leggono sempre lo stato più recente, anche a metà battuta
  const projectRef = useRef(project);
  projectRef.current = project;
  const titleRef = useRef(title);
  titleRef.current = title;
  const playbackRef = useRef({ song: songMode, editing });
  playbackRef.current = { song: songMode, editing };
  const engineRef = useRef<Engine | null>(null);

  const engine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new Engine(
        () => projectRef.current,
        () => playbackRef.current,
        (s, b, slot) => {
          setStep(s);
          setBar(b);
          setPlayingSlot(slot);
        },
      );
      engineRef.current.setSolo(soloRef.current); // il motore nasce al primo suono: parte con il solo già scelto
      engineRef.current.onCount = setCounting;
    }
    return engineRef.current;
  }, []);

  const play = useCallback(async (countIn = 0) => {
    const e = engine();
    if (!e.playing) await e.start(playbackRef.current.song ? startRef.current : 0, countIn);
    setPlaying(true);
  }, [engine]);
  const stop = useCallback(() => {
    engineRef.current?.stop();
    setPlaying(false);
  }, []);
  const togglePlay = useCallback(() => (engineRef.current?.playing ? stop() : void play()), [play, stop]);
  // REC in alto e "Registra" vicino alla tastiera sono lo stesso interruttore: accendono la registrazione
  // e, se è fermo, fanno partire il Play
  const toggleRec = () => {
    const on = !rec;
    setRec(on);
    // da fermo: prima il count-in (4 click, una battuta), poi parte e registra
    if (on && !engineRef.current?.playing) void play(countInOn ? 4 : 0);
  };

  useEffect(() => () => engineRef.current?.close(), []);
  useEffect(() => {
    engineRef.current?.applyMixer();
  }, [project.mixer, project.bpm, project.fx, project.masterFilter, project.automation, project.inserts]);

  // Annulla / Ripeti: una pila dei progetti di prima (come i fogli di un blocco). Le modifiche fatte di seguito
  // in meno di mezzo secondo (un trascinamento, un fader che scorre) diventano un passo solo.
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastEdit = useRef(0);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });
  const syncHist = useCallback(() => setHist({ undo: past.current.length, redo: future.current.length }), []);
  // force: un passo a sé (il coach, una versione ripristinata), mai unito alle modifiche vicine
  const remember = useCallback(
    (force = false) => {
      const now = performance.now();
      if (force || now - lastEdit.current > 450) {
        past.current.push(projectRef.current);
        if (past.current.length > 100) past.current.shift();
        future.current = [];
        syncHist();
      }
      lastEdit.current = force ? 0 : now;
    },
    [syncHist],
  );
  const undoEdit = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(projectRef.current);
    lastEdit.current = 0;
    setProject(prev);
    syncHist();
  }, [syncHist]);
  const redoEdit = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(projectRef.current);
    lastEdit.current = 0;
    setProject(next);
    syncHist();
  }, [syncHist]);

  const update = useCallback(
    (fn: (p: Project) => void) => {
      remember();
      setProject((p) => {
        const next = structuredClone(p);
        fn(next);
        return next;
      });
    },
    [remember],
  );

  // Tastiera musicale (come la typing keyboard di FL): in modalità "keys" le lettere suonano note
  // niente interruttore: con il Roll aperto (su un computer) le lettere suonano le note dello strumento,
  // nelle altre viste suonano i pad. I pad sullo schermo restano cliccabili sempre.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1000px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const keyMode: "pad" | "keys" = wide && view === "roll" ? "keys" : "pad";
  const [octaves, setOctaves] = useState({ bass: OCTAVES.bass.start, lead: OCTAVES.lead.start });
  const [keyChord, setKeyChord] = useState<ChordType>("min7");
  const [lastKey, setLastKey] = useState("");
  const keyInst = roll;
  const keysRef = useRef({ keyMode, keyInst, octaves, keyChord });
  keysRef.current = { keyMode, keyInst, octaves, keyChord };

  // le note registrate con il tasto ancora giù: al rilascio prendono la loro lunghezza
  const held = useRef(new Map<string, { slot: Slot; step: number; note: number; inst: "bass" | "lead"; at: number }>());
  // registrazione: quando il tasto si alza la nota dura quanto l'hai tenuto, arrotondato agli step (da 2 in su)
  const releaseKey = useCallback(
    (code: string, at: number) => {
      const h = held.current.get(code);
      if (!h) return;
      held.current.delete(code);
      const stepDur = 60 / projectRef.current.bpm / 4;
      const len = Math.round((at - h.at) / 1000 / stepDur);
      if (len >= 2) update((p) => setNoteLen(p.patterns[h.slot], h.inst, h.step, h.note, len));
    },
    [update],
  );
  // un tasto della tastiera musicale: suona la nota (o l'accordo) e con REC + Play la scrive sullo step
  // midi: un tasto di una tastiera MIDI (nota 0–127 e forza 1–127) al posto di un tasto del computer;
  // code allora è "midi" + nota, e serve solo a ritrovare la nota quando il tasto si alza
  const playKey = useCallback(
    (code: string, pressedAt?: number, midi?: { note: number; vel: number }) => {
      const k = keysRef.current;
      // registrazione: lo step più vicino a quando hai premuto (in song nel pattern che suona lì)
      const pos = rec ? engineRef.current?.recordPosition(pressedAt) : null;
      const s = pos?.step ?? -1;
      const slot = pos ? (playbackRef.current.song ? pos.slot : playbackRef.current.editing) : null;
      const recording = pos && s >= 0 && slot;
      if (k.keyInst === "chords") {
        const root = midi ? midi.note % 12 : keyRoot(code);
        if (root === null) return false;
        const chord: Chord = { root, type: k.keyChord };
        const level = midi ? velGain(midiVel(midi.vel)) : 1;
        void engine().preview("chords", { chord, slot: slot || undefined, level });
        setLastKey(chordName(chord));
        lightKey("chords", root);
        if (recording) {
          update((p) => {
            // più tasti insieme = accordi sovrapposti sullo stesso battito (al massimo 3)
            const layers = p.patterns[slot].chords[Math.floor(s / 4)];
            if (!layers.some((x) => x.root === chord.root && x.type === chord.type) && layers.length < CHORD_LAYERS) {
              layers.push(chord);
            }
            if (midi) setVel(p.patterns[slot], `c${Math.floor(s / 4)}`, midiVel(midi.vel));
          });
        }
      } else {
        const inst = k.keyInst;
        // dalla tastiera MIDI la nota è quella del tasto, spostata di ottava se esce dall'estensione dello strumento
        const note = midi ? fold(midi.note, OCTAVES[inst].low, OCTAVES[inst].high) : keyNote(code, inst, k.octaves[inst]);
        if (note === null) return false;
        const level = midi ? velGain(midiVel(midi.vel)) : 1;
        void engine().preview(inst, { note, slot: slot || undefined, level });
        setLastKey(noteName(note));
        lightKey(inst, note);
        if (recording) {
          update((p) => {
            const pp = p.patterns[slot];
            // lead: la nota si aggiunge a quelle dello step (accordi suonati con più tasti); basso: sostituisce
            if (inst === "lead") {
              if (!pp.lead[s].includes(note) && pp.lead[s].length < LEAD_VOICES) {
                pp.lead[s] = [...pp.lead[s], note].sort((a, b) => a - b);
              }
            } else {
              if (pp.bass[s] !== null) setNoteLen(pp, "bass", s, pp.bass[s] as number, 1);
              pp.bass[s] = note;
            }
            if (midi) setVel(pp, `${inst === "lead" ? "l" : "b"}${s}`, midiVel(midi.vel));
          });
          // quando lasci il tasto, la nota diventa lunga quanto l'hai tenuto (vedi onKeyUp)
          held.current.set(code, { slot, step: s, note, inst, at: pressedAt ?? performance.now() });
        }
      }
      setFlash(k.keyInst);
      setTimeout(() => setFlash((f) => (f === k.keyInst ? null : f)), 140);
      return true;
    },
    [engine, rec, update, lightKey],
  );
  // I suoni dei synth del pattern che modifichi: il suo, se ce l'ha, altrimenti quello di base del progetto
  const editPat = project.patterns[editing];
  const bassS = soundOf(project, editPat, "bass");
  const leadS = soundOf(project, editPat, "lead");
  const chordS = soundOf(project, editPat, "chords");
  // una modifica al suono va dove suona: nel suono proprio del pattern o in quello di base
  const setSound = <K extends SoundInst>(k: K, fn: (x: Required<Sounds>[K]) => void) =>
    update((p) => fn(soundOf(p, p.patterns[editing], k)));
  // "Solo X": il pattern prende una copia del suono di base e da lì in poi va per conto suo.
  // "Tutti": il pattern lascia il suo e torna a quello di base.
  const setOwnSound = (k: SoundInst, own: boolean) =>
    update((p) => {
      const pat = p.patterns[editing];
      if (own) pat.sounds = { ...pat.sounds, [k]: structuredClone(p[SOUND_KEY[k]]) } as Sounds;
      else if (pat.sounds) {
        delete pat.sounds[k];
        if (Object.keys(pat.sounds).length === 0) delete pat.sounds;
      }
    });
  const soundScope = (k: SoundInst) => {
    const own = !!editPat.sounds?.[k];
    const others = SLOTS.filter((x) => x !== editing && project.patterns[x].sounds?.[k]);
    return (
      <div className="hw-seg hw-scope" role="group" aria-label="Dove vale questo suono">
        <button
          type="button"
          className="hw-btn hw-btn--small"
          aria-pressed={!own}
          title={`Suono di base: vale in tutti i pattern senza un suono proprio${others.length ? ` (ce l'hanno: ${others.join(", ")})` : ""}`}
          onClick={() => own && setOwnSound(k, false)}
        >
          <span className="hw-btn-led" />
          Tutti
        </button>
        <button
          type="button"
          className="hw-btn hw-btn--small"
          aria-pressed={own}
          title={`Suono proprio del pattern ${editing}: cambia solo qui`}
          onClick={() => !own && setOwnSound(k, true)}
        >
          <span className="hw-btn-led" />
          Solo {editing}
        </button>
        {others.length > 0 && <span className="hw-scope-note">proprio: {others.join(" ")}</span>}
      </div>
    );
  };
  // scegli un suono e lo senti subito (dopo che React ha aggiornato il progetto che il motore legge)
  const tryOut = (c: "bass" | "lead" | "chords") => setTimeout(() => !engineRef.current?.playing && hitPad(c), 30);
  const shiftOctave = (d: number) => {
    if (keyInst === "chords") return;
    const r = OCTAVES[keyInst];
    setOctaves((o) => ({ ...o, [keyInst]: Math.min(r.max, Math.max(r.min, o[keyInst] + d)) }));
  };

  // Un colpo sul pad: suona sempre; con REC acceso e Play, scrive il colpo sullo step che sta suonando
  // vel: la forza di un tasto MIDI (1–127); senza = colpo normale
  const hitPad = useCallback(
    (c: ChannelId, pressedAt?: number, vel?: number) => {
      const cur = projectRef.current.patterns[playbackRef.current.editing];
      void engine().preview(c, {
        note: c === "lead" ? (cur.lead.find((n) => n.length)?.[0] ?? 69) : (cur.bass.find((n) => n !== null) ?? BASS_LOW),
        chord: cur.chords.find((x) => x.length)?.[0],
        level: vel ? velGain(midiVel(vel)) : 1,
      });
      setFlash(c);
      setTimeout(() => setFlash((f) => (f === c ? null : f)), 140);
      // registrazione sullo step più vicino; in song nel pattern che suona lì, altrimenti in quello che modifichi
      const pos = rec && isDrum(c) ? engineRef.current?.recordPosition(pressedAt) : null;
      const s = pos?.step ?? -1;
      const slot = pos ? (playbackRef.current.song ? pos.slot : playbackRef.current.editing) : null;
      if (pos && s >= 0 && isDrum(c) && slot) {
        update((p) => {
          p.patterns[slot].drums[c][s] = true;
          if (vel) setVel(p.patterns[slot], `${c}${s}`, midiVel(vel));
        });
      }
    },
    [engine, rec, update],
  );

  // tastiera: spazio = play/stop, Z X C V B N = pad (non mentre scrivi)
  useEffect(() => {
    // lo spazio fa sempre Play/Stop, anche se l'ultimo pulsante cliccato ha ancora il focus;
    // solo mentre scrivi (titolo, chat del coach) resta uno spazio
    const typing = (el: EventTarget | null) =>
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && !["range", "checkbox", "radio", "button", "submit"].includes(el.type)) ||
      (el instanceof HTMLElement && el.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault(); // niente pagina che scorre, niente pulsante premuto
        if (!e.repeat) togglePlay();
        return;
      }
      // Ctrl+Z annulla, Ctrl+Y o Ctrl+Shift+Z ripete (Cmd sul Mac); mentre scrivi resta l'annulla del testo
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing(e.target)) {
        const k = e.key.toLowerCase();
        if (k === "z" && !e.shiftKey) {
          e.preventDefault();
          undoEdit();
          return;
        }
        if (k === "y" || (k === "z" && e.shiftKey)) {
          e.preventDefault();
          redoEdit();
          return;
        }
      }
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      // con il Roll aperto le lettere (e alcuni numeri) sono note: niente pad e niente cambio vista
      if (keysRef.current.keyMode === "keys") {
        if (e.code in KEY_NOTES) {
          e.preventDefault();
          playKey(e.code, e.timeStamp);
        }
        return;
      }
      // 1–6: cambia vista (le cifre non sono usate dai pad)
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= VIEWS.length && !e.altKey) {
        chooseView(VIEWS[n - 1].id);
        return;
      }
      const pad = PADS.find((p) => p.key === e.key.toLowerCase());
      if (pad) hitPad(pad.id, e.timeStamp);
    };
    // i browser "cliccano" il pulsante col focus quando lo spazio viene rilasciato: lo blocco anche lì
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target)) e.preventDefault();
      releaseKey(e.code, e.timeStamp);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [togglePlay, hitPad, chooseView, playKey, releaseKey, undoEdit, redoEdit]);

  // Tastiera MIDI: nel Roll (sul computer) suona lo strumento della scheda, come la tastiera del computer;
  // nelle altre viste i tasti bassi (35–51, mappa General MIDI) suonano la batteria, come i pad di un controller.
  const [midiState, setMidiState] = useState<{ on: boolean; names: string[]; error: string }>({ on: false, names: [], error: "" });
  const [midiHit, setMidiHit] = useState(false);
  // il controllo si fa nel browser, dopo il caricamento: sul server il MIDI non esiste
  const [midiOk, setMidiOk] = useState(false);
  const midiStop = useRef<(() => void) | null>(null);
  const midiRef = useRef({ playKey, hitPad, releaseKey });
  midiRef.current = { playKey, hitPad, releaseKey };
  const startMidi = useCallback(async () => {
    if (midiStop.current) return;
    try {
      midiStop.current = await connectMidi({
        on: (note, vel, at) => {
          const m = midiRef.current;
          if (keysRef.current.keyMode === "keys") m.playKey(`midi${note}`, at, { note, vel });
          else {
            const d = gmDrum(note);
            if (d) m.hitPad(d, at, vel);
          }
          setMidiHit(true);
          setTimeout(() => setMidiHit(false), 120);
        },
        off: (note, at) => midiRef.current.releaseKey(`midi${note}`, at),
        devices: (names) => setMidiState({ on: true, names, error: "" }),
      });
      store("ds-midi", "1");
    } catch {
      setMidiState({ on: false, names: [], error: "Il browser non ha dato il permesso per il MIDI" });
    }
  }, []);
  useEffect(() => {
    setMidiOk(midiSupported());
    // permesso già dato in una visita precedente: mi ricollego da solo
    if (midiSupported() && stored("ds-midi") === "1") void midiGranted().then((ok) => {
        if (ok) void startMidi();
      });
    return () => midiStop.current?.();
  }, [startMidi]);
  const midiButton = (
    <button
      type="button"
      className="hw-btn hw-btn--small hw-midi"
      aria-pressed={midiState.on}
      data-hit={midiHit}
      disabled={!midiOk}
      title={
        !midiOk
          ? "Questo browser non legge le tastiere MIDI: usa Chrome o Edge"
          : midiState.error ||
            (midiState.on
              ? midiState.names.length
                ? `Collegata: ${midiState.names.join(", ")}. Nel Roll suona lo strumento; altrove i tasti bassi suonano la batteria.`
                : "MIDI acceso: collega una tastiera USB"
              : "Collega una tastiera MIDI (USB): suoni e registri con lunghezza e forza dei tasti")
      }
      onClick={() => void startMidi()}
    >
      <span className="hw-btn-led" />
      MIDI{midiState.on && midiState.names.length ? ` ${midiState.names.length}` : ""}
    </button>
  );

  // una "fotografia" nella cronologia (la lista nel pannello si aggiorna)
  const snapshot = useCallback(
    async (label: string, data = projectRef.current, t = titleRef.current) => {
      const ok = await saveVersion(id, t, data, label);
      if (ok) setVersionsTick((n) => n + 1);
      return ok;
    },
    [id],
  );

  // salvataggio automatico, un attimo dopo l'ultima modifica. Alla prima modifica salvo anche
  // com'era il progetto all'apertura, poi una fotografia ogni 10 minuti di lavoro.
  const first = useRef(true);
  const lastSnapshot = useRef(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("modificato");
    const t = setTimeout(async () => {
      setSave("salvo");
      if (lastSnapshot.current === 0) {
        lastSnapshot.current = Date.now();
        await snapshot("Com'era all'apertura", initialProject, initialTitle);
      } else if (Date.now() - lastSnapshot.current > AUTO_EVERY_MS) {
        lastSnapshot.current = Date.now();
        await snapshot("Automatica");
      }
      const { error } = await createClient()
        .from("projects")
        .update({ title: title.trim() || "Senza titolo", bpm: project.bpm, data: project })
        .eq("id", id);
      setSave(error ? "errore" : "salvato");
    }, 1200);
    return () => clearTimeout(t);
  }, [project, title, id, snapshot, initialProject, initialTitle]);

  const restore = async (v: Version) => {
    const saved = await loadVersion(v.id);
    if (!saved) return;
    await snapshot(`Prima del ripristino di “${v.label}”`);
    setUndo(null);
    remember(true);
    setProject(normalize(saved.data));
    setTitle(saved.title);
  };

  const toggleDrum = (d: DrumId, i: number) => {
    const turningOn = !pat.drums[d][i];
    update((p) => {
      p.patterns[editing].drums[d][i] = turningOn;
      if (!turningOn) setVel(p.patterns[editing], `${d}${i}`, VEL_DEFAULT); // spento: la sua velocity sparisce
    });
    if (turningOn && !playing) void engine().preview(d);
  };

  // una nota nel piano roll (basso o lead): clic su una nota accesa = la spegne
  // piano roll: sul basso una nota per step (la nuova sostituisce la vecchia), sul lead più note insieme
  const hasNote = (r: RollId, i: number, note: number) => (r === "lead" ? pat.lead[i].includes(note) : pat.bass[i] === note);
  // gli step coperti dalla coda di una nota lunga (per le righe Bass e Lead del Beat)
  const holds = { bass: new Set<number>(), lead: new Set<number>() };
  for (let i = 0; i < STEPS; i++) {
    const b = pat.bass[i];
    if (b !== null) for (let k = 1; k < noteLen(pat, "bass", i, b); k++) holds.bass.add(i + k);
    for (const m of pat.lead[i]) for (let k = 1; k < noteLen(pat, "lead", i, m); k++) holds.lead.add(i + k);
  }
  // Velocity nel Beat (come il graph editor di FL): con il pulsante acceso, premi su un colpo e trascini su e giù per
  // la sua forza; passando sugli altri colpi tenendo premuto li "dipingi". In questa modalità il clic non accende step.
  const [velMode, setVelMode] = useState(false);
  const [velShown, setVelShown] = useState<number | null>(null); // l'ultimo valore toccato, per il display
  const velDrag = useRef(false);
  const velAt = (el: HTMLElement, y: number) => {
    const key = el.dataset.velkey;
    if (!key) return;
    const r = el.getBoundingClientRect();
    const v = Math.max(VEL_MIN, Math.min(1, 1 - (y - r.top) / r.height));
    setVelShown(Math.round(v * 100));
    update((p) => setVel(p.patterns[playbackRef.current.editing], key, v));
  };
  const velBar = (key: string, on: boolean) =>
    velMode && on ? <span className="hw-vel" style={{ height: `${Math.round(velOf(pat, key) * 100)}%` }} aria-hidden="true" /> : null;
  const velProps = (key: string, on: boolean) =>
    velMode && on
      ? {
          "data-velkey": key,
          title: `Velocity ${Math.round(velOf(pat, key) * 100)}% (trascina su e giù)`,
          onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
            if (e.button !== 0) return;
            e.preventDefault();
            velDrag.current = true;
            velAt(e.currentTarget, e.clientY);
          },
        }
      : {};
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!velDrag.current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-velkey]");
      if (el) velAt(el, e.clientY);
    };
    const up = () => {
      velDrag.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });
  // la nota che copre lo step i (con la sua coda): lo step in cui comincia, oppure -1
  const noteAt = (r: RollId, i: number, note: number) => {
    for (let j = i; j >= 0; j--) if (hasNote(r, j, note)) return j + noteLen(pat, r, j, note) > i ? j : -1;
    return -1;
  };
  // mette (con la lunghezza data) o toglie una nota; nel basso, che è mono, una nota nuova sostituisce quella dello step
  const putNote = (p: Project, r: RollId, i: number, note: number, len: number) => {
    const pp = p.patterns[playbackRef.current.editing];
    if (r === "lead") {
      if (!pp.lead[i].includes(note)) pp.lead[i] = [...pp.lead[i], note].sort((a, b) => a - b);
    } else {
      if (pp.bass[i] !== null) setNoteLen(pp, "bass", i, pp.bass[i] as number, 1);
      pp.bass[i] = note;
    }
    setNoteLen(pp, r, i, note, len);
  };
  const dropNote = (p: Project, r: RollId, i: number, note: number) => {
    const pp = p.patterns[playbackRef.current.editing];
    setNoteLen(pp, r, i, note, 1);
    if (r === "lead") pp.lead[i] = pp.lead[i].filter((n) => n !== note);
    else pp.bass[i] = null;
  };
  // con la tastiera (Invio o spazio su una casella): metti o togli una nota, lunga quanto il pennello
  const setNote = (r: RollId, i: number, note: number) => {
    const at = noteAt(r, i, note);
    if (r === "lead" && at < 0 && pat.lead[i].length >= LEAD_VOICES) return; // già 6 voci su questo step
    update((p) => (at >= 0 ? dropNote(p, r, at, note) : putNote(p, r, i, note, brushLen.current)));
    if (at < 0 && !playing) void engine().preview(r, { note });
  };
  // Col mouse, come il piano roll di FL: premi su una casella vuota e trascini = disegni una nota lunga quanto vuoi;
  // premi su una nota e trascini = la allunghi o accorci; un clic senza trascinare su una nota = la togli.
  // La nota nuova prende la lunghezza dell'ultima che hai disegnato (il "pennello").
  const brushLen = useRef(1);
  const drag = useRef<{ r: RollId; note: number; start: number; len: number; existed: boolean; moved: boolean } | null>(null);
  const rollDown = (r: RollId, i: number, note: number) => {
    const at = noteAt(r, i, note);
    if (at >= 0) {
      drag.current = { r, note, start: at, len: noteLen(pat, r, at, note), existed: true, moved: false };
      return;
    }
    if (r === "lead" && pat.lead[i].length >= LEAD_VOICES) return;
    const len = Math.min(brushLen.current, maxLen(pat, r, i, note));
    update((p) => putNote(p, r, i, note, len));
    if (!playing) void engine().preview(r, { note });
    drag.current = { r, note, start: i, len, existed: false, moved: false };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".daw-roll [data-step]");
      if (!cell) return;
      const col = Number(cell.dataset.step);
      const cur = projectRef.current.patterns[playbackRef.current.editing];
      const len = Math.max(1, Math.min(col - d.start + 1, maxLen(cur, d.r, d.start, d.note)));
      if (len === d.len) return;
      d.len = len;
      d.moved = true;
      update((p) => setNoteLen(p.patterns[playbackRef.current.editing], d.r, d.start, d.note, len));
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (d.existed && !d.moved) update((p) => dropNote(p, d.r, d.start, d.note));
      else brushLen.current = d.len;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [update]);

  const setFx = (c: ChannelId, patch: Partial<ChannelFx>) =>
    update((p) => {
      p.fx[c] = { ...p.fx[c], ...patch };
    });

  // automazione: un punto per battuta (null = nessun punto). Una corsia senza punti sparisce.
  const lane = project.automation[autoTarget];
  const autoBase = autoTarget === "master" ? project.masterFilter : project.fx[autoTarget].filter; // prima del primo punto
  const setPoint = (b: number, v: number | null) =>
    update((p) => {
      const l = p.automation[autoTarget] ?? Array(p.song.length).fill(null);
      l[b] = v;
      if (l.some((x) => x !== null)) p.automation[autoTarget] = l;
      else delete p.automation[autoTarget];
    });
  // durante il play la striscia dell'automazione segue la battuta che suona (solo in orizzontale)
  const autoScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = autoScroll.current;
    if (!box || !songMode || bar < 0 || box.scrollWidth <= box.clientWidth) return;
    const cell = box.querySelectorAll<HTMLElement>(".hw-auto-bar")[bar];
    if (!cell) return;
    const left = cell.offsetLeft, right = left + cell.offsetWidth;
    if (left < box.scrollLeft || right > box.scrollLeft + box.clientWidth) box.scrollLeft = left - 40;
  }, [bar, songMode]);

  // la canzone cresce a blocchi di 4 o 8 battute; togliendo battute piene chiedo conferma
  const addBars = (n: number) => update((p) => resizeSong(p, p.song.length + n));
  const removeBars = () => {
    const from = project.song.length - 4;
    const full =
      project.song.slice(from).some(Boolean) ||
      AUTO_TARGETS.some((t) => project.automation[t]?.slice(from).some((v) => v !== null));
    if (full && !window.confirm(`Le battute ${from + 1}–${project.song.length} non sono vuote: le tolgo?`)) return;
    update((p) => resizeSong(p, p.song.length - 4));
  };
  const clearLane = () =>
    update((p) => {
      delete p.automation[autoTarget];
    });

  // plugin negli insert: il canale di cui vedi il rack e le modifiche agli slot
  // solo: i canali da ascoltare da soli (vuoto = tutti). Solo ascolto: non si salva e l'export lo ignora.
  const [solo, setSolo] = useState<ChannelId[]>([]);
  const soloRef = useRef<ChannelId[]>([]);
  soloRef.current = solo;
  useEffect(() => {
    engineRef.current?.setSolo(solo);
  }, [solo]);
  // clic = solo quel canale (di nuovo = tutti); Ctrl o Maiusc + clic = aggiungi o togli dal solo
  const toggleSolo = (c: ChannelId, additive: boolean) =>
    setSolo((cur) =>
      additive
        ? cur.includes(c)
          ? cur.filter((x) => x !== c)
          : [...cur, c]
        : cur.length === 1 && cur[0] === c
          ? []
          : [c],
    );
  const soloButton = (c: ChannelId, label: string) => (
    <button
      type="button"
      className="hw-btn hw-btn--small hw-btn--solo"
      aria-pressed={solo.includes(c)}
      aria-label={`Solo ${label}`}
      title="Solo: senti solo questo canale (Ctrl+clic per aggiungerne altri; di nuovo per tornare a tutto)"
      onClick={(e) => toggleSolo(c, e.ctrlKey || e.metaKey || e.shiftKey)}
    >
      <span className="hw-btn-led" />S
    </button>
  );
  const [fxTarget, setFxTarget] = useState<MixTarget>("lead");
  const [fxOpen, setFxOpen] = useState(false); // il rack si apre con FX e si chiude con ✕ (come in FL)
  const [selSlot, setSelSlot] = useState(0); // lo slot di cui vedi le manopole
  const openFx = (t: MixTarget) => {
    const closing = fxOpen && fxTarget === t;
    setFxTarget(t);
    setFxOpen(!closing);
    setSelSlot(Math.max(0, project.inserts[t].findIndex(Boolean)));
  };
  // dal Roll: apre il Mixer con gli insert di quello strumento (sul telefono scorre fino al rack)
  const fxJump = (c: "bass" | "lead" | "chords") => {
    const count = project.inserts[c].filter(Boolean).length;
    return (
      <button
        type="button"
        className="hw-btn hw-btn--small hw-fx-btn"
        title={`Effetti (insert) di ${CHANNELS.find((x) => x.id === c)?.label ?? c}: apre il Mixer con i suoi plugin`}
        onClick={() => {
          setFxTarget(c);
          setFxOpen(true);
          setSelSlot(Math.max(0, project.inserts[c].findIndex(Boolean)));
          chooseView("mixer");
          setTimeout(() => document.querySelector(".hw-rack")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
        }}
      >
        FX{count ? ` ${count}` : ""}
      </button>
    );
  };
  const fxLabel = (t: MixTarget) =>
    t === "master" ? "Master" : isBus(t) ? `Bus ${project.buses[t].name}` : (CHANNELS.find((c) => c.id === t)?.label ?? t);
  const setSlot = (t: MixTarget, i: number, slot: PluginSlot | null) =>
    update((p) => {
      p.inserts[t][i] = slot;
    });
  const setSlotParam = (t: MixTarget, i: number, id: string, v: number) =>
    update((p) => {
      const slot = p.inserts[t][i];
      if (slot) slot.params[id] = v;
    });
  // quanti slot mostrare: fino all'ultimo pieno, più uno vuoto (almeno uno)
  const shownSlots = (t: MixTarget) => {
    const last = project.inserts[t].reduce((acc, s, i) => (s ? i : acc), -1);
    return Math.min(INSERT_SLOTS, last + 2);
  };
  const moveSlot = (t: MixTarget, i: number, d: -1 | 1) =>
    update((p) => {
      const row = p.inserts[t];
      [row[i], row[i + d]] = [row[i + d], row[i]];
    });

  const setChannel = (c: ChannelId, patch: Partial<Project["mixer"][ChannelId]>) =>
    update((p) => {
      p.mixer[c] = { ...p.mixer[c], ...patch };
    });
  // Routing come nel mixer di FL: il canale esce sul master o in un bus (che così compare nel mixer)
  const routeTo = (c: ChannelId, out: Out) =>
    update((p) => {
      p.mixer[c].out = out;
      if (out !== "master") p.buses[out].shown = true;
    });
  const setBus = (b: BusId, patch: Partial<Project["buses"][BusId]>) =>
    update((p) => {
      p.buses[b] = { ...p.buses[b], ...patch };
    });
  const nextBus = BUS_IDS.find((b) => !project.buses[b].shown);
  // togli un bus: sparisce dal mixer e i suoi canali tornano dritti al master (i plugin restano, se lo riapri)
  const removeBus = (b: BusId) => {
    update((p) => {
      p.buses[b].shown = false;
      for (const id of CHANNEL_IDS) if (p.mixer[id].out === b) p.mixer[id].out = "master";
    });
    if (fxTarget === b) setFxOpen(false);
  };

  // il coach ha scritto pattern e/o canzone: li applico e tengo il progetto di prima per "Annulla"
  const applyFromCoach = (data: unknown) => {
    const d = data as { project?: unknown; name?: string; focus?: Slot; song?: boolean };
    if (!d?.project) return;
    setUndo({ project: projectRef.current, name: d.name || "pattern" });
    void snapshot(`Prima del coach: ${d.name || "modifica"}`);
    remember(true);
    setProject(normalize(d.project));
    if (d.focus && SLOTS.includes(d.focus)) setEditing(d.focus);
    if (d.song) setSongMode(true);
    void play();
    return `Scritto nello studio: ${d.name || "nuovo pattern"}`;
  };

  // Export WAV: in Song tutta la canzone, in Pattern 4 giri del loop che stai modificando
  const exportWav = async () => {
    setExporting("sì");
    try {
      const buf = await renderAudio(projectRef.current, songMode ? { song: true } : { song: false, slot: editing });
      const url = URL.createObjectURL(encodeWav(buf));
      const a = document.createElement("a");
      const name = (titleRef.current.trim() || "deep-studio").replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "deep-studio";
      a.href = url;
      a.download = `${name}${songMode ? "" : ` - pattern ${editing}`}.wav`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setExporting("no");
    } catch (e) {
      console.error("export", e);
      setExporting("errore");
    }
  };

  // "Fammi un parere": renderizzo come l'export, misuro nel browser e mando le misure al coach
  const listen = async () => {
    setListening(true);
    try {
      const p = projectRef.current;
      const what = songMode ? ({ song: true } as const) : ({ song: false, slot: editing } as const);
      const buf = await renderAudio(p, what);
      const barLen = Math.round((60 / p.bpm) * 4 * SAMPLE_RATE);
      const plan = renderPlan(p, what).map((slot, b) => ({
        start: Math.round(0.05 * SAMPLE_RATE) + b * barLen,
        length: barLen,
        slot: slot ?? "-",
      }));
      // le misure bloccano il browser per un paio di secondi: lascio prima aggiornare il pulsante
      await new Promise((r) => setTimeout(r, 30));
      const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
      const m = measure(chans, buf.sampleRate, plan);
      setMeasures(m);
      const what_ = songMode ? `sulla canzone (${plan.length} battute)` : `sul pattern ${editing} (4 giri)`;
      setAsk({ id: Date.now(), text: `Fammi un parere ${what_}: come suona?`, extra: { misure: m } });
    } catch (e) {
      console.error("parere", e);
    }
    setListening(false);
  };

  // un pattern nuovo da uno vuoto: copia quello che stai modificando nel primo slot libero
  const firstFree = SLOTS.find((s) => s !== editing && isEmptyPattern(project.patterns[s]));
  const duplicate = () => {
    if (!firstFree) return;
    update((p) => {
      p.patterns[firstFree] = structuredClone(p.patterns[editing]);
    });
    setEditing(firstFree);
  };
  const clearPattern = () => {
    if (isEmptyPattern(pat) || !window.confirm(`Svuoto il pattern ${editing}?`)) return;
    update((p) => {
      p.patterns[editing] = { ...emptyPattern(), ...(p.patterns[editing].sounds ? { sounds: p.patterns[editing].sounds } : {}) };
    });
  };
  // canzone come la playlist di FL: clic = metti il pattern del pennello, clic sullo stesso = svuota
  const paintBar = (b: number) =>
    update((p) => {
      p.song[b] = p.song[b] === brush ? null : brush;
    });
  const shown = visibleSlots(project, editing);
  // i pulsanti dei pattern: nel Beat e nel Roll (per cambiare pattern senza uscire dal Roll)
  const patternButtons = shown.map((s) => (
    <button
      key={s}
      type="button"
      data-c={slotColor(s)}
      className="hw-btn hw-btn--small hw-btn--slot"
      aria-pressed={editing === s}
      data-playing={playingSlot === s}
      data-empty={isEmptyPattern(project.patterns[s])}
      title={`Pattern ${s}${project.patterns[s].sounds ? " · ha un suono proprio" : ""}`}
      onClick={() => setEditing(s)}
    >
      <span className="hw-btn-led" />
      {s}
    </button>
  ));
  // la spia del limiter si aggiorna a ogni step mentre suona
  const limiterDb = playing && step >= 0 ? (engineRef.current?.limiterDb ?? 0) : 0;

  // cosa suona adesso (per accendere pad e meter): il pattern in riproduzione, non quello in modifica
  const sounding = playing && playingSlot ? project.patterns[playingSlot] : null;
  const hitNow = (c: ChannelId) =>
    flash === c ||
    (sounding !== null &&
      step >= 0 &&
      (c === "bass" || c === "lead"
        ? sounding[c][step] !== null
        : c === "chords"
          ? step % 4 === 0 && sounding.chords[step / 4].length > 0
          : sounding.drums[c][step]));

  return (
    <div className="console" data-coach={coachOpen ? "on" : "off"}>
      {touring && <Tour onView={chooseView} onCoach={openCoach} onClose={endTour} />}
      {reporting && <Segnala projectId={id} view={view} onClose={closeReport} />}
      {/* ---- pannello superiore: marchio, display, trasporto, manopole ---- */}
      <section className="hw-panel hw-top" aria-label="Trasporto">
        <div className="hw-brand">
          <Link href="/studio" className="hw-brand-name">
            DEEP STUDIO
          </Link>
          <span className="hw-brand-model">DS-16 · Groovebox</span>
        </div>

        <div className="hw-lcd">
          <label className="hw-visually-hidden" htmlFor="titolo">
            Titolo del progetto
          </label>
          <input id="titolo" className="hw-lcd-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <div className="hw-lcd-row">
            <span className="hw-lcd-big" data-count={counting > 0}>
              {counting > 0 ? counting : project.bpm}
            </span>
            <span className="hw-lcd-unit">{counting > 0 ? "COUNT" : "BPM"}</span>
            <span className="hw-lcd-small">
              {songMode
                ? `SONG · BAR ${bar >= 0 ? two(bar + 1) : `▶${two(effStart + 1)}`}/${two(songLength(project))}`
                : `PATTERN ${editing}`}
              {" · "}
              {playingSlot ? `PAT ${playingSlot}` : "PAT -"}
              <br />
              STEP {step >= 0 ? two(step + 1) : "--"}/16 ·{" "}
              {save === "errore" ? "NON SALVATO" : save === "salvato" ? "SALVATO" : "SALVO…"}
            </span>
          </div>
          <div className="hw-lcd-dots" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} data-on={i === step} />
            ))}
          </div>
        </div>

        <div className="hw-transport">
          <button type="button" className="hw-btn hw-btn--play" aria-pressed={playing} onClick={() => void play(0)}>
            <span className="hw-btn-led" />▶ Play
          </button>
          <button type="button" className="hw-btn" onClick={stop}>
            <span className="hw-btn-led" />■ Stop
          </button>
          <button
            type="button"
            className="hw-btn hw-btn--rec"
            aria-pressed={rec}
            title="Registra: pad e tastiera scrivono nel pattern sullo step più vicino (da fermo: count-in di 4 click, poi parte)"
            onClick={toggleRec}
          >
            <span className="hw-btn-led" />● Rec
          </button>
          <button type="button" className="hw-btn" aria-pressed={showVersions} onClick={() => setShowVersions(!showVersions)}>
            <span className="hw-btn-led" />↺ Versioni
          </button>
          <button
            type="button"
            className="hw-btn hw-btn--icon"
            disabled={hist.undo === 0}
            aria-label="Annulla"
            title="Annulla l'ultima modifica (Ctrl+Z)"
            onClick={undoEdit}
          >
            ↶
          </button>
          <button
            type="button"
            className="hw-btn hw-btn--icon"
            disabled={hist.redo === 0}
            aria-label="Ripeti"
            title="Ripeti quello che hai annullato (Ctrl+Y)"
            onClick={redoEdit}
          >
            ↷
          </button>
          <button
            type="button"
            className="hw-btn"
            aria-pressed={exporting === "sì"}
            disabled={exporting === "sì"}
            title={songMode ? "Esporta tutta la canzone" : `Esporta 4 giri del pattern ${editing}`}
            onClick={() => void exportWav()}
          >
            <span className="hw-btn-led" />
            {exporting === "sì" ? "Esporto…" : exporting === "errore" ? "Riprova WAV" : "⤓ WAV"}
          </button>
          <button
            type="button"
            className="hw-btn hw-btn--listen"
            aria-pressed={listening}
            disabled={listening}
            title={songMode ? "Il coach ascolta tutta la canzone" : `Il coach ascolta il pattern ${editing}`}
            onClick={() => void listen()}
          >
            <span className="hw-btn-led" />
            {listening ? "Ascolto…" : "◉ Parere"}
          </button>
        </div>

        <div className="hw-knobs">
          <Knob
            label="Tempo"
            value={project.bpm}
            min={60}
            max={200}
            step={1}
            defaultValue={122}
            display={`${project.bpm} BPM`}
            onChange={(v) =>
              update((p) => {
                p.bpm = v;
              })
            }
          />
          <Knob
            label="Swing"
            value={project.swing}
            min={0}
            max={0.5}
            defaultValue={0.1}
            display={pct(project.swing)}
            onChange={(v) =>
              update((p) => {
                p.swing = v;
              })
            }
          />
          <button
            type="button"
            className="hw-switch"
            aria-pressed={project.sidechain}
            onClick={() =>
              update((p) => {
                p.sidechain = !p.sidechain;
              })
            }
          >
            <span className="hw-switch-led" />
            <span className="hw-switch-cap" />
            <span className="hw-label">Sidechain</span>
          </button>
        </div>
      </section>

      <div className="console-body">
        {/* ---- colonna sinistra: kit e pad ---- */}
        <aside className="console-side">
          <section className="hw-panel hw-pads-panel" aria-label="Drum pad">
            <div className="hw-seq-head">
              <div className="hw-pads-title">
                <h2 className="hw-title">Pads · Kit {KITS[project.kit].label}</h2>
                {midiButton}
              </div>
              <div className="hw-seg" role="group" aria-label="Kit di batteria">
                {KIT_IDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="hw-btn hw-btn--small"
                    aria-pressed={project.kit === k}
                    title={KITS[k].hint}
                    onClick={() => {
                      update((p) => {
                        p.kit = k;
                      });
                      // senti subito il kick del kit nuovo (il ref prima del render, senza registrare)
                      projectRef.current = { ...projectRef.current, kit: k };
                      void engine().preview("kick");
                    }}
                  >
                    <span className="hw-btn-led" />
                    {KITS[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="hw-keys" role="group" aria-label="Tastiera del computer">
              {/* un clic apre il Roll di quello strumento: da lì la tastiera suona le sue note.
                  Nel Roll lo strumento si sceglie in alto nel Roll: qui sparisce e la colonna resta corta */}
              {keyMode !== "keys" && (
              <div className="hw-seg" role="group" aria-label="Strumento della tastiera">
                {(["bass", "lead", "chords"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="hw-btn hw-btn--small"
                    title={`Apre il Roll di ${k === "chords" ? "Chord" : k === "bass" ? "Bass" : "Lead"}: la tastiera ne suona le note (Z X C V B N M = Do Re Mi Fa Sol La Si, S D G H J = diesis, Q W E R T Y U = ottava sopra)`}
                    onClick={() => {
                      setRoll(k);
                      chooseView("roll");
                    }}
                  >
                    {k === "bass" ? "Bass" : k === "lead" ? "Lead" : "Chord"}
                  </button>
                ))}
              </div>
              )}
              {keyMode === "keys" && (
                <div className="hw-keys-row">
                  {keyInst === "chords" ? (
                    <>
                      <label className="hw-label" htmlFor="key-chord">
                        Tipo
                      </label>
                      <select
                        id="key-chord"
                        className="hw-select"
                        value={keyChord}
                        onChange={(e) => setKeyChord(e.target.value as ChordType)}
                      >
                        {CHORD_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <span className="hw-label">Ottava</span>
                      <button
                        type="button"
                        className="hw-btn hw-btn--small"
                        aria-label="Ottava giù"
                        disabled={octaves[keyInst] <= OCTAVES[keyInst].min}
                        onClick={() => shiftOctave(-1)}
                      >
                        ‹
                      </button>
                      <span className="hw-value">{octaves[keyInst]}</span>
                      <button
                        type="button"
                        className="hw-btn hw-btn--small"
                        aria-label="Ottava su"
                        disabled={octaves[keyInst] >= OCTAVES[keyInst].max}
                        onClick={() => shiftOctave(1)}
                      >
                        ›
                      </button>
                    </>
                  )}
                  <span className="hw-keys-last" aria-live="polite">
                    {lastKey}
                  </span>
                </div>
              )}
              <div className="hw-keys-recrow">
                <button
                  type="button"
                  className="hw-btn hw-btn--small hw-btn--rec hw-keys-rec"
                  aria-pressed={rec}
                  title="Accende Rec e fa partire il Play: pad e note che suoni si scrivono nel pattern"
                  onClick={toggleRec}
                >
                  <span className="hw-btn-led" />
                  {counting > 0 ? `Pronti… ${counting}` : rec ? "Registro… (clic per smettere)" : "● Registra"}
                </button>
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-pressed={countInOn}
                  title="Count-in: prima di registrare una battuta di click (4), per prepararti alla prima battuta"
                  onClick={toggleCountIn}
                >
                  <span className="hw-btn-led" />
                  1234
                </button>
              </div>
              <p className="hw-keys-map">
                {keyMode === "keys" ? (
                  <>
                    Tastiera = note: Z X C V B N M = Do Re Mi Fa Sol La Si · S D G H J = diesis · Q W E R T Y U = ottava
                    sopra. I pad si suonano con il mouse.
                  </>
                ) : (
                  <>Tastiera = pad (Z X C V B N M). Apri il Roll (o Bass, Lead, Chord qui sopra) per suonare le note.</>
                )}
              </p>
            </div>
            <div className="hw-pads" data-keys={keyMode === "keys"}>
              {PADS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="hw-pad"
                  data-color={p.color}
                  data-hit={hitNow(p.id)}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    hitPad(p.id, e.timeStamp);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") hitPad(p.id, e.timeStamp);
                  }}
                >
                  <span className="hw-pad-name">{p.label}</span>
                  <span className="hw-pad-key">{p.key.toUpperCase()}</span>
                </button>
              ))}
            </div>
            <p className="hw-hint">
              Tocca i pad o usa Z X C V B N. Con <strong>Rec</strong> e <strong>Play</strong> accesi i colpi si registrano nel
              pattern.
            </p>
          </section>

        </aside>

        {/* ---- centro: sul computer una vista alla volta (schede in alto), sul telefono tutto in colonna ---- */}
        <div className="console-stage" data-view={view}>
          <nav className="hw-views" aria-label="Viste dello studio">
            <div className="hw-views-tabs">
              {VIEWS.map((v, n) => (
                <button
                  key={v.id}
                  type="button"
                  className="hw-view"
                  aria-pressed={view === v.id}
                  title={`${v.label} (tasto ${n + 1})`}
                  onClick={() => chooseView(v.id)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d={v.icon} />
                  </svg>
                  {v.label}
                </button>
              ))}
            </div>
            {solo.length > 0 && (
              <button
                type="button"
                className="hw-solo-chip"
                title="Clic per tornare a sentire tutti i canali"
                onClick={() => setSolo([])}
              >
                Solo: {solo.map((c) => CHANNELS.find((x) => x.id === c)?.label ?? c).join(", ")} ✕
              </button>
            )}
            <button
              type="button"
              className="hw-btn hw-btn--small hw-views-end"
              aria-pressed={reporting}
              title="Qualcosa non va o manca? Scrivilo qui"
              onClick={() => setReporting(true)}
            >
              <span className="hw-btn-led" />
              Segnala
            </button>
            <button
              type="button"
              className="hw-btn hw-btn--small"
              aria-pressed={touring}
              title="Il tour guidato dello studio, con il coach"
              onClick={() => setTouring(true)}
            >
              <span className="hw-btn-led" />
              Tutorial
            </button>
            <button type="button" className="hw-btn hw-btn--small" aria-pressed={coachOpen} onClick={toggleCoach}>
              <span className="hw-btn-led" />
              Coach
            </button>
          </nav>

          {showVersions && (
            <VersionsPanel
              projectId={id}
              refresh={versionsTick}
              onSave={async (label) => {
                await snapshot(label);
              }}
              onRestore={restore}
              onClose={() => setShowVersions(false)}
            />
          )}

          {measures && (
            <section className="hw-panel hw-measures" aria-label="Misure dell'ultimo ascolto">
              <div className="hw-seq-head">
                <h2 className="hw-title">Ultimo ascolto del coach</h2>
                <button type="button" className="hw-btn hw-btn--small" onClick={() => setMeasures(null)}>
                  Chiudi
                </button>
              </div>
              <div className="hw-meas-row">
                {[
                  ["Loudness", measures.integrated_lufs === null ? "—" : String(measures.integrated_lufs), "LUFS"],
                  ["True peak", String(measures.true_peak_dbtp), "dBTP"],
                  ["Dinamica", String(measures.crest_factor_db), "dB crest"],
                  ["Variazione", measures.lra_lu === null ? "—" : String(measures.lra_lu), "LU"],
                  ["Low end mono", measures.stereo.side_ratio_low <= 0.1 ? "sì" : "no", `side ${measures.stereo.side_ratio_low}`],
                ].map(([label, value, unit]) => (
                  <div key={label} className="hw-meas">
                    <span className="hw-label">{label}</span>
                    <span className="hw-meas-value">{value}</span>
                    <span className="hw-value">{unit}</span>
                  </div>
                ))}
              </div>
              <div className="hw-meas-bands" aria-label="Bilancio delle frequenze">
                {Object.entries(measures.bands_db).map(([band, v]) => (
                  <div key={band} className="hw-meas-band" title={`${band}: ${v} dB`}>
                    <span className="hw-meas-bar" style={{ height: `${Math.max(4, Math.min(100, ((v + 40) / 40) * 100))}%` }} />
                    <span className="hw-value">{band.replace("_", " ")}</span>
                    <span className="hw-value">{v}</span>
                  </div>
                ))}
              </div>
              {measures.bars.length > 1 && (
                <div className="hw-meas-energy" aria-label="Energia per battuta">
                  {measures.bars.map((b) => (
                    <span
                      key={b.bar}
                      title={`Battuta ${b.bar} (${b.slot}): ${b.rms_db} dB, brillantezza ${b.above_6k_db} dB`}
                      style={{ height: `${Math.max(4, Math.min(100, ((b.rms_db + 40) / 40) * 100))}%`, opacity: 0.35 + Math.max(0, Math.min(1, (b.above_6k_db + 40) / 30)) * 0.65 }}
                    />
                  ))}
                </div>
              )}
              {measures.checks.length > 0 && (
                <p className="hw-hint">Allarmi: {measures.checks.map((c) => c.detail).join(" · ")}</p>
              )}
            </section>
          )}

          {undo && (
            <div className="hw-toast" role="status">
              <span>
                Il coach ha scritto <strong>“{undo.name}”</strong>. Modificalo come vuoi.
              </span>
              <button
                type="button"
                className="hw-btn hw-btn--small"
                onClick={() => {
                  remember(true);
                  setProject(undo.project);
                  setUndo(null);
                }}
              >
                Annulla
              </button>
              <button type="button" className="hw-btn hw-btn--small" onClick={() => setUndo(null)}>
                Tieni
              </button>
            </div>
          )}

          {/* ---- step sequencer: ogni riga ha il colore del suo strumento ---- */}
          <section className="hw-panel hw-seq" data-panel="beat" aria-label="Step sequencer">
            <div className="hw-seq-head">
              <h2 className="hw-title">Step sequencer · Pattern {editing}</h2>
              <div className="hw-patterns" role="group" aria-label="Pattern da modificare">
                {patternButtons}
                <button type="button" className="hw-btn hw-btn--small" disabled={!firstFree} onClick={duplicate}>
                  Duplica{firstFree ? ` → ${firstFree}` : ""}
                </button>
                <button type="button" className="hw-btn hw-btn--small" onClick={clearPattern}>
                  Svuota
                </button>
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-pressed={velMode}
                  title="Velocity: la forza di ogni colpo e nota. Acceso: trascina su e giù sui colpi (80% = normale, 100% = accento)"
                  onClick={() => {
                    setVelMode(!velMode);
                    setVelShown(null);
                  }}
                >
                  <span className="hw-btn-led" />
                  {velMode && velShown !== null ? `Vel ${velShown}%` : "Vel"}
                </button>
              </div>
            </div>
            <div className="hw-seq-grid">
              {DRUMS.map(({ id: d, label }) => (
                <div key={d} className="hw-seq-row" data-row={d}>
                  <div className="hw-seq-label">
                    <button type="button" className="hw-seq-name" onClick={() => void engine().preview(d)}>
                      {label}
                    </button>
                    {soloButton(d, label)}
                  </div>
                  {pat.drums[d].map((on, i) => (
                    <button
                      key={i}
                      type="button"
                      className="hw-key"
                      data-group={Math.floor(i / 4)}
                      aria-pressed={on}
                      aria-label={`${label} step ${i + 1}`}
                      data-now={i === step && playingSlot === editing}
                      onClick={() => !velMode && toggleDrum(d, i)}
                      {...velProps(`${d}${i}`, on)}
                    >
                      <span className="hw-key-led" />
                      {velBar(`${d}${i}`, on)}
                    </button>
                  ))}
                </div>
              ))}
              <div className="hw-seq-row" data-row="bass">
                <div className="hw-seq-label">
                  <button type="button" className="hw-seq-name" onClick={() => openRoll("bass")}>
                    Bass
                  </button>
                  {soloButton("bass", "Bass")}
                </div>
                {pat.bass.map((n, i) => (
                  <span
                    key={i}
                    className="hw-key hw-key--note"
                    data-group={Math.floor(i / 4)}
                    data-on={n !== null}
                    data-hold={n === null && holds.bass.has(i)}
                    data-now={i === step && playingSlot === editing}
                    title="Le note del basso si scrivono nel Roll: clic per aprirlo"
                    onClick={() => !velMode && openRoll("bass")}
                    {...velProps(`b${i}`, n !== null)}
                  >
                    {velBar(`b${i}`, n !== null)}
                    {n !== null ? noteName(n).replace(/\d$/, "") : ""}
                  </span>
                ))}
              </div>
              <div className="hw-seq-row" data-row="lead">
                <div className="hw-seq-label">
                  <button
                    type="button"
                    className="hw-seq-name"
                    onClick={() => {
                      setRoll("lead");
                      chooseView("roll");
                    }}
                  >
                    Lead
                  </button>
                  {soloButton("lead", "Lead")}
                </div>
                {pat.lead.map((n, i) => (
                  <span
                    key={i}
                    className="hw-key hw-key--note hw-key--lead"
                    data-group={Math.floor(i / 4)}
                    data-on={n.length > 0}
                    data-hold={n.length === 0 && holds.lead.has(i)}
                    data-now={i === step && playingSlot === editing}
                    title={`${n.length ? `${n.map(noteName).join(" + ")} · ` : ""}la melodia si scrive nel Roll: clic per aprirlo`}
                    onClick={() => !velMode && openRoll("lead")}
                    {...velProps(`l${i}`, n.length > 0)}
                  >
                    {velBar(`l${i}`, n.length > 0)}
                    {/* più note insieme: la più bassa e quante ce ne sono in tutto */}
                    {n.length ? `${noteName(n[0]).replace(/\d$/, "")}${n.length > 1 ? `+${n.length - 1}` : ""}` : ""}
                  </span>
                ))}
              </div>
              {/* gli accordi: uno per battito (4 step); si scrivono nella scheda Chord del Roll */}
              <div className="hw-seq-row" data-row="chords">
                <div className="hw-seq-label">
                  <button type="button" className="hw-seq-name" onClick={() => openRoll("chords")}>
                    Chord
                  </button>
                  {soloButton("chords", "Chord")}
                </div>
                {pat.chords.map((c, b) => (
                  <span
                    key={b}
                    className="hw-key hw-key--note hw-key--chord"
                    data-on={c.length > 0}
                    data-now={Math.floor(step / 4) === b && playingSlot === editing}
                    title="Gli accordi si scrivono nel Roll, scheda Chord: clic per aprirlo"
                    onClick={() => !velMode && openRoll("chords")}
                    {...velProps(`c${b}`, c.length > 0)}
                  >
                    {velBar(`c${b}`, c.length > 0)}
                    {c.map(chordName).join(" + ")}
                  </span>
                ))}
              </div>
              <div className="hw-seq-row hw-seq-numbers" aria-hidden="true">
                <span />
                {Array.from({ length: STEPS }, (_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
            </div>
          </section>

          {/* ---- arrangiamento: quale pattern suona in ogni battuta ---- */}
          <section className="hw-panel hw-song" data-panel="song" aria-label="Arrangiamento">
            <div className="hw-seq-head">
              <h2 className="hw-title">
                Song · {songLength(project)} battute · {clock(songSeconds(project))}
              </h2>
              <div className="hw-patterns" role="group" aria-label="Lunghezza della canzone">
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  disabled={project.song.length >= MAX_SONG_BARS}
                  onClick={() => addBars(4)}
                >
                  +4
                </button>
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  disabled={project.song.length >= MAX_SONG_BARS}
                  onClick={() => addBars(8)}
                >
                  +8
                </button>
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  disabled={project.song.length <= MIN_SONG_BARS}
                  onClick={removeBars}
                >
                  −4
                </button>
              </div>
              <div className="hw-patterns" role="group" aria-label="Modalità">
                <button type="button" className="hw-btn hw-btn--small" aria-pressed={!songMode} onClick={() => setSongMode(false)}>
                  <span className="hw-btn-led" />
                  Pattern
                </button>
                <button type="button" className="hw-btn hw-btn--small" aria-pressed={songMode} onClick={() => setSongMode(true)}>
                  <span className="hw-btn-led" />
                  Song
                </button>
              </div>
            </div>
            <div className="hw-brushes" role="group" aria-label="Pattern da mettere nella canzone">
              <span className="hw-label">Pennello</span>
              {shown.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="hw-btn hw-btn--small hw-brush"
                  data-c={slotColor(s)}
                  data-empty={isEmptyPattern(project.patterns[s])}
                  aria-pressed={brush === s}
                  title={isEmptyPattern(project.patterns[s]) ? `Pattern ${s} (vuoto)` : `Pattern ${s}`}
                  onClick={() => setBrush(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="hw-song-bars">
              {project.song.map((s, b) => (
                <div key={b} className="hw-bar-cell" data-start={b === effStart}>
                  <button
                    type="button"
                    className="hw-bar-mark"
                    aria-pressed={b === effStart}
                    aria-label={
                      b === effStart && b > 0
                        ? `La canzone parte dalla battuta ${b + 1}. Clic per tornare alla 1`
                        : `Fai partire la canzone dalla battuta ${b + 1}`
                    }
                    onClick={() => chooseStart(b)}
                  >
                    {b === effStart ? "▶" : ""}
                    {b + 1}
                  </button>
                  <button
                    type="button"
                    className="hw-bar"
                    data-slot={s ?? "none"}
                    data-c={s ? slotColor(s) : undefined}
                    data-now={songMode && playing && b === bar}
                    aria-label={`Battuta ${b + 1}: ${s ? `pattern ${s}` : "vuota"}. Clic: ${s === brush ? "svuota" : `metti ${brush}`}`}
                    onClick={() => paintBar(b)}
                  >
                    <span className="hw-bar-slot">{s ?? "–"}</span>
                  </button>
                </div>
              ))}
            </div>
            <p className="hw-hint">
              Scegli il <strong>pennello</strong> (un pattern) e clicca le battute per metterlo; un clic su una battuta che ha
              già quel pattern la svuota. Clic sul <strong>numero</strong> di una battuta: la canzone parte da lì (▶) e a fine
              canzone torna lì; clic di nuovo per tornare alla 1. <strong>+4</strong> e <strong>+8</strong> allungano la canzone
              (fino a {MAX_SONG_BARS} battute), <strong>−4</strong> toglie le ultime quattro. In <strong>Song</strong> suona la
              canzone dal marker ▶; in <strong>Pattern</strong> solo il pattern che stai modificando, in loop.
            </p>
          </section>

          {/* ---- automazioni dei filtri, battuta per battuta ---- */}
          <section className="hw-panel hw-auto" data-panel="auto" aria-label="Automazione">
            <div className="hw-seq-head">
              <h2 className="hw-title">Automazione · filtro</h2>
              <div className="hw-patterns">
                <label className="hw-visually-hidden" htmlFor="auto-target">
                  Cosa automatizzare
                </label>
                <select
                  id="auto-target"
                  className="hw-select"
                  value={autoTarget}
                  onChange={(e) => setAutoTarget(e.target.value as AutoTarget)}
                >
                  {AUTO_TARGETS.map((t) => (
                    <option key={t} value={t}>
                      {project.automation[t] ? "● " : ""}
                      {t === "master" ? "Master" : CHANNELS.find((c) => c.id === t)?.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="hw-btn hw-btn--small" disabled={!lane} onClick={clearLane}>
                  Cancella
                </button>
              </div>
            </div>
            <div className="hw-auto-scroll" ref={autoScroll}>
            <div className="hw-auto-grid" style={{ "--bars": project.song.length } as React.CSSProperties}>
              {/* la curva: il valore all'inizio di ogni battuta e come scorre fino alla successiva */}
              <svg
                className="hw-auto-curve"
                viewBox={`0 0 ${project.song.length} 2`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line x1="0" y1="1" x2={project.song.length} y2="1" className="hw-auto-zero" />
                {lane && (
                  <polyline
                    points={Array.from({ length: project.song.length + 1 }, (_, b) => {
                      const v = laneValue(lane, Math.min(b, project.song.length - 1), autoBase);
                      return `${b},${1 - v}`;
                    }).join(" ")}
                  />
                )}
              </svg>
              {project.song.map((_, b) => {
                const v = lane?.[b] ?? null;
                return (
                  <div key={b} className="hw-auto-bar" data-now={songMode && playing && b === bar} data-point={v !== null}>
                    <input
                      className="hw-auto-fader"
                      type="range"
                      min={-1}
                      max={1}
                      step={0.02}
                      value={v ?? laneValue(lane, b, autoBase)}
                      aria-label={`Battuta ${b + 1}: filtro ${v === null ? "senza punto" : filterLabel(v)}`}
                      onChange={(e) => setPoint(b, Number(e.target.value))}
                      onDoubleClick={() => setPoint(b, null)}
                    />
                    <span className="hw-bar-num">{b + 1}</span>
                    <span className="hw-value">{v === null ? "·" : filterLabel(v)}</span>
                  </div>
                );
              })}
            </div>
            </div>
            <p className="hw-hint">
              Trascina un cursore per mettere un punto, doppio clic per toglierlo: tra due punti il filtro scorre da
              solo. In alto = si apre verso il passa-alto, in basso = si chiude (passa-basso), al centro spento. Suona in{" "}
              <strong>Song</strong> e nell&apos;export. Esempio di build: battuta 5 in basso, battuta 8 al centro, drop alla 9.
            </p>
          </section>

          {/* ---- mixer ---- */}
          <section className="hw-panel hw-mixer" data-panel="mixer" data-rack={fxOpen} aria-label="Mixer">
            <h2 className="hw-title">Mixer</h2>
            <div className="hw-strips">
              {CHANNELS.map(({ id: c, label }) => (
                <div key={c} className="hw-strip">
                  <span
                    className="hw-meter"
                    data-hit={hitNow(c) && !project.mixer[c].muted && (solo.length === 0 || solo.includes(c))}
                    aria-hidden="true"
                  />
                  <input
                    className="hw-fader"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={project.mixer[c].volume}
                    aria-label={`Volume ${label}`}
                    onChange={(e) => setChannel(c, { volume: Number(e.target.value) })}
                  />
                  <span className="hw-value">{pct(project.mixer[c].volume)}</span>
                  <div className="hw-strip-btns">
                    <button
                      type="button"
                      className="hw-btn hw-btn--small hw-btn--mute"
                      aria-pressed={project.mixer[c].muted}
                      aria-label={`Mute ${label}`}
                      onClick={() => setChannel(c, { muted: !project.mixer[c].muted })}
                    >
                      <span className="hw-btn-led" />M
                    </button>
                    {soloButton(c, label)}
                    <button
                      type="button"
                      className="hw-btn hw-btn--small hw-fx-btn"
                      aria-pressed={fxOpen && fxTarget === c}
                      aria-label={`Plugin di ${label}`}
                      onClick={() => openFx(c)}
                    >
                      FX{project.inserts[c].some(Boolean) ? ` ${project.inserts[c].filter(Boolean).length}` : ""}
                    </button>
                  </div>
                  <div className="hw-strip-fx">
                    <Knob
                      size={30}
                      label="Filter"
                      value={project.fx[c].filter}
                      min={-1}
                      max={1}
                      defaultValue={0}
                      display={filterLabel(project.fx[c].filter)}
                      onChange={(v) => setFx(c, { filter: v })}
                    />
                    <Knob
                      size={30}
                      label="Rev"
                      value={project.fx[c].reverb}
                      min={0}
                      max={1}
                      defaultValue={0}
                      display={pct(project.fx[c].reverb)}
                      onChange={(v) => setFx(c, { reverb: v })}
                    />
                    <Knob
                      size={30}
                      label="Dly"
                      value={project.fx[c].delay}
                      min={0}
                      max={1}
                      defaultValue={0}
                      display={pct(project.fx[c].delay)}
                      onChange={(v) => setFx(c, { delay: v })}
                    />
                  </div>
                  <label className="hw-visually-hidden" htmlFor={`out-${c}`}>
                    Uscita di {label}
                  </label>
                  <select
                    id={`out-${c}`}
                    className="hw-select hw-out"
                    value={project.mixer[c].out}
                    title="Dove esce il canale: dritto al master o in un bus (gruppo), come il routing di FL"
                    onChange={(e) => routeTo(c, e.target.value as Out)}
                  >
                    <option value="master">→ Master</option>
                    {BUS_IDS.filter((b) => project.buses[b].shown).map((b) => (
                      <option key={b} value={b}>
                        → {project.buses[b].name}
                      </option>
                    ))}
                    {nextBus && <option value={nextBus}>+ Nuovo bus</option>}
                  </select>
                  <span className="hw-strip-name">{label}</span>
                </div>
              ))}
              {/* i bus: tracce di gruppo, come gli insert di FL in cui mandi più canali */}
              {BUS_IDS.filter((b) => project.buses[b].shown).map((b) => {
                const bus = project.buses[b];
                const inside = CHANNELS.filter((c) => project.mixer[c.id].out === b);
                const db = 20 * Math.log10(Math.max(1e-4, bus.volume / BUS_UNITY));
                return (
                  <div key={b} className="hw-strip hw-strip--bus">
                    <span
                      className="hw-meter"
                      data-hit={!bus.muted && inside.some((c) => hitNow(c.id) && !project.mixer[c.id].muted)}
                      aria-hidden="true"
                    />
                    <input
                      className="hw-fader"
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={bus.volume}
                      aria-label={`Volume del bus ${bus.name}`}
                      title="Doppio clic: volume invariato (0 dB)"
                      onDoubleClick={() => setBus(b, { volume: BUS_UNITY })}
                      onChange={(e) => setBus(b, { volume: Number(e.target.value) })}
                    />
                    <span className="hw-value">{bus.volume <= 0.001 ? "−∞" : `${db > 0.05 ? "+" : ""}${db.toFixed(1)} dB`}</span>
                    <div className="hw-strip-btns">
                      <button
                        type="button"
                        className="hw-btn hw-btn--small hw-btn--mute"
                        aria-pressed={bus.muted}
                        aria-label={`Mute del bus ${bus.name}`}
                        onClick={() => setBus(b, { muted: !bus.muted })}
                      >
                        <span className="hw-btn-led" />M
                      </button>
                      <button
                        type="button"
                        className="hw-btn hw-btn--small hw-fx-btn"
                        aria-pressed={fxOpen && fxTarget === b}
                        aria-label={`Plugin del bus ${bus.name}`}
                        onClick={() => openFx(b)}
                      >
                        FX{project.inserts[b].some(Boolean) ? ` ${project.inserts[b].filter(Boolean).length}` : ""}
                      </button>
                    </div>
                    <span className="hw-bus-in" title={inside.length ? `Entrano: ${inside.map((c) => c.label).join(", ")}` : undefined}>
                      {inside.length ? inside.map((c) => c.label).join(" · ") : "nessun canale: scegli il bus nell'uscita di un canale"}
                    </span>
                    <label className="hw-visually-hidden" htmlFor={`bus-${b}`}>
                      Nome del bus
                    </label>
                    <input
                      id={`bus-${b}`}
                      className="hw-strip-name hw-bus-name"
                      value={bus.name}
                      maxLength={16}
                      onChange={(e) => setBus(b, { name: e.target.value })}
                      onBlur={(e) => !e.target.value.trim() && setBus(b, { name: `Bus ${BUS_IDS.indexOf(b) + 1}` })}
                    />
                    <button
                      type="button"
                      className="hw-bus-x"
                      title="Togli il bus: i suoi canali tornano dritti al master"
                      aria-label={`Togli il bus ${bus.name}`}
                      onClick={() => removeBus(b)}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              <div className="hw-strip hw-strip--master">
                <span className="hw-label">Master</span>
                <button
                  type="button"
                  className="hw-btn hw-btn--small hw-fx-btn"
                  aria-pressed={fxOpen && fxTarget === "master"}
                  aria-label="Plugin del master"
                  onClick={() => openFx("master")}
                >
                  FX{project.inserts.master.some(Boolean) ? ` ${project.inserts.master.filter(Boolean).length}` : ""}
                </button>
                <button
                  type="button"
                  className="hw-btn hw-btn--small hw-fx-btn"
                  disabled={!nextBus}
                  title="Un bus è una traccia di gruppo: ci mandi più canali (per esempio tutta la batteria) e li regoli insieme"
                  onClick={() => nextBus && setBus(nextBus, { shown: true })}
                >
                  + Bus
                </button>
                <Knob
                  label="Filter"
                  value={project.masterFilter}
                  min={-1}
                  max={1}
                  defaultValue={0}
                  display={filterLabel(project.masterFilter)}
                  onChange={(v) =>
                    update((p) => {
                      p.masterFilter = v;
                    })
                  }
                />
                <span className="hw-value">
                  {project.automation.master ? "automatizzato in Song" : "doppio clic: spento"}
                </span>
                {/* il limiter tiene il true peak sotto -1 dBTP; la spia si accende quando abbassa */}
                <span className="hw-limiter" data-on={limiterDb < -0.5}>
                  <span className="hw-btn-led" />
                  Limiter {limiterDb < -0.1 ? `${limiterDb.toFixed(1)} dB` : "a riposo"}
                </span>
              </div>
            </div>
            {/* ---- il rack dei plugin del canale scelto (come gli slot degli insert di FL) ---- */}
            {fxOpen && (
            <div className="hw-rack" role="group" aria-label={`Plugin · ${fxLabel(fxTarget)}`}>
              <div className="hw-seq-head">
                <h3 className="hw-title">Insert · {fxLabel(fxTarget)}</h3>
                <button
                  type="button"
                  className="hw-btn hw-btn--small"
                  aria-label="Chiudi i plugin"
                  onClick={() => setFxOpen(false)}
                >
                  ✕
                </button>
              </div>
              {/* come in FL: la fila degli slot è compatta, le manopole sono solo quelle dello slot scelto */}
              <div className="hw-rack-slots">
                {project.inserts[fxTarget].slice(0, shownSlots(fxTarget)).map((slot, i) => (
                  <div
                    key={i}
                    className="hw-slot"
                    data-full={slot !== null}
                    data-on={slot?.on ?? false}
                    data-selected={slot !== null && i === selSlot}
                    onClick={() => slot && setSelSlot(i)}
                  >
                    <span className="hw-slot-num">{i + 1}</span>
                    <label className="hw-visually-hidden" htmlFor={`slot-${i}`}>
                      Plugin nello slot {i + 1}
                    </label>
                    <select
                      id={`slot-${i}`}
                      className="hw-select"
                      value={slot?.type ?? ""}
                      onChange={(e) => {
                        setSlot(fxTarget, i, isPluginType(e.target.value) ? defaultSlot(e.target.value) : null);
                        if (isPluginType(e.target.value)) setSelSlot(i);
                      }}
                    >
                      <option value="">{slot ? "— togli —" : "+ aggiungi plugin"}</option>
                      {PLUGIN_GROUPS.map((g) => (
                        <optgroup key={g} label={g}>
                          {PLUGIN_TYPES.filter((t) => PLUGINS[t].group === g).map((t) => (
                            <option key={t} value={t}>
                              {PLUGINS[t].label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {slot && (
                      <button
                        type="button"
                        className="hw-btn hw-btn--small hw-slot-power"
                        aria-pressed={slot.on}
                        aria-label={slot.on ? `Escludi lo slot ${i + 1} (bypass)` : `Riaccendi lo slot ${i + 1}`}
                        title={slot.on ? "Acceso: clic per escluderlo (bypass)" : "Escluso: clic per riaccenderlo"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSlot(fxTarget, i, { ...slot, on: !slot.on });
                        }}
                      >
                        <span className="hw-btn-led" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {(() => {
                const slot = project.inserts[fxTarget][selSlot];
                if (!slot) return null;
                return (
                  <div className="hw-rack-detail" data-on={slot.on}>
                    <div className="hw-rack-detail-head">
                      <span className="hw-label">
                        Slot {selSlot + 1} · {PLUGINS[slot.type].label}
                        {slot.on ? "" : " (escluso)"}
                      </span>
                      <span className="hw-value">{PLUGINS[slot.type].hint}</span>
                      <button
                        type="button"
                        className="hw-btn hw-btn--small"
                        aria-label="Sposta prima"
                        disabled={selSlot === 0}
                        onClick={() => {
                          moveSlot(fxTarget, selSlot, -1);
                          setSelSlot(selSlot - 1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="hw-btn hw-btn--small"
                        aria-label="Sposta dopo"
                        disabled={selSlot === INSERT_SLOTS - 1}
                        onClick={() => {
                          moveSlot(fxTarget, selSlot, 1);
                          setSelSlot(selSlot + 1);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                    <div className="hw-slot-knobs">
                      {pluginParams(slot.type).map((q) => (
                        <Knob
                          key={q.id}
                          size={30}
                          label={q.label}
                          value={slot.params[q.id]}
                          min={q.min}
                          max={q.max}
                          defaultValue={q.default}
                          display={q.format(slot.params[q.id])}
                          onChange={(v) => setSlotParam(fxTarget, selSlot, q.id, v)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
              <p className="hw-hint">
                Il suono passa dagli slot in ordine (fino a {INSERT_SLOTS}). Clic su uno slot per le sue manopole; il LED lo
                accende o lo esclude (bypass) senza toglierlo.
              </p>
            </div>
            )}
          </section>

          {/* ---- piano roll: una schermata con la sua tastiera per Bass, Lead e Chord ---- */}
          <section
            className="hw-panel hw-roll-panel"
            data-panel="roll"
            aria-label={`Piano roll · ${ROLL_TABS.find((t) => t.id === roll)?.label}`}
          >
            <div className="hw-seq-head">
              <h2 className="hw-title">
                Piano roll · {ROLL_TABS.find((t) => t.id === roll)?.label}
              </h2>
              <div className="hw-patterns hw-roll-patterns" role="group" aria-label="Pattern nel piano roll">
                {patternButtons}
              </div>
              <div className="hw-patterns" role="group" aria-label="Strumento nel piano roll">
                {ROLL_TABS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="hw-btn hw-btn--small"
                    aria-pressed={roll === r.id}
                    onClick={() => setRoll(r.id)}
                  >
                    <span className="hw-btn-led" />
                    {r.label}
                  </button>
                ))}
                {soloButton(roll, ROLL_TABS.find((t) => t.id === roll)?.label ?? roll)}
                {roll === "chords" && (
                  <>
                    <label className="hw-visually-hidden" htmlFor="roll-chord">
                      Tipo di accordo
                    </label>
                    <select
                      id="roll-chord"
                      className="hw-select"
                      value={keyChord}
                      onChange={(e) => setKeyChord(e.target.value as ChordType)}
                    >
                      {CHORD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
            {roll === "chords" ? (
              // accordi: una riga per fondamentale, una casella per battito (4 step)
              <div className="daw-roll" data-roll="chords">
                {CHORD_ROOTS.map((root) => (
                  <div
                    key={root}
                    className="daw-roll-row"
                    data-sharp={isSharp(root)}
                    data-hit={keyHit?.inst === "chords" && keyHit.value === root}
                  >
                    <button
                      type="button"
                      className="daw-key"
                      onClick={() => {
                        void engine().preview("chords", { chord: { root, type: keyChord } });
                        lightKey("chords", root);
                      }}
                    >
                      {NOTE_NAMES[root]}
                    </button>
                    {Array.from({ length: BEATS }, (_, b) => {
                      // gli accordi del battito con questa fondamentale (di solito uno)
                      const here = pat.chords[b].filter((x) => x.root === root);
                      const on = here.length > 0;
                      const full = !on && pat.chords[b].length >= CHORD_LAYERS;
                      return (
                        <button
                          key={b}
                          type="button"
                          className="daw-cell daw-cell--beat"
                          aria-pressed={on}
                          disabled={full}
                          title={full ? `Già ${CHORD_LAYERS} accordi su questo battito` : undefined}
                          aria-label={`Battito ${b + 1}: ${on ? `${here.map(chordName).join(" + ")}, clic per togliere` : `aggiungi ${chordName({ root, type: keyChord })}`}`}
                          data-now={Math.floor(step / 4) === b && playingSlot === editing}
                          onClick={() => {
                            const next = { root, type: keyChord };
                            update((p) => {
                              const layers = p.patterns[editing].chords[b];
                              // clic su una casella accesa: tolgo quell'accordo, gli altri del battito restano
                              p.patterns[editing].chords[b] = on ? layers.filter((x) => x.root !== root) : [...layers, next];
                            });
                            if (!on && !playing) void engine().preview("chords", { chord: next });
                          }}
                        >
                          {on ? here.map(chordName).join(" + ") : ""}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="daw-roll" data-roll={roll}>
                {ROLLS[roll].rows.map((note) => (
                  <div
                    key={note}
                    className="daw-roll-row"
                    data-sharp={isSharp(note)}
                    data-hit={keyHit?.inst === roll && keyHit.value === note}
                  >
                    <button
                      type="button"
                      className="daw-key"
                      onClick={() => {
                        void engine().preview(roll, { note });
                        lightKey(roll, note);
                      }}
                    >
                      {noteName(note)}
                    </button>
                    {Array.from({ length: STEPS }, (_, i) => {
                      const head = hasNote(roll, i, note);
                      const at = head ? i : noteAt(roll, i, note);
                      const len = at >= 0 ? noteLen(pat, roll, at, note) : 0;
                      return (
                        <button
                          key={i}
                          type="button"
                          className="daw-cell"
                          aria-pressed={head}
                          aria-label={`${noteName(note)} step ${i + 1}${head && len > 1 ? `, lunga ${len} step` : ""}`}
                          data-step={i}
                          data-tail={!head && at >= 0}
                          data-last={at >= 0 && at + len - 1 === i}
                          data-long={head && len > 1}
                          data-now={i === step && playingSlot === editing}
                          data-beat={i % 4 === 0}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            rollDown(roll, i, note);
                          }}
                          // Invio o spazio da tastiera (detail = 0): il clic del mouse lo gestisce rollDown
                          onClick={(e) => e.detail === 0 && setNote(roll, i, note)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {roll === "chords" && (
              <>
                <p className="hw-hint">
                  Clic su una casella: aggiunge l&apos;accordo con quella fondamentale e il tipo scelto su quel battito (fino a{" "}
                  {CHORD_LAYERS} accordi sovrapposti nella stessa colonna); clic di nuovo per toglierlo. In <strong>Pad</strong> un
                  accordo tiene finché non arriva il successivo; in <strong>Stab</strong> è un colpo corto sul battito.
                </p>
            <div className="hw-synths">
              <div className="hw-strip hw-strip--synth hw-strip--chords">
                <div className="hw-synth-head">
                  <div className="hw-synth-title">
                    <span className="hw-label">Chord synth</span>
                    {fxJump("chords")}
                  </div>
                  {soundScope("chords")}
                </div>
                <div className="hw-seg">
                  {(Object.keys(CHORD_STYLES) as ChordStyle[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      className="hw-btn hw-btn--small"
                      aria-pressed={chordS.style === st}
                      title={CHORD_STYLES[st].hint}
                      onClick={() => {
                        setSound("chords", (x) => {
                          x.style = st;
                        });
                        tryOut("chords");
                      }}
                    >
                      <span className="hw-btn-led" />
                      {CHORD_STYLES[st].label}
                    </button>
                  ))}
                </div>
                <Knob
                  label="Cutoff"
                  value={chordS.cutoff}
                  min={300}
                  max={8000}
                  step={10}
                  defaultValue={1800}
                  display={`${Math.round(chordS.cutoff)} Hz`}
                  onChange={(v) =>
                    setSound("chords", (x) => {
                      x.cutoff = v;
                    })
                  }
                />
              </div>
            </div>
              </>
            )}
            {roll !== "chords" && (
            <div className="hw-synths">
              {roll === "bass" ? (
                  <div className="hw-strip hw-strip--synth">
                    <div className="hw-synth-head">
                      <div className="hw-synth-title">
                        <span className="hw-label">Bass synth</span>
                        {fxJump("bass")}
                      </div>
                      {soundScope("bass")}
                      <button
                        type="button"
                        className="hw-btn hw-btn--small"
                        aria-pressed={bassS.length === "lunga"}
                        onClick={() =>
                          setSound("bass", (x) => {
                            x.length = x.length === "lunga" ? "corta" : "lunga";
                          })
                        }
                      >
                        <span className="hw-btn-led" />
                        808 long
                      </button>
                    </div>
                    <div className="hw-seg">
                      {(Object.keys(BASS_WAVES) as Wave[]).map((w) => (
                        <button
                          key={w}
                          type="button"
                          className="hw-btn hw-btn--small"
                          aria-pressed={bassS.wave === w}
                          title={BASS_WAVES[w].hint}
                          onClick={() => {
                            setSound("bass", (x) => {
                              x.wave = w;
                            });
                            tryOut("bass");
                          }}
                        >
                          <span className="hw-btn-led" />
                          {BASS_WAVES[w].label}
                        </button>
                      ))}
                    </div>
                    <Knob
                      label="Cutoff"
                      value={bassS.cutoff}
                      min={150}
                      max={4000}
                      step={10}
                      defaultValue={700}
                      display={`${Math.round(bassS.cutoff)} Hz`}
                      onChange={(v) =>
                        setSound("bass", (x) => {
                          x.cutoff = v;
                        })
                      }
                    />
                  </div>
              ) : (
                  <div className="hw-strip hw-strip--synth hw-strip--chords hw-strip--lead">
                    <div className="hw-synth-head">
                      <div className="hw-synth-title">
                        <span className="hw-label">Lead synth</span>
                        {fxJump("lead")}
                      </div>
                      {soundScope("lead")}
                      <button
                        type="button"
                        className="hw-btn hw-btn--small"
                        aria-pressed={leadS.length === "lunga"}
                        onClick={() =>
                          setSound("lead", (x) => {
                            x.length = x.length === "lunga" ? "corta" : "lunga";
                          })
                        }
                      >
                        <span className="hw-btn-led" />
                        Legato
                      </button>
                    </div>
                    <div className="hw-seg">
                      {LEAD_WAVES.map((w) => (
                        <button
                          key={w}
                          type="button"
                          className="hw-btn hw-btn--small"
                          aria-pressed={leadS.wave === w}
                          title={LEAD_SOUNDS[w].hint}
                          onClick={() => {
                            setSound("lead", (x) => {
                              x.wave = w;
                            });
                            tryOut("lead");
                          }}
                        >
                          <span className="hw-btn-led" />
                          {LEAD_SOUNDS[w].label}
                        </button>
                      ))}
                    </div>
                    <Knob
                        label="Cutoff"
                        value={leadS.cutoff}
                        min={300}
                        max={9000}
                        step={10}
                        defaultValue={2600}
                        display={`${Math.round(leadS.cutoff)} Hz`}
                        onChange={(v) =>
                          setSound("lead", (x) => {
                            x.cutoff = v;
                          })
                        }
                      />
                  </div>
              )}
            </div>
            )}
          </section>
        </div>

        {/* ---- colonna destra: il coach (sul computer si può chiudere) ---- */}
        <aside className="console-coach">
          <CoachChat
            compact
            endpoint="/api/coach/crea"
            payload={() => ({
              projectId: id,
              project: projectRef.current,
              title: titleRef.current,
              editing: playbackRef.current.editing,
            })}
            initial={coachMessages}
            onData={applyFromCoach}
            ask={ask}
            suggestions={[
              "Fammi una traccia deep house con intro, break e drop",
              "Make me a trap beat",
              "Fammi un build prima del drop",
              "Cosa aggiungo adesso?",
            ]}
            intro="Sono qui con te. Chiedimi di creare un beat (lo scrivo io nello studio e ti spiego come l'ho fatto) oppure fallo tu e ti do consigli mentre lo cambi."
          />
          {/* sul telefono la barra delle viste non c'è: il pulsante sta qui */}
          <button type="button" className="hw-btn hw-btn--small ds-report-mobile" onClick={() => setReporting(true)}>
            Segnala un problema
          </button>
        </aside>
      </div>
    </div>
  );
}
