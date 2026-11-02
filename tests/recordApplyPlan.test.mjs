import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBracketResultSyncPlan, projectResultRows } from "../src/services/bracketResultSnapshot.js";

const SOURCE = "normalized_bracket_runtime";
const placement = (entry_id, placement_code, rank) => ({ entry_id, placement_code, rank_min: rank, rank_max: rank, placement_label: placement_code });

test("the award plan sees the results as they will be once the plan lands", () => {
  const existing = [
    { id: "kept", source: SOURCE, ...placement("a", "champion", 1) },
    { id: "moved", source: SOURCE, ...placement("b", "champion", 1) },
    { id: "gone", source: SOURCE, ...placement("c", "runner_up", 2) },
    { id: "manual", source: "manual", ...placement("d", "semifinalist", 3) },
  ];
  const plan = buildBracketResultSyncPlan(existing, [placement("a", "champion", 1), placement("b", "runner_up", 2), placement("e", "semifinalist", 3)]);
  const planned = { ...plan, inserts: plan.inserts.map(row => ({ ...row, id: "new" })) };
  const rows = projectResultRows(existing, planned);
  assert.deepEqual(rows.map(row => [row.id, row.entry_id, row.placement_code]).sort(), [
    ["kept", "a", "champion"], ["moved", "b", "runner_up"], ["new", "e", "semifinalist"],
  ]);
  assert.ok(rows.every(row => row.source === SOURCE), "only runtime results earn points");
});

test("apply is one transaction and removes stale points before the results they point at", () => {
  const sql = readFileSync("docs/db/record_apply_rpc.sql", "utf8");
  const body = sql.slice(sql.indexOf("function ypl_schema_validation.apply_event_record"), sql.indexOf("function ypl_schema_validation.revert_event_record"));
  const awardsGone = body.indexOf("delete from ypl_schema_validation.ranking_awards");
  const resultsGone = body.indexOf("delete from ypl_schema_validation.results");
  const frozen = body.indexOf("freeze_event_final_submissions(p_event_id)");
  const hallOfFame = body.indexOf("ensure_championship_final_hall_of_fame(p_event_id");
  assert.ok(awardsGone >= 0 && awardsGone < resultsGone && resultsGone < frozen && frozen < hallOfFame);
  assert.match(body, /for update/);
  assert.match(sql, /security invoker/);
  assert.doesNotMatch(sql, /grant execute[^;]*to anon/i);
});
