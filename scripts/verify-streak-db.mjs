// Disposable PostgreSQL check of docs/db/streak_runs.sql. Never connects to Supabase.
//   node scripts/verify-streak-db.mjs <path-to-pglite-dist/index.js>
// The battles tables are built as the live database has them (2026-11-07: columns, checks and both triggers read from it), the
// accounts table as player_accounts.sql makes it, then streak_runs.sql runs on top and every rule is tried as service_role and anon.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "@electric-sql/pglite");
const pg = new PGlite();
const q = async (query, params = []) => (await pg.query(query, params)).rows;
const one = async (query, params) => (await q(query, params))[0];
const as = async (role, user) => {
  await pg.exec(`reset role; set role ${role}`);
  await q("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(user ? { sub: user } : {})]);
};
let checks = 0;
async function check(name, run) { await pg.exec("reset role"); await run(); checks++; console.log(`PASS ${name}`); }

await pg.exec(`
  create role anon; create role authenticated; create role service_role bypassrls; -- as on Supabase
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;

  create table public.battles (
    id text primary key check (id ~ '^[a-z0-9]{12}$'),
    regulation text not null check (regulation ~ '^[a-z0-9-]{1,12}$'),
    format_id text not null, engine text not null,
    status text not null default 'waiting' check (status in ('waiting', 'active', 'ended')),
    p1_name text not null check (char_length(btrim(p1_name)) between 1 and 20),
    p2_name text check (char_length(btrim(p2_name)) between 1 and 20),
    turn integer not null default 0,
    winner text check (winner in ('p1', 'p2', 'tie')),
    ended_by text check (ended_by in ('battle', 'forfeit', 'void', 'timeout')),
    spectator_log text not null default '', log text, input_log text,
    version integer not null default 0,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    kind text not null default 'friendly', event_id uuid, source_node_key text,
    p1_entry_id uuid, p2_entry_id uuid, p1_player_id uuid, p2_player_id uuid, applied_at timestamptz, apply_error text,
    deadline_at timestamptz, room text check (room is null or room in ('open', 'code')), rematch_id text,
    check ((status = 'ended') = (winner is not null and log is not null and input_log is not null)),
    constraint battles_kind check (kind in ('friendly', 'official') and ((kind = 'friendly') = (event_id is null and source_node_key is null)))
  );
  create table public.battle_secrets (
    battle_id text primary key references public.battles (id) on delete cascade,
    p1_token_hash text not null, p2_token_hash text, p1_team jsonb not null, state jsonb,
    pending jsonb not null default '{}'::jsonb, room_code text
  );
  alter table public.battles enable row level security;
  alter table public.battle_secrets enable row level security;
  revoke all on table public.battles, public.battle_secrets from public, anon, authenticated;
  grant select (id, status, kind, p1_name, p2_name, winner) on table public.battles to anon, authenticated;
  create policy battles_read on public.battles for select to anon, authenticated using (true);
  grant select on table public.battles, public.battle_secrets to service_role;
  create function public.battles_keep_official() returns trigger language plpgsql set search_path = '' as $$
  begin
    if old.kind = 'official' and old.status = 'ended' then raise exception using errcode = 'P0001', message = 'official'; end if;
    return old;
  end $$;
  create trigger battles_keep_official before delete on public.battles for each row execute function public.battles_keep_official();

  create table public.player_accounts (
    auth_user_id uuid primary key references auth.users (id) on delete cascade,
    requested_name text not null, status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))
  );
`);
const timer = readFileSync("docs/db/battle_timer.sql", "utf8");
await pg.exec(timer.slice(timer.indexOf("alter table public.battles add column if not exists deadline_at")).replace(/^update public\.battles[^;]*;/m, ""));
await pg.exec(readFileSync("docs/db/streak_runs.sql", "utf8"));
// run twice: the file must be safe to run again
await pg.exec(readFileSync("docs/db/streak_runs.sql", "utf8"));

const users = {};
for (const [key, name, status] of [["a", "이제빈", "approved"], ["b", "김선수", "approved"], ["c", "대기중", "pending"], ["d", "아주아주긴트레이너이름입니다스물한글자가넘는", "approved"]]) {
  users[key] = randomUUID();
  await q("insert into auth.users values ($1)", [users[key]]);
  await q("insert into public.player_accounts values ($1, $2, $3)", [users[key], name, status]);
}
let n = 0;
const bid = () => `b${String(++n).padStart(11, "0")}`;
const game = id => [id, "m-c", "gen9championsbssregmc", "test", "hash", JSON.stringify([]), JSON.stringify({ engine: true }), JSON.stringify({ p2: "team 1, 2, 3" }), 0, "|start|"];
const start = async user => {
  const id = bid();
  return { id, run: (await one("select public.streak_start($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [user, ...game(id)])).r };
};
// the battle function writes battles only through its RPCs; what stands in for those writes here runs as the owner
const owned = async (query, params) => { await pg.exec("reset role"); try { return await q(query, params); } finally { await pg.exec("set role service_role"); } };
const end = (id, winner) => owned("update public.battles set status = 'ended', winner = $2, ended_by = 'battle', log = 'log', input_log = 'input' where id = $1", [id, winner]);
const after = async (id, next) => (await one("select public.streak_after_battle($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [id, ...(next ? game(next) : Array(10).fill(null))])).r;
const board = async (role = "anon", user) => { await as(role, user); const rows = await q("select * from public.streak_board()"); await pg.exec("reset role"); return rows; };

try {
  let first;
  await check("only an approved account starts, and the first game opens active with its clock running", async () => {
    await as("service_role");
    await assert.rejects(start(users.c), /승인된 Google 계정/);
    first = await start(users.a);
    const battle = await one("select kind, status, p1_name, p2_name, deadline_at, run_id from public.battles where id = $1", [first.id]);
    assert.deepEqual([battle.kind, battle.status, battle.p1_name, battle.p2_name], ["streak", "active", "이제빈", "컴퓨터"]);
    assert.ok(battle.deadline_at, "the 90 second clock runs");
    assert.equal(battle.run_id, first.run.run_id);
    assert.equal((await one("select pending from public.battle_secrets where battle_id = $1", [first.id])).pending.p2, "team 1, 2, 3");
  });

  await check("visitors read the board only: no runs table, no start, no account ids", async () => {
    await as("anon");
    await assert.rejects(q("select * from public.streak_runs"), /permission denied/);
    await assert.rejects(start(users.a), /permission denied/);
    await assert.rejects(q("select public.battle_set_cpu_memory('x', '{}')"), /permission denied/);
    const rows = await board();
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].trainer_name, rows[0].wins, rows[0].live, rows[0].battle_id], ["이제빈", 0, true, first.id]);
    assert.ok(!("auth_user_id" in rows[0]));
  });

  let second;
  await check("a win counts once, opens the next game and wipes the last one's engine state and readings", async () => {
    await as("service_role");
    await q("select public.battle_set_cpu_memory($1, $2)", [first.id, JSON.stringify({ hypotheses: [], before: null })]);
    assert.ok((await one("select cpu_memory from public.battle_secrets where battle_id = $1", [first.id])).cpu_memory);
    await end(first.id, "p1");
    second = bid();
    const r = await after(first.id, second);
    assert.deepEqual([r.wins, r.status, r.battle_id, r.counted], [1, "active", second, true]);
    const old = await one("select state, cpu_memory, pending from public.battle_secrets where battle_id = $1", [first.id]);
    assert.deepEqual([old.state, old.cpu_memory, old.pending], [null, null, {}]);
    const again = await after(first.id, bid());
    assert.deepEqual([again.wins, again.counted, again.battle_id], [1, false, second], "a request sent twice counts once");
    await assert.rejects(after(second, null), /not an ended streak battle/);
  });

  await check("the readings are kept only on an active streak game", async () => {
    await as("service_role");
    await q("select public.battle_set_cpu_memory($1, $2)", [first.id, JSON.stringify({ late: true })]);
    assert.equal((await one("select cpu_memory from public.battle_secrets where battle_id = $1", [first.id])).cpu_memory, null);
    await assert.rejects(q("select public.battle_set_cpu_memory($1, $2)", [second, JSON.stringify({ big: "x".repeat(300000) })]), /too large/);
  });

  await check("a loss ends the run with the wins it had; the board keeps it, no longer live", async () => {
    await as("service_role");
    await end(second, "p2");
    const r = await after(second, null);
    assert.deepEqual([r.wins, r.status], [1, "ended"]);
    const rows = await board();
    assert.deepEqual([rows[0].wins, rows[0].live, rows[0].battle_id], [1, false, null]);
  });

  await check("the board is one best run a trainer, most wins first, the earlier to reach it first, and marks the viewer's own", async () => {
    await as("service_role");
    let b = await start(users.b);
    for (let i = 0; i < 2; i++) { await end(b.id, "p1"); const next = bid(); await after(b.id, next); b = { id: next }; }
    await end(b.id, "tie");
    await after(b.id, null);
    const a = await start(users.a);
    await end(a.id, "p1"); const a2 = bid(); await after(a.id, a2);
    let rows = await board("authenticated", users.a);
    assert.deepEqual(rows.map(r => [r.place, r.trainer_name, r.wins, r.mine]), [[1, "김선수", 2, false], [2, "이제빈", 1, true]]);
    // 이제빈's live run also stands at 1, reached later than the first: the board keeps the earlier one
    assert.equal(rows[1].live, false);
    await end(a2, "p1"); await after(a2, bid());
    rows = await board();
    assert.deepEqual(rows.map(r => [r.trainer_name, r.wins, r.live]), [["김선수", 2, false], ["이제빈", 2, true]], "the same 2, reached later");
  });

  await check("starting again ends the running run by forfeit, keeping its wins", async () => {
    await as("service_role");
    const running = await one("select id, battle_id, wins from public.streak_runs where auth_user_id = $1 and status = 'active'", [users.a]);
    await start(users.a);
    const closed = await one("select r.status, r.wins, b.status as battle, b.ended_by, s.state from public.streak_runs r join public.battles b on b.id = r.battle_id join public.battle_secrets s on s.battle_id = b.id where r.id = $1", [running.id]);
    assert.deepEqual([closed.status, closed.wins, closed.battle, closed.ended_by, closed.state], ["ended", running.wins, "ended", "forfeit", null]);
    assert.equal((await one("select count(*)::int as c from public.streak_runs where auth_user_id = $1 and status = 'active'", [users.a])).c, 1);
  });

  await check("a game left past its clock is lost on time when anyone next starts: a lamp of its run goes out, and the board never shows it live", async () => {
    await as("service_role");
    const run = await one("select id, battle_id from public.streak_runs where auth_user_id = $1 and status = 'active'", [users.a]);
    await owned("alter table public.battles disable trigger battles_deadline");
    await owned("update public.battles set deadline_at = now() - interval '5 minutes' where id = $1", [run.battle_id]);
    await owned("alter table public.battles enable trigger battles_deadline");
    assert.equal((await board()).find(r => r.trainer_name === "이제빈").live, false);
    await start(users.b);
    const closed = await one("select r.status, r.lives, b.ended_by, b.winner from public.streak_runs r join public.battles b on b.id = r.battle_id where r.id = $1", [run.id]);
    assert.deepEqual([closed.status, closed.lives, closed.ended_by, closed.winner], ["active", 2, "timeout", "p2"]);
  });

  await check("streak games older than last month are deleted when someone starts; the run stays without its game", async () => {
    await as("service_role");
    const old = await one("select id, battle_id from public.streak_runs where auth_user_id = $1 and status = 'ended' and battle_id is not null limit 1", [users.b]);
    await owned("update public.battles set created_at = now() - interval '70 days' where id = $1", [old.battle_id]);
    const official = bid();
    await owned("insert into public.battles (id, regulation, format_id, engine, p1_name, kind, event_id, status, winner, log, input_log, created_at) values ($1, 'm-c', 'f', 'e', 'x', 'official', gen_random_uuid(), 'ended', 'p1', 'l', 'i', now() - interval '70 days')", [official]);
    await start(users.a);
    assert.equal((await one("select count(*)::int as c from public.battles where id = $1", [old.battle_id])).c, 0);
    assert.equal((await one("select battle_id from public.streak_runs where id = $1", [old.id])).battle_id, null);
    assert.equal((await one("select count(*)::int as c from public.battles where id = $1", [official])).c, 1, "official battles are never touched");
  });

  await check("the function learns the trainer's name first, and a name longer than a battle's twenty stands as its first twenty", async () => {
    await as("service_role");
    assert.equal((await one("select public.streak_trainer_name($1) as n", [users.c])).n, null);
    const long = (await one("select public.streak_trainer_name($1) as n", [users.d])).n;
    assert.equal([...long].length, 20);
    const d = await start(users.d);
    assert.equal((await one("select p1_name from public.battles where id = $1", [d.id])).p1_name, long);
    await as("anon");
    await assert.rejects(q("select public.streak_trainer_name($1)", [users.a]), /permission denied/);
  });

  await check("a win counts without opening a game, the run rests, and 다음 판 opens the next once, only after a win", async () => {
    await as("service_role");
    const run = await one("select id, battle_id from public.streak_runs where auth_user_id = $1 and status = 'active'", [users.d]);
    await end(run.battle_id, "p1");
    const r = await after(run.battle_id, null);
    assert.deepEqual([r.wins, r.status, r.battle_id, r.counted], [1, "active", run.battle_id, true]);
    assert.equal((await one("select count(*)::int as c from public.battles where run_id = $1", [run.id])).c, 1, "no game opened with the win");
    assert.equal((await after(run.battle_id, null)).counted, false, "counted once");
    assert.equal((await one("select public.streak_run_wins($1) as w", [run.battle_id])).w, 1);
    const next = bid();
    const opened = (await one("select public.streak_next($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [run.battle_id, ...game(next)])).r;
    assert.deepEqual([opened.battle_id, opened.wins], [next, 1]);
    assert.equal((await one("select status from public.battles where id = $1", [next])).status, "active");
    await assert.rejects(one("select public.streak_next($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [run.battle_id, ...game(bid())]), /이미 열렸거나/);
    await end(next, "p2");
    await after(next, null);
    // the function from before the lamps (streak_after_battle) still ends a run on its first lost game, and an ended run opens nothing
    await assert.rejects(one("select public.streak_next($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [next, ...game(bid())]), /이미 열렸거나 도전이 끝났습니다/);
    await as("anon");
    await assert.rejects(q("select public.streak_next('x', null, null, null, null, null, null, null, null, null, null)"), /permission denied/);
  });

  await check("the three lamps: a lost game puts one out and is opened again, a gatekeeper beaten lights one, the third one out ends the run", async () => {
    await as("service_role");
    const settle = async (id, relight = false) => (await one("select public.streak_settle($1, $2) as r", [id, relight])).r;
    const next = async from => { const id = bid(); await one("select public.streak_next($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [from, ...game(id)]); return id; };
    const first = await start(users.d);
    assert.equal(first.run.lives, 3);
    await assert.rejects(settle(first.id), /not an ended streak battle/);
    await end(first.id, "p2");
    assert.deepEqual(await settle(first.id), { run_id: first.run.run_id, wins: 0, lives: 2, status: "active" });
    assert.deepEqual(await settle(first.id), { run_id: first.run.run_id, wins: 0, lives: 2, status: "active" }, "counted once");
    assert.equal((await one("select state from public.battle_secrets where battle_id = $1", [first.id])).state, null, "a lost game keeps no engine state");
    const state = (await one("select public.streak_run_state($1) as r", [first.id])).r;
    assert.deepEqual({ ...state, run_id: undefined }, { run_id: undefined, wins: 0, lives: 2, status: "active", battle_id: first.id, offer: null, daily: null, games: 1 });
    // the lost game again, then won as a gatekeeper's: a lamp is lit again, and never past three
    const again = await next(first.id);
    await assert.rejects(next(first.id), /이미 열렸거나/);
    await end(again, "p1");
    assert.deepEqual(await settle(again, true), { run_id: first.run.run_id, wins: 1, lives: 3, status: "active" });
    const third = await next(again);
    await end(third, "p1");
    assert.equal((await settle(third, true)).lives, 3, "never past three");
    // three lost games, a tie among them, end the run
    let at = third;
    for (const [winner, lives, status] of [["p2", 2, "active"], ["tie", 1, "active"], ["p2", 0, "ended"]]) {
      at = await next(at);
      await end(at, winner);
      assert.deepEqual(await settle(at), { run_id: first.run.run_id, wins: 2, lives, status });
    }
    await assert.rejects(next(at), /이미 열렸거나 도전이 끝났습니다/);
    assert.ok((await one("select ended_at from public.streak_runs where id = $1", [first.run.run_id])).ended_at);
    await as("anon");
    await assert.rejects(q("select public.streak_settle('x', false)"), /permission denied/);
    await assert.rejects(q("select public.streak_run_state('x')"), /permission denied/);
  });

  await check("a run begins with no game, waiting on its draft; the first game opens once; doors are kept until the next game; the daily tower is once a day and apart", async () => {
    await as("service_role");
    const begin = async (user, daily = false) => (await one("select public.streak_begin($1, 'gen9championsbssregmc', $2::jsonb, $3) as r", [user, JSON.stringify({ draft: [["A"]] }), daily])).r;
    const run = await begin(users.a);
    assert.deepEqual([run.wins, run.lives, run.daily], [0, 3, null]);
    const active = (await one("select public.streak_active_run($1, false) as r", [users.a])).r;
    assert.deepEqual([active.run_id, active.battle_id, active.offer, active.games], [run.run_id, null, { draft: [["A"]] }, 0]);
    const id = bid();
    const opened = (await one("select public.streak_first($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [run.run_id, ...game(id)])).r;
    assert.equal(opened.battle_id, id);
    assert.equal((await one("select offer from public.streak_runs where id = $1", [run.run_id])).offer, null, "the draft is spent with the first game");
    await assert.rejects(one("select public.streak_first($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [run.run_id, ...game(bid())]), /이미 열렸거나/);
    // a won game keeps the doors offered with it until the next game opens
    await end(id, "p1");
    const doors = { doors: [{ kind: "even" }, { kind: "hard" }], reach: 0 };
    await one("select public.streak_settle($1, false, $2::jsonb) as r", [id, JSON.stringify(doors)]);
    assert.deepEqual((await one("select public.streak_run_state($1) as r", [id])).r.offer, doors);
    const next = bid();
    await one("select public.streak_next($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [id, ...game(next)]);
    assert.equal((await one("select offer from public.streak_runs where id = $1", [run.run_id])).offer, null, "the doors are spent with the next game");
    // the daily tower: a run of its own beside the month's, once a day, on its own board and not on the month's
    const day = await begin(users.a, true);
    assert.ok(day.daily);
    assert.equal((await one("select status from public.streak_runs where id = $1", [run.run_id])).status, "active", "the month's run goes on beside the daily one");
    await assert.rejects(begin(users.a, true), /하루에 한 번/);
    const dayGame = bid();
    await one("select public.streak_first($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as r", [day.run_id, ...game(dayGame)]);
    await end(dayGame, "p1");
    await one("select public.streak_settle($1, false, null) as r", [dayGame]);
    await as("anon");
    const daily = await q("select * from public.streak_daily_board()");
    assert.deepEqual(daily.map(r => [r.place, r.wins]), [[1, 1]]);
    assert.ok(!(await q("select * from public.streak_board()")).some(r => r.trainer_name === daily[0].trainer_name && r.wins === 1 && !r.live), "the month's board leaves the daily run out");
    // anyone watching reads a run's lamps and state through its game, and nothing else of it
    assert.deepEqual((await one("select public.streak_run_public($1) as r", [dayGame])).r, { wins: 1, lives: 3, status: "active", daily: true });
    await assert.rejects(q("select public.streak_begin($1, 'f', null, false)", [users.a]), /permission denied/);
    await assert.rejects(q("select public.streak_active_run($1, false)", [users.a]), /permission denied/);
  });

  await check("streak games do not use up the friendly limits, and new runs stop at 300 a day", async () => {
    await as("service_role");
    for (let i = 0; i < 25; i++) await owned("select public.streak_open_battle((select id from public.streak_runs limit 1), $1, 'm-c', 'f', 'e', 'x', 'h', '[]', null, null, 0, '')", [bid()]);
    await q("select public.battle_create($1, 'm-c', 'f', 'e', '친선', 'h', '[]')", [bid()]);
    await owned("insert into public.streak_runs (auth_user_id, trainer_name, format_id, month, status, ended_at) select $1, 'x', 'f', current_date, 'ended', now() from generate_series(1, 300)", [users.b]);
    await assert.rejects(start(users.b), /오늘의 도전의 탑이 모두 찼습니다/);
  });

  await check("a streak game always belongs to a run, and only a streak game does", async () => {
    await as("service_role");
    await assert.rejects(owned("insert into public.battles (id, regulation, format_id, engine, p1_name, kind) values ($1, 'm-c', 'f', 'e', 'x', 'streak')", [bid()]), /battles_run_kind/);
    await assert.rejects(owned("insert into public.battles (id, regulation, format_id, engine, p1_name, run_id) values ($1, 'm-c', 'f', 'e', 'x', (select id from public.streak_runs limit 1))", [bid()]), /battles_run_kind/);
  });

  console.log(`${checks} checks passed`);
} finally {
  await pg.close();
}
