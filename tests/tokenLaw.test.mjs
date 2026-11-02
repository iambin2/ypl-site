import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

/* a var() with no definition and no fallback silently draws nothing: ::selection did, until 2026-11-02 */
test("every var() points at something defined", () => {
  const text = walk("src").filter(f => /\.(css|jsx?)$/.test(f)).map(f => readFileSync(f, "utf8")).join("\n");
  const defined = new Set([...text.matchAll(/(?:^|[;{\s"'`(,])(--[\w-]+)\s*["'`]?\s*:/gm)].map(m => m[1]));
  for (const m of text.matchAll(/setProperty\(\s*["'`](--[\w-]+)/g)) defined.add(m[1]);
  const used = [...text.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(used)].filter(n => !defined.has(n)), []);
});
