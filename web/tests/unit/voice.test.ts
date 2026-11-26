// La voce del coach: una frase alla volta. Se si passa allo step dopo mentre la voce di prima sta ancora arrivando da
// ElevenLabs, quella di prima non deve suonare (prima suonavano tutte e due insieme).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Played = { src: string; paused: boolean };
let played: Played[];
let answers: ((text: string) => void)[];
let aborted: number;

beforeEach(() => {
  vi.resetModules();
  played = [];
  answers = [];
  aborted = 0;
  const spoken: string[] = [];
  vi.stubGlobal("window", { speechSynthesis: { cancel: () => undefined, speak: (u: { text: string }) => spoken.push(u.text), getVoices: () => [] } });
  vi.spyOn(URL, "createObjectURL").mockImplementation((b) => `blob:${(b as unknown as { text: string }).text}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.stubGlobal(
    "Audio",
    class {
      paused = true;
      constructor(public src: string) {}
      async play() {
        this.paused = false;
        played.push(this);
      }
      pause() {
        this.paused = true;
      }
    },
  );
  // ogni richiesta a /api/voce resta in attesa finché il test non la fa arrivare
  vi.stubGlobal("fetch", (_url: string, init: { body: string; signal: AbortSignal }) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        aborted++;
        reject(new DOMException("aborted", "AbortError"));
      });
      answers.push(() => resolve({ ok: true, status: 200, blob: async () => ({ text: JSON.parse(init.body).text }) }));
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("voce del coach", () => {
  it("passo allo step dopo prima che arrivi la voce: suona solo la frase nuova", async () => {
    const { speak } = await import("@/lib/voice-client");
    const a = speak("Step uno", "voce");
    const b = speak("Step due", "voce");
    expect(aborted).toBe(1); // il download della prima frase si interrompe
    answers[1]("");
    await Promise.all([a, b]);
    await tick();
    expect(played.map((p) => p.src)).toEqual(["blob:Step due"]);
  });

  it("la frase nuova ferma quella che sta già suonando", async () => {
    const { speak } = await import("@/lib/voice-client");
    const a = speak("Prima", "voce");
    answers[0]("");
    await a;
    const b = speak("Seconda", "voce");
    answers[1]("");
    await b;
    expect(played.map((p) => [p.src, p.paused])).toEqual([
      ["blob:Prima", true],
      ["blob:Seconda", false],
    ]);
  });

  it("stop mentre la voce sta arrivando: non suona niente, nemmeno la voce del browser", async () => {
    const { speak, stopSpeaking } = await import("@/lib/voice-client");
    const a = speak("Ciao", "voce");
    stopSpeaking();
    await a;
    expect(played).toEqual([]);
  });
});
