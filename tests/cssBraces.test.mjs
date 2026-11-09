// Every stylesheet closes every block it opens: the build joins them in main.jsx's order, so one block left open swallows the files
// after it (2026-11-10: streak.css ended in an open "@media (hover: hover) {", and admin.css applied only where a mouse hovers).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../src/styles/", import.meta.url);
test("every stylesheet closes the blocks it opens", () => {
  for (const name of readdirSync(dir).filter(f => f.endsWith(".css"))) {
    const css = readFileSync(new URL(name, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"\n]*"|'[^'\n]*'/g, "");
    let depth = 0;
    for (const c of css) { if (c === "{") depth++; else if (c === "}") depth--; assert.ok(depth >= 0, `${name} closes a block it never opened`); }
    assert.equal(depth, 0, `${name} leaves ${depth} block(s) open`);
  }
});
