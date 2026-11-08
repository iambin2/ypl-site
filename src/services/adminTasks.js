/* 운영 (DESIGN.md "Admin"): the step an event stands at and the operators' list, from the overview alone (adminOverview.js reads it). */
export const ADMIN_STEPS = ["접수", "대진", "경기", "기록"];

export function eventStep({ open, bracket, left, awaiting = false }) {
  // a day already past with no bracket for it has only its record left to settle (or to cancel)
  if (!bracket) return awaiting ? 4 : open ? 1 : 2;
  return left > 0 ? 3 : 4;
}

/* the operators' list, in the order things happen now: matches to enter, a bracket to make, a record to apply. An open application is
   not a task (it runs by itself until its closing time); it stands in the event's own panel. Link requests are not rows either: they
   are decided in their own block at the top of the page (2026-11-08, the user: the operators' most frequent decision). */
export function adminTasks(overview) {
  if (!overview) return [];
  const tasks = [];
  for (const e of overview.events) {
    if (e.step === 3) tasks.push({ key: `${e.id}:play`, kind: "play", event: e, title: `${e.name} 결과 입력`, line: [`${e.stage} ${e.done}/${e.total} 종료`, `${e.left}경기 남음`, e.battles ? `배틀 ${e.battles}개 진행 중` : ""].filter(Boolean).join(", ") });
    if (e.step === 2) tasks.push({ key: `${e.id}:draw`, kind: "draw", event: e, title: `${e.name} 대진표 만들기`, line: [e.applicants != null && `신청 ${e.applicants}명`, e.entrants ? `파티 제출 ${e.submitted}/${e.entrants}` : ""].filter(Boolean).join(", ") });
    if (e.step === 4) tasks.push({ key: `${e.id}:record`, kind: "record", event: e, title: `${e.name} 기록 반영`, line: e.awaiting ? "대회일이 지났습니다. 기록에 반영해야 랭킹과 기록에 남습니다." : "모든 경기가 끝났습니다." });
  }
  return tasks;
}
