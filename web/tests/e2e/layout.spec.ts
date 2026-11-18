// L'impaginazione: la barra in alto su una riga, niente scorrimento laterale, le pagine dello studio che ci stanno.
import { expect, test } from "@playwright/test";
import { apri, scorre, vista } from "./aiuto";

const misure = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const btns = [...document.querySelectorAll(".hw-transport button")].map((x) => Math.round(x.getBoundingClientRect().top));
    return { righe: new Set(btns).size, laterale: document.documentElement.scrollWidth - innerWidth };
  });

for (const [w, h, righe] of [[1920, 950, 1], [1366, 650, 1], [1093, 600, 1], [820, 1180, 2], [390, 844, 3]] as const) {
  test(`barra in alto a ${w}x${h}: ${righe} riga/e, niente scorrimento laterale`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await apri(page, "user");
    expect(await misure(page)).toEqual({ righe, laterale: 0 });
  });
}

for (const [w, h] of [[1366, 650], [1920, 950]] as const) {
  test(`a ${w}x${h} Beat, Song e Auto ci stanno senza scorrere; coach e pad mai`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await apri(page, "user");
    for (const v of ["Beat", "Song", "Auto"] as const) {
      await vista(page, v);
      expect(await scorre(page, ".console-stage"), v).toBe(0);
      expect(await scorre(page, ".console-coach"), v).toBe(0);
      expect(await scorre(page, ".console-side"), v).toBe(0);
    }
  });
}
