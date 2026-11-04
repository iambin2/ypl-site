import { callFunction, supa } from "../storage.js";

/* 사이트 안 배틀의 통로. 엔진은 battle Edge Function 안에서만 돈다(supabase/functions/battle).
   좌석 토큰은 이 기기의 localStorage에만 둔다: 토큰을 가진 기기가 그 자리의 선수다.
   친선전은 누구나 열고, 공식 경기는 그 경기 선수가 신청 이름과 제출 비밀번호로 앉는다. 공식 경기의 승자는 서버가 대진표에 넣는다. */
const SEATS_KEY = "ypl-battle:seats:v1";

export function readSeat(id) {
  try { return JSON.parse(localStorage.getItem(SEATS_KEY) || "{}")[id] || null; } catch { return null; }
}
function keepSeat(id, seat) {
  try {
    const seats = JSON.parse(localStorage.getItem(SEATS_KEY) || "{}");
    if (seat) seats[id] = seat; else delete seats[id];
    localStorage.setItem(SEATS_KEY, JSON.stringify(seats));
  } catch { /* 저장하지 못하면 이 화면에서만 선수다 */ }
}

export async function createBattle({ regulation, battleFormat, name, team }) {
  const made = await callFunction("battle", { action: "create", regulation, battleFormat, name, team });
  keepSeat(made.id, { token: made.token, side: made.side });
  return made;
}
export async function joinBattle(id, { name, team }) {
  const view = await callFunction("battle", { action: "join", id, name, team });
  keepSeat(id, { token: view.token, side: view.side });
  return view;
}
// 공식 경기의 자리. 먼저 온 선수가 배틀을 열고, 다음 선수가 시작한다. 같은 선수가 다른 기기에서 오면 자리를 옮긴다.
export async function takeOfficialSeat({ eventId, nodeKey, side, pin }) {
  const seat = await callFunction("battle", { action: "official", eventId, nodeKey, side, pin });
  keepSeat(seat.id, { token: seat.token, side: seat.side });
  return seat;
}
const asSeat = (id, action, extra = {}) => {
  const seat = readSeat(id);
  if (!seat) throw new Error("이 기기에는 이 배틀의 자리가 없습니다.");
  return callFunction("battle", { action, id, token: seat.token, ...extra });
};
export const viewBattle = id => asSeat(id, "view");
// rq: 답하는 요청의 requestKey(battleLog.js). 서버는 이미 지난 요청에 대한 선택을 막는다.
export const chooseInBattle = (id, choice, rq) => asSeat(id, "choose", { choice, rq });
export const forfeitBattle = id => asSeat(id, "forfeit");
// 다른 기기가 이 자리를 가져갔을 때: 이 기기는 관전한다
export const forgetSeat = id => keepSeat(id, null);
export async function cancelBattle(id) {
  await asSeat(id, "cancel");
  keepSeat(id, null);
}

const PUBLIC = "id, regulation, format_id, engine, status, p1_name, p2_name, turn, winner, ended_by, spectator_log, version, created_at, updated_at, kind, event_id, source_node_key, p1_entry_id, p2_entry_id, p1_player_id, p2_player_id, applied_at, apply_error";
const LIST = "id, status, p1_name, p2_name, turn, winner, ended_by, kind, event_id, source_node_key, p1_entry_id, p2_entry_id, p1_player_id, p2_player_id, applied_at, apply_error, updated_at";

// 공개 행. 진행 중에는 관전 로그만, 끝나면 전체 로그와 입력 기록까지 있다.
export async function readBattleRow(id) {
  if (!supa) return null;
  const { data, error } = await supa.from("battles").select(PUBLIC).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
/* 끝난 배틀의 로그(리플레이). 공식 배틀의 전체 로그와 입력 기록에는 두 선수의 파티 전부가 있어, 대회가 파티를 공개하기 전에는
   관전 로그만 온다(full: false). 친선전과 공개된 대회, 운영진은 전체를 받는다(docs/db/battle_integration.sql battle_full_log). */
export async function readBattleLog(id) {
  const { data, error } = await supa.rpc("battle_full_log", { p_id: id });
  if (!error) return data;
  // battle_integration.sql 을 실행하기 전: 지금까지처럼 표를 읽는다
  const old = await supa.from("battles").select("log, input_log").eq("id", id).maybeSingle();
  if (old.error) throw new Error(old.error.message);
  return old.data && { ...old.data, full: true };
}
// 바뀌었는지만 묻는 가벼운 읽기(응답 약 12바이트). 화면은 이 값이 오를 때만 전체를 다시 읽는다.
// ponytail: 묻는 방식이다. 동시에 보는 사람이 많아지면 Supabase Realtime으로 바꾼다.
export async function readBattleVersion(id) {
  if (!supa) return null;
  const { data, error } = await supa.from("battles").select("version").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.version ?? null;
}

/* 배틀 화면이 몇 ms 뒤에 다시 물을지. null이면 그만 묻는다.
   진행 중에는 1.5초, 1분 동안 아무것도 바뀌지 않으면 3초, 5분이면 6초. 끝난 배틀은 다시 바뀌지 않는다.
   다만 공식 경기는 끝난 뒤 서버가 대진표에 넣으며 applied_at(또는 apply_error)만 쓰고 version은 올리지 않으므로, 그 값이 올 때까지 행을 읽는다.
   row === null은 없는 배틀(대기 취소)이다. */
export function battlePollDelay(row, idleMs) {
  if (row === null) return null;
  if (row?.status === "ended") return row.kind === "official" && !row.applied_at && !row.apply_error ? 4500 : null;
  return idleMs < 60_000 ? 1500 : idleMs < 300_000 ? 3000 : 6000;
}
// 선수의 화면은 엔진이 움직였을 때만 바뀐다. 엔진이 한 걸음 가면 쇼다운은 반드시 관전 로그에 줄을 더한다(덧붙이기만 한다).
// 그래서 상태와 관전 로그가 그대로면 version이 올랐어도(상대의 대기 중 선택) 화면을 다시 받지 않는다. view.version은 그 화면이 어느 version의 것인지다.
export function playerViewIsCurrent(view, seenRow, row) {
  if (!view || !row) return false;
  if (view.version != null && view.version === row.version) return true;
  return Boolean(seenRow) && seenRow.status === row.status && seenRow.spectator_log === row.spectator_log;
}

// 한 대회의 공식 배틀(대진표, 홈의 지금 경기). 배틀 표가 아직 없는 환경에서는 빈 목록이다.
export async function listEventBattles(eventId) {
  if (!supa || !eventId) return [];
  const { data, error } = await supa.from("battles").select(LIST).eq("event_id", eventId).order("updated_at", { ascending: false });
  return error ? [] : data || [];
}
// 배틀이 어떻게 끝났는지(목록의 한 줄). 끝까지 싸운 배틀은 빈 문자열이다.
export const endedByLine = b => ({ forfeit: "기권", timeout: "시간 초과", void: "무효" })[b?.ended_by] || "";
// 선수들의 끝난 공식 배틀(트레이너 기록). 전부 읽는다.
// ponytail: PostgREST가 한 번에 1000행까지 준다. 한 트레이너의 공식 배틀이 그만큼 쌓이면 range로 나눠 읽는다.
export async function listPlayerBattles(playerIds = []) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!supa || !ids.length) return [];
  const list = ids.join(",");
  const { data, error } = await supa.from("battles").select(LIST)
    .eq("kind", "official").eq("status", "ended").neq("ended_by", "void").or(`p1_player_id.in.(${list}),p2_player_id.in.(${list})`)
    .order("updated_at", { ascending: false });
  return error ? [] : data || [];
}
/* 끝난 공식 배틀의 관전 로그(포켓몬 기록의 선출과 선봉). 선출과 선봉은 무대에 나온 포켓몬이라 관전 로그로 전체 로그와 똑같이 센다.
   전체 로그는 파티 공개 전에 읽을 수 없다. 무효가 된 배틀은 세지 않는다. 공식 경기 수만큼이라 작다.
   ponytail: 한 번에 300판까지 읽는다. 넘으면 서버에서 집계한 표로 바꾼다. */
export async function listOfficialBattleLogs() {
  if (!supa) return [];
  const { data, error } = await supa.from("battles").select("id, spectator_log, p1_player_id, p2_player_id, winner")
    .eq("kind", "official").eq("status", "ended").neq("ended_by", "void").order("updated_at", { ascending: false }).limit(300);
  return error ? [] : (data || []).map(({ spectator_log, ...row }) => ({ ...row, log: spectator_log }));
}

// 끝난 공식 배틀의 승자를 대진표에 다시 넣는다(실패 뒤, 또는 함수가 끝과 반영 사이에서 멈췄을 때). 배틀 자신의 사실로만 정해진다.
export const retryBattleApply = id => callFunction("battle", { action: "apply", id });
// 운영진: 더 이어지지 않는 공식 배틀을 닫는다. 기다리던 배틀은 지우고, 진행 중이던 배틀은 무효로 끝나 관전 로그가 리플레이로 남는다.
export async function voidBattle(id) {
  const { data, error } = await supa.rpc("battle_void", { p_id: id });
  if (error) throw new Error(error.message);
  return data;
}

// 대진표와 홈이 쓰는 배틀 주소
export const battleHref = id => `?view=battle&id=${encodeURIComponent(id)}`;
export const officialBattleHref = (eventId, nodeKey) => `?view=battle&event=${encodeURIComponent(eventId)}&match=${encodeURIComponent(nodeKey)}`;
/* 한 경기의 배틀: 열린 것이 먼저, 없으면 가장 최근에 끝난 것. 단일 토너먼트는 앞 경기의 승자가 바뀌면 같은 자리(node key)에
   다른 선수의 경기를 새로 만들므로, entries(그 경기의 두 출전 id)를 주면 두 선수가 그 경기의 선수인 배틀만 고른다. */
export function battlesForMatch(battles = [], nodeKey, entries = null) {
  const mine = battles.filter(b => b.source_node_key === nodeKey
    && (!entries || [b.p1_entry_id, b.p2_entry_id].filter(Boolean).every(id => entries.includes(id))));
  return [...mine.filter(b => b.status !== "ended"), ...mine.filter(b => b.status === "ended")];
}
export const battleForMatch = (battles, nodeKey, entries) => battlesForMatch(battles, nodeKey, entries)[0] || null;
// 배틀의 승자 출전 id(무승부와 무효는 null)
export const battleWinnerEntry = b => b?.winner === "p1" ? b.p1_entry_id : b?.winner === "p2" ? b.p2_entry_id : null;

export const isDoubles = formatId => /vgc/.test(String(formatId));

// 끝난 배틀을 게시판에 올릴 때 넘기는 글 초안(제목과 리플레이 주소). 게시판이 열면서 한 번 읽고 지운다.
export const BOARD_DRAFT_KEY = "ypl-board:incoming-draft:v1";
export function takeBoardDraft() {
  try {
    const draft = JSON.parse(sessionStorage.getItem(BOARD_DRAFT_KEY) || "null");
    sessionStorage.removeItem(BOARD_DRAFT_KEY);
    return draft && typeof draft.title === "string" ? draft : null;
  } catch { return null; }
}
