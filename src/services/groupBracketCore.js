
export const GROUP_TOPOLOGY = "groups_then_elimination";
export const GROUP_FINAL_FORMATS = ["single_elimination", "double_elimination"];

export function validateGroupConfig(count, groups, advance, finalFormat) {
  if (!Number.isInteger(groups) || groups < 1 || groups > 32 ||
      !Number.isInteger(advance) || advance < 1 ||
      !Number.isInteger(count) || count > 64 ||
      !GROUP_FINAL_FORMATS.includes(finalFormat) ||
      Math.floor(count / groups) <= advance ||
      groups * advance < (finalFormat === "double_elimination" ? 3 : 2)) {
    throw new Error("각 조에 탈락자가 1명 이상, 본선에 싱글 2명 또는 더블 3명 이상이 필요합니다.");
  }
}

export function groupDraw(keys, groups, random = Math.random) {
  const shuffled = [...keys];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const pools = Array.from({length: groups}, () => []);
  shuffled.forEach((key, i) => pools[i % groups].push(key));
  return pools;
}

export function groupFixtureKeys(pool, members) {
  const matches = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      matches.push({ id: `group:g${pool}:m${matches.length + 1}`, a: {pid: members[i]}, b: {pid: members[j]} });
    }
  }
  return matches;
}

function partitionByWins(ids, matches) {
  const wins = new Map(ids.map(id => [id, 0]));
  for (const match of matches) {
    if (!wins.has(match.a.pid) || !wins.has(match.b.pid) || !match.winner) continue;
    const winner = match[match.winner].pid;
    wins.set(winner, wins.get(winner) + 1);
  }
  const bands = new Map();
  for (const id of ids) {
    const count = wins.get(id);
    if (!bands.has(count)) bands.set(count, []);
    bands.get(count).push(id);
  }
  return {wins, bands: [...bands].sort(([a], [b]) => b - a).map(([, band]) => band)};
}

function resolveBand(ids, matches) {
  if (ids.length < 2) return [ids];
  const {bands} = partitionByWins(ids, matches);
  // If a mini-league splits the tie, the remaining tied subset starts again
  // with its own matches (including the head-to-head of a two-player subset).
  return bands.length > 1 ? bands.flatMap(band => resolveBand(band, matches)) : [ids];
}

export function groupStandingState(members, matches, advance, playoffs = []) {
  const complete = matches.every(match => match.winner === "a" || match.winner === "b");
  const {wins, bands: totals} = partitionByWins(members, matches);
  const bands = complete ? totals.flatMap(band => resolveBand(band, matches)) : totals;
  const winsBandSize = new Map(totals.flatMap(band => band.map(id => [id, band.length])));
  const rows = [];
  const qualified = [];
  let remaining = advance;
  let cutoff = null;
  for (const band of bands) {
    const rank = rows.length + 1;
    for (const id of band) rows.push({
      id, rank, wins: wins.get(id), tied: band.length > 1,
      reason: band.length > 1 ? "공동 순위" : (winsBandSize.get(id) > 1 && complete ? "승자승" : ""),
    });
    if (!complete || remaining <= 0) continue;
    if (band.length <= remaining) {
      qualified.push(...band);
      remaining -= band.length;
    } else {
      cutoff = { ids: [...band], places: remaining };
      remaining = 0;
    }
  }
  if (playoffs.length && !cutoff) throw new Error("진출 순위 결정전이 현재 조별 결과와 맞지 않습니다.");
  if (!cutoff) return {rows, complete, qualified, cutoff: null, next: null, ready: complete};
  let survivors = [...cutoff.ids];
  let pending = false;
  for (const match of playoffs) {
    if (pending || survivors.length <= cutoff.places ||
        !survivors.includes(match.a.pid) || !survivors.includes(match.b.pid) || match.a.pid === match.b.pid) {
      throw new Error("순위 결정전의 참가자가 조별 동률과 일치하지 않습니다.");
    }
    if (!match.winner) pending = true;
    else survivors = survivors.filter(id => id !== match[match.winner === "a" ? "b" : "a"].pid);
  }
  const ready = survivors.length === cutoff.places;
  if (ready) qualified.push(...survivors);
  return {rows, complete, qualified, cutoff, ready, next: !ready && !pending ? survivors : null};
}
