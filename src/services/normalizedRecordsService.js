import { supa as client } from "../storage.js";
import { NORMALIZED_DATA_SCHEMA } from "./normalizedCompetitionService.js";
import { readAll } from "./pagedRead.js";

const CONFIGURED_SCHEMA = import.meta.env.VITE_YPL_DATA_SCHEMA || "";

function db() {
  if (!client) throw new Error("데이터베이스 연결이 설정되지 않았습니다.");
  if (!normalizedRecordsReadEnabled()) {
    throw new Error("기록 조회 설정이 없습니다.");
  }
  return client.schema(NORMALIZED_DATA_SCHEMA);
}

function fail(error, fallback) {
  const next = new Error(error?.message || fallback);
  next.code = error?.code || "YPL_RECORDS_READ_ERROR";
  next.details = error?.details || null;
  throw next;
}

async function rows(query, fallback) {
  const { data, error } = await readAll(query);
  if (error) fail(error, fallback);
  return data || [];
}

function inEventIds(table, select, eventIds) {
  if (!eventIds.length) return Promise.resolve([]);
  return rows(
    () => db().from(table).select(select).in("event_id", eventIds),
    `${table} 기록 데이터를 읽지 못했습니다.`
  );
}

export function normalizedRecordsReadEnabled() {
  // Production은 아직 public/legacy가 기준 원본이다. P0-8 read는 Test처럼
  // custom schema가 명시된 환경에서만 활성화한다.
  return Boolean(client && CONFIGURED_SCHEMA === "ypl_schema_validation");
}

export async function fetchNormalizedRecordsSnapshot() {
  const [eventRows, seasons, players, rankingBaselines] = await Promise.all([
    rows(
      () => db()
        .from("events")
        .select(`
          id, season_id, name, round_number, event_type, division,
          battle_format, competition_format, competition_settings,
          is_team_event, regulation_id, cup_rule_id, held_on,
          date_precision, record_completeness, status, record_applied_at,
          team_revealed_at, championship_phase, championship_final_event_id
        `)
        .eq("status", "completed"),
      "공식 대회를 읽지 못했습니다."
    ),
    rows(
      () => db().from("seasons").select("id, code, name, series, number, sort_order, status"),
      "시즌을 읽지 못했습니다."
    ),
    rows(
      () => db().from("players").select("id, display_name, status"),
      "선수를 읽지 못했습니다."
    ),
    rows(
      () => db()
        .from("ranking_baselines")
        .select("id, player_id, scope, series, season_id, points, wins, runner_ups, top4s, source, note"),
      "랭킹 기준 점수를 읽지 못했습니다."
    ),
  ]);

  // Qualifier completion is a selection milestone, not record application.
  // Keep its Entry/Match participation visible while excluding it from
  // placement/result logic in the projection layer.
  const events = eventRows.filter((event) => event.record_applied_at || event.championship_phase === "qualifier");

  const eventIds = events.map((event) => event.id);
  const [entries, entryParticipants, matches, results, rankingAwards, registrationRows] = await Promise.all([
    inEventIds("entries", "id, event_id, entry_type, display_name, status", eventIds),
    inEventIds(
      "entry_participants",
      "id, event_id, entry_id, registration_id, player_id, member_order, role",
      eventIds
    ),
    inEventIds(
      "matches",
      `
        id, event_id, parent_match_id, match_kind, round_number, stage_label,
        sequence_no, entry_a_id, entry_b_id, player_a_id, player_b_id,
        winner_entry_id, winner_player_id, resolution, source,
        source_node_key, played_at
      `,
      eventIds
    ),
    inEventIds(
      "results",
      "id, event_id, entry_id, placement_code, rank_min, rank_max, placement_label, source",
      eventIds
    ),
    inEventIds(
      "ranking_awards",
      `
        id, event_id, player_id, result_id, award_kind, points_delta,
        win_delta, runner_up_delta, top4_delta, counts_series,
        counts_season, related_award_id, reason, source, created_at
      `,
      eventIds
    ),
    // The final submission, its team and the members ride along on the registration rows:
    // no extra round trips, and no submission/snapshot id list growing in the URL.
    inEventIds(
      "event_registrations",
      `
        id, event_id, player_id, registration_name, registration_source, final_submission_id,
        final_submission:registration_submissions!fk_event_registration_final_submission(
          id, registration_id, snapshot_id, revision, submitted_at, source,
          snapshot:team_snapshots(
            id, schema_version, regulation_id, cup_rule_id, source_type, source_reference,
            members:team_snapshot_members(id, snapshot_id, slot, pokemon_id, pokemon_name_snapshot)
          )
        )
      `,
      eventIds
    ),
  ]);

  const eventRegistrations = [];
  const registrationSubmissions = [];
  const snapshotById = new Map();
  for (const { final_submission: submission, ...registration } of registrationRows) {
    eventRegistrations.push(registration);
    if (!submission) continue;
    const { snapshot, ...submissionRow } = submission;
    registrationSubmissions.push(submissionRow);
    if (snapshot) snapshotById.set(snapshot.id, snapshot);
  }
  const teamSnapshots = [...snapshotById.values()].map(({ members, ...snapshot }) => snapshot);
  const teamSnapshotMembers = [...snapshotById.values()].flatMap((snapshot) => snapshot.members || []);

  return {
    schema: NORMALIZED_DATA_SCHEMA,
    events,
    seasons,
    players,
    entries,
    entryParticipants,
    matches,
    results,
    rankingBaselines,
    rankingAwards,
    eventRegistrations,
    registrationSubmissions,
    teamSnapshots,
    teamSnapshotMembers,
  };
}
