import { callFunction, supa } from "../storage.js";

/* 사이트 안 배틀(친선전)의 통로. 엔진은 battle Edge Function 안에서만 돈다(supabase/functions/battle).
   좌석 토큰은 이 기기의 localStorage에만 둔다: 토큰을 가진 기기가 그 자리의 선수다. */
const SEATS_KEY = "ypl-battle:seats:v1";

export function readSeat(id) {
  try { return JSON.parse(localStorage.getItem(SEATS_KEY) || "{}")[id] || null; } catch { return null; }
}
function keepSeat(id, seat) {
  try {
    const seats = JSON.parse(localStorage.getItem(SEATS_KEY) || "{}");
    seats[id] = seat;
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
const asSeat = (id, action, extra = {}) => {
  const seat = readSeat(id);
  if (!seat) throw new Error("이 기기에는 이 배틀의 자리가 없습니다.");
  return callFunction("battle", { action, id, token: seat.token, ...extra });
};
export const viewBattle = id => asSeat(id, "view");
export const chooseInBattle = (id, choice) => asSeat(id, "choose", { choice });
export const forfeitBattle = id => asSeat(id, "forfeit");

// 공개 행. 진행 중에는 관전 로그만, 끝나면 전체 로그와 입력 기록까지 있다.
export async function readBattleRow(id) {
  if (!supa) return null;
  const { data, error } = await supa.from("battles")
    .select("id, regulation, format_id, engine, status, p1_name, p2_name, turn, winner, ended_by, spectator_log, version, created_at")
    .eq("id", id).maybeSingle();
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

export const isDoubles = formatId => /vgc/.test(String(formatId));
