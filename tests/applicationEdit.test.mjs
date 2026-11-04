import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../docs/db/application_edit.sql", import.meta.url), "utf8");

test("an applicant edits only their own application, with the submission PIN, before applications close", () => {
  const gate = sql.slice(sql.indexOf("function ypl_schema_validation.application_edit_gate"), sql.indexOf("function ypl_schema_validation.open_event_application"));
  // the same row, name and source the party submission checks; the same close as the insert guard
  assert.match(gate, /registration_name = btrim\(coalesce\(p_registration_name, ''\)\) and registration_source = 'application'\s+for update/);
  assert.match(gate, /e\.status = 'open' and e\.record_applied_at is null/);
  assert.match(gate, /not ypl_schema_validation\.application_closed\(a\.item -> 'form'\)/);
  // one PIN per registration, shared with the party: a wrong PIN returns a value so the failure count is kept
  assert.match(gate, /visitor_pin_check\('submission', v_subject, p_pin\)/);
  assert.ok(gate.indexOf("application_closed") < gate.indexOf("visitor_pin_check"));
  assert.doesNotMatch(gate, /raise exception[^;]*wrong_pin/);
  // the gate is internal; visitors reach only the two wrappers
  assert.match(sql, /revoke all on function ypl_schema_validation\.application_edit_gate\(uuid, text, text\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant execute on function ypl_schema_validation\.application_edit_gate/);
  // only the answers change: never the name, the event or the player
  const edit = sql.slice(sql.indexOf("function ypl_schema_validation.edit_event_application"));
  assert.match(edit, /set registration_data = jsonb_set\(registration_data, '\{answers\}', p_answers\), updated_at = now\(\)/);
  assert.doesNotMatch(edit, /registration_name\s*=|event_id\s*=|player_id\s*=/);
});
