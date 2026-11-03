const DAY_MS = 86400000;

/* 그 대회의 파티 제출 시각 가운데 아직 오지 않은 가장 가까운 것: 남은 날(달력의 날), 마지막 날이면 남은 시간(올림) */
export function submissionDue(draft, champions, now = new Date()) {
  const times = champions ? [draft.qualifierSubmissionTargetAt ?? draft.submissionTargetAt, draft.finalSubmissionTargetAt] : [draft.submissionTargetAt];
  const at = times.map(t => t ? new Date(t) : null).filter(d => d && !Number.isNaN(d.getTime()) && d > now).sort((p, q) => p - q)[0];
  if (!at) return null;
  const days = Math.round((new Date(at.getFullYear(), at.getMonth(), at.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS);
  return days > 0 ? { value: days, unit: "일" } : { value: Math.ceil((at - now) / 3600000), unit: "시간" };
}
