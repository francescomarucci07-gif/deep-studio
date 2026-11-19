import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
for (const [w, h] of [[1366, 650], [1920, 950]]) {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  await page.route("**/rest/v1/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  await page.addInitScript(() => localStorage.setItem("ds-tour-visto", "1"));
  await page.goto("http://localhost:3210/prova-studio?p=send", { waitUntil: "networkidle" });
  await page.locator(".hw-view", { hasText: "Mixer" }).click();
  await page.getByRole("button", { name: "Send verso il bus Rev" }).click();
  await page.screenshot({ path: `${process.argv[2]}/mixer-send-${w}.png` });
  console.log(w, await page.evaluate(() => { const e = document.querySelector(".hw-strips"); return [e.scrollWidth, e.clientWidth, document.querySelector(".console-stage").scrollHeight - document.querySelector(".console-stage").clientHeight]; }));
  await page.close();
}
await b.close();
