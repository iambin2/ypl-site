import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// rememberRecent lives in a .jsx module; take the pure function out by its source so the test needs no JSX loader
const source = readFileSync(new URL("../src/components/common/PickerSheet.jsx", import.meta.url), "utf8");
const body = source.match(/const RECENT_MAX = (\d+);\r?\nexport function rememberRecent\(list, value\) \{ (return [^\r\n]*) \}/);
const rememberRecent = new Function("list", "value", `const RECENT_MAX = ${body[1]}; ${body[2]}`);

test("a pick goes to the front once, and only six are kept", () => {
  assert.deepEqual(rememberRecent([], "a"), ["a"]);
  assert.deepEqual(rememberRecent(["a", "b", "c"], "c"), ["c", "a", "b"]);
  assert.deepEqual(rememberRecent(["a", "b", "c", "d", "e", "f"], "g"), ["g", "a", "b", "c", "d", "e"]);
  assert.deepEqual(rememberRecent(null, "x"), ["x"]);
});
