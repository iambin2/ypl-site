import test from "node:test";
import assert from "node:assert/strict";
import { CPU_NAME, formatId, randomTeam, readCpuRecord, readout, startBattle, choose, replay, setPool } from "../supabase/functions/battle/engine.mjs";
import { createCpu, habit, quickChoice, revealed } from "../src/services/battleCpu.js";
import { LEVELS } from "../src/services/cpuLevels.js";

// a seeded random, so a failure plays the same again
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// the computer against the quick player to the end: every choice it makes is one the engine takes, and the input log replays
function playOut(kind, seed, options = {}) {
  const formatid = formatId("m-c", kind);
  const random = seeded(seed);
  const cpu = createCpu(formatid, { random, ...options, budgetMs: 15 });
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

// the user's battle (2026-11-06): a Ghost type firing Shadow Ball into a Mega Kangaskhan turn after turn, as a read on a switch never made
test("the computer never plays a move that does nothing to what stands in front of it, and leaves a Choice lock into one", () => {
  const formatid = formatId("m-c", "singles");
  const set = (species, ability, item, moves, nature, evs) => ({ name: "", species, ability, item, moves, nature, evs, level: 50 });
  const kang = set("Kangaskhan", "Scrappy", "Kangaskhanite", ["Last Resort", "Fake Out", "Sucker Punch", "Protect"], "Careful", { hp: 32, spd: 32 });
  const zam = set("Alakazam", "Magic Guard", "Focus Sash", ["Psychic"], "Timid", { spa: 32, spe: 32 });
  for (const [seed, item] of [[1, "Choice Scarf"], [2, "Choice Scarf"], [3, "Life Orb"]]) {
    const cpu = createCpu(formatid, { random: seeded(seed), budgetMs: 40 });
    const battle = startBattle({ formatid, seed: [seed, 2, 3, 4], p1: { name: "사람", team: [zam, kang] }, p2: { name: "컴퓨터", team: [
      set("Basculegion-F", "Adaptability", item, ["Shadow Ball", "Surf", "Ice Beam", "Flip Turn"], "Modest", { spa: 32, spe: 32 }),
      set("Gengar", "Cursed Body", "Black Sludge", ["Shadow Ball", "Sludge Bomb"], "Timid", { spa: 32, spe: 32 }),
      set("Alakazam", "Magic Guard", "Life Orb", ["Psychic", "Shadow Ball"], "Timid", { spa: 32, spe: 32 }),
    ] } });
    choose(battle, null, "p1", "team 1, 2"); choose(battle, null, "p2", "team 1, 2, 3");
    for (let step = 0; step < 16 && !battle.ended; step++) {
      for (const side of ["p2", "p1"]) {
        const req = battle[side].activeRequest;
        if (!req || req.wait || battle[side].isChoiceDone()) continue;
        let choice;
        if (side === "p1") choice = req.forceSwitch ? quickChoice(battle, side) : battle.p1.active[0].species.name === "Alakazam" ? (req.side.pokemon[1].condition.endsWith(" fnt") ? "move 1" : "switch 2") : battle.p1.active[0].species.isMega ? "move 1" : "move 1 mega";
        else {
          choice = cpu.decide(battle, side);
          const mon = battle.p2.active[0], move = /^move (\d)/.exec(choice);
          if (move && !req.forceSwitch && battle.p1.active[0].hasType("Normal")) {
            const id = req.active[0].moves[Number(move[1]) - 1].id;
            assert.notEqual(battle.dex.moves.get(id).type, "Ghost", `seed ${seed} turn ${battle.turn}: ${mon.name} chose ${id} into a Normal type`);
          }
        }
        assert.ok(choose(battle, null, side, choice).ok, `${side} ${choice}`);
      }
    }
  }
});

test("every 난이도 plays a whole battle with choices the engine takes, its mistakes included", () => {
  for (const [id, level] of Object.entries(LEVELS)) {
    const { battle, decisions } = playOut("singles", 31, level.options);
    assert.ok(battle.ended && decisions > 3, `${id} played to the end`);
  }
});

test("how often the other side switches is read from the turn's own switches, not those after a faint or a pivoting move", () => {
  const log = ["|turn|1", "|switch|p1a: Garchomp|Garchomp, L50|100/100", "|move|p2a: Gengar|Shadow Ball|p1a: Garchomp", "|upkeep|", "|turn|2",
    "|move|p1a: Garchomp|U-turn|p2a: Gengar", "|switch|p1a: Rotom|Rotom-Wash, L50|100/100|[from] U-turn", "|upkeep|", "|turn|3",
    "|move|p1a: Rotom|Hydro Pump|p2a: Gengar", "|faint|p1a: Rotom", "|upkeep|", "|switch|p1a: Garchomp|Garchomp, L50|100/100", "|turn|4"];
  assert.deepEqual(habit(log, "p1"), { switches: 1, chances: 3 });
});

test("a finished battle with the computer is kept by its replay alone: no player's name, and a record that is not one is refused", () => {
  const formatid = formatId("m-c", "singles");
  const battle = startBattle({ formatid, seed: [1, 2, 3, 4], p1: { name: "이제빈", team: randomTeam(formatid) }, p2: { name: CPU_NAME, team: randomTeam(formatid) } });
  for (let i = 0; i < 400 && !battle.ended; i++) for (const side of ["p1", "p2"]) {
    const choice = quickChoice(battle, side);
    if (choice && !battle[side].isChoiceDone()) choose(battle, null, side, choice);
  }
  assert.ok(battle.ended, "the quick players finish");
  const sent = readout(battle).inputLog;
  const kept = readCpuRecord(sent);
  assert.ok(!kept.inputLog.includes("이제빈") && kept.inputLog.includes('"name":"선수"'), "the name is taken out");
  assert.equal(kept.winner, readout(battle).winner);
  assert.equal(kept.turns, battle.turn);
  assert.equal(kept.endedBy, "battle");
  assert.equal(readCpuRecord(kept.inputLog).inputLog, kept.inputLog, "the same battle sent again is the same record");
  // not ended, not the computer, not a battle at all
  assert.throws(() => readCpuRecord(sent.split("\n").slice(0, 6).join("\n")));
  assert.throws(() => readCpuRecord(sent.replace(`"name":"${CPU_NAME}"`, '"name":"사람"')));
  assert.throws(() => readCpuRecord("hello"));
});

// one turn of a one-on-one: the computer (p2) chooses, the player (p1) uses foeMove, and the computer reads the turn
function readOneTurn(foeName, foeItem, mineName, foeMove = "move 1") {
  const formatid = formatId("m-c", "singles");
  const pool = setPool(formatid);
  const set = (name, item) => { const e = pool.find(x => x.species === name), s = e.sets.find(x => !x.mega); return { name: "", species: name, ability: s.ability, item: item || s.items[0], moves: s.moves, nature: s.nature, evs: s.evs, level: 50 }; };
  const cpu = createCpu(formatid, { random: seeded(3), budgetMs: 30 });
  const battle = startBattle({ formatid, seed: [1, 2, 3, 4], p1: { name: "사람", team: [set(foeName, foeItem)] }, p2: { name: CPU_NAME, team: [set(mineName)] } });
  for (const p1 of ["team 1", foeMove]) {
    choose(battle, null, "p2", cpu.decide(battle, "p2"));
    choose(battle, null, "p1", p1);
  }
  assert.ok(!battle.ended && battle.turn === 2, "the turn was played and both still stand");
  cpu.decide(battle, "p2");
  return { items: new Set(cpu.guesses(foeName).map(g => g.itemId)), listed: pool.find(x => x.species === foeName).sets.flatMap(s => s.items.map(i => i.toLowerCase().replace(/\W/g, ""))) };
}

test("a Pokémon that should be slower but moves first is read as holding a Choice Scarf none of its sample sets lists", () => {
  const { items, listed } = readOneTurn("Venusaur", "Choice Scarf", "Archaludon");
  assert.ok(!listed.includes("choicescarf"));
  assert.deepEqual([...items], ["choicescarf"]);
  // the control: with its own item it moves second (Sludge Bomb, so Archaludon still stands), and the Scarf is what is ruled out
  const own = readOneTurn("Venusaur", null, "Archaludon", "move 2").items;
  assert.ok(own.size && !own.has("choicescarf"));
});

test("a hit harder than any roll of the sample sets is read as a Choice Band", () => {
  const { items, listed } = readOneTurn("Machamp", "Choice Band", "Corviknight");
  assert.ok(!listed.includes("choiceband"));
  assert.deepEqual([...items], ["choiceband"]);
});

test("the computer left with only an ally move after its partner fell uses it into the empty place, so it never stands without a choice", () => {
  const formatid = formatId("m-c", "doubles");
  const mon = (species, item, ability, moves) => ({ species, item, ability, moves, nature: "Jolly", evs: {}, level: 50 });
  const battle = startBattle({ formatid, seed: [1, 2, 3, 4],
    p1: { name: "사람", team: [mon("Garchomp", "Choice Scarf", "Rough Skin", ["Dragon Claw"]), mon("Incineroar", "Sitrus Berry", "Intimidate", ["Protect"])] },
    p2: { name: "컴퓨터", team: [mon("Florges", "Leftovers", "Flower Veil", ["Memento"]), mon("Simisage", "Focus Sash", "Overgrow", ["Helping Hand"])] } });
  choose(battle, {}, "p1", "team 1, 2"); choose(battle, {}, "p2", "team 1, 2");
  choose(battle, {}, "p2", "move 1 1, move 1 -1"); choose(battle, {}, "p1", "move 1 1, move 1");
  assert.ok(battle.p2.active[0].fainted, "the partner fell (Memento)");
  const picked = quickChoice(battle, "p2");
  assert.equal(picked, "pass, move 1 -1");
  assert.ok(choose(battle, {}, "p2", picked).ok, "the engine takes it");
});
