// Il parere in tempo reale: suona un mix sbagliato apposta e lo studio avvisa; un mix normale no.
import { expect, test } from "@playwright/test";
import { apri, errori } from "./aiuto";

test("kick e basso che si pestano: avviso, Chiedi al coach, Non dirmelo più", async ({ page }) => {
  const err = errori(page);
  let mandato: Record<string, unknown> | null = null;
  await apri(page, "pesto");
  await page.route("**/api/coach/**", (r) => {
    mandato = r.request().postDataJSON();
    return r.fulfill({ status: 200, contentType: "text/plain", body: "Accendi il sidechain." });
  });
  await page.keyboard.press("Space");
  const avviso = page.locator(".ds-ascolto");
  await expect(avviso).toContainText("Kick e basso si pestano", { timeout: 15_000 });
  await avviso.getByRole("button", { name: "Chiedi al coach" }).click();
  await expect(avviso).toHaveCount(0);
  await expect(page.locator(".console-coach")).toContainText("kick e basso si pestano");
  await expect.poll(() => mandato).not.toBeNull();
  expect(mandato).toMatchObject({ ascolto: { avviso: "kick_basso" } });
  expect(typeof (mandato as unknown as { ascolto: { kickLow: number } }).ascolto.kickLow).toBe("number");
  await page.keyboard.press("Space");

  // "Non dirmelo più" resta anche dopo una ricarica
  await page.reload({ waitUntil: "networkidle" });
  await page.keyboard.press("Space");
  await expect(avviso).toBeVisible({ timeout: 15_000 });
  await avviso.getByRole("button", { name: "Non dirmelo più" }).click();
  expect(await page.evaluate(() => localStorage.getItem("ds-ascolto-no"))).toBe('["kick_basso"]');
  await page.keyboard.press("Space");
  expect(err).toEqual([]);
});

test("un mix normale suona 7 secondi senza avvisi", async ({ page }) => {
  await apri(page, "user");
  await page.keyboard.press("Space");
  await page.waitForTimeout(7000);
  await expect(page.locator(".ds-ascolto")).toHaveCount(0);
  await page.keyboard.press("Space");
});
