import test from "node:test";
import assert from "node:assert/strict";
import { formatId, randomTeam, startBattle, choose, replay, setPool } from "../supabase/functions/battle/engine.mjs";
import { createCpu, quickChoice, revealed } from "../src/services/battleCpu.js";

// a seeded random, so a failure plays the same again
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// the computer against the quick player to the end: every choice it makes is one the engine takes, and the input log replays
function playOut(kind, seed) {
  const formatid = formatId("m-c", kind);
  const random = seeded(seed);
  const cpu = createCpu(formatid, { random, budgetMs: 15 });
  const battle = startBattle({ formatid, seed: [seed, 2, 3, 4], p1: { name: "사람", team: randomTeam(formatid, random) }, p2: { name: "컴퓨터", team: randomTeam(formatid, random, { meta: true }) } });
  let decisions = 0;
  for (let step = 0; step < 300 && !battle.ended; step++) {
    let moved = false;
    for (const side of ["p2", "p1"]) {
      const req = battle[side].activeRequest;
      if (!req || req.wait || battle[side].isChoiceDone()) continue;
      const choice = side === "p2" ? cpu.decide(battle, side) : quickChoice(battle, side);
      const done = choose(battle, null, side, choice);
      assert.ok(done.ok, `${kind} turn ${battle.turn}: ${side} ${choice} refused (${done.error})`);
      if (side === "p2") decisions++;
      moved = true;
    }
    if (!moved) break;
  }
  return { battle, decisions };
}

test("the computer plays a whole singles and doubles battle with choices the engine takes, and the battle replays", () => {
  for (const [kind, seed] of [["singles", 11], ["doubles", 23]]) {
    const { battle, decisions } = playOut(kind, seed);
    assert.ok(battle.ended, `${kind} battle ended`);
    assert.ok(decisions > 3, `${kind}: the computer chose ${decisions} times`);
    const timeless = log => log.filter(line => !line.startsWith("|t:|")).join("\n");
    assert.equal(timeless(replay(battle.inputLog.join("\n")).log), timeless(battle.log), `${kind} replays`);
  }
});

test("the computer's party is drawn by ladder usage; every species has at least three sample sets", () => {
  for (const reg of ["m-c", "m-b"]) for (const kind of ["singles", "doubles"]) {
    const pool = setPool(formatId(reg, kind));
    assert.ok(pool.length > 200, `${reg} ${kind}: ${pool.length} species`);
    for (const entry of pool) assert.ok(entry.sets.length >= 3, `${reg} ${kind} ${entry.species}: ${entry.sets.length} sets`);
  }
  // the most used species turn up far more often than the rarest
  const formatid = formatId("m-c", "doubles");
  const random = seeded(5);
  const pool = setPool(formatid);
  const top = new Set([...pool].sort((a, b) => b.usage - a.usage).slice(0, 20).map(e => e.species));
  let seen = 0;
  for (let i = 0; i < 40; i++) seen += randomTeam(formatid, random, { meta: true }).filter(set => top.has(set.species)).length;
  assert.ok(seen > 40 * 6 * 0.3, `top-20 species in meta parties: ${seen} of 240`);
});

test("what the other side has shown is read from the public lines only, by the Pokémon it belongs to", () => {
  const log = [
    "|split|p1", "|-heal|p1a: Incineroar|100/100|[from] item: Sitrus Berry", "|-heal|p1a: Incineroar|100/100|[from] item: Sitrus Berry",
    "|-ability|p1a: Incineroar|Intimidate|boost",
    "|-damage|p2a: Garchomp|80/100|[from] item: Rocky Helmet|[of] p1a: Amoonguss",
    "|-enditem|p1a: Rillaboom|Grassy Seed",
    "|-mega|p1a: Charizard|Charizard|Charizardite Y",
    "|-heal|p2a: Garchomp|100/100|[from] item: Leftovers",
  ];
  assert.deepEqual(revealed(log, "p1"), {
    Incineroar: { item: "Sitrus Berry", ability: "Intimidate" },
    Amoonguss: { item: "Rocky Helmet" },
    Rillaboom: { item: "Grassy Seed" },
    Charizard: { item: "Charizardite Y" },
  });
});

test("the computer never reads the other side's hidden set: what it believes changes with the sample sets, not with the truth", () => {
  const formatid = formatId("m-c", "singles");
  const odd = { name: "", species: "Garchomp", ability: "Rough Skin", item: "Lum Berry", moves: ["Earthquake", "Dragon Claw", "Swords Dance", "Fire Fang"], nature: "Jolly", evs: { hp: 2, atk: 32, spe: 32 }, level: 50 };
  const seen = new Set();
  for (let seed = 1; seed < 5; seed++) {
    const cpu = createCpu(formatid, { random: seeded(seed), budgetMs: 5 });
    const battle = startBattle({ formatid, seed: [seed, 1, 1, 1], p1: { name: "사람", team: [odd] }, p2: { name: "컴퓨터", team: randomTeam(formatid, seeded(seed)) } });
    // a team preview choice is legal and brings the right number
    const preview = cpu.decide(battle, "p2");
    assert.match(preview, /^team \d(, \d)*$/);
    assert.equal(preview.split(",").length, Math.min(3, battle.p2.pokemon.length));
    seen.add(preview);
  }
  assert.ok(seen.size >= 1);
});
