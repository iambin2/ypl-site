/* 연승 도전의 규칙 (docs/BATTLE_STREAK.md 5장). 배틀 함수(서버의 컴퓨터)와 화면(다음 상대, 걸린 것)이 함께 읽으므로 무거운 것을 들이지 않는다.
   달과 순위는 DB가 정한다(docs/db/streak_runs.sql). 여기에는 층과 판, 어느 난이도가 서는지, 서버가 생각할 시간, 다음 승리가 무엇을
   바꾸는지만 있다. wins는 언제나 "이 판 전에 이긴 판 수"다. */
import { LEVELS } from "./cpuLevels.js";

// 싱글 랜덤 배틀 하나(4장의 측정이 모두 싱글). 규정이 바뀌면 여기만 바꾼다
export const STREAK_REGULATION = "m-c";
export const STREAK_BATTLE_FORMAT = "singles";
// 일곱 판이 한 층(본가와 같은 묶음). 일곱 번째 판은 층의 주인이다
export const STREAK_STEP = 7;
export const STREAK_LEVELS = ["porygon", "porygon2", "porygonz"];
// 층의 앞 세 판은 그 층의 난이도, 뒤 세 판과 층의 주인은 한 단계 위(마지막 단계는 그대로). 판마다 조금씩 올리는 것은 재 보니
// 300판에서 차이가 보이지 않아 버렸다(BATTLE_COMPUTER.md 5장, 2026-11-08): 잰 단계만 쓴다
export const STREAK_HALF = 3;
// 층의 주인의 파티: 래더에서 가장 많이 쓰는 이만큼의 포켓몬에서만 뽑는다(randomTeam top)
export const MASTER_TOP = 24;
/* Edge Function에서 생각할 시간. 가장 느린 수가 예산의 약 2.2배라 400 ms면 1초 안이다(4장: 30판 324수에서 최대 815 ms).
   폴리곤2는 휴대폰의 500 ms를 쓰면 1.1초쯤이 되어 서버에서만 줄인다 */
export const STREAK_BUDGET_MS = { porygon: 300, porygon2: 400, porygonz: 400 };

// 몇 번째 층(1부터)과 그 층의 몇 번째 판(1부터 7)
export const streakFloor = wins => Math.floor(Math.max(0, wins) / STREAK_STEP) + 1;
export const floorGame = wins => (Math.max(0, wins) % STREAK_STEP) + 1;
// 한 판을 말로: 2층 4번째 판, 일곱 번째는 2층 주인 (판 중의 머리, 중계, 도전 탭)
export const gameWords = wins => (floorGame(wins) === STREAK_STEP ? `${streakFloor(wins)}층 주인` : `${streakFloor(wins)}층 ${floorGame(wins)}번째 판`);
// 이 판이 층의 주인인가
export const streakMaster = wins => floorGame(wins) === STREAK_STEP;
// 이 판이 층의 첫 판인가: 층마다 파티를 새로 받는다(그 안에서는 이어 가고, 이길 때마다 상대 하나와 바꿀 수 있다)
export const streakFresh = wins => floorGame(wins) === 1;

// 이 판의 난이도
export const streakLevel = wins => {
  const base = Math.min(STREAK_LEVELS.length - 1, streakFloor(wins) - 1);
  const up = floorGame(wins) > STREAK_HALF ? 1 : 0;
  return STREAK_LEVELS[Math.min(STREAK_LEVELS.length - 1, base + up)];
};
// 이 판의 컴퓨터를 만드는 createCpu 옵션
export const streakCpuOptions = wins => {
  const id = streakLevel(wins);
  return { ...LEVELS[id].options, budgetMs: STREAK_BUDGET_MS[id] };
};
// 이 판의 컴퓨터 파티를 뽑는 randomTeam 옵션
export const streakFoeDraw = wins => ({ meta: true, ...(streakMaster(wins) ? { top: MASTER_TOP } : {}) });

/* 이 판에 걸린 것: 다음 승리가 무엇을 바꾸는지 한 줄로. board: 이번 달 순위(streak_board의 줄들), 없으면 순위는 말하지 않는다.
   내 줄이 진행 중이면 이 도전이 이미 내 최고 기록이라 이기면 늘 경신이다. 같은 연승이면 먼저 닿은 사람이 위다. */
export function streakStake(wins, board = null) {
  const next = wins + 1;
  if (streakMaster(wins)) return `층의 주인과의 판입니다. 이기면 ${streakFloor(wins) + 1}층에 오릅니다.`;
  const rows = Array.isArray(board) ? board : null;
  const mine = rows?.find(r => r.mine);
  const best = rows && (!mine || mine.live || next > mine.wins);
  const others = (rows || []).filter(r => !r.mine);
  const placeNow = 1 + others.filter(r => r.wins >= Math.max(1, wins)).length;
  const placeNext = 1 + others.filter(r => r.wins >= next).length;
  const up = rows && placeNext < placeNow ? placeNext : null;
  if (up && best) return `이기면 ${up}위에 오르고 이번 달 내 최고 기록이 됩니다.`;
  if (up) return `이기면 ${up}위에 오릅니다.`;
  if (best && wins > 0) return "이기면 이번 달 내 최고 기록이 됩니다.";
  return wins > 0 ? `지면 ${wins}연승에서 도전이 끝납니다.` : "지면 도전이 끝납니다.";
}

/* 화면이 아는 이름이 이 포켓몬인가. 선출 화면은 몇몇 폼을 숨겨 Gourgeist-*, Greninja-* 처럼 보이고(쇼다운 규칙), 화면은 그 이름으로
   고른다. 한 파티에 같은 종은 하나뿐이라 종으로 맞춰도 하나다 */
const base = s => String(s).split("-")[0];
const named = (species, shown) => species === shown || (String(shown).endsWith("-*") && base(species) === String(shown).slice(0, -2));

/* 이긴 뒤 내 파티의 하나와 이긴 상대의 하나를 바꾼다(층 안에서만). give, take: 화면이 보인 종 이름으로 고른다. 엔진의 요청은 선출한
   순서로 파티를 다시 늘어놓으므로 자리로는 고를 수 없다. 답은 새 파티, 아니면 왜 못 바꾸는지: "missing"(그 이름의 포켓몬이 없음),
   "clash"(같은 종이나 같은 도구가 둘이 됨). 서버는 그 뒤 검증기로 한 번 더 본다 */
export function swapParty(party, foes, give, take) {
  const out = party.findIndex(m => named(m.species, give));
  const coming = foes.find(m => named(m.species, take));
  if (out < 0 || !coming) return "missing";
  const rest = party.filter((_, i) => i !== out);
  if (rest.some(m => base(m.species) === base(coming.species) || (m.item && m.item === coming.item))) return "clash";
  const next = [...party];
  next[out] = { ...coming, name: "" };
  return next;
}
