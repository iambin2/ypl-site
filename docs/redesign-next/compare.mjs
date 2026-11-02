// Screenshots the running site at the sizes and themes the drafts were drawn at, so each screen can be laid beside its draft PNG.
//   node docs/redesign-next/compare.mjs http://localhost:5173/ypl-site/ <out-dir> [view,view,...]
// Playwright: `npm i -D playwright` is not in this repo on purpose. Point PLAYWRIGHT_DIR at a node_modules that has it
// (on this machine: C:/Users/jaebi/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/). The bundled Chromium
// refuses to start here, so it drives the installed Chrome (channel "chrome").
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [base = "http://localhost:5173/ypl-site/", out = "compare-out", only] = process.argv.slice(2);
const require = createRequire(process.env.PLAYWRIGHT_DIR || import.meta.url);
const { chromium } = require("playwright");

// view name -> query; each is shot on a phone (390) in dark and light, and on a desktop (1440) in dark
const SCREENS = {
  home: "", news: "?view=news", bracket: "?view=bracket", "records-trainer": "?view=records&tab=trainer", "records-tour": "?view=records&tab=tour",
  "records-pokemon": "?view=records&tab=pokemon", "records-rank": "?view=records&tab=rank", titles: "?view=titles", champions: "?view=champions",
  board: "?view=board", builder: "?view=builder", calc: "?view=calc", about: "?view=about", missing: "no-such-page",
};
const pick = only ? only.split(",") : Object.keys(SCREENS);
mkdirSync(out, { recursive: true });

const b = await chromium.launch({ channel: "chrome" });
for (const [device, viewport, themes] of [["phone", { width: 390, height: 844 }, ["dark", "light"]], ["desk", { width: 1440, height: 900 }, ["dark"]]]) {
  for (const theme of themes) {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 2, isMobile: device === "phone", hasTouch: device === "phone" });
    await ctx.addInitScript(t => { try { localStorage.setItem("ypl-theme", t); } catch { /* private mode */ } }, theme);
    const p = await ctx.newPage();
    for (const name of pick) {
      await p.goto(base + SCREENS[name], { waitUntil: "networkidle" });
      await p.waitForTimeout(1500); // let the light-up finish and late data land
      await p.screenshot({ path: join(out, `${device}-${theme}-${name}.png`) });
      await p.screenshot({ path: join(out, `${device}-${theme}-${name}-full.png`), fullPage: true });
    }
    await ctx.close();
  }
}
await b.close();
console.log(`saved to ${out}`);
