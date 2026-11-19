// Export: il file MIDI, lo zip degli stem e il Mix WAV, letti byte per byte come farebbe FL Studio.
import { expect, test } from "@playwright/test";
import { apri, errori, scarica, wav } from "./aiuto";

test.setTimeout(180_000);

test("MIDI, stem e mix si scaricano e sono file validi", async ({ page }) => {
  const err = errori(page);
  await apri(page, "export");

  const midi = await scarica(page, "MIDI");
  expect(midi.nome).toBe("Prova export - pattern A.mid");
  expect(midi.dati.toString("ascii", 0, 4)).toBe("MThd");
  expect(midi.dati.readUInt16BE(8)).toBe(1); // tipo 1
  expect(midi.dati.readUInt16BE(10)).toBe(6); // conductor + Bass, Lead, Chords, Lead 2, Drums
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
    expect(w.peak, `${nomi.at(-1)} non è muto`).toBeGreaterThan(0.005);
    i += 30 + len + size;
  }
  expect(nomi).toEqual(["01 Kick.wav", "02 Clap.wav", "03 Hi-hat.wav", "04 Tom.wav", "05 Shaker.wav", "06 Bass.wav", "07 Chords.wav", "08 Lead.wav", "09 Lead 2.wav"]);

  const mix = await scarica(page, "Mix WAV");
  expect(mix.nome).toBe("Prova export - pattern A.wav");
  expect(wav(mix.dati)).toMatchObject({ ch: 2, rate: 44100, bits: 24 });

  await page.locator(".hw-export > .hw-btn").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".hw-export-menu")).toHaveCount(0);
  expect(err).toEqual([]);
});
