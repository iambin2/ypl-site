import { TYPE_OPTIONS } from "../data/teamBuilderCupRules.js";

/* ============================== 칭호의 얼굴 (DESIGN.md "Titles and hall of fame") ==============================
   칭호는 저마다의 얼굴로 선다. 타입 엑스퍼트는 그 타입의 색, 지방 엘리트는 그 지방 첫 게임의 표지 포켓몬,
   파트너는 그 포켓몬, 챔피언은 금빛 레일의 배너, 그 밖의 칭호는 문장(색 띠 1~3개와, 띠마다 고를 수 있는 그림 하나).
   문장은 칭호 항목의 look 에 산다 { bands: [타입 id], mons: [포켓몬 한국어 이름], mark: "mega" }.
   look 이 없는 칭호는 이름으로 정해 둔 기본 문장, 그것도 없으면 노말 한 띠다. 여기서는 표현만 정하고 기록은 건드리지 않는다. */

export const TITLE_TYPES = TYPE_OPTIONS.map(({ id, korean }) => ({ id, korean }));
const TYPE_IDS = new Set(TITLE_TYPES.map(type => type.id));

/* 지방은 그 지방 첫 게임의 표지 포켓몬으로 선다 (스프라이트 slug) */
export const REGION_COVERS = [
  ["관동", "charizard"], ["성도", "hooh"], ["호연", "groudon"], ["신오", "dialga"], ["하나", "zekrom"],
  ["칼로스", "xerneas"], ["알로라", "solgaleo"], ["가라르", "zacian"], ["히스이", "arceus"], ["팔데아", "koraidon"],
];

export const MAX_BANDS = 3;
export const TITLE_MARKS = ["mega"];

/* 운영자가 문장을 고르기 전의 기본 문장. 뜻은 운영진에게 들은 대로(2026-11-12):
   끝말잇기는 한글날 이름이 이어지는 파티의 대회, 몽키매직은 세 원숭이, 전화기는 전자, 화학, 기계공학의 세 모노타입 팀,
   메가진화의 계승자는 최초의 메가진화 포켓몬(메가루카리오)이라 메가진화의 문양만, RED 는 빨강과 피카츄. */
const PRESETS = {
  끝말잇기: { bands: ["psychic"], mons: ["안농"] },
  몽키매직: { bands: ["grass", "fire", "water"], mons: ["야나키", "바오키", "앗차키"] },
  전화기: { bands: ["electric", "poison", "steel"], mons: ["로토무", "또도가스", "기기기어르"] },
  초신성: { bands: ["steel"], mons: ["지라치"] },
  메가진화의계승자: { bands: [], mark: "mega" },
  RED: { bands: ["fire"], mons: ["피카츄"] },
  슈퍼루키: { bands: ["electric"], mons: ["피츄"] },
  버스드라이버: { bands: ["steel"], mons: ["대왕끼리동"] },
  청출어람: { bands: ["dragon", "water"], mons: ["갸라도스"] },
  스승: { bands: ["fighting"], mons: ["루카리오"] },
  제자: { bands: ["fighting"], mons: ["리오르"] },
};
const nameKey = name => String(name || "").replace(/\s+/g, "");

/* 저장할 수 있는 문장만 남긴다: 알려진 타입 1~3개, 띠 수 이하의 그림, 아는 문양. 메가 문양은 제 색을 띠 대신 쓴다. */
export function normalizeTitleLook(look) {
  if (!look || typeof look !== "object") return null;
  const mark = TITLE_MARKS.includes(look.mark) ? look.mark : null;
  const bands = (Array.isArray(look.bands) ? look.bands : []).filter(id => TYPE_IDS.has(id)).slice(0, MAX_BANDS);
  if (!bands.length && mark !== "mega") return null;
  const mons = mark ? [] : (Array.isArray(look.mons) ? look.mons : []).slice(0, bands.length).map(name => String(name || "").trim());
  return { bands: mark === "mega" ? [] : bands, mons: mons.some(Boolean) ? mons : [], ...(mark ? { mark } : {}) };
}

export function titleLook(item) {
  return normalizeTitleLook(item?.look) || normalizeTitleLook(PRESETS[nameKey(item?.name)]) || { bands: ["normal"], mons: [] };
}

/* 이름에서 분류의 꼬리를 덜어낸 열쇠: "물 엑스퍼트" → "물", "성도 엘리트" → "성도", "3대 챔피언"/"초대 챔피언" → 3/1 */
export const typeOfTitle = name => TITLE_TYPES.find(type => String(name || "").replace(/\s*엑스퍼트$/, "").trim() === type.korean)?.id || null;
export const regionOfTitle = name => REGION_COVERS.find(([region]) => String(name || "").replace(/\s*엘리트$/, "").trim() === region)?.[0] || null;
export function generationOfTitle(name) {
  const text = String(name || "").trim();
  if (/^초대/.test(text)) return 1;
  const n = parseInt(text, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* 페이지 머리의 세 숫자: 칭호, 주인 있는 칭호, 주인 없는 칭호 (파트너는 트레이너 하나가 칭호 하나) */
export function titleCounts(groups = []) {
  const items = groups.flatMap(group => group?.items || []);
  const owned = items.filter(item => (item.holders || []).length > 0).length;
  return { total: items.length, owned, empty: items.length - owned };
}
