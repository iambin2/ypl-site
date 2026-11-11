import test from "node:test";
import assert from "node:assert/strict";
import { STREAK_BAN, STREAK_DRAFT, STREAK_LIVES, STREAK_START_LIVES, RANK_BANDS, bandOf, doorsOf, runTrack, seeded, streakReach, streakRelights, STREAK_BATTLE_FORMAT, STREAK_STEPS, STREAK_FORMAT_ID, STREAK_REGULATION, floorGame, streakCpuOptions, streakFloor, streakFresh, streakStep, streakMaster, swapParty, swapTier, gameWords } from "../src/services/streak.js";
import { LEVELS } from "../src/services/cpuLevels.js";
import TOWER_TIERS from "../src/data/tower-tiers.json" with { type: "json" };
import RANKER from "../src/data/ranker-teams.json" with { type: "json" };

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
  // a floor's even games stand on its step, its gatekeeper and a strong door one over; the fifth floor and up at the top (14.6)
  assert.deepEqual([0, 3, 4, 5, 9, 10, 15, 20, 100].map(w => STREAK_STEPS[streakStep(w)].id), ["tower0", "tower0", "tower1", "tower1", "porygon", "porygon", "porygon2", "porygonz", "porygonz"]);
  assert.deepEqual([0, 5, 20].map(w => STREAK_STEPS[streakStep(w, true)].id), ["tower1", "porygon", "porygonz"]);
  assert.ok(STREAK_STEPS.filter(s => s.id in LEVELS).every(s => s.options === LEVELS[s.id].options), "the site's levels are played as they are");
});

test("the foes come from rank bands: a floor's own, a strong door one up, a gatekeeper two up, the top band the ceiling (14장)", () => {
  assert.deepEqual([0, 3, 5, 10, 15, 50].map(w => bandOf(w)), [0, 0, 1, 2, 3, 3]);
  assert.deepEqual([0, 5, 15, 50].map(w => bandOf(w, "hard")), [1, 2, 4, 4]);
  assert.deepEqual([4, 9, 14, 19, 54].map(w => bandOf(w)), [2, 3, 4, 4, 4], "a gatekeeper two bands over its floor");
  // every band holds teams of the open data
  for (const [hi, lo] of RANK_BANDS) assert.ok(RANKER.teams.some(t => t.rank >= hi && t.rank <= lo), `${hi}-${lo}`);
});

test("the doors: two before an even game, the gatekeeper's alone before its game; only a gatekeeper beaten lights the spare, a strong door reaches a tier up", () => {
  assert.deepEqual(doorsOf(0), ["even", "hard"]);
  assert.deepEqual(doorsOf(4), ["gate"]);
  assert.deepEqual([streakRelights(2), streakRelights(4)], [false, true]);
  assert.deepEqual([streakReach(2), streakReach(2, true), streakReach(4)], [false, true, true]);
});

test("a trade reaches a tier up only when it may, and never down", () => {
  const rated = Object.keys(TOWER_TIERS).filter(s => !s.includes("-"));
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
  const { draftParty } = await import("../supabase/functions/battle/engine.mjs");
  const { draftOffer } = await import("../supabase/functions/battle/streakEngine.mjs");
  for (let i = 0; i < 20; i++) {
    const offer = draftOffer(seeded(`draft:${i}`), { ban: STREAK_BAN, count: STREAK_DRAFT });
    assert.equal(offer.length, 6);
    assert.ok(offer.every(row => row.length === STREAK_DRAFT));
    const all = offer.flat().map(c => c.species);
    assert.equal(new Set(all).size, all.length);
    assert.ok(offer.every((row, t) => row.every(c => swapTier(c.species) === t)), "each row is its tier");
    assert.ok(offer.flat().every(c => c.species in TOWER_TIERS), "only species the ladder's top teams bring");
    const picks = offer.map(row => (row.find(c => !c.mega) || row[0]).species);
    const team = draftParty(STREAK_FORMAT_ID, offer, picks);
    assert.ok(Array.isArray(team), String(team));
    assert.equal(new Set(team.map(m => m.item)).size, 6);
    assert.ok(team.every(m => !STREAK_BAN.items.includes(m.item)));
  }
  const offer = draftOffer(seeded("draft:x"), { ban: STREAK_BAN });
  assert.equal(draftParty(STREAK_FORMAT_ID, offer, offer.map(() => "Mew")), "pick");
  assert.equal(draftParty(STREAK_FORMAT_ID, offer, offer.slice(1).map(r => r[0].species)), "pick");
});

test("a game is said with Korean ordinals, and the fifth is the floor's gatekeeper", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(gameWords), ["1층 첫 번째 판", "1층 두 번째 판", "1층 세 번째 판", "1층 네 번째 판", "1층 수문장", "2층 첫 번째 판"]);
});

test("a foe is a whole ranker team of its band, its items as the ranker held them, legal and free of the ban", async () => {
  const { foeTeam } = await import("../supabase/functions/battle/streakEngine.mjs");
  const { validateTeam } = await import("../supabase/functions/battle/engine.mjs");
  for (let i = 0; i < 40; i++) for (const kind of ["even", "hard"]) {
    const wins = (i * 3) % 30, foe = foeTeam(wins, kind, seeded(`foe:${i}:${kind}`));
    const [hi, lo] = RANK_BANDS[bandOf(wins, kind)];
    assert.ok(foe.rank >= hi && foe.rank <= lo, `${foe.rank} in ${hi}-${lo}`);
    const source = RANKER.teams.find(t => t.season === foe.season && t.rank === foe.rank && t.team.every((m, j) => m.species === foe.team[j].species));
    assert.ok(source, "the very team of the open data");
    source.team.forEach((m, j) => { if (m.item && !STREAK_BAN.items.includes(m.item)) assert.equal(foe.team[j].item, m.item); });
    assert.equal(validateTeam(STREAK_FORMAT_ID, foe.team), null);
    assert.ok(foe.team.every(m => !STREAK_BAN.items.includes(m.item) && !m.moves.some(move => STREAK_BAN.moves.includes(move))));
  }
});

test("the server's computer keeps its 난이도's play and thinks within the time that keeps its slowest choice under a second", () => {
  for (const wins of [0, 3, 5, 8, 10, 20]) for (const hard of [false, true]) {
    const step = STREAK_STEPS[streakStep(wins, hard)], options = streakCpuOptions(wins, hard);
    assert.ok(options.budgetMs <= 400, `${step.id} thinks ${options.budgetMs} ms`);
    assert.deepEqual(options, { ...step.options, budgetMs: step.budgetMs });
  }
});

test("a swap is tier for tier, never brings two of a species, and an item twice is handed the one replaced", () => {
  // species from the measured table: two of one tier and one of another (partyBalance.js)
  const rated = Object.keys(TOWER_TIERS).filter(s => !s.includes("-"));
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

test("a run's games are read with the wins before each and the lamps it was gone into with: two to start, a loss puts one out, a gatekeeper beaten lights one again, two at most (14장)", () => {
  const g = (id, winner, status = "ended") => ({ id, winner, status });
  // a loss (the same game again), four wins and the gatekeeper (a lamp lit again), then a game being played
  const track = runTrack([g("a", "p2"), g("b", "p1"), g("c", "p1"), g("d", "p1"), g("e", "p1"), g("f", "p1"), g("h", null, "active")]);
  assert.deepEqual(track.map(x => [x.id, x.at, x.lives]), [["a", 0, 2], ["b", 0, 1], ["c", 1, 1], ["d", 2, 1], ["e", 3, 1], ["f", 4, 1], ["h", 5, 2]]);
  assert.equal(track.over, false);
  assert.equal(STREAK_START_LIVES, 2);
  // a tie is a lost game too; two lost games end a run
  assert.equal(runTrack([g("a", "tie")]).over, false);
  assert.equal(runTrack([g("a", "p2"), g("b", "tie")]).over, true);
  // a lamp is never lit past two: two gatekeepers beaten with no loss
  const ten = Array.from({ length: 10 }, (_, i) => g(String(i), "p1"));
  assert.equal(runTrack([...ten, g("x", null, "active")]).at(-1).lives, STREAK_LIVES);
  assert.deepEqual([...runTrack([])], []);
});

test("the tower's random parties (a screen from before the draft) hold none of the banned items or moves, and every tier still has its species", async () => {
  const { randomTeam, setPool } = await import("../supabase/functions/battle/engine.mjs");
  const held = team => team.filter(m => STREAK_BAN.items.includes(m.item) || m.moves.some(move => STREAK_BAN.moves.includes(move)));
  // the pool does hold them, so the test would catch a ban that stopped working
  assert.ok(setPool(STREAK_FORMAT_ID).some(e => e.sets.some(s => s.items.some(i => STREAK_BAN.items.includes(i)) || s.moves.some(m => STREAK_BAN.moves.includes(m)))));
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 150; i++) {
    const team = randomTeam(STREAK_FORMAT_ID, random, { ban: STREAK_BAN });
    assert.equal(team.length, 6);
    assert.deepEqual(held(team), []);
  }
  // an unbanned draw is untouched by the banned pool (the tiers are kept for each pool)
  assert.equal(randomTeam(STREAK_FORMAT_ID, random).length, 6);
});
