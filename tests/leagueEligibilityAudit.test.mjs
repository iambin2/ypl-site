import assert from "node:assert/strict";
import test from "node:test";
import { buildLeagueEligibilityAudit } from "../scripts/lib/league-eligibility.mjs";

function facts({ division = "master", team = false, status = "completed", type = "pokecup" } = {}) {
  return {
    players: [{ id: "p1", display_name: "같은 이름" }, { id: "p2", display_name: "같은 이름" }],
    events: [{ id: "event", name: "대회", division, is_team_event: team, status, event_type: type, record_applied_at: null }],
    entries: [{ id: "entry", event_id: "event", status: "active", entry_type: team ? "team" : "individual" }],
    entry_participants: [{ id: "participant", event_id: "event", entry_id: "entry", player_id: "p1" }],
    matches: [], results: [],
  };
}

test("historical placement-only participation is evidence but never invented Match history", () => {
  const result = buildLeagueEligibilityAudit(facts());
  assert.equal(result.summary.individualOrRookieChampion, 1);
  assert.equal(result.summary.masterMatchOrRookieChampion, 0);
  assert.deepEqual(result.summary.entryOnlyIndividual, ["같은 이름"]);
  assert.equal(result.rows[0].evidence[0].detail, "entry_only");
});

test("same-name players remain separate identities and missing evidence is unconfirmed", () => {
  const result = buildLeagueEligibilityAudit(facts());
  assert.deepEqual(result.duplicateNames[0].playerIds, ["p1", "p2"]);
  assert.deepEqual(result.unconfirmed, [{ playerId: "p2", name: "같은 이름" }]);
});

test("rookie champion qualifies without Match rows, runner-up and corrupt ownership do not", () => {
  const raw = facts({ division: "rookie" });
  raw.results = [{ event_id: "event", entry_id: "entry", placement_code: "runner_up" }];
  assert.equal(buildLeagueEligibilityAudit(raw).rows.length, 0);
  raw.results[0].placement_code = "champion";
  assert.equal(buildLeagueEligibilityAudit(raw).summary.masterMatchOrRookieChampion, 1);
  raw.results[0].event_id = "another-event";
  assert.equal(buildLeagueEligibilityAudit(raw).rows.length, 0);
});

test("individual Light champions qualify under both historical event_type and division encodings", () => {
  for (const overrides of [{ division: "light" }, { division: null, type: "light" }]) {
    const raw = facts(overrides);
    raw.results = [{ event_id: "event", entry_id: "entry", placement_code: "champion" }];
    assert.equal(buildLeagueEligibilityAudit(raw).rows[0].lightChampion, true);
    assert.equal(buildLeagueEligibilityAudit(raw).summary.masterEligible, 1);
    raw.events[0].is_team_event = true;
    raw.entries[0].entry_type = "team";
    assert.equal(buildLeagueEligibilityAudit(raw).summary.masterEligible, 0);
  }
});

test("running, cancelled, light and Champions participation never implies Master eligibility", () => {
  for (const overrides of [{ status: "running" }, { status: "cancelled" }, { division: "light" }, { type: "champions" }, { type: "light" }]) {
    assert.equal(buildLeagueEligibilityAudit(facts(overrides)).rows.length, 0);
  }
});

test("only an own non-cancelled bracket Match is individual Match evidence", () => {
  const raw = facts();
  raw.matches = [{ event_id: "event", entry_a_id: "entry", entry_b_id: "other", match_kind: "bracket", resolution: "cancelled" }];
  assert.equal(buildLeagueEligibilityAudit(raw).rows[0].masterMatch, false);
  raw.matches[0].resolution = "played";
  assert.equal(buildLeagueEligibilityAudit(raw).rows[0].masterMatch, true);
  raw.matches[0].event_id = "other-event";
  assert.equal(buildLeagueEligibilityAudit(raw).rows[0].masterMatch, false);
});

test("team participation is separate and a team Match never implies every member played a bout", () => {
  const raw = facts({ team: true });
  raw.matches = [{ event_id: "event", entry_a_id: "entry", match_kind: "bracket", resolution: "played" }];
  let result = buildLeagueEligibilityAudit(raw);
  assert.equal(result.summary.individualOrRookieChampion, 0);
  assert.equal(result.summary.includingTeamMaster, 1);
  assert.equal(result.rows[0].evidence[0].detail, "entry_only");
  raw.matches.push({ event_id: "event", player_a_id: "p1", match_kind: "team_bout", resolution: "played" });
  result = buildLeagueEligibilityAudit(raw);
  assert.equal(result.rows[0].evidence[0].detail, "match");
});

test("mismatched ownership and missing Player are reported instead of matched by display name", () => {
  const raw = facts();
  raw.entries[0].event_id = "other-event";
  assert.equal(buildLeagueEligibilityAudit(raw).issues[0].reason, "invalid_entry_ownership");
  raw.entries[0].event_id = "event";
  raw.entry_participants[0].player_id = "missing";
  assert.equal(buildLeagueEligibilityAudit(raw).issues[0].reason, "missing_player");
});

test("repeated participant rows do not double count a player or their event evidence", () => {
  const raw = facts();
  raw.entry_participants.push({ ...raw.entry_participants[0], id: "duplicate" });
  const result = buildLeagueEligibilityAudit(raw);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].evidence.length, 1);
});
