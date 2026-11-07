import test from "node:test";
import assert from "node:assert/strict";
import { STREAK_BUDGET_MS, STREAK_LEVELS, streakCpuOptions, streakLevel } from "../src/services/streak.js";
import { LEVELS } from "../src/services/cpuLevels.js";

test("the 연승 도전 climbs one 난이도 every seven games and stays on the last", () => {
  const ladder = [0, 6, 7, 13, 14, 20, 21, 100].map(streakLevel);
  assert.deepEqual(ladder, ["porygon", "porygon", "porygon2", "porygon2", "porygonz", "porygonz", "porygonz", "porygonz"]);
  assert.ok(STREAK_LEVELS.every(id => LEVELS[id]), "every step is a 난이도 the computer knows");
});

test("the server's computer keeps its 난이도's play and thinks within the time that keeps its slowest choice under a second", () => {
  for (const wins of [0, 7, 14]) {
    const id = streakLevel(wins), options = streakCpuOptions(wins);
    assert.ok(options.budgetMs <= 400, `${id} thinks ${options.budgetMs} ms`);
    assert.equal(options.budgetMs, STREAK_BUDGET_MS[id]);
    // only the time is the server's: how weak the level plays (its slack, mistakes, reads) is the phone's own
    assert.deepEqual({ ...options, budgetMs: undefined }, { ...LEVELS[id].options, budgetMs: undefined });
  }
});
