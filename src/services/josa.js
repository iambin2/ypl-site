/* 한국어 조사. 이름 뒤에 은(는), 을(를)처럼 둘을 함께 적지 않고 받침에 맞는 하나를 붙인다(DESIGN.md "Voice and tone").
   배틀 기록(battleLog.js)과 팀 검증 문구(teamBuilderCore.js)가 함께 쓴다. */
// 한국어 조사: 마지막 글자의 받침으로 고른다. 숫자는 읽는 소리로(3이, 2가), 영문은 받침 없는 쪽으로 둔다.
const PARTICLES = { topic: ["은", "는"], subject: ["이", "가"], object: ["을", "를"], conjunctive: ["과", "와"] };
const DIGIT_FINALS = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0]; // 영 일 이 삼 사 오 육 칠 팔 구
export function josa(word, kind) {
  const last = String(word).trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  const final = /\d/.test(last) ? DIGIT_FINALS[last] : code >= 0 && code <= 11171 ? code % 28 : 0;
  if (kind === "directional") return word + (final && final !== 8 ? "으로" : "로");
  const pair = PARTICLES[kind];
  return pair ? word + (final ? pair[0] : pair[1]) : word;
}
