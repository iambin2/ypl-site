// The winner plan the battle server applies is the very plan the operator's pick makes, and it fails closed.
import assert from "node:assert/strict";
import test from "node:test";
import { buildBracketMatchSyncPlan, buildEventBracketMatchSnapshot } from "../src/services/bracketMatchSnapshot.js";
import { collectGraphMatches, evalGraph, planMatchWinner, projectRuntimeFacts, withPick } from "../src/services/bracketWinnerPlan.js";

const EVENT_ID = "event-1", RUNTIME_ID = "runtime-1";
const ok = data => ({ data, error: null });
function facts(topology, matches, eventOverrides = {}) {
  const ids = ["a", "b", "c", "d"].map(x => `entry-${x}`);
  const event = { id: EVENT_ID, name: "Cup", is_team_event: false, competition_format: topology, status: "running", ...eventOverrides };
  const runtime = { id: RUNTIME_ID, event_id: EVENT_ID, topology_kind: topology, projection_version: 1 };
  return projectRuntimeFacts(runtime, event, {
    slots: ok(ids.map((entry_id, i) => ({ bracket_runtime_id: RUNTIME_ID, event_id: EVENT_ID, stage_kind: "elimination", stage_no: 1, pool_no: 0, slot_no: i + 1, entry_id }))),
    entries: ok(ids.map((id, i) => ({ id, event_id: EVENT_ID, entry_type: "individual", display_name: `P${i + 1}`, status: "active", seed: i + 1 }))),
    participants: ok(ids.map((entry_id, i) => ({ id: `ep-${i}`, event_id: EVENT_ID, entry_id, registration_id: `reg-${i}`, player_id: `player-${i}`, member_order: 1, role: null }))),
    matches: ok(matches),
    registrations: ok(ids.map((_, i) => ({ id: `reg-${i}`, event_id: EVENT_ID, registration_name: `P${i + 1}` }))),
  });
}
const row = (key, a, b, winner = null) => ({ id: `match-${key}`, event_id: EVENT_ID, match_kind: "bracket", source: "normalized_bracket_runtime", source_node_key: key, entry_a_id: a, entry_b_id: b, winner_entry_id: winner, resolution: winner ? "played" : "unknown", played_at: null });
const NOW = "2026-11-04T00:00:00.000Z";

// what the database holds after the plan: the same writes the RPC makes
function applied(rows, plan) {
  const out = rows.filter(r => !plan.deleteIds.includes(r.id)).map(r => { const u = plan.updates.find(x => x.id === r.id); return u ? { ...r, ...u.payload } : r; });
  return [...out, ...plan.inserts.map((p, i) => ({ id: `new-${i}`, event_id: EVENT_ID, source: "normalized_bracket_runtime", ...p }))];
}

test("a double elimination battle result plans exactly what the operator's pick plans", () => {
  const rows = [row("double:w:r1:m1", "entry-a", "entry-b"), row("double:w:r1:m2", "entry-c", "entry-d")];
  const f = facts("double_elimination", rows);
  const plan = planMatchWinner(f, "double:w:r1:m1", "entry-a", NOW);
  assert.equal(plan.mode, "double");
  // the operator: pick side a on that match, snapshot, plan against the same rows
  const operator = buildBracketMatchSyncPlan(rows, buildEventBracketMatchSnapshot(withPick(f.bracket, "double:w:r1:m1", "a")).filter(r => r.match_kind === "bracket"), NOW);
  assert.deepEqual({ updates: plan.updates, inserts: plan.inserts, deleteIds: plan.deleteIds }, operator);
  // and the bracket it leaves has the winner on, the loser dropped into the losers' bracket
  const after = facts("double_elimination", applied(rows, plan));
  const node = collectGraphMatches(after.bracket.graph).find(m => m.id === "double:w:r1:m1");
  assert.equal(node.winner, "a");
  assert.equal(evalGraph(after.bracket.graph).lose["double:w:r1:m1"], "entry-b");
});

test("a single elimination result goes through the single winner RPC", () => {
  const f = facts("single_elimination", [row("single:r1:m1", "entry-a", "entry-b"), row("single:r1:m2", "entry-c", "entry-d")]);
  assert.deepEqual(planMatchWinner(f, "single:r1:m2", "entry-d", NOW), { mode: "single", runtimeId: RUNTIME_ID, eventId: EVENT_ID, sourceNodeKey: "single:r1:m2", winnerEntryId: "entry-d" });
});

test("it fails closed: a stranger, a decided match, a missing match, a team event", () => {
  const rows = [row("double:w:r1:m1", "entry-a", "entry-b", "entry-a"), row("double:w:r1:m2", "entry-c", "entry-d")];
  const f = facts("double_elimination", rows);
  assert.throws(() => planMatchWinner(f, "double:w:r1:m2", "entry-a", NOW), /두 선수가 배틀의 두 선수와 다릅니다/);
  assert.throws(() => planMatchWinner(f, "double:w:r1:m1", "entry-a", NOW), /이미 승자가 정해진 경기/);
  assert.throws(() => planMatchWinner(f, "double:w:r9:m1", "entry-a", NOW), /찾을 수 없습니다/);
  assert.throws(() => planMatchWinner({ ...f, event: { ...f.event, is_team_event: true } }, "double:w:r1:m2", "entry-c", NOW), /팀전/);
});
