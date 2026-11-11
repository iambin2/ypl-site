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

/* 램프 셋 (2026-11-10, BATTLE_STREAK.md 12장): 도전은 램프 셋으로 시작한다. 진 판(패배, 기권, 시간 초과, 무승부)마다 하나가 꺼지고
   같은 판을 새 상대와 다시 한다. 셋이 다 꺼지면 도전이 끝난다. 수문장을 깨면 하나가 다시 켜진다(셋까지). 기록은 그대로 이긴 판 수다 */
export const STREAK_LIVES = 3;
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

/* 층의 타입 (13장): 층마다 상대 파티가 한 타입으로 모인다. 급마다 그 타입의 종이 있으면 그 종이 먼저 서므로(randomTeam prefer), 거의
   모든 층에서 여섯 가운데 대부분이 그 타입이다. 여덟 층은 그 층의 수문장을 따른다(루카리오 격투, 한카리아스 땅, 팬텀 고스트, 가디안
   페어리, 마기라스 바위, 망나뇽 비행, 보만다 드래곤, 리자몽 불꽃). 그 위로는 남은 타입을 차례로 돈다: 같은 층은 누구에게나 같은
   타입이라, 탑을 아는 것이 실력이다. 2026-11-11 m-c 싱글 표본에서 모든 타입이 여섯 급 가운데 다섯 급 이상에 종이 있다 */
export const FLOOR_TYPES = ["Fighting", "Ground", "Ghost", "Fairy", "Rock", "Flying", "Dragon", "Fire"];
const LATER_TYPES = ["Water", "Steel", "Psychic", "Dark", "Electric", "Grass", "Poison", "Ice", "Normal", "Bug"];
export const floorType = floor => FLOOR_TYPES[floor - 1] || LATER_TYPES[(floor - FLOOR_TYPES.length - 1) % LATER_TYPES.length];

/* 상대 파티의 힘 (13장): 층마다 한 계단씩 오르고, 수문장과 강한 상대의 문은 그 층보다 두 계단 위다. 한 계단은 가장 약한 자리 하나를
   한 급 올린 것이다. 1층 수문장(두 계단)이 예전의 MASTER_PLAN 그대로라, 잰 값(11장: 같은 실력이면 수문장이 약 55%)에서 이어진다.
   계단 하나는 그 절반, 몫으로 약 0.15다. 다섯 층부터는 더 오르지 않는다(컴퓨터의 난이도와 함께 한 달 뒤 다시 정한다) */
const PLANS = [
  [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 4], [0, 1, 2, 3, 3, 4], [0, 1, 2, 3, 3, 3],
  [0, 1, 2, 2, 3, 3], [0, 1, 2, 2, 2, 3], [0, 1, 1, 2, 2, 3],
];
export const foeSteps = (wins, hard = false) => Math.min(PLANS.length - 1, Math.min(streakFloor(wins) - 1, 4) + (hard || streakMaster(wins) ? 2 : 0));
export const foePlan = (wins, hard = false) => PLANS[foeSteps(wins, hard)];

/* 다음 판의 문 (13장): 끝난 판 뒤에 도전이 쉬면, 다음 판은 문으로 고른다. 보통은 두 문, 상대의 여섯이 보이는 보통 상대와 두 계단 센
   강한 상대다. 강한 상대를 이기면 수문장을 이긴 것처럼 램프 하나가 다시 켜지고(셋까지), 그 판의 교환은 한 급 위까지 닿는다. 다음
   판이 수문장이면 문은 하나, 닫힌 문이다(수문장은 판에 들어가서야 본다, 2026-11-09). wins: 다음 판 전에 이긴 판 수 */
export const doorsOf = wins => (streakMaster(wins) ? ["gate"] : ["even", "hard"]);
// 이긴 판이 램프를 다시 켜는가(수문장이거나 강한 상대). wins: 그 판 전에 이긴 판 수
export const streakRelights = (wins, hard = false) => hard || streakMaster(wins);

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
   over: 마지막 판이 끝났고 램프가 남지 않았다. 공개 행은 강한 상대의 문을 말하지 않아 그 문이 다시 켠 램프는 여기서 세지 못한다:
   관전 화면은 도전의 상태를 따로 읽고(battleService.js readRunState), 그것을 읽지 못할 때만 이 over를 쓴다 */
export function runTrack(games) {
  let at = 0, lives = STREAK_LIVES;
  const out = games.map(g => {
    const row = { id: g.id, at, lives };
    if (g.status !== "ended") return row;
    if (g.winner === "p1") { if (streakMaster(at)) lives = Math.min(STREAK_LIVES, lives + 1); at += 1; } else lives -= 1;
    return row;
  });
  return Object.assign(out, { over: lives <= 0 });
}

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
/* 2026-11-11: 계획은 층과 문이 정하고(foePlan), 상대는 층의 타입으로 모인다(floorType). hard: 강한 상대의 문 */
export const streakFoeDraw = (wins, hard = false) => {
  const draw = { meta: true, ban: STREAK_BAN, plan: foePlan(wins, hard), prefer: floorType(streakFloor(wins)) };
  if (!streakMaster(wins)) return draw;
  const keeper = gatekeeperOf(streakFloor(wins));
  return { ...draw, ace: keeper ? { species: keeper.species, stone: keeper.stone } : true };
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
export const swapTier = species => tierOf(STREAK_FORMAT_ID, species);
const MEGA_STONE = /^(?!Eviolite$).+ite( [XYZ])?$/;
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
