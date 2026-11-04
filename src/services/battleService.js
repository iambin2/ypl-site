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
export const chooseInBattle = (id, choice) => asSeat(id, "choose", { choice });
export const forfeitBattle = id => asSeat(id, "forfeit");
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
// 끝난 배틀의 전체 로그(리플레이와 통계)
export async function readBattleLog(id) {
  const { data, error } = await supa.from("battles").select("log, input_log").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
// 바뀌었는지만 묻는 가벼운 읽기. 화면은 이 값이 오를 때만 전체를 다시 읽는다.
// ponytail: 1.5초마다 묻는 방식이다. 동시에 보는 사람이 많아지면 Supabase Realtime으로 바꾼다.
export async function readBattleVersion(id) {
  const { data, error } = await supa.from("battles").select("version").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.version ?? null;
}

// 한 대회의 공식 배틀(대진표, 홈의 지금 경기). 배틀 표가 아직 없는 환경에서는 빈 목록이다.
export async function listEventBattles(eventId) {
  if (!supa || !eventId) return [];
  const { data, error } = await supa.from("battles").select(LIST).eq("event_id", eventId).order("updated_at", { ascending: false });
  return error ? [] : data || [];
}
// 선수들의 끝난 공식 배틀(트레이너 기록)
export async function listPlayerBattles(playerIds = []) {
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!supa || !ids.length) return [];
  const list = ids.join(",");
  const { data, error } = await supa.from("battles").select(LIST)
    .eq("kind", "official").eq("status", "ended").or(`p1_player_id.in.(${list}),p2_player_id.in.(${list})`)
    .order("updated_at", { ascending: false }).limit(50);
  return error ? [] : data || [];
}
// 끝난 공식 배틀의 로그 전부(포켓몬 기록의 선출과 선봉). 공식 경기 수만큼이라 작다.
// ponytail: 한 번에 300판까지 읽는다. 넘으면 서버에서 집계한 표로 바꾼다.
export async function listOfficialBattleLogs() {
  if (!supa) return [];
  const { data, error } = await supa.from("battles").select("id, log, p1_player_id, p2_player_id, winner")
    .eq("kind", "official").eq("status", "ended").order("updated_at", { ascending: false }).limit(300);
  return error ? [] : data || [];
}

// 대진표와 홈이 쓰는 배틀 주소
export const battleHref = id => `?view=battle&id=${encodeURIComponent(id)}`;
export const officialBattleHref = (eventId, nodeKey) => `?view=battle&event=${encodeURIComponent(eventId)}&match=${encodeURIComponent(nodeKey)}`;
// 한 경기의 배틀: 열린 것이 먼저, 없으면 가장 최근에 끝난 것
export function battleForMatch(battles = [], nodeKey) {
  const mine = battles.filter(b => b.source_node_key === nodeKey);
  return mine.find(b => b.status !== "ended") || mine[0] || null;
}

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
