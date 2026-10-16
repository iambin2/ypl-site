import { TYPE_OPTIONS } from "../data/teamBuilderCupRules.js";
import { normalizedChampionLabel } from "./hallOfFamePresentation.js";

/* ============================== 칭호 자동 판정 ==============================
   기록 반영이 끝난 대회의 성적과 고정된 공식 파티로 칭호 조건을 확인한다.
   칭호는 site_data 의 titleGroups 에 사는 이름 기반 기록이라, 여기서는 후보만 만들고
   부여 여부는 운영자가 확인한다.                                                     */

const toID = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const clean = (value) => String(value || "").trim();

const GENERATION_REGIONS = [
  [151, "관동"], [251, "성도"], [386, "호연"], [493, "신오"], [649, "하나"],
  [721, "칼로스"], [809, "알로라"], [898, "가라르"], [905, "히스이"], [1025, "팔데아"],
];
const REGIONAL_FORMES = [["Alola", "알로라"], ["Galar", "가라르"], ["Hisui", "히스이"], ["Paldea", "팔데아"]];
/* 이벤트 칭호는 대회에 칭호 보상을 정한 경우에만 부여되므로 그룹 전체를 자동으로 보지 않는다. */
export function isAutoCheckedTitle(groupKey, name) {
  if (["champion", "type", "region", "partner"].includes(groupKey)) return true;
  return groupKey === "etc" && ["슈퍼루키", "버스드라이버"].includes(clean(name));
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

/* 폼 이름만으로는 정할 수 없는 경우: 흰줄 배쓰나이는 이름에 지방이 없는 히스이 리전폼이고,
   알로라 모자 피카츄는 리전폼이 아닌 관동 피카츄다. 다투곰 붉은달의 모습은 처음 나온
   팔데아(북신의 고장)로 본다(운영진 결정). */
const REGION_OVERRIDES = { basculinwhitestriped: "히스이", pikachualola: "관동", ursalunabloodmoon: "팔데아" };

export function pokemonRegion(record) {
  if (REGION_OVERRIDES[record?.id]) return REGION_OVERRIDES[record.id];
  const forme = String(record?.forme || "");
  const regional = REGIONAL_FORMES.find(([prefix]) => forme.startsWith(prefix));
  if (regional) return regional[1];
  const num = Number(record?.num);
  if (!Number.isInteger(num) || num < 1) return null;
  return GENERATION_REGIONS.find(([max]) => num <= max)?.[1] || null;
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
 *               roster: [{ pokemon_id }] | null, playerId }]
 * partnerWins: { [playerId]: [[pokemon_id, ...] per 우승] } — 이번 우승을 포함한 공식 우승 파티
 * championTeamSeries: [{ side: "a"|"b", series }] — 팀전 우승 팀이 치른 경기마다 대진표에 기록된 세트 결과
 *                     (series 는 { lineupA, lineupB, games, ace }, 결과가 없는 경기는 series: null)
 */
export function evaluateTitleAwards({
  titleGroups = [],
  event = null,
  placements = [],
  detailData = null,
  partnerWins = {},
  championOrdinal = null,
  pokemonName = null,
  championTeamSeries = null,
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

  // 버스드라이버: 전승으로 팀전 우승. 우승 팀에서 자기가 치른 모든 경기(에이스 결정전 포함)를 이긴 팀원.
  // 세트 결과가 비어 있는 경기가 하나라도 있으면 전승을 확인할 수 없으므로 판정하지 않는다.
  if (team && Array.isArray(championTeamSeries) && championTeamSeries.length && championTeamSeries.every((row) => row?.series)) {
    const tally = new Map();
    const record = (name, won) => {
      const holder = clean(name);
      if (!holder) return;
      const current = tally.get(holder) || { played: 0, won: 0 };
      tally.set(holder, { played: current.played + 1, won: current.won + (won ? 1 : 0) });
    };
    for (const { side, series } of championTeamSeries) {
      const lineup = side === "a" ? series.lineupA : series.lineupB;
      (series.games || []).forEach((winner, index) => record(lineup?.[index], winner === side));
      if (series.ace) record(side === "a" ? series.ace.a : series.ace.b, series.ace.winner === side);
    }
    for (const [holder, { played, won }] of tally) {
      if (played > 0 && won === played) push({ groupKey: "etc", title: "버스드라이버", holder, reason: `우승, 개인 경기 ${played}전 전승` });
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
