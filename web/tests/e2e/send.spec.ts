// Send verso i bus: il pulsante Send sul bus, la manopola sotto i canali, e il suono che passa davvero dal send.
import { expect, test } from "@playwright/test";
import { apri, errori, scarica, vista, wav } from "./aiuto";

test.setTimeout(120_000);

test("il suono passa dal send: lead in un bus muto, si sente solo dal bus del send", async ({ page }) => {
  const err = errori(page);
  await apri(page, "send");
  const con = wav((await scarica(page, "Mix WAV")).dati);
  expect(con.peak, "con il send il lead si sente").toBeGreaterThan(0.01);

  // tolgo il send dal Mixer: ora il lead esce solo nel bus muto e l'export è muto
  await vista(page, "Mixer");
  const send = page.getByRole("button", { name: "Send verso il bus Rev" });
  await expect(send).toHaveText(/Send 1/);
  await send.click();
  await expect(page.locator(".hw-strip-send")).toHaveCount(9 + 2); // un posto per ogni canale (7 batteria, Bass, Chords, Lead, Lead 2)
  const knob = page.getByRole("slider", { name: /→ Rev/ }).nth(9); // il Lead
  await knob.dblclick(); // doppio clic = valore di partenza, cioè nessun send
  await expect(send).toHaveText(/^Send$/);
  const senza = wav((await scarica(page, "Mix WAV")).dati);
  expect(senza.peak, "senza send il lead non si sente").toBeLessThan(0.001);
  expect(err).toEqual([]);
});

test("send dal mixer: manopola, testo del bus, il bus tolto si porta via i send", async ({ page }) => {
  const err = errori(page);
  await apri(page);
  await vista(page, "Mixer");
  await page.locator("#out-lead").selectOption({ label: "+ Nuovo bus" }); // bus2
  await page.locator("#out-lead").selectOption("master"); // il lead torna al master, il bus resta
  await page.locator("#bus-bus2").fill("Rev");
  await page.getByRole("button", { name: "Send verso il bus Rev" }).click();
  // il clap: manopola su con le frecce
  const clap = page.getByRole("slider", { name: /→ Rev/ }).nth(1);
  await clap.focus();
  for (let k = 0; k < 3; k++) await page.keyboard.press("ArrowUp");
  await expect(page.locator(".hw-strip--bus").nth(1).locator(".hw-bus-in")).toContainText("Clap (send");
  // la batteria esce già nel bus Drums: con Send su Drums, i canali di batteria lo dicono invece della manopola
  await page.getByRole("button", { name: "Send verso il bus Drums" }).click();
  await expect(page.locator(".hw-strip-send").first()).toContainText("in Drums");
  await page.getByRole("button", { name: "Togli il bus Rev" }).click();
  await expect(page.locator(".hw-strip--bus")).toHaveCount(1);
  expect(err).toEqual([]);
});

test("bus dentro bus: il bus Rev dentro il bus muto non si sente più; i giri chiusi non si offrono", async ({ page }) => {
  const err = errori(page);
  await apri(page, "send");
  await vista(page, "Mixer");
  const revOut = page.locator("#bus-out-bus3");
  const mutoOut = page.locator("#bus-out-bus2");
  await revOut.selectOption({ label: "→ Muto" });
  // Muto riceve già Rev: nell'uscita di Muto, Rev non c'è (sarebbe un giro chiuso)
  expect(await mutoOut.locator("option").allInnerTexts()).not.toContain("→ Rev");
  await expect(page.locator(".hw-strip--bus").filter({ has: page.locator("#bus-bus2") }).locator(".hw-bus-in")).toContainText("bus Rev");
  const dentro = wav((await scarica(page, "Mix WAV")).dati);
  expect(dentro.peak, "Rev dentro il bus muto: silenzio").toBeLessThan(0.001);
  await revOut.selectOption("master");
  const fuori = wav((await scarica(page, "Mix WAV")).dati);
  expect(fuori.peak, "Rev di nuovo al master: si sente").toBeGreaterThan(0.01);
  expect(err).toEqual([]);
});
