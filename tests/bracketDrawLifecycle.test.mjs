import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  beginNormalizedBracketDraw,
  completeNormalizedBracketDraw,
} from "../src/services/bracketDrawLifecycle.js";

test("new normalized runtime enters presentation-only draw state with the loaded bracket", () => {
  const bracket = {
    id: "runtime:draw-1",
    eventId: "event-1",
    participants: [{ id: "p-1", name: "A" }, { id: "p-2", name: "B" }],
    projection: { runtimeId: "runtime-1", topology: "single_elimination" },
  };
  const before = structuredClone(bracket);
  const state = beginNormalizedBracketDraw(bracket);

  assert.equal(state.openId, bracket.id);
  assert.equal(state.drawId, bracket.id);
  assert.strictEqual(state.bracket, bracket);
  assert.deepEqual(bracket, before, "draw state does not shuffle participants, slots, or runtime facts");
  assert.equal(completeNormalizedBracketDraw(), null);
});

test("draw state rejects a projection before a normalized runtime id is available", () => {
  assert.throws(() => beginNormalizedBracketDraw(null), /normalized bracket id/);
});

test("only normalized create completion enters draw state; loading and opening stay presentation-neutral", () => {
  const page = readFileSync(new URL("../src/pages/BracketsPage.jsx", import.meta.url), "utf8");
  assert.equal((page.match(/beginNormalizedBracketDraw\(/g) || []).length, 2);
  assert.match(page, /setOpenId\(target\.id\)/);
  const loadStart = page.indexOf("const loadNormalized=async");
  const loadEnd = page.indexOf("const requestedEventId", loadStart);
  assert.doesNotMatch(page.slice(loadStart, loadEnd), /beginNormalizedBracketDraw/);
  assert.match(page, /onDone=\{\(\)=>setDrawId\(completeNormalizedBracketDraw\(\)\)\}/);
});
