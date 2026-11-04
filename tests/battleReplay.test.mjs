// The replay's stops and the decision clock (src/services/battleReplay.js), on a real battle from the engine.
import test from "node:test";
import assert from "node:assert/strict";
import { logUpTo, nextStop, prevStop, replayStops, secondsLeft, stopIndex, turnStop } from "../src/services/battleReplay.js";
import { formatId, startBattle, choose, forfeit, readout, replay } from "../supabase/functions/battle/engine.mjs";

const sp = s => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...s });
const TEAM = [
  { species: "Garchomp", item: "Choice Scarf", ability: "Rough Skin", moves: ["Earthquake", "Dragon Claw", "Rock Slide", "Protect"], nature: "Jolly", evs: sp({ atk: 32, spe: 32 }), level: 50 },
  { species: "Incineroar", item: "Sitrus Berry", ability: "Intimidate", moves: ["Fake Out", "Flare Blitz", "Throat Chop", "Parting Shot"], nature: "Adamant", evs: sp({ hp: 32, atk: 32 }), level: 50 },
  { species: "Rotom-Wash", item: "Leftovers", ability: "Levitate", moves: ["Hydro Pump", "Thunderbolt", "Will-O-Wisp", "Protect"], nature: "Modest", evs: sp({ hp: 32, spa: 32 }), level: 50 },
  { species: "Kingambit", item: "Black Glasses", ability: "Defiant", moves: ["Kowtow Cleave", "Sucker Punch", "Iron Head", "Protect"], nature: "Adamant", evs: sp({ hp: 32, atk: 32 }), level: 50 },
];
function play(kind, seed, turns = 99) {
  const battle = startBattle({ formatid: formatId("m-c", kind), seed, p1: { name: "가", team: TEAM }, p2: { name: "나", team: TEAM } });
  for (let step = 0; step < 500 && !battle.ended && battle.turn <= turns; step++)
    for (const side of ["p1", "p2"]) {
      const r = battle[side].activeRequest;
      if (r && !r.wait && !battle[side].isChoiceDone()) choose(battle, {}, side, "default");
    }
  return battle;
}

test("a finished log stands at the team preview, at every turn's opening and at its end", () => {
  for (const kind of ["singles", "doubles"]) {
    const battle = play(kind, [3, 1, 4, 1]);
    const log = readout(battle).spectatorLog;
    const lines = log.split("\n");
    const { total, stops } = replayStops(log);
    assert.equal(total, lines.length);
    assert.equal(stops[0].turn, 0);
    assert.ok(lines[stops[0].at - 1].startsWith("|teampreview"), "the first stop shows both parties");
    assert.deepEqual(stops.filter(s => s.turn > 0 && !s.end).map(s => s.turn), Array.from({ length: battle.turn }, (_, i) => i + 1), "every turn once, in order");
    for (const s of stops.filter(s => s.turn > 0 && !s.end)) assert.equal(lines[s.at - 1], `|turn|${s.turn}`);
    assert.equal(stops.at(-1).at, total);
    assert.ok(stops.at(-1).end);
    assert.ok(stops.every((s, i) => !i || s.at > stops[i - 1].at), "stops only go forward");
  }
});

test("stepping, going back and seeking land on stops", () => {
  const { total, stops } = replayStops(readout(play("doubles", [2, 7, 1, 8])).spectatorLog);
  const first = stops[0].at;
  assert.equal(prevStop(stops, first), null, "nothing before the start");
  assert.equal(nextStop(stops, total), null, "nothing after the end");
  assert.equal(nextStop(stops, first), stops[1].at);
  const mid = stops[2].at + 1; // inside turn 2 while it plays
  assert.equal(stopIndex(stops, mid), 2);
  assert.equal(prevStop(stops, mid), stops[2].at, "back from inside a turn goes to its opening");
  assert.equal(prevStop(stops, stops[2].at), stops[1].at, "back from an opening goes to the turn before");
  assert.equal(turnStop(stops, 2), stops.find(s => s.turn === 2).at);
  assert.equal(turnStop(stops, "0"), first);
  assert.equal(turnStop(stops, null), first);
  assert.equal(turnStop(stops, 999), total, "past the last turn is the end");
  assert.equal(logUpTo("a\nb\nc", 2), "a\nb");
  assert.equal(logUpTo("a\nb\nc", null), "a\nb\nc");
  assert.equal(logUpTo("a\nb\nc", 0), "a", "the stage always has a line to read");
});

test("a battle lost on time replays to the same end, as a forfeit does", () => {
  const battle = play("singles", [5, 5, 5, 5], 2);
  forfeit(battle, "p2");
  const out = readout(battle);
  assert.equal(out.winner, "p1");
  assert.equal(readout(replay(out.inputLog)).log, out.log);
});

test("the clock counts whole seconds down to 0 and is off with no deadline", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  assert.equal(secondsLeft("2026-11-05T12:01:30Z", now), 90);
  assert.equal(secondsLeft("2026-11-05T12:00:00.200Z", now), 1, "a part of a second still shows");
  assert.equal(secondsLeft("2026-11-05T11:59:00Z", now), 0);
  assert.equal(secondsLeft(null, now), null);
  assert.equal(secondsLeft("not a time", now), null);
});
