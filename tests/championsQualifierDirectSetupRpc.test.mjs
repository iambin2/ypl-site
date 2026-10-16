import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../docs/db/champions_qualifier_direct_setup_rpc.sql", import.meta.url), "utf8");
const brackets = readFileSync(new URL("../src/pages/BracketsPage.jsx", import.meta.url), "utf8");

test("Qualifier setup persists direct applicant registrations before any Final facts", () => {
  assert.match(sql, /championship_qualifier_direct_selections/i);
  assert.match(sql, /qualifier_registration_id uuid not null references ypl_schema_validation\.event_registrations/i);
  assert.match(sql, /r\.event_id=v_qualifier\.id/i);
  assert.match(sql, /qualification_slots=v_capacity-v_direct_count/i);
  assert.match(sql, /add_championship_qualifier_manual_registration/i);
  assert.match(sql, /'manual',now\(\),now\(\)/i);
  assert.match(sql, /where r\.event_id=v_qualifier\.id and r\.player_id=p_player_id/i);
  assert.match(sql, /advancement_type\) values\(rid,null,direct\.id,'ranking'\)/i);
  assert.match(sql, /Final entrant set이 finalCapacity와 정확히 일치/i);
  assert.match(brackets, /본선 직행자 선택/);
  assert.match(brackets, /선발전 실제 참가자를 확정/);
  assert.doesNotMatch(brackets, /직행자 추가/);
});

test("Qualifier apply creates both provenance sets and reopen/delete have scoped rollback", () => {
  assert.match(sql, /advancement_type\) values\(rid,null,direct\.id,'ranking'\)/i);
  assert.match(sql, /values\(rid,survivor\.id,'qualifier'\)/i);
  assert.match(sql, /delete from ypl_schema_validation\.championship_qualifier_direct_selections/i);
  assert.match(sql, /Final downstream fact가 있어 선발전 기록 반영을 취소할 수 없습니다/i);
  assert.match(sql, /clear_qualifier_direct_selections_on_runtime_delete/i);
});
