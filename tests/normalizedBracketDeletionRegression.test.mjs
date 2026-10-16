import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/pages/BracketsPage.jsx", "utf8");
const app = readFileSync("src/App.jsx", "utf8");
const singleSql = readFileSync("docs/db/normalized_bracket_runtime_rpc.sql", "utf8");
const genericSql = readFileSync("docs/db/normalized_bracket_runtime_elimination_rpc.sql", "utf8");

test("normalized deletion routes by competition topology, not Pokémon battle format", () => {
  assert.match(page, /b\.mode==="single"&&b\.projection\?\.topology==="single_elimination"/);
  assert.match(page, /\? deleteNormalizedSingleBracketRuntime\s*: deleteNormalizedBracketRuntime/);
});

test("individual Single deletion preserves durable Registration history but removes non-durable runtime identity", () => {
  const singleDelete = singleSql.slice(singleSql.indexOf("delete_normalized_single_bracket_runtime"));
  assert.doesNotMatch(singleDelete, /Submission\/history가 있어 자동 삭제할 수 없습니다/);
  assert.match(singleDelete, /if v_change\.registration_was_created\s+and not exists \([\s\S]*registration_submissions/);
  assert.match(singleDelete, /elsif v_change\.registration_player_was_changed\s+and not exists \([\s\S]*final_submission_id is not null/);
  assert.match(singleDelete, /delete from ypl_schema_validation\.players[\s\S]*event_registrations[\s\S]*entry_participants[\s\S]*matches[\s\S]*ranking_awards[\s\S]*hall_of_fame_entries/);
});

test("completed Champions qualifier must reopen before generic runtime deletion", () => {
  assert.match(genericSql, /v_event\.status not in \('open', 'running'\)/);
  assert.match(genericSql, /v_event\.record_applied_at is not null/);
  assert.doesNotMatch(genericSql, /perform ypl_schema_validation\.cancel_championship_advancement\(ca\.id\)/);
  assert.match(genericSql, /기록 반영 전 허용된 Team\/Double runtime만 삭제할 수 있습니다/);
});

test("generic deletion snapshots identity and rolls it back in FK-safe order", () => {
  const start = genericSql.indexOf("select coalesce(jsonb_agg(jsonb_build_object(");
  assert.ok(start >= 0, "identity snapshot block must exist");
  const body = genericSql.slice(start);
  const matches = body.indexOf("delete from ypl_schema_validation.matches");
  const slots = body.indexOf("delete from ypl_schema_validation.bracket_entry_slots");
  const identity = body.indexOf("delete from ypl_schema_validation.bracket_identity_changes");
  const participants = body.indexOf("delete from ypl_schema_validation.entry_participants");
  const entries = body.indexOf("delete from ypl_schema_validation.entries");
  const registrationsRestore = body.indexOf("update ypl_schema_validation.event_registrations");
  const registrationsDelete = body.indexOf("delete from ypl_schema_validation.event_registrations");
  const players = body.indexOf("delete from ypl_schema_validation.players");
  const runtime = body.indexOf("delete from ypl_schema_validation.bracket_runtimes");

  assert.ok(matches >= 0 && matches < slots);
  assert.ok(slots < identity && identity < participants);
  assert.ok(participants < entries && entries < registrationsRestore);
  assert.ok(registrationsRestore < registrationsDelete);
  assert.ok(registrationsDelete < players && players < runtime);

  assert.match(body, /jsonb_to_recordset\(v_identity_snapshot\)/);
  assert.match(body, /previous_registration_player_id/);
  assert.match(body, /not exists \(\s*select 1 from ypl_schema_validation\.event_registrations/);
  assert.match(body, /not exists \(\s*select 1 from ypl_schema_validation\.entry_participants/);
});

test("generic runtime creation failure does not double-rollback participant identity", () => {
  assert.match(page, /if\(confirmation&&!cleanupError&&!createdRuntime\)/);
  assert.match(page, /await deleteNormalizedBracketRuntime\(\{runtimeId,eventId:b\.eventId\}\)/);
  assert.doesNotMatch(page, /executeBracketDeletionLifecycle/);
});

test("normalized runtime never persists through site_data while historical read-only display stays separate", () => {
  assert.match(app, /brackets:Array\.isArray\(next\?\.brackets\)\?next\.brackets\.filter\(b=>b\?\.projection\?\.source!=="normalized"\)/);
  // The list waits for the first normalized load (skeletons first), then merges the historical read-only brackets.
  assert.match(page, /const list=normalizedInitialReady\s*\?\s*buildBracketPageList\(normalizedBrackets,data\?\.brackets\|\|\[\]\)/);
  assert.match(page, /Active Event-linked brackets are normalized-only/);
  assert.doesNotMatch(page, /data\.brackets.*syncNormalizedBracketMatches/);
});
