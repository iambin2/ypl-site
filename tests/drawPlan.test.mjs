import assert from "node:assert/strict";
import test from "node:test";
import { drawPlan, slotsFromPlan } from "../src/services/bracketProjection.js";

test("a drawn plan holds every key once, BYEs only second and never two in a match", () => {
  for (const n of [2, 3, 5, 8, 11]) {
    const keys = Array.from({ length: n }, (_, i) => `k${i}`);
    const plan = drawPlan(keys);
    const size = 2 ** Math.ceil(Math.log2(n));
    assert.equal(plan.length, size / 2);
    assert.deepEqual(plan.flat().filter(Boolean).sort(), [...keys].sort());
    assert.equal(plan.filter(([, b]) => b == null).length, size - n);
    assert.ok(plan.every(([a]) => a != null));
  }
});

test("an admin's plan becomes the slots as placed; a plan that does not fit fails closed", () => {
  const entryOf = new Map([["a", "ea"], ["b", "eb"], ["c", "ec"]]);
  assert.deepEqual(slotsFromPlan([["c", "a"], ["b", null]], entryOf), [
    { slot_no: 1, entry_id: "ec" }, { slot_no: 2, entry_id: "ea" }, { slot_no: 3, entry_id: "eb" },
  ]);
  for (const bad of [[["a", "b"], ["c", "c"]], [["a", "b"]], [[null, "a"], ["b", "c"]], [["a", "b"], ["x", null]], null]) {
    assert.throws(() => slotsFromPlan(bad, entryOf), /대진 배치가 참가자와 맞지 않습니다/);
  }
});
