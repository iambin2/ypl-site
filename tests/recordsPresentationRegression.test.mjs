import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/RecordsPage.jsx", import.meta.url), "utf8");

test("Records presentation hides only Champions round numbers", () => {
  assert.match(page, /event\.championSeries\s*\?\s*"챔피언스 시리즈"/);
  assert.match(page, /const championSeries = Boolean\(r\.championSeries \|\| r\.champ\)/);
  assert.match(page, /const rl = championSeries \? "" : r\.round/);
  assert.match(page, /String\(r\.round\) \+ "회"/);
});
