// node docs/redesign-solid/lab/build.mjs <outDir>
// Inlines the font, the brand paths, the icons and the real arena geometry. Writes skin-lab.html (for the Artifact) and
// skin-lab.local.html (a full document for local measuring).
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, "../../.."), out = process.argv[2] || here;
const read = p => readFileSync(join(root, p), "utf8");
const header = read("src/components/layout/SiteHeader.jsx"), icons = read("src/components/common/Icon.jsx");
const one = re => header.match(re)[1];
const mark = one(/MARK_PATH = "([^"]+)"/);
const word = [...header.match(/WORDMARK_PATH = ([\s\S]*?);/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).join("");
const icon = k => icons.match(new RegExp(`^\\s*"?${k}"?: "([^"]+)"`, "m"))[1];
const font = readdirSync(join(root, "public/fonts/suit")).find(f => f.startsWith("suit-0."));
const arena = read("src/components/home/arenaField.js").replace(/^export /gm, "").replace(/\bconst circle\b/, "const circle");
const ICONS = Object.fromEntries(["home", "news", "bracket", "records", "more"].flatMap(k => [[k, icon(k)], [k + "-fill", icon(k + "-fill")]]));

const html = read("docs/redesign-solid/lab/skin-lab.src.html")
  .replace("/*FONT*/", readFileSync(join(root, "public/fonts/suit", font)).toString("base64"))
  .replaceAll("/*MARK*/", mark).replaceAll("/*WORD*/", word)
  .replace("/*SUN*/", icon("sun")).replace("/*X*/", icon("x"))
  .replace("/*ICONS*/{}", JSON.stringify(ICONS))
  .replace("/*ARENA*/", () => arena);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "skin-lab.html"), html);
writeFileSync(join(out, "skin-lab.local.html"), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${html}</body></html>`);
console.log("skin-lab.html", Math.round(html.length / 1024), "KB");
