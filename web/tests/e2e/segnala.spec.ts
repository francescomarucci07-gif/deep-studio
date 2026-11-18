// Segnala un problema: cosa parte verso il database e che lo spazio nel testo non fa partire il Play.
import { expect, test } from "@playwright/test";
import { apri, errori, vista } from "./aiuto";

for (const [w, h] of [[1366, 650], [1093, 600], [390, 844]] as const) {
  test(`segnalazione a ${w}x${h}`, async ({ page }) => {
    const err = errori(page);
    await page.setViewportSize({ width: w, height: h });
    let inviata: Record<string, unknown> | null = null;
    await apri(page, "segnala");
    // dopo apri(): questa regola vale prima di quella generica
    await page.route("**/rest/v1/segnalazioni*", (r) => {
      if (r.request().method() !== "POST") return r.fallback();
      inviata = r.request().postDataJSON();
      return r.fulfill({ status: 201, contentType: "application/json", body: "" });
    });
    if (w >= 1000) {
      await vista(page, "Mixer");
      await page.getByRole("button", { name: "Segnala", exact: true }).click();
    } else {
      await page.locator(".ds-report-mobile").scrollIntoViewIfNeeded();
      await page.locator(".ds-report-mobile").click();
    }
    const invia = page.locator(".ds-report").getByRole("button", { name: "Invia" });
    await expect(invia).toBeDisabled();
    await page.locator("#ds-report-text").fill("Nel mixer il fader del bus non si muove");
    await page.keyboard.press("Space");
    await invia.click();
    await expect(page.locator(".ds-report .ds-tour-text")).toContainText("Grazie!");
    expect(inviata).toMatchObject({
      message: "Nel mixer il fader del bus non si muove",
      project_id: "00000000-0000-0000-0000-000000000001",
      view: w >= 1000 ? "mixer" : "beat",
      info: { schermo: `${w}x${h}`, pagina: "/prova-studio" },
    });
    await expect(page.locator(".hw-btn--play")).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Escape");
    await expect(page.locator(".ds-report")).toHaveCount(0);
    expect(err).toEqual([]);
  });
}
