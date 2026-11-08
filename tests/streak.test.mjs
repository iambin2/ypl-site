import test from "node:test";
import assert from "node:assert/strict";
import { MASTER_TOP, STREAK_BUDGET_MS, STREAK_LEVELS, floorGame, streakCpuOptions, streakFloor, streakFoeDraw, streakFresh, streakLevel, streakMaster, streakStake, swapParty } from "../src/services/streak.js";
import { LEVELS } from "../src/services/cpuLevels.js";

test("a floor is seven games, the seventh its master, and a new floor brings a new party", () => {
  assert.deepEqual([0, 6, 7, 13, 14].map(streakFloor), [1, 1, 2, 2, 3]);
  assert.deepEqual([0, 3, 6, 7].map(floorGame), [1, 4, 7, 1]);
  assert.deepEqual([5, 6, 7, 13, 20].map(streakMaster), [false, true, false, true, true]);
  assert.deepEqual([0, 1, 7, 8, 14].map(streakFresh), [true, false, true, false, true]);
});

test("the 난이도 rises at the middle of each floor, the master stands with the upper half, and the last step stays", () => {
  const ladder = [0, 2, 3, 6, 7, 9, 10, 13, 14, 16, 17, 20, 100].map(streakLevel);
  assert.deepEqual(ladder, ["porygon", "porygon", "porygon2", "porygon2", "porygon2", "porygon2", "porygonz", "porygonz", "porygonz", "porygonz", "porygonz", "porygonz", "porygonz"]);
  assert.ok(STREAK_LEVELS.every(id => LEVELS[id]), "every step is a 난이도 the computer knows");
});

test("only the master brings a party from the most used Pokémon", () => {
  assert.deepEqual(streakFoeDraw(5), { meta: true });
  assert.deepEqual(streakFoeDraw(6), { meta: true, top: MASTER_TOP });
});

test("the server's computer keeps its 난이도's play and thinks within the time that keeps its slowest choice under a second", () => {
  for (const wins of [0, 3, 7, 10, 14]) {
    const id = streakLevel(wins), options = streakCpuOptions(wins);
    assert.ok(options.budgetMs <= 400, `${id} thinks ${options.budgetMs} ms`);
    assert.equal(options.budgetMs, STREAK_BUDGET_MS[id]);
    // only the time is the server's: how weak the level plays (its slack, mistakes, reads) is the phone's own
    assert.deepEqual({ ...options, budgetMs: undefined }, { ...LEVELS[id].options, budgetMs: undefined });
  }
});

test("the stake says what the next win changes: a place, the month's best, the master, or what a loss ends", () => {
  const board = [
    { place: 1, wins: 9, mine: false }, { place: 2, wins: 5, mine: false }, { place: 3, wins: 4, mine: true, live: false }, { place: 4, wins: 2, mine: false },
  ];
  // a tie stays under whoever reached it first: 5 wins is still 3rd behind the 5 reached earlier, 6 is 2nd
  assert.equal(streakStake(4, board), "이기면 이번 달 내 최고 기록이 됩니다.");
  assert.equal(streakStake(5, board), "이기면 2위에 오르고 이번 달 내 최고 기록이 됩니다.");
  assert.equal(streakStake(2, board), "이기면 3위에 오릅니다.");
  assert.equal(streakStake(6, board), "층의 주인과의 판입니다. 이기면 2층에 오릅니다.");
  // the run is itself the month's best (its row is live): every win is a new best
  assert.equal(streakStake(10, [{ place: 1, wins: 10, mine: true, live: true }]), "이기면 이번 달 내 최고 기록이 됩니다.");
  assert.equal(streakStake(2, [{ place: 1, wins: 30, mine: false }, { place: 2, wins: 12, mine: true, live: false }]), "지면 2연승에서 도전이 끝납니다.");
  assert.equal(streakStake(0, null), "지면 도전이 끝납니다.");
});

test("a swap takes one of the beaten party for one of ours, never two of a species or an item", () => {
  const party = [{ species: "Garchomp", item: "Focus Sash" }, { species: "Primarina", item: "Leftovers" }];
  const foes = [{ species: "Gholdengo", item: "Choice Scarf", name: "x" }, { species: "Garchomp", item: "Life Orb" }, { species: "Corviknight", item: "Leftovers" }];
  assert.deepEqual(swapParty(party, foes, "Primarina", "Gholdengo"), [party[0], { species: "Gholdengo", item: "Choice Scarf", name: "" }]);
  assert.equal(swapParty(party, foes, "Primarina", "Garchomp"), "clash", "a second Garchomp");
  assert.equal(swapParty(party, foes, "Garchomp", "Corviknight"), "clash", "a second Leftovers");
  assert.equal(swapParty(party, foes, "Mew", "Gholdengo"), "missing");
});

test("a swap finds a form the team preview hides (Gourgeist-*, Greninja-*) by its species", () => {
  const party = [{ species: "Gourgeist-Small", item: "Sitrus Berry" }, { species: "Primarina", item: "Leftovers" }];
  const foes = [{ species: "Greninja", item: "Life Orb" }, { species: "Gholdengo", item: "Choice Scarf" }];
  assert.deepEqual(swapParty(party, foes, "Gourgeist-*", "Greninja-*").map(m => m.species), ["Greninja", "Primarina"]);
  assert.equal(swapParty(party, foes, "Gourgeist-*", "Gholdengo")[0].species, "Gholdengo");
  assert.equal(swapParty(party, foes, "Pumpkaboo-*", "Gholdengo"), "missing", "the species must match, not only the mark");
});
