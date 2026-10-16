import assert from "node:assert/strict";
import test from "node:test";

import { PAGE_ROWS, readAll } from "../src/services/pagedRead.js";

// A PostgREST-like table that, like Supabase, answers at most PAGE_ROWS rows per request.
function table(total) {
  const rows = Array.from({ length: total }, (_, index) => ({ id: index }));
  const calls = [];
  const query = () => {
    const call = { order: null, range: null };
    calls.push(call);
    const builder = {
      order(key) { call.order = key; return builder; },
      range(from, to) { call.range = [from, to]; return builder; },
      then(resolve) {
        const [from, to] = call.range || [0, rows.length - 1];
        resolve({ data: rows.slice(from, Math.min(to + 1, from + PAGE_ROWS)), error: null });
      },
    };
    return builder;
  };
  return { query, calls };
}

test("a read under the row cap is the same single request", async () => {
  const { query, calls } = table(PAGE_ROWS - 1);
  const { data } = await readAll(query);
  assert.equal(data.length, PAGE_ROWS - 1);
  assert.equal(calls.length, 1);
});

test("a read that hits the row cap pages in key order until every row is in", async () => {
  const { query, calls } = table(PAGE_ROWS * 2 + 5);
  const { data } = await readAll(query);
  assert.equal(data.length, PAGE_ROWS * 2 + 5);
  assert.deepEqual(data.map(row => row.id), [...Array(PAGE_ROWS * 2 + 5).keys()]);
  assert.ok(calls.slice(1).every(call => call.order === "id" && call.range));
});

test("an error is returned as is", async () => {
  const error = { message: "boom" };
  const result = await readAll(() => Promise.resolve({ data: null, error }));
  assert.equal(result.error, error);
});
