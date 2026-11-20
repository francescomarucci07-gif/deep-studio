// La scala nel Roll: tonalità, note illuminate, Piega, Trova e accordi della scala.
import { expect, test } from "@playwright/test";
import { apri, errori, vista } from "./aiuto";

test("Trova sceglie La minore, Piega lascia solo 7 note per ottava, gli accordi della scala", async ({ page }) => {
  const err = errori(page);
  await apri(page); // il progetto di partenza: bassline e accordi in La minore
  await vista(page, "Roll");
  await page.getByRole("button", { name: "Trova", exact: true }).click();
  await expect(page.locator("#roll-key")).toHaveValue("9");
  await expect(page.locator("#roll-mode")).toHaveValue("minore");
  await expect(page.locator(".hw-scale-msg")).toHaveText("→ La minore");

  // il basso va da La1 a La2: 13 righe, 8 nella scala (due La), il La è la tonica
  const righe = page.locator('.daw-roll[data-roll="bass"] .daw-roll-row');
  await expect(righe).toHaveCount(13);
  await expect(page.locator('.daw-roll-row[data-scale="root"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Piega" }).click();
  await expect(righe).toHaveCount(8);
  expect(await page.evaluate(() => localStorage.getItem("ds-roll-piega"))).toBe("1");

  // scheda Chord: con Accordi della scala, un clic su Re mette Re m7 (anche se il tipo scelto è un altro)
  await page.getByRole("group", { name: "Strumento nel piano roll" }).getByRole("button", { name: "Chord", exact: true }).click();
  await page.locator("#roll-chord").selectOption("maj");
  await expect(page.getByRole("button", { name: "Accordi della scala" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.daw-roll[data-roll="chords"] .daw-roll-row')).toHaveCount(7); // piegato: 7 fondamentali
  const re = page.locator(".daw-roll-row").filter({ has: page.locator(".daw-key", { hasText: /^Re/ }) }).first();
  await expect(re.locator(".daw-key")).toContainText("m7");
  await re.locator(".daw-cell").nth(1).click();
  await expect(re.locator(".daw-cell").nth(1)).toHaveText("Rem7");

  // senza scala tutto torna come prima
  await page.locator("#roll-key").selectOption("");
  await expect(page.locator('.daw-roll[data-roll="chords"] .daw-roll-row')).toHaveCount(12);
  await expect(page.locator(".daw-roll-row[data-scale]")).toHaveCount(0);
  expect(err).toEqual([]);
});
