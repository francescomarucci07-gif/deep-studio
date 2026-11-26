"use client";

import { plainText } from "@/lib/coach/text";

// Legge una risposta del coach: prima ElevenLabs (via /api/voce), se non c'è la voce del browser.
// Una voce alla volta: ogni richiesta ha un numero (turn) e la voce di ElevenLabs arriva dopo un po'. Se nel frattempo
// è partita un'altra frase o qualcuno ha premuto stop, l'audio arrivato tardi non suona (e il download si interrompe).
let current: HTMLAudioElement | null = null;
let pending: AbortController | null = null;
let turn = 0;
let elevenAvailable = true; // diventa false al primo 503: niente richieste inutili

export function stopSpeaking() {
  turn++;
  pending?.abort();
  pending = null;
  if (current) {
    current.pause();
    URL.revokeObjectURL(current.src);
  }
  current = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function browserSpeak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "it-IT";
  // la voce italiana migliore che il sistema offre (quelle "Google" o "Natural" sono le meno robotiche)
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("it"));
  u.voice = voices.find((v) => /natural|google|neural/i.test(v.name)) ?? voices[0] ?? null;
  window.speechSynthesis.speak(u);
}

export async function speak(text: string, voice: string) {
  stopSpeaking();
  const mine = turn;
  const clean = plainText(text);
  if (!clean) return;
  if (elevenAvailable && voice !== "browser") {
    const ctrl = new AbortController();
    pending = ctrl;
    try {
      const res = await fetch("/api/voce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, voice }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const blob = await res.blob();
        if (mine !== turn) return; // nel frattempo è partita un'altra frase (o stop): questa non suona più
        pending = null;
        const audio = new Audio(URL.createObjectURL(blob));
        current = audio;
        await audio.play();
        return;
      }
      if (res.status === 503) elevenAvailable = false;
    } catch {
      if (mine !== turn) return; // interrotta apposta: niente voce di riserva
      // rete o autoplay bloccato: ripiego sulla voce del browser
    }
    if (mine !== turn) return;
    pending = null;
  }
  browserSpeak(clean);
}
