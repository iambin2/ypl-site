// lists every emission (and strip) a move makes, by time: node emitlog.mjs firepunch
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
  const e = window.__bench.stage().__gl, out = [], t0 = performance.now(), em = e.emit.bind(e);
  const f = v => (typeof v === "number" ? Math.round(v) : Array.isArray(v) ? v.map(f).join("/") : typeof v === "function" ? "fn" : v);
  e.emit = o => { out.push(`${Math.round(performance.now() - t0 + (o.delay || 0))}\t${o.n || 1}x ${o.tex} ${o.ramp} size=${f(o.size)} emis=${o.emis ?? 1} occ=${o.occ ?? 0} a=${o.alpha ?? 1} lit=${!!o.lit} life=${f(o.life)} L${o.layer ?? ""}`); return em(o); };
  await window.__bench.play(id);
  return out.sort((a, b) => parseInt(a) - parseInt(b));
}, id);
console.log(log.join("\n"));
await browser.close();
