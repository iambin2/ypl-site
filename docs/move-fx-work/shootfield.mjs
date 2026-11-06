// contact sheets of the field effects and Mega Evolution from the lab bench: node shootfield.mjs [only,comma] [outDir]
// a field is set the way a battle sets it (weather, terrain or room, a side condition on the foe's side) and filmed for 3 s;
// "mega" plays stageFx megaStart and megaEnd on our Pokémon. Same rig as shoot.mjs (dev server 5182, Playwright from the npx cache).
import { createRequire } from "module";
import fs from "fs";
const require = createRequire("C:/Users/jaebi/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright");
const DIR = new URL(".", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const ALL = { weather: ["raindance", "sunnyday", "sandstorm", "snowscape"], field: ["electricterrain", "grassyterrain", "mistyterrain", "psychicterrain", "trickroom", "magicroom", "wonderroom", "gravity"], side: ["stealthrock", "spikes", "toxicspikes", "stickyweb", "reflect", "lightscreen", "auroraveil", "safeguard", "mist", "tailwind"], mega: ["mega"] };
const [only = "", outArg = "fields"] = process.argv.slice(2);
const outDir = /^(\w:|\/)/.test(outArg) ? outArg.replaceAll("\\", "/") : DIR + outArg;
const list = Object.entries(ALL).flatMap(([kind, ids]) => ids.map(id => ({ kind, id }))).filter(x => !only || only.split(",").includes(x.id));
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: false, args: [`--window-position=${process.env.WX || -2600},0`, "--window-size=1000,1000", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on("pageerror", e => console.log("PAGEERR", e.message));
await page.goto("http://localhost:5182/?view=lab", { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__bench && window.__bench.stage()?.__gl, null, { timeout: 30000 });
await page.evaluate(() => window.__bench.setFormat("singles"));
await page.waitForTimeout(2500);
for (const { kind, id } of list) {
  await page.evaluate(() => window.__bench.field("", [], {}));
  await page.waitForTimeout(900);
  const url = await page.evaluate(async ([kind, id]) => {
    const st = window.__bench.stage(), e = st.__gl, cv = e.canvas, fw = 260, fh = Math.round(cv.height * 260 / cv.width), shots = [];
    const grab = () => new Promise(r => { e.onRender = c => { const k = document.createElement("canvas"); k.width = fw; k.height = fh; k.getContext("2d").drawImage(c, 0, 0, fw, fh); shots.push(k); r(); }; });
    if (kind === "mega") { const fx = await import("/src/pages/battle/stageFx.js"); fx.megaStart(st, "p1a").then(() => fx.megaEnd(st, "p1a")); }
    else if (kind === "weather") window.__bench.field(id, [], {});
    else if (kind === "field") window.__bench.field("", [id], {});
    else window.__bench.field("", [], { foe: [id] });
    for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, kind === "mega" ? 330 : 380)); await grab(); }
    const out = document.createElement("canvas"); out.width = fw * 4; out.height = fh * 2 + 22;
    const g = out.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, out.width, out.height);
    shots.forEach((k, i) => g.drawImage(k, (i % 4) * fw, 22 + Math.floor(i / 4) * fh));
    g.fillStyle = "#fff"; g.font = "15px sans-serif"; g.fillText(`${kind} ${id}`, 6, 16);
    return out.toDataURL("image/jpeg", .85);
  }, [kind, id]);
  fs.writeFileSync(`${outDir}/${kind}_${id}.jpg`, Buffer.from(url.split(",")[1], "base64"));
  process.stdout.write(".");
}
await browser.close();
console.log("\ndone");
