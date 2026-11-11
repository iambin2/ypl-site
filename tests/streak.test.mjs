import test from "node:test";
import assert from "node:assert/strict";
import { STREAK_BAN, STREAK_DRAFT, STREAK_LIVES, FLOOR_TYPES, doorsOf, floorType, foePlan, foeSteps, runTrack, seeded, streakRelights, STREAK_BATTLE_FORMAT, STREAK_BUDGET_MS, STREAK_FORMAT_ID, STREAK_LEVELS, STREAK_REGULATION, floorGame, streakCpuOptions, streakFloor, streakFoeDraw, streakFresh, streakLevel, streakMaster, swapParty, swapTier, GATEKEEPERS, gatekeeperOf, gameWords } from "../src/services/streak.js";
import { LEVELS } from "../src/services/cpuLevels.js";
import POWER from "../src/data/species-power.json" with { type: "json" };
import { MASTER_PLAN } from "../src/services/partyBalance.js";

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

test("a floor's foes climb a step a floor, a gatekeeper and a strong door two over it, gathered on the floor's type; the gatekeeper brings its floor's Mega", () => {
  assert.deepEqual(streakFoeDraw(3), { meta: true, ban: STREAK_BAN, plan: [0, 1, 2, 3, 4, 5], prefer: "Fighting" });
  // the first gatekeeper's plan is the one measured as MASTER_PLAN (11장)
  assert.deepEqual(streakFoeDraw(4), { meta: true, ban: STREAK_BAN, plan: MASTER_PLAN, prefer: "Fighting", ace: { species: GATEKEEPERS[0].species, stone: GATEKEEPERS[0].stone } });
  assert.deepEqual(streakFoeDraw(3, true).plan, MASTER_PLAN, "a strong door is a gatekeeper's plan without its Mega");
  assert.equal(streakFoeDraw(3, true).ace, undefined);
  assert.equal(streakFoeDraw(GATEKEEPERS.length * 5 - 1).ace.species, GATEKEEPERS.at(-1).species);
  assert.equal(streakFoeDraw(GATEKEEPERS.length * 5 + 4).ace, true);
  assert.equal(gatekeeperOf(GATEKEEPERS.length + 1), null);
  // a step a floor up to the fifth, never weaker than the floor under it, every plan six of the tiers
  const steps = Array.from({ length: 60 }, (_, w) => foeSteps(w));
  assert.deepEqual([0, 5, 10, 15, 20, 25, 50].map(w => foeSteps(w)), [0, 1, 2, 3, 4, 4, 4]);
  for (let w = 1; w < 60; w++) if (floorGame(w) === 1) assert.ok(steps[w] >= steps[w - 5]);
  for (let w = 0; w < 60; w++) for (const hard of [false, true]) { const p = foePlan(w, hard); assert.equal(p.length, 6); assert.ok(p.every(t => t >= 0 && t < 6)); }
  // each of the eight floors takes its gatekeeper's type; above them the types go round, every one a type the engine knows
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(floorType), FLOOR_TYPES);
  assert.ok(Array.from({ length: 30 }, (_, i) => floorType(i + 9)).every(Boolean));
});

test("the doors: two before an even game, the gatekeeper's alone before its game; a strong door or a gatekeeper beaten lights a lamp", () => {
  assert.deepEqual(doorsOf(0), ["even", "hard"]);
  assert.deepEqual(doorsOf(4), ["gate"]);
  assert.deepEqual([streakRelights(2), streakRelights(2, true), streakRelights(4)], [false, true, true]);
});

test("a trade reaches a tier up only when it may, and never down", () => {
  const rated = Object.keys(POWER[STREAK_FORMAT_ID].rating).filter(s => !s.includes("-"));
  const of = t => rated.find(s => swapTier(s) === t);
  const party = [{ species: of(3), item: "Leftovers" }];
  assert.equal(swapParty(party, [{ species: of(2), item: "Life Orb" }], of(3), of(2)), "tier", "one up needs the reach");
  assert.equal(swapParty(party, [{ species: of(2), item: "Life Orb" }], of(3), of(2), 1)[0].species, of(2));
  assert.equal(swapParty(party, [{ species: of(1), item: "Life Orb" }], of(3), of(1), 1), "tier", "two up is too far");
  assert.equal(swapParty(party, [{ species: of(4), item: "Life Orb" }], of(3), of(4), 1), "tier", "never down");
});

test("a seeded draw is the same for the same key and differs between keys (오늘의 탑)", () => {
  const a = seeded("2026-11-11:draft"), b = seeded("2026-11-11:draft"), c = seeded("2026-11-12:draft");
  const take = r => Array.from({ length: 5 }, r);
  assert.deepEqual(take(a), take(b));
  assert.notDeepEqual(take(seeded("2026-11-11:draft")), take(c));
  assert.ok(take(seeded("x")).every(v => v >= 0 && v < 1));
});

test("the draft: three of each tier, all species apart; a party picked from it is legal, holds no item twice and at most one Mega", async () => {
  const { draftOffer, draftParty } = await import("../supabase/functions/battle/engine.mjs");
  for (let i = 0; i < 20; i++) {
    const offer = draftOffer(STREAK_FORMAT_ID, seeded(`draft:${i}`), { ban: STREAK_BAN, count: STREAK_DRAFT });
    assert.equal(offer.length, 6);
    assert.ok(offer.every(row => row.length === STREAK_DRAFT));
    const all = offer.flat().map(c => c.species);
    assert.equal(new Set(all).size, all.length);
    assert.ok(offer.every((row, t) => row.every(c => swapTier(c.species) === t)), "each row is its tier");
    const picks = offer.map(row => (row.find(c => !c.mega) || row[0]).species);
    const team = draftParty(STREAK_FORMAT_ID, offer, picks);
    assert.ok(Array.isArray(team), String(team));
    assert.equal(new Set(team.map(m => m.item)).size, 6);
    assert.ok(team.every(m => !STREAK_BAN.items.includes(m.item)));
  }
  const offer = draftOffer(STREAK_FORMAT_ID, seeded("draft:x"), { ban: STREAK_BAN });
  assert.equal(draftParty(STREAK_FORMAT_ID, offer, offer.map(() => "Mew")), "pick");
  assert.equal(draftParty(STREAK_FORMAT_ID, offer, offer.slice(1).map(r => r[0].species)), "pick");
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
  assert.equal(swapParty([{ species: a, item: "Blazikenite" }, { species: other, item: "Leftovers" }], foes, a, c), "item", "a Mega Stone is not handed on");
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

test("a run's games are read with the wins before each and the lamps it was gone into with: a loss puts one out, a gatekeeper beaten lights one again", () => {
  const g = (id, winner, status = "ended") => ({ id, winner, status });
  // a tied game is stored with the winner "tie" (battles.winner)
  // won, lost, won again (the same game), three more wins and the gatekeeper, then a game being played
  const track = runTrack([g("a", "p1"), g("b", "p2"), g("c", "p1"), g("d", "p1"), g("e", "p1"), g("f", "p1"), g("g", null, "active")]);
  assert.deepEqual(track.map(x => [x.id, x.at, x.lives]), [["a", 0, 3], ["b", 1, 3], ["c", 1, 2], ["d", 2, 2], ["e", 3, 2], ["f", 4, 2], ["g", 5, 3]]);
  assert.equal(track.over, false);
  // three lost games end it, a tie and the clock being lost games too; a lamp is never lit past three
  assert.equal(runTrack([g("a", "p2"), g("b", "tie"), g("c", "p2")]).over, true);
  assert.equal(runTrack([g("a", "p1"), g("b", "p1"), g("c", "p1"), g("d", "p1"), g("e", "p1"), g("f", null, "active")]).at(-1).lives, STREAK_LIVES);
  assert.deepEqual([...runTrack([])], []);
});

test("the tower's parties, both sides and every gatekeeper's, hold none of the banned items or moves, and every tier still has its species", async () => {
  const { randomTeam, setPool } = await import("../supabase/functions/battle/engine.mjs");
  const held = team => team.filter(m => STREAK_BAN.items.includes(m.item) || m.moves.some(move => STREAK_BAN.moves.includes(move)));
  // the pool does hold them, so the test would catch a ban that stopped working
  assert.ok(setPool(STREAK_FORMAT_ID).some(e => e.sets.some(s => s.items.some(i => STREAK_BAN.items.includes(i)) || s.moves.some(m => STREAK_BAN.moves.includes(m)))));
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 150; i++) {
    for (const draw of [{ ban: STREAK_BAN }, streakFoeDraw(i % 50)]) {
      const team = randomTeam(STREAK_FORMAT_ID, random, draw);
      assert.equal(team.length, 6);
      assert.deepEqual(held(team), []);
    }
  }
  // an unbanned draw is untouched by the banned pool (the tiers are kept for each pool)
  assert.equal(randomTeam(STREAK_FORMAT_ID, random).length, 6);
});
