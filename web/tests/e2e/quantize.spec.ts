// Il Roll: quantize sugli ottavi e sui quarti, e la corsia della velocity sotto la griglia.
import { expect, test } from "@playwright/test";
import { apri, cella, errori, noteRoll, vista } from "./aiuto";

test("quantize 1/8 e 1/4 (tutte o solo le selezionate), un passo di Annulla", async ({ page }) => {
  const err = errori(page);
  await apri(page, "empty");
  await vista(page, "Roll");
  await page.getByRole("group", { name: "Strumento nel piano roll" }).getByRole("button", { name: "Lead", exact: true }).click();
  for (const [n, s] of [["Do5", 1], ["Mi5", 3], ["Sol5", 6], ["Do6", 13]] as const) await cella(page, n, s).click();
  expect(await noteRoll(page)).toEqual(["Do6@14", "Sol5@7", "Mi5@4", "Do5@2"]);
  await page.waitForTimeout(500);
  const q = page.getByRole("group", { name: "Quantize" });
  await q.getByRole("button", { name: "1/8" }).click();
  // 1→2, 3→4, 6→6, 13→14 (step contati da 0); le note spostate restano selezionate
  expect(await noteRoll(page)).toEqual(["Do6@15*", "Sol5@7*", "Mi5@5*", "Do5@3*"]);
  await page.keyboard.press("Control+z");
  // (la selezione può restare sulle note che non si erano mosse: conta dove sono le note)
  expect((await noteRoll(page)).map((x) => x.replace("*", ""))).toEqual(["Do6@14", "Sol5@7", "Mi5@4", "Do5@2"]);
  await cella(page, "Fa5", 0).click(); // un clic normale toglie la selezione (e mette una nota)
  await page.keyboard.press("Control+z");
  // solo le selezionate: Shift + trascina su Mi5 e Do5
  const a = (await cella(page, "Mi5", 0).boundingBox())!;
  const b = (await cella(page, "Do5", 4).boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(a.x + 5, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(b.x + 5, b.y + 5, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await q.getByRole("button", { name: "1/4" }).click();
  expect(await noteRoll(page)).toEqual(["Do6@14", "Sol5@7", "Mi5@5*", "Do5@1*"]);
  expect(err).toEqual([]);
});

test("la corsia Vel sotto il Roll: trascinando giù la nota suona più piano", async ({ page }) => {
  const err = errori(page);
  await apri(page); // il progetto di partenza: basso sugli step 3, 7, 11, 15
  await vista(page, "Roll");
  const lane = page.locator('.daw-roll[data-roll="bass"] .daw-vel-lane .daw-vel-cell');
  await expect(lane).toHaveCount(16);
  const bar = lane.nth(2).locator(".hw-vel");
  await expect(bar).toHaveAttribute("style", /height: ?80%/);
  await expect(lane.nth(0).locator(".hw-vel")).toHaveCount(0); // niente nota, niente barra
  const box = (await lane.nth(2).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.75, { steps: 4 });
  await page.mouse.up();
  await expect(bar).toHaveAttribute("style", /height: ?2\d%/);
  // la stessa forza si vede nel Beat con il pulsante Vel
  await vista(page, "Beat");
  await page.getByRole("button", { name: "Vel", exact: true }).click();
  await expect(page.locator('[data-panel="beat"] [data-row="bass"] .hw-key').nth(2).locator(".hw-vel")).toHaveAttribute("style", /height: ?2\d%/);
  expect(err).toEqual([]);
});
