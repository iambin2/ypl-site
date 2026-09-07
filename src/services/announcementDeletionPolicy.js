const REASON_PRIORITY = [
  "record_applied",
  "results_exist",
  "bracket_progress_exists",
  "submissions_exist",
  "registrations_exist",
];

export function announcementDeletionReason(facts = {}) {
  const counts = facts.counts || {};
  if (facts.recordApplied) return "record_applied";
  if (Number(counts.results) || Number(counts.rankingAwards) || Number(counts.hallOfFame)) return "results_exist";
  if (Number(counts.bracketRuntimes) || Number(counts.matches) || Number(counts.entries) || Number(counts.entryParticipants)) return "bracket_progress_exists";
  if (Number(counts.submissions)) return "submissions_exist";
  if (Number(counts.registrations)) return "registrations_exist";
  return null;
}

export function buildAnnouncementDeletionPreflight(eventFacts = []) {
  const facts = Array.isArray(eventFacts) ? eventFacts : [];
  const blocked = facts
    .map(fact => ({ ...fact, reason: announcementDeletionReason(fact) }))
    .filter(fact => fact.reason)
    .sort((left, right) => {
      const priority = REASON_PRIORITY.indexOf(left.reason) - REASON_PRIORITY.indexOf(right.reason);
      if (priority) return priority;
      // On an otherwise equal fact, the Final is the later Champions phase.
      return Number(right.phase === "final") - Number(left.phase === "final");
    });
  const chosen = blocked[0] || null;
  return {
    allowed: !chosen,
    reason: chosen?.reason || null,
    phase: chosen?.phase || null,
    counts: chosen?.counts || emptyAnnouncementDeletionCounts(),
    byPhase: Object.fromEntries(facts.map(fact => [fact.phase || "ordinary", fact.counts || emptyAnnouncementDeletionCounts()])),
  };
}

export function emptyAnnouncementDeletionCounts() {
  return {
    registrations: 0,
    submissions: 0,
    entries: 0,
    entryParticipants: 0,
    bracketRuntimes: 0,
    matches: 0,
    results: 0,
    rankingAwards: 0,
    hallOfFame: 0,
  };
}

export function announcementDeletionBlockedMessage(preflight) {
  const counts = preflight?.counts || emptyAnnouncementDeletionCounts();
  const champions = Boolean(preflight?.phase);
  const phase = preflight?.phase === "qualifier" ? "선발전" : preflight?.phase === "final" ? "본선" : "";
  const target = champions ? "이 Champions 공지를" : "공지를";
  const prefix = champions ? `${phase}에 ` : "";
  switch (preflight?.reason) {
    case "record_applied":
      return `${prefix}이미 기록이 반영된 대회라 ${target} 삭제할 수 없습니다. 먼저 기록 반영을 취소해 주세요.`;
    case "results_exist":
      return `${prefix}경기 결과 또는 기록이 저장되어 있어 ${target} 삭제할 수 없습니다. 먼저 기록 상태를 정리해 주세요.`;
    case "bracket_progress_exists":
      return `${prefix}이미 대진표가 생성되었거나 경기 진행 데이터가 있어 ${target} 삭제할 수 없습니다. 먼저 대진표 상태를 정리해 주세요.`;
    case "submissions_exist":
      return `${prefix}파티 제출 기록이 있어 ${target} 삭제할 수 없습니다. 현재 제출 ${Number(counts.submissions)}건, 신청 ${Number(counts.registrations)}건이 있습니다.`;
    case "registrations_exist":
      if (champions) return `${phase}에 참가 신청자 ${Number(counts.registrations)}명이 있어 ${target} 삭제할 수 없습니다.`;
      return `${prefix}참가 신청자가 있어 ${target} 삭제할 수 없습니다. 현재 신청자 ${Number(counts.registrations)}명이 등록되어 있습니다.`;
    default:
      return "공지 삭제 가능 여부를 확인하지 못했습니다.";
  }
}
