import { useEffect, useState } from "react";
import { displaySeasonLabel } from "../../services/seasonLabel.js";

/* 홈의 현 챔피언과 우승 파티. 명예의 전당 페이지와 같은 읽기(mergeHallOfFame)를 쓰되, 그 모듈들(예전 파티 이미지, 포켓몬 사전)은
   크므로 홈의 첫 번들에 넣지 않고 그린 뒤에 불러온다. 다 오기 전에는 null. 챔피언이 없어도 null. */
const load = () => Promise.all([
  import("../../services/championsService.js"),
  import("../../services/hallOfFamePresentation.js"),
  import("../../services/legacyPartyImages.js"),
]);

export function useReigningChampion(legacyChampions) {
  const [mods, setMods] = useState(null);
  const [normalized, setNormalized] = useState(null);
  useEffect(() => {
    let cancelled = false;
    load().then(([service, hof, legacy]) => {
      if (cancelled) return;
      const rows = service.championsOperationsEnabled()
        ? service.fetchNormalizedChampionsHallOfFame().catch(error => { console.warn("normalized Champions read failed", error); return []; })
        : Promise.resolve([]);
      Promise.all([rows, hof.loadHallOfFameArtworkLookup().catch(() => new Map())]).then(([list, lookup]) => {
        if (cancelled) return;
        setNormalized(list);
        setMods({ hof, normTeam: legacy.normTeam, lookup });
      });
    }).catch(error => console.warn("hall of fame modules failed to load", error));
    return () => { cancelled = true; };
  }, []);
  if (!mods) return null;
  const { hof, normTeam, lookup } = mods;
  const champs = hof.mergeHallOfFame(legacyChampions, normalized);
  const c = champs[champs.length - 1];
  if (!c) return null;
  return {
    name: c.name,
    label: `${c.kind === "normalized" ? c.gen : hof.legacyChampionLabel(c.gen)}, ${displaySeasonLabel(c.slabel) || "시즌 " + c.season} 우승`,
    party: normTeam(c.team).filter(m => m.name || m.img || m.pokemonId).slice(0, 6)
      .map(m => ({ name: m.name || "", img: hof.resolveHallOfFameArtwork(m, lookup) })).filter(m => m.img),
  };
}
