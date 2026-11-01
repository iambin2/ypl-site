/* 홈의 실제 기록. 무거운 조각이라 첫 그림 뒤에 불러온다(홈의 첫 번들에 넣지 않는다). */

/* 명예의 전당과 같은 합침(mergeHallOfFame)과 같은 그림(resolveHallOfFameArtwork), 최신 챔피언이 앞.
   옛 파티 이미지 표(legacyPartyImages, 압축해도 248KB)는 받지 않는다: 이름만으로 스프라이트를 찾는다. */
export async function loadChampions(data) {
  const [hall, service, labels] = await Promise.all([
    import("../../services/hallOfFamePresentation.js"), import("../../services/championsService.js"), import("../../services/seasonLabel.js"),
  ]);
  const [normalized, lookup] = await Promise.all([
    service.championsOperationsEnabled() ? service.fetchNormalizedChampionsHallOfFame().catch(() => []) : null,
    hall.loadHallOfFameArtworkLookup().catch(() => new Map()),
  ]);
  const member = m => typeof m === "string" ? { name: m, img: "", pokemonId: "" } : { name: m?.name || "", img: m?.img || "", pokemonId: m?.pokemonId || "" };
  return hall.mergeHallOfFame(data.champions, normalized).reverse().map((c, i) => ({
    key: `${c.gen}-${c.name}-${i}`, name: c.name, generation: c.generationNumber || 0, label: labels.generationText(c.gen),
    line: `${labels.displaySeasonLabel(c.slabel) || "시즌 " + c.season} 우승`,
    party: (c.team || []).map(member).filter(m => m.name || m.img || m.pokemonId).slice(0, 6)
      .map(m => ({ name: m.name, img: hall.resolveHallOfFameArtwork(m, lookup) || "" })),
  }));
}

/* 기록 화면의 스냅숏을 같은 캐시로 읽는다. 공식 기록을 못 읽으면 기록 화면처럼 기존 기록으로 센다. */
export async function loadCounts(data) {
  const [{ freshRead }, normalized, projection, analytics] = await Promise.all([
    import("../../services/readCache.js"), import("../../services/normalizedRecordsService.js"),
    import("../../services/normalizedRecordsProjection.js"), import("../../services/recordsAnalytics.js"),
  ]);
  let raw = null;
  if (normalized.normalizedRecordsReadEnabled()) raw = await freshRead("records", normalized.fetchNormalizedRecordsSnapshot).catch(() => null);
  const snapshot = raw ? projection.buildNormalizedRecordsProjection(data, raw, null) : analytics.buildRecordsSnapshot(data);
  return { tournaments: (snapshot.archives || []).length, trainers: (snapshot.trainers || []).length };
}
