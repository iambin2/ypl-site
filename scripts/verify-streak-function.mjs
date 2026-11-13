// Runs the real battle function (supabase/functions/battle/index.ts, transpiled) on PGlite with the real SQL, through a stand-in for
// the few supabase-js calls it makes, and plays whole 연승 도전 runs: start, every choice, a win opening the next game, a lost game
// putting out a lamp and played again, the last one ending the run, a gatekeeper lighting the spare, a forfeit, the clock.
// Since 2026-11-11 (docs/BATTLE_STREAK.md 14장) a run starts with two lamps and holds two at most; since 15장 the foes are built for each game
// from the whole random pool, and a run's doors seldom bring back what it was shown (the offer's seen).
// Never connects to Supabase. Run npm run build:battle first (it plays the bundle the deploy uploads).
//   node scripts/verify-streak-function.mjs <path-to-pglite-dist/index.js> [--sure]
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
const ROOT = pathToFileURL(resolve(".")).href + "/";
const file = path => new URL(path, ROOT);
const { transform } = await import("esbuild");
const { PGlite } = await import(process.argv[2] && !process.argv[2].startsWith("--") ? pathToFileURL(resolve(process.argv[2])).href : "@electric-sql/pglite");
const { quickChoice, createCpu } = await import(file("src/services/battleCpu.js"));
const { loadBattle, sideTeam } = await import(file("supabase/functions/battle/engine.mjs"));
const { STREAK_BAN, STREAK_LIVES, STREAK_START_LIVES, STREAK_STEP, swapTier } = await import(file("src/services/streak.js"));

// ---- the database: the live shape (as scripts/verify-streak-db.mjs builds it) plus battle_save, then streak_runs.sql
const pg = new PGlite();
// as one text with LF lines, so the cut is measured and made on the same string (a Windows checkout has CRLF)
const verify = readFileSync(file("scripts/verify-streak-db.mjs"), "utf8").replace(/\r\n/g, "\n");
const setup = verify.slice(verify.indexOf("  create role anon;"), verify.indexOf("`);\nconst timer"));
await pg.exec(setup);
const timer = readFileSync(file("docs/db/battle_timer.sql"), "utf8");
await pg.exec(timer.slice(timer.indexOf("alter table public.battles add column if not exists deadline_at")).replace(/^update public\.battles[^;]*;/m, ""));
const battles = readFileSync(file("docs/db/battles.sql"), "utf8");
await pg.exec(battles.slice(battles.indexOf("create or replace function public.battle_save"), battles.indexOf("revoke all on function public.battle_create")));
await pg.exec(readFileSync(file("docs/db/streak_runs.sql"), "utf8"));
// the seat taken anew (streakResume) is written by battle_set_seat
const links = readFileSync(file("docs/db/battle_links.sql"), "utf8").replace(/\r\n/g, "\n");
await pg.exec(links.slice(links.indexOf("create or replace function public.battle_set_seat"), links.indexOf("-- 6. ")));
const user = randomUUID();
await pg.query("insert into auth.users values ($1)", [user]);
await pg.query("insert into public.player_accounts values ($1, '이제빈', 'approved')", [user]);

// ---- a stand-in for the few supabase-js calls the function makes on these paths
const JSONB = new Set(["p_p1_team", "p_state", "p_pending", "p_memory"]);
const db = {
  async rpc(name, args) {
    const keys = Object.keys(args);
    const sql = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}${JSONB.has(k) ? "::jsonb" : ""}`).join(", ")}) as r`;
    try {
      const rows = (await pg.query(sql, keys.map(k => (JSONB.has(k) && args[k] != null ? JSON.stringify(args[k]) : args[k])))).rows;
      return { data: rows[0]?.r ?? null, error: null };
    } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
  },
  from(table) {
    let columns = "*", id = null;
    const chain = {
      select(c) { columns = c; return chain; },
      eq(_col, value) { id = value; return chain; },
      async maybeSingle() {
        assert.equal(table, "battles", `stand-in reads battles only, not ${table}`);
        const row = (await pg.query("select * from public.battles where id = $1", [id])).rows[0];
        if (!row) return { data: null, error: null };
        if (columns.includes("battle_secrets(*)")) row.battle_secrets = (await pg.query("select * from public.battle_secrets where battle_id = $1", [id])).rows[0];
        for (const k of ["created_at", "updated_at", "deadline_at"]) if (row[k] instanceof Date) row[k] = row[k].toISOString();
        return { data: row, error: null };
      },
    };
    return chain;
  },
  auth: { async getUser(jwt) { return jwt === "anon-key" ? { data: { user: null }, error: { message: "no user" } } : { data: { user: { id: jwt } }, error: null }; } },
};
globalThis.__db = db;
let handler;
globalThis.Deno = { env: { get: k => ({ SUPABASE_URL: "http://local", SUPABASE_SERVICE_ROLE_KEY: "service" })[k] }, serve: h => { handler = h; } };
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("{}"); // Realtime signals go nowhere

// ---- the function itself
const source = readFileSync(file("supabase/functions/battle/index.ts"), "utf8")
  .replace('import { createClient } from "npm:@supabase/supabase-js@2";', "const createClient = () => globalThis.__db;")
  .replace('from "./engine.bundle.mjs"', `from "${file("supabase/functions/battle/engine.bundle.mjs").href}"`);
const { code } = await transform(source, { loader: "ts", format: "esm" });
const built = join(tmpdir(), `battle-function-${process.pid}.mjs`);
writeFileSync(built, code);
await import(pathToFileURL(built).href);
const call = async (body, auth = "anon-key") => {
  const res = await handler(new Request("http://local/battle", { method: "POST", headers: { authorization: `Bearer ${auth}` }, body: JSON.stringify(body) }));
  const json = await res.json();
  if (res.status !== 200) throw Object.assign(new Error(json.reason ? `${json.error} (${json.reason})` : json.error), { status: res.status });
  return json;
};

// ---- a run, played by the quick player from the screen's side
try {
  await assert.rejects(call({ action: "streak" }), e => e.status === 401, "no sign-in, no run");
  let seat = await call({ action: "streak" }, user);
  console.log("started", seat.id, seat.run);
  assert.equal(seat.run.lives, STREAK_START_LIVES, "a run starts with two lamps");
  let games = 0, choices = 0, slowest = 0, wins = 0, lives = STREAK_START_LIVES, lastStreak = null, swappedOnce = false, keeperSwapped = false, gaveUp = false;
  const LIMIT = process.argv.includes("--sure") ? 12 : 40;
  const teamOf = async id => (await pg.query("select p1_team from public.battle_secrets where battle_id = $1", [id])).rows[0].p1_team;
  const banned = team => team.filter(m => STREAK_BAN.items.includes(m.item) || m.moves.some(move => STREAK_BAN.moves.includes(move)));
  for (; games < LIMIT; games++) {
    const player = createCpu("gen9championsbssregmc", { budgetMs: 200 });
    // neither party holds what the tower keeps out (STREAK_BAN)
    const state0 = (await pg.query("select state from public.battle_secrets where battle_id = $1", [seat.id])).rows[0].state;
    assert.deepEqual(banned(await teamOf(seat.id)), [], "our party holds nothing banned");
    assert.deepEqual(banned(state0.sides[1].pokemon.map(p => ({ item: p.set.item, moves: p.set.moves }))), [], "the computer's party holds nothing banned");
    // --sure: the game after the first gatekeeper is given up in its first turn, so the run meets a lost game and goes on
    const giveUp = process.argv.includes("--sure") && games === STREAK_STEP;
    // --sure: the computer's Pokémon stand at 1 HP, so a run reaches its swaps, a gatekeeper and the floor after it
    if (process.argv.includes("--sure")) {
      const { state } = (await pg.query("select state from public.battle_secrets where battle_id = $1", [seat.id])).rows[0];
      for (const p of state.sides[1].pokemon) { p.hp = Math.min(p.hp, 1); p.ability = p.baseAbility = "noability"; } // no ability: Regenerator would heal a third back (the foes' sets bring it)
      await pg.query("update public.battle_secrets set state = $2::jsonb where battle_id = $1", [seat.id, JSON.stringify(state)]);
    }
    for (let step = 0; step < 200; step++) {
      const view = await call({ action: "view", id: seat.id, token: seat.token });
      if (view.status !== "active") break;
      if (giveUp && step === 1) { lastStreak = (await call({ action: "forfeit", id: seat.id, token: seat.token })).streak; gaveUp = true; break; }
      const secret = (await pg.query("select state, pending from public.battle_secrets where battle_id = $1", [seat.id])).rows[0];
      const engine = loadBattle(secret.state);
      const choice = player.decide(engine, "p1") || quickChoice(engine, "p1");
      const t = performance.now();
      const out = await call({ action: "choose", id: seat.id, token: seat.token, choice, rq: undefined });
      slowest = Math.max(slowest, performance.now() - t);
      choices++;
      lastStreak = out.streak;
      if (out.status === "ended") {
        if (process.env.DEBUG_LOSS && out.winner !== "p1") console.log(String((await pg.query("select log from public.battles where id = $1", [seat.id])).rows[0].log).split("\n").filter(l => /^\|(switch|move|-damage|faint|-heal|-ability|turn|win|-enditem|-item|-activate)\|/.test(l)).slice(-40).join("\n"));
        break;
      }
    }
    /* the lamps (docs/BATTLE_STREAK.md 14장): a lost game puts one out and the run rests on it while one is left; a gatekeeper beaten
       lights one again, two at most */
    const keeperBeaten = lastStreak.won && lastStreak.wins % STREAK_STEP === 0;
    const expected = lastStreak.won ? Math.min(STREAK_LIVES, lives + (keeperBeaten ? 1 : 0)) : lives - 1;
    assert.equal(lastStreak.lives, expected, `lamps after game ${games + 1}`);
    if (keeperBeaten && lives < STREAK_LIVES) console.log(`a gatekeeper beaten lit a lamp again: ${lives} to ${lastStreak.lives}`);
    lives = lastStreak.lives;
    assert.equal(lastStreak.status, lives > 0 ? "active" : "ended", "the run ends only when no lamp is left");
    const seen = (await call({ action: "view", id: seat.id, token: seat.token })).streak;
    assert.deepEqual([seen.wins, seen.lives, seen.status, seen.won], [lastStreak.wins, lastStreak.lives, lastStreak.status, lastStreak.won], "the seat's view of the game the run stands on says the same");
    if (lastStreak?.status !== "active") { console.log(`game ${games + 1} ended the run: won ${lastStreak.won}, wins ${lastStreak.wins}`); break; }
    // an ended game opens no next game by itself: the run rests until its player presses 다음 판 or 이어서 하기
    const opened = (await pg.query("select count(*)::int as c from public.battles where kind = 'streak' and status = 'active'")).rows[0].c;
    assert.equal(opened, 0, "no game is running while the run rests");
    if (!lastStreak.won) {
      // a lost game: the sets it was lost to are told (the ones brought), no swap is taken, and the same game is played again with the same party
      assert.equal(lastStreak.wins, wins, "a lost game counts nothing");
      assert.ok(Array.isArray(lastStreak.foe) && lastStreak.foe.length <= 3 && lastStreak.foe.every(m => m.species && m.moves?.length), "the foe's sets are told after a loss");
      const mine = await teamOf(seat.id);
      await assert.rejects(call({ action: "streakNext", id: seat.id, token: seat.token, swap: { give: mine[0].species, take: mine[1].species } }),
        e => e.status === 409 && /이긴 판에서만/.test(e.message), "a lost game offers no swap");
      const again = await call({ action: "streakNext", id: seat.id, token: seat.token });
      assert.deepEqual([again.wins, again.lives], [wins, lives], "the same game again, a lamp fewer");
      assert.deepEqual(await teamOf(again.id), mine, "with the same party");
      console.log(`lost game ${games + 1}: run at ${wins}, lamps ${lives}, again ${again.id}, told ${lastStreak.foe.map(m => m.species).join(", ") || "nothing (given up before the first turn)"}`);
      seat = again;
      continue;
    }
    assert.equal(lastStreak.foe, undefined, "a won game tells nothing more of the foe");
    wins = lastStreak.wins;
    /* the party a run started with goes all the way up, a new floor's included; a won game trades one of ours for one of the party
       beaten, tier for tier (one of another tier, two at once, or one that would bring a second species or item, is refused); after
       a gatekeeper that party is the gatekeeper's (docs/BATTLE_STREAK.md 5장, 2026-11-10) */
    const prev = await teamOf(seat.id);
    let next = null, took = null;
    const gatekeeper = wins % STREAK_STEP === 0;
    if (!swappedOnce || (gatekeeper && !keeperSwapped)) {
      const beaten = sideTeam((await pg.query("select input_log from public.battles where id = $1", [seat.id])).rows[0].input_log, "p2");
      // a gatekeeper beaten lets the trade reach a tier up (13장): a trade further than that, or down, is still refused
      const reach = gatekeeper ? 1 : 0, gap = foe => swapTier(prev[0].species) - swapTier(foe.species);
      const other = beaten.find(foe => !(gap(foe) >= 0 && gap(foe) <= reach));
      if (other) await assert.rejects(call({ action: "streakNext", id: seat.id, token: seat.token, swap: { give: prev[0].species, take: other.species } }),
        e => e.status === 409 && /같은 급|한 급 위/.test(e.message), "a swap across tiers is refused");
      await assert.rejects(call({ action: "streakNext", id: seat.id, token: seat.token, swap: [{ give: prev[0].species, take: beaten[0].species }, { give: prev[1].species, take: beaten[1].species }] }),
        e => e.status === 409 && /한 마리/.test(e.message), "two swaps at once are refused");
      for (const foe of beaten.filter(f => swapTier(f.species) === swapTier(prev[0].species))) {
        try { next = await call({ action: "streakNext", id: seat.id, token: seat.token, swap: { give: prev[0].species, take: foe.species } }); took = foe.species; break; }
        catch (e) { assert.equal(e.status, 409, e.message); }
      }
      swappedOnce = true;
      if (gatekeeper) keeperSwapped = true;
    }
    next ??= await call({ action: "streakNext", id: seat.id, token: seat.token });
    const now = await teamOf(next.id);
    const species = team => team.map(m => m.species);
    if (took) assert.deepEqual(species(now), [took, ...species(prev).slice(1)], "the swap took the beaten one for our first");
    else assert.deepEqual(now, prev, "the party goes on, a new floor's included");
    await assert.rejects(call({ action: "streakNext", id: seat.id, token: seat.token }), e => e.status === 409, "다음 판 opens once");
    console.log(`won game ${games + 1}: run at ${wins}, next ${next.id}${took ? `, swapped ${prev[0].species} for ${took}` : ""}${gatekeeper ? ", past a gatekeeper" : ""}`);
    seat = next;
  }
  if (process.argv.includes("--sure")) /* the run passed a gatekeeper (its spare lit and its trade made), then lost a game and went on. The scripted player still loses
     now and then to the tower's foes at 1 HP (priority moves, a switch at the wrong time), so the second gatekeeper is not asked */
  assert.ok(gaveUp && keeperSwapped && wins >= STREAK_STEP, "the sure run passed a gatekeeper, then lost a game and went on");
  // a run still going after the limit is given up until its last lamp is out, so it ends as every run does
  while (lastStreak?.status === "active") {
    const active = (await pg.query("select status from public.battles where id = $1", [seat.id])).rows[0].status === "active";
    if (!active) seat = await call({ action: "streakNext", id: seat.id, token: seat.token });
    lastStreak = (await call({ action: "forfeit", id: seat.id, token: seat.token })).streak;
  }
  assert.equal(lastStreak.lives, 0);
  await assert.rejects(call({ action: "streakNext", id: seat.id, token: seat.token }), e => e.status === 409, "a run with no lamp left opens no game");
  console.log(`games ${games + 1}, choices ${choices}, slowest request ${Math.round(slowest)} ms, run wins ${lastStreak?.wins}`);
  const run = (await pg.query("select wins, status, lives from public.streak_runs where auth_user_id = $1", [user])).rows[0];
  assert.equal(run.wins, lastStreak.wins);
  assert.deepEqual([run.status, run.lives], ["ended", 0]);
  const board = (await pg.query("select * from public.streak_board()")).rows;
  console.log("board", board.map(r => [r.place, r.trainer_name, r.wins, r.live]));
  const leftovers = (await pg.query("select count(*)::int as c from public.battle_secrets s join public.battles b on b.id = s.battle_id where b.kind = 'streak' and b.status = 'ended' and (s.state is not null or s.cpu_memory is not null)")).rows[0].c;
  assert.equal(leftovers, 0, "ended games keep no engine state or readings");
  const ended = (await pg.query("select input_log, winner from public.battles where kind = 'streak' order by created_at")).rows;
  const { replay } = await import(file("supabase/functions/battle/engine.mjs"));
  // --sure edits HP outside the input log, so those games do not replay
  if (!process.argv.includes("--sure")) for (const g of ended) assert.ok(replay(g.input_log).ended, "every game replays to its end");
  // a new run while none is active, then a forfeit: the game is lost, a lamp goes out, and the run rests at 0
  seat = await call({ action: "streak" }, user);
  const lost = await call({ action: "forfeit", id: seat.id, token: seat.token });
  assert.deepEqual([lost.status, lost.streak.status, lost.streak.wins, lost.streak.lives, lost.streak.won], ["ended", "active", 0, STREAK_START_LIVES - 1, false]);
  await assert.rejects(call({ action: "join", id: seat.id, name: "끼어들기", team: "random" }), /도전의 탑에는 참가할 수 없습니다|이미 시작된/);
  /* a game left by its player: anyone may ask, nothing happens while its clock runs, and once it has run out the game ends on time,
     a lamp of its run goes out, and its seat reads the run again from its view. A new run started over a resting one ends that one */
  seat = await call({ action: "streak" }, user);
  assert.equal((await pg.query("select count(*)::int as c from public.streak_runs where status = 'active'")).rows[0].c, 1, "one run at a time");
  await assert.rejects(call({ action: "expire", id: seat.id }), e => e.status === 409, "not before the clock runs out");
  // the run holds the spare, as after a gatekeeper, so the game lost on time leaves it going
  await pg.query("update public.streak_runs set lives = 2 where battle_id = $1", [seat.id]);
  await pg.query("update public.battles set deadline_at = now() - interval '5 seconds' where id = $1", [seat.id]);
  await call({ action: "expire", id: seat.id });
  const left = (await pg.query("select b.status, b.winner, b.ended_by, r.status as run from public.battles b join public.streak_runs r on r.id = b.run_id where b.id = $1", [seat.id])).rows[0];
  assert.deepEqual([left.status, left.winner, left.ended_by, left.run], ["ended", "p2", "timeout", "active"]);
  await assert.rejects(call({ action: "expire", id: seat.id }), e => e.status === 409, "once");
  const back = (await call({ action: "view", id: seat.id, token: seat.token })).streak;
  assert.deepEqual([back.wins, back.lives, back.status, back.won], [0, 1, "active", false], "the seat that was away reads a lamp out and the run going on");
  /* a game nobody asks about (its player gone for good): the next run started by anyone closes it on time, and its run loses a lamp
     (streak_start); with its last lamp, the run ends */
  seat = await call({ action: "streakNext", id: seat.id, token: seat.token });
  await pg.query("update public.streak_runs set lives = 1 where battle_id = $1", [seat.id]);
  await pg.query("update public.battles set deadline_at = now() - interval '5 minutes' where id = $1", [seat.id]);
  const other = randomUUID();
  await pg.query("insert into auth.users values ($1)", [other]);
  await pg.query("insert into public.player_accounts values ($1, '다른 선수', 'approved')", [other]);
  await call({ action: "streak" }, other);
  const swept = (await pg.query("select b.status, b.ended_by, r.status as run, r.lives from public.battles b join public.streak_runs r on r.id = b.run_id where b.id = $1", [seat.id])).rows[0];
  // since 2026-11-13 the sweep only closes the game; its run is counted by the function when the seat reads it again
  assert.deepEqual([swept.status, swept.ended_by, swept.run, swept.lives], ["ended", "timeout", "active", 1]);
  const sweptSeen = (await call({ action: "view", id: seat.id, token: seat.token })).streak;
  assert.deepEqual([sweptSeen.status, sweptSeen.lives, sweptSeen.won], ["ended", 0, false], "the swept game counted on its seat's return");
  /* 2026-11-11 (docs/BATTLE_STREAK.md 13장): a run begins with its draft; an ended game offers its doors; a strong door won lights a
     lamp and lets the trade reach a tier up; 오늘의 탑 is once a day and the same for everyone that day */
  const stateOf = async id => (await pg.query("select state from public.battle_secrets where battle_id = $1", [id])).rows[0].state;
  const sure = async (id, side) => {
    const state = await stateOf(id);
    for (const p of state.sides[side].pokemon) { p.hp = Math.min(p.hp, 1); p.ability = p.baseAbility = "noability"; } // no ability: Regenerator would heal a third back (the foes' sets bring it)
    await pg.query("update public.battle_secrets set state = $2::jsonb where battle_id = $1", [id, JSON.stringify(state)]);
  };
  const playOut = async at => {
    const player = createCpu("gen9championsbssregmc", { budgetMs: 100 });
    for (let step = 0; step < 300; step++) {
      const view = await call({ action: "view", id: at.id, token: at.token });
      if (view.status !== "active") return view.streak;
      const engine = loadBattle(await stateOf(at.id));
      const out = await call({ action: "choose", id: at.id, token: at.token, choice: player.decide(engine, "p1") || quickChoice(engine, "p1") });
      if (out.status === "ended") return out.streak;
    }
    throw new Error("a game did not end");
  };
  const begun = await call({ action: "streak", draft: true }, user);
  assert.equal(begun.draft.length, 6);
  assert.ok(begun.draft.every(row => row.length === 3) && begun.draft.flat().every(c => !c.items), "the draft is shown as sets, without the back-up items");
  await assert.rejects(call({ action: "streakDraft", picks: ["Mew"] }, user), e => e.status === 409);
  const picks = begun.draft.map(row => (row.find(c => !c.mega) || row[0]).species);
  let at = await call({ action: "streakDraft", picks }, user);
  assert.deepEqual([at.wins, at.lives, [...at.party].sort().join()], [0, STREAK_START_LIVES, [...picks].sort().join()]);
  await assert.rejects(call({ action: "streakDraft", picks }, user), e => e.status === 409, "the draft opens one game");
  // the first game lost while the run holds the spare: a lamp out, and the doors to the same game again, each six built for it (15장)
  await pg.query("update public.streak_runs set lives = 2 where battle_id = $1", [at.id]);
  let told = (await call({ action: "forfeit", id: at.id, token: at.token })).streak;
  assert.deepEqual([told.lives, told.reach, told.doors.map(d => d.kind)], [1, 0, ["even", "hard"]]);
  assert.ok(told.doors.every(d => d.species.length === 6 && !("rank" in d)), "each door shows its six, no rank");
  const kept = (await pg.query("select offer from public.streak_runs where auth_user_id = $1 and status = 'active'", [user])).rows[0].offer;
  assert.ok(told.doors.flatMap(d => d.species).every(s => kept.seen.includes(s)), "the run keeps the species its doors showed");
  // through the strong door: its six are the game's foes; won, it lights no lamp (14장) and the trade reaches a tier up
  const strong = told.doors[1].species;
  at = await call({ action: "streakNext", id: at.id, token: at.token, door: 1 });
  assert.equal(at.hard, true);
  assert.deepEqual((await stateOf(at.id)).sides[1].pokemon.map(p => p.set.species).sort(), [...strong].sort());
  await sure(at.id, 1);
  told = await playOut(at);
  assert.deepEqual([told.won, told.wins, told.lives, told.reach], [true, 1, 1, 1]);
  const mine = (await pg.query("select p1_team from public.battle_secrets where battle_id = $1", [at.id])).rows[0].p1_team;
  const beaten = sideTeam((await pg.query("select input_log from public.battles where id = $1", [at.id])).rows[0].input_log, "p2");
  let up = null;
  for (const o of mine) { const f = beaten.find(b => swapTier(b.species) === swapTier(o.species) - 1); if (f) { up = { give: o.species, take: f.species }; break; } }
  if (up) {
    const next = await call({ action: "streakNext", id: at.id, token: at.token, swap: up, door: 0 }).catch(e => ({ refused: e.message }));
    if (next.refused) assert.match(next.refused, /도구|같은 포켓몬|규정/, "a one-up trade is refused only for an item or a species");
    else { assert.ok(next.party.includes(up.take), "the trade reached a tier up"); at = next; }
    console.log(`a strong door won: lamp back to ${told.lives}, ${next.refused ? `trade refused (${next.refused})` : `traded ${up.give} up for ${up.take}`}`);
  }
  // 오늘의 탑: once a day, the same draft for everyone that day, and beside the month's run
  const day = await call({ action: "streak", draft: true, daily: true }, user);
  await assert.rejects(call({ action: "streak", draft: true, daily: true }, user), e => e.status === 429 && /하루에 한 번/.test(e.message));
  const friend = randomUUID();
  await pg.query("insert into auth.users values ($1)", [friend]);
  await pg.query("insert into public.player_accounts values ($1, '친구', 'approved')", [friend]);
  const theirs = await call({ action: "streak", draft: true, daily: true }, friend);
  assert.deepEqual(theirs.draft, day.draft, "the day's draft is everyone's");
  const dayGame = await call({ action: "streakDraft", picks: day.draft.map(row => (row.find(c => !c.mega) || row[0]).species), daily: true }, user);
  const friendGame = await call({ action: "streakDraft", picks: theirs.draft.map(row => (row.find(c => !c.mega) || row[0]).species), daily: true }, friend);
  assert.deepEqual((await stateOf(dayGame.id)).sides[1].pokemon.map(p => p.set.species), (await stateOf(friendGame.id)).sides[1].pokemon.map(p => p.set.species), "the same first foe");
  assert.equal(dayGame.daily, friendGame.daily);
  console.log("PASS the draft, the doors, the strong door and 오늘의 탑");

  /* 2026-11-13, a player away and back: a game ended but never counted (the request stopped between saving the end and
     streak_settle), a game the sweep closed while a lamp was left, a seat another device took, and yesterday's 오늘의 탑 */
  const away = randomUUID();
  await pg.query("insert into auth.users values ($1)", [away]);
  await pg.query("insert into public.player_accounts values ($1, '복귀', 'approved')", [away]);
  const awayDraft = await call({ action: "streak", draft: true }, away);
  let g = await call({ action: "streakDraft", picks: awayDraft.draft.map(row => (row.find(c => !c.mega) || row[0]).species) }, away);
  await pg.query("update public.battles set status = 'ended', winner = 'p2', ended_by = 'battle', log = spectator_log, input_log = '', version = version + 1 where id = $1", [g.id]);
  const [v1, v2] = await Promise.all([call({ action: "view", id: g.id, token: g.token }), call({ action: "view", id: g.id, token: g.token })]);
  assert.deepEqual([v1.streak.status, v1.streak.lives, v1.streak.won], ["active", STREAK_START_LIVES - 1, false], "an uncounted loss is counted on view");
  assert.deepEqual(v1.streak.doors, v2.streak.doors, "two requests counting one game tell the same doors");
  const lamp = (await pg.query("select lives from public.streak_runs where auth_user_id = $1 and status = 'active'", [away])).rows[0].lives;
  assert.equal(lamp, STREAK_START_LIVES - 1, "counted once");
  const hardSix = v1.streak.doors[1].species;
  g = await call({ action: "streakNext", id: g.id, token: g.token, door: 1 });
  assert.deepEqual((await stateOf(g.id)).sides[1].pokemon.map(p => p.set.species).sort(), [...hardSix].sort(), "the door told is the door opened");
  // the sweep closes this game while a lamp is left: the seat back finds the doors and the recap, and goes on
  await pg.query("update public.streak_runs set lives = 2 where battle_id = $1", [g.id]);
  await pg.query("update public.battles set deadline_at = now() - interval '5 minutes' where id = $1", [g.id]);
  await call({ action: "streak", draft: true }, other);
  const back2 = (await call({ action: "view", id: g.id, token: g.token })).streak;
  assert.deepEqual([back2.status, back2.lives, back2.won, back2.doors?.length], ["active", 1, false, 2], "a swept game with a lamp left gives its doors");
  assert.ok(Array.isArray(back2.foe));
  // a seat another device took: the old token is not known, and the account is given the seat back
  const taken = await call({ action: "streakResume", have: g.id, token: "stale" }, away);
  assert.ok(taken.token && taken.id === g.id, "a stale seat is given a new token");
  const kept2 = await call({ action: "streakResume", have: g.id, token: taken.token }, away);
  assert.equal(kept2.known, true, "a seat that opens the game is known");
  // yesterday's 오늘의 탑 is over for the tab
  await pg.query("update public.streak_runs set daily = daily - 1 where auth_user_id = $1 and daily is not null", [friend]);
  assert.deepEqual(await call({ action: "streakResume", daily: true }, friend), { run: null }, "an earlier day's 오늘의 탑 is not offered");
  const fresh = await call({ action: "streak", draft: true, daily: true }, friend);
  assert.ok(fresh.draft, "today's 오늘의 탑 starts over yesterday's");
  console.log("PASS away and back: an uncounted game, a swept game, a taken seat, yesterday's 오늘의 탑");

  console.log("PASS the battle function plays whole 연승 도전 runs on the real SQL");
} finally {
  globalThis.fetch = realFetch;
  await pg.close();
}
