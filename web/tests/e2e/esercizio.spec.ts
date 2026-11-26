// Modalità lezione: l'insegnante crea l'esercizio dallo studio, lo studente vede la consegna e la ritrova nel progetto.
import { expect, test } from "@playwright/test";
import { apri, errori } from "./aiuto";

test("insegnante: crea l'esercizio con titolo e consegna, il link e il contatore delle copie", async ({ page }) => {
  const err = errori(page);
  const chiamate: { method: string; body: Record<string, unknown> | null }[] = [];
  await apri(page);
  await page.route("**/rest/v1/esercizi*", (r) => {
    const req = r.request();
    chiamate.push({ method: req.method(), body: req.postDataJSON() });
    const row = { codice: "EsC123_xyz-ABCDEFGHIJ12", title: "Bassline", consegna: "Scrivi il basso", copie: 4, updated_at: "2026-11-26T10:00:00Z" };
    if (req.method() === "GET") return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (req.method() === "DELETE") return r.fulfill({ status: 204, body: "" });
    return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(row) });
  });
  await page.locator(".hw-export > .hw-btn").click();
  await page.locator(".hw-export-menu button", { hasText: "Esercizio" }).click();
  const dialog = page.getByRole("dialog", { name: "Esercizio per gli studenti" });
  await expect(dialog.getByLabel("Titolo")).toHaveValue("Prova");
  await dialog.getByLabel("Titolo").fill("Bassline");
  await dialog.getByLabel("Consegna").fill("Scrivi il basso");
  await dialog.getByRole("button", { name: "Crea l'esercizio" }).click();
  await expect(page.locator("#ds-ex-url")).toHaveValue(/\/esercizio\/EsC123_xyz-ABCDEFGHIJ12$/);
  await expect(dialog).toContainText("Copiato 4 volte");
  // la fotografia porta la consegna dentro il progetto
  const crea = chiamate.find((c) => c.method === "POST");
  expect(crea?.body).toMatchObject({
    project_id: "prova",
    title: "Bassline",
    consegna: "Scrivi il basso",
    data: { version: 2, esercizio: { titolo: "Bassline", consegna: "Scrivi il basso" } },
  });
  await dialog.getByRole("button", { name: "Togli il link" }).click();
  await expect(dialog.getByRole("button", { name: "Crea l'esercizio" })).toBeVisible();
  expect(err).toEqual([]);
});

test("pagina dell'esercizio: consegna, ascolto e Copia nel mio studio (con e senza login)", async ({ page }) => {
  const err = errori(page);
  await apri(page, "esercizio");
  await expect(page.getByRole("heading", { name: "Bassline in levare" })).toBeVisible();
  await expect(page.getByRole("region", { name: "La consegna" })).toContainText("Poi mettila nella canzone");
  await expect(page.getByRole("button", { name: "▶ Ascolta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copia nel mio studio" })).toBeVisible();
  await expect(page.getByText("Serve un account")).toBeVisible();
  // il pulsante manda il form alla copia
  await expect(page.locator('form[action="/esercizio/codicediprova12345678/copia"]')).toHaveAttribute("method", "post");
  await apri(page, "esercizio-loggato");
  await expect(page.getByText("Nasce un progetto tuo")).toBeVisible();
  expect(err).toEqual([]);
});

test("studente: la consegna sta nello studio, si riduce e chiede al coach", async ({ page }) => {
  const err = errori(page);
  await apri(page, "studente");
  const card = page.getByRole("region", { name: "Esercizio: Bassline in levare" });
  await expect(card).toContainText("Scrivi una bassline in levare");
  await card.getByRole("button", { name: "Riduci la consegna" }).click();
  await expect(card).not.toContainText("Scrivi una bassline");
  await card.getByRole("button", { name: /Esercizio · Bassline/ }).click();
  await card.getByRole("button", { name: "Chiedi al coach" }).click();
  await expect(page.locator(".ds-chat-msg").filter({ hasText: "Aiutami con l'esercizio" })).toBeVisible();
  expect(err).toEqual([]);
});
