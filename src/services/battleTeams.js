import { ALIGNMENTS, STAT_KEYS, TEAM_STORAGE_KEY, normalizeSavedTeam } from "./teamBuilderCore.js";

/* 팀 빌더에 저장된 팀을 쇼다운의 파티 형식으로 옮긴다. 규정 검사는 배틀 함수가 쇼다운 검사기로 한다.
   Champions의 능력 포인트는 쇼다운의 노력치 칸에 그대로 들어간다(champions 모드가 그렇게 계산한다). */
export function showdownTeam(team, detailData) {
  return (team?.members || []).filter(member => member.pokemonId || member.pokemonName).map(member => ({
    name: "",
    species: detailData?.pokedex?.[member.pokemonId]?.name || member.pokemonName,
    item: member.item || "",
    ability: member.ability || "",
    moves: (member.moves || []).filter(Boolean),
    nature: (ALIGNMENTS.find(alignment => alignment.id === member.alignment) || ALIGNMENTS[0]).name,
    evs: Object.fromEntries(STAT_KEYS.map(key => [key, Number(member.statPoints?.[key] || 0)])),
    level: 50,
  }));
}

export function readSavedTeams(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage?.getItem(TEAM_STORAGE_KEY) || "[]");
    return (Array.isArray(raw) ? raw : []).map(normalizeSavedTeam).filter(team => team?.members?.length)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch {
    return [];
  }
}
