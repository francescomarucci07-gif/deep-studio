"use client";

// La logica dello studio: lo stato del progetto, il motore audio, la tastiera, il MIDI, Annulla/Ripeti, l'export,
// il salvataggio. Daw.tsx e le viste (BeatView, RollView, …) la usano: `const studio = useStudio(props)`.
import type { Msg } from "@/components/CoachChat";
import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "@/lib/daw/engine";
import { KEY_NOTES, OCTAVES, fold, keyNote, keyRoot } from "@/lib/daw/keyboard";
import { type Measures, measure } from "@/lib/daw/measure";
import { INSERT_SLOTS, type PluginSlot } from "@/lib/daw/plugins";
import {
  AUTO_TARGETS,
  type AutoTarget,
  BASS_LOW,
  BEATS,
  BUS_IDS,
  type BusId,
  CHANNEL_IDS,
  CHORD_LAYERS,
  type ChannelFx,
  type ChannelId,
  type Chord,
  type ChordType,
  DRUMS,
  type DrumId,
  LEAD_VOICES,
  setSend,
  LEADS,
  NOTE_PREFIX,
  isLeadInst,
  MIX_TARGETS,
  type MixTarget,
  type Out,
  PATTERN_BARS,
  type PatternBars,
  type Project,
  SLOTS,
  SOUND_KEY,
  STEPS,
  type Slot,
  type SoundInst,
  type Sounds,
  VEL_DEFAULT,
  VEL_MIN,
  barOf,
  chordName,
  emptyPattern,
  filterLabel,
  isBus,
  isEmptyPattern,
  maxLen,
  normalize,
  noteLen,
  noteName,
  patBars,
  resizeSong,
  setNoteLen,
  setPatternBars,
  setVel,
  slotColor,
  songLength,
  soundOf,
  velGain,
  velOf,
  visibleSlots,
} from "@/lib/daw/project";
import { SAMPLE_RATE, renderAudio, renderPlan } from "@/lib/daw/render";
import { AUTO_EVERY_MS, type Version, loadVersion, saveVersion } from "@/lib/daw/versions";
import { createClient } from "@/lib/supabase/client";
import {
  CHANNELS,
  PADS,
  type RollId,
  type RollTab,
  type SaveState,
  VIEWS,
  type ViewId,
  isDrum,
  isView,
  midiVel,
  pct,
  store,
  stored,
} from "./ui";
import { useAscolto } from "./useAscolto";
import { useExport } from "./useExport";
import { useHistory } from "./useHistory";
import { useMidi } from "./useMidi";

export type StudioProps = {
  id: string;
  initialTitle: string;
  initialProject: Project;
  coachMessages: Msg[];
  tourDone?: boolean; // l'account ha già visto il tour guidato
};

export function useStudio({ id, initialTitle, initialProject, coachMessages, tourDone = true }: StudioProps) {
  const [project, setProject] = useState(initialProject);
  const [title, setTitle] = useState(initialTitle);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rec, setRec] = useState(false);
  // count-in: una battuta di click (4) prima di registrare; la scelta resta nel browser
  const [countInOn, setCountInOn] = useState(true);
  const [metroOn, setMetroOn] = useState(false); // metronomo durante il Play (scelta salvata nel browser)
  const metroRef = useRef(false);
  metroRef.current = metroOn;
  useEffect(() => setMetroOn(stored("ds-metro") === "1"), []);
  useEffect(() => {
    if (engineRef.current) engineRef.current.metronome = metroOn;
  }, [metroOn]);
  const toggleMetro = () =>
    setMetroOn((o) => {
      store("ds-metro", o ? "0" : "1");
      return !o;
    });
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
  const [sharing, setSharing] = useState(false); // il riquadro "Link di ascolto"
  const [learnMenu, setLearnMenu] = useState(false); // il menu "Impara" (tour e lezioni)
  const [exported, setExported] = useState(false); // ha esportato o chiesto un parere (per l'ultima lezione)
  const closeReport = useCallback(() => setReporting(false), []);
  const openRoll = (k: RollTab) => {
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
      engineRef.current.metronome = metroRef.current;
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
  // il parere in tempo reale: misura il mix mentre suona e prepara gli avvisi (useAscolto.ts, listen.ts)
  const ascolto = useAscolto(engineRef, playing);
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
  }, [project.mixer, project.bpm, project.fx, project.masterFilter, project.automation, project.volAuto, project.inserts, project.buses]);

  // Annulla / Ripeti (useHistory.ts)
  const { lastEdit, hist, remember, undoEdit, redoEdit } = useHistory(projectRef, setProject);

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
  const [octaves, setOctaves] = useState({ bass: OCTAVES.bass.start, lead: OCTAVES.lead.start, lead2: OCTAVES.lead2.start });
  const [keyChord, setKeyChord] = useState<ChordType>("min7");
  const [lastKey, setLastKey] = useState("");
  const keyInst = roll;
  const keysRef = useRef({ keyMode, keyInst, octaves, keyChord });
  keysRef.current = { keyMode, keyInst, octaves, keyChord };

  // le note registrate con il tasto ancora giù: al rilascio prendono la loro lunghezza
  const held = useRef(new Map<string, { slot: Slot; step: number; note: number; inst: RollId; at: number }>());
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
            if (isLeadInst(inst)) {
              if (!pp[inst][s].includes(note) && pp[inst][s].length < LEAD_VOICES) {
                pp[inst][s] = [...pp[inst][s], note].sort((a, b) => a - b);
              }
            } else {
              if (pp.bass[s] !== null) setNoteLen(pp, "bass", s, pp.bass[s] as number, 1);
              pp.bass[s] = note;
            }
            if (midi) setVel(pp, `${NOTE_PREFIX[inst]}${s}`, midiVel(midi.vel));
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
  const lead2S = soundOf(project, editPat, "lead2");
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
  const tryOut = (c: RollTab) => setTimeout(() => !engineRef.current?.playing && hitPad(c), 30);
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
        note: isLeadInst(c) ? (cur[c].find((n) => n.length)?.[0] ?? 69) : (cur.bass.find((n) => n !== null) ?? BASS_LOW),
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
      // nel Roll: selezione, frecce, Canc, Ctrl+C/X/V/D/A
      if (!typing(e.target) && !e.altKey && rollKeyRef.current(e)) {
        e.preventDefault();
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

  // Tastiera MIDI (useMidi.tsx): il pulsante MIDI e i tasti che arrivano
  const midiButton = useMidi(keysRef, { playKey, hitPad, releaseKey });

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
  const hasNote = (r: RollId, i: number, note: number) => (isLeadInst(r) ? pat[r][i].includes(note) : pat.bass[i] === note);
  // gli step coperti dalla coda di una nota lunga (per le righe Bass e Lead del Beat)
  const holds = { bass: new Set<number>(), lead: new Set<number>(), lead2: new Set<number>() };
  for (let i = 0; i < pat.bass.length; i++) {
    const b = pat.bass[i];
    if (b !== null) for (let k = 1; k < noteLen(pat, "bass", i, b); k++) holds.bass.add(i + k);
    for (const r of LEADS) for (const m of pat[r][i]) for (let k = 1; k < noteLen(pat, r, i, m); k++) holds[r].add(i + k);
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
  // Pattern lunghi: Beat e Roll mostrano una battuta alla volta (vb). Gli indici restano dall'inizio del pattern.
  const nBars = patBars(pat);
  const [viewBar, setViewBar] = useState(0);
  const vb = Math.min(viewBar, nBars - 1);
  const cols = Array.from({ length: STEPS }, (_, j) => vb * STEPS + j);
  const beatCols = Array.from({ length: BEATS }, (_, j) => vb * BEATS + j);
  // durante il Play del pattern che stai guardando, la vista segue la battuta che suona (come in FL)
  const playingBar = step >= 0 && playingSlot === editing ? Math.floor(step / STEPS) : -1;
  useEffect(() => {
    if (playingBar >= 0) setViewBar(playingBar);
  }, [playingBar]);
  useEffect(() => setViewBar(0), [editing]);
  const changeBars = (n: PatternBars) => {
    if (n === nBars) return;
    // accorciando si perdono le battute in più: chiedo solo se c'è qualcosa
    if (n < nBars) {
      const cut = pat.drums.kick.length;
      const from = STEPS * n;
      const lost =
        DRUMS.some(({ id }) => pat.drums[id].slice(from, cut).some(Boolean)) ||
        pat.bass.slice(from).some((x) => x !== null) ||
        LEADS.some((r) => pat[r].slice(from).some((x) => x.length)) ||
        pat.chords.slice(BEATS * n).some((x) => x.length);
      if (lost && !window.confirm(`Il pattern ${editing} passa a ${n} battut${n === 1 ? "a" : "e"}: le note nelle battute dopo si perdono. Va bene?`)) return;
    }
    update((p) => setPatternBars(p.patterns[editing], n));
    if (n < nBars) setViewBar(0);
  };
  const barControls = (
    <span className="hw-bars" role="group" aria-label={`Lunghezza del pattern ${editing}`}>
      <label className="hw-visually-hidden" htmlFor={`bars-${editing}`}>
        Battute del pattern
      </label>
      <select
        id={`bars-${editing}`}
        className="hw-select hw-bars-len"
        value={nBars}
        title="Quante battute è lungo il pattern (allungando, le battute si copiano)"
        onChange={(e) => changeBars(Number(e.target.value) as PatternBars)}
      >
        {PATTERN_BARS.map((n) => (
          <option key={n} value={n}>
            {n} bat.
          </option>
        ))}
      </select>
      {nBars > 1 &&
        Array.from({ length: nBars }, (_, k) => (
          <button
            key={k}
            type="button"
            className="hw-btn hw-btn--small hw-bars-tab"
            aria-pressed={vb === k}
            data-playing={playingBar === k}
            title={`Battuta ${k + 1} del pattern ${editing}`}
            onClick={() => setViewBar(k)}
          >
            {k + 1}
          </button>
        ))}
    </span>
  );
  // la nota che copre lo step i (con la sua coda): lo step in cui comincia, oppure -1
  const noteAt = (r: RollId, i: number, note: number) => {
    for (let j = i; j >= 0; j--) if (hasNote(r, j, note)) return j + noteLen(pat, r, j, note) > i ? j : -1;
    return -1;
  };
  // mette (con la lunghezza data) o toglie una nota; nel basso, che è mono, una nota nuova sostituisce quella dello step
  const putNote = (p: Project, r: RollId, i: number, note: number, len: number) => {
    const pp = p.patterns[playbackRef.current.editing];
    if (isLeadInst(r)) {
      if (!pp[r][i].includes(note)) pp[r][i] = [...pp[r][i], note].sort((a, b) => a - b);
    } else {
      if (pp.bass[i] !== null) setNoteLen(pp, "bass", i, pp.bass[i] as number, 1);
      pp.bass[i] = note;
    }
    setNoteLen(pp, r, i, note, len);
  };
  const dropNote = (p: Project, r: RollId, i: number, note: number) => {
    const pp = p.patterns[playbackRef.current.editing];
    setNoteLen(pp, r, i, note, 1);
    if (isLeadInst(r)) pp[r][i] = pp[r][i].filter((n) => n !== note);
    else pp.bass[i] = null;
  };
  // con la tastiera (Invio o spazio su una casella): metti o togli una nota, lunga quanto il pennello
  const setNote = (r: RollId, i: number, note: number) => {
    const at = noteAt(r, i, note);
    if (isLeadInst(r) && at < 0 && pat[r][i].length >= LEAD_VOICES) return; // già 6 voci su questo step
    update((p) => (at >= 0 ? dropNote(p, r, at, note) : putNote(p, r, i, note, brushLen.current)));
    if (at < 0 && !playing) void engine().preview(r, { note });
  };
  // Col mouse, come il piano roll di FL: premi su una casella vuota e trascini = disegni una nota lunga quanto vuoi;
  // premi su una nota e trascini = la allunghi o accorci; un clic senza trascinare su una nota = la togli.
  // La nota nuova prende la lunghezza dell'ultima che hai disegnato (il "pennello").
  const brushLen = useRef(1);
  const drag = useRef<{ r: RollId; note: number; start: number; len: number; existed: boolean; moved: boolean } | null>(null);
  // Selezione nel Roll (come FL): Ctrl o Shift + trascina = riquadro; poi frecce, Canc, Ctrl+C/X/V/D (vedi rollKey).
  // Le note selezionate sono "step:nota" (lo step dall'inizio del pattern).
  const [sel, setSel] = useState<Set<string>>(new Set());
  const box = useRef<{ s0: number; n0: number } | null>(null);
  const clip = useRef<{ r: RollId; items: { s: number; n: number; len: number; vel?: number }[] } | null>(null);
  useEffect(() => setSel(new Set()), [editing, roll]);
  const rollDown = (r: RollId, i: number, note: number, e?: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }) => {
    if (e && (e.ctrlKey || e.shiftKey || e.metaKey)) {
      box.current = { s0: i, n0: note };
      setSel(boxSel(r, i, note, i, note));
      return;
    }
    if (sel.size) setSel(new Set()); // un clic normale toglie la selezione, come in FL
    const at = noteAt(r, i, note);
    if (at >= 0) {
      drag.current = { r, note, start: at, len: noteLen(pat, r, at, note), existed: true, moved: false };
      return;
    }
    if (isLeadInst(r) && pat[r][i].length >= LEAD_VOICES) return;
    const len = Math.min(brushLen.current, maxLen(pat, r, i, note));
    update((p) => putNote(p, r, i, note, len));
    if (!playing) void engine().preview(r, { note });
    drag.current = { r, note, start: i, len, existed: false, moved: false };
  };
  // le note (inizio) dentro un riquadro di step e altezze
  const boxSel = (r: RollId, s0: number, n0: number, s1: number, n1: number) => {
    const cur = projectRef.current.patterns[playbackRef.current.editing];
    const [sa, sb] = [Math.min(s0, s1), Math.max(s0, s1)];
    const [na, nb] = [Math.min(n0, n1), Math.max(n0, n1)];
    const out = new Set<string>();
    for (let st = sa; st <= sb; st++) {
      const list = isLeadInst(r) ? cur[r][st] : cur.bass[st] === null ? [] : [cur.bass[st] as number];
      for (const n of list) if (n >= na && n <= nb) out.add(`${st}:${n}`);
    }
    return out;
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (box.current) {
        const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".daw-roll [data-step][data-note]");
        const r = rollRef.current;
        if (cell && r !== "chords") setSel(boxSel(r, box.current.s0, box.current.n0, Number(cell.dataset.step), Number(cell.dataset.note)));
        return;
      }
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
      box.current = null;
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

  // Le operazioni sulla selezione del Roll. Le note si tolgono e si rimettono nel posto nuovo: prima tutte le note,
  // poi le lunghezze (così una nota lunga non copre per sbaglio quella dopo). La velocity segue lo step.
  const rollRef = useRef<RollTab>(roll);
  rollRef.current = roll;
  const selItems = (r: RollId) => {
    const cur = projectRef.current.patterns[playbackRef.current.editing];
    return [...sel].map((k) => {
      const [st, n] = k.split(":").map(Number);
      const v = cur.vel?.[`${NOTE_PREFIX[r]}${st}`];
      return { s: st, n, len: noteLen(cur, r, st, n), ...(v !== undefined ? { vel: v } : {}) };
    });
  };
  const placeNotes = (r: RollId, items: { s: number; n: number; len: number; vel?: number }[], remove: { s: number; n: number }[] = []) => {
    const lo = OCTAVES[r].low, hi = OCTAVES[r].high;
    const cur = projectRef.current.patterns[playbackRef.current.editing];
    const ok = items.filter((x) => x.s >= 0 && x.s < cur.bass.length && x.n >= lo && x.n <= hi);
    lastEdit.current = 0; // un comando da tastiera è sempre un passo a sé di Annulla
    update((p) => {
      const pp = p.patterns[playbackRef.current.editing];
      for (const x of remove) {
        setNoteLen(pp, r, x.s, x.n, 1);
        if (isLeadInst(r)) pp[r][x.s] = pp[r][x.s].filter((m) => m !== x.n);
        else if (pp.bass[x.s] === x.n) pp.bass[x.s] = null;
      }
      for (const x of ok) {
        if (isLeadInst(r)) {
          if (!pp[r][x.s].includes(x.n) && pp[r][x.s].length < LEAD_VOICES) pp[r][x.s] = [...pp[r][x.s], x.n].sort((a, b) => a - b);
        } else {
          if (pp.bass[x.s] !== null) setNoteLen(pp, "bass", x.s, pp.bass[x.s] as number, 1);
          pp.bass[x.s] = x.n;
        }
        if (x.vel !== undefined) setVel(pp, `${NOTE_PREFIX[r]}${x.s}`, x.vel);
      }
      for (const x of ok) setNoteLen(pp, r, x.s, x.n, x.len);
    });
    setSel(new Set(ok.map((x) => `${x.s}:${x.n}`)));
  };
  // i tasti del Roll (solo con il Roll aperto sul computer): true = tasto usato
  const rollKey = (e: KeyboardEvent) => {
    if (view !== "roll" || roll === "chords" || keyMode !== "keys") return false;
    const r = roll as RollId;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && k === "a") {
      setSel(boxSel(r, 0, 0, pat.bass.length - 1, 127));
      return true;
    }
    if (ctrl && k === "v" && clip.current?.r === r) {
      placeNotes(r, clip.current.items);
      return true;
    }
    if (!sel.size) return false;
    const items = selItems(r);
    if (k === "escape") setSel(new Set());
    else if (k === "delete" || k === "backspace") {
      placeNotes(r, [], items);
      setSel(new Set());
    } else if (ctrl && (k === "c" || k === "x")) {
      clip.current = { r, items };
      if (k === "x") {
        placeNotes(r, [], items);
        setSel(new Set());
      }
    } else if (ctrl && k === "d") {
      // duplica subito dopo la selezione
      const from = Math.min(...items.map((x) => x.s));
      const span = Math.max(...items.map((x) => x.s + x.len)) - from;
      placeNotes(r, items.map((x) => ({ ...x, s: x.s + span })));
    } else if (k === "arrowup" || k === "arrowdown" || k === "arrowleft" || k === "arrowright") {
      const big = e.shiftKey;
      const dn = k === "arrowup" ? (big ? 12 : 1) : k === "arrowdown" ? (big ? -12 : -1) : 0;
      const ds = k === "arrowright" ? (big ? 4 : 1) : k === "arrowleft" ? (big ? -4 : -1) : 0;
      const moved = items.map((x) => ({ ...x, s: x.s + ds, n: x.n + dn }));
      const lo = OCTAVES[r].low, hi = OCTAVES[r].high;
      // se anche una sola nota uscirebbe (dalla battuta o dall'estensione) non sposto niente
      if (moved.some((x) => x.s < 0 || x.s >= pat.bass.length || x.n < lo || x.n > hi)) return true;
      placeNotes(r, moved, items);
      if (dn && !playing) void engine().preview(r, { note: moved[0].n });
    } else return false;
    return true;
  };
  const rollKeyRef = useRef(rollKey);
  rollKeyRef.current = rollKey;

  const setFx = (c: ChannelId, patch: Partial<ChannelFx>) =>
    update((p) => {
      p.fx[c] = { ...p.fx[c], ...patch };
    });

  // automazione: un punto per battuta (null = nessun punto). Una corsia senza punti sparisce.
  // Cosa si automatizza: il filtro (master e canali) o il volume (master, canali e bus)
  const [autoParam, setAutoParam] = useState<"filter" | "volume">("filter");
  const [volTarget, setVolTarget] = useState<MixTarget>("master");
  const isVol = autoParam === "volume";
  const lane = isVol ? project.volAuto?.[volTarget] : project.automation[autoTarget];
  // prima del primo punto vale la manopola o il fader
  const autoBase = isVol
    ? volTarget === "master"
      ? 1
      : isBus(volTarget)
        ? project.buses[volTarget].volume
        : project.mixer[volTarget as ChannelId].volume
    : autoTarget === "master"
      ? project.masterFilter
      : project.fx[autoTarget].filter;
  const autoMin = isVol ? 0 : -1;
  const autoLabel = (v: number) => (isVol ? pct(v) : filterLabel(v));
  const setPoint = (b: number, v: number | null) =>
    update((p) => {
      const lanes = (isVol ? (p.volAuto ??= {}) : p.automation) as Partial<Record<string, (number | null)[]>>;
      const key = isVol ? volTarget : autoTarget;
      const l = lanes[key] ?? Array(p.song.length).fill(null);
      l[b] = v;
      if (l.some((x) => x !== null)) lanes[key] = l;
      else delete lanes[key];
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
      AUTO_TARGETS.some((t) => project.automation[t]?.slice(from).some((v) => v !== null)) ||
      MIX_TARGETS.some((t) => project.volAuto?.[t]?.slice(from).some((v) => v !== null));
    if (full && !window.confirm(`Le battute ${from + 1}–${project.song.length} non sono vuote: le tolgo?`)) return;
    update((p) => resizeSong(p, p.song.length - 4));
  };
  const clearLane = () =>
    update((p) => {
      if (isVol) delete p.volAuto?.[volTarget];
      else delete p.automation[autoTarget];
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
  const fxJump = (c: RollTab) => {
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
  // Send come in FL: scegli un bus con il suo pulsante Send, e sotto ogni canale compare la manopola di quanto ci mandi
  const [sendBus, setSendBus] = useState<BusId | null>(null);
  const setChannelSend = (c: ChannelId, b: BusId, v: number) => update((p) => setSend(p.mixer[c], b, v));
  // togli un bus: sparisce dal mixer e i suoi canali tornano dritti al master (i plugin restano, se lo riapri)
  const removeBus = (b: BusId) => {
    update((p) => {
      p.buses[b].shown = false;
      for (const id of CHANNEL_IDS) {
        if (p.mixer[id].out === b) p.mixer[id].out = "master";
        if (p.mixer[id].sends?.[b]) setSend(p.mixer[id], b, 0); // e i send verso quel bus si tolgono
      }
    });
    if (fxTarget === b) setFxOpen(false);
    if (sendBus === b) setSendBus(null);
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
  // Export (useExport.ts): Mix WAV, stem e MIDI
  const { exportMenu, setExportMenu, exportMsg, exportWav, exportStems, exportMidi } = useExport({
    projectRef,
    titleRef,
    songMode,
    editing,
    setExporting,
    onDone: () => setExported(true),
  });

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
      setExported(true);
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
      p.patterns[editing] = {
        ...emptyPattern(patBars(p.patterns[editing])),
        ...(p.patterns[editing].sounds ? { sounds: p.patterns[editing].sounds } : {}),
      };
    });
  };
  // canzone come la playlist di FL: clic = metti il pattern del pennello, clic sullo stesso = svuota
  const paintBar = (b: number) =>
    update((p) => {
      const n = patBars(p.patterns[brush]);
      if (p.song[b] === brush) {
        const start = b - barOf(p, p.song, b);
        for (let i = start; i < start + n && i < p.song.length && p.song[i] === brush; i++) p.song[i] = null;
      } else {
        // un pattern lungo occupa le sue battute (finché c'è posto nella fila)
        for (let i = b; i < b + n && i < p.song.length; i++) p.song[i] = brush;
      }
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
      (c === "bass"
        ? sounding.bass[step] !== null
        : isLeadInst(c)
        ? sounding[c][step].length > 0
        : c === "chords"
          ? step % 4 === 0 && sounding.chords[step / 4].length > 0
          : sounding.drums[c][step]));

  return {
    ascolto,
    sendBus,
    setSendBus,
    setChannelSend,
    addBars,
    applyFromCoach,
    ask,
    autoBase,
    autoLabel,
    autoMin,
    autoParam,
    autoScroll,
    autoTarget,
    bar,
    barControls,
    bassS,
    beatCols,
    brush,
    chooseStart,
    chooseView,
    chordS,
    clearLane,
    clearPattern,
    closeReport,
    coachMessages,
    coachOpen,
    cols,
    countInOn,
    counting,
    duplicate,
    editing,
    effStart,
    endTour,
    engine,
    exportMenu,
    exportMidi,
    exportMsg,
    exportStems,
    exportWav,
    exported,
    exporting,
    firstFree,
    fxJump,
    fxLabel,
    fxOpen,
    fxTarget,
    hasNote,
    hist,
    hitNow,
    hitPad,
    holds,
    id,
    isVol,
    keyChord,
    keyHit,
    keyInst,
    keyMode,
    lane,
    lastKey,
    leadS,
    lead2S,
    learnMenu,
    lightKey,
    limiterDb,
    listen,
    listening,
    measures,
    metroOn,
    midiButton,
    moveSlot,
    nextBus,
    noteAt,
    octaves,
    openCoach,
    openFx,
    openRoll,
    paintBar,
    pat,
    patternButtons,
    play,
    playbackRef,
    playing,
    playingSlot,
    project,
    projectRef,
    rec,
    redoEdit,
    remember,
    removeBars,
    removeBus,
    reporting,
    sharing,
    setSharing,
    restore,
    roll,
    rollDown,
    routeTo,
    save,
    sel,
    selSlot,
    setAsk,
    setAutoParam,
    setAutoTarget,
    setBrush,
    setBus,
    setChannel,
    setCoachOpen,
    setEditing,
    setExportMenu,
    setFx,
    setFxOpen,
    setKeyChord,
    setLearnMenu,
    setMeasures,
    setNote,
    setPoint,
    setProject,
    setReporting,
    setRoll,
    setSelSlot,
    setShowVersions,
    setSlot,
    setSlotParam,
    setSolo,
    setSongMode,
    setSound,
    setTitle,
    setTouring,
    setUndo,
    setVelMode,
    setVelShown,
    setVolTarget,
    shiftOctave,
    showVersions,
    shown,
    shownSlots,
    snapshot,
    solo,
    soloButton,
    songMode,
    soundScope,
    step,
    stop,
    title,
    titleRef,
    toggleCoach,
    toggleCountIn,
    toggleDrum,
    toggleMetro,
    toggleRec,
    touring,
    tryOut,
    undo,
    undoEdit,
    update,
    velBar,
    velMode,
    velProps,
    velShown,
    versionsTick,
    view,
    volTarget,
  };
}

// tutto quello che lo studio dà alle viste
export type Studio = ReturnType<typeof useStudio>;
