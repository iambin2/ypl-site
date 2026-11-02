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

test("maxAgeMs skips a recent read and shares one in flight", async () => {
  let calls = 0;
  let release;
  const slow = () => { calls += 1; return new Promise(resolve => { release = resolve; }); };
  const first = freshRead("shared", slow, 1000);
  const second = freshRead("shared", slow, 1000);
  assert.equal(calls, 1);
  release({ rows: 1 });
  assert.equal(await first, await second);
  assert.deepEqual(await freshRead("shared", slow, 1000), { rows: 1 });
  assert.equal(calls, 1);
  freshRead("shared", slow, 0);
  assert.equal(calls, 2, "without maxAgeMs every call reads, so a write is never hidden");
  release({ rows: 2 });
});

test("a failed read is not remembered as recent", async () => {
  await assert.rejects(freshRead("broken", async () => { throw new Error("down"); }, 1000), /down/);
  assert.equal(await freshRead("broken", async () => "ok", 1000), "ok");
});
