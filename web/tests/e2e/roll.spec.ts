// Il piano roll: lunghezza delle note, selezione, spostamenti, copia e incolla.
import { expect, test, type Page } from "@playwright/test";
import { apri, cella, errori, noteRoll, vista } from "./aiuto";

async function lead(page: Page) {
  await vista(page, "Roll");
  await page.getByRole("group", { name: "Strumento nel piano roll" }).getByRole("button", { name: "Lead", exact: true }).click();
}

async function trascina(page: Page, nota: string, da: number, a: number) {
  const A = (await cella(page, nota, da).boundingBox())!;
  const Z = (await cella(page, nota, a).boundingBox())!;
  await page.mouse.move(A.x + A.width / 2, A.y + A.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(A.x + A.width / 2 + ((Z.x - A.x) * k) / 6, A.y + A.height / 2);
  await page.mouse.up();
}

test("lunghezza delle note: disegno, allungo, pennello, tolgo", async ({ page }) => {
  const err = errori(page);
  await apri(page, "empty");
  await lead(page);
  await trascina(page, "Do5", 0, 3);
  expect(await noteRoll(page)).toEqual(["Do5@1(4)"]);
  await trascina(page, "Do5", 0, 7);
  expect(await noteRoll(page)).toEqual(["Do5@1(8)"]);
  await cella(page, "Mi5", 8).click(); // il pennello ricorda l'ultima lunghezza
  expect(await noteRoll(page)).toEqual(["Mi5@9(8)", "Do5@1(8)"]);
  await cella(page, "Do5", 5).click(); // clic sulla coda = tolgo la nota
  expect(await noteRoll(page)).toEqual(["Mi5@9(8)"]);

  await vista(page, "Beat");
  const riga = page.locator('[data-panel="beat"] [data-row="lead"] .hw-key');
  const beat = await riga.evaluateAll((els) =>
    els.map((e) => (e.getAttribute("data-on") === "true" ? "X" : e.getAttribute("data-hold") === "true" ? "=" : ".")).join(""),
  );
  expect(beat).toBe("........X=======");
  expect(err).toEqual([]);
});

test("selezione con Shift, frecce, Ctrl+D, Canc, Ctrl+Z e incolla in un altro pattern", async ({ page }) => {
  const err = errori(page);
  await apri(page, "empty");
  await lead(page);
  await trascina(page, "Do5", 0, 1);
  await cella(page, "Mi5", 2).click();
  await cella(page, "Sol5", 4).click();
  expect(await noteRoll(page)).toEqual(["Sol5@5(2)", "Mi5@3(2)", "Do5@1(2)"]);

  const p0 = (await cella(page, "Sol5", 0).boundingBox())!;
  const p1 = (await cella(page, "Do5", 2).boundingBox())!;
  await page.keyboard.down("Shift");
  await page.mouse.move(p0.x + 5, p0.y + 5);
  await page.mouse.down();
  await page.mouse.move(p1.x + 5, p1.y + 5, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  expect(await noteRoll(page)).toEqual(["Sol5@5(2)", "Mi5@3(2)*", "Do5@1(2)*"]);

  await page.keyboard.press("ArrowRight");
  expect(await noteRoll(page)).toEqual(["Sol5@5(2)", "Mi5@4(2)*", "Do5@2(2)*"]);
  await page.keyboard.press("ArrowUp");
  expect(await noteRoll(page)).toEqual(["Sol5@5(2)", "Fa5@4(2)*", "Do#5@2(2)*"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+ArrowDown"); // un'ottava giù
  await page.keyboard.press("Control+d");
  expect(await noteRoll(page)).toEqual(["Sol5@5(2)", "Mi4@4(2)", "Mi4@8(2)*", "Do4@2(2)", "Do4@6(2)*"]);
  await page.keyboard.press("Delete");
  expect(await noteRoll(page)).toEqual(["Sol5@5(2)", "Mi4@4(2)", "Do4@2(2)"]);
  await page.keyboard.press("Control+z");
  expect(await noteRoll(page)).toEqual(["Sol5@5(2)", "Mi4@4(2)", "Mi4@8(2)", "Do4@2(2)", "Do4@6(2)"]);

  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await page.locator('[data-panel="roll"] .hw-roll-patterns button', { hasText: /^B$/ }).click();
  expect(await noteRoll(page)).toEqual([]);
  await page.keyboard.press("Control+v");
  expect(await noteRoll(page)).toEqual(["Sol5@5(2)*", "Mi4@4(2)*", "Mi4@8(2)*", "Do4@2(2)*", "Do4@6(2)*"]);
  expect(err).toEqual([]);
});

test("un trascinamento lungo nel Roll è un solo passo di Annulla", async ({ page }) => {
  await apri(page, "empty");
  await vista(page, "Roll"); // scheda Bass
  await trascina(page, "Do2", 0, 9);
  expect(await noteRoll(page)).toEqual(["Do2@1(10)"]);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  expect(await noteRoll(page)).toEqual([]);
});
