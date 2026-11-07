// how each Pokémon's light channels move while a move plays (a white body is flash, rim or tint, or light laid over it): node actorlog.mjs aerialace
import { createRequire } from "module";
const require = createRequire("C:/Users/jaebi/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright");
const id = process.argv[2];
const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--window-position=-2600,0", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.goto("http://localhost:5182/?view=lab", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__bench && window.__bench.stage()?.__gl, null, { timeout: 30000 });
await page.evaluate(() => window.__bench.setFormat("singles"));
await page.waitForTimeout(2000);
const log = await page.evaluate(async id => {
  const e = window.__bench.stage().__gl, out = [], t0 = performance.now();
  let done = false;
  const p = window.__bench.play(id).then(() => { done = true; });
  while (!done) {
    await new Promise(r => setTimeout(r, 40));
    const row = [...e.actors.entries()].map(([k, a]) => `${k}: fl${a.st.flash.toFixed(2)} rim${a.st.rimA.toFixed(2)}(${[a.st.rimR, a.st.rimG, a.st.rimB].map(v => v.toFixed(1))}) tint${a.st.tintA.toFixed(2)} br${a.st.bright.toFixed(2)}`).join(" | ");
    out.push(`${Math.round(performance.now() - t0)}\t${row}`);
  }
  await p;
  return out;
}, id);
console.log(log.join("\n"));
await browser.close();
