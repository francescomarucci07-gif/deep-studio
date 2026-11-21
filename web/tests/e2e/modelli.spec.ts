// I progetti modello suonano: export della canzone (16 battute) né muto né oltre lo 0 dB.
import { expect, test } from "@playwright/test";
import { TEMPLATES } from "../../lib/daw/templates";
import { apri, errori, scarica, wav } from "./aiuto";

for (const id of ["house", "deep", "tech", "progressive", "afro"] as const) {
  test(`${TEMPLATES[id].label}: la canzone si esporta e suona`, async ({ page }) => {
    test.setTimeout(120_000);
    const err = errori(page);
    await apri(page, `modello-${id}`);
    const p = TEMPLATES[id].make();
    await expect(page.locator('[data-panel="beat"] .hw-title')).toContainText("Pattern A");
    // l'export suona la canzone quando la modalità Song è accesa
    await page.locator(".hw-view", { hasText: "Song" }).click();
    await page.getByRole("group", { name: "Modalità" }).getByRole("button", { name: "Song" }).click();
    const w = wav((await scarica(page, "Mix WAV")).dati);
    const secondi = (16 * 4 * 60) / p.bpm;
    expect(w.sec).toBeGreaterThan(secondi);
    expect(w.sec).toBeLessThan(secondi + 4); // + la coda di riverbero e delay
    expect(w.peak, "non è muto").toBeGreaterThan(0.1);
    expect(w.peak, "il limiter tiene sotto lo 0 dB").toBeLessThan(1);
    expect(err).toEqual([]);
  });
}
