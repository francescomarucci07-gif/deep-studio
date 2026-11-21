// Le azioni sui progetti (pagina Il tuo studio): Rinomina, Duplica, Elimina con conferma.
import { expect, test } from "@playwright/test";
import { apri, errori } from "./aiuto";

test("rinomina, duplica ed elimina mandano al database le richieste giuste", async ({ page }) => {
  const err = errori(page);
  const req: { method: string; url: string; body: unknown }[] = [];
  await apri(page, "progetti");
  await page.route("**/rest/v1/projects*", (r) => {
    const q = r.request();
    req.push({ method: q.method(), url: q.url(), body: q.postDataJSON() });
    if (q.method() === "GET")
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ title: "Groove di prova", bpm: 124, data: { version: 2, bpm: 124 } }) });
    return r.fulfill({ status: 204, body: "" });
  });

  await page.getByRole("button", { name: "Rinomina" }).click();
  await page.getByLabel("Nuovo nome").fill("Groove nuovo");
  await page.getByRole("button", { name: "Salva" }).click();
  await expect(page.getByRole("button", { name: "Rinomina" })).toBeVisible();
  expect(req.find((x) => x.method === "PATCH")).toMatchObject({ body: { title: "Groove nuovo" } });
  expect(req.find((x) => x.method === "PATCH")?.url).toContain("id=eq.00000000-0000-0000-0000-000000000002");

  await page.getByRole("button", { name: "Duplica" }).click();
  await expect.poll(() => req.find((x) => x.method === "POST")?.body).toMatchObject({ title: "Groove di prova (copia)", bpm: 124, data: { version: 2 } });

  // Elimina: con "Annulla" nella conferma non parte niente, con "OK" sì
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Elimina" }).click();
  expect(req.some((x) => x.method === "DELETE")).toBe(false);
  page.once("dialog", (d) => {
    expect(d.message()).toContain('Eliminare "Groove di prova"?');
    void d.accept();
  });
  await page.getByRole("button", { name: "Elimina" }).click();
  await expect.poll(() => req.some((x) => x.method === "DELETE")).toBe(true);
  expect(err).toEqual([]);
});
