// Gli strumenti che il coach usa per scrivere nello studio: un pattern (A–P), la canzone, effetti e automazioni.
// Claude manda step da 1 a 16 e note MIDI; qui diventa un Project valido (normalize scarta il resto).
// Il coach può chiamarli più volte nella stessa risposta: ogni chiamata parte dal risultato della precedente.
import type Anthropic from "@anthropic-ai/sdk";
import { KIT_IDS } from "./kits";
import { defaultSlot, INSERT_SLOTS, isPluginType, normalizeSlot, pluginParams, PLUGIN_TYPES, PLUGINS } from "./plugins";
import {
  AUTO_TARGETS,
  CHANNEL_IDS,
  BASS_HIGH,
  BASS_LOW,
  BEATS,
  CHORD_TYPES,
  DRUMS,
  SLOTS,
  MAX_SONG_BARS,
  MIN_SONG_BARS,
  songSize,
  STEPS,
  isSlot,
  LEAD_HIGH,
  LEAD_LOW,
  LEAD_WAVES,
  normalize,
  type Pattern,
  type Project,
  type Slot,
} from "./project";

const stepList = (label: string) => ({
  type: "array",
  description: `Step (1–16) in cui suona ${label}. Lista vuota = non suona.`,
  items: { type: "integer", minimum: 1, maximum: STEPS },
});

const PATTERN_TOOL: Anthropic.Beta.BetaTool = {
  name: "scrivi_pattern",
  description:
    "Scrive un pattern (una battuta da 16 step: batteria e bassline) in uno dei 16 slot (da A a P) dello studio, sostituendo quello che c'era. Può anche cambiare BPM, swing, sidechain e suono del basso, che valgono per tutta la traccia. I volumi del mixer restano. Usalo quando il producer ti chiede di creare, generare o riscrivere un beat. Prima di chiamarlo spiega in poche frasi cosa costruisci e perché.",
  input_schema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Titolo breve di quello che scrivi, es. 'Trap half-time' o 'Drop'." },
      slot: { type: "string", enum: [...SLOTS], description: "Dove scriverlo. Se non lo dici, nel pattern che il producer sta modificando." },
      bpm: { type: "number", minimum: 60, maximum: 200 },
      swing: { type: "number", minimum: 0, maximum: 0.5, description: "0 = dritto, 0.1–0.2 = groove house." },
      sidechain: { type: "boolean", description: "Il kick abbassa il basso." },
      kick: stepList("il kick"),
      clap: stepList("il clap (o snare)"),
      hat: stepList("l'hi-hat chiuso"),
      openhat: stepList("l'open hat"),
      perc: stepList("la perc"),
      basso: {
        type: "array",
        description: `Note della bassline: una per step. MIDI da ${BASS_LOW} (La1) a ${BASS_HIGH} (La2): 33 La, 34 La#, 35 Si, 36 Do, 37 Do#, 38 Re, 39 Re#, 40 Mi, 41 Fa, 42 Fa#, 43 Sol, 44 Sol#, 45 La.`,
        items: {
          type: "object",
          properties: {
            step: { type: "integer", minimum: 1, maximum: STEPS },
            nota: { type: "integer", minimum: BASS_LOW, maximum: BASS_HIGH },
          },
          required: ["step", "nota"],
        },
      },
      kit: {
        type: "string",
        enum: [...KIT_IDS],
        description:
          "Kit di batteria (vale per tutto il progetto): house = kick rotondo, clap largo, conga; 909 = kick secco, hat brillanti, rim (tech house, techno); 808 = kick lungo e morbido, cowbell; trap = 808 profondo e lungo, rullante con corpo, hat secchi.",
      },
      onda: { type: "string", enum: ["sawtooth", "square"], description: "Timbro del basso." },
      filtro: { type: "number", minimum: 150, maximum: 4000, description: "Cutoff del basso in Hz: basso = scuro e caldo." },
      durata: {
        type: "string",
        enum: ["corta", "lunga"],
        description: "corta = note staccate (house); lunga = ogni nota tiene fino alla successiva, come un 808 (trap).",
      },
      accordi: {
        type: "array",
        description:
          "Accordi del pattern, sui battiti 1–4. Più accordi con lo stesso battito suonano insieme (sovrapposti, massimo 3), per esempio La m7 grave e Do maggiore sopra. radice: 0 Do, 1 Do#, 2 Re, 3 Re#, 4 Mi, 5 Fa, 6 Fa#, 7 Sol, 8 Sol#, 9 La, 10 La#, 11 Si. Un battito senza accordo continua quello prima (pad). Lista vuota = niente accordi.",
        items: {
          type: "object",
          properties: {
            battito: { type: "integer", minimum: 1, maximum: BEATS },
            radice: { type: "integer", minimum: 0, maximum: 11 },
            tipo: { type: "string", enum: [...CHORD_TYPES] },
          },
          required: ["battito", "radice", "tipo"],
        },
      },
      stile_accordi: {
        type: "string",
        enum: ["pad", "stab"],
        description: "pad = tappeto lungo (deep house); stab = colpo corto sul battito (house, tech house).",
      },
      filtro_accordi: { type: "number", minimum: 300, maximum: 8000, description: "Cutoff degli accordi in Hz: basso = morbido." },
      melodia: {
        type: "array",
        description: `La melodia (lead), polifonica: più voci con lo stesso step suonano insieme (un accordo, al massimo 6 note), una sola voce = melodia. MIDI da ${LEAD_LOW} (Do4) a ${LEAD_HIGH} (Do6): 60 Do4, 62 Re4, 64 Mi4, 65 Fa4, 67 Sol4, 69 La4, 71 Si4, 72 Do5, 74 Re5, 76 Mi5, 77 Fa5, 79 Sol5, 81 La5, 83 Si5, 84 Do6 (i diesis sono il numero in mezzo). Lista vuota = niente melodia.`,
        items: {
          type: "object",
          properties: {
            step: { type: "integer", minimum: 1, maximum: STEPS },
            nota: { type: "integer", minimum: LEAD_LOW, maximum: LEAD_HIGH },
          },
          required: ["step", "nota"],
        },
      },
      onda_lead: { type: "string", enum: [...LEAD_WAVES], description: "sawtooth = pieno, square = vuoto/8 bit, triangle = morbido." },
      filtro_lead: { type: "number", minimum: 300, maximum: 9000 },
      durata_lead: { type: "string", enum: ["corta", "lunga"], description: "corta = note staccate; lunga = legate." },

    },
    required: ["nome", "kick", "clap", "hat", "basso"],
  },
  eager_input_streaming: true,
};

const SONG_TOOL: Anthropic.Beta.BetaTool = {
  name: "scrivi_canzone",
  description: `Scrive l'arrangiamento: quale pattern (da A a P) suona in ogni battuta della canzone, in ordine. "-" = battuta vuota (silenzio). La canzone è lunga quanto la lista che mandi (da ${MIN_SONG_BARS} fino a ${MAX_SONG_BARS} battute) e sostituisce quella di prima. Usalo quando il producer ti chiede una traccia intera, una struttura o un arrangiamento (intro, groove, break, drop), insieme a scrivi_pattern per i pattern che servono.`,
  input_schema: {
    type: "object",
    properties: {
      battute: {
        type: "array",
        description: `Una voce per battuta, fino a ${MAX_SONG_BARS}, es. ["A","A","A","A","B","B","B","B","C","C","D","D"]. Sotto le ${MIN_SONG_BARS} battute la fila si completa con battute vuote.`,
        items: { type: "string", enum: [...SLOTS, "-"] },
        maxItems: MAX_SONG_BARS,
      },
      nome: { type: "string", description: "Nome breve della struttura, es. 'Intro, groove, break, drop'." },
    },
    required: ["battute"],
  },
  eager_input_streaming: true,
};

const FX_TOOL: Anthropic.Beta.BetaTool = {
  name: "scrivi_effetti",
  description:
    "Imposta volume ed effetti dei canali (volume del fader, filtro DJ, riverbero, delay a 3/16), i plugin negli insert (per esempio un chorus sul lead) e scrive le automazioni del filtro nella canzone (per esempio il build: il filtro del master che si apre nelle battute prima del drop). Gli effetti valgono per tutta la traccia; le automazioni suonano in modalità Song e nell'export. Prima di chiamarlo spiega cosa fai e perché.",
  input_schema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Titolo breve, es. 'Build prima del drop'." },
      effetti: {
        type: "array",
        description: "Effetti da cambiare. Solo i canali e i valori che vuoi cambiare.",
        items: {
          type: "object",
          properties: {
            canale: { type: "string", enum: ["master", ...CHANNEL_IDS] },
            volume: { type: "number", minimum: 0, maximum: 1, description: "Fader del canale (0–1). Il master non ce l'ha." },
            filtro: {
              type: "number",
              minimum: -1,
              maximum: 1,
              description: "Filtro DJ: 0 spento; negativo = passa-basso (-0.5 ≈ 2 kHz, -0.8 ≈ 500 Hz, -1 = 200 Hz); positivo = passa-alto (0.5 ≈ 200 Hz, 0.8 ≈ 1,2 kHz, 1 = 4 kHz).",
            },
            riverbero: { type: "number", minimum: 0, maximum: 1, description: "Send al riverbero. Il master non ce l'ha." },
            delay: { type: "number", minimum: 0, maximum: 1, description: "Send al delay a 3/16. Il master non ce l'ha." },
          },
          required: ["canale"],
        },
      },
      automazioni: {
        type: "array",
        description:
          "Automazioni del filtro. Ogni bersaglio riceve i punti (battuta 1–16 della canzone, valore -1…1 come il filtro): tra due punti il valore scorre gradualmente; prima del primo punto vale la manopola Filter del bersaglio (di solito 0, aperto); dopo l'ultimo resta fermo sull'ultimo valore, quindi per riaprire il filtro dopo un build metti un punto a 0. Una corsia scritta sostituisce quella che c'era; punti vuoti = cancella la corsia.",
        items: {
          type: "object",
          properties: {
            bersaglio: { type: "string", enum: [...AUTO_TARGETS] },
            punti: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  battuta: { type: "integer", minimum: 1, maximum: MAX_SONG_BARS },
                  valore: { type: "number", minimum: -1, maximum: 1 },
                },
                required: ["battuta", "valore"],
              },
            },
          },
          required: ["bersaglio", "punti"],
        },
      },
      plugin: {
        type: "array",
        description: `Plugin negli insert (come gli slot del mixer di FL), ${INSERT_SLOTS} slot per canale e per il master, in fila dal primo all'ultimo. tipo "nessuno" svuota lo slot. Plugin disponibili: ${PLUGIN_TYPES.map((t) => `${t} (${PLUGINS[t].hint}; manopole: ${pluginParams(t).map((q) => `${q.id} ${q.min}–${q.max}`).join(", ")})`).join("; ")}.`,
        items: {
          type: "object",
          properties: {
            bersaglio: { type: "string", enum: [...AUTO_TARGETS] },
            slot: { type: "integer", minimum: 1, maximum: INSERT_SLOTS },
            tipo: { type: "string", enum: [...PLUGIN_TYPES, "nessuno"] },
            acceso: { type: "boolean", description: "false = in bypass (resta nello slot ma non suona)." },
            manopole: { type: "object", description: "Le manopole del plugin, per nome (quelle che mancano restano al valore di base)." },
          },
          required: ["bersaglio", "slot", "tipo"],
        },
      },
    },
    required: ["nome"],
  },
  eager_input_streaming: true,
};

export const STUDIO_TOOLS = [PATTERN_TOOL, SONG_TOOL, FX_TOOL];

type PatternInput = Partial<Record<"kick" | "clap" | "hat" | "openhat" | "perc", unknown>> & {
  nome?: unknown;
  slot?: unknown;
  bpm?: unknown;
  swing?: unknown;
  sidechain?: unknown;
  basso?: unknown;
  kit?: unknown;
  onda?: unknown;
  filtro?: unknown;
  durata?: unknown;
  accordi?: unknown;
  melodia?: unknown;
  onda_lead?: unknown;
  filtro_lead?: unknown;
  durata_lead?: unknown;

  stile_accordi?: unknown;
  filtro_accordi?: unknown;
};

const steps = (v: unknown) => {
  const on = Array(STEPS).fill(false);
  if (Array.isArray(v)) for (const s of v) if (Number.isInteger(s) && s >= 1 && s <= STEPS) on[s - 1] = true;
  return on;
};

const label = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 60) : d);

// Un "registro" delle modifiche del coach: parte dal progetto attuale e applica ogni chiamata in ordine.
export function createStudioWriter(current: Project, editing: Slot) {
  let project = current;
  const names: string[] = [];
  let focus: Slot = editing; // il pattern da mostrare dopo: l'ultimo scritto
  let songWritten = false;

  function run(name: string, raw: unknown): string | null {
    const i = (raw && typeof raw === "object" ? raw : {}) as PatternInput & { battute?: unknown };
    if (name === "scrivi_pattern") {
      const slot: Slot = isSlot(i.slot) ? i.slot : editing;
      // note per step (normalize poi scarta quelle fuori dall'estensione dello strumento)
      // il lead: tutte le note con lo stesso step suonano insieme (normalize ne tiene al massimo 6)
      const poly = (list: unknown) => {
        const out: number[][] = Array.from({ length: STEPS }, () => []);
        if (Array.isArray(list)) {
          for (const n of list as { step?: unknown; nota?: unknown }[]) {
            if (Number.isInteger(n?.step) && Number.isInteger(n?.nota) && (n.step as number) >= 1 && (n.step as number) <= STEPS) {
              out[(n.step as number) - 1].push(n.nota as number);
            }
          }
        }
        return out;
      };
      const line = (list: unknown) => {
        const out: (number | null)[] = Array(STEPS).fill(null);
        if (Array.isArray(list)) {
          for (const n of list as { step?: unknown; nota?: unknown }[]) {
            if (Number.isInteger(n?.step) && Number.isInteger(n?.nota) && (n.step as number) >= 1 && (n.step as number) <= STEPS) {
              out[(n.step as number) - 1] = n.nota as number;
            }
          }
        }
        return out;
      };
      const bass = line(i.basso);
      // più accordi con lo stesso battito si sovrappongono (normalize ne tiene al massimo 3)
      const chords: unknown[][] = Array.from({ length: BEATS }, () => []);
      if (Array.isArray(i.accordi)) {
        for (const c of i.accordi as { battito?: unknown; radice?: unknown; tipo?: unknown }[]) {
          if (Number.isInteger(c?.battito) && (c.battito as number) >= 1 && (c.battito as number) <= BEATS) {
            chords[(c.battito as number) - 1].push({ root: c.radice, type: c.tipo });
          }
        }
      }
      const pattern: Pattern = {
        drums: Object.fromEntries(DRUMS.map(({ id }) => [id, steps(i[id])])) as Pattern["drums"],
        bass,
        chords: chords as Pattern["chords"], // normalize scarta radici e tipi non validi
        lead: poly(i.melodia),
      };
      project = normalize({
        ...project,
        bpm: i.bpm ?? project.bpm,
        swing: i.swing ?? project.swing,
        sidechain: typeof i.sidechain === "boolean" ? i.sidechain : project.sidechain,
        kit: i.kit ?? project.kit, // normalize scarta i kit che non esistono
        patterns: { ...project.patterns, [slot]: pattern },
        bassSound: {
          wave: i.onda ?? project.bassSound.wave,
          cutoff: i.filtro ?? project.bassSound.cutoff,
          length: i.durata ?? project.bassSound.length,
        },
        chordSound: {
          style: i.stile_accordi ?? project.chordSound.style,
          cutoff: i.filtro_accordi ?? project.chordSound.cutoff,
        },
        leadSound: {
          wave: i.onda_lead ?? project.leadSound.wave,
          cutoff: i.filtro_lead ?? project.leadSound.cutoff,
          length: i.durata_lead ?? project.leadSound.length,
        },
      });
      focus = slot;
      const n = `${slot}: ${label(i.nome, "pattern")}`;
      names.push(n);
      return `Pattern ${n} scritto nello studio`;
    }
    if (name === "scrivi_effetti") {
      const raw = i as { effetti?: unknown; automazioni?: unknown; plugin?: unknown; nome?: unknown };
      const fx = structuredClone(project.fx);
      const mixer = structuredClone(project.mixer);
      let masterFilter = project.masterFilter;
      const automation = { ...project.automation };
      if (Array.isArray(raw.effetti)) {
        for (const e of raw.effetti as { canale?: unknown; volume?: unknown; filtro?: unknown; riverbero?: unknown; delay?: unknown }[]) {
          const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
          if (e?.canale === "master") {
            masterFilter = num(e.filtro) ?? masterFilter;
          } else if (CHANNEL_IDS.includes(e?.canale as (typeof CHANNEL_IDS)[number])) {
            const c = e.canale as (typeof CHANNEL_IDS)[number];
            mixer[c] = { ...mixer[c], volume: num(e.volume) ?? mixer[c].volume };
            fx[c] = {
              filter: num(e.filtro) ?? fx[c].filter,
              reverb: num(e.riverbero) ?? fx[c].reverb,
              delay: num(e.delay) ?? fx[c].delay,
            };
          }
        }
      }
      let lanes = 0;
      // un punto oltre la fine della canzone la allunga (fino al massimo), invece di andare perso
      let size = project.song.length;
      if (Array.isArray(raw.automazioni)) {
        for (const a of raw.automazioni as { punti?: unknown }[]) {
          if (!Array.isArray(a?.punti)) continue;
          for (const pt of a.punti as { battuta?: unknown }[]) {
            if (Number.isInteger(pt?.battuta)) size = Math.max(size, songSize(pt.battuta as number));
          }
        }
        for (const a of raw.automazioni as { bersaglio?: unknown; punti?: unknown }[]) {
          if (!AUTO_TARGETS.includes(a?.bersaglio as (typeof AUTO_TARGETS)[number])) continue;
          const lane: (number | null)[] = Array(size).fill(null);
          if (Array.isArray(a.punti)) {
            for (const pt of a.punti as { battuta?: unknown; valore?: unknown }[]) {
              const b = pt?.battuta;
              if (Number.isInteger(b) && (b as number) >= 1 && (b as number) <= size && typeof pt.valore === "number") {
                lane[(b as number) - 1] = pt.valore;
              }
            }
          }
          automation[a.bersaglio as (typeof AUTO_TARGETS)[number]] = lane; // normalize toglie le corsie vuote
          lanes++;
        }
      }
      const song = Array.from({ length: size }, (_, k) => project.song[k] ?? null);
      // plugin: lo slot scelto diventa quel plugin (con le manopole date) o si svuota
      const inserts = structuredClone(project.inserts);
      let plugins = 0;
      if (Array.isArray(raw.plugin)) {
        for (const pl of raw.plugin as { bersaglio?: unknown; slot?: unknown; tipo?: unknown; acceso?: unknown; manopole?: unknown }[]) {
          const t = pl?.bersaglio as (typeof AUTO_TARGETS)[number];
          const k = Number(pl?.slot) - 1;
          if (!AUTO_TARGETS.includes(t) || !Number.isInteger(k) || k < 0 || k >= INSERT_SLOTS) continue;
          inserts[t][k] = isPluginType(pl.tipo)
            ? normalizeSlot({ type: pl.tipo, on: pl.acceso !== false, params: { ...defaultSlot(pl.tipo).params, ...(pl.manopole as object) } })
            : null;
          plugins++;
        }
      }
      project = normalize({ ...project, song, fx, mixer, masterFilter, automation, inserts });
      names.push(label(raw.nome, "effetti"));
      return `Effetti scritti${lanes ? ` (${lanes} automazion${lanes === 1 ? "e" : "i"})` : ""}${plugins ? ` (${plugins} plugin)` : ""}: ${label(raw.nome, "effetti")}`;
    }
    if (name === "scrivi_canzone" && Array.isArray(i.battute)) {
      const list = i.battute as unknown[];
      const song = Array.from({ length: songSize(list.length) }, (_, k) => (isSlot(list[k]) ? (list[k] as Slot) : null));
      project = normalize({ ...project, song });
      songWritten = true;
      names.push(label(i.nome, "arrangiamento"));
      return `Canzone scritta (${project.song.length} battute): ${project.song.map((s) => s ?? "-").join(" ")}`;
    }
    return null;
  }

  return {
    run,
    changed: () => names.length > 0,
    result: () => ({ project, name: names.join(" · "), focus, song: songWritten }),
  };
}
