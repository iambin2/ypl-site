// contact sheets of every move recipe from the lab bench: node shoot.mjs [from] [to] [onlyIds,comma]
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("C:/Users/jaebi/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright");
const DIR = new URL(".", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const recipes = JSON.parse(fs.readFileSync(DIR + "recipes.json", "utf8"));
const [from = 0, to = recipes.length, only = "", outArg = "sheets"] = process.argv.slice(2);
const outDir = /^(\w:|\/)/.test(outArg) ? outArg.replaceAll("\\", "/") : DIR + outArg;
let list = recipes.map((r, i) => ({ ...r, i })).slice(Number(from), Number(to));
if (only) list = only.split(",").map(id => ({ rep: id, r: "", i: id }));
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: false, args: [`--window-position=${process.env.WX || -2600},${process.env.WY || 0}`, "--window-size=1000,1000", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.setDefaultTimeout(30000);
page.on("pageerror", e => console.log("PAGEERR", e.message));
async function setup() {
await page.goto("http://localhost:5182/?view=lab", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__bench && window.__bench.stage()?.__gl, null, { timeout: 30000 });
await page.evaluate(() => window.__bench.setFormat("singles"));
await page.waitForTimeout(2500);
await page.evaluate(() => {
  window.__cap = async (id, label) => {
    const st = window.__bench.stage(), e = st.__gl, cv = e.canvas, sc = 260 / cv.width, fw = 260, fh = Math.round(cv.height * sc);
    const shots = [];
    let done = false;
    const p = window.__bench.play(id).then(() => { done = true; });
    const t0 = performance.now();
    while (!done && performance.now() - t0 < 9000) {
      await new Promise(r => { setTimeout(r, 250); e.onRender = c => { const k = document.createElement("canvas"); k.width = fw; k.height = fh; k.getContext("2d").drawImage(c, 0, 0, fw, fh); shots.push(k); r(); }; });
      await new Promise(r => setTimeout(r, 55));
    }
    await Promise.race([p, new Promise(r => setTimeout(r, 4000))]);
    const use = shots.slice(0, Math.max(1, shots.length - 8));
    const N = 8, pick = Array.from({ length: N }, (_, i) => use[Math.min(use.length - 1, Math.round(i * (use.length - 1) / (N - 1)))]);
    const out = document.createElement("canvas"); out.width = fw * 4; out.height = fh * 2 + 22;
    const g = out.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, out.width, out.height);
    pick.forEach((k, i) => g.drawImage(k, (i % 4) * fw, 22 + Math.floor(i / 4) * fh));
    g.fillStyle = "#fff"; g.font = "15px sans-serif"; g.fillText(label, 6, 16);
    // white-out: the most near-white pixels any frame has over the first frame's, in thousandths of the picture
    const whites = k => { const d = k.getContext("2d").getImageData(0, 0, fw, fh).data; let w = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 225) w++; return w; };
    const w0 = whites(shots[0] || out), white = Math.round(Math.max(0, ...use.map(whites)) - w0) / (fw * fh) * 1000;
    await new Promise(r => setTimeout(r, 300));
    return [out.toDataURL("image/jpeg", .82), Math.round(white * 10) / 10];
  };
});
}
await setup();
for (const r of list) {
  if (!only && fs.existsSync(`${outDir}/${String(r.i).padStart(3, "0")}_${r.rep}.jpg`)) continue;
  try {
    const [url, white] = await page.evaluate(([id, label]) => window.__cap(id, label), [r.rep, `#${r.i} ${r.rep}  [${r.r}]  x${r.n || 1}`]);
    fs.appendFileSync(`${outDir}/white.tsv`, `${r.rep}	${white}
`);
    fs.writeFileSync(`${outDir}/${String(r.i).padStart(3, "0")}_${r.rep}.jpg`, Buffer.from(url.split(",")[1], "base64"));
    process.stdout.write(".");
  } catch (err) { console.log("\nFAIL", r.rep, err.message); }
}
await browser.close();
console.log("\ndone");
