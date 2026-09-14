import { TYPE_OPTIONS } from "../data/teamBuilderCupRules.js";
import { normalizedChampionLabel } from "./hallOfFamePresentation.js";

/* ============================== 칭호 자동 판정 ==============================
   기록 반영이 끝난 대회의 성적과 고정된 공식 파티로 칭호 조건을 확인한다.
   칭호는 site_data 의 titleGroups 에 사는 이름 기반 기록이라, 여기서는 후보만 만들고
   부여 여부는 운영자가 확인한다. 경기 중에만 알 수 있는 조건(퍼펙트게임, 붙박이대장,
   언더독, 팀전 승패)은 판정하지 않고 수동 기입으로 남긴다.                         */

const toID = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const clean = (value) => String(value || "").trim();

const GENERATION_REGIONS = [
  [151, "관동"], [251, "성도"], [386, "호연"], [493, "신오"], [649, "하나"],
  [721, "칼로스"], [809, "알로라"], [898, "가라르"], [905, "히스이"], [1025, "팔데아"],
];
const REGIONAL_FORMES = [["Alola", "알로라"], ["Galar", "가라르"], ["Hisui", "히스이"], ["Paldea", "팔데아"]];
// 세대별 첫 스타팅 포켓몬의 도감 번호. 각 세대의 스타팅 3종과 진화형이 뒤이어 9칸을 차지한다.
const STARTER_LINE_STARTS = [1, 152, 252, 387, 495, 650, 722, 810, 906];

const AUTO_ETC_TITLES = ["슈퍼루키", "프라임스타터", "핑거 마에스트로", "맨손의 제왕", "돌격대장"];

/* 이벤트 칭호는 대회에 칭호 보상을 정한 경우에만 부여되므로 그룹 전체를 자동으로 보지 않는다. */
export function isAutoCheckedTitle(groupKey, name) {
  if (["champion", "type", "region", "partner"].includes(groupKey)) return true;
  return groupKey === "etc" && AUTO_ETC_TITLES.includes(clean(name));
}

export function normalizeEventTitleAward(value) {
  const name = clean(value?.name);
  if (!name) return null;
  return { name, scope: value?.scope === "top4" ? "top4" : "champion" };
}

/* 메가진화는 원래 포켓몬의 타입과 세대로 본다. 파이컵 모노타입 룰과 같은 기준이다. */
function speciesRecord(pokedex, pokemonId) {
  const record = pokedex?.[pokemonId];
  if (!record) return null;
  if (record.requiredItem && /^Mega/.test(record.forme || "")) return pokedex[toID(record.baseSpecies)] || record;
  return record;
}

export function pokemonRegion(record) {
  const forme = String(record?.forme || "");
  const regional = REGIONAL_FORMES.find(([prefix]) => forme.startsWith(prefix));
  if (regional) return regional[1];
  const num = Number(record?.num);
  if (!Number.isInteger(num) || num < 1) return null;
  return GENERATION_REGIONS.find(([max]) => num <= max)?.[1] || null;
}

export function isStarterPokemon(record) {
  const num = Number(record?.num);
  return STARTER_LINE_STARTS.some((start) => num >= start && num < start + 9);
}

/* roster 의 모든 포켓몬이 도감에서 확인될 때만 판정한다. 하나라도 모르면 fail closed. */
function resolvedRoster(roster, pokedex) {
  if (!Array.isArray(roster) || !roster.length) return null;
  const records = roster.map((member) => speciesRecord(pokedex, member?.pokemon_id));
  return records.every(Boolean) ? records : null;
}

function sharedValues(lists) {
  const [first = [], ...rest] = lists;
  return [...new Set(first)].filter((value) => rest.every((list) => list.includes(value)));
}

const PLACEMENT_REASON = { champion: "우승", runner_up: "준우승", semifinalist: "4강" };

/**
 * placements: [{ placement: "champion"|"runner_up"|"semifinalist", names: [표시 이름],
 *               roster: [{ pokemon_id, item_id, moves: [] }] | null, playerId }]
 * partnerWins: { [playerId]: [[pokemon_id, ...] per 우승] } — 이번 우승을 포함한 공식 우승 파티
 */
export function evaluateTitleAwards({
  titleGroups = [],
  event = null,
  placements = [],
  detailData = null,
  partnerWins = {},
  championOrdinal = null,
  pokemonName = null,
} = {}) {
  const candidates = [];
  const groupOf = (key) => titleGroups.find((group) => group?.key === key) || null;
  const itemOf = (key, name) => (groupOf(key)?.items || []).find((item) => clean(item?.name) === name) || null;
  const push = ({ groupKey, title, holder, reason, label = title, createDesc = null }) => {
    const group = groupOf(groupKey);
    if (!group || !title || !holder) return;
    const item = itemOf(groupKey, title);
    if (!item && createDesc === null) return;
    if ((item?.holders || []).map(clean).includes(holder)) return;
    const key = `${groupKey}|${title}|${holder}`;
    if (candidates.some((candidate) => candidate.key === key)) return;
    candidates.push({ key, groupKey, title, holder, label, reason, desc: createDesc || undefined });
  };

  const eventName = clean(event?.name);
  const team = Boolean(event?.is_team_event);
  const champions = placements.filter((row) => row.placement === "champion");
  const pokedex = detailData?.pokedex || null;

  // 대회를 만들 때 정한 이벤트 칭호
  const award = normalizeEventTitleAward(event?.competition_settings?.titleAward);
  if (award) {
    const targets = award.scope === "top4" ? placements : champions;
    for (const row of targets) {
      for (const name of row.names || []) {
        push({
          groupKey: "event",
          title: award.name,
          holder: clean(name),
          reason: `${eventName} ${PLACEMENT_REASON[row.placement] || ""}`.trim(),
          createDesc: award.scope === "top4" ? `${eventName} 4강 이상` : `${eventName} 우승`,
        });
      }
    }
  }

  // 챔피언스 본선 우승
  if (event?.event_type === "champions" && event?.championship_phase === "final" && Number(championOrdinal) > 0) {
    const title = normalizedChampionLabel(Number(championOrdinal), event.battle_format);
    for (const row of champions) {
      push({ groupKey: "champion", title, holder: clean(row.names?.[0]), reason: `${eventName} 우승`, createDesc: "" });
    }
  }

  if (team) return candidates;

  // 루키 리그 우승은 파티와 무관하다.
  if (event?.division === "rookie") {
    for (const row of champions) push({ groupKey: "etc", title: "슈퍼루키", holder: clean(row.names?.[0]), reason: `${eventName} 우승` });
  }

  if (!pokedex) return candidates;

  for (const row of placements) {
    const holder = clean(row.names?.[0]);
    const records = resolvedRoster(row.roster, pokedex);
    if (!holder || !records) continue;
    const place = PLACEMENT_REASON[row.placement];

    for (const english of sharedValues(records.map((record) => record.types || []))) {
      const type = TYPE_OPTIONS.find((option) => option.english === english);
      if (type) push({ groupKey: "type", title: `${type.korean} 엑스퍼트`, holder, reason: `${place}, 모든 포켓몬이 ${type.korean} 타입` });
    }

    const regions = records.map(pokemonRegion);
    if (regions.every(Boolean) && new Set(regions).size === 1) {
      push({ groupKey: "region", title: `${regions[0]} 엘리트`, holder, reason: `${place}, 모든 포켓몬이 ${regions[0]} 지방` });
    }

    if (row.placement !== "champion") continue;
    const roster = row.roster;
    if (records.every(isStarterPokemon)) {
      push({ groupKey: "etc", title: "프라임스타터", holder, reason: "우승, 스타팅 포켓몬만 사용" });
    }
    if (roster.every((member) => (member.moves || []).includes("metronome"))) {
      push({ groupKey: "etc", title: "핑거 마에스트로", holder, reason: "우승, 모든 포켓몬이 손가락흔들기 채용" });
    }
    if (roster.every((member) => !clean(member.item_id))) {
      push({ groupKey: "etc", title: "맨손의 제왕", holder, reason: "우승, 지닌 물건 없음" });
    }
    const moves = roster.flatMap((member) => (member.moves || []).filter(Boolean));
    const moveData = moves.map((id) => detailData?.moves?.[id]);
    if (moves.length && moveData.every(Boolean) && moveData.every((move) => move.category !== "Status")) {
      push({ groupKey: "etc", title: "돌격대장", holder, reason: "우승, 변화기 없음" });
    }

    // 파트너: 같은 포켓몬(도감 번호 기준)으로 2회 이상 우승
    const wins = partnerWins?.[row.playerId] || [];
    if (typeof pokemonName === "function" && wins.length >= 2) {
      const counts = new Map();
      for (const winRoster of wins) {
        const nums = new Set(winRoster.map((id) => speciesRecord(pokedex, id)).filter(Boolean).map((record) => record.num));
        for (const num of nums) counts.set(num, (counts.get(num) || 0) + 1);
      }
      for (const record of records) {
        const count = counts.get(record.num) || 0;
        const partner = count >= 2 ? clean(pokemonName(toID(record.baseSpecies || record.name))) : "";
        if (partner) push({ groupKey: "partner", title: holder, holder: partner, label: `파트너 ${partner}`, reason: `같은 포켓몬으로 ${count}회 우승`, createDesc: "" });
      }
    }
  }

  return candidates;
}

/* 후보를 titleGroups 에 반영한다. 없는 칭호는 만들고, 이미 있는 해당자는 건너뛴다. */
export function applyTitleAwards(titleGroups = [], awards = [], makeId = () => Math.random().toString(36).slice(2, 9)) {
  return titleGroups.map((group) => {
    const mine = awards.filter((award) => award.groupKey === group?.key);
    if (!mine.length) return group;
    const items = [...(group.items || [])];
    for (const award of mine) {
      const index = items.findIndex((item) => clean(item?.name) === award.title);
      if (index < 0) {
        items.push({ id: makeId(), name: award.title, ...(award.desc ? { desc: award.desc } : {}), holders: [award.holder] });
        continue;
      }
      const holders = items[index].holders || [];
      if (!holders.map(clean).includes(award.holder)) items[index] = { ...items[index], holders: [...holders, award.holder] };
    }
    return { ...group, items };
  });
}
