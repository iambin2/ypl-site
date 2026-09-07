import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rpc = readFileSync(new URL("../docs/db/champions_qualifier_survivor_rpc.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/normalizedCompetitionService.js", import.meta.url), "utf8");

test("running Qualifier target guard blocks only a new winner, not correction or cancellation", () => {
  const triggerStart = rpc.indexOf("create or replace function ypl_schema_validation.championship_qualifier_match_stop_guard");
  const triggerEnd = rpc.indexOf("drop trigger if exists championship_qualifier_match_stop_guard", triggerStart);
  const trigger = rpc.slice(triggerStart, triggerEnd);
  assert.match(trigger, /tg_op = 'UPDATE' and old\.winner_entry_id is null and new\.winner_entry_id is not null/);
  assert.doesNotMatch(trigger, /old\.winner_entry_id is distinct from new\.winner_entry_id/);
  assert.match(trigger, /v_event\.status = 'completed'.*?old\.winner_entry_id/is);
  assert.match(service, /!previousByNode\.get\(row\.source_node_key\)\?\.winner_entry_id/);
});
