// Il Beat: velocity, pattern da più battute, la canzone e Annulla/Ripeti.
import { expect, test } from "@playwright/test";
import { apri, errori, rigaBeat, scorre, vista } from "./aiuto";

test("velocity: trascinando sulle barre cambia la forza, il clic non accende step", async ({ page }) => {
  const err = errori(page);
  await apri(page);
  const hat = page.locator('[data-panel="beat"] [data-row="hat"] .hw-key');
  expect(await rigaBeat(page, "hat")).toBe("..x...x...x...x.");
  await page.getByRole("button", { name: "Vel", exact: true }).click();
  const barre = () => page.locator('[data-panel="beat"] [data-row="hat"] .hw-vel').evaluateAll((els) => els.map((e) => (e as HTMLElement).style.height));
  expect(await barre()).toEqual(["80%", "80%", "80%", "80%"]);
  const a = (await hat.nth(2).boundingBox())!;
  const z = (await hat.nth(14).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height * 0.7);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(a.x + a.width / 2 + ((z.x - a.x) * k) / 10, a.y + a.height * 0.7);
  await page.mouse.up();
  expect(await barre()).toEqual(["30%", "30%", "30%", "30%"]);
  await hat.nth(0).click();
  expect(await rigaBeat(page, "hat")).toBe("..x...x...x...x.");
  expect(await scorre(page, ".console-stage")).toBe(0);
  expect(err).toEqual([]);
});

test("pattern da 2 battute: la seconda parte copiata, poi si modifica da sola; la canzone le mette in fila", async ({ page }) => {
  const err = errori(page);
  await apri(page);
  await page.locator('[data-panel="beat"] .hw-bars-len').selectOption("2");
  const schede = page.locator('[data-panel="beat"] .hw-bars-tab');
  await expect(schede).toHaveCount(2);
  await schede.nth(1).click();
  expect(await rigaBeat(page, "kick")).toBe("x...x...x...x...");
  const kick = page.locator('[data-panel="beat"] [data-row="kick"] .hw-key');
  await kick.nth(15).click();
  await kick.nth(14).click();
  expect(await rigaBeat(page, "kick")).toBe("x...x...x...x.xx");
  await schede.nth(0).click();
  expect(await rigaBeat(page, "kick")).toBe("x...x...x...x...");

  await vista(page, "Song");
  const battute = page.locator(".hw-song-bars .hw-bar");
  const canzone = async () => (await battute.evaluateAll((els) => els.slice(0, 10).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, "")))).join(" ");
  expect(await canzone()).toBe("A1 A2 A1 A2 – – – – – –");
  await battute.nth(5).click();
  expect(await canzone()).toBe("A1 A2 A1 A2 – A1 A2 – – –");
  await battute.nth(6).click(); // un clic su A2 toglie tutto il pattern
  expect(await canzone()).toBe("A1 A2 A1 A2 – – – – – –");

  await vista(page, "Roll");
  await expect(page.locator('[data-panel="roll"] .hw-bars-tab')).toHaveCount(2);
  await vista(page, "Beat");
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-panel="beat"] .hw-bars-len').selectOption("1");
  await expect(schede).toHaveCount(0);
  expect(await rigaBeat(page, "kick")).toBe("x...x...x...x...");
  expect(err).toEqual([]);
});

test("Annulla e Ripeti: Ctrl+Z, Ctrl+Y, i pulsanti; nel titolo Ctrl+Z resta del testo", async ({ page }) => {
  const err = errori(page);
  await apri(page, "empty");
  const annulla = page.getByRole("button", { name: "Annulla", exact: true });
  const ripeti = page.getByRole("button", { name: "Ripeti", exact: true });
  await expect(annulla).toBeDisabled();
  const kick = page.locator('[data-panel="beat"] [data-row="kick"] .hw-key');
  for (const i of [1, 2, 3]) {
    await kick.nth(i).click();
    await page.waitForTimeout(500); // oltre 450 ms: tre passi distinti
  }
  expect(await rigaBeat(page, "kick")).toBe(".xxx............");
  await page.locator("body").click({ position: { x: 5, y: 640 } });
  await page.keyboard.press("Control+z");
  expect(await rigaBeat(page, "kick")).toBe(".xx.............");
  await page.keyboard.press("Control+z");
  expect(await rigaBeat(page, "kick")).toBe(".x..............");
  await page.keyboard.press("Control+y");
  expect(await rigaBeat(page, "kick")).toBe(".xx.............");
  await ripeti.click();
  expect(await rigaBeat(page, "kick")).toBe(".xxx............");
  await expect(ripeti).toBeDisabled();

  await vista(page, "Mixer");
  const fader = page.getByLabel("Volume Kick");
  const prima = await fader.inputValue();
  await fader.focus();
  for (let k = 0; k < 10; k++) await page.keyboard.press("ArrowDown");
  expect(await fader.inputValue()).not.toBe(prima);
  await page.waitForTimeout(500);
  await page.keyboard.press("Control+z");
  expect(await fader.inputValue()).toBe(prima); // un fader trascinato = un passo solo

  await page.locator("#titolo").fill("Prova nuova");
  await page.locator("#titolo").press("Control+z");
  await vista(page, "Beat");
  expect(await rigaBeat(page, "kick")).toBe(".xxx............");
  expect(err).toEqual([]);
});
