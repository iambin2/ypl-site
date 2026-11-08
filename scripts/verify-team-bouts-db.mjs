// Disposable PostgreSQL check of docs/db/battle_team_bouts.sql. Never connects to Supabase.
//   node scripts/verify-team-bouts-db.mjs <path-to-pglite-dist/index.js>
// The few tables the two functions read are built with the columns they use, the helpers they call are stubbed as the live
// database answers them, then every seat rule and the series write are tried as service_role.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { PGlite } = await import(process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : "@electric-sql/pglite");
const pg = new PGlite();
const q = async (query, params = []) => (await pg.query(query, params)).rows;
const one = async (query, params) => (await q(query, params))[0];
let checks = 0;
async function check(name, run) { await pg.exec("reset role"); await run(); checks++; console.log(`PASS ${name}`); }

const E = "00000000-0000-0000-0000-0000000000e1";
const A = "00000000-0000-0000-0000-0000000000a1", B = "00000000-0000-0000-0000-0000000000b1";
const P = name => `00000000-0000-0000-0000-00000000${({ ga: "0001", na: "0002", da: "0003", ra: "0004" })[name]}`;
const PARENT_ID = "00000000-0000-0000-0000-00000000f001";

await pg.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema ypl_schema_validation;
  create table ypl_schema_validation.events (id uuid primary key, name text, status text, record_applied_at timestamptz, is_team_event boolean,
    competition_settings jsonb, regulation_id text, battle_format text, event_type text, championship_phase text, qualification_slots integer);
  create table ypl_schema_validation.matches (id uuid primary key default gen_random_uuid(), event_id uuid, parent_match_id uuid references ypl_schema_validation.matches(id) on delete restrict,
    match_kind text, round_number smallint, stage_label text, sequence_no integer, entry_a_id uuid, entry_b_id uuid, player_a_id uuid, player_b_id uuid,
    winner_entry_id uuid, winner_player_id uuid, resolution text, source text, source_node_key text, played_at timestamptz,
    created_at timestamptz default now(), updated_at timestamptz default now());
  create table ypl_schema_validation.event_registrations (id uuid primary key, event_id uuid, player_id uuid, registration_name text, final_submission_id uuid);
  create table ypl_schema_validation.entry_participants (id uuid primary key default gen_random_uuid(), event_id uuid, entry_id uuid, registration_id uuid, player_id uuid, member_order smallint);
  create table ypl_schema_validation.registration_submissions (id uuid primary key, registration_id uuid, revision integer, snapshot_id uuid);
  create table ypl_schema_validation.team_snapshot_members (snapshot_id uuid, slot integer, pokemon_id text, pokemon_name_snapshot text, ability_id text, nature_id text, item_id text,
    move_1_id text, move_2_id text, move_3_id text, move_4_id text, stat_hp int, stat_atk int, stat_def int, stat_spa int, stat_spd int, stat_spe int);
  create table public.battles (id text primary key, kind text, event_id uuid, source_node_key text, status text, winner text, ended_by text,
    p1_entry_id uuid, p2_entry_id uuid, p1_player_id uuid, p2_player_id uuid, applied_at timestamptz, apply_error text, updated_at timestamptz default now());
  -- the live helpers, as they answer: PIN '1234' is right for everyone; voiding ends the battle
  create function public.visitor_pin_check(p_scope text, p_subject text, p_pin text) returns text language sql as $$ select case when p_pin = '1234' then 'ok' else 'wrong_pin' end $$;
  create function public.battle_void_now(p_id text, p_reason text) returns void language sql as $$ update public.battles set status = 'ended', ended_by = 'void', winner = 'tie' where id = p_id $$;
  create function public.battle_match_stamp(p_event_id uuid) returns text language sql as $$
    select md5(coalesce(string_agg(concat_ws('|', m.id, m.winner_entry_id, m.updated_at), ',' order by m.id), '')) from ypl_schema_validation.matches m where m.event_id = p_event_id $$;
`);
await q(`insert into ypl_schema_validation.events values ($1, '팀전', 'running', null, true, '{"matchPlay":"site"}', 'm-c', 'singles', 'pokecup', null, null)`, [E]);
await q(`insert into ypl_schema_validation.matches (id, event_id, match_kind, entry_a_id, entry_b_id, resolution, source, source_node_key)
         values ($1, $2, 'bracket', $3, $4, 'unknown', 'normalized_bracket_runtime', 'r1:m1')`, [PARENT_ID, E, A, B]);
for (const [i, [name, entry, order]] of [["ga", A, 1], ["na", A, 2], ["da", B, 1], ["ra", B, 2]].entries()) {
  const reg = `10000000-0000-0000-0000-00000000000${i}`, sub = `20000000-0000-0000-0000-00000000000${i}`;
  await q(`insert into ypl_schema_validation.event_registrations values ($1, $2, $3, $4, null)`, [reg, E, P(name), name]);
  await q(`insert into ypl_schema_validation.entry_participants (event_id, entry_id, registration_id, player_id, member_order) values ($1, $2, $3, $4, $5)`, [E, entry, reg, P(name), order]);
  await q(`insert into ypl_schema_validation.registration_submissions values ($1, $2, 1, $1)`, [sub, reg]);
  await q(`insert into ypl_schema_validation.team_snapshot_members (snapshot_id, slot, pokemon_id) values ($1, 1, 'pikachu')`, [sub]);
}
const sql = readFileSync("docs/db/battle_team_bouts.sql", "utf8");
await pg.exec(sql);
await pg.exec(sql); // safe to run again

const seat = (key, side, name, pin = "1234") => one(`select public.battle_team_seat($1, $2, $3, $4, $5) as r`, [E, key, side, P(name), pin]).then(x => x.r);
let n = 0;
const battle = (key, p1, p2, winner, status = "ended", ended_by = "battle") => q(
  `insert into public.battles (id, kind, event_id, source_node_key, status, winner, ended_by, p1_entry_id, p2_entry_id, p1_player_id, p2_player_id)
   values ($1, 'official', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
  [`b${++n}`, E, key, status, winner, ended_by, [A, B][["ga", "na"].includes(p1) ? 0 : 1], p2 && [A, B][["ga", "na"].includes(p2) ? 0 : 1], P(p1), p2 && P(p2)]).then(() => `b${n}`);

await check("a team member sits in a bout with their own PIN and party", async () => {
  const r = await seat("r1:m1:bout:1", "a", "ga");
  assert.equal(r.status, "ok"); assert.equal(r.registrationName, "ga"); assert.equal(r.entryId, A); assert.equal(r.team[0].pokemonId, "pikachu");
});
await check("wrong PIN, a member of the other team, a bout past the roster, a malformed key", async () => {
  assert.equal((await seat("r1:m1:bout:1", "a", "ga", "0000")).status, "wrong_pin");
  assert.equal((await seat("r1:m1:bout:1", "a", "da")).status, "not_player");
  assert.equal((await seat("r1:m1:bout:3", "a", "ga")).status, "bad_bout");
  assert.equal((await seat("r1:m1", "a", "ga")).status, "bad_bout");
});
await check("an individual event or a Pokémon Champions event refuses team seats", async () => {
  await q(`update ypl_schema_validation.events set competition_settings = '{"matchPlay":"champions"}' where id = $1`, [E]);
  assert.equal((await seat("r1:m1:bout:1", "a", "ga")).status, "not_running");
  await q(`update ypl_schema_validation.events set competition_settings = '{"matchPlay":"random"}' where id = $1`, [E]);
  const r = await seat("r1:m1:bout:1", "a", "ga");
  assert.equal(r.status, "ok"); assert.equal(r.team, null);
  await q(`update ypl_schema_validation.events set competition_settings = '{"matchPlay":"site"}' where id = $1`, [E]);
});
const b1 = await battle("r1:m1:bout:1", "ga", "da", "p1");
await check("a decided bout does not open again, and nobody plays a second bout before the whole team has played", async () => {
  assert.equal((await seat("r1:m1:bout:1", "b", "da")).status, "bout_decided");
  assert.equal((await seat("r1:m1:bout:2", "a", "ga")).status, "played_already");
  assert.equal((await seat("r1:m1:bout:2", "a", "na")).status, "ok");
});
await check("the ace opens only once the bouts are all played and tied", async () => {
  assert.equal((await seat("r1:m1:ace", "a", "ga")).status, "ace_not_needed");
  await battle("r1:m1:bout:2", "na", "ra", "p2");
  assert.equal((await seat("r1:m1:ace", "a", "ga")).status, "ok");
});
const b3 = await battle("r1:m1:ace", "ga", "da", "p1");
await check("the finished series goes in at once, every bout battle marked, and only once", async () => {
  const stamp = (await one(`select public.battle_match_stamp($1) as s`, [E])).s;
  const child = (key, kind, seq, a, b, w) => ({ match_kind: kind, parent_match_id: PARENT_ID, sequence_no: seq, player_a_id: P(a), player_b_id: P(b), winner_player_id: P(w), resolution: "played", source_node_key: key });
  const args = [b3, "r1:m1", A, stamp,
    JSON.stringify([{ id: PARENT_ID, payload: { match_kind: "bracket", entry_a_id: A, entry_b_id: B, winner_entry_id: A, resolution: "played", played_at: new Date().toISOString() } }]), "[]", [],
    "[]", JSON.stringify([child("r1:m1:bout:1", "team_bout", 1, "ga", "da", "ga"), child("r1:m1:bout:2", "team_bout", 2, "na", "ra", "ra"), child("r1:m1:ace", "ace", 3, "ga", "da", "ga")]), [],
    ["b1", "b2"]];
  const call = `select public.battle_apply_team_series($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::uuid[], $8::jsonb, $9::jsonb, $10::uuid[], $11::text[]) as r`;
  assert.equal((await one(call, args)).r, "ok");
  assert.equal((await one(`select winner_entry_id from ypl_schema_validation.matches where id = $1`, [PARENT_ID])).winner_entry_id, A);
  assert.equal((await q(`select 1 from ypl_schema_validation.matches where parent_match_id = $1`, [PARENT_ID])).length, 3);
  assert.equal((await q(`select 1 from public.battles where applied_at is not null`)).length, 3);
  assert.equal((await one(call, args)).r, "already");
  assert.equal((await one(call, [b1, ...args.slice(1)])).r, "already");
  assert.equal((await seat("r1:m1:bout:1", "a", "ga")).status, "decided");
});
await check("a stale stamp or a winner from elsewhere writes nothing", async () => {
  await q(`update ypl_schema_validation.matches set winner_entry_id = null where id = $1`, [PARENT_ID]);
  await q(`delete from ypl_schema_validation.matches where parent_match_id = $1`, [PARENT_ID]);
  await q(`update public.battles set applied_at = null`);
  const call = `select public.battle_apply_team_series($1, 'r1:m1', $2, $3, '[]', '[]', '{}', '[]', '[]', '{}', '{}') as r`;
  assert.equal((await one(call, [b3, A, "old"])).r, "stale");
  const stamp = (await one(`select public.battle_match_stamp($1) as s`, [E])).s;
  assert.equal((await one(call, [b3, "00000000-0000-0000-0000-0000000000c1", stamp])).r, "players_changed");
  await assert.rejects(one(call, [b3, A, stamp]), /did not take the series winner/);
});
await check("only service_role may call them", async () => {
  await pg.exec("set role anon");
  await assert.rejects(seat("r1:m1:bout:1", "a", "ga"), /permission denied/);
});
console.log(`${checks} checks passed`);
