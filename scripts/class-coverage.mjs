// Lists className tokens used in JSX that no stylesheet in src/styles defines.
// Run: node scripts/class-coverage.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (dir, ext) => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path, ext) : ext.some(e => path.endsWith(e)) ? [path] : [];
});

const used = new Map();
for (const file of walk("src", [".jsx"])) {
  const src = readFileSync(file, "utf8");
  let i = 0;
  while ((i = src.indexOf("className=", i)) !== -1) {
    i += 10;
    let expr = "";
    if (src[i] === '"') expr = src.slice(i + 1, src.indexOf('"', i + 1));
    else if (src[i] === "{") {
      let depth = 0, j = i;
      for (; j < src.length; j++) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}" && --depth === 0) break;
      }
      expr = (src.slice(i, j).match(/"[^"]*"|'[^']*'|`[^`]*`/g) || []).join(" ").replace(/\$\{[^}]*\}/g, " ");
    }
    for (const token of expr.match(/[a-zA-Z][\w-]*/g) || []) {
      if (!used.has(token)) used.set(token, new Set());
      used.get(token).add(file.replace(/\\/g, "/").replace(/^src\//, ""));
    }
  }
}

const css = walk("src/styles", [".css"]).map(f => readFileSync(f, "utf8")).join("\n");
const defined = new Set(css.match(/\.[a-zA-Z][\w-]*/g)?.map(s => s.slice(1)) || []);
const missing = [...used.keys()].filter(t => !defined.has(t)).sort();
for (const token of missing) console.log(token.padEnd(34), [...used.get(token)].join(", "));
console.log(`\n${missing.length} of ${used.size} class tokens have no rule.`);
