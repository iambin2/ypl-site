// Inlines the SUIT font and Phosphor icons (MIT) into a lab page.
// usage: node docs/redesign-glass/lab/build.mjs <outDir> [page]   (page: glass-lab (default) or refraction-lab)
// <outDir>/<page>.html is the Artifact fragment, <outDir>/<page>.preview.html the same page with a doctype for local checks.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const here = new URL(".", import.meta.url);
const out = process.argv[2];
if (!out) throw new Error("usage: build.mjs <outDir> [page]");
const name = process.argv[3] || "glass-lab";

const font = readFileSync(new URL("../../../public/fonts/SUIT-Variable.woff2", here)).toString("base64");
const icons = readFileSync(new URL("icons.json", here), "utf8").trim();
const page = readFileSync(new URL(`${name}.html`, here), "utf8")
  .replace("{{SUIT}}", `data:font/woff2;base64,${font}`)
  .replace("/*{{ICONS}}*/{}", icons);

mkdirSync(out, { recursive: true });
writeFileSync(`${out}/${name}.html`, page);
writeFileSync(`${out}/${name}.preview.html`, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${page}</body></html>`);
console.log(`${out}/${name}.html ${(page.length / 1024).toFixed(0)} KB`);
