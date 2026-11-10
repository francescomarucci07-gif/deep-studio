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
  CHORD_TYPES,
  DRUMS,
  LEAD_HIGH,
  LEAD_LOW,
  LEAD_WAVES,
  NOTE_NAMES,
  SLOTS,
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
  type AutoTarget,
  type ChannelFx,
  type ChannelId,
  type ChordType,
  type DrumId,
  type Project,
  type Slot,
} from "@/lib/daw/project";
import { KIT_IDS, KITS } from "@/lib/daw/kits";
import { measure, type Measures } from "@/lib/daw/measure";
import { encodeWav, renderAudio, renderPlan, SAMPLE_RATE } from "@/lib/daw/render";
import { AUTO_EVERY_MS, loadVersion, saveVersion, type Version } from "@/lib/daw/versions";
import { createClient } from "@/lib/supabase/client";

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
  { id: "chords", label: "Accordi", icon: "M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zm0 0V6l11-2v12m0 0a3 3 0 1 1-3-3 3 3 0 0 1 3 3z" },
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
const ROLLS = {
  bass: { label: "Bass", rows: rows(BASS_LOW, BASS_HIGH) },
  lead: { label: "Lead", rows: rows(LEAD_LOW, LEAD_HIGH) },
} as const;
type RollId = keyof typeof ROLLS;
const isSharp = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
const pct = (v: number) => `${Math.round(v * 100)}%`;
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
const WAVE_LABEL: Record<(typeof LEAD_WAVES)[number], string> = { sawtooth: "Saw", square: "Sqr", triangle: "Tri" };
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
}: {
  id: string;
  initialTitle: string;
  initialProject: Project;
  coachMessages: Msg[];
}) {
  const [project, setProject] = useState(initialProject);
  const [title, setTitle] = useState(initialTitle);
  const [step, setStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [rec, setRec] = useState(false);
  const [flash, setFlash] = useState<ChannelId | null>(null);
  const [save, setSave] = useState<SaveState>("salvato");
  const [undo, setUndo] = useState<{ project: Project; name: string } | null>(null);
  const [editing, setEditing] = useState<Slot>("A"); // il pattern che vedi e modifichi
  const [songMode, setSongMode] = useState(false);
  const [bar, setBar] = useState(-1);
  const [playingSlot, setPlayingSlot] = useState<Slot | null>(null);
  const pat = project.patterns[editing];
  const [showVersions, setShowVersions] = useState(false);
  const [roll, setRoll] = useState<RollId>("bass");
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
  const stepRef = useRef(step);
  stepRef.current = step;
  const playbackRef = useRef({ song: songMode, editing });
  playbackRef.current = { song: songMode, editing };
  const playingSlotRef = useRef(playingSlot);
  playingSlotRef.current = playingSlot;
  const engineRef = useRef<Engine | null>(null);

  const engine = useCallback(() => {
    engineRef.current ??= new Engine(
      () => projectRef.current,
      () => playbackRef.current,
      (s, b, slot) => {
        setStep(s);
        setBar(b);
        setPlayingSlot(slot);
      },
    );
    return engineRef.current;
  }, []);

  const play = useCallback(async () => {
    const e = engine();
    if (!e.playing) await e.start();
    setPlaying(true);
  }, [engine]);
  const stop = useCallback(() => {
    engineRef.current?.stop();
    setPlaying(false);
  }, []);
  const togglePlay = useCallback(() => (engineRef.current?.playing ? stop() : void play()), [play, stop]);

  useEffect(() => () => engineRef.current?.close(), []);
  useEffect(() => {
    engineRef.current?.applyMixer();
  }, [project.mixer, project.bpm, project.fx, project.masterFilter, project.automation]);

  const update = useCallback(
    (fn: (p: Project) => void) =>
      setProject((p) => {
        const next = structuredClone(p);
        fn(next);
        return next;
      }),
    [],
  );

  // Un colpo sul pad: suona sempre; con REC acceso e Play, scrive il colpo sullo step che sta suonando
  const hitPad = useCallback(
    (c: ChannelId) => {
      const cur = projectRef.current.patterns[playbackRef.current.editing];
      void engine().preview(c, {
        note: c === "lead" ? (cur.lead.find((n) => n !== null) ?? 69) : (cur.bass.find((n) => n !== null) ?? BASS_LOW),
        chord: cur.chords.find((x) => x !== null) ?? undefined,
      });
      setFlash(c);
      setTimeout(() => setFlash((f) => (f === c ? null : f)), 140);
      const s = stepRef.current;
      // in modalità song registra nel pattern che sta suonando, altrimenti in quello che modifichi
      const slot = playbackRef.current.song ? playingSlotRef.current : playbackRef.current.editing;
      if (rec && engineRef.current?.playing && s >= 0 && isDrum(c) && slot) {
        update((p) => {
          p.patterns[slot].drums[c][s] = true;
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
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.metaKey || e.ctrlKey || e.repeat) return;
      // 1–6: cambia vista (le cifre non sono usate dai pad)
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= VIEWS.length && !e.altKey) {
        chooseView(VIEWS[n - 1].id);
        return;
      }
      const pad = PADS.find((p) => p.key === e.key.toLowerCase());
      if (pad) hitPad(pad.id);
    };
    // i browser "cliccano" il pulsante col focus quando lo spazio viene rilasciato: lo blocco anche lì
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [togglePlay, hitPad, chooseView]);

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
    setProject(normalize(saved.data));
    setTitle(saved.title);
  };

  const toggleDrum = (d: DrumId, i: number) => {
    const turningOn = !pat.drums[d][i];
    update((p) => {
      p.patterns[editing].drums[d][i] = turningOn;
    });
    if (turningOn && !playing) void engine().preview(d);
  };

  // una nota nel piano roll (basso o lead): clic su una nota accesa = la spegne
  const setNote = (roll: RollId, i: number, note: number) => {
    const removing = pat[roll][i] === note;
    update((p) => {
      p.patterns[editing][roll][i] = removing ? null : note;
    });
    if (!removing && !playing) void engine().preview(roll, { note });
  };

  // accordo del battito b: nota "" = nessun accordo
  const setChord = (b: number, root: string, type?: ChordType) => {
    const prev = pat.chords[b];
    const next = root === "" ? null : { root: Number(root), type: type ?? prev?.type ?? "min7" };
    update((p) => {
      p.patterns[editing].chords[b] = next;
    });
    if (next && !playing) void engine().preview("chords", { chord: next });
  };

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

  const setChannel = (c: ChannelId, patch: Partial<Project["mixer"][ChannelId]>) =>
    update((p) => {
      p.mixer[c] = { ...p.mixer[c], ...patch };
    });

  // il coach ha scritto pattern e/o canzone: li applico e tengo il progetto di prima per "Annulla"
  const applyFromCoach = (data: unknown) => {
    const d = data as { project?: unknown; name?: string; focus?: Slot; song?: boolean };
    if (!d?.project) return;
    setUndo({ project: projectRef.current, name: d.name || "pattern" });
    void snapshot(`Prima del coach: ${d.name || "modifica"}`);
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
      p.patterns[editing] = emptyPattern();
    });
  };
  const cycleBar = (b: number) =>
    update((p) => {
      const order: (Slot | null)[] = [...SLOTS, null];
      p.song[b] = order[(order.indexOf(p.song[b]) + 1) % order.length];
    });

  // cosa suona adesso (per accendere pad e meter): il pattern in riproduzione, non quello in modifica
  const sounding = playing && playingSlot ? project.patterns[playingSlot] : null;
  const hitNow = (c: ChannelId) =>
    flash === c ||
    (sounding !== null &&
      step >= 0 &&
      (c === "bass" || c === "lead"
        ? sounding[c][step] !== null
        : c === "chords"
          ? step % 4 === 0 && sounding.chords[step / 4] !== null
          : sounding.drums[c][step]));

  return (
    <div className="console" data-coach={coachOpen ? "on" : "off"}>
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
            <span className="hw-lcd-big">{project.bpm}</span>
            <span className="hw-lcd-unit">BPM</span>
            <span className="hw-lcd-small">
              {songMode ? `SONG · BAR ${bar >= 0 ? two(bar + 1) : "--"}/${two(songLength(project))}` : `PATTERN ${editing}`}
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
          <button type="button" className="hw-btn hw-btn--play" aria-pressed={playing} onClick={() => void play()}>
            <span className="hw-btn-led" />▶ Play
          </button>
          <button type="button" className="hw-btn" onClick={stop}>
            <span className="hw-btn-led" />■ Stop
          </button>
          <button type="button" className="hw-btn hw-btn--rec" aria-pressed={rec} onClick={() => setRec(!rec)}>
            <span className="hw-btn-led" />● Rec
          </button>
          <button type="button" className="hw-btn" aria-pressed={showVersions} onClick={() => setShowVersions(!showVersions)}>
            <span className="hw-btn-led" />↺ Versioni
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
              <h2 className="hw-title">Pads · Kit {KITS[project.kit].label}</h2>
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
            <div className="hw-pads">
              {PADS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="hw-pad"
                  data-color={p.color}
                  data-hit={hitNow(p.id)}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    hitPad(p.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") hitPad(p.id);
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
            <button
              type="button"
              className="hw-btn hw-btn--small hw-views-end"
              aria-pressed={coachOpen}
              onClick={toggleCoach}
            >
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
                {SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="hw-btn hw-btn--small hw-btn--slot"
                    aria-pressed={editing === s}
                    data-playing={playingSlot === s}
                    data-empty={isEmptyPattern(project.patterns[s])}
                    onClick={() => setEditing(s)}
                  >
                    <span className="hw-btn-led" />
                    {s}
                  </button>
                ))}
                <button type="button" className="hw-btn hw-btn--small" disabled={!firstFree} onClick={duplicate}>
                  Duplica{firstFree ? ` → ${firstFree}` : ""}
                </button>
                <button type="button" className="hw-btn hw-btn--small" onClick={clearPattern}>
                  Svuota
                </button>
              </div>
            </div>
            <div className="hw-seq-grid">
              {DRUMS.map(({ id: d, label }) => (
                <div key={d} className="hw-seq-row" data-row={d}>
                  <button type="button" className="hw-seq-name" onClick={() => void engine().preview(d)}>
                    {label}
                  </button>
                  {pat.drums[d].map((on, i) => (
                    <button
                      key={i}
                      type="button"
                      className="hw-key"
                      data-group={Math.floor(i / 4)}
                      aria-pressed={on}
                      aria-label={`${label} step ${i + 1}`}
                      data-now={i === step && playingSlot === editing}
                      onClick={() => toggleDrum(d, i)}
                    >
                      <span className="hw-key-led" />
                    </button>
                  ))}
                </div>
              ))}
              <div className="hw-seq-row" data-row="bass">
                <button type="button" className="hw-seq-name" onClick={() => void engine().preview("bass")}>
                  Bass
                </button>
                {pat.bass.map((n, i) => (
                  <span
                    key={i}
                    className="hw-key hw-key--note"
                    data-group={Math.floor(i / 4)}
                    data-on={n !== null}
                    data-now={i === step && playingSlot === editing}
                  >
                    {n !== null ? noteName(n).replace(/\d$/, "") : ""}
                  </span>
                ))}
              </div>
              <div className="hw-seq-row" data-row="lead">
                <button type="button" className="hw-seq-name" onClick={() => {
                    setRoll("lead");
                    chooseView("roll");
                  }}
                >
                  Lead
                </button>
                {pat.lead.map((n, i) => (
                  <span
                    key={i}
                    className="hw-key hw-key--note hw-key--lead"
                    data-group={Math.floor(i / 4)}
                    data-on={n !== null}
                    data-now={i === step && playingSlot === editing}
                  >
                    {n !== null ? noteName(n).replace(/\d$/, "") : ""}
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

          {/* ---- accordi del pattern: uno per battito ---- */}
          <section className="hw-panel hw-chords" data-panel="chords" aria-label="Accordi">
            <div className="hw-seq-head">
              <h2 className="hw-title">Accordi · Pattern {editing}</h2>
              <span className="hw-value">
                {pat.chords.some(Boolean) ? pat.chords.map((c) => (c ? chordName(c) : "·")).join("  ") : "nessun accordo"}
              </span>
            </div>
            <div className="hw-chord-row">
              {Array.from({ length: BEATS }, (_, b) => {
                const c = pat.chords[b];
                return (
                  <div key={b} className="hw-chord" data-on={c !== null} data-now={playingSlot === editing && Math.floor(step / 4) === b}>
                    <span className="hw-label">Battito {b + 1}</span>
                    <span className="hw-chord-name">{c ? chordName(c) : "–"}</span>
                    <label className="hw-visually-hidden" htmlFor={`nota-${b}`}>
                      Nota dell&apos;accordo, battito {b + 1}
                    </label>
                    <select
                      id={`nota-${b}`}
                      className="hw-select"
                      value={c ? String(c.root) : ""}
                      onChange={(e) => setChord(b, e.target.value)}
                    >
                      <option value="">{b === 0 ? "nessuno" : "tiene il prima"}</option>
                      {NOTE_NAMES.map((n, i) => (
                        <option key={n} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <label className="hw-visually-hidden" htmlFor={`tipo-${b}`}>
                      Tipo di accordo, battito {b + 1}
                    </label>
                    <select
                      id={`tipo-${b}`}
                      className="hw-select"
                      value={c?.type ?? "min7"}
                      disabled={!c}
                      onChange={(e) => c && setChord(b, String(c.root), e.target.value as ChordType)}
                    >
                      {CHORD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <p className="hw-hint">
              Un accordo per battito. In <strong>Pad</strong> un accordo tiene finché non arriva il successivo; in{" "}
              <strong>Stab</strong> è un colpo corto sul battito. Per la deep house prova La m7 → Fa maj7 → Do maj7 → Sol.
            </p>
            <div className="hw-synths">
              <div className="hw-strip hw-strip--synth hw-strip--chords">
                <span className="hw-label">Chord synth</span>
                <div className="hw-seg">
                  {(["pad", "stab"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      className="hw-btn hw-btn--small"
                      aria-pressed={project.chordSound.style === st}
                      onClick={() =>
                        update((p) => {
                          p.chordSound.style = st;
                        })
                      }
                    >
                      <span className="hw-btn-led" />
                      {st === "pad" ? "Pad" : "Stab"}
                    </button>
                  ))}
                </div>
                <Knob
                  label="Cutoff"
                  value={project.chordSound.cutoff}
                  min={300}
                  max={8000}
                  step={10}
                  defaultValue={1800}
                  display={`${Math.round(project.chordSound.cutoff)} Hz`}
                  onChange={(v) =>
                    update((p) => {
                      p.chordSound.cutoff = v;
                    })
                  }
                />
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
            <div className="hw-song-bars">
              {project.song.map((s, b) => (
                <button
                  key={b}
                  type="button"
                  className="hw-bar"
                  data-slot={s ?? "none"}
                  data-now={songMode && playing && b === bar}
                  aria-label={`Battuta ${b + 1}: ${s ? `pattern ${s}` : "vuota"}. Clic per cambiare`}
                  onClick={() => cycleBar(b)}
                >
                  <span className="hw-bar-num">{b + 1}</span>
                  <span className="hw-bar-slot">{s ?? "–"}</span>
                </button>
              ))}
            </div>
            <p className="hw-hint">
              Clic su una battuta: A → B → C → D → vuota. <strong>+4</strong> e <strong>+8</strong> allungano la canzone
              (fino a {MAX_SONG_BARS} battute), <strong>−4</strong> toglie le ultime quattro. In <strong>Song</strong> suona la
              canzone dall&apos;inizio; in <strong>Pattern</strong> solo il pattern che stai modificando, in loop.
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
          <section className="hw-panel hw-mixer" data-panel="mixer" aria-label="Mixer">
            <h2 className="hw-title">Mixer</h2>
            <div className="hw-strips">
              {CHANNELS.map(({ id: c, label }) => (
                <div key={c} className="hw-strip">
                  <span className="hw-meter" data-hit={hitNow(c) && !project.mixer[c].muted} aria-hidden="true" />
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
                  <button
                    type="button"
                    className="hw-btn hw-btn--small hw-btn--mute"
                    aria-pressed={project.mixer[c].muted}
                    aria-label={`Mute ${label}`}
                    onClick={() => setChannel(c, { muted: !project.mixer[c].muted })}
                  >
                    <span className="hw-btn-led" />M
                  </button>
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
                  <span className="hw-strip-name">{label}</span>
                </div>
              ))}
              <div className="hw-strip hw-strip--master">
                <span className="hw-label">Master</span>
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
              </div>
            </div>
          </section>

          {/* ---- piano roll: basso o melodia ---- */}
          <section className="hw-panel hw-roll-panel" data-panel="roll" aria-label={`Piano roll · ${ROLLS[roll].label}`}>
            <div className="hw-seq-head">
              <h2 className="hw-title">
                Piano roll · {ROLLS[roll].label} · Pattern {editing}
              </h2>
              <div className="hw-patterns" role="group" aria-label="Strumento nel piano roll">
                {(Object.keys(ROLLS) as RollId[]).map((r) => (
                  <button key={r} type="button" className="hw-btn hw-btn--small" aria-pressed={roll === r} onClick={() => setRoll(r)}>
                    <span className="hw-btn-led" />
                    {ROLLS[r].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="daw-roll" data-roll={roll}>
              {ROLLS[roll].rows.map((note) => (
                <div key={note} className="daw-roll-row" data-sharp={isSharp(note)}>
                  <button type="button" className="daw-key" onClick={() => void engine().preview(roll, { note })}>
                    {noteName(note)}
                  </button>
                  {Array.from({ length: STEPS }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      className="daw-cell"
                      aria-pressed={pat[roll][i] === note}
                      aria-label={`${noteName(note)} step ${i + 1}`}
                      data-now={i === step && playingSlot === editing}
                      data-beat={i % 4 === 0}
                      onClick={() => setNote(roll, i, note)}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="hw-synths">
              {roll === "bass" ? (
                  <div className="hw-strip hw-strip--synth">
                    <span className="hw-label">Bass synth</span>
                    <div className="hw-seg">
                      {(["sawtooth", "square"] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          className="hw-btn hw-btn--small"
                          aria-pressed={project.bassSound.wave === w}
                          onClick={() =>
                            update((p) => {
                              p.bassSound.wave = w;
                            })
                          }
                        >
                          <span className="hw-btn-led" />
                          {w === "sawtooth" ? "Saw" : "Sqr"}
                        </button>
                      ))}
                    </div>
                    <Knob
                      label="Cutoff"
                      value={project.bassSound.cutoff}
                      min={150}
                      max={4000}
                      step={10}
                      defaultValue={700}
                      display={`${Math.round(project.bassSound.cutoff)} Hz`}
                      onChange={(v) =>
                        update((p) => {
                          p.bassSound.cutoff = v;
                        })
                      }
                    />
                    <button
                      type="button"
                      className="hw-btn hw-btn--small"
                      aria-pressed={project.bassSound.length === "lunga"}
                      onClick={() =>
                        update((p) => {
                          p.bassSound.length = p.bassSound.length === "lunga" ? "corta" : "lunga";
                        })
                      }
                    >
                      <span className="hw-btn-led" />
                      808 long
                    </button>
                  </div>
              ) : (
                  <div className="hw-strip hw-strip--synth hw-strip--chords hw-strip--lead">
                    <span className="hw-label">Lead synth</span>
                    <div className="hw-seg">
                      {LEAD_WAVES.map((w) => (
                        <button
                          key={w}
                          type="button"
                          className="hw-btn hw-btn--small"
                          aria-pressed={project.leadSound.wave === w}
                          onClick={() =>
                            update((p) => {
                              p.leadSound.wave = w;
                            })
                          }
                        >
                          <span className="hw-btn-led" />
                          {WAVE_LABEL[w]}
                        </button>
                      ))}
                    </div>
                    <Knob
                        label="Cutoff"
                        value={project.leadSound.cutoff}
                        min={300}
                        max={9000}
                        step={10}
                        defaultValue={2600}
                        display={`${Math.round(project.leadSound.cutoff)} Hz`}
                        onChange={(v) =>
                          update((p) => {
                            p.leadSound.cutoff = v;
                          })
                        }
                      />
                    <button
                      type="button"
                      className="hw-btn hw-btn--small"
                      aria-pressed={project.leadSound.length === "lunga"}
                      onClick={() =>
                        update((p) => {
                          p.leadSound.length = p.leadSound.length === "lunga" ? "corta" : "lunga";
                        })
                      }
                    >
                      <span className="hw-btn-led" />
                      Legato
                    </button>
                  </div>
              )}
            </div>
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
        </aside>
      </div>
    </div>
  );
}
