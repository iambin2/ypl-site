import test from "node:test";
import assert from "node:assert/strict";
import { freshRead, peekRead } from "../src/services/readCache.js";

test("read cache seeds a revisit, keeps the old object when nothing changed, and always takes a new result", async () => {
  assert.equal(peekRead("t-records"), undefined);
  const first = await freshRead("t-records", async () => ({ rows: [1, 2] }));
  assert.deepEqual(peekRead("t-records"), { rows: [1, 2] });

  const same = await freshRead("t-records", async () => ({ rows: [1, 2] }));
  assert.equal(same, first, "an unchanged result returns the remembered object so the page does not redraw");

  const changed = await freshRead("t-records", async () => ({ rows: [1, 2, 3] }));
  assert.deepEqual(changed, { rows: [1, 2, 3] });
  assert.equal(peekRead("t-records"), changed, "a new result replaces the remembered one, so a write is never hidden");

  await assert.rejects(freshRead("t-records", async () => { throw new Error("offline"); }));
  assert.equal(peekRead("t-records"), changed, "a failed read keeps the last good result");
});
