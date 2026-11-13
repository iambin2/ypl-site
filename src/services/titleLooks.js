import { TYPE_OPTIONS } from "../data/teamBuilderCupRules.js";

/* ============================== 칭호의 메달 (DESIGN.md "Titles and hall of fame") ==============================
   모든 칭호는 메달이다. 메달 가운데의 에나멜은 칭호의 색(타입 1~3개), 그 위에 솟은 장식(device)은 사이트가 직접 그린 문양이다.
   타입 엑스퍼트는 그 타입의 문양, 지방 엘리트는 그 지방의 풍경, 파트너는 발자국, 챔피언은 금메달과 로마 숫자,
   그 밖의 칭호는 운영자가 고른 색과 장식(없으면 색의 타입 문양). 포켓몬 그림은 메달에 서지 않는다.
   문장은 칭호 항목의 look 에 산다 { bands: [타입 id], device: 장식 id, mark: "mega" }. 여기서는 표현만 정하고 기록은 건드리지 않는다. */

export const TITLE_TYPES = TYPE_OPTIONS.map(({ id, korean }) => ({ id, korean }));
const TYPE_IDS = new Set(TITLE_TYPES.map(type => type.id));

/* 지방: 그 지방의 풍경 하나와 에나멜 색 하나 (titleMedal.js 의 SCENES 가 같은 이름으로 그린다) */
export const REGIONS = [
  ["관동", "fire"], ["성도", "flying"], ["호연", "ground"], ["신오", "steel"], ["하나", "dragon"],
  ["칼로스", "fairy"], ["알로라", "psychic"], ["가라르", "ice"], ["히스이", "normal"], ["팔데아", "fighting"],
];

export const MAX_BANDS = 3;
export const TITLE_MARKS = ["mega"];
/* 운영자가 고를 수 있는 장식 (그린 것만). 없으면 색의 타입 문양이 선다. */
export const TITLE_DEVICES = [
  ["hangul", "한글 책"], ["nova", "새 별"], ["rookie", "별똥별"], ["n151", "151"], ["torch", "횃불"], ["sprout", "새싹"],
  ["bus", "버스"], ["indigo", "쪽잎과 물방울"], ["paw", "발자국"],
];
const DEVICE_IDS = new Set(TITLE_DEVICES.map(([id]) => id));

/* 운영자가 문장을 고르기 전의 기본 문장. 뜻은 운영진에게 들은 대로(2026-11-12, 11-13):
   끝말잇기는 한글날의 대회, 몽키매직은 세 원숭이(풀, 불꽃, 물), 전화기는 전자, 화학, 기계공학의 세 모노타입 팀,
   초신성은 뉴비 대회의 우승(슈퍼루키와 같은 뜻), RED 는 1세대 151마리만 쓴 대회, 스승과 제자는 팀전 멘토와 멘티. */
const PRESETS = {
  끝말잇기: { bands: ["psychic"], device: "hangul" },
  몽키매직: { bands: ["grass", "fire", "water"] },
  전화기: { bands: ["electric", "poison", "steel"] },
  초신성: { bands: ["dragon", "fairy"], device: "nova" },
  메가진화의계승자: { bands: [], mark: "mega" },
  RED: { bands: ["fire"], device: "n151" },
  슈퍼루키: { bands: ["electric"], device: "rookie" },
  버스드라이버: { bands: ["steel"], device: "bus" },
  청출어람: { bands: ["dragon", "water"], device: "indigo" },
  스승: { bands: ["fighting"], device: "torch" },
  제자: { bands: ["fighting"], device: "sprout" },
};
const nameKey = name => String(name || "").replace(/\s+/g, "");

/* 저장할 수 있는 문장만 남긴다: 알려진 타입 1~3개, 그린 장식 하나, 아는 문양. 메가 문양은 제 색을 띠 대신 쓴다. */
export function normalizeTitleLook(look) {
  if (!look || typeof look !== "object") return null;
  const mark = TITLE_MARKS.includes(look.mark) ? look.mark : null;
  const bands = (Array.isArray(look.bands) ? look.bands : []).filter(id => TYPE_IDS.has(id)).slice(0, MAX_BANDS);
  if (!bands.length && mark !== "mega") return null;
  if (mark) return { bands: [], mark };
  return { bands, ...(DEVICE_IDS.has(look.device) ? { device: look.device } : {}) };
}

export function titleLook(item) {
  return normalizeTitleLook(item?.look) || normalizeTitleLook(PRESETS[nameKey(item?.name)]) || { bands: ["normal"] };
}

/* 이름에서 분류의 꼬리를 덜어낸 열쇠: "물 엑스퍼트" → "물", "성도 엘리트" → "성도", "3대 챔피언"/"초대 챔피언" → 3/1 */
export const typeOfTitle = name => TITLE_TYPES.find(type => String(name || "").replace(/\s*엑스퍼트$/, "").trim() === type.korean)?.id || null;
export const regionOfTitle = name => REGIONS.find(([region]) => String(name || "").replace(/\s*엘리트$/, "").trim() === region)?.[0] || null;
export function generationOfTitle(name) {
  const text = String(name || "").trim();
  if (/^초대/.test(text)) return 1;
  const n = parseInt(text, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}
/* 클래식 시즌의 챔피언은 왕관, YPL 시즌의 챔피언은 날개를 단다 */
export const eraOfSeason = season => /클래식|classic/i.test(String(season || "")) ? "classic" : "ypl";

/* ---------- 메달 한 개의 설계도 (titleMedal.js 가 그린다). 색은 타입 id 로만 적고, 실제 색은 그릴 때 토큰에서 읽는다. ---------- */
export const typeMedal = id => ({ glyphs: [id], enamel: [id] });
export const regionMedal = region => ({ scene: region, enamel: [REGIONS.find(([r]) => r === region)?.[1] || "normal"] });
export const partnerMedal = type => ({ device: "paw", enamel: [TYPE_IDS.has(type) ? type : "normal"] });
export const championMedal = (generation, season) => ({ champ: { gen: generation, era: eraOfSeason(season) }, tier: "gold" });
export function ownMedal(item) {
  const look = titleLook(item);
  if (look.mark === "mega") return { mark: "mega" };
  return look.device ? { device: look.device, enamel: look.bands } : { glyphs: look.bands, enamel: look.bands };
}

/* 페이지 머리의 세 숫자: 칭호, 주인 있는 칭호, 주인 없는 칭호 (파트너는 트레이너 하나가 칭호 하나) */
export function titleCounts(groups = []) {
  const items = groups.flatMap(group => group?.items || []);
  const owned = items.filter(item => (item.holders || []).length > 0).length;
  return { total: items.length, owned, empty: items.length - owned };
}
