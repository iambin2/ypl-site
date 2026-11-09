import test from "node:test";
import assert from "node:assert/strict";
import { STREAK_BATTLE_FORMAT, STREAK_BUDGET_MS, STREAK_FORMAT_ID, STREAK_LEVELS, STREAK_REGULATION, floorGame, streakCpuOptions, streakFloor, streakFoeDraw, streakFresh, streakLevel, streakMaster, swapParty, swapTier, GATEKEEPERS, gatekeeperOf, gameWords } from "../src/services/streak.js";
import { LEVELS } from "../src/services/cpuLevels.js";
import POWER from "../src/data/species-power.json" with { type: "json" };

test("a floor is five games, the fifth its master, and a new floor brings a new party", () => {
  assert.deepEqual([0, 4, 5, 9, 10].map(streakFloor), [1, 1, 2, 2, 3]);
  assert.deepEqual([0, 3, 4, 5].map(floorGame), [1, 4, 5, 1]);
  assert.deepEqual([3, 4, 5, 9, 14].map(streakMaster), [false, true, false, true, true]);
  assert.deepEqual([0, 1, 5, 6, 10].map(streakFresh), [true, false, true, false, true]);
});

test("the screen's format id is the engine's", async () => {
  const { formatId } = await import("../supabase/functions/battle/engine.mjs");
  assert.equal(STREAK_FORMAT_ID, formatId(STREAK_REGULATION, STREAK_BATTLE_FORMAT));
});

test("a floor is one 난이도, its master included, and the last step stays", () => {
  const ladder = [0, 2, 4, 5, 7, 9, 10, 14, 15, 100].map(streakLevel);
  assert.deepEqual(ladder, ["porygon", "porygon", "porygon", "porygon2", "porygon2", "porygon2", "porygonz", "porygonz", "porygonz", "porygonz"]);
  assert.ok(STREAK_LEVELS.every(id => LEVELS[id]), "every step is a 난이도 the computer knows");
});

test("only a floor's gatekeeper brings a party drawn a tier up, with its floor's Mega, and past the fixed floors one drawn at random", () => {
  assert.deepEqual(streakFoeDraw(3), { meta: true });
  assert.deepEqual(streakFoeDraw(4), { meta: true, master: true, ace: { species: GATEKEEPERS[0].species, stone: GATEKEEPERS[0].stone } });
  assert.equal(streakFoeDraw(GATEKEEPERS.length * 5 - 1).ace.species, GATEKEEPERS.at(-1).species);
  assert.deepEqual(streakFoeDraw(GATEKEEPERS.length * 5 + 4), { meta: true, master: true, ace: true });
  assert.equal(gatekeeperOf(GATEKEEPERS.length + 1), null);
});

test("a game is said with Korean ordinals, and the fifth is the floor's gatekeeper", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(gameWords), ["1층 첫 번째 판", "1층 두 번째 판", "1층 세 번째 판", "1층 네 번째 판", "1층 수문장", "2층 첫 번째 판"]);
});

test("every gatekeeper's Mega is in the sample sets, and the engine stands it in the gatekeeper's party", async () => {
  const { randomTeam, formatId } = await import("../supabase/functions/battle/engine.mjs");
  const f = formatId(STREAK_REGULATION, STREAK_BATTLE_FORMAT);
  for (const [i, keeper] of GATEKEEPERS.entries()) {
    const team = randomTeam(f, Math.random, streakFoeDraw(i * 5 + 4));
    assert.equal(team.length, 6);
    assert.ok(team.some(m => m.species === keeper.species && m.item === keeper.stone), `${i + 1}층 ${keeper.species}`);
  }
});

test("the server's computer keeps its 난이도's play and thinks within the time that keeps its slowest choice under a second", () => {
  for (const wins of [0, 3, 5, 8, 10]) {
    const id = streakLevel(wins), options = streakCpuOptions(wins);
    assert.ok(options.budgetMs <= 400, `${id} thinks ${options.budgetMs} ms`);
    assert.equal(options.budgetMs, STREAK_BUDGET_MS[id]);
    // only the time is the server's: how weak the level plays (its slack, mistakes, reads) is the phone's own
    assert.deepEqual({ ...options, budgetMs: undefined }, { ...LEVELS[id].options, budgetMs: undefined });
  }
});

test("a swap is tier for tier, never brings two of a species, and an item twice is handed the one replaced", () => {
  // species from the measured table: two of one tier and one of another (partyBalance.js)
  const rated = Object.keys(POWER[STREAK_FORMAT_ID].rating).filter(s => !s.includes("-"));
  const a = rated[0], same = rated.filter(s => s !== a && swapTier(s) === swapTier(a)), other = rated.find(s => swapTier(s) !== swapTier(a));
  const [b, c] = same;
  const party = [{ species: a, item: "Focus Sash" }, { species: other, item: "Leftovers" }];
  const foes = [{ species: b, item: "Choice Scarf", name: "x" }, { species: c, item: "Leftovers" }, { species: rated.find(s => swapTier(s) !== swapTier(a) && s !== other), item: "Life Orb" }];
  assert.deepEqual(swapParty(party, foes, a, b), [{ species: b, item: "Choice Scarf", name: "" }, party[1]]);
  assert.equal(swapParty(party, foes, a, foes[2].species), "tier", "another tier");
  assert.equal(swapParty(party, foes, a, c)[0].item, "Focus Sash", "a second Leftovers: it takes the item of the one it replaces");
  assert.equal(swapParty([{ species: a, item: "Blazikenite" }, { species: other, item: "Leftovers" }], foes, a, c), "clash", "a Mega Stone is not handed on");
  assert.equal(swapParty([{ species: a, item: "Focus Sash" }, { species: b, item: "Leftovers" }], [{ species: b, item: "Life Orb" }, ...foes], a, b), "clash", "a second species");
  assert.equal(swapParty(party, foes, "Mew", b), "missing");
});

test("a swap finds a form the team preview hides (Gourgeist-*) by its species", () => {
  const party = [{ species: "Gourgeist-Small", item: "Sitrus Berry" }];
  const foes = [{ species: "Mew", item: "Life Orb" }];
  assert.notEqual(swapParty(party, foes, "Gourgeist-*", "Mew"), "missing", "found by the hidden form's species");
  assert.equal(swapParty(party, foes, "Pumpkaboo-*", "Mew"), "missing", "the species must match, not only the mark");
});

test("a form is one species however it is spelled: the input log's 'Squawkabilly Blue' is the sample sets' 'Squawkabilly-Blue'", () => {
  assert.equal(swapTier("Squawkabilly Blue"), swapTier("Squawkabilly-Blue"));
  const party = [{ species: "Squawkabilly-Blue", item: "Choice Scarf" }];
  assert.notEqual(swapParty(party, [{ species: "Squawkabilly Blue", item: "Leftovers" }], "Squawkabilly-Blue", "Squawkabilly-Blue"), "missing");
});
