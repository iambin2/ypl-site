import test from "node:test";
import assert from "node:assert/strict";
import { choose, loadBattle, replay } from "../supabase/functions/battle/engine.mjs";
import { STREAK_FORMAT, computerTurns, streakGame } from "../supabase/functions/battle/streakEngine.mjs";
import { quickChoice } from "../src/services/battleCpu.js";

const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

/* A whole game as the battle function plays it: after every request only what the database keeps survives (the engine state, the
   computer's waiting choice, its readings), each through JSON; the next request loads them, plays the player's choice, and the
   computer answers on the server. The player here is the quick player. */
function serverGame(seed, wins) {
  const random = seeded(seed);
  const first = streakGame("선수", wins, random);
  let kept = JSON.parse(JSON.stringify({ state: first.state, pending: first.pending, memory: first.memory }));
  let engine = first.engine, requests = 0, waited = 0;
  for (; requests < 300; requests++) {
    engine = loadBattle(kept.state);
    if (engine.ended) break;
    const req = engine.p1.activeRequest;
    assert.ok(req && !req.wait, `request ${requests}: the player always has a choice to make when the server waits`);
    const done = choose(engine, kept.pending, "p1", quickChoice(engine, "p1"));
    assert.ok(done.ok, `request ${requests}: the player's choice is taken (${done.error})`);
    if (!done.committed) { waited++; kept = { ...kept, pending: { ...kept.pending, p1: "unused" } }; break; }
    const turn = computerTurns(engine, wins, kept.memory, random);
    if (engine.ended) break;
    kept = JSON.parse(JSON.stringify({ state: turn.state, pending: turn.pending, memory: turn.memory }));
  }
  return { engine, requests, waited, memory: kept.memory };
}

test("the 연승 도전 opens on the server with both random parties and the computer's team preview already chosen", () => {
  const { engine, pending, state } = streakGame("선수", 0, seeded(5));
  assert.equal(engine.format.id, STREAK_FORMAT);
  assert.match(pending.p2, /^team /);
  assert.ok(engine.p1.activeRequest?.teamPreview, "the player picks next");
  assert.equal(loadBattle(state).p2.isChoiceDone(), false, "the computer's pick waits in pending, not in the state");
});

test("a game played as the server plays it, through only what the database keeps, replays to the same end", () => {
  for (const [seed, wins] of [[11, 0], [12, 7], [13, 14]]) {
    const { engine, requests, waited, memory } = serverGame(seed, wins);
    assert.equal(waited, 0, "the player's choice always meets the computer's");
    assert.ok(engine.ended, `seed ${seed}: the game ends (${requests} requests)`);
    const again = replay(engine.inputLog.join("\n"));
    assert.ok(again.ended);
    assert.equal(again.winnerSide?.id ?? again.winner, engine.winnerSide?.id ?? engine.winner);
    if (wins >= 7) assert.ok(memory?.hypotheses?.length, "the readings went from request to request");
  }
});
