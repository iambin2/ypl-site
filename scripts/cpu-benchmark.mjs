// The yardstick for the computer opponent (src/services/battleCpu.js): the computer as it is in this folder (B) against another
// version of itself (A), mirrored: each pair of games plays the same two parties and seed with B on either side, so a win means play,
// not the party. Games run in parallel, one process a core, and the result comes with its margin of error.
//
//   node scripts/cpu-benchmark.mjs [--base HEAD] [--games 200] [--kind singles] [--ms 1400] [--parties random] [--a '{}'] [--b '{}']
//     --base     the version A plays: any git ref (default HEAD, the last commit, so an uncommitted change meets what it changes;
//                origin/main for what is live, as a local main may lag), or "quick" for the quick player
//     --parties  random (sample sets), spiced (a third of the attackers holding a Choice item, as people build), or players
//                (the parties players brought against the computer, read from cpu_battles with SUPABASE_URL and
//                SUPABASE_SERVICE_ROLE_KEY; they stay in memory, as the table is private)
//     --a, --b   createCpu options for each side as JSON, e.g. --b '{"reads":false}'
//     --lanes    games at once (default: half the logical cores; more starves the untimed parts of a choice)
//     --ms       time a decision may take (the phone's default is 1400 singles, 2200 doubles); all cores are busy, so it is the
//                same for both sides but slower than a phone in absolute terms
// A change is better when B's share is above 50% by more than the margin; under about 200 games only large changes show.
import { execFileSync, fork } from "node:child_process";
import { cpus } from "node:os";
import { rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : null)).filter(Boolean));
const ROOT = new URL("../", import.meta.url);

/* ---------- one process: plays its share of the pairs and reports each game ---------- */
if ("worker" in args || process.argv.includes("--worker")) {
  const job = await new Promise(resolve => process.once("message", resolve));
  const { formatId, startBattle, randomTeam } = await import(new URL("supabase/functions/battle/engine.mjs", ROOT));
  const { Dex } = await import("@pkmn/sim");
  const B = await import(new URL("src/services/battleCpu.js", ROOT));
  const A = job.base === "quick" ? null : await import(new URL(job.baseFile, ROOT));
  const formatid = formatId("m-c", job.kind);
  // a third of the attacking Pokémon trade their item for a Choice item, at most one of each a party
  const spiced = (team, rnd) => {
    const used = new Set(team.map(m => m.item));
    return team.map(m => {
      const kinds = m.moves.map(x => Dex.moves.get(x).category);
      if (/ite( [XYZ])?$/.test(m.item) || kinds.includes("Status") || rnd() > 0.35) return m;
      const physical = kinds.filter(k => k === "Physical").length >= kinds.filter(k => k === "Special").length;
      const item = rnd() < 0.5 ? "Choice Scarf" : physical ? "Choice Band" : "Choice Specs";
      if (used.has(item)) return m;
      used.add(item);
      return { ...m, item };
    });
  };
  for (const pair of job.pairs) {
    let n = pair * 7919 + 1;
    const rnd = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
    const teams = job.players ? [job.players[(pair * 2) % job.players.length], job.players[(pair * 2 + 1) % job.players.length]]
      : [randomTeam(formatid, rnd), randomTeam(formatid, rnd)].map(t => (job.parties === "spiced" ? spiced(t, rnd) : t));
    for (const bSide of ["p1", "p2"]) {
      const aSide = bSide === "p1" ? "p2" : "p1";
      const players = {
        [bSide]: B.createCpu(formatid, { budgetMs: job.ms, ...job.b }),
        [aSide]: A ? A.createCpu(formatid, { budgetMs: job.ms, ...job.a }) : { decide: (battle, side) => B.quickChoice(battle, side) },
      };
      const battle = startBattle({ formatid, seed: [pair, 7, 11, 13], p1: { name: "A", team: teams[0] }, p2: { name: "B", team: teams[1] } });
      let refused = 0, think = 0, thinks = 0, slowest = 0;
      for (let step = 0; step < 500 && !battle.ended; step++) {
        let moved = false;
        for (const side of ["p1", "p2"]) {
          const req = battle[side].activeRequest;
          if (!req || req.wait || battle[side].isChoiceDone()) continue;
          const t0 = performance.now();
          const choice = players[side].decide(battle, side);
          const dt = performance.now() - t0;
          if (side === bSide) { think += dt; thinks++; slowest = Math.max(slowest, dt); }
          if (!battle.choose(side, choice)) { refused++; battle.choose(side, B.quickChoice(battle, side)); }
          moved = true;
        }
        if (!moved) break;
      }
      process.send({ pair, b: battle.ended ? (battle.winnerSide === bSide ? 1 : battle.winnerSide === aSide ? 0 : 0.5) : 0.5, turns: battle.turn, refused, think, thinks, slowest });
    }
  }
  process.disconnect();
} else {

/* ---------- the runner ---------- */
const games = Number(args.games || 200), kind = args.kind || "singles", base = args.base || "HEAD", parties = args.parties || "random";
const ms = Number(args.ms || (kind === "doubles" ? 2200 : 1400));
let baseFile = null;
if (base !== "quick") {
  // the other version beside this one, so its relative imports resolve; removed when the run ends
  baseFile = `src/services/.cpu-base-${base.replace(/[^\w.-]/g, "_")}.js`;
  writeFileSync(new URL(baseFile, ROOT), execFileSync("git", ["show", `${base}:src/services/battleCpu.js`], { cwd: fileURLToPath(ROOT) }));
}
let players = null;
if (parties === "players") {
  const { fetchRecords, playerParty } = await import("./learn-cpu-sets.mjs");
  const { formatId } = await import(new URL("supabase/functions/battle/engine.mjs", ROOT));
  const formatid = formatId("m-c", kind);
  const seen = new Set();
  players = (await fetchRecords()).filter(r => r.format_id === formatid).map(r => playerParty(r.input_log))
    .filter(t => t && t.length >= 3 && !seen.has(JSON.stringify(t)) && seen.add(JSON.stringify(t)));
  if (players.length < 2) throw new Error(`only ${players.length} player parties for ${formatid}`);
  console.log(`${players.length} player parties`);
}
const pairs = Array.from({ length: Math.ceil(games / 2) }, (_, i) => i);
const lanes = Math.max(1, Math.min(Number(args.lanes || Math.max(1, cpus().length / 2)), pairs.length));
const job = { kind, ms, base, baseFile, parties, players, a: JSON.parse(args.a || "{}"), b: JSON.parse(args.b || "{}") };
console.log(`${pairs.length * 2} games, ${kind}, ${ms} ms, ${parties} parties, B = this folder${args.b ? " " + args.b : ""}, A = ${base}${args.a ? " " + args.a : ""}, ${lanes} at once`);
const results = [];
const started = Date.now();
await Promise.all(Array.from({ length: lanes }, (_, lane) => new Promise((resolve, reject) => {
  const child = fork(fileURLToPath(import.meta.url), ["--worker"], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
  child.send({ ...job, pairs: pairs.filter(p => p % lanes === lane) });
  child.on("message", r => { results.push(r); process.stdout.write(r.b === 1 ? "W" : r.b === 0 ? "L" : "="); });
  child.on("exit", code => (code ? reject(new Error(`lane ${lane} failed`)) : resolve()));
}))).finally(() => baseFile && rmSync(new URL(baseFile, ROOT), { force: true }));

const n = results.length, score = results.reduce((s, r) => s + r.b, 0), p = score / n;
// the margin from the pairs, not the games: the two games of a pair share their parties, so they are not independent
const byPair = Object.values(results.reduce((m, r) => ((m[r.pair] ||= []).push(r.b), m), {})).map(g => g.reduce((a, b) => a + b, 0) / g.length);
const mean = byPair.reduce((a, b) => a + b, 0) / byPair.length;
const sd = Math.sqrt(byPair.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, byPair.length - 1));
const margin = 1.96 * sd / Math.sqrt(byPair.length);
const elo = x => (x <= 0 ? -Infinity : x >= 1 ? Infinity : Math.round(-400 * Math.log10(1 / x - 1)));
const swept = byPair.filter(x => x === 1).length, lost = byPair.filter(x => x === 0).length;
console.log(`\nB scored ${score}/${n} = ${(100 * p).toFixed(1)}% ± ${(100 * margin).toFixed(1)} (95%), Elo ${elo(p)} [${elo(p - margin)}, ${elo(p + margin)}]`);
console.log(`pairs: B won both ${swept}, split ${byPair.length - swept - lost}, A won both ${lost}; avg ${(results.reduce((s, r) => s + r.turns, 0) / n).toFixed(1)} turns; refused ${results.reduce((s, r) => s + r.refused, 0)}; B thinks ${Math.round(results.reduce((s, r) => s + r.think, 0) / Math.max(1, results.reduce((s, r) => s + r.thinks, 0)))} ms a choice, slowest ${Math.round(Math.max(...results.map(r => r.slowest)))} ms; ${Math.round((Date.now() - started) / 1000)} s`);
console.log(p - margin > 0.5 ? "B is stronger." : p + margin < 0.5 ? "B is weaker." : "No difference shown at this many games.");
}
