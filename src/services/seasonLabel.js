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

/* 화면의 세대 표기는 숫자 하나로: "초대", "6대", "6대 챔피언" → "1대", "6대". 못 읽으면 받은 말에서 "챔피언"만 뗀다.
   저장된 값은 그대로 두고 보여 줄 때만 바꾼다. */
export function generationText(label) {
  const bare = String(label || "").replace(/\s*챔피언\s*$/, "").trim();
  const number = generationNumberFromLegacyLabel(bare);
  return number ? `${number}대` : bare;
}
