// The battle engine as the battle function drives it: state saved as JSON after every turn, a choice that waits kept apart,
// and a finished battle replayed from its input log to the very same log.
import test from "node:test";
import assert from "node:assert/strict";
import { formatId, validateTeam, startBattle, loadBattle, choose, forfeit, readout, replay } from "../supabase/functions/battle/engine.mjs";

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

// A player who reads only its request, as the site's screen does: a legal move with an explicit target.
function picker(seed) {
  let s = seed;
  const rand = n => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) % n; };
  return (request, gameType) => {
    if (request.teamPreview || request.forceSwitch) return "default";
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
