export const CHAMPIONS_ADVANCEMENT_TYPES = ["ranking", "qualifier", "manual"];

export function championshipSettings(event = {}) {
  const settings = event?.competition_settings?.championship;
  return settings && typeof settings === "object" ? settings : {};
}

export const CHAMPIONSHIP_QUALIFIER_FORMAT = "double_elimination";
export const CHAMPIONSHIP_FINAL_FORMAT = "single_elimination";

export function championshipPhaseLabel(event = {}) {
  if (event?.event_type !== "champions") return "";
  if (event?.championship_phase === "qualifier") return "선발전";
  if (event?.championship_phase === "final") return "본선";
  return "";
}

export function championshipEventPickerLabel(event = {}) {
  const phase = championshipPhaseLabel(event);
  return phase ? `[${phase}] ${event.name || "Champions"}` : event.name || "Champions";
}

export function buildChampionshipRecordApplyCompletionOptions({
  event = null,
  roundNumber = null,
  revealOfficialRosters = false,
  // Compatibility for callers saved before roster visibility was named by
  // its domain meaning rather than the historical column name.
  revealFinalTeams = false,
} = {}) {
  const shouldRevealOfficialRosters = Boolean(revealOfficialRosters || revealFinalTeams);
  const isFinal = event?.event_type === "champions" && event?.championship_phase === "final";
  if (!isFinal) return { revealOfficialRosters: shouldRevealOfficialRosters };
  const championshipOrdinal = Number(roundNumber);
  if (!Number.isInteger(championshipOrdinal) || championshipOrdinal < 1) {
    throw new Error("Champions 공식 회차는 1 이상의 정수여야 합니다.");
  }
  return { revealOfficialRosters: true, championshipOrdinal };
}

export function normalizeChampionshipApplicationDraft(eventDraft = {}) {
  const name = String(eventDraft.name || "").trim();
  const battleFormat = String(eventDraft.battleFormat || "").trim();
  const generation = Number(eventDraft.generation);
  const finalCapacity = Number(eventDraft.finalCapacity);
  if (!name) throw new Error("Champions 대회 이름을 입력해 주세요.");
  if (!["singles", "doubles"].includes(battleFormat)) throw new Error("Champions 배틀 형식은 싱글 또는 더블이어야 합니다.");
  if (!Number.isInteger(generation) || generation < 1) throw new Error("Champions generation을 입력해 주세요.");
  if (!Number.isInteger(finalCapacity) || finalCapacity < 2) throw new Error("본선 정원은 2명 이상이어야 합니다.");
  return {
    ...eventDraft,
    name,
    eventType: "champions",
    division: null,
    isTeamEvent: false,
    battleFormat,
    competitionFormat: null,
    generation,
    finalCapacity,
    qualificationSlots: null,
    qualifierHeldOn: eventDraft.qualifierHeldOn || eventDraft.heldOn || null,
    finalHeldOn: eventDraft.finalHeldOn || null,
    qualifierSubmissionTargetAt: eventDraft.qualifierSubmissionTargetAt || eventDraft.submissionTargetAt || null,
    finalSubmissionTargetAt: eventDraft.finalSubmissionTargetAt || null,
  };
}

export function championshipScheduleDraft(eventDraft = {}) {
  return {
    qualifierHeldOn: eventDraft.qualifierHeldOn || eventDraft.heldOn || null,
    finalHeldOn: eventDraft.finalHeldOn || null,
    qualifierSubmissionTargetAt: eventDraft.qualifierSubmissionTargetAt || eventDraft.submissionTargetAt || null,
    finalSubmissionTargetAt: eventDraft.finalSubmissionTargetAt || null,
  };
}

export function championshipAdvancementLabel(type) {
  return type === "ranking" ? "직행" : type === "qualifier" ? "선발전 통과" : type === "manual" ? "운영 대체" : "경로 미확인";
}

export function deriveQualifierSurvivorState({ entries = [], matches = [], qualificationSlots, finalCapacity, directCount = 0 } = {}) {
  const targetCount = Number.isInteger(Number(finalCapacity)) ? Number(finalCapacity) - Number(directCount) : Number(qualificationSlots);
  const activeEntries = (entries || []).filter(entry => entry?.id && entry.status !== "withdrawn");
  const entryIds = new Set(activeEntries.map(entry => entry.id));
  const lossCountByEntryId = Object.fromEntries(activeEntries.map(entry => [entry.id, 0]));
  let invalid = !Number.isInteger(targetCount) || targetCount < 1 || activeEntries.length < targetCount;
  for (const match of matches || []) {
    const winnerId = match?.winner_entry_id;
    if (!winnerId) continue;
    const a = match?.entry_a_id;
    const b = match?.entry_b_id;
    if (!a || !b || a === b || !entryIds.has(a) || !entryIds.has(b) || (winnerId !== a && winnerId !== b)) {
      invalid = true;
      continue;
    }
    const loserId = winnerId === a ? b : a;
    lossCountByEntryId[loserId] += 1;
  }
  const aliveEntryIds = activeEntries.filter(entry => lossCountByEntryId[entry.id] < 2).map(entry => entry.id);
  const eliminatedEntryIds = activeEntries.filter(entry => lossCountByEntryId[entry.id] >= 2).map(entry => entry.id);
  const aliveCount = aliveEntryIds.length;
  if (aliveCount < targetCount) invalid = true;
  const eliminatedCount = eliminatedEntryIds.length;
  const requiredEliminations = Math.max(0, activeEntries.length - targetCount);
  return {
    aliveEntryIds,
    eliminatedEntryIds,
    lossCountByEntryId,
    aliveCount,
    targetCount,
    actualParticipantCount: activeEntries.length,
    directCount: Number(directCount),
    finalCapacity: Number(finalCapacity) || null,
    qualifierTarget: targetCount,
    eliminatedCount,
    requiredEliminations,
    remainingEliminations: Math.max(0, requiredEliminations - eliminatedCount),
    readyToFinalize: !invalid && eliminatedCount === requiredEliminations && aliveCount === targetCount,
    invalid,
  };
}

export function championshipFinalCreatePreflight({ finalEvent, qualifierEvent, qualifierAdvancementCount = 0, directAdvancementCount = 0, finalRegistrations = [], advancements = [], runtimeCount = 0 } = {}) {
  if (!isChampionshipFinal(finalEvent)) return { ok: false, error: "본선 Event만 대진표를 생성할 수 있습니다." };
  if (!isChampionshipQualifier(qualifierEvent)) return { ok: false, error: "연결된 선발전 Event를 찾을 수 없습니다." };
  if (qualifierEvent.status !== "completed") return { ok: false, error: "선발전이 아직 종료되지 않아 본선 대진표를 생성할 수 없습니다." };
  const slots = Number(qualifierEvent.qualification_slots);
  if (!Number.isInteger(slots) || slots < 1) return { ok: false, error: "선발전 진출 인원 설정이 올바르지 않습니다." };
  if (Number(qualifierAdvancementCount) !== slots) return { ok: false, error: `선발전 본선 진출자가 ${Number(qualifierAdvancementCount)}/${slots}명만 확정되어 있습니다.` };
  const capacity = championshipFinalCapacity(finalEvent);
  const directTarget = capacity - slots;
  if (!Number.isInteger(capacity) || directTarget < 0) return { ok: false, error: "본선 정원과 선발전 목표 관계가 올바르지 않습니다." };
  if (Number(directAdvancementCount) !== directTarget) return { ok: false, error: `본선 직행자가 ${Number(directAdvancementCount)}/${directTarget}명으로 확정되지 않았습니다.` };
  // finalCapacity is the guaranteed advancement capacity.  A later, exceptional
  // manual advancement is an additional Final candidate, not a corruption of the
  // ranking/qualifier set; ordinary-style absence confirmation decides the field.
  if ((finalRegistrations || []).length < capacity) return { ok: false, error: `본선 진출자가 ${finalRegistrations.length}/${capacity}명으로 확정되지 않았습니다.` };
  if (!["open", "running"].includes(finalEvent.status) || finalEvent.record_applied_at) return { ok: false, error: "현재 본선 Event 상태에서는 대진표를 생성할 수 없습니다." };
  if (Number(runtimeCount) > 0) return { ok: false, error: "이미 본선 대진표가 생성되어 있습니다." };
  const provenance = new Set((advancements || []).map(row => row.final_registration_id));
  if ((finalRegistrations || []).some(registration => !provenance.has(registration.id))) return { ok: false, error: "본선 진출 경로가 확인되지 않는 참가자가 있어 대진표를 생성할 수 없습니다." };
  return { ok: true };
}

export function championshipGeneration(event = {}, fallback = null) {
  const ordinal = Number(event?.round_number);
  if (Number.isInteger(ordinal) && ordinal > 0) return ordinal;
  const settings = championshipSettings(event);
  const value = Number(settings.generation ?? settings.generationNumber);
  if (Number.isInteger(value) && value > 0) return value;
  const fallbackValue = Number(fallback);
  return Number.isInteger(fallbackValue) && fallbackValue > 0 ? fallbackValue : null;
}

export function championshipFinalCapacity(event = {}) {
  const value = Number(championshipSettings(event).finalCapacity);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function isChampionshipQualifier(event = {}) {
  return event?.event_type === "champions" && event?.championship_phase === "qualifier";
}

export function isChampionshipFinal(event = {}) {
  return event?.event_type === "champions" && event?.championship_phase === "final";
}

export function buildChampionshipSettings(event = {}, { generationNumber, finalCapacity } = {}) {
  const current = championshipSettings(event);
  const next = { ...current };
  if (generationNumber !== undefined) {
    next.generation = Number(generationNumber);
    delete next.generationNumber;
  }
  if (finalCapacity !== undefined) next.finalCapacity = Number(finalCapacity);
  return {
    ...(event?.competition_settings || {}),
    championship: next,
  };
}

export function validateAdvancementInput({
  finalEvent,
  qualifierEvent = null,
  existingAdvancements = [],
  playerId,
  advancementType,
  sourceEntry = null,
  finalCapacity = null,
} = {}) {
  const errors = [];
  if (!isChampionshipFinal(finalEvent)) errors.push("본선 Event만 advancement 대상이 될 수 있습니다.");
  if (!playerId) errors.push("Player를 선택해 주세요.");
  if (!CHAMPIONS_ADVANCEMENT_TYPES.includes(advancementType)) errors.push("지원되지 않는 advancement source입니다.");

  const duplicate = existingAdvancements.find((row) => row.player_id === playerId);
  if (duplicate) errors.push("같은 Player가 이미 본선 진출 확정되어 있습니다.");
  if (finalCapacity && existingAdvancements.length >= finalCapacity && advancementType !== "manual") {
    errors.push("본선 정원이 이미 충족되었습니다.");
  }

  if (advancementType === "qualifier" || advancementType === "ranking") {
    errors.push("직행/선발전 통과 advancement는 Qualifier 기록 반영에서만 생성할 수 있습니다.");
  }
  if (advancementType !== "qualifier" && sourceEntry) errors.push("qualifier source가 아닌 advancement에는 source Entry를 연결할 수 없습니다.");
  return errors;
}

export function buildFinalRegistrationPayload({ finalEvent, player, reason = "" } = {}) {
  const name = String(player?.display_name || player?.registration_name || "").trim();
  const generation = championshipGeneration(finalEvent);
  if (!finalEvent?.id || !player?.id || !name || !generation) throw new Error("본선 Registration에 필요한 Player identity와 Champions generation이 없습니다.");
  return {
    event_id: finalEvent.id,
    player_id: player.id,
    registration_name: name,
    registration_data: {
      champions: {
        generation,
        reason: String(reason || "").trim() || null,
      },
    },
    registration_source: "advancement",
    registered_at: new Date().toISOString(),
  };
}

export function downstreamFactsPresent({
  submissions = 0,
  entries = 0,
  entryParticipants = 0,
  matches = 0,
  results = 0,
  rankingAwards = 0,
  bracketRuntimes = 0,
  eventCompleted = false,
} = {}) {
  return Boolean(
    submissions || entries || entryParticipants || matches || results || rankingAwards || bracketRuntimes || eventCompleted
  );
}

export function advancementCancellationError(facts = {}) {
  if (downstreamFactsPresent(facts)) {
    return "본선 Registration 이후 Submission/Entry/Match/Result 등 후속 사실이 있어 advancement를 취소할 수 없습니다.";
  }
  return null;
}

export function qualifierCompletionState({ qualifierEvent, survivorState } = {}) {
  if (!isChampionshipQualifier(qualifierEvent)) return { ok: false, error: "qualifier Event만 종료할 수 있습니다." };
  const slots = Number(qualifierEvent.qualification_slots);
  const count = Number(survivorState?.aliveCount);
  if (!Number.isInteger(slots) || slots < 1) return { ok: false, error: "qualification_slots가 올바르지 않습니다." };
  if (survivorState?.invalid || count < slots) return { ok: false, error: `현재 생존 ${Number.isFinite(count) ? count : "?"}명 / 목표 ${slots}명이라 qualifier를 종료할 수 없습니다.` };
  if (count > slots) return { ok: false, error: `현재 생존 ${count}명 / 목표 ${slots}명이라 qualifier를 종료할 수 없습니다.` };
  if (qualifierEvent.status === "cancelled") return { ok: false, error: "취소된 Event는 종료할 수 없습니다." };
  if (qualifierEvent.status === "completed") return { ok: true, alreadyCompleted: true };
  return { ok: true, alreadyCompleted: false };
}
