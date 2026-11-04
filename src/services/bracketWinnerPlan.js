import { buildBracketMatchSyncPlan, buildEventBracketMatchSnapshot, NORMALIZED_BRACKET_RUNTIME_SOURCE } from "./bracketMatchSnapshot.js";
import { projectNormalizedDoubleEliminationBracket, projectNormalizedSingleEliminationBracket } from "./bracketProjection.js";
import { deriveQualifierSurvivorState, isChampionshipQualifier } from "./championsCore.js";

/* 대진표에 승자를 반영하는 계산. 데이터베이스도 화면도 모르는 순수 함수만 둔다.
   운영진 화면(BracketsPage)과 결과 동기화(normalizedCompetitionService), 그리고 배틀 서버(supabase/functions/battle)가
   같은 계산을 쓴다. 그래서 사이트 배틀이 끝나 서버가 넣는 승자와 운영진이 손으로 넣는 승자가 언제나 같은 대진을 만든다. */

export const BYE = "∅BYE";

function fail(error, fallback) {
  const next = new Error(error?.message || fallback);
  next.code = error?.code || "YPL_DB_ERROR";
  next.details = error?.details || null;
  throw next;
}

// 대진 그래프의 각 경기에서 이긴 쪽과 진 쪽. sp(slot)는 그 자리에 선 출전(entry) id다.
export function evalGraph(g) {
  const win = {}, lose = {}, all = [];
  g.rounds.forEach(r => r.forEach(m => all.push(m)));
  if (g.lb) g.lb.forEach(r => r.forEach(m => all.push(m)));
  if (g.gf) all.push(g.gf);
  if (g.reset) all.push(g.reset);
  const sp = s => { if (!s) return null; if (s.bye) return BYE; if (s.pid) return s.pid; if (s.win) return win[s.win] ?? null; if (s.lose) return lose[s.lose] ?? null; return null; };
  for (const m of all) {
    const pa = sp(m.a), pb = sp(m.b); let w = null, l = null;
    if (m.winner === "a") { w = pa; l = pb; } else if (m.winner === "b") { w = pb; l = pa; }
    else if (pa === BYE && pb && pb !== BYE) { w = pb; l = BYE; } else if (pb === BYE && pa && pa !== BYE) { w = pa; l = BYE; }
    else if (pa === BYE && pb === BYE) { w = BYE; l = BYE; }
    win[m.id] = w; lose[m.id] = l;
  }
  return { win, lose, sp };
}

export function collectGraphMatches(g) { const a = []; if (!g) return a; g.rounds.forEach(r => r.forEach(m => a.push(m))); if (g.lb) g.lb.forEach(r => r.forEach(m => a.push(m))); if (g.gf) a.push(g.gf); if (g.reset) a.push(g.reset); return a; }

// 승자가 바뀐 경기 아래로 이어지는 경기의 승자를 모두 지운다
export function cascadeClear(all, id) {
  const seen = new Set(), stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    all.forEach(m => { if (seen.has(m.id)) return; if ([m.a, m.b].some(s => s && (s.win === cur || s.lose === cur))) { m.winner = null; m.series = null; seen.add(m.id); stack.push(m.id); } });
  }
}

// 승자 선택(토글: 같은 쪽을 다시 누르면 취소, 반대쪽을 누르면 변경). 하위 경기는 연쇄로 비운다.
export function withPick(b, matchId, side) {
  const nb = JSON.parse(JSON.stringify(b));
  for (const g of [nb.graph, nb.knockout]) {
    if (!g) continue;
    const all = collectGraphMatches(g); const m = all.find(x => x.id === matchId);
    if (m) { const previous = m.winner; m.winner = (m.winner === side ? null : side); cascadeClear(all, m.id); if (g.gf?.id === m.id && g.reset && previous !== m.winner) { g.reset.winner = null; g.reset.series = null; } return nb; }
  }
  if (nb.groups) { for (const gr of nb.groups) { const m = gr.matches.find(x => x.id === matchId); if (m) { m.winner = (m.winner === side ? null : side); return nb; } } }
  return nb;
}

/* 데이터베이스에서 읽은 대진표 사실(런타임, 슬롯, 출전, 참가자, 경기, 신청)을 화면이 쓰는 대진표로 투영한다. */
export function projectRuntimeFacts(runtime, event, {
  slots: slotsResult,
  entries: entriesResult,
  participants: participantsResult,
  matches: matchesResult,
  registrations: registrationsResult,
}) {
  const eventId = runtime.event_id;
  if (!event) throw new Error("대진표의 대회를 찾을 수 없습니다.");
  const failed = [slotsResult, entriesResult, participantsResult, matchesResult].find(result => result.error);
  if (failed) fail(failed.error, "대진표 기준 데이터를 불러오지 못했습니다.");

  if (!["single_elimination", "double_elimination"].includes(runtime.topology_kind) || runtime.projection_version !== 1) {
    throw new Error("지원하지 않는 대진표 구조나 버전입니다.");
  }
  const registrationIds = new Set((participantsResult.data || []).map(row => row.registration_id).filter(Boolean));
  if (registrationIds.size && registrationsResult.error) fail(registrationsResult.error, "대진표 참가자 이름을 불러오지 못했습니다.");
  const registrations = registrationIds.size ? (registrationsResult.data || []).filter(row => registrationIds.has(row.id)) : [];
  if ((matchesResult.data || []).some(row => row?.source !== "normalized_bracket_runtime")) {
    throw new Error("대진표에 다른 출처의 경기가 있어 동기화를 중단했습니다.");
  }
  const registrationNames = new Map((registrations || []).map(row => [row.id, row.registration_name]));
  const entryParticipants = (participantsResult.data || []).map(row => ({
    ...row,
    registration_name: registrationNames.get(row.registration_id) || null,
  }));
  const bracket = runtime.topology_kind === "double_elimination"
    ? projectNormalizedDoubleEliminationBracket({
      event,
      runtimeId: runtime.id,
      entries: entriesResult.data || [],
      entryParticipants,
      entrySlots: slotsResult.data || [],
      matches: matchesResult.data || [],
    })
    : projectNormalizedSingleEliminationBracket({
    event,
    runtimeId: runtime.id,
    entries: entriesResult.data || [],
    entryParticipants,
    entrySlots: slotsResult.data || [],
    matches: matchesResult.data || [],
  });
  bracket.applied = event.record_applied_at
    ? { normalized: true, recordAppliedAt: event.record_applied_at, recordMeta: { eventId } }
    : null;
  bracket.runtimeCreatedAt = runtime.created_at || null;
  return {
    bracket,
    event,
    runtime,
    entries: entriesResult.data || [],
    entryParticipants,
    entrySlots: slotsResult.data || [],
    matches: matchesResult.data || [],
  };
}

/* 챔피언스 선발전: 본선 진출 인원이 찬 뒤에는 새 경기를 열지 않고, 정해지면 남은 빈 경기를 거둔다.
   desiredRows 를 고쳐 돌려준다. 막아야 하면 던진다. */
export function guardQualifierRows(event, participants, desiredRows, previousRows) {
  if (!isChampionshipQualifier(event)) return desiredRows;
  const qualifierEntries = participants.map(participant => ({ id: participant.entryId, status: "active" }));
  const currentState = deriveQualifierSurvivorState({
    entries: qualifierEntries,
    matches: previousRows.filter(row => row.match_kind === "bracket"),
    qualificationSlots: event.qualification_slots,
  });
  const previousByNode = new Map(previousRows.filter(row => row.match_kind === "bracket").map(row => [row.source_node_key, row]));
  const startsNewPlayedMatch = desiredRows.some(row => row.match_kind === "bracket" && row.winner_entry_id && !previousByNode.get(row.source_node_key)?.winner_entry_id);
  if (currentState.aliveCount <= currentState.targetCount && startsNewPlayedMatch) {
    throw new Error("본선 진출 인원이 확정되어 선발전 경기를 더 진행할 수 없습니다.");
  }
  const desiredState = deriveQualifierSurvivorState({ entries: qualifierEntries, matches: desiredRows.filter(row => row.match_kind === "bracket"), qualificationSlots: event.qualification_slots });
  return desiredState.readyToFinalize
    ? desiredRows.filter(row => row.winner_entry_id || previousByNode.has(row.source_node_key))
    : desiredRows;
}

/* 한 경기의 승자를 정하는 계획. 개인전만 다룬다(사이트 배틀은 개인전 경기다).
   - single: 서버가 기존 싱글 승자 RPC 를 그대로 부르면 되므로 그 인자만 돌려준다.
   - double: 운영진 화면과 같은 계산(withPick → 경기 스냅숏 → 동기화 계획)으로 바꿀 행을 돌려준다.
   경기가 아직 성립하지 않았거나, 이미 승자가 있거나, 그 출전이 이 경기에 없으면 던진다(fail closed).
   loserEntryId 를 주면 상대도 확인한다: 앞 경기가 바뀌어 같은 자리에 다른 상대가 서 있으면 배틀의 승자를 넣지 않는다. */
export function planMatchWinner(facts, sourceNodeKey, winnerEntryId, nowIso, loserEntryId = null) {
  const { bracket, event, runtime, matches } = facts;
  if (event.is_team_event) throw new Error("팀전 경기는 배틀 결과로 정하지 않습니다.");
  const graph = bracket.graph;
  const match = collectGraphMatches(graph).find(m => m.id === sourceNodeKey);
  if (!match) throw new Error("대진표에서 이 경기를 찾을 수 없습니다.");
  if (match.winner) throw new Error("이미 승자가 정해진 경기입니다.");
  const { sp } = evalGraph(graph);
  const side = sp(match.a) === winnerEntryId ? "a" : sp(match.b) === winnerEntryId ? "b" : null;
  const other = side === "a" ? sp(match.b) : sp(match.a);
  if (!side || sp(match.a) === BYE || sp(match.b) === BYE || (loserEntryId && other !== loserEntryId)) throw new Error("이 경기의 두 선수가 배틀의 두 선수와 다릅니다.");
  if (runtime.topology_kind === "single_elimination") {
    return { mode: "single", runtimeId: runtime.id, eventId: event.id, sourceNodeKey, winnerEntryId };
  }
  const previousRows = (matches || []).filter(row => row.source === NORMALIZED_BRACKET_RUNTIME_SOURCE);
  const participants = bracket.participants || [];
  let desiredRows = buildEventBracketMatchSnapshot(withPick(bracket, sourceNodeKey, side));
  desiredRows = guardQualifierRows(event, participants, desiredRows, previousRows);
  const plan = buildBracketMatchSyncPlan(previousRows.filter(row => row.match_kind === "bracket"), desiredRows.filter(row => row.match_kind === "bracket"), nowIso);
  const decided = desiredRows.find(row => row.source_node_key === sourceNodeKey);
  if (decided?.winner_entry_id !== winnerEntryId) throw new Error("승자를 반영한 대진이 예상과 다릅니다.");
  return { mode: "double", runtimeId: runtime.id, eventId: event.id, sourceNodeKey, winnerEntryId, updates: plan.updates, inserts: plan.inserts, deleteIds: plan.deleteIds };
}
