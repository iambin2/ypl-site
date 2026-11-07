/* 연승 도전의 규칙 (docs/BATTLE_STREAK.md 5장). 배틀 함수(서버의 컴퓨터)와 화면(다음 상대)이 함께 읽으므로 무거운 것을 들이지 않는다.
   달과 순위는 DB가 정한다(docs/db/streak_runs.sql). 여기에는 몇 번째 판에 어느 난이도가 서는지와 서버가 생각할 시간만 있다. */
import { LEVELS } from "./cpuLevels.js";

// 싱글 랜덤 배틀 하나(4장의 측정이 모두 싱글). 규정이 바뀌면 여기만 바꾼다
export const STREAK_REGULATION = "m-c";
export const STREAK_BATTLE_FORMAT = "singles";
// 일곱 판마다 한 단계 (본가와 같은 묶음). 마지막 단계는 끝까지 간다.
export const STREAK_STEP = 7;
export const STREAK_LEVELS = ["porygon", "porygon2", "porygonz"];
/* Edge Function에서 생각할 시간. 가장 느린 수가 예산의 약 2.2배라 400 ms면 1초 안이다(4장: 30판 324수에서 최대 815 ms).
   폴리곤2는 휴대폰의 500 ms를 쓰면 1.1초쯤이 되어 서버에서만 줄인다 */
export const STREAK_BUDGET_MS = { porygon: 300, porygon2: 400, porygonz: 400 };

// wins: 이 도전에서 이미 이긴 판 수. 다음 판의 난이도
export const streakLevel = wins => STREAK_LEVELS[Math.min(STREAK_LEVELS.length - 1, Math.floor(Math.max(0, wins) / STREAK_STEP))];
// 다음 판의 컴퓨터를 만드는 createCpu 옵션
export const streakCpuOptions = wins => {
  const id = streakLevel(wins);
  return { ...LEVELS[id].options, budgetMs: STREAK_BUDGET_MS[id] };
};
