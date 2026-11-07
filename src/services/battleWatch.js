import { callFunction, supa } from "../storage.js";
import { readSeat } from "./battleService.js";

/* 배틀을 다시 찾고 지켜보는 길 (DESIGN.md "Battle", Finding a battle again; The clock).
   계정이 없으므로 이 기기가 치르거나 본 배틀의 id를 localStorage에 남긴다(앉은 자리는 battleService의 좌석 목록에 따로 있다).
   공개 행은 누구나 읽는다. 시간 제한은 docs/db/battle_timer.sql이 실행된 뒤에만 있고, 그 전에는 마감이 늘 없다. */
const HISTORY_KEY = "ypl-battle:history:v1";
const SEATS_KEY = "ypl-battle:seats:v1";
const KEEP = 30;
const COLUMNS = "id, status, regulation, format_id, p1_name, p2_name, turn, winner, ended_by, kind, created_at, updated_at";

const readJSON = (key, empty) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? empty; } catch { return empty; } };

// a battle this device opened, joined or watched, newest first
export function rememberBattle(id) {
  if (!id) return;
  const list = readJSON(HISTORY_KEY, []).filter(x => x !== id);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify([id, ...list].slice(0, KEEP))); } catch { /* 목록 없이도 링크로 열린다 */ }
}
// every battle this device knows: the ones it remembered, and the seats it holds from before the list was kept
export function battleHistoryIds() {
  const ids = [...readJSON(HISTORY_KEY, []), ...Object.keys(readJSON(SEATS_KEY, {}))];
  return [...new Set(ids.filter(id => /^[a-z0-9]{12}$/.test(id)))].slice(0, KEEP * 2);
}

/* 이 기기의 배틀 기록 삭제 (chosen ones, 2026-11-06): the chosen battles leave the list and their seats are let go. The screen offers
   only battles that are over, since a seat in a battle still waiting or being played is how the player comes back to it; the battles
   themselves stay on the server. */
export function forgetBattles(ids) {
  const gone = new Set(ids);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(readJSON(HISTORY_KEY, []).filter(id => !gone.has(id))));
    const seats = readJSON(SEATS_KEY, {});
    localStorage.setItem(SEATS_KEY, JSON.stringify(Object.fromEntries(Object.entries(seats).filter(([id]) => !gone.has(id)))));
  } catch { /* 지우지 못하면 목록이 그대로 남는다 */ }
}

// those battles' public rows, newest first; a battle cancelled before it started is simply gone
export async function listBattlesById(ids) {
  if (!supa || !ids.length) return [];
  const { data, error } = await supa.from("battles").select(COLUMNS).in("id", ids).order("updated_at", { ascending: false });
  return error ? [] : data || [];
}
/* 중계: every battle being played now with its public log, so each is drawn as its two strips; one nobody has moved in half an
   hour is left out as abandoned. ponytail: the whole public log per
   row (tens of kilobytes) every 15 seconds; a summary column written by the battle function (each side's six, fainted, out, HP) is the
   upgrade once more than a few battles run at once */
export async function listLiveBoards() {
  if (!supa) return [];
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await supa.from("battles").select(`${COLUMNS}, spectator_log, event_id, source_node_key`).eq("status", "active").gte("updated_at", since)
    .order("updated_at", { ascending: false }).limit(30);
  return error ? [] : data || [];
}

// the deadline of the decision a battle waits on is read with its row (battleService.js readBattleRow)
// the waiting player tells the server the other's time is up; the server checks the deadline by its own clock and ends the battle
export function claimTimeout(id) {
  const seat = readSeat(id);
  if (!seat) return Promise.reject(new Error("이 기기에는 이 배틀의 자리가 없습니다."));
  return callFunction("battle", { action: "timeout", id, token: seat.token });
}
