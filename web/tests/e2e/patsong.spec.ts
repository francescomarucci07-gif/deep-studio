// Pattern/Song in alto (come in FL) e l'ordine delle viste sul telefono.
import { expect, test } from "@playwright/test";
import { apri, errori, vista } from "./aiuto";

test("il selettore Pat/Song in alto cambia modalità da qualunque vista e va d'accordo con quello della Song", async ({ page }) => {
  const err = errori(page);
  await apri(page);
  const sel = page.locator(".hw-pat-song");
  await expect(sel).toHaveAttribute("data-mode", "pat");
  await sel.click(); // dal Beat
  await expect(sel).toHaveAttribute("data-mode", "song");
  await expect(page.locator(".hw-lcd-small")).toContainText("SONG");
  await vista(page, "Song");
  const modalita = page.getByRole("group", { name: "Modalità" });
  await expect(modalita.getByRole("button", { name: "Song" })).toHaveAttribute("aria-pressed", "true");
  await modalita.getByRole("button", { name: "Pattern" }).click();
  await expect(sel).toHaveAttribute("data-mode", "pat");
  await vista(page, "Mixer");
  await sel.click(); // anche dal Mixer
  await expect(page.locator(".hw-lcd-small")).toContainText("SONG");
  expect(err).toEqual([]);
});

test("sul telefono le viste sono in ordine: Beat, Roll, Song, Mixer, Auto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await apri(page);
  const ordine = await page.locator(".console-stage > [data-panel]").evaluateAll((els) => els.map((e) => e.getAttribute("data-panel")));
  expect(ordine).toEqual(["beat", "roll", "song", "mixer", "auto"]);
});
