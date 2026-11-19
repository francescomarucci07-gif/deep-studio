// Gli strumenti che il coach usa per scrivere nello studio: un pattern (A–P), la canzone, effetti e automazioni.
// Claude manda step da 1 a 16 e note MIDI; qui diventa un Project valido (normalize scarta il resto).
// Il coach può chiamarli più volte nella stessa risposta: ogni chiamata parte dal risultato della precedente.
import type Anthropic from "@anthropic-ai/sdk";
import { KIT_IDS, KITS } from "./kits";
import { defaultSlot, INSERT_SLOTS, isPluginType, normalizeSlot, pluginParams, PLUGIN_TYPES, PLUGINS } from "./plugins";
import {
  AUTO_TARGETS,
  BUS_IDS,
  BUS_UNITY,
  MIX_TARGETS,
  isBus,
  type MixTarget,
  type Out,
  CHANNEL_IDS,
  BASS_HIGH,
  BASS_LOW,
  BEATS,
  CHORD_TYPES,
  DRUMS,
  type DrumId,
  SLOTS,
  MAX_SONG_BARS,
  MIN_SONG_BARS,
  songSize,
  STEPS,
  isSlot,
  LEAD_HIGH,
  LEAD_LOW,
  LEAD_WAVES,
  LEAD_SOUNDS,
  BASS_WAVES,
  CHORD_STYLES,
  normalize,
  soundOf,
  lenKey,
  type Pattern,
  type Project,
  type Slot,
} from "./project";

const stepList = (label: string) => ({
  type: "array",
  description: `Step (1–16) in cui suona ${label}. Lista vuota = non suona.`,
  items: { type: "integer", minimum: 1, maximum: STEPS * 4 },
});

// la lunghezza di una nota, in step (come nel piano roll): resta dentro la battuta e non copre la nota dopo
const LEN_FIELD = {
  type: "integer",
  minimum: 1,
  maximum: STEPS * 4,
  description: "Quanti step dura la nota (1 = uno step, 4 = un quarto, 16 = la battuta). Senza = uno step (con Legato/808 long tiene fino alla nota dopo).",
};

const PATTERN_TOOL: Anthropic.Beta.BetaTool = {
  name: "scrivi_pattern",
  description:
    "Scrive un pattern (una battuta da 16 step: batteria e bassline) in uno dei 16 slot (da A a P) dello studio, sostituendo quello che c'era. Può anche cambiare BPM, swing, sidechain e kit, che valgono per tutta la traccia, e i suoni di basso, accordi, lead e lead 2: di base valgono per tutti i pattern senza un suono proprio; con suoni_solo_qui = true diventano il suono proprio di questo pattern. I volumi del mixer restano. Usalo quando il producer ti chiede di creare, generare o riscrivere un beat. Prima di chiamarlo spiega in poche frasi cosa costruisci e perché.",
  input_schema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Titolo breve di quello che scrivi, es. 'Trap half-time' o 'Drop'." },
      lunghezza_battute: {
        type: "integer",
        enum: [1, 2, 4],
        description:
          "Quante battute è lungo il pattern (default 1). Con 2 o 4 gli step vanno da 1 a 32 o 64 (step 17 = primo della seconda battuta) e i battiti degli accordi da 1 a 8 o 16. Nella canzone un pattern lungo occupa 2 o 4 battute di fila: scrivilo in tante battute consecutive quante sono le sue. Usalo per melodie e bassline che rispondono (domanda e risposta), o per variazioni a fine giro.",
      },
      slot: { type: "string", enum: [...SLOTS], description: "Dove scriverlo. Se non lo dici, nel pattern che il producer sta modificando." },
      bpm: { type: "number", minimum: 60, maximum: 200 },
      swing: { type: "number", minimum: 0, maximum: 0.5, description: "0 = dritto, 0.1–0.2 = groove house." },
      sidechain: { type: "boolean", description: "Il kick abbassa il basso." },
      kick: stepList("il kick"),
      clap: stepList("il clap (o snare)"),
      hat: stepList("l'hi-hat chiuso"),
      openhat: stepList("l'open hat"),
      perc: stepList("la perc (conga, rim o cowbell secondo il kit)"),
      tom: stepList("il tom (fill prima del drop, groove tribali)"),
      shaker: stepList("lo shaker (sedicesimi leggeri che danno movimento)"),
      basso: {
        type: "array",
        description: `Note della bassline: una per step. MIDI da ${BASS_LOW} (La1) a ${BASS_HIGH} (La2): 33 La, 34 La#, 35 Si, 36 Do, 37 Do#, 38 Re, 39 Re#, 40 Mi, 41 Fa, 42 Fa#, 43 Sol, 44 Sol#, 45 La.`,
        items: {
          type: "object",
          properties: {
            step: { type: "integer", minimum: 1, maximum: STEPS * 4 },
            nota: { type: "integer", minimum: BASS_LOW, maximum: BASS_HIGH },
            lunghezza: LEN_FIELD,
          },
          required: ["step", "nota"],
        },
      },
      kit: {
        type: "string",
        enum: [...KIT_IDS],
        description: `Kit di batteria (vale per tutto il progetto): ${KIT_IDS.map((k) => `${k} = ${KITS[k].hint}`).join("; ")}.`,
      },
      onda: {
        type: "string",
        enum: Object.keys(BASS_WAVES),
        description: `Suono del basso: ${Object.entries(BASS_WAVES).map(([k, v]) => `${k} = ${v.hint}`).join("; ")}.`,
      },
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
            battito: { type: "integer", minimum: 1, maximum: BEATS * 4 },
            radice: { type: "integer", minimum: 0, maximum: 11 },
            tipo: { type: "string", enum: [...CHORD_TYPES] },
          },
          required: ["battito", "radice", "tipo"],
        },
      },
      stile_accordi: {
        type: "string",
        enum: Object.keys(CHORD_STYLES),
        description: `Suono degli accordi: ${Object.entries(CHORD_STYLES).map(([k, v]) => `${k} = ${v.hint}`).join("; ")}.`,
      },
      filtro_accordi: { type: "number", minimum: 300, maximum: 8000, description: "Cutoff degli accordi in Hz: basso = morbido." },
      melodia: {
        type: "array",
        description: `La melodia (lead), polifonica: più voci con lo stesso step suonano insieme (un accordo, al massimo 6 note), una sola voce = melodia. MIDI da ${LEAD_LOW} (Do4) a ${LEAD_HIGH} (Do6): 60 Do4, 62 Re4, 64 Mi4, 65 Fa4, 67 Sol4, 69 La4, 71 Si4, 72 Do5, 74 Re5, 76 Mi5, 77 Fa5, 79 Sol5, 81 La5, 83 Si5, 84 Do6 (i diesis sono il numero in mezzo). Lista vuota = niente melodia.`,
        items: {
          type: "object",
          properties: {
            step: { type: "integer", minimum: 1, maximum: STEPS * 4 },
            nota: { type: "integer", minimum: LEAD_LOW, maximum: LEAD_HIGH },
            lunghezza: LEN_FIELD,
          },
          required: ["step", "nota"],
        },
      },
      onda_lead: {
        type: "string",
        enum: [...LEAD_WAVES],
        description: `Suono del lead: ${Object.entries(LEAD_SOUNDS).map(([k, v]) => `${k} = ${v.hint}`).join("; ")}.`,
      },
      filtro_lead: { type: "number", minimum: 300, maximum: 9000 },
      durata_lead: { type: "string", enum: ["corta", "lunga"], description: "corta = note staccate; lunga = legate." },
      melodia_2: {
        type: "array",
        description:
          "Il Lead 2: un secondo synth come il lead, con canale e suono suoi. Usalo per una contromelodia, un arpeggio o un pluck sopra (o sotto) la melodia principale, o per raddoppiare il lead con un altro timbro. Stesse regole e note di melodia. Lista vuota = niente.",
        items: {
          type: "object",
          properties: {
            step: { type: "integer", minimum: 1, maximum: STEPS * 4 },
            nota: { type: "integer", minimum: LEAD_LOW, maximum: LEAD_HIGH },
            lunghezza: LEN_FIELD,
          },
          required: ["step", "nota"],
        },
      },
      onda_lead2: { type: "string", enum: [...LEAD_WAVES], description: "Suono del Lead 2 (stessi suoni del lead; di base pluck)." },
      filtro_lead2: { type: "number", minimum: 300, maximum: 9000 },
      durata_lead2: { type: "string", enum: ["corta", "lunga"] },
      velocity: {
        type: "array",
        description:
          "La forza (velocity) di colpi e note, come lo step sequencer di FL: 0.8 = normale (il default, non serve scriverlo), 1 = accento, 0.4–0.6 = colpo leggero (per esempio gli hat in levare per il groove). riga: lo strumento della batteria, oppure basso, melodia o melodia_2 (tutte le note dello step) o accordi (step = battito 1–4). Vale solo dove c'è un colpo o una nota.",
        items: {
          type: "object",
          properties: {
            riga: { type: "string", enum: [...DRUMS.map((d) => d.id), "basso", "melodia", "melodia_2", "accordi"] },
            step: { type: "integer", minimum: 1, maximum: STEPS * 4 },
            valore: { type: "number", minimum: 0.1, maximum: 1 },
          },
          required: ["riga", "step", "valore"],
        },
      },
      suoni_solo_qui: {
        type: "boolean",
        description:
          "true = onda/filtro/durata, stile_accordi/filtro_accordi e onda_lead/filtro_lead/durata_lead (e quelli del lead 2) che mandi diventano il suono proprio di questo pattern (per esempio un lead diverso solo nel drop); gli altri pattern non cambiano. false o assente = cambiano il suono di base, che vale nei pattern senza suono proprio. Un pattern che ha già un suono proprio lo tiene quando lo riscrivi.",
      },

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
    "Imposta volume ed effetti dei canali (volume del fader, filtro DJ, riverbero, delay a 3/16), il routing nei bus (gruppi del mixer, come in FL), i plugin negli insert (per esempio un chorus sul lead) e scrive le automazioni del filtro e del volume nella canzone (per esempio il build: il filtro del master che si apre nelle battute prima del drop). Gli effetti valgono per tutta la traccia; le automazioni suonano in modalità Song e nell'export. Prima di chiamarlo spiega cosa fai e perché.",
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
            parametro: {
              type: "string",
              enum: ["filtro", "volume"],
              description:
                "filtro (default; valori -1…1, bersagli master e canali) o volume (valori 0–1 come il fader; bersagli master, canali e bus bus1…bus4; per il master 1 = normale, per un bus 0.8 = invariato). Il volume serve per fade-in, fade-out e per far entrare uno strumento piano piano.",
            },
            bersaglio: { type: "string", enum: [...MIX_TARGETS] },
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
      bus: {
        type: "array",
        description: `Routing nei bus, come il mixer di FL: un bus è una traccia di gruppo (per esempio tutta la batteria in "Drums") con fader e plugin suoi, che poi va al master. Ci sono ${BUS_IDS.length} bus (${BUS_IDS.join(", ")}). Per ogni bus: il nome, il volume (fader 0–1, ${BUS_UNITY} = volume invariato) e i canali che ci entrano; un canale non elencato non cambia uscita. Per rimandare un canale al master usa il bus "master" con quel canale.`,
        items: {
          type: "object",
          properties: {
            bus: { type: "string", enum: [...BUS_IDS, "master"] },
            nome: { type: "string", description: "Nome del bus nel mixer, es. 'Drums' o 'Synth' (max 16 caratteri)." },
            volume: { type: "number", minimum: 0, maximum: 1 },
            canali: { type: "array", items: { type: "string", enum: [...CHANNEL_IDS] } },
          },
          required: ["bus"],
        },
      },
      plugin: {
        type: "array",
        description: `Plugin negli insert (come gli slot del mixer di FL), ${INSERT_SLOTS} slot per canale, per bus e per il master, in fila dal primo all'ultimo. tipo "nessuno" svuota lo slot. Plugin disponibili: ${PLUGIN_TYPES.map((t) => `${t} (${PLUGINS[t].hint}; manopole: ${pluginParams(t).map((q) => `${q.id} ${q.min}–${q.max}`).join(", ")})`).join("; ")}.`,
        items: {
          type: "object",
          properties: {
            bersaglio: { type: "string", enum: [...MIX_TARGETS] },
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

type PatternInput = Partial<Record<DrumId, unknown>> & {
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
  melodia_2?: unknown;
  onda_lead2?: unknown;
  filtro_lead2?: unknown;
  durata_lead2?: unknown;

  stile_accordi?: unknown;
  filtro_accordi?: unknown;
  suoni_solo_qui?: unknown;
};

const steps = (v: unknown, n = STEPS) => {
  const on = Array(n).fill(false);
  if (Array.isArray(v)) for (const s of v) if (Number.isInteger(s) && s >= 1 && s <= n) on[s - 1] = true;
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
      // pattern lunghi: 1, 2 o 4 battute
      const lb = (i as { lunghezza_battute?: unknown }).lunghezza_battute;
      const nb = lb === 2 || lb === 4 ? lb : 1;
      const N = STEPS * nb;
      // note per step (normalize poi scarta quelle fuori dall'estensione dello strumento)
      // il lead: tutte le note con lo stesso step suonano insieme (normalize ne tiene al massimo 6)
      const poly = (list: unknown) => {
        const out: number[][] = Array.from({ length: N }, () => []);
        if (Array.isArray(list)) {
          for (const n of list as { step?: unknown; nota?: unknown }[]) {
            if (Number.isInteger(n?.step) && Number.isInteger(n?.nota) && (n.step as number) >= 1 && (n.step as number) <= N) {
              out[(n.step as number) - 1].push(n.nota as number);
            }
          }
        }
        return out;
      };
      const line = (list: unknown) => {
        const out: (number | null)[] = Array(N).fill(null);
        if (Array.isArray(list)) {
          for (const n of list as { step?: unknown; nota?: unknown }[]) {
            if (Number.isInteger(n?.step) && Number.isInteger(n?.nota) && (n.step as number) >= 1 && (n.step as number) <= N) {
              out[(n.step as number) - 1] = n.nota as number;
            }
          }
        }
        return out;
      };
      const bass = line(i.basso);
      // più accordi con lo stesso battito si sovrappongono (normalize ne tiene al massimo 3)
      const chords: unknown[][] = Array.from({ length: BEATS * nb }, () => []);
      if (Array.isArray(i.accordi)) {
        for (const c of i.accordi as { battito?: unknown; radice?: unknown; tipo?: unknown }[]) {
          if (Number.isInteger(c?.battito) && (c.battito as number) >= 1 && (c.battito as number) <= BEATS * nb) {
            chords[(c.battito as number) - 1].push({ root: c.radice, type: c.tipo });
          }
        }
      }
      // i suoni: nel pattern (suoni_solo_qui) o in quelli di base; normalize scarta i valori non validi
      const old = project.patterns[slot];
      const here = i.suoni_solo_qui === true;
      const given = {
        bass: i.onda !== undefined || i.filtro !== undefined || i.durata !== undefined,
        chords: i.stile_accordi !== undefined || i.filtro_accordi !== undefined,
        lead: i.onda_lead !== undefined || i.filtro_lead !== undefined || i.durata_lead !== undefined,
        lead2: i.onda_lead2 !== undefined || i.filtro_lead2 !== undefined || i.durata_lead2 !== undefined,
      };
      const cur = {
        bass: here ? soundOf(project, old, "bass") : project.bassSound,
        chords: here ? soundOf(project, old, "chords") : project.chordSound,
        lead: here ? soundOf(project, old, "lead") : project.leadSound,
        lead2: here ? soundOf(project, old, "lead2") : project.lead2Sound,
      };
      const next = {
        bass: { wave: i.onda ?? cur.bass.wave, cutoff: i.filtro ?? cur.bass.cutoff, length: i.durata ?? cur.bass.length },
        chords: { style: i.stile_accordi ?? cur.chords.style, cutoff: i.filtro_accordi ?? cur.chords.cutoff },
        lead: { wave: i.onda_lead ?? cur.lead.wave, cutoff: i.filtro_lead ?? cur.lead.cutoff, length: i.durata_lead ?? cur.lead.length },
        lead2: { wave: i.onda_lead2 ?? cur.lead2.wave, cutoff: i.filtro_lead2 ?? cur.lead2.cutoff, length: i.durata_lead2 ?? cur.lead2.length },
      };
      const sounds = { ...old.sounds };
      if (here) for (const k of ["bass", "chords", "lead", "lead2"] as const) if (given[k]) Object.assign(sounds, { [k]: next[k] });
      // lunghezze delle note (normalize le tiene dentro la battuta e senza sovrapposizioni)
      const len: Record<string, number> = {};
      for (const [list, r] of [[i.basso, "bass"], [i.melodia, "lead"], [i.melodia_2, "lead2"]] as const) {
        if (!Array.isArray(list)) continue;
        for (const n of list as { step?: unknown; nota?: unknown; lunghezza?: unknown }[]) {
          if (Number.isInteger(n?.step) && Number.isInteger(n?.nota) && typeof n.lunghezza === "number") {
            len[lenKey(r, (n.step as number) - 1, n.nota as number)] = n.lunghezza;
          }
        }
      }
      // velocity (normalize tiene solo quelle dove c'è un colpo o una nota)
      const vel: Record<string, number> = {};
      if (Array.isArray((i as { velocity?: unknown }).velocity)) {
        for (const v of (i as { velocity: { riga?: unknown; step?: unknown; valore?: unknown }[] }).velocity) {
          if (!Number.isInteger(v?.step) || typeof v.valore !== "number") continue;
          const st = (v.step as number) - 1;
          const pre = v.riga === "basso" ? "b" : v.riga === "melodia" ? "l" : v.riga === "melodia_2" ? "m" : v.riga === "accordi" ? "c" : DRUMS.some((d) => d.id === v.riga) ? (v.riga as string) : null;
          if (pre) vel[`${pre}${st}`] = v.valore;
        }
      }
      const pattern: Pattern = {
        vel,
        len,
        ...(nb > 1 ? { bars: nb } : {}),
        drums: Object.fromEntries(DRUMS.map(({ id }) => [id, steps(i[id], N)])) as Pattern["drums"],
        bass,
        chords: chords as Pattern["chords"], // normalize scarta radici e tipi non validi
        lead: poly(i.melodia),
        lead2: poly(i.melodia_2),
        ...(Object.keys(sounds).length ? { sounds: sounds as Pattern["sounds"] } : {}),
      };
      project = normalize({
        ...project,
        bpm: i.bpm ?? project.bpm,
        swing: i.swing ?? project.swing,
        sidechain: typeof i.sidechain === "boolean" ? i.sidechain : project.sidechain,
        kit: i.kit ?? project.kit, // normalize scarta i kit che non esistono
        patterns: { ...project.patterns, [slot]: pattern },
        bassSound: here ? project.bassSound : next.bass,
        chordSound: here ? project.chordSound : next.chords,
        leadSound: here ? project.leadSound : next.lead,
        lead2Sound: here ? project.lead2Sound : next.lead2,
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
      const volAuto = { ...project.volAuto };
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
        for (const a of raw.automazioni as { bersaglio?: unknown; punti?: unknown; parametro?: unknown }[]) {
          const vol = a?.parametro === "volume";
          if (vol ? !MIX_TARGETS.includes(a?.bersaglio as MixTarget) : !AUTO_TARGETS.includes(a?.bersaglio as (typeof AUTO_TARGETS)[number])) continue;
          const lane: (number | null)[] = Array(size).fill(null);
          if (Array.isArray(a.punti)) {
            for (const pt of a.punti as { battuta?: unknown; valore?: unknown }[]) {
              const b = pt?.battuta;
              if (Number.isInteger(b) && (b as number) >= 1 && (b as number) <= size && typeof pt.valore === "number") {
                lane[(b as number) - 1] = pt.valore;
              }
            }
          }
          if (vol) volAuto[a.bersaglio as MixTarget] = lane;
          else automation[a.bersaglio as (typeof AUTO_TARGETS)[number]] = lane; // normalize toglie le corsie vuote
          lanes++;
        }
      }
      const song = Array.from({ length: size }, (_, k) => project.song[k] ?? null);
      // plugin: lo slot scelto diventa quel plugin (con le manopole date) o si svuota
      const inserts = structuredClone(project.inserts);
      let plugins = 0;
      if (Array.isArray(raw.plugin)) {
        for (const pl of raw.plugin as { bersaglio?: unknown; slot?: unknown; tipo?: unknown; acceso?: unknown; manopole?: unknown }[]) {
          const t = pl?.bersaglio as MixTarget;
          const k = Number(pl?.slot) - 1;
          if (!MIX_TARGETS.includes(t) || !Number.isInteger(k) || k < 0 || k >= INSERT_SLOTS) continue;
          inserts[t][k] = isPluginType(pl.tipo)
            ? normalizeSlot({ type: pl.tipo, on: pl.acceso !== false, params: { ...defaultSlot(pl.tipo).params, ...(pl.manopole as object) } })
            : null;
          plugins++;
        }
      }
      // bus: nome, volume e canali che ci entrano (un bus che riceve canali si vede nel mixer)
      const buses = structuredClone(project.buses);
      let routed = 0;
      if (Array.isArray((raw as { bus?: unknown }).bus)) {
        for (const b of (raw as { bus: { bus?: unknown; nome?: unknown; volume?: unknown; canali?: unknown }[] }).bus) {
          const dest = b?.bus;
          if (dest !== "master" && !isBus(dest)) continue;
          if (isBus(dest)) {
            if (typeof b.nome === "string" && b.nome.trim()) buses[dest].name = b.nome.trim().slice(0, 16);
            if (typeof b.volume === "number") buses[dest].volume = b.volume;
            buses[dest].shown = true;
          }
          if (Array.isArray(b.canali)) {
            for (const c of b.canali) {
              if (!CHANNEL_IDS.includes(c as (typeof CHANNEL_IDS)[number])) continue;
              mixer[c as (typeof CHANNEL_IDS)[number]].out = dest as Out;
              routed++;
            }
          }
        }
      }
      project = normalize({ ...project, song, fx, mixer, masterFilter, automation, volAuto, inserts, buses });
      names.push(label(raw.nome, "effetti"));
      return `Effetti scritti${lanes ? ` (${lanes} automazion${lanes === 1 ? "e" : "i"})` : ""}${plugins ? ` (${plugins} plugin)` : ""}${routed ? ` (${routed} canali instradati)` : ""}: ${label(raw.nome, "effetti")}`;
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
