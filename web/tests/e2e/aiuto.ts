// Aiuti comuni dei test nel browser: aprire lo studio di prova senza rete e leggere lo stato della griglia.
import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

export type Progetto = "starter" | "empty" | "user" | "export" | "tour" | "segnala" | "pesto" | "send" | "ascolta" | "progetti" | `modello-${string}`;

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

// un export dal menu ⤓ Export: nome del file e byte
export async function scarica(page: Page, voce: string) {
  await page.locator(".hw-export > .hw-btn").click();
  const arriva = page.waitForEvent("download", { timeout: 120_000 });
  await page.locator(".hw-export-menu button", { hasText: voce }).click();
  const d = await arriva;
  return { nome: d.suggestedFilename(), dati: await readFile((await d.path())!) };
}

// l'intestazione di un WAV: canali, bit, frequenza, durata
export function wav(b: Buffer) {
  expect(b.toString("ascii", 0, 4)).toBe("RIFF");
  expect(b.toString("ascii", 8, 12)).toBe("WAVE");
  let i = 12;
  let fmt = { ch: 0, rate: 0, bits: 0 };
  while (i < b.length - 8) {
    const id = b.toString("ascii", i, i + 4);
    const size = b.readUInt32LE(i + 4);
    if (id === "fmt ") fmt = { ch: b.readUInt16LE(i + 10), rate: b.readUInt32LE(i + 12), bits: b.readUInt16LE(i + 22) };
    if (id === "data") {
      // il picco: il campione a 24 bit più forte, da 0 a 1
      let peak = 0;
      for (let k = i + 8; k + 2 < i + 8 + size; k += 3) peak = Math.max(peak, Math.abs(b.readIntLE(k, 3)));
      return { ...fmt, sec: size / (fmt.rate * fmt.ch * (fmt.bits / 8)), peak: peak / 2 ** 23 };
    }
    i += 8 + size;
  }
  throw new Error("WAV senza dati");
}
