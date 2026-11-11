/* 연승 도전의 규칙 (docs/BATTLE_STREAK.md 5장). 배틀 함수(서버의 컴퓨터)와 화면(다음 상대, 걸린 것)이 함께 읽으므로 무거운 것을 들이지 않는다.
   달과 순위는 DB가 정한다(docs/db/streak_runs.sql). 여기에는 층과 판, 어느 난이도가 서는지, 서버가 생각할 시간, 다음 승리가 무엇을
   바꾸는지만 있다. wins는 언제나 "이 판 전에 이긴 판 수"다. */
import { LEVELS } from "./cpuLevels.js";
import TOWER_TIERS from "../data/tower-tiers.json" with { type: "json" };

// 싱글 랜덤 배틀 하나(4장의 측정이 모두 싱글). 규정이 바뀌면 여기만 바꾼다
export const STREAK_REGULATION = "m-c";
export const STREAK_BATTLE_FORMAT = "singles";
// engine.mjs formatId(STREAK_REGULATION, STREAK_BATTLE_FORMAT), written out so the screen need not load the engine (tests/streak.test.mjs)
export const STREAK_FORMAT_ID = "gen9championsbssregmc";
/* 다섯 판이 한 층이고 다섯 번째 판은 층의 수문장이다. 2026-11-09 일곱에서 줄임(사용자: "주인이 등장하는 주기를 짧게", 주인은 그날 수문장이 되었다): 한 층은 높이가
   32, 44, 52, 64, 84로 오르는 다섯 계단이다(DESIGN.md의 높이 다섯, Streak.jsx FloorCells) */
export const STREAK_STEP = 5;
/* 탑의 컴퓨터 계단 (2026-11-11, BATTLE_STREAK.md 14.6). 상대가 랭커 구축이 되자 같은 세기의 컴퓨터끼리 드래프트 파티가 37%만 이겨, 층의
   세기는 순위대가 아니라(순위대끼리는 잡음 안이었다) 컴퓨터가 맡는다. 아래 둘은 탑에만 있는 단계로 폴리곤보다 더 실수한다. 잰 값(드래프트
   파티를 둔 온전한 컴퓨터가 랭커 구축을 둔 그 단계를 이긴 몫, 각 500판): tower0 73%, tower1 67%, 폴리곤 60%, 폴리곤2 49%, 폴리곤Z 37%.
   budgetMs: Edge Function에서 생각할 시간. 가장 느린 수가 예산의 약 2.2배라 400 ms면 1초 안이다(4장: 30판 324수에서 최대 815 ms).
   폴리곤2는 휴대폰의 500 ms를 쓰면 1.1초쯤이 되어 서버에서만 줄인다 */
export const STREAK_STEPS = [
  { id: "tower0", options: { reads: false, rollout: false, slack: 0.9, mistake: 0.6 }, budgetMs: 300 },
  { id: "tower1", options: { reads: false, rollout: false, slack: 0.75, mistake: 0.45 }, budgetMs: 300 },
  { id: "porygon", options: LEVELS.porygon.options, budgetMs: 300 },
  { id: "porygon2", options: LEVELS.porygon2.options, budgetMs: 400 },
  { id: "porygonz", options: LEVELS.porygonz.options, budgetMs: 400 },
];

/* 램프 (2026-11-11, BATTLE_STREAK.md 14장, 사용자: "목숨이 3개로 바뀌면서 긴장감이 없어지고 게임이 늘어지는"): 도전은 램프 둘로
   시작하고 둘까지만 켜진다. 진 판(패배, 기권, 시간 초과, 무승부)마다 하나가 꺼지고, 남으면 같은 판을 새 상대와 다시 한다. 다 꺼지면
   도전이 끝난다. 수문장을 깨면 하나가 다시 켜진다: 한 층에 실수 한 번까지다. 처음에는 하나로 시작해 수문장이 예비를 켜게 했으나, 잰
   세기로는 1층 돌파가 약 19%라 사용자가 둘로 시작을 골랐다(같은 날, 14.6). 예전(12장): 램프 셋, 수문장과 강한 문이 다시 켰다 */
export const STREAK_LIVES = 2;
export const STREAK_START_LIVES = 2;
/* 탑의 세트에서 빼는 것, 양쪽 모두(같은 장): 한 번의 주사위가 판을 가르는 도구와 기술. 세트의 첫 도구가 빠지면 그 세트의 다음 도구가
   서고(engine.mjs randomTeam ban), 빠지는 기술을 가진 세트는 뽑히지 않는다. 2026-11-10 m-c 싱글 1329세트 가운데 기술 11, 도구 155
   세트가 닿고, 도구가 없어지는 세트와 사라지는 종은 없다 */
export const STREAK_BAN = {
  items: ["Bright Powder", "Quick Claw", "King's Rock", "Focus Band"],
  moves: ["Sheer Cold", "Fissure", "Horn Drill", "Guillotine", "Double Team", "Minimize"],
};

/* 시작 드래프트 (2026-11-11, BATTLE_STREAK.md 13장): 도전을 시작하면 힘의 급마다 이만큼의 후보가 서고, 급마다 하나씩 골라 여섯을 만든다
   (engine.mjs draftOffer, draftParty). 후보는 세트 그대로라 무엇을 데려가는지 알고 고른다 */
export const STREAK_DRAFT = 3;

/* 상대는 실제 랭커의 구축이다 (14장, src/data/ranker-teams.json, scripts/build-ranker-teams.mjs). 층이 오를수록 높은 순위대에서
   하나를 뽑는다: 보통 문은 그 층의 순위대(4층부터 31-100위), 강한 문은 한 단계 위, 수문장은 두 단계 위(1-30위에서 멈춤). 예전(13장)의
   층의 타입, 층마다 정해진 메가 수문장, 상대 계획의 계단은 없앴다(사용자: "한 층에서 한 타입만 계속 나오니까 실전을 연습할 수 없어졌어").
   순위대는 [가장 높은 순위, 가장 낮은 순위], 쉬운 것부터 */
export const RANK_BANDS = [[601, 1000], [301, 600], [101, 300], [31, 100], [1, 30]];
// kind: "even", "hard" or "gate" (doorsOf); a gatekeeper's game is always its own band, whatever door led to it
export const bandOf = (wins, kind = "even") => Math.min(RANK_BANDS.length - 1, Math.min(streakFloor(wins) - 1, 3) + (streakMaster(wins) ? 2 : kind === "hard" ? 1 : 0));

/* 다음 판의 문 (13장): 끝난 판 뒤에 도전이 쉬면, 다음 판은 문으로 고른다. 보통은 두 문, 상대의 여섯이 보이는 보통 상대와 한 순위대 위의
   강한 상대다. 강한 상대를 이기면 그 판의 교환이 한 급 위까지 닿는다(14장부터 램프는 켜지지 않는다). 다음
   판이 수문장이면 문은 하나, 닫힌 문이다(수문장은 판에 들어가서야 본다, 2026-11-09). wins: 다음 판 전에 이긴 판 수 */
export const doorsOf = wins => (streakMaster(wins) ? ["gate"] : ["even", "hard"]);
// 이긴 판이 예비 램프를 켜는가: 수문장뿐이다(14장, 강한 문은 교환 승급만 준다). wins: 그 판 전에 이긴 판 수
export const streakRelights = wins => streakMaster(wins);
// 이긴 판의 교환이 한 급 위까지 닿는가: 수문장이거나 강한 문(13장 승급)
export const streakReach = (wins, hard = false) => hard || streakMaster(wins);

// 몇 번째 층(1부터)과 그 층의 몇 번째 판(1부터 다섯)
export const streakFloor = wins => Math.floor(Math.max(0, wins) / STREAK_STEP) + 1;
export const floorGame = wins => (Math.max(0, wins) % STREAK_STEP) + 1;
/* 한 판을 말로: 2층 첫 번째 판, 다섯 번째는 2층 수문장 (판 중의 머리, 중계, 다음 판). 2026-11-09 사용자: "1번째 라는 표현은 엄밀히
   말하면 적절한 표현은 아닌 걸로 알아", "주인이라는 표현 대신 쓸 말이 있을까": 서수는 고유어로, 층의 마지막 판은 층의 문을 지키는
   수문장이다 */
const ORDINAL = ["첫 번째", "두 번째", "세 번째", "네 번째"];
export const gameWords = wins => (streakMaster(wins) ? `${streakFloor(wins)}층 수문장` : `${streakFloor(wins)}층 ${ORDINAL[floorGame(wins) - 1]} 판`);
// 이 판이 층의 수문장인가
export const streakMaster = wins => floorGame(wins) === STREAK_STEP;
// 이 판이 층의 첫 판인가: 층마다 파티를 새로 받는다(그 안에서는 이어 가고, 이길 때마다 상대와 같은 급끼리 바꿀 수 있다)
export const streakFresh = wins => floorGame(wins) === 1;

/* 도전의 판들을 차례로 읽는다(중계, battleService.js runGames): 판마다 그 판 전에 이긴 판 수(at)와 그 판에 들어갈 때 켜져 있던
   램프(lives). 진 판 뒤에도 도전이 이어지므로 판의 자리가 곧 연승이 아니다. games: [{ id, status, winner }], 열린 순서.
   over: 마지막 판이 끝났고 램프가 남지 않았다. 관전 화면은 도전의 상태를 따로 읽고(battleService.js readRunState), 그것을 읽지 못할
   때만 이 over를 쓴다(14장 전의 도전은 램프 셋으로 시작했으므로 여기서 세면 틀린다) */
export function runTrack(games) {
  let at = 0, lives = STREAK_START_LIVES;
  const out = games.map(g => {
    const row = { id: g.id, at, lives };
    if (g.status !== "ended") return row;
    if (g.winner === "p1") { if (streakMaster(at)) lives = Math.min(STREAK_LIVES, lives + 1); at += 1; } else lives -= 1;
    return row;
  });
  return Object.assign(out, { over: lives <= 0 });
}

/* 이 판의 컴퓨터 (14.6): n층의 보통 판은 계단의 n번째, 수문장과 강한 문은 한 칸 위, 다섯 층부터는 맨 위(폴리곤Z). 예전(5장): 한 층이 폴리곤,
   폴리곤2, 폴리곤Z 가운데 하나였다. 사람의 승률은 운영 한 주 뒤 실제 1층 돌파율로 다시 맞춘다 */
export const streakStep = (wins, hard = false) => Math.min(STREAK_STEPS.length - 1, Math.min(streakFloor(wins) - 1, STREAK_STEPS.length - 1) + (hard || streakMaster(wins) ? 1 : 0));
// 이 판의 컴퓨터를 만드는 createCpu 옵션. hard: 강한 문으로 들어간 판
export const streakCpuOptions = (wins, hard = false) => {
  const step = STREAK_STEPS[streakStep(wins, hard)];
  return { ...step.options, budgetMs: step.budgetMs };
};
/* 오늘의 탑 (13장): 그날의 모든 도전이 같은 자리에서 같은 후보, 같은 문, 같은 시드를 받는다. key: 무엇을 뽑는지와 그 자리(이긴 판 수와
   지금까지 둔 판 수). 같은 열쇠는 같은 수열이다(mulberry32, 열쇠의 FNV-1a 해시가 씨앗) */
export function seeded(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  let a = h || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/* 화면이 아는 이름이 이 포켓몬인가. 선출 화면은 몇몇 폼을 숨겨 Gourgeist-*, Greninja-* 처럼 보이고(쇼다운 규칙), 화면은 그 이름으로
   고른다. 한 파티에 같은 종은 하나뿐이라 종으로 맞춰도 하나다 */
/* names compared as Showdown ids: the beaten party read back from the input log spells a form "Squawkabilly Blue" where the team
   preview and the sample sets say "Squawkabilly-Blue" (2026-11-09: a swap the screen offered was refused as missing) */
const id = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const base = s => String(s).split("-")[0];
const named = (species, shown) => id(species) === id(shown) || (String(shown).endsWith("-*") && id(base(species)) === id(String(shown).slice(0, -2)));

/* 이긴 뒤 내 파티의 하나와 이긴 상대의 하나를 바꾼다(층 안에서만). give, take: 화면이 보인 종 이름으로 고른다. 엔진의 요청은 선출한
   순서로 파티를 다시 늘어놓으므로 자리로는 고를 수 없다. 같은 급끼리만 바꾼다(2026-11-09): 파티의 힘이 이겨도 오르지 않아, 층의
   수문장과의 차이가 판마다 같다. 답은 새 파티, 아니면 왜 못 바꾸는지: "missing"(그 이름의 포켓몬이 없음), "tier"(급이 다름),
   "clash"(같은 종이 둘이 됨. 같은 도구는 바뀌는 포켓몬의 도구를 받아 피한다). 서버는 그 뒤 검증기로 한 번 더 본다 */
/* 2026-11-11 (14장): 급은 탑의 풀(랭커 구축에 나온 종) 안에서 나눈 것이다(src/data/tower-tiers.json). 풀 밖의 종(예전 도전의 파티)은
   가운데 급으로 읽는다 */
const TOWER_BY_ID = new Map(Object.entries(TOWER_TIERS).map(([k, v]) => [id(k), v]));
export const swapTier = species => TOWER_BY_ID.get(id(species)) ?? [...TOWER_BY_ID].find(([k]) => String(species).endsWith("-*") && k.startsWith(id(String(species).slice(0, -2))))?.[1] ?? 2;
export const MEGA_STONE = /^(?!Eviolite$).+ite( [XYZ])?$/;
/* reach (2026-11-11, 13장 승급): 수문장이나 강한 상대를 이긴 판의 교환은 한 급 위까지 닿는다(1). 그 밖에는 같은 급끼리(0). 아래로
   내려가는 교환은 받지 않는다 */
export function swapParty(party, foes, give, take, reach = 0) {
  const out = party.findIndex(m => named(m.species, give));
  const coming = foes.find(m => named(m.species, take));
  if (out < 0 || !coming) return "missing";
  const up = swapTier(party[out].species) - swapTier(coming.species);
  if (!(up >= 0 && up <= reach)) return "tier";
  const rest = party.filter((_, i) => i !== out);
  if (rest.some(m => id(base(m.species)) === id(base(coming.species)))) return "clash";
  /* an item already in our party: the one coming takes the item of the one it replaces, which the party never holds twice (the
     screen cannot see the beaten party's items, so it could not keep a pair it offers from being refused, 2026-11-09). A Mega
     Stone is not handed on: it belongs to its species */
  let item = coming.item;
  if (rest.some(m => m.item && m.item === item)) {
    item = party[out].item;
    // "item": the one coming would hold an item the party already holds, and the one it replaces has none to hand on (2026-11-09:
    // it was told as a second species, so the screen named the wrong reason)
    if (!item || MEGA_STONE.test(item)) return "item";
  }
  const next = [...party];
  next[out] = { ...coming, item, name: "" };
  return next;
}
