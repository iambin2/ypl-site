import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../docs/db/champions_application_event_pair_rpc.sql", import.meta.url),
  "utf8"
);

test("Champions notice RPC atomically owns a fixed Qualifier/Final pair", () => {
  for (const pattern of [
    /save_championship_application_event_pair/i,
    /security invoker/i,
    /set search_path = ''/i,
    /'champions', null, p_battle_format, 'double_elimination'/i,
    /'champions', null, p_battle_format, 'single_elimination'/i,
    /'qualifier', p_final_event_id, null/i,
    /'final', null, null/i,
    /p_qualifier_held_on date/i,
    /p_final_held_on date/i,
    /p_qualifier_submission_target_at timestamptz/i,
    /p_final_submission_target_at timestamptz/i,
    /'generation', p_generation/i,
    /'finalCapacity', p_final_capacity/i,
    /'rankingEnabled', false/i,
    /Event pair가 부분 생성 상태/i,
  ]) assert.match(sql, pattern);
  assert.doesNotMatch(sql, /'champions', 'master'/i);
});

test("Champions pair editing preserves IDs and fails closed after downstream facts", () => {
  assert.match(sql, /v_critical_changed and/i);
  for (const table of [
    "event_registrations",
    "entries",
    "matches",
    "bracket_runtimes",
    "championship_advancements",
  ]) assert.match(sql, new RegExp(`ypl_schema_validation\\.${table}`, "i"));
  assert.match(sql, /where e\.id = p_final_event_id/i);
  assert.match(sql, /where e\.id = p_qualifier_event_id/i);
  assert.match(sql, /held_on = p_final_held_on/i);
  assert.match(sql, /submission_target_at = p_final_submission_target_at/i);
  assert.match(sql, /held_on = p_qualifier_held_on/i);
  assert.match(sql, /submission_target_at = p_qualifier_submission_target_at/i);
});

test("Champions pair cancellation is a pristine-only guard and clears the Qualifier announcement reference", () => {
  assert.match(sql, /cancel_championship_application_event_pair/i);
  assert.match(sql, /return query select p_qualifier_event_id, p_final_event_id, false/i);
  assert.match(sql, /set\s+status = 'cancelled'/i);
  for (const table of ["registration_submissions", "entry_participants", "ranking_awards", "hall_of_fame_entries"]) {
    assert.match(sql, new RegExp(`ypl_schema_validation\\.${table}`, "i"));
  }
  assert.match(sql, /registration_settings = case when e\.id = p_qualifier_event_id/i);
  assert.match(sql, /- 'announcementId'/i);
  assert.doesNotMatch(sql, /delete from ypl_schema_validation\.events/i);
});

test("Champions pair RPC privileges are admin-only (authenticated)", () => {
  assert.match(sql, /revoke all on function[\s\S]*from public/i);
  assert.match(sql, /from anon, service_role/i);
  assert.match(sql, /grant execute on function[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /grant execute[^;]*to anon/i);
  assert.doesNotMatch(sql, /security definer/i);
  for (const fn of ["create_championship_advancement", "cancel_championship_advancement", "ensure_championship_final_hall_of_fame"]) {
    assert.match(sql, new RegExp(`function ypl_schema_validation\\.${fn}\\([^$]*?security invoker`, "i"));
  }
  assert.match(sql, /grant select on table ypl_schema_validation\.championship_advancements to anon/i);
  assert.match(sql, /grant select on table ypl_schema_validation\.hall_of_fame_entries to anon/i);
  assert.doesNotMatch(sql, /grant (?:insert|delete)[\s\S]*on table ypl_schema_validation\.championship_advancements/i);
});

// The 2026-10-16 lockdown (docs/db/access_lockdown.sql): rerunning any source
// file must not hand anon a write or an admin RPC again.
test("docs/db never grants anon an admin RPC or a table write", () => {
  const dir = new URL("../docs/db/", import.meta.url);
  const statements = readdirSync(dir).filter(name => name.endsWith(".sql"))
    .flatMap(name => readFileSync(new URL(name, dir), "utf8").replace(/--.*$/gm, "").split(";"))
    .map(statement => statement.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(statement => statement.startsWith("grant ") && /\bto\b[^;]*\banon\b/.test(statement));
  const anonRpcs = new Set(["submit_registration_team_snapshot", "is_ypl_admin", "resolve_ypl_season_for_date"]);
  for (const statement of statements) {
    if (statement.startsWith("grant select ")) continue;
    const rpc = statement.match(/^grant execute on function ypl_schema_validation\.(\w+)\(/);
    if (rpc) { assert.ok(anonRpcs.has(rpc[1]), statement); continue; }
    assert.ok(
      /^grant insert \([^)]*\) on ypl_schema_validation\.event_registrations to anon$/.test(statement)
        || statement === "grant select, insert, update on public.site_data to anon",
      statement
    );
  }
  const teamSql = readFileSync(new URL("../docs/db/team_submission_rpc.sql", import.meta.url), "utf8");
  assert.match(teamSql, /function ypl_schema_validation\.submit_registration_team_snapshot\([^$]*?security definer/i);
});
