/* 영문 시즌 라벨(CLASSIC SEASON 1, YPL SEASON 2)을 한국어 표기로 바꾼다. */
export function displaySeasonLabel(label) {
  return String(label || "").trim().replace(/\bCLASSIC\b/gi, "클래식").replace(/\bSEASON\b/gi, "시즌");
}

/* "초대", "6대", "6대 챔피언" → 세대 번호. 못 읽으면 0. 홈이 이것만 쓰려고 명예의 전당 모듈(팀 빌더 데이터까지)을 끌고 오지 않게 여기 둔다. */
export function generationNumberFromLegacyLabel(label) {
  const stored = String(label || "").trim();
  if (stored === "초대") return 1;
  const number = Number(stored.match(/\d+/)?.[0]);
  return Number.isInteger(number) && number > 0 ? number : 0;
}
