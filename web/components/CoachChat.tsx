"use client";

import { useEffect, useRef, useState } from "react";

// Chat con il coach: si scrive o si parla (microfono), e il coach può leggere le risposte ad alta voce.
// Voce: Web Speech API del browser (gratis, niente server). Funziona bene in Chrome e Edge; in Safari
// e Firefox il riconoscimento vocale può mancare: resta la tastiera.

type Msg = { role: "user" | "assistant"; content: string };

// Tipi minimi della Web Speech API (non sono ancora nelle librerie DOM di TypeScript)
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*#_`]/g, ""));
  u.lang = "it-IT";
  u.rate = 1.03;
  window.speechSynthesis.speak(u);
}

export function CoachChat({
  versionId,
  initial,
  hasPrevious,
  hasVocals,
}: {
  versionId: string;
  initial: Msg[];
  hasPrevious: boolean;
  hasVocals: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMicSupported(getRecognition() !== null);
    try {
      setReadAloud(localStorage.getItem("ds-coach-voce") === "1");
    } catch {
      // storage non disponibile: resta spento
    }
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  function toggleReadAloud() {
    const next = !readAloud;
    setReadAloud(next);
    if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
    try {
      localStorage.setItem("ds-coach-voce", next ? "1" : "0");
    } catch {
      // niente
    }
  }

  function toggleMic() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = getRecognition();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "it-IT";
    r.interimResults = true;
    r.continuous = false;
    const before = input ? `${input.trim()} ` : "";
    r.onresult = (e) => {
      const said = Array.from(e.results)
        .map((res) => res[0].transcript)
        .join("");
      setInput(before + said);
    };
    r.onerror = (e) => setMicError(e.error === "not-allowed" ? "Permesso del microfono negato dal browser." : null);
    r.onend = () => setListening(false);
    recognition.current = r;
    setMicError(null);
    setListening(true);
    r.start();
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    recognition.current?.stop();
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "" }]);
    let answer = "";
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId, message: question }),
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
          const partial = answer;
          setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: partial }]);
        }
      }
    } catch {
      answer = "Connessione interrotta: riprova.";
    }
    setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: answer }]);
    setBusy(false);
    if (readAloud && answer) speak(answer);
  }

  const suggestions = [
    "Cosa sistemo per primo?",
    "Spiegami il low end di questa traccia",
    ...(hasVocals
      ? ["La voce ha bisogno di autotune? Come lo metto in FL?", "Come rendo la voce più presente e senza S che pungono?"]
      : ["Come aggiungo una voce e la tratto in FL?"]),
    ...(hasPrevious ? ["Cosa è migliorato rispetto alla versione precedente, e perché?"] : []),
  ];

  return (
    <section className="ds-module" aria-label="Coach">
      <div className="ds-row ds-row--between">
        <h2 className="ds-module-title" style={{ margin: 0 }}>
          Coach
        </h2>
        <button type="button" className="ds-pad" aria-pressed={readAloud} onClick={toggleReadAloud}>
          {readAloud ? "Voce: accesa" : "Voce: spenta"}
        </button>
      </div>

      <div className="ds-chat" aria-live="polite">
        {messages.length === 0 && (
          <p className="ds-lead">
            Chiedimi qualunque cosa su questa traccia: cosa cambiare, come farlo in FL Studio, perché funziona. Puoi
            scrivere o parlare.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className="ds-chat-msg" data-role={m.role}>
            <span className="ds-label">{m.role === "user" ? "Tu" : "Coach"}</span>
            <p>{m.content || (busy && i === messages.length - 1 ? "…" : "")}</p>
            {m.role === "assistant" && m.content && !busy && (
              <button type="button" className="ds-link-button" onClick={() => speak(m.content)}>
                Ascolta
              </button>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div className="ds-segmented" style={{ marginTop: "var(--ds-space-4)" }}>
        {suggestions.map((s) => (
          <button key={s} type="button" className="ds-pad" disabled={busy} onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>

      <form
        className="ds-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
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
          placeholder={listening ? "Ti ascolto…" : "Scrivi o premi il microfono e parla"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
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
            {busy ? "Il coach scrive…" : "Invia"}
          </button>
        </div>
      </form>
      {micError && (
        <p className="ds-message" data-tone="error" role="alert">
          {micError}
        </p>
      )}
      <p className="ds-hint">
        Il coach vede solo le misure, non ascolta l’audio. Applica una modifica in FL, esporta e carica la nuova
        versione: ti spiega cosa è cambiato e perché.
      </p>
    </section>
  );
}
