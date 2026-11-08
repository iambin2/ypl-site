/* 연승 도전의 판 (docs/BATTLE_STREAK.md). 배틀 함수(index.ts)가 쓰는 엔진 쪽 전부다: 판 만들기와 서버에서 두는 컴퓨터의 차례.
   컴퓨터는 휴대폰의 컴퓨터와 같고(battleCpu.js), 요청마다 새로 만들어 저장된 추리(memory)를 이어 받는다. */
import { CPU_NAME, choose, formatId, randomTeam, startBattle } from "./engine.mjs";
import { createCpu, quickChoice } from "../../../src/services/battleCpu.js";
import { STREAK_BATTLE_FORMAT, STREAK_REGULATION, streakCpuOptions, streakFoeDraw } from "../../../src/services/streak.js";

export const STREAK_FORMAT = formatId(STREAK_REGULATION, STREAK_BATTLE_FORMAT);

/* The computer (p2) takes every turn it owes, from the state the engine stands in. A choice that commits (p1 owes nothing, as after
   p1's own choice or on a forced switch of the computer's alone) plays on, and the computer looks again. A choice that waits for p1
   is not kept in the state (engine.mjs choose): it is returned as pending, with the state as it stood before it, so the next choice of
   p1 plays both. A choice the engine refuses is chosen once more (the refusal makes the engine mark what was hidden, as a Shadow
   Tag trapped: 2026-11-07, docs/BATTLE_STREAK.md 4장), and only then is the strongest attack played. wins picks the 난이도. */
export function computerTurns(engine, wins, memory, random = Math.random) {
  for (let step = 0; step < 8; step++) {
    const req = engine.p2.activeRequest;
    if (engine.ended || !req || req.wait || engine.p2.isChoiceDone()) break;
    const state = engine.toJSON();
    let picked = null, done = null;
    for (let tries = 0; tries < 2 && !done?.ok; tries++) {
      const cpu = createCpu(engine.format.id, { ...streakCpuOptions(wins), random, memory });
      try { picked = cpu.decide(engine, "p2"); } catch (error) { console.error("cpu", error); picked = null; }
      memory = cpu.memory();
      done = picked ? choose(engine, null, "p2", picked) : null;
      if (!done?.ok) console.warn("cpu choice refused", picked, done?.error);
    }
    if (!done?.ok) {
      picked = quickChoice(engine, "p2");
      done = choose(engine, null, "p2", picked);
      if (!done.ok) throw new Error(`the computer has no choice the engine takes: ${done.error}`);
    }
    if (!done.committed) return { state, pending: { p2: picked }, memory };
  }
  return { state: engine.toJSON(), pending: {}, memory };
}

/* A new game of the run: the seed and the computer's party drawn here, the computer's party by ladder usage as on the phones (a
   floor's master from the most used only, streak.js streakFoeDraw), and the computer's team preview already chosen. name: the
   trainer's, as the battle row shows it. party: the player's, carried from the floor's last game (with a swap made); a floor's first
   game draws a new one. */
export function streakGame(name, wins, random = Math.random, party = null) {
  const seed = Array.from({ length: 4 }, () => Math.floor(random() * 0x10000));
  const p1Team = party || randomTeam(STREAK_FORMAT, random);
  const engine = startBattle({
    formatid: STREAK_FORMAT, seed,
    p1: { name, team: p1Team },
    p2: { name: CPU_NAME, team: randomTeam(STREAK_FORMAT, random, streakFoeDraw(wins)) },
  });
  return { engine, p1Team, ...computerTurns(engine, wins, undefined, random) };
}
