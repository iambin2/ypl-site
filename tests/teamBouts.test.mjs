// A team match played as site battles: each bout is a battle, and the finished series goes in exactly as the operator's team entry would.
import assert from "node:assert/strict";
import test from "node:test";
import { buildBracketMatchSyncPlan, buildEventBracketMatchSnapshot, resolveBracketMatchParentIds } from "../src/services/bracketMatchSnapshot.js";
import { collectGraphMatches, planTeamSeries, projectRuntimeFacts, withSeries } from "../src/services/bracketWinnerPlan.js";
import { aceKey, boutKey, parseBoutKey, seriesFromBouts, teamBouts } from "../src/services/teamBouts.js";

const EVENT_ID = "event-t", RUNTIME_ID = "runtime-t", NOW = "2026-11-08T00:00:00.000Z";
const ok = data => ({ data, error: null });
// two teams of two: A팀 (가, 나) and B팀 (다, 라)
const TEAMS = [["entry-a", "A팀", ["가", "나"]], ["entry-b", "B팀", ["다", "라"]]];
const MEMBERS = TEAMS.flatMap(([entry, , names]) => names.map((name, i) => ({ entry, name, order: i + 1 })));
const playerOf = name => `player-${name}`;
function facts(matches) {
  const event = { id: EVENT_ID, name: "팀전", is_team_event: true, competition_format: "single_elimination", status: "running" };
  const runtime = { id: RUNTIME_ID, event_id: EVENT_ID, topology_kind: "single_elimination", projection_version: 1 };
  return projectRuntimeFacts(runtime, event, {
    slots: ok(TEAMS.map(([entry_id], i) => ({ bracket_runtime_id: RUNTIME_ID, event_id: EVENT_ID, stage_kind: "elimination", stage_no: 1, pool_no: 0, slot_no: i + 1, entry_id }))),
    entries: ok(TEAMS.map(([id, display_name], i) => ({ id, event_id: EVENT_ID, entry_type: "team", display_name, status: "active", seed: i + 1 }))),
    participants: ok(MEMBERS.map((m, i) => ({ id: `ep-${i}`, event_id: EVENT_ID, entry_id: m.entry, registration_id: `reg-${m.name}`, player_id: playerOf(m.name), member_order: m.order, role: m.order === 1 ? "captain" : null }))),
    matches: ok(matches),
    registrations: ok(MEMBERS.map(m => ({ id: `reg-${m.name}`, event_id: EVENT_ID, registration_name: m.name }))),
  });
}
const finalKey = f => collectGraphMatches(f.bracket.graph)[0].id;
const parentRow = key => ({ id: "match-final", event_id: EVENT_ID, match_kind: "bracket", source: "normalized_bracket_runtime", source_node_key: key, entry_a_id: "entry-a", entry_b_id: "entry-b", winner_entry_id: null, resolution: "unknown", played_at: null });
// a bout battle: p1 is whoever sat first; winner is the name that won
const battle = (key, p1, p2, winner, extra = {}) => {
  const seat = name => MEMBERS.find(m => m.name === name);
  return { id: `${key}-${p1}-${p2}`, source_node_key: key, status: "ended", ended_by: winner ? "win" : "tie", updated_at: NOW,
    p1_entry_id: seat(p1).entry, p1_player_id: playerOf(p1), p1_name: p1, p2_entry_id: seat(p2).entry, p2_player_id: playerOf(p2), p2_name: p2,
    winner: winner === p1 ? "p1" : winner === p2 ? "p2" : null, ...extra };
};
const nameOf = id => MEMBERS.find(m => playerOf(m.name) === id)?.name;

test("bout keys are the child match keys and never an individual match key", () => {
  assert.equal(boutKey("r1:m1", 2), "r1:m1:bout:2");
  assert.deepEqual(parseBoutKey("double:w:r1:m1:bout:3"), { parent: "double:w:r1:m1", bout: 3, ace: false });
  assert.deepEqual(parseBoutKey(aceKey("r1:m1")), { parent: "r1:m1", bout: null, ace: true });
  for (const key of ["r1:m1", "double:w:r1:m1", "double:gf:m1", "double:reset:m1", "x:bout:0"]) assert.equal(parseBoutKey(key), null);
});

test("bouts read the open battle first, then the decided one, and ignore battles of other teams", () => {
  const key = boutKey("r1:m1", 1);
  const state = teamBouts([
    battle(key, "가", "다", null, { updated_at: "2026-11-08T00:01:00Z" }),
    battle(key, "가", "다", "다"),
    { ...battle(key, "가", "다", "가"), p2_entry_id: "entry-z" },
    { ...battle(boutKey("r1:m1", 2), "나", "라", null), status: "active", ended_by: null },
  ], "r1:m1", ["entry-a", "entry-b"], 2);
  assert.equal(state.bouts[0].winner, "b");
  assert.equal(state.bouts[0].a.name, "가");
  assert.equal(state.bouts[1].battle.status, "active");
  assert.equal(state.live, true);
  assert.equal(state.winner, null);
  assert.equal(state.aceNeeded, false);
});

test("a tied series asks for the ace, and the ace decides it", () => {
  const p = "r1:m1";
  const two = [battle(boutKey(p, 1), "가", "다", "가"), battle(boutKey(p, 2), "라", "나", "라")];
  const tied = teamBouts(two, p, ["entry-a", "entry-b"], 2);
  assert.equal(tied.aceNeeded, true);
  assert.equal(tied.winner, null);
  const done = teamBouts([...two, battle(aceKey(p), "다", "가", "가")], p, ["entry-a", "entry-b"], 2);
  assert.equal(done.winner, "a");
  assert.deepEqual(seriesFromBouts(done, nameOf), {
    winnerSide: "a",
    series: { lineupA: ["가", "나"], lineupB: ["다", "라"], games: ["a", "b"], ace: { a: "가", b: "다", winner: "a" } },
  });
});

test("a finished series plans exactly what the operator's team entry plans", () => {
  const f0 = facts([]);
  const key = finalKey(f0);
  const rows = [parentRow(key)];
  const f = facts(rows);
  const state = teamBouts([battle(boutKey(key, 1), "가", "다", "가"), battle(boutKey(key, 2), "나", "라", "나")], key, ["entry-a", "entry-b"], 2);
  const { series, winnerSide } = seriesFromBouts(state, nameOf);
  const plan = planTeamSeries(f, key, series, winnerSide, NOW, ["entry-a", "entry-b"]);
  assert.equal(plan.winnerEntryId, "entry-a");
  // the operator: withSeries, snapshot, then parents and children against the same rows (syncNormalizedBracketMatchesNow)
  const desired = buildEventBracketMatchSnapshot(withSeries(f.bracket, key, series, winnerSide));
  assert.deepEqual(plan.parents, buildBracketMatchSyncPlan(rows, desired.filter(r => r.match_kind === "bracket"), NOW));
  assert.deepEqual(plan.children, buildBracketMatchSyncPlan([], resolveBracketMatchParentIds(desired.filter(r => r.match_kind !== "bracket"), rows), NOW));
  assert.deepEqual(plan.children.inserts.map(r => [r.source_node_key, r.parent_match_id, r.player_a_id, r.player_b_id, r.winner_player_id]), [
    [boutKey(key, 1), "match-final", playerOf("가"), playerOf("다"), playerOf("가")],
    [boutKey(key, 2), "match-final", playerOf("나"), playerOf("라"), playerOf("나")],
  ]);
  assert.equal(plan.parents.updates[0].payload.winner_entry_id, "entry-a");
});

test("the plan fails closed on an unfinished series, another pair of teams, or a decided match", () => {
  const key = finalKey(facts([]));
  const f = facts([parentRow(key)]);
  const half = { lineupA: ["가", null], lineupB: ["다", null], games: ["a", null], ace: null };
  assert.throws(() => planTeamSeries(f, key, half, "a", NOW, ["entry-a", "entry-b"]));
  const full = { lineupA: ["가", "나"], lineupB: ["다", "라"], games: ["a", "a"], ace: null };
  assert.throws(() => planTeamSeries(f, key, full, "a", NOW, ["entry-b", "entry-a"]), /두 팀/);
  assert.throws(() => planTeamSeries(f, key, full, "b", NOW, ["entry-a", "entry-b"]), /승자/);
  const decided = facts([{ ...parentRow(key), winner_entry_id: "entry-b", resolution: "played" }]);
  assert.throws(() => planTeamSeries(decided, key, full, "a", NOW, ["entry-a", "entry-b"]), /이미 승자/);
});
