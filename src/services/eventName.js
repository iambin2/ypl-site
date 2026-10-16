/* 대회 이름은 입력받지 않고 회차, 종류, 리그, 팀전 여부와 부제로 조립한다.
   모든 대회 이름이 같은 문법("37회 파이컵 팀전 리전 워즈")을 따르게 하는 유일한 곳이다.
   DB의 events_name_clean 제약(docs/db/event_name_constraint.sql)이 같은 규칙의 마지막 방어선이다. */

/* 구분자(| · •)를 공백으로, 붙여 쓴 리그명을 띄우고, 공백을 하나로 접는다. */
export function cleanEventNamePart(value) {
  return String(value ?? "")
    .replace(/\s*[|·•]\s*/g, " ")
    .replace(/(마스터|루키)리그/g, "$1 리그")
    .replace(/\s+/g, " ")
    .trim();
}

/* 정규 체계의 이름 앞부분. 체계 밖의 대회(정모 이벤트 같은 기타 구분)는 null이고, 부제가 곧 이름이다. */
export function eventNameBase({ round, eventType, division, isTeamEvent } = {}) {
  const n = Number(round);
  const prefix = Number.isInteger(n) && n > 0 ? `${n}회 ` : "";
  if (eventType === "champions") return `${prefix}챔피언스 시리즈`;
  const light = eventType === "light" || division === "light";
  if (isTeamEvent && (light || division === "master")) return `${prefix}파이컵${light ? " 라이트" : ""} 팀전`;
  if (light) return `${prefix}파이컵 라이트`;
  if (division === "master") return `${prefix}파이컵 마스터 리그`;
  if (division === "rookie") return `${prefix}파이컵 루키 리그`;
  if (eventType === "pokecup" && !division) return `${prefix}파이컵`;
  return null;
}

export function formatEventName({ subtitle = "", ...fields } = {}) {
  const base = eventNameBase(fields);
  const sub = cleanEventNamePart(subtitle);
  if (!base) return sub;
  return sub ? `${base} ${sub}` : base;
}

/* 기록 집계에는 리그 이름("마스터 리그")만 남은 회차가 있다. 화면에서는 대회 이름과 같은 어순과 이름으로 쓴다:
   leagueTitle("마스터 리그") → "파이컵 마스터 리그", recordRoundTitle("마스터 리그", 36) → "36회 파이컵 마스터 리그". */
export function leagueTitle(name) {
  const clean = cleanEventNamePart(name);
  return /^(마스터|루키) 리그/.test(clean) ? `파이컵 ${clean}` : clean;
}
export function recordRoundTitle(name, round) {
  const n = /^\d+$/.test(String(round ?? "")) ? `${round}회 ` : "";
  return `${n}${leagueTitle(name)}`.trim();
}

/* 부제가 따로 저장되지 않은 예전 이름에서 부제를 되찾는다. 회차 표기는 무시하고 앞부분이 맞을 때만 떼어 낸다. */
export function eventSubtitleOf(name, fields = {}) {
  const clean = cleanEventNamePart(name);
  const base = eventNameBase({ ...fields, round: null });
  if (!base) return clean;
  const rest = clean.replace(/^\d+회\s*/, "");
  if (rest === base) return "";
  return rest.startsWith(`${base} `) ? rest.slice(base.length + 1) : clean;
}

/* 저장 전에 쓰는 부제: 새 초안은 subtitle을, 예전 초안은 이름에서 되찾은 부제를 쓴다. */
export function draftSubtitle(eventDraft = {}, fields = {}) {
  return eventDraft.subtitle !== undefined && eventDraft.subtitle !== null
    ? cleanEventNamePart(eventDraft.subtitle)
    : eventSubtitleOf(eventDraft.name, fields);
}

/* DB 제약과 같은 규칙. 화면 쪽 검사는 안내용이고 최종 판단은 DB가 한다. */
export function isCleanEventName(name) {
  const value = String(name ?? "");
  return value !== "" && value === cleanEventNamePart(value);
}

/* 신청서가 대회와 연결되는가. 이미 연결된 공지, 연결을 고른 초안, 그리고 이름을 적어 두던 예전 초안이 해당한다. */
export function isEventLinked(form) {
  const draft = form?.eventDraft || {};
  if (form?.eventId) return true;
  if (draft.linked !== undefined) return Boolean(draft.linked);
  return Boolean(String(draft.name || "").trim());
}
