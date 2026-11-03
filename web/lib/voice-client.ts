"use client";

import { plainText } from "@/lib/coach/text";

// Legge una risposta del coach: prima ElevenLabs (via /api/voce), se non c'è la voce del browser.
let current: HTMLAudioElement | null = null;
let elevenAvailable = true; // diventa false al primo 503: niente richieste inutili

export function stopSpeaking() {
  current?.pause();
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
  const clean = plainText(text);
  if (!clean) return;
  if (elevenAvailable && voice !== "browser") {
    try {
      const res = await fetch("/api/voce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, voice }),
      });
      if (res.ok) {
        const audio = new Audio(URL.createObjectURL(await res.blob()));
        current = audio;
        await audio.play();
        return;
      }
      if (res.status === 503) elevenAvailable = false;
    } catch {
      // rete o autoplay bloccato: ripiego sulla voce del browser
    }
  }
  browserSpeak(clean);
}
