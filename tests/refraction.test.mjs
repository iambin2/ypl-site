import test from "node:test";
import assert from "node:assert/strict";
import { lensOffset } from "../src/components/common/refraction.js";

test("the lens bends only inside the rim band, inward, strongest at the rim", () => {
  const pill = [28, 28, 28, 28];
  assert.deepEqual(lensOffset(0, 0, 400, 56, pill, 20), [0, 0], "the middle is left alone");
  const [, nearTop] = lensOffset(0, -27.5, 400, 56, pill, 20);
  const [, inBand] = lensOffset(0, -18, 400, 56, pill, 20);
  assert.ok(nearTop > 0.9 && nearTop <= 1, "at the top rim it points down, almost fully");
  assert.ok(inBand > 0 && inBand < nearTop, "it fades toward the inner edge of the band");
  const [x] = lensOffset(-199, 0, 400, 56, pill, 20);
  assert.ok(x > 0.9, "at the left cap it points right");
  assert.deepEqual(lensOffset(0, 40, 400, 56, pill, 20), [0, 0], "outside the shape nothing moves");
});

test("each corner uses its own radius, so a sheet with square bottom corners keeps them", () => {
  // 1px inside the bottom edge, 3px from the left side: inside a square corner, outside a rounded one
  const [, dy] = lensOffset(-297, 199, 600, 400, [28, 28, 0, 0], 24);
  assert.ok(dy < -0.9, "near the bottom rim it points up, into the sheet");
  assert.deepEqual(lensOffset(-297, 199, 600, 400, [28, 28, 28, 28], 24), [0, 0], "a rounded corner leaves that point outside");
});
