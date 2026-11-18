// Export: il file MIDI, lo zip degli stem e il Mix WAV, letti byte per byte come farebbe FL Studio.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { apri, errori } from "./aiuto";

test.setTimeout(180_000);

async function scarica(page: Page, voce: string) {
  await page.locator(".hw-export > .hw-btn").click();
  const arriva = page.waitForEvent("download", { timeout: 120_000 });
  await page.locator(".hw-export-menu button", { hasText: voce }).click();
  const d = await arriva;
  return { nome: d.suggestedFilename(), dati: await readFile((await d.path())!) };
}

// l'intestazione di un WAV: canali, bit, frequenza, durata
function wav(b: Buffer) {
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WAVE");
  let i = 12;
  let fmt = { ch: 0, rate: 0, bits: 0 };
  while (i < b.length - 8) {
    const id = b.toString("ascii", i, i + 4);
    const size = b.readUInt32LE(i + 4);
    if (id === "fmt ") fmt = { ch: b.readUInt16LE(i + 10), rate: b.readUInt32LE(i + 12), bits: b.readUInt16LE(i + 22) };
    if (id === "data") return { ...fmt, sec: size / (fmt.rate * fmt.ch * (fmt.bits / 8)) };
    i += 8 + size;
  }
  throw new Error("WAV senza dati");
}

test("MIDI, stem e mix si scaricano e sono file validi", async ({ page }) => {
  const err = errori(page);
  await apri(page, "export");

  const midi = await scarica(page, "MIDI");
  expect(midi.nome).toBe("Prova export - pattern A.mid");
  expect(midi.dati.toString("ascii", 0, 4)).toBe("MThd");
  expect(midi.dati.readUInt16BE(8)).toBe(1); // tipo 1
  expect(midi.dati.readUInt16BE(10)).toBe(5); // conductor + Bass, Lead, Chords, Drums
  expect(midi.dati.readUInt16BE(12)).toBe(96);

  const stem = await scarica(page, "Stem");
  expect(stem.nome).toBe("Prova export - pattern A - stem.zip");
  const z = stem.dati;
  const nomi: string[] = [];
  for (let i = 0; z.readUInt32LE(i) === 0x04034b50; ) {
    const size = z.readUInt32LE(i + 18);
    const len = z.readUInt16LE(i + 26);
    nomi.push(z.toString("utf8", i + 30, i + 30 + len));
    const w = wav(z.subarray(i + 30 + len, i + 30 + len + size));
    expect(w).toMatchObject({ ch: 2, rate: 44100, bits: 24 });
    expect(w.sec).toBeCloseTo(10.55, 1); // 4 giri di una battuta a 120 BPM + la coda
    i += 30 + len + size;
  }
  expect(nomi).toEqual(["01 Kick.wav", "02 Clap.wav", "03 Hi-hat.wav", "04 Bass.wav", "05 Chords.wav", "06 Lead.wav"]);

  const mix = await scarica(page, "Mix WAV");
  expect(mix.nome).toBe("Prova export - pattern A.wav");
  expect(wav(mix.dati)).toMatchObject({ ch: 2, rate: 44100, bits: 24 });

  await page.locator(".hw-export > .hw-btn").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".hw-export-menu")).toHaveCount(0);
  expect(err).toEqual([]);
});
