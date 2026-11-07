// Runs the real battle function (supabase/functions/battle/index.ts, transpiled) on PGlite with the real SQL, through a stand-in for
// the few supabase-js calls it makes, and plays whole 연승 도전 runs: start, every choice, a win opening the next game, the loss,
// a forfeit. Never connects to Supabase. Run npm run build:battle first (it plays the bundle the deploy uploads).
//   node scripts/verify-streak-function.mjs <path-to-pglite-dist/index.js>
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
const ROOT = pathToFileURL(resolve(".")).href + "/";
const file = path => new URL(path, ROOT);
const { transform } = await import("esbuild");
const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "@electric-sql/pglite");
const { quickChoice, createCpu } = await import(file("src/services/battleCpu.js"));
const { loadBattle } = await import(file("supabase/functions/battle/engine.mjs"));

// ---- the database: the live shape (as scripts/verify-streak-db.mjs builds it) plus battle_save, then streak_runs.sql
const pg = new PGlite();
const verify = readFileSync(file("scripts/verify-streak-db.mjs"), "utf8");
const setup = verify.slice(verify.indexOf("  create role anon;"), verify.replace(/\r\n/g, "\n").indexOf("`);\nconst timer"));
await pg.exec(setup);
const timer = readFileSync(file("docs/db/battle_timer.sql"), "utf8");
await pg.exec(timer.slice(timer.indexOf("alter table public.battles add column if not exists deadline_at")).replace(/^update public\.battles[^;]*;/m, ""));
const battles = readFileSync(file("docs/db/battles.sql"), "utf8");
await pg.exec(battles.slice(battles.indexOf("create or replace function public.battle_save"), battles.indexOf("revoke all on function public.battle_create")));
await pg.exec(readFileSync(file("docs/db/streak_runs.sql"), "utf8"));
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
  if (res.status !== 200) throw Object.assign(new Error(json.error), { status: res.status });
  return json;
};

// ---- a run, played by the quick player from the screen's side
try {
  await assert.rejects(call({ action: "streak" }), e => e.status === 401, "no sign-in, no run");
  let seat = await call({ action: "streak" }, user);
  console.log("started", seat.id, seat.run);
  let games = 0, choices = 0, slowest = 0, wins = 0, lastStreak = null;
  for (; games < 40; games++) {
    const player = createCpu("gen9championsbssregmc", { budgetMs: 200 });
    for (let step = 0; step < 200; step++) {
      const view = await call({ action: "view", id: seat.id, token: seat.token });
      if (view.status !== "active") break;
      const secret = (await pg.query("select state, pending from public.battle_secrets where battle_id = $1", [seat.id])).rows[0];
      const engine = loadBattle(secret.state);
      const choice = player.decide(engine, "p1") || quickChoice(engine, "p1");
      const t = performance.now();
      const out = await call({ action: "choose", id: seat.id, token: seat.token, choice, rq: undefined });
      slowest = Math.max(slowest, performance.now() - t);
      choices++;
      lastStreak = out.streak;
      if (out.status === "ended") break;
    }
    if (lastStreak?.status !== "active") break;
    wins = lastStreak.wins;
    // a won game opens no next game by itself: the run rests until its player presses 다음 판
    const opened = (await pg.query("select count(*)::int as c from public.battles where kind = 'streak' and status = 'active'")).rows[0].c;
    assert.equal(opened, 0, "no game is running while the run rests after a win");
    const next = await call({ action: "streakNext", id: seat.id, token: seat.token });
    await assert.rejects(call({ action: "streakNext", id: seat.id, token: seat.token }), e => e.status === 409, "다음 판 opens once");
    console.log(`won game ${games + 1}: run at ${wins}, next ${next.id}`);
    seat = next;
  }
  console.log(`games ${games + 1}, choices ${choices}, slowest request ${Math.round(slowest)} ms, run wins ${lastStreak?.wins}`);
  const run = (await pg.query("select wins, status from public.streak_runs where auth_user_id = $1", [user])).rows[0];
  assert.equal(run.wins, lastStreak.wins);
  assert.equal(run.status, "ended");
  const board = (await pg.query("select * from public.streak_board()")).rows;
  console.log("board", board.map(r => [r.place, r.trainer_name, r.wins, r.live]));
  const leftovers = (await pg.query("select count(*)::int as c from public.battle_secrets s join public.battles b on b.id = s.battle_id where b.kind = 'streak' and b.status = 'ended' and (s.state is not null or s.cpu_memory is not null)")).rows[0].c;
  assert.equal(leftovers, 0, "ended games keep no engine state or readings");
  const ended = (await pg.query("select input_log, winner from public.battles where kind = 'streak' order by created_at")).rows;
  const { replay } = await import(file("supabase/functions/battle/engine.mjs"));
  for (const g of ended) assert.ok(replay(g.input_log).ended, "every game replays to its end");
  // a new run while none is active, then a forfeit: the run ends at 0
  seat = await call({ action: "streak" }, user);
  const lost = await call({ action: "forfeit", id: seat.id, token: seat.token });
  assert.deepEqual([lost.status, lost.streak.status, lost.streak.wins], ["ended", "ended", 0]);
  await assert.rejects(call({ action: "join", id: seat.id, name: "끼어들기", team: "random" }), /연승 도전에는 참가할 수 없습니다|이미 시작된/);
  console.log("PASS the battle function plays whole 연승 도전 runs on the real SQL");
} finally {
  globalThis.fetch = realFetch;
  await pg.close();
}
