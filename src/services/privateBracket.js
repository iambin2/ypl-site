import { deterministicDoubleGraph, shuffle } from "./bracketProjection.js";
const newCommunityId = () => Math.random().toString(36).slice(2, 10);

/* 사설 대진표: 누구나 만드는 연습용 토너먼트. 공식 대진표와 같은 그래프 모양(rounds, lb, gf, reset)이라
   같은 보드로 그리지만, 저장은 communityStore 의 별도 행에만 하고 기록, 랭킹, 대회(Event)와 이어지지 않는다. */
export const PRIVATE_BRACKET_MAX = 64;

export function parseParticipantNames(text = "") {
  const seen = new Set();
  return String(text).split(/[\n,]/).map(name => name.trim().slice(0, 20)).filter(name => {
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

/* order: "random" 은 공정한 추첨(Fisher-Yates)으로 자리와 부전승 칸을 섞고,
   "input" 은 적은 순서대로 1번과 2번, 3번과 4번이 만나며 부전승은 뒤쪽 경기에 간다. */
export function buildPrivateGraph(participantIds, { double = false, order = "random", random = Math.random } = {}) {
  const ids = [...participantIds];
  if (ids.length < 2) throw new Error("참가자가 2명 이상 필요합니다.");
  if (ids.length > PRIVATE_BRACKET_MAX) throw new Error(`참가자는 ${PRIVATE_BRACKET_MAX}명까지 넣을 수 있습니다.`);
  let size = 2;
  while (size < ids.length) size *= 2;
  const matchCount = size / 2;
  const byeCount = size - ids.length;
  const seats = order === "input" ? ids : shuffle(ids, random);
  const byeMatches = new Set(order === "input"
    ? Array.from({ length: byeCount }, (_, i) => matchCount - 1 - i)
    : shuffle(Array.from({ length: matchCount }, (_, i) => i), random).slice(0, byeCount));
  let cursor = 0;
  const slots = Array.from({ length: matchCount }, (_, match) => [
    { pid: seats[cursor++] },
    byeMatches.has(match) ? { bye: true } : { pid: seats[cursor++] },
  ]);
  const graph = deterministicDoubleGraph(slots);
  if (double && ids.length >= 3) return graph;
  return { kind: "single", rounds: graph.rounds, size, byes: byeCount };
}

export function createPrivateBracket({ name, host, names, double = false, order = "random", note = "", random = Math.random, now = new Date() }) {
  const participants = names.map(n => ({ id: newCommunityId(), name: n }));
  return {
    id: newCommunityId(),
    name: String(name || "").trim().slice(0, 40) || "사설 대진표",
    host: String(host || "").trim().slice(0, 20),
    note: String(note || "").trim().slice(0, 1000),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    format: "elim",
    mode: "single",
    double: Boolean(double && participants.length >= 3),
    order,
    participants,
    graph: buildPrivateGraph(participants.map(p => p.id), { double, order, random }),
  };
}
