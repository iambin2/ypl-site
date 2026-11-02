import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

test("a <label> is always tied to a control: a caption over a group is .field-label (Accessibility)", () => {
  const orphans = walk("src").filter(f => f.endsWith(".jsx")).flatMap(f =>
    [...readFileSync(f, "utf8").matchAll(/<label>[^\n]*/g)].map(m => `${f}: ${m[0].slice(0, 40)}`));
  assert.deepEqual(orphans, []);
});
