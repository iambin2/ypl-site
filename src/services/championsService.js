import { supa as client } from "../storage.js";
import {
  NORMALIZED_DATA_SCHEMA,
  getCurrentSeason,
  resolveAutomaticRoundNumber,
} from "./normalizedCompetitionService.js";
import {
  isNormalizedChampionsHallOfFame,
  buildChampionshipHallOfFameParty,
  loadHallOfFameArtworkLookup,
  normalizedChampionLabel,
  normalizedSeasonLabel,
  resolveHallOfFameArtwork,
} from "./hallOfFamePresentation.js";
import { loadRecordsPokemonDirectory } from "./recordsPokemon.js";
import {
  CHAMPIONSHIP_FINAL_FORMAT,
  CHAMPIONSHIP_QUALIFIER_FORMAT,
  advancementCancellationError,
  buildChampionshipSettings,
  championshipFinalCapacity,
  championshipFinalCreatePreflight,
  deriveQualifierSurvivorState,
  isChampionshipFinal,
  isChampionshipQualifier,
  normalizeChampionshipApplicationDraft,
  validateAdvancementInput,
} from "./championsCore.js";

function db() {
  if (!client || NORMALIZED_DATA_SCHEMA !== "ypl_schema_validation") {
    throw new Error("챔피언스 운영은 테스트 데이터베이스에서만 사용할 수 있습니다.");
  }
  return client.schema(NORMALIZED_DATA_SCHEMA);
}

function fail(error, fallback) {
  const next = new Error(error?.message || fallback);
  next.code = error?.code || "YPL_CHAMPIONS_ERROR";
  next.details = error?.details || null;
  throw next;
}

const asArray = (value) => (Array.isArray(value) ? value : []);
const ids = (rows) => asArray(rows).map((row) => row?.id).filter(Boolean);

async function rows(query, fallback) {
  const { data, error } = await query;
  if (error) fail(error, fallback);
  return data || [];
}

async function rowsFor(table, select, column, values, fallback) {
  if (!values.length) return [];
  return rows(db().from(table).select(select).in(column, values), fallback);
}

export function championsOperationsEnabled() {
  return Boolean(client && NORMALIZED_DATA_SCHEMA === "ypl_schema_validation");
}

function databaseUuid() {
  if (!globalThis.crypto?.randomUUID) throw new Error("안전한 고유 ID 생성을 지원하지 않는 브라우저입니다.");
  return globalThis.crypto.randomUUID();
}

async function currentSeasonId() {
  return (await getCurrentSeason()).id;
}

export async function saveChampionshipApplicationEventPair({
  qualifierEventId = null,
  announcementId = null,
  eventDraft = {},
} = {}) {
  const draft = normalizeChampionshipApplicationDraft(eventDraft);
  const existingQualifier = qualifierEventId ? await readEvent(qualifierEventId) : null;
  if (qualifierEventId && !existingQualifier) throw new Error("수정할 챔피언스 선발전 대회를 찾을 수 없습니다.");
  if (existingQualifier && !isChampionshipQualifier(existingQualifier)) {
    throw new Error("기존 공지가 선발전과 본선에 연결되어 있지 않아 자동으로 다시 만들지 않습니다.");
  }
  const finalEventId = existingQualifier?.championship_final_event_id || databaseUuid();
  const qualifierId = existingQualifier?.id || databaseUuid();
  if (existingQualifier && !existingQualifier.season_id) {
    throw new Error("기존 챔피언스 대회의 시즌 정보가 없어 현재 시즌으로 변경하지 않습니다.");
  }
  const seasonId = existingQualifier?.season_id || await currentSeasonId();
  const existingOrdinal = Number(existingQualifier?.round_number);
  const legacyDraftOrdinal = Number(draft.generation);
  const ordinal = existingQualifier
    ? (
        Number.isInteger(existingOrdinal) && existingOrdinal > 0
          ? existingOrdinal
          : Number.isInteger(legacyDraftOrdinal) && legacyDraftOrdinal > 0
            ? legacyDraftOrdinal
            : await resolveAutomaticRoundNumber({ eventType: "champions" })
      )
    : await resolveAutomaticRoundNumber({ eventType: "champions" });

  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new Error("Champions round number could not be resolved.");
  }
  const registrationSettings = {
    ...(existingQualifier?.registration_settings || {}),
    ...(draft.registrationSettings || {}),
    ...(announcementId ? { announcementId } : {}),
  };
  const recordRuleLabel = String(
    draft.recordRuleLabel ??
    draft.competitionSettings?.recordRuleLabel ??
    existingQualifier?.competition_settings?.recordRuleLabel ??
    ""
  ).trim();

  const competitionSettings = {
    ...(draft.competitionSettings || existingQualifier?.competition_settings || {}),
    recordRuleLabel,
    // Champions placement is recorded through Result/HOF, not the ranking ledger.
    rankingEnabled: false,
  };
  const { data, error } = await db().rpc("save_championship_application_event_pair", {
    p_qualifier_event_id: qualifierId,
    p_final_event_id: finalEventId,
    p_season_id: seasonId,
    p_announcement_id: announcementId,
    p_base_name: draft.name,
    p_round_number: ordinal,
    p_battle_format: draft.battleFormat,
    p_generation: ordinal,
    p_final_capacity: draft.finalCapacity,
    p_qualification_slots: null,
    p_regulation_id: draft.regulationId || null,
    p_cup_rule_id: draft.cupRuleId || null,
    p_cup_rule_settings: draft.cupRuleSettings || {},
    p_registration_settings: registrationSettings,
    p_competition_settings: competitionSettings,
    p_qualifier_held_on: draft.qualifierHeldOn || null,
    p_final_held_on: draft.finalHeldOn || null,
    p_qualifier_submission_target_at: draft.qualifierSubmissionTargetAt ? new Date(draft.qualifierSubmissionTargetAt).toISOString() : null,
    p_final_submission_target_at: draft.finalSubmissionTargetAt ? new Date(draft.finalSubmissionTargetAt).toISOString() : null,
  });
  if (error) fail(error, "챔피언스 선발전과 본선을 저장하지 못했습니다.");
  const result = Array.isArray(data) ? data[0] : data;
  const [qualifierEvent, finalEvent] = await Promise.all([
    readEvent(result?.qualifier_event_id || qualifierId),
    readEvent(result?.final_event_id || finalEventId),
  ]);
  if (!qualifierEvent || !finalEvent
      || qualifierEvent.competition_format !== CHAMPIONSHIP_QUALIFIER_FORMAT
      || finalEvent.competition_format !== CHAMPIONSHIP_FINAL_FORMAT) {
    throw new Error("저장된 챔피언스 선발전과 본선을 다시 확인하지 못했습니다.");
  }
  return { qualifierEvent, finalEvent, created: Boolean(result?.created) };
}

export async function getChampionshipManagementSnapshot() {
  const events = await rows(
    db().from("events").select(`
      id, season_id, name, round_number, event_type, division, battle_format, competition_format,
      competition_settings, is_team_event, regulation_id, cup_rule_id,
      cup_rule_settings, registration_settings, held_on, submission_target_at, status,
      team_reveal_mode, team_revealed_at, record_applied_at,
      championship_phase, championship_final_event_id, qualification_slots
    `).eq("event_type", "champions").order("round_number", { ascending: true }),
    "챔피언스 대회를 불러오지 못했습니다."
  );
  const eventIds = ids(events);
  const registrations = await rowsFor(
    "event_registrations",
    "id, event_id, player_id, registration_name, registration_data, registration_source, registered_at, final_submission_id",
    "event_id", eventIds, "챔피언스 참가 신청을 불러오지 못했습니다."
  );
  const registrationIds = ids(registrations);
  const advancements = await rowsFor(
    "championship_advancements",
    "id, final_registration_id, source_entry_id, advancement_type, reason, created_at",
    "final_registration_id", registrationIds, "챔피언스 본선 진출을 불러오지 못했습니다."
  );
  const directSelections = await rowsFor(
    "championship_qualifier_direct_selections",
    "id, qualifier_event_id, qualifier_registration_id, player_id, created_at",
    "qualifier_event_id", eventIds, "챔피언스 본선 직행 설정을 불러오지 못했습니다."
  );
  const submissions = await rowsFor(
    "registration_submissions", "id, registration_id, snapshot_id, revision, submitted_at", "registration_id", registrationIds,
    "챔피언스 제출을 불러오지 못했습니다."
  );
  const entries = await rowsFor(
    "entries", "id, event_id, entry_type, display_name, status, seed", "event_id", eventIds,
    "챔피언스 출전 정보를 불러오지 못했습니다."
  );
  const entryParticipants = await rowsFor(
    "entry_participants", "id, event_id, entry_id, registration_id, player_id, member_order, role", "event_id", eventIds,
    "챔피언스 출전 선수를 불러오지 못했습니다."
  );
  const playerIds = [...new Set([...registrations.map((row) => row.player_id), ...entryParticipants.map((row) => row.player_id)].filter(Boolean))];
  const players = await rowsFor("players", "id, display_name, status", "id", playerIds, "챔피언스 선수를 불러오지 못했습니다.");
  const sourceEntryIds = advancements.map((row) => row.source_entry_id).filter(Boolean);
  const sourceEntries = entries.filter((row) => sourceEntryIds.includes(row.id));
  const results = await rowsFor("results", "id, event_id, entry_id, placement_code, placement_label", "event_id", eventIds, "챔피언스 결과를 불러오지 못했습니다.");
  const hallOfFame = await rowsFor("hall_of_fame_entries", "id, event_id, result_id, player_id, generation_number, generation_label, image_ref, note", "event_id", eventIds, "명예의 전당을 불러오지 못했습니다.");
  const matches = await rowsFor("matches", "id, event_id, match_kind, source, source_node_key, entry_a_id, entry_b_id, winner_entry_id, resolution, played_at", "event_id", eventIds, "챔피언스 경기를 불러오지 못했습니다.");
  const runtimes = await rowsFor("bracket_runtimes", "id, event_id, topology_kind, projection_version", "event_id", eventIds, "챔피언스 대진표를 불러오지 못했습니다.");
  return { events, registrations, advancements, directSelections, submissions, entries, sourceEntries, entryParticipants, players, results, hallOfFame, matches, runtimes };
}

async function readEvent(eventId) {
  const data = await rows(db().from("events").select(`
    id, season_id, name, round_number, event_type, division, battle_format, competition_format,
    competition_settings, is_team_event, regulation_id, cup_rule_id,
      cup_rule_settings, registration_settings, held_on, submission_target_at, status, team_reveal_at,
    team_revealed_at, record_applied_at, championship_phase,
    championship_final_event_id, qualification_slots
  `).eq("id", eventId), "챔피언스 대회를 확인하지 못했습니다.");
  return data[0] || null;
}

export async function listChampionshipAdvancementCandidates(finalEventId) {
  const snapshot = await getChampionshipManagementSnapshot();
  const finalEvent = snapshot.events.find(event => event.id === finalEventId);
  if (!isChampionshipFinal(finalEvent)) throw new Error("본선 대회만 후보를 조회할 수 있습니다.");
  const finalRegistrationIds = new Set(snapshot.registrations.filter(row => row.event_id === finalEvent.id).map(row => row.id));
  const advancedPlayerIds = new Set(snapshot.advancements.filter(row => finalRegistrationIds.has(row.final_registration_id)).map(row => {
    const registration = snapshot.registrations.find(item => item.id === row.final_registration_id);
    return registration?.player_id;
  }).filter(Boolean));
  const players = await rows(db().from("players").select("id, display_name, status").neq("status", "inactive").order("display_name", { ascending: true }), "챔피언스 후보 선수를 불러오지 못했습니다.");
  return players.filter(player => !advancedPlayerIds.has(player.id));
}

export async function listChampionshipManualParticipantCandidates(eventId) {
  const event = await readEvent(eventId);
  if (!isChampionshipQualifier(event) && !isChampionshipFinal(event)) {
    throw new Error("챔피언스 선발전 또는 본선만 수동 참가자를 추가할 수 있습니다.");
  }
  const [registrations, players] = await Promise.all([
    rows(
      db().from("event_registrations").select("player_id").eq("event_id", event.id),
      "기존 챔피언스 참가자를 확인하지 못했습니다."
    ),
    rows(
      db().from("players").select("id, display_name, status").neq("status", "inactive").order("display_name", { ascending: true }),
      "추가할 선수 후보를 불러오지 못했습니다."
    ),
  ]);
  const existingPlayerIds = new Set(registrations.map(row => row.player_id).filter(Boolean));
  return players.filter(player => !existingPlayerIds.has(player.id));
}

export async function addChampionshipQualifierManualRegistration({ qualifierEventId, playerId } = {}) {
  if (!qualifierEventId || !playerId) throw new Error("선발전과 선수를 선택해 주세요.");
  const { data, error } = await db().rpc("add_championship_qualifier_manual_registration", {
    p_qualifier_event_id: qualifierEventId,
    p_player_id: playerId,
  });
  if (error) fail(error, "선발전 수동 참가 신청을 생성하지 못했습니다.");
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.registration_id) throw new Error("선발전 수동 참가 신청 생성 결과를 확인하지 못했습니다.");
  return { registrationId: result.registration_id, created: Boolean(result.created) };
}

export async function setChampionshipQualifierDirectSelections(qualifierEventId, registrationIds = []) {
  const { data, error } = await db().rpc("set_championship_qualifier_direct_selections", {
    p_qualifier_event_id: qualifierEventId,
    p_registration_ids: [...new Set((registrationIds || []).filter(Boolean))],
  });
  if (error) fail(error, "본선 직행자를 저장하지 못했습니다.");
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function listChampionshipQualifierDirectSelectionIds(qualifierEventId) {
  const values = await rows(
    db().from("championship_qualifier_direct_selections").select("qualifier_registration_id").eq("qualifier_event_id", qualifierEventId),
    "저장된 본선 직행자를 불러오지 못했습니다."
  );
  return values.map(row => row.qualifier_registration_id).filter(Boolean);
}

export async function resolveChampionshipSubmissionEvents(eventId) {
  const event = await readEvent(eventId);
  if (!event) throw new Error("연결된 대회를 찾을 수 없습니다.");
  if (!isChampionshipQualifier(event)) return { isChampionship: false, event };
  const finalEvent = event.championship_final_event_id ? await readEvent(event.championship_final_event_id) : null;
  if (!isChampionshipFinal(finalEvent)) throw new Error("연결된 챔피언스 본선 대회를 찾을 수 없습니다.");
  return { isChampionship: true, qualifierEvent: event, finalEvent };
}

export async function preflightChampionshipFinalBracket(finalEventId) {
  const snapshot = await getChampionshipManagementSnapshot();
  const finalEvent = snapshot.events.find(event => event.id === finalEventId) || null;
  const qualifierEvent = snapshot.events.find(event => event.championship_final_event_id === finalEvent?.id) || null;
  const finalRegistrations = snapshot.registrations.filter(row => row.event_id === finalEvent?.id);
  const finalRegistrationIds = new Set(finalRegistrations.map(row => row.id));
  const advancements = snapshot.advancements.filter(row => finalRegistrationIds.has(row.final_registration_id));
  const qualifierAdvancementCount = advancements.filter(row => row.advancement_type === "qualifier").length;
  const directAdvancementCount = advancements.filter(row => row.advancement_type === "ranking").length;
  const runtimes = await rows(db().from("bracket_runtimes").select("id").eq("event_id", finalEventId), "본선 대진표 상태를 확인하지 못했습니다.");
  return championshipFinalCreatePreflight({ finalEvent, qualifierEvent, qualifierAdvancementCount, directAdvancementCount, finalRegistrations, advancements, runtimeCount: runtimes.length });
}

export async function getChampionshipQualifierState(eventId) {
  const snapshot = await getChampionshipManagementSnapshot();
  const qualifierEvent = snapshot.events.find(event => event.id === eventId) || null;
  if (!isChampionshipQualifier(qualifierEvent)) throw new Error("선발전 대회를 찾을 수 없습니다.");
  const entries = snapshot.entries.filter(entry => entry.event_id === eventId && entry.entry_type === "individual");
  const matches = snapshot.matches.filter(match => match.event_id === eventId && match.source === "normalized_bracket_runtime" && match.match_kind === "bracket");
  const directCount = snapshot.directSelections.filter(row => row.qualifier_event_id === eventId).length;
  const state = deriveQualifierSurvivorState({
    entries,
    matches,
    qualificationSlots: qualifierEvent.qualification_slots,
    finalCapacity: championshipFinalCapacity(snapshot.events.find(event => event.id === qualifierEvent.championship_final_event_id)),
    directCount,
  });
  const participantByEntryId = new Map(snapshot.entryParticipants.filter(row => row.event_id === eventId).map(row => [row.entry_id, row]));
  const playerById = new Map(snapshot.players.map(row => [row.id, row]));
  return {
    qualifierEvent,
    finalEvent: snapshot.events.find(event => event.id === qualifierEvent.championship_final_event_id) || null,
    runtime: snapshot.runtimes.find(runtime => runtime.event_id === eventId) || null,
    ...state,
    survivors: state.aliveEntryIds.map(entryId => {
      const participant = participantByEntryId.get(entryId);
      const entry = entries.find(row => row.id === entryId);
      return { entryId, playerId: participant?.player_id || null, name: playerById.get(participant?.player_id)?.display_name || entry?.display_name || "알 수 없는 선수" };
    }),
  };
}

async function updateEvent(eventId, payload) {
  const data = await rows(db().from("events").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", eventId).select().single(), "챔피언스 대회 설정을 저장하지 못했습니다.");
  return data[0] || data;
}

export async function saveChampionshipEventRelation({
  qualifierEventId,
  finalEventId,
  generationNumber,
  battleFormat = null,
  competitionFormat = null,
  finalCapacity,
  qualificationSlots,
} = {}) {
  if (!qualifierEventId || !finalEventId || qualifierEventId === finalEventId) throw new Error("선발전과 본선을 서로 다르게 선택해 주세요.");
  const [qualifier, final] = await Promise.all([readEvent(qualifierEventId), readEvent(finalEventId)]);
  if (!qualifier || !final || qualifier.event_type !== "champions" || final.event_type !== "champions") throw new Error("챔피언스 대회만 연결할 수 있습니다.");
  const slots = Number(qualificationSlots);
  const capacity = Number(finalCapacity);
  const generation = Number(generationNumber);
  if (!Number.isInteger(generation) || generation < 1 || !Number.isInteger(slots) || slots < 1 || !Number.isInteger(capacity) || capacity < 1) throw new Error("대수, 본선 정원, 선발전 통과 인원을 올바르게 입력해 주세요.");
  const previous = { qualifier, final };
  const common = {
    battle_format: battleFormat || qualifier.battle_format || final.battle_format || null,
    competition_format: competitionFormat || final.competition_format || qualifier.competition_format || null,
  };
  try {
    await updateEvent(final.id, {
      ...common,
      championship_phase: "final",
      championship_final_event_id: null,
      qualification_slots: null,
      competition_settings: buildChampionshipSettings(final, { generationNumber: generation, finalCapacity: capacity }),
    });
    return await updateEvent(qualifier.id, {
      ...common,
      championship_phase: "qualifier",
      championship_final_event_id: final.id,
      qualification_slots: slots,
      competition_settings: buildChampionshipSettings(qualifier, { generationNumber: generation, finalCapacity: capacity }),
    });
  } catch (error) {
    try {
      await updateEvent(previous.final.id, {
        battle_format: previous.final.battle_format,
        competition_format: previous.final.competition_format,
        competition_settings: previous.final.competition_settings,
        championship_phase: previous.final.championship_phase,
        championship_final_event_id: previous.final.championship_final_event_id,
        qualification_slots: previous.final.qualification_slots,
      });
      await updateEvent(previous.qualifier.id, {
        battle_format: previous.qualifier.battle_format,
        competition_format: previous.qualifier.competition_format,
        competition_settings: previous.qualifier.competition_settings,
        championship_phase: previous.qualifier.championship_phase,
        championship_final_event_id: previous.qualifier.championship_final_event_id,
        qualification_slots: previous.qualifier.qualification_slots,
      });
    } catch (restoreError) {
      error.message = `${error.message} / 연결 복구 실패: ${restoreError.message}`;
    }
    throw error;
  }
}

export async function createChampionshipAdvancement({ finalEventId, playerId, advancementType, sourceEntryId = null, reason = "" } = {}) {
  if (advancementType !== "manual") {
    throw new Error("직행/선발전 통과 본선 진출은 선발전 기록 반영에서만 생성할 수 있습니다.");
  }
  const finalEvent = await readEvent(finalEventId);
  if (!finalEvent) throw new Error("본선 대회를 찾을 수 없습니다.");
  const snapshot = await getChampionshipManagementSnapshot();
  const qualifierEvent = snapshot.events.find((event) => event.championship_final_event_id === finalEvent.id) || null;
  const existing = snapshot.advancements
    .map((advancement) => ({ ...advancement, registration: snapshot.registrations.find((registration) => registration.id === advancement.final_registration_id) }))
    .filter((row) => row.registration?.event_id === finalEvent.id);
  const finalRegistrations = snapshot.registrations.filter(row => row.event_id === finalEvent.id);
  const qualifierAdvancementCount = existing.filter(row => row.advancement_type === "qualifier").length;
  const directAdvancementCount = existing.filter(row => row.advancement_type === "ranking").length;
  const preflight = championshipFinalCreatePreflight({
    finalEvent,
    qualifierEvent,
    qualifierAdvancementCount,
    directAdvancementCount,
    finalRegistrations,
    advancements: existing,
    runtimeCount: snapshot.runtimes.filter(runtime => runtime.event_id === finalEvent.id).length,
  });
  if (!preflight.ok) throw new Error(preflight.error);
  const sourceEntry = snapshot.entries.find((entry) => entry.id === sourceEntryId) || null;
  const player = snapshot.players.find((row) => row.id === playerId)
    || (await rows(db().from("players").select("id, display_name, status").eq("id", playerId).neq("status", "inactive"), "챔피언스 선수를 확인하지 못했습니다."))[0]
    || null;
  if (!player) throw new Error("활성 선수만 본선 참가자로 추가할 수 있습니다.");
  const errors = validateAdvancementInput({
    finalEvent,
    qualifierEvent,
    existingAdvancements: existing.map((row) => ({ ...row, player_id: row.registration?.player_id })),
    playerId,
    advancementType,
    sourceEntry,
    finalCapacity: championshipFinalCapacity(finalEvent),
  });
  if (errors.length) throw new Error(errors.join(" "));
  const registrationId = databaseUuid();
  const advancementId = databaseUuid();
  const { data, error } = await db().rpc("create_championship_advancement", {
    p_advancement_id: advancementId,
    p_registration_id: registrationId,
    p_final_event_id: finalEvent.id,
    p_player_id: player.id,
    p_advancement_type: advancementType,
    p_source_entry_id: null,
    p_reason: String(reason || "").trim() || null,
  });
  if (error) fail(error, "본선 진출 기록과 본선 참가 신청을 생성하지 못했습니다.");
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.advancement_id !== advancementId || result?.registration_id !== registrationId) {
    throw new Error("챔피언스 본선 진출 생성 결과를 확인하지 못했습니다.");
  }
  return { advancementId, registrationId };
}

export async function cancelChampionshipAdvancement(advancementId) {
  const snapshot = await getChampionshipManagementSnapshot();
  const advancement = snapshot.advancements.find((row) => row.id === advancementId);
  if (!advancement) throw new Error("취소할 본선 진출을 찾을 수 없습니다.");
  const registration = snapshot.registrations.find((row) => row.id === advancement.final_registration_id);
  if (!registration) throw new Error("본선 진출의 본선 참가 신청을 찾을 수 없습니다.");
  const finalEvent = snapshot.events.find((event) => event.id === registration.event_id);
  if (!isChampionshipFinal(finalEvent) || finalEvent.status === "completed" || finalEvent.record_applied_at) throw new Error("완료된 본선의 본선 진출은 취소할 수 없습니다.");

  const [submissions, entries, entryParticipants, matches, results, rankingAwards, runtimes] = await Promise.all([
    rows(db().from("registration_submissions").select("id").eq("registration_id", registration.id), "제출 상태를 확인하지 못했습니다."),
    rows(db().from("entries").select("id").eq("event_id", finalEvent.id), "출전 정보 상태를 확인하지 못했습니다."),
    rows(db().from("entry_participants").select("id").eq("registration_id", registration.id), "출전 선수 상태를 확인하지 못했습니다."),
    rows(db().from("matches").select("id").eq("event_id", finalEvent.id), "경기 상태를 확인하지 못했습니다."),
    rows(db().from("results").select("id").eq("event_id", finalEvent.id), "결과 상태를 확인하지 못했습니다."),
    rows(db().from("ranking_awards").select("id").eq("event_id", finalEvent.id), "랭킹 포인트 상태를 확인하지 못했습니다."),
    rows(db().from("bracket_runtimes").select("id").eq("event_id", finalEvent.id), "대진표 상태를 확인하지 못했습니다."),
  ]);
  const blocked = advancementCancellationError({
    submissions: submissions.length,
    entries: entries.length,
    entryParticipants: entryParticipants.length,
    matches: matches.length,
    results: results.length,
    rankingAwards: rankingAwards.length,
    bracketRuntimes: runtimes.length,
    eventCompleted: finalEvent.status === "completed",
  });
  if (blocked) throw new Error(blocked);

  const { data, error } = await db().rpc("cancel_championship_advancement", {
    p_advancement_id: advancement.id,
  });
  if (error) fail(error, "본선 진출과 대진표가 만든 본선 참가 신청을 취소하지 못했습니다.");
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.advancement_id !== advancement.id || result?.registration_id !== registration.id) {
    throw new Error("챔피언스 본선 진출 취소 결과를 확인하지 못했습니다.");
  }
  return { advancementId: advancement.id, registrationId: registration.id };
}

export async function completeChampionshipQualifier(eventId) {
  return finalizeChampionshipQualifier(eventId);
}

export async function finalizeChampionshipQualifier(eventId) {
  const { data, error } = await db().rpc("finalize_championship_qualifier", { p_qualifier_event_id: eventId });
  if (error) fail(error, "선발전 생존자를 본선 진출자로 확정하지 못했습니다.");
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function reopenChampionshipQualifier(eventId) {
  const { data, error } = await db().rpc("reopen_championship_qualifier", { p_qualifier_event_id: eventId });
  if (error) fail(error, "선발전 종료를 취소하지 못했습니다.");
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function ensureChampionshipHallOfFameEntry(eventId, { hallOfFameId = null } = {}) {
  const event = await readEvent(eventId);
  if (!event || !isChampionshipFinal(event)) return null;
  if (event.status !== "completed" || !event.record_applied_at) throw new Error("본선 대회가 공식 완료되지 않아 명예의 전당에 등록할 수 없습니다.");
  const ordinal = Number(event.round_number);
  if (!Number.isInteger(ordinal) || ordinal < 1) throw new Error("본선의 공식 챔피언스 회차가 없어 명예의 전당에 등록할 수 없습니다.");
  const [results, existing] = await Promise.all([
    rows(db().from("results").select("id, event_id, entry_id, placement_code").eq("event_id", event.id).eq("placement_code", "champion"), "우승 결과를 읽지 못했습니다."),
    rows(db().from("hall_of_fame_entries").select("id, event_id, result_id, player_id, generation_number").eq("event_id", event.id), "기존 명예의 전당을 읽지 못했습니다."),
  ]);
  if (existing.length) return existing[0];
  if (results.length !== 1) throw new Error(`본선 우승 결과가 1건이 아니라 ${results.length}건입니다.`);
  const result = results[0];
  const participants = await rows(db().from("entry_participants").select("player_id").eq("event_id", event.id).eq("entry_id", result.entry_id), "우승자의 출전 선수 정보를 읽지 못했습니다.");
  if (participants.length !== 1 || !participants[0].player_id) throw new Error("우승자의 선수 정보를 확인할 수 없습니다.");
  const requestedHallOfFameId = hallOfFameId || databaseUuid();
  const { data, error } = await db().rpc("ensure_championship_final_hall_of_fame", {
    p_event_id: event.id,
    p_hall_of_fame_id: requestedHallOfFameId,
  });
  if (error) fail(error, "명예의 전당 등록을 저장하지 못했습니다.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.hall_of_fame_id || row.result_id !== result.id || row.player_id !== participants[0].player_id || Number(row.generation_number) !== ordinal) {
    throw new Error("명예의 전당 등록 결과를 확인하지 못했습니다.");
  }
  return row;
}

export async function removeChampionshipHallOfFameEntry(eventId) {
  const event = await readEvent(eventId);
  if (!event || !isChampionshipFinal(event)) return { removed: false };
  const { data, error } = await db().rpc("remove_championship_final_hall_of_fame", {
    p_event_id: event.id,
  });
  if (error) fail(error, "명예의 전당 등록을 취소하지 못했습니다.");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    hallOfFameId: row?.hall_of_fame_id || null,
    resultId: row?.result_id || null,
    playerId: row?.player_id || null,
    generationNumber: Number(row?.generation_number) || null,
    removed: Boolean(row?.removed),
  };
}
export async function fetchNormalizedChampionsHallOfFame() {
  if (!championsOperationsEnabled()) return [];
  const hof = await rows(db().from("hall_of_fame_entries").select("id, event_id, result_id, player_id, generation_number, generation_label, image_ref, note").order("generation_number", { ascending: false }), "명예의 전당을 불러오지 못했습니다.");
  if (!hof.length) return [];
  const eventIds = [...new Set(hof.map((row) => row.event_id).filter(Boolean))];
  const playerIds = hof.map((row) => row.player_id).filter(Boolean);
  const resultIds = hof.map((row) => row.result_id).filter(Boolean);
  const [events, players, results, artworkLookup, pokemonDirectory] = await Promise.all([
    rowsFor("events", "id, season_id, name, round_number, battle_format, competition_format, event_type, championship_phase", "id", eventIds, "명예의 전당 대회를 불러오지 못했습니다."),
    rowsFor("players", "id, display_name", "id", playerIds, "명예의 전당 선수를 불러오지 못했습니다."),
    rowsFor("results", "id, event_id, entry_id, placement_code", "id", resultIds, "명예의 전당 결과를 불러오지 못했습니다."),
    loadHallOfFameArtworkLookup().catch(() => new Map()),
    loadRecordsPokemonDirectory().catch(() => new Map()),
  ]);
  const seasonIds = [...new Set(events.map((row) => row.season_id).filter(Boolean))];
  const seasons = await rowsFor("seasons", "id, series, number, name", "id", seasonIds, "명예의 전당 시즌을 불러오지 못했습니다.");
  const entryIds = results.map((row) => row.entry_id).filter(Boolean);
  const entries = await rowsFor("entries", "id, event_id, entry_type, display_name", "id", entryIds, "명예의 전당 출전 정보를 불러오지 못했습니다.");
  const participants = await rowsFor("entry_participants", "id, event_id, entry_id, registration_id, player_id, member_order", "entry_id", entryIds, "명예의 전당 출전 선수를 불러오지 못했습니다.");
  const registrationIds = participants.map((row) => row.registration_id).filter(Boolean);
  const registrations = await rowsFor("event_registrations", "id, event_id, player_id, final_submission_id", "id", registrationIds, "명예의 전당 참가 신청을 불러오지 못했습니다.");
  const submissionIds = registrations.map((row) => row.final_submission_id).filter(Boolean);
  const submissions = await rowsFor("registration_submissions", "id, registration_id, snapshot_id", "id", submissionIds, "명예의 전당 제출을 불러오지 못했습니다.");
  const snapshotIds = submissions.map((row) => row.snapshot_id).filter(Boolean);
  const members = await rowsFor("team_snapshot_members", "id, snapshot_id, slot, pokemon_id, pokemon_name_snapshot", "snapshot_id", snapshotIds, "명예의 전당 제출 팀을 불러오지 못했습니다.");
  const eventById = new Map(events.map((row) => [row.id, row]));
  const seasonById = new Map(seasons.map((row) => [row.id, row]));
  const playerById = new Map(players.map((row) => [row.id, row]));
  const resultById = new Map(results.map((row) => [row.id, row]));
  const entryById = new Map(entries.map((row) => [row.id, row]));
  const registrationById = new Map(registrations.map((row) => [row.id, row]));
  const submissionById = new Map(submissions.map((row) => [row.id, row]));
  return hof.map((row) => {
    const event = eventById.get(row.event_id) || {};
    const season = seasonById.get(event.season_id) || {};
    const normalized = isNormalizedChampionsHallOfFame(event);
    const result = resultById.get(row.result_id) || {};
    const entry = entryById.get(result.entry_id) || {};
    const participantRows = participants.filter((item) => item.entry_id === result.entry_id).sort((a, b) => Number(a.member_order || 0) - Number(b.member_order || 0));
    const party = participantRows.flatMap((participant) => {
      const registration = registrationById.get(participant.registration_id);
      const submission = submissionById.get(registration?.final_submission_id);
      return buildChampionshipHallOfFameParty(
        members.filter((member) => member.snapshot_id === submission?.snapshot_id),
        pokemonDirectory,
        artworkLookup,
      );
    });
    return {
      id: row.id,
      kind: normalized ? "normalized" : "legacy",
      generationNumber: row.generation_number,
      gen: normalized ? normalizedChampionLabel(row.generation_number, event.battle_format) : (row.generation_label || `${row.generation_number}대`),
      season: season.number || event.round_number || row.generation_number,
      slabel: normalized ? normalizedSeasonLabel(season) : (season.name || ""),
      name: playerById.get(row.player_id)?.display_name || "알 수 없는 선수",
      team: party,
      format: event.battle_format || null,
      eventName: event.name || "",
      legacyImageRef: row.image_ref || null,
      entryType: entry.entry_type || null,
    };
  });
}
