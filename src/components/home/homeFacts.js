/* 홈의 실제 기록. 무거운 조각이라 첫 그림 뒤에 불러온다(홈의 첫 번들에 넣지 않는다). */

/* 명예의 전당과 같은 합침(mergeHallOfFame)과 같은 그림(resolveHallOfFameArtwork), 최신 챔피언이 앞.
   옛 파티 이미지 표(legacyPartyImages, 압축해도 248KB)는 받지 않는다: 이름만으로 스프라이트를 찾는다. */
const CHAMPIONS_KEY = "ypl-home-champions";
let shownChampions = null, shownFacts = null;
/* 이미 읽은 값은 첫 그림부터 쓴다. 돌아온 홈이 면을 다시 비우거나 복원한 스크롤 아래로 내용을 밀지 않는다. 새 값은 뒤따라 읽는다. */
export function seenChampions() {
  if (shownChampions) return shownChampions;
  try { const saved = JSON.parse(localStorage.getItem(CHAMPIONS_KEY)); return Array.isArray(saved) ? saved : null; } catch { return null; }
}
/* 전당 읽기(조각, 전당 조회, 그림 사전)는 site_data 가 필요 없다. 첫 화면이 홈이면 앱이 시작할 때 site_data 와 나란히 출발해
   첫 화면의 가장 큰 그림(현 챔피언)이 site_data, 홈의 첫 그림, 조각 받기를 차례로 기다리지 않는다(LCP 대기 73%).
   한 번 쓰면 비운다: 다시 찾은 홈과 데이터 갱신은 새로 읽는다. */
let warm = null;
export function warmChampions() {
  return warm ||= (async () => {
    const [hall, service, labels] = await Promise.all([
      import("../../services/hallOfFamePresentation.js"), import("../../services/championsService.js"), import("../../services/seasonLabel.js"),
    ]);
    const [normalized, lookup] = await Promise.all([
      service.championsOperationsEnabled() ? service.fetchNormalizedChampionsHallOfFame().catch(() => []) : null,
      hall.loadHallOfFameArtworkLookup().catch(() => new Map()),
    ]);
    return { hall, labels, normalized, lookup };
  })();
}
export async function loadChampions(data) {
  const reading = warmChampions();
  warm = null;
  const { hall, labels, normalized, lookup } = await reading;
  const member = m => typeof m === "string" ? { name: m, img: "", pokemonId: "" } : { name: m?.name || "", img: m?.img || "", pokemonId: m?.pokemonId || "" };
  const rows = hall.mergeHallOfFame(data.champions, normalized).reverse().map((c, i) => ({
    key: `${c.gen}-${c.name}-${i}`, name: c.name, generation: c.generationNumber || 0, label: labels.generationText(c.gen),
    line: `${labels.displaySeasonLabel(c.slabel) || "시즌 " + c.season} 우승`,
    party: (c.team || []).map(member).filter(m => m.name || m.img || m.pokemonId).slice(0, 6)
      .map(m => ({ name: m.name, img: hall.resolveHallOfFameArtwork(m, lookup) || "" })),
    // 그날의 세부 값(챔피언 시트의 명판): 세부 값을 받은 뒤의 우승에만 있다
    sets: c.sets || [], regulationId: c.regulationId || "",
  }));
  shownChampions = rows;
  if (rows.length) try { localStorage.setItem(CHAMPIONS_KEY, JSON.stringify(rows)); } catch { /* 다음에 다시 읽는다 */ }
  return rows;
}

/* 랭킹 화면과 같은 고르기: 정규화 기록은 최신 시즌이 맨 앞, 예전 기록은 맨 뒤에 있다. */
function currentSeason(snapshot, data, rankRows) {
  const seasons = snapshot.ranking?.seasons || data.seasons || [];
  const normalized = seasons.some(s => s.source === "normalized") || (snapshot.ranking?.series || []).some(s => s.source === "normalized");
  const season = normalized ? seasons[0] : seasons[seasons.length - 1];
  if (!season?.rows?.length) return null;
  return { name: season.name, rows: rankRows(season.rows).slice(0, 3).map(({ rank, name, points }) => ({ rank, name, points: points || 0 })) };
}

/* 기록 화면의 스냅숏을 같은 캐시로 읽는다. 공식 기록을 못 읽으면 기록 화면처럼 기존 기록으로 센다.
   사실 몇 개를 위해 요청 11개가 나가므로, 다시 찾은 방문자는 6시간 안의 값을 쓴다. 대회가 끝나야 바뀌는 사실이다. */
const FACTS_KEY = "ypl-home-facts-2";
const FACTS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RECORDS_MAX_AGE_MS = 60 * 1000;

export function seenFacts() {
  try {
    const saved = shownFacts || JSON.parse(localStorage.getItem(FACTS_KEY));
    return saved && Date.now() - saved.at < FACTS_MAX_AGE_MS ? saved.facts : null;
  } catch { return null; /* 저장소를 못 읽으면 새로 센다 */ }
}
export async function loadFacts(data, admin = false) {
  if (!admin) {
    const saved = seenFacts();
    if (saved) return saved;
  }
  const [{ freshRead }, normalized, projection, analytics, { recordRoundTitle }, { rankRows }] = await Promise.all([
    import("../../services/readCache.js"), import("../../services/normalizedRecordsService.js"),
    import("../../services/normalizedRecordsProjection.js"), import("../../services/recordsAnalytics.js"), import("../../services/eventName.js"), import("../common/StandTable.jsx"),
  ]);
  let raw = null;
  if (normalized.normalizedRecordsReadEnabled()) raw = await freshRead("records", normalized.fetchNormalizedRecordsSnapshot, admin ? 0 : RECORDS_MAX_AGE_MS).catch(() => null);
  const snapshot = raw ? projection.buildNormalizedRecordsProjection(data, raw, null) : analytics.buildRecordsSnapshot(data);
  const archives = snapshot.archives || [], dated = archives.filter(a => /\d{4}/.test(a.date || ""));
  const latest = archives.find(a => a.win);
  const facts = {
    tournaments: archives.length, trainers: (snapshot.trainers || []).length,
    latest: latest ? { winner: latest.win, name: latest.eventName || recordRoundTitle(latest.tournamentName, latest.round) } : null,
    first: dated[dated.length - 1]?.date || "",
    season: currentSeason(snapshot, data, rankRows),
    seasons: (snapshot.ranking?.seasons || data.seasons || []).length,
  };
  // 공식 기록을 읽었을 때만 기억한다. 대체 집계가 6시간 남아 있으면 안 된다.
  if (raw) {
    shownFacts = { at: Date.now(), facts };
    try { localStorage.setItem(FACTS_KEY, JSON.stringify(shownFacts)); } catch { /* 다음에 다시 센다 */ }
  }
  return facts;
}
