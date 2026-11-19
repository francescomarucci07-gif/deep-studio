// Aiuti comuni dei test nel browser: aprire lo studio di prova senza rete e leggere lo stato della griglia.
import type { Page } from "@playwright/test";

export type Progetto = "starter" | "empty" | "user" | "export" | "tour" | "segnala" | "pesto";

// apre lo studio con un progetto; il database e il coach rispondono finti, il tour è già visto (tranne con "tour")
export async function apri(page: Page, p: Progetto = "starter") {
  await page.route("**/rest/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.route("**/api/coach/**", (r) => r.fulfill({ status: 200, contentType: "text/plain", body: "Ok, ti spiego." }));
  await page.route("**/api/voce", (r) => r.fulfill({ status: 503, body: "" }));
  if (p !== "tour") await page.addInitScript(() => localStorage.setItem("ds-tour-visto", "1"));
  await page.goto(`/prova-studio?p=${p}`, { waitUntil: "networkidle" });
}

export const vista = (page: Page, nome: "Beat" | "Roll" | "Song" | "Mixer" | "Auto") =>
  page.locator(".hw-view", { hasText: nome }).click();

// una riga del Beat come stringa: x = colpo, . = vuoto
export async function rigaBeat(page: Page, riga: string) {
  const k = page.locator(`[data-panel="beat"] [data-row="${riga}"] .hw-key`);
  return (await k.evaluateAll((els) => els.map((e) => (e.getAttribute("aria-pressed") === "true" ? "x" : ".")))).join("");
}

// tutte le note del Roll: "Do5@1(2)" = Do5 sullo step 1, lunga 2; "*" = selezionata
export async function noteRoll(page: Page) {
  return page.locator('.daw-roll .daw-cell[aria-pressed="true"]').evaluateAll((els) =>
    els.map((e) => {
      const n = e.closest(".daw-roll-row")!.querySelector(".daw-key")!.textContent;
      let len = 1;
      let x = e.nextElementSibling as HTMLElement | null;
      while (x && x.dataset.tail === "true") {
        len++;
        x = x.nextElementSibling as HTMLElement | null;
      }
      return `${n}@${Number((e as HTMLElement).dataset.step) + 1}${len > 1 ? `(${len})` : ""}${(e as HTMLElement).dataset.selected === "true" ? "*" : ""}`;
    }),
  );
}

// la cella del Roll per nota e step (step da 0)
export const cella = (page: Page, nota: string, step: number) =>
  page
    .locator(".daw-roll-row")
    .filter({ has: page.locator(".daw-key", { hasText: new RegExp(`^${nota}$`) }) })
    .locator(`.daw-cell[data-step="${step}"]`);

// quanto scorre una parte dello studio (0 = ci sta tutta)
export const scorre = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const e = document.querySelector(s)!;
    return e.scrollHeight - e.clientHeight;
  }, sel);

// raccoglie gli errori della pagina: alla fine del test devono essere zero
export function errori(page: Page) {
  const list: string[] = [];
  page.on("pageerror", (e) => list.push(e.message));
  return list;
}
