// Do the sample sets play better than the ones they replaced? The computer plays itself with the same six species on both sides of a
// pair, one side on the new sets and the other on the old, then again with the sets swapped, so only the sets differ. What the
// computer believes a foe carries comes from src/data/random-sets.json, which favours whichever side's sets it holds; run once with
// each file in place (--beliefs) and read both.
//
//   node scripts/sets-benchmark.mjs [--kind singles] [--games 400] [--ms 300] [--new src/data/random-sets.json]
//                                   [--old src/data/random-sets.ladder.json] [--out results.jsonl]
import { appendFileSync, readFileSync } from "node:fs";
import { fork } from "node:child_process";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const args = Object.fromEntries(argv.map((a, i) => (a.startsWith("--") ? [a.slice(2), argv[i + 1]?.startsWith("--") ? true : argv[i + 1] ?? true] : null)).filter(Boolean));
const ROOT = new URL("../", import.meta.url);

if (args.worker) {
  const job = await new Promise(resolve => process.once("message", resolve));
  const { formatId, startBattle, validateTeam, weighted, shuffled } = await import(new URL("supabase/functions/battle/engine.mjs", ROOT));
  const { createCpu, quickChoice } = await import(new URL("src/services/battleCpu.js", ROOT));
  const formatid = formatId("m-c", job.kind);
  const read = file => new Map(JSON.parse(readFileSync(new URL(file, ROOT), "utf8"))["m-c"][job.kind].map(e => [e.species, e]));
  const NEW = read(job.newFile), OLD = read(job.oldFile);
  const species = [...NEW.keys()].filter(s => OLD.has(s));
  const hasMega = (pool, s) => pool.get(s).sets.some(x => x.mega);
  const team = (pool, list, mega, rnd) => {
    const used = new Set();
    return list.map(s => {
      // a species with only Mega sets brings one anyway; a party with two Megas is refused and drawn again
      const sets = pool.get(s).sets.filter(x => !!x.mega === (s === mega));
      const set = weighted(sets.length ? sets : pool.get(s).sets, rnd);
      const item = set.items.find(i => !used.has(i)) || set.items[0];
      used.add(item);
      return { name: "", species: s, ability: set.ability, item, moves: set.moves, nature: set.nature, evs: set.evs, level: 50 };
    });
  };
  for (const pair of job.pairs) {
    let n = pair * 7919 + 101;
    const rnd = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
    let parties = null;
    for (let tries = 0; tries < 50 && !parties; tries++) {
      const lists = [0, 1].map(() => {
        const out = [], bases = new Set();
        for (const s of shuffled(species, rnd)) { const b = s.split("-")[0]; if (bases.has(b)) continue; bases.add(b); out.push(s); if (out.length === 6) break; }
        return out;
      });
      const megas = lists.map(l => l.find(s => hasMega(NEW, s) && hasMega(OLD, s)) || null);
      const p = lists.map((l, i) => ({ new: team(NEW, l, megas[i], rnd), old: team(OLD, l, megas[i], rnd) }));
      if (p.every(x => !validateTeam(formatid, x.new) && !validateTeam(formatid, x.old))) parties = p;
    }
    if (!parties) continue;
    // game one: party 0 new against party 1 old; game two: party 0 old against party 1 new. "b" is the new sets' result
    for (const [t1, t2, newSide] of [[parties[0].new, parties[1].old, "p1"], [parties[0].old, parties[1].new, "p2"]]) {
      const players = { p1: createCpu(formatid, { budgetMs: job.ms }), p2: createCpu(formatid, { budgetMs: job.ms }) };
      const battle = startBattle({ formatid, seed: [pair, 3, 5, 7], p1: { name: "A", team: t1 }, p2: { name: "B", team: t2 } });
      for (let step = 0; step < 500 && !battle.ended; step++) {
        let moved = false;
        for (const side of ["p1", "p2"]) {
          const req = battle[side].activeRequest;
          if (!req || req.wait || battle[side].isChoiceDone()) continue;
          if (!battle.choose(side, players[side].decide(battle, side))) battle.choose(side, quickChoice(battle, side));
          moved = true;
        }
        if (!moved) break;
      }
      const won = battle.ended ? (battle.winnerSide === newSide ? 1 : battle.winnerSide ? 0 : 0.5) : 0.5;
      // which species were brought and survived on the new side, for each species' share of the result
      const mine = (newSide === "p1" ? t1 : t2).map(m => m.species);
      process.send({ pair, b: won, turns: battle.turn, species: mine });
    }
  }
  process.disconnect();
} else {
  const kind = args.kind || "singles", games = Number(args.games || 400), ms = Number(args.ms || 300);
  const pairs = Array.from({ length: Math.ceil(games / 2) }, (_, i) => i);
  const lanes = Math.max(1, Math.min(Number(args.lanes || cpus().length - 1), pairs.length));
  const job = { kind, ms, newFile: args.new || "src/data/random-sets.json", oldFile: args.old || "src/data/random-sets.ladder.json" };
  console.log(`${pairs.length * 2} games, ${kind}, ${ms} ms, new = ${job.newFile}, old = ${job.oldFile}, beliefs = src/data/random-sets.json`);
  const results = [];
  await Promise.all(Array.from({ length: lanes }, (_, lane) => new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ["--worker", "1"], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
    child.send({ ...job, pairs: pairs.filter(p => p % lanes === lane) });
    child.on("message", r => { results.push(r); if (args.out) appendFileSync(args.out, JSON.stringify({ kind, ...r }) + "\n"); process.stdout.write(r.b === 1 ? "W" : r.b === 0 ? "L" : "="); });
    child.on("exit", code => (code ? reject(new Error(`lane ${lane} failed`)) : resolve()));
  })));
  const byPair = Object.values(results.reduce((m, r) => ((m[r.pair] ||= []).push(r.b), m), {})).map(g => g.reduce((a, b) => a + b, 0) / g.length);
  const mean = byPair.reduce((a, b) => a + b, 0) / byPair.length;
  const sd = Math.sqrt(byPair.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, byPair.length - 1));
  const margin = 1.96 * sd / Math.sqrt(byPair.length);
  console.log(`\nnew sets scored ${(100 * mean).toFixed(1)}% ± ${(100 * margin).toFixed(1)} (95%) over ${results.length} games`);
  console.log(mean - margin > 0.5 ? "The new sets are stronger." : mean + margin < 0.5 ? "The new sets are weaker." : "No difference shown at this many games.");
}
