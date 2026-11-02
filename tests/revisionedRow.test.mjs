import test from "node:test";
import assert from "node:assert/strict";
import { WRITE_CONFLICT, retryOnConflict, writeRevisioned } from "../src/services/revisionedRow.js";

// The two PostgREST shapes the helper uses, over one row. The row's revision rises the way the DB trigger raises it.
function fakeTable(row) {
  const filters = {};
  const update = values => {
    const chain = {
      eq: (column, value) => { filters[column] = value; return chain; },
      select: async () => {
        if (filters.revision !== row.revision) return { data: [], error: null };
        Object.assign(row, values, { revision: row.revision + 1 });
        return { data: [{ revision: row.revision }], error: null };
      },
    };
    return chain;
  };
  const upsert = values => ({ select: async () => { Object.assign(row, values); return { data: [{ ...row }], error: null }; } });
  return { update, upsert };
}

test("a write based on the current revision lands and returns the new one", async () => {
  const row = { key: "k", value: 1, revision: 4 };
  assert.equal(await writeRevisioned(fakeTable(row), "k", 2, 4), 5);
  assert.equal(row.value, 2);
});

test("a write based on a stale revision changes nothing", async () => {
  const row = { key: "k", value: "someone else's notice", revision: 5 };
  assert.equal(await writeRevisioned(fakeTable(row), "k", "stale screen", 4), WRITE_CONFLICT);
  assert.equal(row.value, "someone else's notice");
});

test("a row without a known revision is inserted as before", async () => {
  const row = {};
  assert.equal(await writeRevisioned(fakeTable(row), "k", 1, undefined), undefined);
  assert.equal(row.value, 1);
});

test("a database error is thrown, not read as a conflict", async () => {
  const table = { update: () => ({ eq() { return this; }, select: async () => ({ data: null, error: new Error("denied") }) }) };
  await assert.rejects(writeRevisioned(table, "k", 1, 1), /denied/);
});

test("conflicts retry from a fresh read, and give up with the conflict", async () => {
  let calls = 0;
  assert.equal(await retryOnConflict(async () => (++calls < 3 ? WRITE_CONFLICT : true)), true);
  assert.equal(calls, 3);
  calls = 0;
  assert.equal(await retryOnConflict(async () => { calls += 1; return WRITE_CONFLICT; }), WRITE_CONFLICT);
  assert.equal(calls, 4);
  assert.equal(await retryOnConflict(async () => false), false);
});
