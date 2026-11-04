// The battle engine as the battle function drives it: state saved as JSON after every turn, a choice that waits kept apart,
// and a finished battle replayed from its input log to the very same log.
import test from "node:test";
import assert from "node:assert/strict";
import { formatId, validateTeam, startBattle, loadBattle, choose, forfeit, readout, replay } from "../supabase/functions/battle/engine.mjs";
import { requestKey, slotPasses } from "../src/services/battleLog.js";

const sp = (spread) => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...spread });
const set = (species, item, ability, moves, nature, evs) => ({ species, item, ability, moves, nature, evs: sp(evs), level: 50 });
const TEAM = [
  set("Garchomp", "Choice Scarf", "Rough Skin", ["Earthquake", "Dragon Claw", "Rock Slide", "Protect"], "Jolly", { hp: 2, atk: 32, spe: 32 }),
  set("Charizard-Mega-Y", "Charizardite Y", "Blaze", ["Heat Wave", "Air Slash", "Solar Beam", "Protect"], "Timid", { hp: 2, spa: 32, spe: 32 }),
  set("Incineroar", "Sitrus Berry", "Intimidate", ["Fake Out", "Flare Blitz", "Throat Chop", "Parting Shot"], "Adamant", { hp: 32, atk: 32, spd: 2 }),
  set("Rotom-Wash", "Leftovers", "Levitate", ["Hydro Pump", "Thunderbolt", "Will-O-Wisp", "Protect"], "Modest", { hp: 32, spa: 32, spd: 2 }),
  set("Kingambit", "Black Glasses", "Defiant", ["Kowtow Cleave", "Sucker Punch", "Iron Head", "Protect"], "Adamant", { hp: 32, atk: 32, spe: 2 }),
  set("Sinistcha", "Mental Herb", "Hospitality", ["Matcha Gotcha", "Rage Powder", "Trick Room", "Strength Sap"], "Relaxed", { hp: 32, def: 32, spa: 2 }),
];
const noClock = log => log.split("\n").filter(line => !line.startsWith("|t:|")).join("\n");

// a team preview or a forced switch answered as the site's screen answers it (the engine refuses Showdown's default)
function explicit(request) {
  const mons = request.side.pokemon;
  if (request.teamPreview) return `team ${mons.slice(0, request.maxChosenTeamSize || mons.length).map((_, i) => i + 1).join(", ")}`;
  const free = mons.map((m, i) => (!m.active && !m.condition.endsWith(" fnt") ? i + 1 : 0)).filter(Boolean);
  return request.forceSwitch.map((_, i) => (slotPasses(request, i) ? "pass" : `switch ${free.shift()}`)).join(", ");
}

// A player who reads only its request, as the site's screen does: a legal move with an explicit target.
function picker(seed) {
  let s = seed;
  const rand = n => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) % n; };
  return (request, gameType) => {
    if (request.teamPreview || request.forceSwitch) return explicit(request);
    return request.active.map((active, i) => {
      const mon = request.side.pokemon[i];
      if (!mon || mon.condition.endsWith(" fnt") || active.commanding) return "pass";
      const usable = active.moves.map((m, j) => ({ m, j })).filter(x => !x.m.disabled);
      const { m, j } = usable.length ? usable[rand(usable.length)] : { m: active.moves[0], j: 0 };
      let target = "";
      if (gameType === "doubles" && ["normal", "any", "adjacentFoe"].includes(m.target)) target = ` ${rand(2) + 1}`;
      else if (gameType === "doubles" && m.target === "adjacentAlly") target = ` -${2 - i}`;
      else if (gameType === "doubles" && m.target === "adjacentAllyOrSelf") target = ` -${i + 1}`;
      return `move ${j + 1}${target}`;
    }).join(", ");
  };
}

test("legal teams pass Showdown's validator in both regulations and both formats", () => {
  for (const reg of ["m-c", "m-b"]) for (const kind of ["singles", "doubles"]) {
    const problems = validateTeam(formatId(reg, kind), reg === "m-b" ? [...TEAM.slice(0, 5), set("Whimsicott", "Focus Sash", "Prankster", ["Tailwind", "Moonblast", "Encore", "Protect"], "Timid", { hp: 2, spa: 32, spe: 32 })] : TEAM);
    assert.equal(problems, null, `${reg} ${kind}: ${problems}`);
  }
  assert.ok(validateTeam(formatId("m-c", "doubles"), [{ ...TEAM[2], moves: ["Knock Off"] }])?.length, "an illegal move is refused");
  assert.deepEqual(validateTeam(formatId("m-c", "singles"), []), ["A team is one to six Pokémon."]);
});

test("a battle saved after every turn ends, and its input log replays to the same log", () => {
  for (const kind of ["singles", "doubles"]) for (const seed of [[1, 2, 3, 4], [9, 8, 7, 6], [5, 5, 5, 5]]) {
    const formatid = formatId("m-c", kind);
    let state = JSON.stringify(startBattle({ formatid, seed, p1: { name: "가", team: TEAM }, p2: { name: "나", team: TEAM } }).toJSON());
    let pending = {};
    const pick = { p1: picker(seed[0] + 11), p2: picker(seed[1] + 17) };
    let out;
    for (let step = 0; step < 4000; step++) {
      out = readout(loadBattle(state));
      if (out.ended) break;
      const side = ["p1", "p2"].find(id => out.request[id] && !out.request[id].wait && !pending[id]);
      assert.ok(side, "someone must be asked to choose");
      let done = false;
      for (let tries = 0; tries < 30 && !done; tries++) {
        const battle = loadBattle(state);
        const choice = pick[side](out.request[side], battle.gameType);
        const result = choose(battle, pending, side, choice);
        if (!result.ok) continue;
        done = true;
        if (result.committed) { state = JSON.stringify(battle.toJSON()); pending = {}; } else pending = { ...pending, [side]: choice };
      }
      assert.ok(done, `${kind}: no legal choice found`);
    }
    assert.ok(out.ended, `${kind} ${seed}: the battle ended`);
    assert.ok(["p1", "p2", "tie"].includes(out.winner));
    const again = readout(replay(out.inputLog));
    assert.equal(noClock(again.log), noClock(out.log), `${kind} ${seed}: the replay is the same battle`);
    assert.equal(again.winner, out.winner);
  }
});

test("each player sees their own secrets, spectators see neither", () => {
  const battle = startBattle({ formatid: formatId("m-c", "singles"), seed: [1, 1, 1, 1], p1: { name: "가", team: TEAM }, p2: { name: "나", team: TEAM } });
  choose(battle, {}, "p1", "team 1, 2, 3");
  choose(battle, { p1: "team 1, 2, 3" }, "p2", "team 4, 5, 6");
  const out = readout(battle);
  assert.match(out.sideLog.p1, /\|switch\|p1a: Garchomp\|Garchomp, L50, [MF]\|(?!100\/100)\d+\/\d+/, "own HP as it is");
  assert.match(out.spectatorLog, /\|switch\|p1a: Garchomp\|Garchomp, L50, [MF]\|100\/100/, "spectators read percentages");
  assert.match(out.sideLog.p2, /\|switch\|p1a: Garchomp\|Garchomp, L50, [MF]\|100\/100/, "the foe reads percentages");
  assert.equal(out.request.p2.side.pokemon[0].details, "Rotom-Wash, L50");
});

test("a wrong choice is refused with the engine's reason, and forfeit is replayable", () => {
  const formatid = formatId("m-c", "singles");
  const battle = startBattle({ formatid, seed: [3, 3, 3, 3], p1: { name: "가", team: TEAM }, p2: { name: "나", team: TEAM } });
  const wrong = choose(battle, {}, "p1", "move 9");
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /Invalid choice/);
  const waiting = choose(battle, {}, "p1", "team 1, 2, 3");
  assert.deepEqual(waiting, { ok: true, committed: false });
  forfeit(battle, "p1");
  const out = readout(battle);
  assert.equal(out.winner, "p2");
  assert.equal(readout(replay(out.inputLog)).winner, "p2");
});

// jsonb keeps keys in its own order: the state read back from the database is the same battle with its keys moved
const reorder = value => Array.isArray(value) ? value.map(reorder)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).reverse().map(k => [k, reorder(value[k])])) : value;

test("a choice on a request that has moved on is refused as stale, whatever order the stored state keeps its keys in", () => {
  const formatid = formatId("m-c", "singles");
  let state = startBattle({ formatid, seed: [2, 2, 2, 2], p1: { name: "가", team: TEAM }, p2: { name: "나", team: TEAM } }).toJSON();
  const asked = () => { const out = readout(loadBattle(JSON.parse(JSON.stringify(state)))); return requestKey(out.turn, out.request.p1); };
  const preview = asked();
  // the key the client sends (from a view built on the in-memory state) matches the state read back from the database
  assert.equal(choose(loadBattle(reorder(state)), {}, "p1", "team 1, 2, 3", preview).ok, true);
  const battle = loadBattle(state);
  choose(battle, {}, "p1", "team 1, 2, 3", preview);
  assert.equal(choose(battle, { p1: "team 1, 2, 3" }, "p2", "team 1, 2, 3").committed, true);
  state = reorder(battle.toJSON());
  // the team preview's answer arriving again (its response was lost) does not become turn 1's move
  const late = choose(loadBattle(state), {}, "p1", "move 1", preview);
  assert.equal(late.ok, false);
  assert.equal(late.stale, true);
  assert.equal(choose(loadBattle(state), {}, "p1", "move 1", asked()).ok, true);
  // a client that sends no key is still served
  assert.equal(choose(loadBattle(state), {}, "p1", "move 1").ok, true);
});

test("Showdown's default and auto are refused: in doubles they log no target and the battle would not replay", () => {
  const battle = startBattle({ formatid: formatId("m-c", "doubles"), seed: [1, 2, 3, 4], p1: { name: "가", team: TEAM }, p2: { name: "나", team: TEAM } });
  for (const choice of ["default", "auto", "team 1, 2, 3, 4, default", " Default "]) assert.equal(choose(battle, {}, "p1", choice).ok, false, choice);
  assert.equal(battle.inputLog.some(line => /default|auto/.test(line)), false);
});

test("two fall in doubles with one left on the bench: the second slot passes, so the choice is complete", () => {
  const memento = { ...TEAM[2], moves: ["Fake Out", "Flare Blitz", "Memento", "Parting Shot"] };
  const rotom = { ...TEAM[3], moves: ["Hydro Pump", "Protect", "Memento"] };
  const battle = startBattle({ formatid: formatId("m-c", "doubles"), seed: [1, 2, 3, 4], p1: { name: "가", team: TEAM }, p2: { name: "나", team: [memento, rotom, TEAM[4]] } });
  assert.equal(choose(battle, {}, "p1", "team 6, 5, 1, 2").ok, true);
  assert.equal(choose(battle, { p1: "team 6, 5, 1, 2" }, "p2", "team 1, 2, 3").committed, true);
  assert.equal(choose(battle, {}, "p1", "move 2, move 4").ok, true);
  assert.equal(choose(battle, { p1: "move 2, move 4" }, "p2", "move 3 1, move 3 1").committed, true);
  const request = battle.p2.activeRequest;
  assert.deepEqual(request.forceSwitch, [true, true], "Showdown asks both");
  assert.deepEqual([slotPasses(request, 0), slotPasses(request, 1)], [false, true]);
  assert.equal(explicit(request), "switch 3, pass");
  assert.equal(choose(battle, {}, "p2", "switch 3").ok, false, "one switch alone is incomplete");
  assert.equal(choose(battle, {}, "p2", explicit(request)).ok, true);
});
