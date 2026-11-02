import assert from "node:assert/strict";
import test from "node:test";
import { liveMatches } from "../src/services/recordsAnalytics.js";

const people = ["a", "b", "c", "d"].map(id => ({ id, name: id.toUpperCase() }));
const graph = winners => ({
  kind: "single",
  rounds: [
    [{ id: "m1", a: { pid: "a" }, b: { pid: "b" }, winner: winners.m1 || null }, { id: "m2", a: { pid: "c" }, b: { pid: "d" }, winner: winners.m2 || null }],
    [{ id: "m3", a: { win: "m1" }, b: { win: "m2" }, winner: winners.m3 || null }],
  ],
});

test("the matches being played are the ones with two players and no winner, with their round's progress", () => {
  const start = liveMatches({ participants: people, graph: graph({}) });
  assert.deepEqual(start.live.map(m => [m.a, m.b, m.stage]), [["A", "B", "4강"], ["C", "D", "4강"]]);
  assert.deepEqual([start.stage, start.done, start.total], ["4강", 0, 2]);
  const half = liveMatches({ participants: people, graph: graph({ m1: "a" }) });
  assert.deepEqual(half.live.map(m => m.id), ["m2"]);
  assert.deepEqual([half.done, half.total], [1, 2]);
  const final = liveMatches({ participants: people, graph: graph({ m1: "a", m2: "b" }) });
  assert.deepEqual(final.live.map(m => [m.a, m.b, m.stage]), [["A", "D", "결승"]]);
  assert.deepEqual(liveMatches({ participants: people, graph: graph({ m1: "a", m2: "b", m3: "a" }) }).live, []);
  assert.deepEqual(liveMatches(null).live, []);
});
