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

/* room: "open" (on the list of open rooms) or "code" (entered with the four digits the opener passes on; docs/db/battle_rooms.sql).
   The code is kept with the seat, so the waiting screen can show it again after a reload. */
export async function createBattle({ regulation, battleFormat, name, team, room }) {
  const made = await callFunction("battle", { action: "create", regulation, battleFormat, name, team, room });
  keepSeat(made.id, { token: made.token, side: made.side, ...(made.code ? { code: made.code } : {}) });
  return made;
}
// a finished battle with the computer, kept on the server for the computer to learn from (docs/db/cpu_battles.sql)
export const recordCpuBattle = inputLog => callFunction("battle", { action: "record", inputLog });
// a kept battle with the computer as a replay anyone may watch (리플레이 공유): played again on the server from its record, as a row
export const readCpuReplay = id => callFunction("battle", { action: "cpureplay", id }).then(out => out.row);
export async function joinBattle(id, { name, team, code }) {
  const view = await callFunction("battle", { action: "join", id, name, team, code });
  keepSeat(id, { token: view.token, side: view.side });
  return view;
}
/* 다시하기 (docs/db/battle_rematch.sql): asked from a seat in an ended friendly battle. The answer is the next battle: opened by
   this player (waiting for the other, with its code), joined (it has started), or this player's own already (mine). The new seat is
   kept like any other, marked so its waiting screen says what it waits for. */
export async function rematchBattle(id, team) {
  const next = await asSeat(id, "rematch", { team });
  if (next.token) keepSeat(next.id, { token: next.token, side: next.side, rematch: true, ...(next.code ? { code: next.code } : {}) });
  return next;
}
// 공식 경기의 자리. 먼저 온 선수가 배틀을 열고, 다음 선수가 시작한다. 같은 선수가 다른 기기에서 오면 자리를 옮긴다.
// player: in a team bout (teamBouts.js) the member who plays it, since the side is their team's
export async function takeOfficialSeat({ eventId, nodeKey, side, pin, player = "" }) {
  const seat = await callFunction("battle", { action: "official", eventId, nodeKey, side, pin, ...(player ? { player } : {}) });
  keepSeat(seat.id, { token: seat.token, side: seat.side });
  return seat;
}
const asSeat = (id, action, extra = {}) => {
  const seat = readSeat(id);
  if (!seat) throw new Error("이 기기에는 이 배틀의 자리가 없습니다.");
  return callFunction("battle", { action, id, token: seat.token, ...extra });
};
/* 연승 도전 (docs/BATTLE_STREAK.md): an ended game's answer carries the run (streak: { wins, lives, status, won, foe }). The run rests
   (status active) after a won game, and after a lost one while a lamp is left (2026-11-10, the three lamps), until its player opens
   the next game (streakNextGame); the ended game's seat keeps what happened (wins: the wins before the next game, lives: the lamps
   left, won, ended: the run is over, foe: the sets a lost game was lost to), so its end screen and the tab's 이어서 하기 offer the next
   game again after a reload. A seat's own view of the game the run stands on carries the same (a game the clock ended while its
   player was away). */
/* the game of this device's run (the one being played, or the ended one the run rests on), so the tab offers 이어서 하기. A device
   keeps one run of the month and one of 오늘의 탑 (daily: the seat's day, or true for that kind) */
const STREAK_KEY = "ypl-battle:streak";
const keyOf = daily => (daily ? `${STREAK_KEY}:day` : STREAK_KEY);
export const currentStreakGame = (daily = false) => { try { return localStorage.getItem(keyOf(daily)) || null; } catch { return null; } };
const keepStreakGame = (id, daily = false) => { try { if (id) localStorage.setItem(keyOf(daily), id); else localStorage.removeItem(keyOf(daily)); } catch { /* 이어서 하기만 없다 */ } };
/* a run's draft while it waits to be picked (2026-11-11): { run, draft }, kept on the device for each kind so a reload finds it */
const DRAFT_KEY = "ypl-battle:streak-draft";
export const readStreakDraft = (daily = false) => { try { return JSON.parse(localStorage.getItem(`${DRAFT_KEY}${daily ? ":day" : ""}`) || "null"); } catch { return null; } };
export const keepStreakDraft = (made, daily = false) => { try { if (made) localStorage.setItem(`${DRAFT_KEY}${daily ? ":day" : ""}`, JSON.stringify(made)); else localStorage.removeItem(`${DRAFT_KEY}${daily ? ":day" : ""}`); } catch { /* the draft stands for this screen only */ } };
function keepRun(id, view) {
  const run = view?.streak;
  if (!run || view.status !== "ended") return view;
  const over = run.status !== "active";
  // a function from before the lamps says no won: there a run went on only after a win
  const won = run.won ?? !over;
  const seat = readSeat(id);
  if (over && currentStreakGame(seat?.daily) === id) keepStreakGame(null, seat?.daily);
  // doors: the doors to the next game ({ kind, species }), reach: how far up its trade goes (2026-11-11)
  if (seat) keepSeat(id, { ...seat, streak: true, wins: run.wins, lives: run.lives, won, ended: over, ...(run.foe ? { foe: run.foe } : {}), ...(run.doors ? { doors: run.doors, reach: run.reach ?? 0 } : {}) });
  return view;
}
export const viewBattle = id => asSeat(id, "view").then(view => keepRun(id, view));
// rq: 답하는 요청의 requestKey(battleLog.js). 서버는 이미 지난 요청에 대한 선택을 막는다.
export const chooseInBattle = (id, choice, rq) => asSeat(id, "choose", { choice, rq }).then(view => keepRun(id, view));
export const forfeitBattle = id => asSeat(id, "forfeit").then(view => keepRun(id, view));
/* a new run's first game (visitorAuth.js startStreakRun, made as the signed-in account): its seat is this device's. lives: the run's
   lamps as the database says them; before the lamps' SQL has run it says none, and no screen draws them */
export function keepStreakStart(made) {
  keepSeat(made.id, { token: made.token, side: made.side, streak: true, wins: 0, game: 1, lives: made.lives ?? made.run?.lives, daily: made.daily || null, party: made.party || null });
  keepStreakGame(made.id, made.daily);
  keepStreakDraft(null, made.daily);
  return made;
}
/* the account's run as the server answered it (resumeStreakRun) kept on this device: a game it did not hold takes its new seat, a
   draft replaces another run's, and a device whose run has ended drops its draft. Says whether anything changed */
export function keepStreakResume(made, daily = false) {
  const draft = readStreakDraft(daily);
  if (made?.token) {
    keepSeat(made.id, { token: made.token, side: made.side, streak: true, wins: made.wins, game: (made.wins ?? 0) + 1, lives: made.lives, daily: made.daily || null, party: made.party || null });
    keepStreakGame(made.id, daily);
    keepStreakDraft(null, daily);
    return true;
  }
  if (made?.draft) {
    if (draft?.run?.run_id === made.run.run_id) return false;
    keepStreakDraft({ run: made.run, draft: made.draft }, daily);
    return true;
  }
  if (made?.known) return false;
  /* no run of this kind on the server (ended on another device, or a 오늘의 탑 of an earlier day): the game this device remembers goes
     too, else its tab kept offering 이어서 하기 and the server refused it every time (2026-11-13) */
  const game = currentStreakGame(daily);
  if (!draft && !game) return false;
  keepStreakDraft(null, daily);
  keepStreakGame(null, daily);
  return true;
}
/* 다음 판 from an ended game the run rests on (won, or lost with a lamp left: then the same game again): asked by that game's seat (the
   battle function's streakNext), so it can always be asked again; a next game this device already opened is gone to instead of asked
   for twice. swap: { give, take } (species), one of ours for one of the party just beaten, one a won game, a new floor's included
   (streak.js swapParty) */
export async function streakNextGame(id, swap = null, door = 0) {
  const seat = readSeat(id);
  if (seat?.next && readSeat(seat.next)) return { id: seat.next, side: "p1" };
  const made = await asSeat(id, "streakNext", { ...(swap ? { swap } : {}), door });
  keepSeat(made.id, { token: made.token, side: made.side, streak: true, wins: made.wins, game: made.wins + 1, lives: made.lives, daily: seat?.daily || null, hard: Boolean(made.hard), party: made.party || seat?.party || null });
  if (seat) keepSeat(id, { ...readSeat(id), next: made.id });
  keepStreakGame(made.id, seat?.daily);
  return made;
}
/* 생각하는 동안 서버를 데운다 (battle 함수 warm). 함수의 워커는 약 75초마다 새로 뜨고, 새 워커의 첫 요청은 0.6~1.5초가 걸린다.
   이 요청이 그 시간을 대신 치러, 고른 수는 데워진 워커에서 0.2~0.3초에 돌아온다. 실패해도 아무 일도 없다. */
export const warmBattle = id => callFunction("battle", { action: "warm", id }).catch(() => {});
// 다른 기기가 이 자리를 가져갔을 때: 이 기기는 관전한다
export const forgetSeat = id => keepSeat(id, null);
export async function cancelBattle(id) {
  await asSeat(id, "cancel");
  keepSeat(id, null);
}

const PUBLIC = "id, regulation, format_id, engine, status, p1_name, p2_name, turn, winner, ended_by, spectator_log, version, created_at, updated_at, kind, event_id, source_node_key, p1_entry_id, p2_entry_id, p1_player_id, p2_player_id, applied_at, apply_error, run_id";
const LIST = "id, status, p1_name, p2_name, turn, winner, ended_by, kind, event_id, source_node_key, p1_entry_id, p2_entry_id, p1_player_id, p2_player_id, applied_at, apply_error, updated_at";

// 공개 행. 진행 중에는 관전 로그만, 끝나면 전체 로그와 입력 기록까지 있다.
/* Three columns come with later SQL: room (docs/db/battle_rooms.sql), rematch_id (docs/db/battle_rematch.sql) and deadline_at
   (docs/db/battle_timer.sql; read with the row, so a battle's update is one read instead of two in a row). A visitor reads the
   battles table column by column (battle_integration.sql grants each), so a column is unreadable both before its SQL runs (42703, no
   such column) and while it is not granted (42501). Either way the row is read without it, and what needs it stands aside, so a
   battle room never stops on its loader (2026-11-06: room was not granted, and every room waited forever). */
let roomsSupported = true;
let rematchSupported = true;
let clockSupported = true;
const unreadable = error => ["42703", "42501"].includes(String(error?.code)) || /\b(room|rematch_id|deadline_at)\b/.test(error?.message || "");
const selectRow = (id, cols) => supa.from("battles").select([PUBLIC, ...cols].join(", ")).eq("id", id).maybeSingle();
export async function readBattleRow(id) {
  if (!supa) return null;
  const extras = [roomsSupported && "room", rematchSupported && "rematch_id", clockSupported && "deadline_at"].filter(Boolean);
  let { data, error } = await selectRow(id, extras);
  if (error && unreadable(error) && extras.length) {
    // find which one cannot be read, so the others still work
    for (const col of extras) {
      const rest = extras.filter(c => c !== col);
      ({ data, error } = await selectRow(id, rest));
      if (!error) { if (col === "room") roomsSupported = false; else if (col === "rematch_id") rematchSupported = false; else clockSupported = false; break; }
    }
    if (error && unreadable(error)) { roomsSupported = false; rematchSupported = false; clockSupported = false; ({ data, error } = await selectRow(id, [])); }
  }
  if (error) throw new Error(error.message);
  return data;
}
export const canRematch = () => rematchSupported;
/* 중계 of a 연승 도전 run: its games in order (battles.run_id, granted by docs/db/streak_runs.sql), each { id, status, winner }. A run
   goes on after a lost game too while a lamp is left (2026-11-10), so a game's place in the list is not its wins: the screens read
   the wins before each game and the lamps left off the winners (streak.js runTrack; this module imports nothing but the storage,
   tests/battlePoll.test.mjs loads it alone).
   ponytail: a run's games older than last month are deleted (streak_start), which would undercount a run that long; the run's wins
   as a public column is the upgrade */
/* a run's lamps and state as anyone watching reads them (streak_run_public, 2026-11-11): { wins, lives, status, daily }, or null before
   the SQL has run */
export async function readRunState(battleId) {
  if (!supa || !battleId) return null;
  const { data, error } = await supa.rpc("streak_run_public", { p_battle_id: battleId });
  return error ? null : data;
}
export async function runGames(runId) {
  if (!supa || !runId) return [];
  const { data, error } = await supa.from("battles").select("id, status, winner").eq("run_id", runId).order("created_at");
  return error ? [] : data || [];
}
// ponytail: the newest 200 of the last 30 minutes, filtered and paged on the device; filter and page on the server if rooms outgrow that
export async function listOpenRooms() {
  if (!supa || !roomsSupported) return [];
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await supa.from("battles").select("id, regulation, format_id, p1_name, room, created_at")
    .eq("status", "waiting").in("room", ["open", "code"]).gte("created_at", since).order("created_at", { ascending: false }).limit(200);
  if (error && unreadable(error)) roomsSupported = false;
  return error ? [] : data || [];
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
export function battlePollDelay(row, idleMs, seated = false) {
  if (row === null) return null;
  if (row?.status === "ended") {
    if (row.kind === "official") return !row.applied_at && !row.apply_error ? 4500 : null;
    // a seat in an ended friendly battle keeps reading it a while, so the other player's 다시하기 reaches it
    return seated && rematchSupported && !row.rematch_id && idleMs < 600_000 ? 3000 : null;
  }
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
