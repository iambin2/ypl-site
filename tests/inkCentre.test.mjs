import test from "node:test";
import assert from "node:assert/strict";
import { inkShift } from "../src/components/common/inkCentre.js";

const sheet = (w, h, cells) => { const a = new Uint8Array(w * h); for (const [x, y] of cells) a[y * w + x] = 255; return a; };

test("a sprite resting low moves up by the distance its ink sits off centre", () => {
  assert.deepEqual(inkShift(sheet(10, 10, [[4, 8], [5, 9]]), 10, 10), [0, -40]);
});
test("centred ink stays where it is, and an empty picture is left alone", () => {
  assert.deepEqual(inkShift(sheet(10, 10, [[4, 4], [5, 5]]), 10, 10), [0, 0]);
  assert.equal(inkShift(new Uint8Array(100), 10, 10), null);
});
test("a faint halo does not count as ink", () => {
  const a = sheet(10, 10, [[4, 4], [5, 5]]); a[0] = 20;
  assert.deepEqual(inkShift(a, 10, 10), [0, 0]);
});
