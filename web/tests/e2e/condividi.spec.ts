// Link di ascolto: lo studio crea il link (fotografia del progetto) e il lettore la fa suonare fino alla fine.
import { expect, test } from "@playwright/test";
import { apri, errori } from "./aiuto";

test("dallo studio: crea il link, lo mostra, lo aggiorna e lo toglie", async ({ page }) => {
  const err = errori(page);
  const chiamate: { method: string; body: Record<string, unknown> | null }[] = [];
  await apri(page);
  await page.route("**/rest/v1/ascolti*", (r) => {
    const req = r.request();
    chiamate.push({ method: req.method(), body: req.postDataJSON() });
    const row = { codice: "AbC123_xyz-ABCDEFGHIJ12", ascolti: 3, updated_at: "2026-11-20T10:00:00Z" };
    if (req.method() === "GET") return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (req.method() === "DELETE") return r.fulfill({ status: 204, body: "" });
    return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row) });
  });
  await page.locator(".hw-export > .hw-btn").click();
  await page.locator(".hw-export-menu button", { hasText: "Link di ascolto" }).click();
  const dialog = page.getByRole("dialog", { name: "Link di ascolto" });
  await dialog.getByRole("button", { name: "Crea il link" }).click();
  await expect(page.locator("#ds-share-url")).toHaveValue(/\/ascolta\/AbC123_xyz-ABCDEFGHIJ12$/);
  await expect(dialog).toContainText("ascoltata 3 volte");
  const crea = chiamate.find((c) => c.method === "POST");
  expect(crea?.body).toMatchObject({ project_id: "prova", title: "Prova", data: { version: 2, bpm: 122 } });

  await dialog.getByRole("button", { name: "Aggiorna" }).click();
  await expect.poll(() => chiamate.some((c) => c.method === "PATCH")).toBe(true);
  await dialog.getByRole("button", { name: "Togli il link" }).click();
  await expect(dialog.getByRole("button", { name: "Crea il link" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(err).toEqual([]);
});

test("il lettore: Ascolta, avanzamento, contatore e stop da solo a fine canzone", async ({ page }) => {
  test.setTimeout(60_000);
  const err = errori(page);
  let play = 0;
  await apri(page, "ascolta");
  await page.route("**/rest/v1/rpc/ascolto_play", (r) => {
    play++;
    return r.fulfill({ status: 204, body: "" });
  });
  await expect(page.getByRole("heading", { name: "Prova ascolto" })).toBeVisible();
  await expect(page.locator(".ds-lead").first()).toContainText("140 BPM · 4 battute · 0:07");
  await page.getByRole("button", { name: "▶ Ascolta" }).click();
  await expect(page.getByRole("button", { name: "■ Stop" })).toBeVisible();
  await expect(page.locator(".ds-listen-time")).toHaveText(/0:0[2-6] \/ 0:07/, { timeout: 8000 });
  // 4 battute a 140 BPM ≈ 7 secondi: poi si ferma da solo
  await expect(page.getByRole("button", { name: "▶ Ascolta" })).toBeVisible({ timeout: 15_000 });
  expect(play).toBe(1);
  expect(err).toEqual([]);
});
