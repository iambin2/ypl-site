import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("docs/db/champions_application_event_pair_rpc.sql", "utf8");
const service = readFileSync("src/services/championsService.js", "utf8");
const page = readFileSync("src/pages/BracketsPage.jsx", "utf8");

test("Champions Final HOF removal RPC is narrow, guarded, and admin-only", () => {
  assert.match(sql, /create or replace function ypl_schema_validation\.remove_championship_final_hall_of_fame\(/);
  assert.match(sql, /remove_championship_final_hall_of_fame\([^$]*?security invoker/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /event_type <> 'champions'/);
  assert.match(sql, /championship_phase <> 'final'/);
  assert.match(sql, /status <> 'completed'/);
  assert.match(sql, /record_applied_at is null/);
  assert.match(sql, /placement_code = 'champion'/);
  assert.match(sql, /delete from ypl_schema_validation\.hall_of_fame_entries/);
  assert.match(sql, /revoke all on function ypl_schema_validation\.remove_championship_final_hall_of_fame\(uuid\) from public/);
  assert.match(sql, /grant execute on function ypl_schema_validation\.remove_championship_final_hall_of_fame\(uuid\) to authenticated/);
});

test("record revert is one transaction: HOF, then awards, then results, then release", () => {
  const rpc = readFileSync("docs/db/record_apply_rpc.sql", "utf8");
  const body = rpc.slice(rpc.indexOf("function ypl_schema_validation.revert_event_record"));
  const remove = body.indexOf("remove_championship_final_hall_of_fame(p_event_id)");
  const awards = body.indexOf("delete from ypl_schema_validation.ranking_awards", remove);
  const results = body.indexOf("delete from ypl_schema_validation.results", awards);
  const release = body.indexOf("release_championship_final_record_application(p_event_id)", results);
  assert.ok(remove >= 0 && remove < awards && awards < results && results < release);
  assert.match(page, /await revertEventRecord\(b\.eventId\)/);
  assert.doesNotMatch(page, /restoreEventBracket|deleteEventBracket/);
});

test("record apply writes through one RPC and never compensates by hand", () => {
  assert.match(page, /applyEventRecord\(b\.eventId,b,res,/);
  assert.doesNotMatch(page, /syncEventBracket|freezeEventFinalSubmissions|completeApplicationEvent/);
});

test("HOF compensation can restore the exact previous identity", () => {
  assert.match(service, /ensureChampionshipHallOfFameEntry\(eventId, \{ hallOfFameId = null \} = \{\}\)/);
  assert.match(service, /const requestedHallOfFameId = hallOfFameId \|\| databaseUuid\(\)/);
  assert.match(service, /p_hall_of_fame_id: requestedHallOfFameId/);
  assert.match(service, /export async function removeChampionshipHallOfFameEntry\(eventId\)/);
});
