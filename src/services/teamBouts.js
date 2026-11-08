/* 팀전의 판을 사이트 배틀로 치를 때의 계산. 데이터베이스도 화면도 모르는 순수 함수만 둔다.
   팀전 한 경기는 팀원끼리의 일반 판 N개(N은 두 팀 중 큰 팀의 인원)와, 일반 판이 동점이면 에이스 결정전 한 판이다
   (bracketTeamParticipants.js buildTeamMatchSeries). 판마다 배틀 하나를 열고, 그 배틀의 source_node_key 는 하위 경기 행과 같은
   "상위 경기 키:bout:n" 또는 "상위 경기 키:ace" 다. 판의 결과는 시리즈가 끝날 때까지 배틀에만 있고, 끝나면 배틀 서버가 시리즈 전체를
   운영진의 팀전 입력과 같은 길(bracketWinnerPlan.js planTeamSeries)로 대진표에 넣는다. 대진표 화면, 배틀 화면, 배틀 서버가 같이 쓴다. */

export const boutKey = (parent, n) => `${parent}:bout:${n}`;
export const aceKey = parent => `${parent}:ace`;

// "r1:m1:bout:2" → { parent: "r1:m1", bout: 2, ace: false }. 개인전 경기 키는 null.
export function parseBoutKey(key) {
  const m = /^(.+):(?:bout:([1-9]\d*)|ace)$/.exec(String(key || ""));
  return m ? { parent: m[1], bout: m[2] ? Number(m[2]) : null, ace: !m[2] } : null;
}

// 판의 결과를 정한 배틀: 끝났고, 무효가 아니고, 승자가 있다
export const boutDecided = b => Boolean(b) && b.status === "ended" && b.ended_by !== "void" && (b.winner === "p1" || b.winner === "p2");

/* 한 팀전 경기의 판들. battles: 그 대회의 배틀 행들, entries: [a 팀 출전 id, b 팀 출전 id], boutCount: 일반 판 수.
   판마다 열린 배틀이 먼저, 없으면 결과를 정한 배틀, 없으면 가장 최근에 끝난 배틀(무승부, 무효)을 고른다. 두 팀이 아닌 배틀은
   (앞 경기가 바뀌어 같은 자리에 다른 팀이 섰다) 세지 않는다. 각 판의 a와 b는 그 판에 앉은 선수({ playerId, name }) 또는 null. */
export function teamBouts(battles = [], parent, [entryA, entryB] = [], boutCount = 0) {
  const ours = b => [b.p1_entry_id, b.p2_entry_id].filter(Boolean).every(id => id === entryA || id === entryB);
  const latest = list => [...list].sort((x, y) => String(y.updated_at || "").localeCompare(String(x.updated_at || "")))[0] || null;
  const seat = (b, entry) => !b ? null
    : b.p1_entry_id === entry && b.p1_player_id ? { playerId: b.p1_player_id, name: b.p1_name || "" }
    : b.p2_entry_id === entry && b.p2_player_id ? { playerId: b.p2_player_id, name: b.p2_name || "" }
    : null;
  const bout = (key, n) => {
    const list = battles.filter(b => b.source_node_key === key && ours(b));
    const battle = list.find(b => b.status !== "ended") || latest(list.filter(boutDecided)) || latest(list);
    const won = boutDecided(battle) ? (battle.winner === "p1" ? battle.p1_entry_id : battle.p2_entry_id) : null;
    return { key, n, battle, winner: won === entryA ? "a" : won === entryB ? "b" : null, a: seat(battle, entryA), b: seat(battle, entryB) };
  };
  const bouts = Array.from({ length: boutCount }, (_, i) => bout(boutKey(parent, i + 1), i + 1));
  const played = boutCount > 0 && bouts.every(x => x.winner);
  const winsA = bouts.filter(x => x.winner === "a").length, winsB = bouts.filter(x => x.winner === "b").length;
  const aceNeeded = played && winsA === winsB;
  const ace = aceNeeded ? bout(aceKey(parent), null) : null;
  const winner = !played ? null : winsA !== winsB ? (winsA > winsB ? "a" : "b") : ace.winner;
  return { bouts, ace, aceNeeded, winsA, winsB, winner, live: [...bouts, ace].some(x => x?.battle && x.battle.status !== "ended") };
}

/* 끝난 시리즈를 운영진의 팀전 입력과 같은 모양으로: { series: { lineupA, lineupB, games, ace }, winnerSide }. nameOf(playerId)는 그 팀원의
   확정 이름(대진표 참가자의 memberIdentities)이다. 아직 끝나지 않았으면 null. */
export function seriesFromBouts(state, nameOf) {
  if (!state?.winner) return null;
  const name = seat => nameOf(seat?.playerId) || null;
  return {
    winnerSide: state.winner,
    series: {
      lineupA: state.bouts.map(x => name(x.a)),
      lineupB: state.bouts.map(x => name(x.b)),
      games: state.bouts.map(x => x.winner),
      ace: state.ace ? { a: name(state.ace.a), b: name(state.ace.b), winner: state.ace.winner } : null,
    },
  };
}
