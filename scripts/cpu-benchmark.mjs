// The computer against the quick player (src/services/battleCpu.js), mirrored: each pair of games plays the same two random parties
// with the computer on either side, so a win means play, not the party. Run several at once with different offsets.
//   node scripts/cpu-benchmark.mjs <singles|doubles> <games> <ms per decision> <rollout 1|0> <first game>
import { formatId, startBattle, randomTeam } from "../supabase/functions/battle/engine.mjs";
import { createCpu, quickChoice } from "../src/services/battleCpu.js";
const [kind = "singles", games = 10, budget = 400, rollout = "1", offset = "0"] = process.argv.slice(2);
const formatid = formatId("m-c", kind);
let wins = 0, done = 0, decisions = 0, time = 0, maxT = 0, errors = 0;
for (let g = Number(offset); g < Number(offset) + Number(games); g++) {
  const cpuSide = g % 2 ? "p1" : "p2";
  const cpu = createCpu(formatid, { budgetMs: Number(budget), rollout: rollout === "1" });
  // mirrored: game 2k and 2k+1 use the same two parties and seed, the computer on the other side
  let n = Math.floor(g / 2) * 7919 + 1; const rnd = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
  const teams = [randomTeam(formatid, rnd), randomTeam(formatid, rnd)];
  const battle = startBattle({ formatid, seed: [g >> 1, 7, 11, 13], p1: { name: "A", team: teams[0] }, p2: { name: "B", team: teams[1] } });
  for (let step = 0; step < 400 && !battle.ended; step++) {
    let moved = false;
    for (const side of ["p1", "p2"]) {
      const req = battle[side].activeRequest;
      if (!req || req.wait || battle[side].isChoiceDone()) continue;
      let choice;
      if (side === cpuSide) { const t = performance.now(); choice = cpu.decide(battle, side); const dt = performance.now() - t; time += dt; maxT = Math.max(maxT, dt); decisions++; }
      else choice = quickChoice(battle, side);
      if (!battle.choose(side, choice)) { errors++; console.log("refused", side, choice, battle[side].activeRequest?.forceSwitch ? "force" : ""); battle.choose(side, quickChoice(battle, side)); }
      moved = true;
    }
    if (!moved) break;
  }
  done++;
  if (battle.winnerSide === cpuSide) wins++;
  process.stdout.write(`${battle.winnerSide === cpuSide ? "W" : battle.ended ? "L" : "?"}`);
}
console.log(`\n${kind}: cpu won ${wins}/${done}, ${decisions} decisions, avg ${(time / decisions).toFixed(0)} ms, max ${maxT.toFixed(0)} ms, refused ${errors}`);
