"use client";

import { useEffect, useRef, useState } from "react";
import { DATA_MARK, plainText } from "@/lib/coach/text";
import { speak, stopSpeaking } from "@/lib/voice-client";
import { DEFAULT_VOICE, VOICES } from "@/lib/voices";

// Chat con il coach: si scrive o si parla (microfono), e il coach risponde anche a voce (ElevenLabs).
// La usano sia la pagina dell'analisi sia lo studio: cambiano solo endpoint e dati inviati.
// Microfono: Web Speech API del browser, bene in Chrome ed Edge; in Safari e Firefox può mancare.

export type Msg = { role: "user" | "assistant"; content: string };

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

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

export function CoachChat({
  endpoint,
  payload,
  initial,
  suggestions,
  intro,
  hint,
  compact = false,
  onData,
}: {
  endpoint: string;
  payload: () => Record<string, unknown>;
  initial: Msg[];
  suggestions: string[];
  intro: string;
  hint?: string;
  compact?: boolean;
  // dati che il coach manda allo studio (un pattern); restituisce la nota da mostrare in chat
  onData?: (data: unknown) => string | void;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  const [micSupported, setMicSupported] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMicSupported(getRecognition() !== null);
    setReadAloud(stored("ds-coach-voce") === "1");
    const v = stored("ds-coach-voce-id");
    if (v && (v === "browser" || VOICES.some((x) => x.id === v))) setVoice(v);
    return stopSpeaking;
  }, []);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function toggleReadAloud() {
    const next = !readAloud;
    setReadAloud(next);
    if (!next) stopSpeaking();
    store("ds-coach-voce", next ? "1" : "0");
  }

  function chooseVoice(v: string) {
    setVoice(v);
    store("ds-coach-voce-id", v);
    void speak("Ciao, sono il tuo coach. Facciamo musica.", v);
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    stopSpeaking();
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "" }]);
    let answer = "";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), message: question }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Il coach non risponde." }));
        answer = err.error ?? "Il coach non risponde.";
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          const partial = answer.split(DATA_MARK)[0];
          setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: partial }]);
        }
      }
    } catch {
      answer = "Connessione interrotta: riprova.";
    }
    const [said, data] = answer.split(DATA_MARK);
    let shown = said;
    if (data && onData) {
      try {
        const note = onData(JSON.parse(data));
        if (note) shown = `${said.trim()}\n\n[${note}]`;
      } catch {
        shown = `${said.trim()}\n\n[Il pattern è arrivato incompleto: chiedimelo di nuovo.]`;
      }
    }
    setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: shown }]);
    setBusy(false);
    if (readAloud && said.trim()) void speak(said, voice);
  }

  function toggleMic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = getRecognition();
    if (!Ctor) return;
    stopSpeaking();
    const r = new Ctor();
    r.lang = "it-IT";
    r.interimResults = true;
    r.continuous = false;
    const before = input ? `${input.trim()} ` : "";
    let said = "";
    r.onresult = (e) => {
      said = Array.from(e.results)
        .map((res) => res[0].transcript)
        .join("");
      setInput(before + said);
    };
    r.onerror = (e) => setMicError(e.error === "not-allowed" ? "Permesso del microfono negato dal browser." : null);
    // quando smetti di parlare la domanda parte da sola, come con un assistente vocale
    r.onend = () => {
      setListening(false);
      if (said.trim()) void send(before + said);
    };
    recognition.current = r;
    setMicError(null);
    setListening(true);
    r.start();
  }

  return (
    <section className="ds-module ds-coach" data-compact={compact} aria-label="Coach">
      <div className="ds-row ds-row--between">
        <h2 className="ds-module-title" style={{ margin: 0 }}>
          Coach
        </h2>
        <div className="ds-row">
          <label className="ds-visually-hidden" htmlFor="coach-voce">
            Voce del coach
          </label>
          <select id="coach-voce" className="ds-select" value={voice} onChange={(e) => chooseVoice(e.target.value)}>
            {VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.hint}
              </option>
            ))}
            <option value="browser">Voce del browser</option>
          </select>
          <button type="button" className="ds-pad ds-pad--small" aria-pressed={readAloud} onClick={toggleReadAloud}>
            <span className="ds-led" data-state={readAloud ? "on" : "off"} aria-hidden="true" />
            Voce
          </button>
        </div>
      </div>

      <div className="ds-chat" ref={log} aria-live="polite">
        {messages.length === 0 && <p className="ds-lead">{intro}</p>}
        {messages.map((m, i) => (
          <div key={i} className="ds-chat-msg" data-role={m.role}>
            <p>{plainText(m.content) || (busy && i === messages.length - 1 ? "…" : "")}</p>
            {m.role === "assistant" && m.content && !(busy && i === messages.length - 1) && (
              <button
                type="button"
                className="ds-link-button"
                onClick={() => speak(m.content.replace(/\[[^\]]*\]\s*$/, ""), voice)}
              >
                Ascolta
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="ds-chips">
        {suggestions.map((s) => (
          <button key={s} type="button" className="ds-chip" disabled={busy} onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="ds-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="coach-input" className="ds-visually-hidden">
          Domanda per il coach
        </label>
        <textarea
          id="coach-input"
          className="ds-input"
          rows={2}
          value={input}
          placeholder={listening ? "Ti ascolto…" : "Chiedi al coach, o premi Parla"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <div className="ds-row">
          {micSupported && (
            <button
              type="button"
              className="ds-pad"
              aria-pressed={listening}
              aria-label={listening ? "Ferma il microfono" : "Parla al coach"}
              onClick={toggleMic}
            >
              <span className="ds-led" data-state={listening ? "error" : "off"} data-blink={listening} aria-hidden="true" />
              {listening ? "Stop" : "Parla"}
            </button>
          )}
          <button type="submit" className="ds-pad ds-pad--primary" disabled={busy || !input.trim()}>
            {busy ? "…" : "Invia"}
          </button>
        </div>
      </form>
      {micError && (
        <p className="ds-message" data-tone="error" role="alert">
          {micError}
        </p>
      )}
      {hint && <p className="ds-hint">{hint}</p>}
    </section>
  );
}
