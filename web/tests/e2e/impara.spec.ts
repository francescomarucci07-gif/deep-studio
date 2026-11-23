// Impara: il tour guidato e le lezioni che vanno avanti da sole quando fai il passo.
import { expect, test } from "@playwright/test";
import { apri, errori } from "./aiuto";

for (const [w, h, tappe] of [[1366, 650, 14], [390, 844, 13]] as const) {
  test(`tour a ${w}x${h}: parte da solo, ${tappe} tappe dentro lo schermo, poi non riparte`, async ({ page }) => {
    const err = errori(page);
    await page.setViewportSize({ width: w, height: h });
    await apri(page, "tour");
    const card = page.locator(".ds-tour-card");
    await expect(card).toBeVisible();
    const viste: string[] = [];
    for (let n = 0; n < tappe; n++) {
      await expect(card.locator(".ds-tour-title")).not.toBeEmpty();
      const b = (await card.boundingBox())!;
      expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 1 && b.y + b.height <= h + 1, `tappa ${n + 1} dentro lo schermo`).toBe(true);
      viste.push((await page.locator(".console-stage").getAttribute("data-view"))!);
      await card.locator(".ds-tour-next").click();
    }
    await expect(card).toBeHidden();
    expect(new Set(viste)).toEqual(new Set(["beat", "roll", "song", "mixer", "auto"]));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await expect(card).toBeHidden();
    if (w >= 1000) {
      await page.getByRole("button", { name: "Impara", exact: true }).first().click();
      await page.locator(".ds-learn-list button", { hasText: "Tour dello studio" }).click();
      await expect(card).toBeVisible();
    }
    expect(err).toEqual([]);
  });
}

test("lezione 1: parte da un pattern vuoto e va avanti da sola a ogni passo", async ({ page }) => {
  const err = errori(page);
  await apri(page);
  await page.getByRole("button", { name: "Impara", exact: true }).first().click();
  expect((await page.locator(".ds-learn-list strong").allInnerTexts()).map((t) => t.trim())).toEqual([
    "Tour dello studio",
    "1. Il primo groove",
    "2. La bassline",
    "3. Accordi e melodia",
    "4. Costruisci la canzone",
    "5. Build, drop e mix",
    "6. Il mixer e i bus",
  ]);
  await page.locator(".ds-learn-list button", { hasText: "Il primo groove" }).click();
  const card = page.locator(".ds-lesson");
  const titolo = card.locator(".ds-lesson-title");
  await expect(titolo).toHaveText(/1\/5/);
  await expect(page.locator('[data-panel="beat"] .hw-title')).toHaveText(/pattern B/i);
  await expect(card).toContainText("Ti ho aperto il pattern B, vuoto");

  const k = (d: string, i: number) => page.locator(`[data-panel="beat"] [data-row="${d}"] .hw-key`).nth(i);
  for (const i of [0, 4, 8, 12]) await k("kick", i).click();
  await expect(titolo).toHaveText(/2\/5/);
  for (const i of [4, 12]) await k("clap", i).click();
  await expect(titolo).toHaveText(/3\/5/);
  for (const i of [2, 6, 10, 14]) await k("hat", i).click();
  await expect(titolo).toHaveText(/4\/5/);
  await page.keyboard.press("Space");
  await expect(titolo).toHaveText(/5\/5/);
  await page.keyboard.press("Space");

  await card.getByRole("button", { name: "Suggerimento" }).click();
  await expect(card.locator(".ds-lesson-hint")).toContainText("Swing");
  await card.getByRole("button", { name: "Salta" }).click();
  await expect(card).toContainText("Lezione finita!");
  await card.getByRole("button", { name: "Chiudi" }).click();

  await page.getByRole("button", { name: "Impara", exact: true }).first().click();
  await expect(page.locator(".ds-learn-list strong").nth(1)).toContainText("✓ fatta");
  await page.locator(".ds-learn-list button", { hasText: "La bassline" }).click();
  await expect(page.locator(".console-stage")).toHaveAttribute("data-view", "roll");
  await expect(page.locator('[data-panel="roll"] .hw-title')).toHaveText(/bass/i);
  await card.getByRole("button", { name: "Chiedi al coach" }).click();
  await expect(page.locator(".console-coach")).toContainText('Sono alla lezione "La bassline"');
  await titolo.click();
  await expect(card).toHaveAttribute("data-small", "true");
  expect(err).toEqual([]);
});

test("lezione 6, il mixer e i bus: apre il Mixer e va avanti con il mute del bus Drums durante il Play", async ({ page }) => {
  const err = errori(page);
  await apri(page);
  await page.getByRole("button", { name: "Impara", exact: true }).first().click();
  await page.locator(".ds-learn-list button", { hasText: "Il mixer e i bus" }).click();
  const titolo = page.locator(".ds-lesson .ds-lesson-title");
  await expect(titolo).toHaveText(/1\/6/);
  await expect(page.locator(".console-stage")).toHaveAttribute("data-view", "mixer");
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Mute del bus Drums" }).click();
  await expect(titolo).toHaveText(/2\/6/);
  await page.getByRole("button", { name: "Mute del bus Drums" }).click();
  await page.getByLabel("Volume del bus Drums").fill("0.5");
  await expect(titolo).toHaveText(/3\/6/);
  await page.keyboard.press("Space");
  await page.locator(".hw-strip--newbus").click();
  await expect(titolo).toHaveText(/4\/6/);
  expect(err).toEqual([]);
});
