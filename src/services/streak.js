/* 연승 도전의 규칙 (docs/BATTLE_STREAK.md 5장). 배틀 함수(서버의 컴퓨터)와 화면(다음 상대, 걸린 것)이 함께 읽으므로 무거운 것을 들이지 않는다.
   달과 순위는 DB가 정한다(docs/db/streak_runs.sql). 여기에는 층과 판, 어느 난이도가 서는지, 서버가 생각할 시간, 다음 승리가 무엇을
   바꾸는지만 있다. wins는 언제나 "이 판 전에 이긴 판 수"다. */
import { LEVELS } from "./cpuLevels.js";
import { tierOf } from "./partyBalance.js";

// 싱글 랜덤 배틀 하나(4장의 측정이 모두 싱글). 규정이 바뀌면 여기만 바꾼다
export const STREAK_REGULATION = "m-c";
export const STREAK_BATTLE_FORMAT = "singles";
// engine.mjs formatId(STREAK_REGULATION, STREAK_BATTLE_FORMAT), written out so the screen need not load the engine (tests/streak.test.mjs)
export const STREAK_FORMAT_ID = "gen9championsbssregmc";
/* 다섯 판이 한 층이고 다섯 번째 판은 층의 수문장이다. 2026-11-09 일곱에서 줄임(사용자: "주인이 등장하는 주기를 짧게", 주인은 그날 수문장이 되었다): 한 층은 높이가
   32, 44, 52, 64, 84로 오르는 다섯 계단이다(DESIGN.md의 높이 다섯, Streak.jsx FloorCells) */
export const STREAK_STEP = 5;
export const STREAK_LEVELS = ["porygon", "porygon2", "porygonz"];
/* Edge Function에서 생각할 시간. 가장 느린 수가 예산의 약 2.2배라 400 ms면 1초 안이다(4장: 30판 324수에서 최대 815 ms).
   폴리곤2는 휴대폰의 500 ms를 쓰면 1.1초쯤이 되어 서버에서만 줄인다 */
export const STREAK_BUDGET_MS = { porygon: 300, porygon2: 400, porygonz: 400 };

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

/* 층마다 정해진 수문장 (2026-11-09 사용자: "층마다 강력한 포켓몬을 설정하는 거야. 해당 층에 도달하면 고정으로 나오는 포켓몬. 메가진화로
   설정하면 아마 좋겠지. 층을 올라갈 때마다 강력해지고. 특정 층 이상으로 가면 그냥 랜덤으로"). 수문장의 파티는 이 메가진화 포켓몬과,
   층의 수문장 계획(MASTER_PLAN)에서 맨 위 급 하나를 뺀 다섯이다. 순서는 잰 몫(species-power.json, 2026-11-09 7922판: 루카리오 0.0, 한카리아스 0.19, 팬텀 0.25, 가디안 0.26, 마기라스 0.30, 망나뇽 0.55,
   보만다 0.57, 리자몽 0.62)이 오르는 차례이고, 여덟 층 위로는
   맨 위 급의 메가진화 하나를 판마다 뽑는다. 화면은 지금 층의 수문장을 실루엣으로, 위층은 ?로, 지나온 층은 그대로 보인다.
   form: 메가진화한 모습(그림), stone: 그 메가스톤 */
export const GATEKEEPERS = [
  { species: "Lucario", stone: "Lucarionite", form: "Lucario-Mega" },
  { species: "Garchomp", stone: "Garchompite Z", form: "Garchomp-Mega-Z" },
  { species: "Gengar", stone: "Gengarite", form: "Gengar-Mega" },
  { species: "Gardevoir", stone: "Gardevoirite", form: "Gardevoir-Mega" },
  { species: "Tyranitar", stone: "Tyranitarite", form: "Tyranitar-Mega" },
  { species: "Dragonite", stone: "Dragoninite", form: "Dragonite-Mega" },
  { species: "Salamence", stone: "Salamencite", form: "Salamence-Mega" },
  { species: "Charizard", stone: "Charizardite X", form: "Charizard-Mega-X" },
];
// 그 층의 수문장, 정해진 층 위로는 null(판마다 뽑는다)
export const gatekeeperOf = floor => GATEKEEPERS[floor - 1] || null;

/* 이 판의 난이도: 한 층이 난이도 하나다(1층 폴리곤, 2층 폴리곤2, 3층부터 폴리곤Z). 층의 수문장도 그 층의 난이도이고 파티로 더 세다
   (streakFoeDraw). 2026-11-09 사용자가 층의 마지막 판을 폴리곤, 폴리곤2, 폴리곤Z로 맞추며 고른 규칙(BATTLE_STREAK.md 5장) */
export const streakLevel = wins => STREAK_LEVELS[Math.min(STREAK_LEVELS.length - 1, streakFloor(wins) - 1)];
// 이 판의 컴퓨터를 만드는 createCpu 옵션
export const streakCpuOptions = wins => {
  const id = streakLevel(wins);
  return { ...LEVELS[id].options, budgetMs: STREAK_BUDGET_MS[id] };
};
/* 이 판의 컴퓨터 파티를 뽑는 randomTeam 옵션: 언제나 균형 잡힌 파티(partyBalance.js)이고, 층의 수문장은 한 급 위로 당긴 계획에 그
   층의 메가진화 포켓몬을 세운다(정해진 층 위로는 맨 위 급의 메가진화 하나를 뽑는다: ace true) */
export const streakFoeDraw = wins => {
  if (!streakMaster(wins)) return { meta: true };
  const keeper = gatekeeperOf(streakFloor(wins));
  return { meta: true, master: true, ace: keeper ? { species: keeper.species, stone: keeper.stone } : true };
};

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
export const swapTier = species => tierOf(STREAK_FORMAT_ID, species);
const MEGA_STONE = /^(?!Eviolite$).+ite( [XYZ])?$/;
export function swapParty(party, foes, give, take) {
  const out = party.findIndex(m => named(m.species, give));
  const coming = foes.find(m => named(m.species, take));
  if (out < 0 || !coming) return "missing";
  if (swapTier(party[out].species) !== swapTier(coming.species)) return "tier";
  const rest = party.filter((_, i) => i !== out);
  if (rest.some(m => id(base(m.species)) === id(base(coming.species)))) return "clash";
  /* an item already in our party: the one coming takes the item of the one it replaces, which the party never holds twice (the
     screen cannot see the beaten party's items, so it could not keep a pair it offers from being refused, 2026-11-09). A Mega
     Stone is not handed on: it belongs to its species */
  let item = coming.item;
  if (rest.some(m => m.item && m.item === item)) {
    item = party[out].item;
    if (!item || MEGA_STONE.test(item)) return "clash";
  }
  const next = [...party];
  next[out] = { ...coming, item, name: "" };
  return next;
}
