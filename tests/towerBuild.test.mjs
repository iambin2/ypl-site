// 도전의 탑의 상대 파티 (docs/BATTLE_STREAK.md 15장): 빌더 넷이 고루, 다양하게, 같은 세기로 짜는가
import test from "node:test";
import assert from "node:assert/strict";
import { BUILDER_NAMES, OFFENCE, roleOf, towerFoe, wholePool } from "../supabase/functions/battle/towerBuild.mjs";
import { validateTeam } from "../supabase/functions/battle/engine.mjs";
import { STREAK_BAN, STREAK_FORMAT_ID, seeded } from "../src/services/streak.js";
import { ratingOf } from "../src/services/partyBalance.js";

test("every set of the pool has a main role, and no main role is empty", () => {
  const count = {};
  for (const e of wholePool()) for (const s of e.sets) count[roleOf(e.species, s).primary] = (count[roleOf(e.species, s).primary] || 0) + 1;
  for (const role of ["setup", "physical", "special", "bulky", "support"]) assert.ok(count[role] >= 50, `${role}: ${count[role]}`);
});

test("the foes are many and alike in strength: 4000 parties, a thousand of each builder (15.7)", () => {
  const random = seeded("tower-foes"), N = 4000, pool = wholePool().length;
  const times = new Map(), seen = new Set(), shares = {};
  let twice = 0;
  for (let i = 0; i < N; i++) {
    const builder = BUILDER_NAMES[i % BUILDER_NAMES.length];
    const { team } = towerFoe(random, [], builder);
    assert.equal(team.length, 6);
    assert.ok(team.every(m => !STREAK_BAN.items.includes(m.item) && !m.moves.some(x => STREAK_BAN.moves.includes(x))), "free of the ban");
    assert.ok(team.filter(m => /ite( [XYZ])?$/.test(m.item) && m.item !== "Eviolite").length <= 1, "one Mega at most");
    assert.equal(new Set(team.map(m => m.item)).size, 6, "no item twice");
    if (i % 50 === 0) assert.equal(validateTeam(STREAK_FORMAT_ID, team), null);
    const key = team.map(m => m.species).sort().join();
    if (seen.has(key)) twice++;
    seen.add(key);
    for (const m of team) times.set(m.species, (times.get(m.species) || 0) + 1);
    (shares[builder] ||= []).push(team.reduce((s, m) => s + ratingOf(STREAK_FORMAT_ID, m.species), 0));
  }
  const mean = (N * 6) / pool, most = Math.max(...times.values());
  assert.ok(times.size >= 250, `${times.size} of ${pool} species came`);
  assert.ok(most <= mean * 3.5, `the most drawn came ${most} times, the mean ${mean.toFixed(1)}`);
  assert.ok(twice <= N * 0.001, `${twice} parties came twice`);
  const means = Object.values(shares).map(list => list.reduce((s, x) => s + x, 0) / list.length);
  assert.ok(Math.max(...means) - Math.min(...means) <= 0.1, `the builders' mean shares ${means.map(m => m.toFixed(3))}`);
});

test("a foe has an attacker, and a run seldom shows a species twice (15.6)", () => {
  const random = seeded("tower-run");
  let again = 0;
  for (let run = 0; run < 10; run++) {
    const seen = [];
    for (let game = 0; game < 20; game++) {
      for (let door = 0; door < 2; door++) {
        const { team } = towerFoe(random, seen.slice(-36));
        assert.ok(team.some(m => [...wholePool()].find(e => e.species === m.species).sets.some(s => s.moves.join() === m.moves.join() && OFFENCE.has(roleOf(m.species, s).primary))), "an attacker");
        again += team.filter(m => seen.slice(-36).includes(m.species)).length;
        seen.push(...team.map(m => m.species));
      }
    }
  }
  assert.ok(again / 200 <= 0.5, `${(again / 200).toFixed(2)} species seen again a game`);
});

test("the same draw makes the same foe (오늘의 탑)", () => {
  assert.deepEqual(towerFoe(seeded("day:1")), towerFoe(seeded("day:1")));
});
