// Il Lead 2: una seconda melodia con note, suono e canale suoi.
import { expect, test, type Page } from "@playwright/test";
import { apri, cella, errori, noteRoll, scorre, vista } from "./aiuto";

const scheda = (page: Page, nome: string) =>
  page.getByRole("group", { name: "Strumento nel piano roll" }).getByRole("button", { name: nome, exact: true });

test("note e suono del Lead 2 restano separati da quelli del Lead", async ({ page }) => {
  const err = errori(page);
  await apri(page, "empty");
  await vista(page, "Roll");
  await scheda(page, "Lead 2").click();
  await expect(page.locator('[data-panel="roll"] .hw-title')).toHaveText(/lead 2/i);
  await cella(page, "Sol5", 4).click();
  await cella(page, "Do6", 4).click();
  expect(await noteRoll(page)).toEqual(["Do6@5", "Sol5@5"]);

  // il suono: Bell sul Lead 2, il Lead resta Saw
  const synth = page.locator(".hw-strip--lead");
  await expect(synth).toContainText("Lead 2 synth");
  await expect(synth.getByRole("button", { name: "Pluck", exact: true })).toHaveAttribute("aria-pressed", "true");
  await synth.getByRole("button", { name: "Bell", exact: true }).click();
  await expect(synth.getByRole("button", { name: "Bell", exact: true })).toHaveAttribute("aria-pressed", "true");

  await scheda(page, "Lead").click();
  expect(await noteRoll(page)).toEqual([]);
  await expect(synth).toContainText("Lead synth");
  await expect(synth.getByRole("button", { name: "Saw", exact: true })).toHaveAttribute("aria-pressed", "true");

  // nel Beat: la riga Lead 2 ha il suo step, la riga Lead è vuota
  await vista(page, "Beat");
  const riga = (r: string) =>
    page.locator(`[data-panel="beat"] [data-row="${r}"] .hw-key`).evaluateAll((els) => els.map((e) => (e.getAttribute("data-on") === "true" ? "x" : ".")).join(""));
  expect(await riga("lead2")).toBe("....x...........");
  expect(await riga("lead")).toBe("................");
  // un clic sulla riga porta al Roll del Lead 2
  await page.locator('[data-panel="beat"] [data-row="lead2"] .hw-seq-name').click();
  await expect(page.locator('[data-panel="roll"] .hw-title')).toHaveText(/lead 2/i);

  // il mixer ha il suo canale
  await vista(page, "Mixer");
  await expect(page.getByLabel("Volume Lead 2")).toBeVisible();
  expect(err).toEqual([]);
});

test("a 1366x650 il Beat con 11 righe e la colonna dei pad ci stanno senza scorrere", async ({ page }) => {
  await apri(page, "user");
  expect(await scorre(page, ".console-stage")).toBe(0);
  expect(await scorre(page, ".console-side")).toBe(0);
  // i due pad dei lead stanno affiancati
  const a = (await page.locator('.hw-pad[data-pad="lead"]').boundingBox())!;
  const b = (await page.locator('.hw-pad[data-pad="lead2"]').boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
});
