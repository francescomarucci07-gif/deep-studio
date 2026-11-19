// Mixer: bus come in FL, plugin sugli insert, automazioni del volume, il pulsante FX nel Roll.
import { expect, test } from "@playwright/test";
import { apri, errori, scorre, vista } from "./aiuto";

test("bus: nuovo bus, rinomina, due canali dentro, plugin sul bus, poi lo tolgo", async ({ page }) => {
  const err = errori(page);
  await apri(page);
  await vista(page, "Mixer");
  const nomi = () => page.locator(".hw-strip--bus .hw-bus-name").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(await nomi()).toEqual(["Drums"]);
  await expect(page.locator(".hw-strip--bus .hw-bus-in").first()).toHaveText("Kick · Clap · Hi-hat · Open hat · Perc · Tom · Shaker");

  await page.locator("#out-lead").selectOption({ label: "+ Nuovo bus" });
  expect(await nomi()).toEqual(["Drums", "Bus 2"]);
  await expect(page.locator("#out-lead")).toHaveValue("bus2");
  await page.locator("#bus-bus2").fill("Synth");
  await page.locator("#out-chords").selectOption({ label: "→ Synth" });
  await expect(page.locator(".hw-strip--bus").nth(1).locator(".hw-bus-in")).toHaveText("Chords · Lead");

  const fx = page.getByRole("button", { name: "Plugin del bus Synth" });
  await fx.click();
  await expect(page.locator(".hw-rack .hw-title")).toHaveText(/bus synth/i);
  await page.locator("#slot-0").selectOption("reverb");
  await expect(fx).toHaveText("FX 1");

  await page.getByRole("button", { name: "Togli il bus Synth" }).click();
  expect(await nomi()).toEqual(["Drums"]);
  await expect(page.locator("#out-lead")).toHaveValue("master");
  expect(err).toEqual([]);
});

test("FX accanto al synth nel Roll apre gli insert di quello strumento", async ({ page }) => {
  const err = errori(page);
  await apri(page);
  await vista(page, "Roll");
  const roll = page.locator('[data-panel="roll"]');
  await roll.getByRole("group", { name: "Strumento nel piano roll" }).getByRole("button", { name: "Lead", exact: true }).click();
  const fx = roll.locator(".hw-synth-title .hw-fx-btn");
  await fx.click();
  await expect(page.locator(".console-stage")).toHaveAttribute("data-view", "mixer");
  await expect(page.locator(".hw-rack .hw-title")).toHaveText(/lead/i);
  await expect(page.locator(".hw-rack")).toBeInViewport();
  await page.locator("#slot-0").selectOption("chorus");
  await vista(page, "Roll");
  await expect(fx).toHaveText("FX 1");
  expect(err).toEqual([]);
});

test("automazioni del volume: bersagli, valori da 0 a 1, ritorno al filtro", async ({ page }) => {
  const err = errori(page);
  await apri(page);
  await vista(page, "Auto");
  const pannello = page.locator('[data-panel="auto"]');
  await pannello.locator(".hw-btn", { hasText: "Volume" }).click();
  await expect(pannello.locator(".hw-title")).toHaveText(/volume/i);
  expect(await page.locator("#auto-target option").allInnerTexts()).toEqual(
    ["Master", "Kick", "Clap", "Hi-hat", "Open hat", "Perc", "Tom", "Shaker", "Bass", "Chords", "Lead", "Bus Drums"],
  );
  await page.locator("#auto-target").selectOption("lead");
  const f = (b: number) => page.locator(".hw-auto-fader").nth(b);
  await expect(f(0)).toHaveAttribute("min", "0");
  await expect(f(0)).toHaveAttribute("max", "1");
  await f(0).fill("0");
  await f(3).fill("0.8");
  const punti = await page.locator(".hw-auto-bar .hw-value").evaluateAll((els) => els.slice(0, 5).map((e) => e.textContent));
  expect(punti).toEqual(["0%", "·", "·", "80%", "·"]);
  expect((await page.locator("#auto-target option").allInnerTexts()).find((t) => t.includes("Lead"))).toBe("● Lead");
  await pannello.locator(".hw-btn", { hasText: "Filtro" }).click();
  await expect(pannello.locator(".hw-title")).toHaveText(/filtro/i);
  await expect(f(0)).toHaveAttribute("min", "-1");
  expect(await scorre(page, ".console-stage")).toBe(0);
  expect(err).toEqual([]);
});
