// Tastiera MIDI (finta: il browser dei test non ha MIDI vero).
import { expect, test } from "@playwright/test";
import { apri, errori, noteRoll, rigaBeat, vista } from "./aiuto";

test("collegamento, batteria con la sua forza, nota portata nell'estensione del Roll", async ({ page }) => {
  const err = errori(page);
  await page.addInitScript(() => {
    const input = { name: "Tastiera di prova", state: "connected", onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([["1", input]]), onstatechange: null };
    Object.defineProperty(navigator, "requestMIDIAccess", { value: async () => access });
    (window as unknown as { __midi: (b: number[]) => void }).__midi = (bytes) =>
      input.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp: performance.now() });
  });
  await apri(page, "empty");
  const midi = page.locator(".hw-midi");
  await expect(midi).toHaveAttribute("aria-pressed", "false");
  await midi.click();
  await expect(midi).toHaveText(/MIDI 1/);
  await expect(midi).toHaveAttribute("title", /Tastiera di prova/);

  const suona = (b: number[]) => page.evaluate((x) => (window as unknown as { __midi: (b: number[]) => void }).__midi(x), b);
  await page.locator(".hw-keys-recrow button", { hasText: "1234" }).click(); // senza count-in
  await page.locator(".hw-transport .hw-btn--rec").click();
  await page.waitForTimeout(200);
  await suona([0x90, 36, 127]); // kick
  await page.waitForTimeout(40);
  await suona([0x80, 36, 0]);
  await page.waitForTimeout(300);
  await suona([0x99, 42, 50]); // hat chiuso sul canale 10
  await page.waitForTimeout(300);
  await page.locator(".hw-transport button", { hasText: "Stop" }).click();
  await page.locator(".hw-transport .hw-btn--rec").click();
  // dove cadono dipende dal tempo; conta che ci sia un colpo per riga, con la forza giusta
  expect((await rigaBeat(page, "kick")).replace(/\./g, "")).toBe("x");
  expect((await rigaBeat(page, "hat")).replace(/\./g, "")).toBe("x");
  await page.getByRole("button", { name: "Vel", exact: true }).click();
  const forza = (d: string) => page.locator(`[data-panel="beat"] [data-row="${d}"] .hw-vel`).evaluateAll((els) => els.map((e) => (e as HTMLElement).style.height));
  expect(await forza("kick")).toEqual(["100%"]);
  expect(await forza("hat")).toEqual(["40%"]);
  await page.getByRole("button", { name: /Vel/ }).first().click();

  await vista(page, "Roll");
  await page.getByRole("group", { name: "Strumento nel piano roll" }).getByRole("button", { name: "Lead", exact: true }).click();
  await page.locator(".hw-transport .hw-btn--rec").click();
  await page.waitForTimeout(200);
  await suona([0x90, 96, 80]); // Do7: fuori estensione
  await page.waitForTimeout(150);
  await suona([0x80, 96, 0]);
  await page.waitForTimeout(150);
  await page.locator(".hw-transport button", { hasText: "Stop" }).click();
  const note = await noteRoll(page);
  expect(note).toHaveLength(1);
  expect(note[0]).toMatch(/^Do6@/);
  await expect(page.locator(".hw-keys-last")).toHaveText("Do6");
  expect(err).toEqual([]);
});
