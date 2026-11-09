// How much each species adds to a random party, measured (docs/BATTLE_STREAK.md 11장): the computer plays itself with random parties
// drawn evenly from every species, each pair of parties twice with the sides swapped, and a logistic fit reads each species' share of
// the win off the results. src/services/partyBalance.js draws parties of one strength from these numbers.
//
//   node scripts/rate-species.mjs --play --games 6000 [--kind singles] [--reg m-c] [--ms 100] [--draw even|balanced] [--out games.jsonl]
//   node scripts/rate-species.mjs --fit games.jsonl [more.jsonl ...]      writes src/data/species-power.json (that format's part)
//   node scripts/rate-species.mjs --check games.jsonl                     how well the current numbers foretell those games
//
// --play appends one line a game, so a run can be stopped and continued, and runs on any number of files.
import { fork } from "node:child_process";
import { cpus } from "node:os";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const args = Object.fromEntries(argv.map((a, i) => (a.startsWith("--") ? [a.slice(2), argv[i + 1]?.startsWith("--") ? true : argv[i + 1] ?? true] : null)).filter(Boolean));
const ROOT = new URL("../", import.meta.url);
const POWER_FILE = new URL("src/data/species-power.json", ROOT);

if (args.worker) {
  const job = await new Promise(resolve => process.once("message", resolve));
  const { formatId, startBattle, randomTeam } = await import(new URL("supabase/functions/battle/engine.mjs", ROOT));
  const { createCpu, quickChoice } = await import(new URL("src/services/battleCpu.js", ROOT));
  const formatid = formatId(job.reg, job.kind);
  for (const pair of job.pairs) {
    let n = (pair + job.offset) * 7919 + 17;
    const rnd = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
    const draw = job.draw === "balanced" || job.draw === "master" ? {} : { even: true };
    // master: the first party is a 연승 도전 floor's master's (a tier up), the second a balanced one, so --play reports the master's share
    const teams = [randomTeam(formatid, rnd, job.draw === "master" ? { master: true } : draw), randomTeam(formatid, rnd, draw)];
    for (const swap of [false, true]) {
      const [t1, t2] = swap ? [teams[1], teams[0]] : teams;
      const players = { p1: createCpu(formatid, { budgetMs: job.ms }), p2: createCpu(formatid, { budgetMs: job.ms }) };
      const battle = startBattle({ formatid, seed: [pair, 7, 11, job.offset & 0xffff], p1: { name: "A", team: t1 }, p2: { name: "B", team: t2 } });
      for (let step = 0; step < 500 && !battle.ended; step++) {
        let moved = false;
        for (const side of ["p1", "p2"]) {
          const req = battle[side].activeRequest;
          if (!req || req.wait || battle[side].isChoiceDone()) continue;
          let choice = null;
          try { choice = players[side].decide(battle, side); } catch { choice = null; }
          if (!choice || !battle.choose(side, choice)) battle.choose(side, quickChoice(battle, side));
          moved = true;
        }
        if (!moved) break;
      }
      const w = battle.ended ? (battle.winnerSide === "p1" ? 1 : battle.winnerSide === "p2" ? 0 : 0.5) : 0.5;
      process.send({ f: formatid, a: t1.map(m => m.species), b: t2.map(m => m.species), w, t: battle.turn, first: swap ? 0 : 1, pair });
    }
  }
  process.disconnect();
} else if (args.play) {
  const games = Number(args.games || 2000), kind = args.kind || "singles", reg = args.reg || "m-c", ms = Number(args.ms || 100);
  const out = args.out || `species-games-${reg}-${kind}.jsonl`;
  const offset = Number(args.offset || Date.now() % 100000);
  const pairs = Array.from({ length: Math.ceil(games / 2) }, (_, i) => i);
  const lanes = Math.max(1, Math.min(Number(args.lanes || cpus().length - 2), pairs.length));
  console.log(`${pairs.length * 2} games, ${reg} ${kind}, ${ms} ms, ${args.draw || "even"} draws, ${lanes} at once -> ${out}`);
  let done = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: lanes }, (_, lane) => new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ["--worker"], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
    child.send({ kind, reg, ms, offset, draw: args.draw, pairs: pairs.filter(p => p % lanes === lane) });
    child.on("message", r => {
      appendFileSync(out, JSON.stringify(r) + "\n");
      if (++done % 100 === 0) console.log(`${done} games, ${Math.round((Date.now() - started) / 1000)} s`);
    });
    child.on("exit", code => (code ? reject(new Error(`lane ${lane} failed`)) : resolve()));
  })));
  console.log(`done: ${done} games in ${Math.round((Date.now() - started) / 1000)} s`);
  // the first party's share (the master's with --draw master), by pairs so the margin counts each pair once
  const rows = readFileSync(out, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)).filter(g => g.first != null);
  const share = rows.map(g => (g.first ? g.w : 1 - g.w));
  const byPair = new Map();
  rows.forEach((g, i) => byPair.set(g.pair, [...(byPair.get(g.pair) || []), share[i]]));
  const perPair = [...byPair.values()].map(x => x.reduce((a, b) => a + b, 0) / x.length);
  const mean = share.reduce((a, b) => a + b, 0) / share.length, sd = Math.sqrt(perPair.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, perPair.length - 1));
  console.log(`the first party scored ${(100 * mean).toFixed(1)}% ± ${(196 * sd / Math.sqrt(perPair.length)).toFixed(1)} over ${share.length} games`);
} else if (args.fit || args.check) {
  const files = argv.filter(a => !a.startsWith("--"));
  const games = files.flatMap(f => readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } })); // a line a running --play is still writing stays out
  const formats = [...new Set(games.map(g => g.f))];
  const power = existsSync(POWER_FILE) ? JSON.parse(readFileSync(POWER_FILE, "utf8")) : {};
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  for (const f of formats) {
    const set = games.filter(g => g.f === f && g.w !== 0.5);
    if (args.check) {
      const r = power[f]?.rating || {};
      const gap = g => g.a.reduce((s, x) => s + (r[x] ?? 0), 0) - g.b.reduce((s, x) => s + (r[x] ?? 0), 0);
      const loss = set.reduce((s, g) => s - Math.log(Math.max(1e-9, g.w ? sigmoid(gap(g)) : 1 - sigmoid(gap(g)))), 0) / set.length;
      const spread = Math.sqrt(set.reduce((s, g) => s + (sigmoid(gap(g)) - 0.5) ** 2, 0) / set.length);
      const right = set.filter(g => (gap(g) > 0) === !!g.w && gap(g) !== 0).length;
      console.log(`${f}: ${set.length} games, log loss ${loss.toFixed(4)} (coin 0.6931), foretold ${(100 * right / set.length).toFixed(1)}%, spread of the foretold share ${(100 * spread).toFixed(1)}%p`);
      continue;
    }
    // logistic fit of win ~ sum(p1 species) - sum(p2 species), with an L2 pull toward 0 so a rarely drawn species stays near average
    const species = [...new Set(set.flatMap(g => [...g.a, ...g.b]))].sort();
    const at = Object.fromEntries(species.map((s, i) => [s, i]));
    const rows = set.map(g => ({ a: g.a.map(s => at[s]), b: g.b.map(s => at[s]), y: g.w }));
    const w = new Float64Array(species.length), lambda = Number(args.lambda || 2);
    for (let iter = 0; iter < 3000; iter++) {
      const grad = new Float64Array(species.length);
      for (const r of rows) {
        let z = 0;
        for (const i of r.a) z += w[i];
        for (const i of r.b) z -= w[i];
        const e = sigmoid(z) - r.y;
        for (const i of r.a) grad[i] += e;
        for (const i of r.b) grad[i] -= e;
      }
      let step = 0;
      for (let i = 0; i < w.length; i++) { const g = grad[i] + lambda * w[i]; w[i] -= (0.5 / Math.sqrt(rows.length / 50)) * g / 50; step += g * g; }
      if (Math.sqrt(step) < 1e-4) break;
    }
    const count = Object.fromEntries(species.map(s => [s, 0]));
    for (const g of set) for (const s of [...g.a, ...g.b]) count[s]++;
    const rating = Object.fromEntries(species.map(s => [s, Math.round(w[at[s]] * 1000) / 1000]).sort((x, y) => y[1] - x[1]));
    power[f] = { games: set.length, measured: new Date().toISOString().slice(0, 10), rating };
    const top = Object.entries(rating);
    console.log(`${f}: ${set.length} games, ${species.length} species, ${Math.round(set.length * 12 / species.length)} draws each on average`);
    console.log("top", top.slice(0, 25).map(([s, r]) => `${s} ${r} (${count[s]})`).join(", "));
    console.log("bottom", top.slice(-12).map(([s, r]) => `${s} ${r} (${count[s]})`).join(", "));
  }
  if (args.fit) writeFileSync(POWER_FILE, JSON.stringify(power, null, 1) + "\n");
}
