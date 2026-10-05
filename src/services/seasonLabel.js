/* 영문 시즌 라벨(CLASSIC SEASON 1, YPL SEASON 2)을 한국어 표기로 바꾼다. */
export function displaySeasonLabel(label) {
  return String(label || "").trim().replace(/\bCLASSIC\b/gi, "클래식").replace(/\bSEASON\b/gi, "시즌");
}
