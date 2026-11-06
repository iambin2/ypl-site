// 사이트 안 배틀. 엔진(engine.mjs)은 여기서만 돌고, 방문자는 좌석 토큰으로 자기 자리에서만 고른다.
// 공개 행(battles)은 누구나 읽고, 엔진 상태와 토큰 해시(battle_secrets)는 이 함수만 읽는다. 쓰기는 battles.sql 과 battle_links.sql 의 함수로만 한다.
// 공식 경기는 그 경기 선수의 신청 이름과 제출 비밀번호로 앉고, 끝나면 승자가 운영진의 선택과 같은 계산으로 대진표에 들어간다.
// 배포: npm run build:battle 로 엔진을 한 파일로 묶은 뒤
//   npx supabase functions deploy battle --use-api --no-verify-jwt --project-ref rqffrogcverfjqzjasax
// (엔진 패키지를 Supabase가 받아 묶게 두면 배포가 내부 오류로 실패했다. 요청은 토큰으로 확인하므로 JWT 검사가 필요 없다.)
import { createClient } from "npm:@supabase/supabase-js@2";
import { ENGINE, formatId, validateTeam, randomTeam, startBattle, loadBattle, choose, forfeit, readout, readCpuRecord, replay, CPU_NAME, planMatchWinner, projectRuntimeFacts } from "./engine.bundle.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  // every choice is a JSON POST, so the browser asks first; it may keep the answer (Chrome up to 2 hours, Safari 10 minutes)
  // instead of paying that extra round trip (100 to 500 ms measured) before each one
  "Access-Control-Max-Age": "86400",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class Refusal extends Error { constructor(public status: number, message: string, public extra: object = {}) { super(message); } }
const refuse = (status: number, message: string, extra = {}) => { throw new Refusal(status, message, extra); };

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL_BASE, SERVICE_KEY);

/* Work that finishes after the answer has gone, so the player is not kept waiting on it. The runtime keeps the worker alive until it
   is done (EdgeRuntime.waitUntil); where there is no such runtime (a local run) it simply runs on. */
const later = (work: Promise<unknown>) => {
  const settled = work.catch(error => console.error(error));
  (globalThis as any).EdgeRuntime?.waitUntil?.(settled);
};

/* A battle moved: every screen on it (both seats and the watchers, src/services/battleSignal.js) is told at once through a Realtime
   broadcast on battle:<id>, instead of finding out on its next poll (1.5 s apart, 0.75 s late on average). The signal carries no
   secret and decides nothing: a screen that hears it reads the public row as it would on a poll, and the polls go on as before, so a
   lost signal costs only the time it would have saved. moved: the engine ran (the spectator log grew), so a seat needs its own view. */
function signal(id: string, version: number | null, moved = false) {
  later(fetch(`${URL_BASE}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ topic: `battle:${id}`, event: "moved", payload: { version, moved }, private: false }] }),
  }));
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

const cleanName = (name: unknown) => {
  const value = String(name ?? "").trim();
  if (value.length < 1 || value.length > 20) refuse(400, "이름은 1자에서 20자로 입력해 주세요.");
  return value;
};
// "random": the engine draws a random party (a random battle); anything else is a party checked as it was brought
function checkTeam(formatid: string, team: unknown) {
  if (team === "random") return randomTeam(formatid);
  const problems = validateTeam(formatid, team);
  if (problems) refuse(422, "파티가 규정에 맞지 않습니다.", { problems });
  return team;
}

/* The public row and its secrets in one query, so one snapshot: two separate reads could see a save between them (the
   version after it, the state before it) and a choice would then be applied to the old state under the new version.
   Only the columns the actions use; the logs stay in the database. */
async function read(id: string) {
  const { data, error } = await db.from("battles")
    .select("id, kind, status, version, format_id, p1_name, winner, room, battle_secrets(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  const secret = Array.isArray(data?.battle_secrets) ? data.battle_secrets[0] : data?.battle_secrets;
  if (!data || !secret) refuse(404, "배틀을 찾을 수 없습니다.");
  return { battle: data, secret };
}

async function seat(secret: { p1_token_hash: string; p2_token_hash: string | null }, token: unknown) {
  const hash = await sha256(String(token ?? ""));
  if (hash === secret.p1_token_hash) return "p1";
  if (hash === secret.p2_token_hash) return "p2";
  return refuse(403, "이 배틀의 선수만 고를 수 있습니다.");
}

async function save(id: string, version: number, fields: Record<string, unknown>) {
  const args = {
    p_id: id, p_version: version, p_status: null, p_p2_name: null, p_turn: null, p_winner: null, p_ended_by: null,
    p_spectator_log: null, p_log: null, p_input_log: null, p_p2_token_hash: null, p_state: null, p_pending: null,
    ...fields,
  };
  const { data, error } = await db.rpc("battle_save", args);
  if (error) throw error;
  if (data === true) signal(id, version + 1, fields.p_spectator_log != null);
  return data === true;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}

// An official party as it was submitted (team_snapshot_members): Showdown ids throughout, the points in the EV fields.
type Member = { pokemonId: string; pokemonName: string; ability: string; nature: string; item: string | null; moves: (string | null)[]; statPoints: Record<string, number> };
const officialTeam = (members: Member[]) => members.map(m => ({
  name: "", species: m.pokemonId || m.pokemonName, ability: m.ability || "", nature: m.nature || "serious",
  item: m.item || "", moves: (m.moves || []).filter(Boolean), evs: m.statPoints, level: 50,
}));
const SEAT_REFUSAL: Record<string, [number, string]> = {
  no_event: [404, "대회를 찾을 수 없습니다."],
  not_running: [409, "진행 중인 개인전 대회의 경기만 배틀로 치를 수 있습니다."],
  not_formed: [409, "아직 두 선수가 정해지지 않은 경기입니다."],
  decided: [409, "이미 승자가 정해진 경기입니다."],
  not_player: [403, "이 경기의 선수를 골라 주세요."],
  wrong_pin: [403, "제출 비밀번호가 맞지 않습니다."],
  locked: [429, "비밀번호를 여러 번 틀려 15분 동안 잠겼습니다."],
  no_pin: [403, "제출 비밀번호를 아직 정하지 않았습니다. 신청 수정에서 숫자 4자리를 정해 주세요."],
  no_team: [409, "제출한 공식 파티가 없습니다. 파티를 먼저 제출해 주세요."],
  qualifier_done: [409, "본선 진출 인원이 확정되어 이 선발전 경기는 치르지 않습니다."],
};

const APPLY_REFUSAL: Record<string, string> = {
  decided: "운영진이 먼저 이 경기의 승자를 정했습니다.",
  players_changed: "대진이 바뀌어 이 경기의 두 선수가 배틀의 두 선수와 다릅니다.",
  not_running: "진행 중인 대회가 아닙니다.",
  no_entry: "배틀의 선수 정보가 비어 있습니다.",
};

/* An official battle's winner goes into the bracket the way an operator's pick does: the same calculation
   (bracketWinnerPlan.js) on the bracket as it stands, written by one locked transaction. If the bracket moved meanwhile the
   database answers stale and this reads and plans again. What cannot be applied is kept on the battle for the operators. */
async function applyResult(battleId: string) {
  try {
    for (let tries = 0; tries < 3; tries++) {
      const { data: battle } = await db.from("battles").select("*").eq("id", battleId).maybeSingle();
      if (!battle || battle.kind !== "official" || battle.applied_at || battle.status !== "ended" || battle.ended_by === "void") return;
      const winnerEntryId = battle.winner === "p1" ? battle.p1_entry_id : battle.winner === "p2" ? battle.p2_entry_id : null;
      if (!winnerEntryId) throw new Error("무승부라 승자를 넣지 않았습니다.");
      const facts = await rpc("battle_bracket_facts", { p_event_id: battle.event_id });
      if (facts?.status !== "ok") throw new Error("대진표를 찾을 수 없습니다.");
      const ok = (data: unknown) => ({ data, error: null });
      const projected = projectRuntimeFacts(facts.runtime, facts.event, {
        slots: ok(facts.slots), entries: ok(facts.entries), participants: ok(facts.participants),
        matches: ok(facts.matches), registrations: ok(facts.registrations),
      });
      const loserEntryId = battle.winner === "p1" ? battle.p2_entry_id : battle.p1_entry_id;
      if (!loserEntryId) throw new Error("배틀의 선수 정보가 비어 있습니다.");
      const plan = planMatchWinner(projected, battle.source_node_key, winnerEntryId, new Date().toISOString(), loserEntryId);
      const result = await rpc("battle_apply_result", {
        p_battle_id: battleId, p_expected_stamp: facts.stamp, p_mode: plan.mode, p_runtime_id: plan.runtimeId,
        p_updates: plan.updates || [], p_inserts: plan.inserts || [], p_delete_ids: plan.deleteIds || [],
      });
      if (result === "ok" || result === "already") { signal(battleId, null); return; }
      if (result !== "stale") throw new Error(APPLY_REFUSAL[result] || `대진표에 넣지 못했습니다 (${result}).`);
    }
    throw new Error("대진표가 계속 바뀌어 넣지 못했습니다.");
  } catch (error) {
    console.error(error);
    await db.rpc("battle_mark_apply_error", { p_battle_id: battleId, p_error: String((error as Error)?.message || error) });
    signal(battleId, null);
  }
}

// What a player sees: their request, their own log with their secrets, and whether their choice is waiting on the other side.
// version is the public row's version this view is of, so the screen does not ask again when its poll reaches that version.
/* out: the readout of the engine in that state. A caller that has just run the engine passes its own readout instead of loading the
   state it has just written (one engine load less on every choice; tests/battleEngine.test.mjs holds the two to be the same). */
function playerView(row: { status: string; winner: string | null; version: number }, secret: { state: object; pending: Record<string, string> }, side: string, out = readout(loadBattle(secret.state))) {
  return {
    side, version: row.version, status: row.status, turn: out.turn, winner: row.winner ?? out.winner,
    request: row.status === "active" ? out.request[side] : null,
    chosen: secret.pending?.[side] ?? null,
    log: out.sideLog[side],
  };
}

// Two choices arriving together race on the version: the later one reads again and applies on top. Three tries is plenty for two players.
async function withRetry<T>(fn: () => Promise<T | undefined>) {
  for (let tries = 0; tries < 3; tries++) {
    const result = await fn();
    if (result !== undefined) return result;
  }
  return refuse(409, "다른 선택과 겹쳤습니다. 다시 시도해 주세요.");
}

/* A friendly room (docs/db/battle_rooms.sql): an open one stands on the battle page's list of open rooms, a code one is entered with
   four digits its opener passes on. A code is unique among the rooms still waiting. */
const newCode = () => String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, "0");
async function waitingRoom(code: string) {
  const { data, error } = await db.from("battle_secrets").select("battle_id, battles!inner(status)")
    .eq("room_code", code).eq("battles.status", "waiting").limit(1);
  if (error) throw error;
  return data?.[0]?.battle_id as string | undefined;
}

/* a friendly battle opened with its first player in it (create, and the first press of 다시하기) */
async function openBattle({ regulation, formatid, name, team, room }: { regulation: string; formatid: string; name: string; team: unknown; room: unknown }) {
  const sets = checkTeam(formatid, team);
  const id = newId();
  const token = newToken();
  const base = {
    p_id: id, p_regulation: regulation, p_format_id: formatid, p_engine: ENGINE,
    p_p1_name: name, p_p1_token_hash: await sha256(token), p_p1_team: sets,
  };
  let code: string | null = null;
  if (room === "code") {
    for (let tries = 0; tries < 20 && !code; tries++) { const next = newCode(); if (!(await waitingRoom(next))) code = next; }
    if (!code) refuse(429, "열린 방이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.");
  }
  const { error } = room === "open" || room === "code"
    ? await db.rpc("battle_create_room", { ...base, p_room: room, p_room_code: code })
    : await db.rpc("battle_create", base);
  if (error) refuse(error.code === "P0001" ? 429 : 500, error.code === "P0001" ? error.message : "배틀을 열지 못했습니다.");
  return { id, token, side: "p1", ...(code ? { code } : {}) };
}

/* the second player sits down and the battle starts (join, and the second press of 다시하기); undefined when a save came between */
async function seatSecond(battle: Record<string, any>, secret: Record<string, any>, p2: string, team: unknown, token: string) {
  if (p2 === battle.p1_name) refuse(400, "상대와 다른 이름을 입력해 주세요.");
  const sets = checkTeam(battle.format_id, team);
  const engine = startBattle({ formatid: battle.format_id, p1: { name: battle.p1_name, team: secret.p1_team }, p2: { name: p2, team: sets } });
  const out = readout(engine);
  const state = engine.toJSON();
  const saved = await save(battle.id, battle.version, {
    p_status: "active", p_p2_name: p2, p_turn: out.turn, p_spectator_log: out.spectatorLog,
    p_p2_token_hash: await sha256(token), p_state: state, p_pending: {},
  });
  if (!saved) return undefined;
  return { token, ...playerView({ status: "active", winner: null, version: battle.version + 1 }, { state, pending: {} }, "p2", out) };
}
const readOr = async (id: string) => { try { return await read(id); } catch (e) { if (e instanceof Refusal && e.status === 404) return null; throw e; } };

const actions: Record<string, (body: Record<string, any>, again?: boolean) => Promise<unknown>> = {
  async create({ regulation, battleFormat, name, team, room }) {
    let formatid = "";
    try { formatid = formatId(String(regulation), String(battleFormat)); } catch { refuse(400, "알 수 없는 규정입니다."); }
    return openBattle({ regulation: String(regulation), formatid, name: cleanName(name), team, room });
  },

  /* A seat's screen asks this while its player thinks (src/pages/BattlePage.jsx). A worker of this function lives about 75 seconds
     (measured 2026-11-07: shut down 75 s after boot whatever the traffic), and the first request on a new one took 0.6 to 1.5 s
     against 0.2 to 0.3 s warm. This request pays that instead of a choice: it starts the worker, opens its database connection and
     loads the battle's engine state, and answers nothing. */
  async warm({ id }) {
    const found = id ? await readOr(String(id)) : null;
    if (found?.secret?.state) readout(loadBattle(found.secret.state));
    return {};
  },

  // a code room's id, for the code its opener passed on
  async room({ code }) {
    const value = String(code ?? "");
    if (!/^[0-9]{4}$/.test(value)) refuse(400, "방 코드는 숫자 4자리입니다.");
    const id = await waitingRoom(value);
    if (!id) refuse(404, "그 코드의 방이 없습니다. 코드를 확인해 주세요.");
    return { id };
  },

  async join({ id, name, team, code }) {
    const p2 = cleanName(name);
    const token = newToken();
    return withRetry(async () => {
      const { battle, secret } = await read(String(id));
      if (battle.kind === "official") refuse(409, "공식 경기는 대진표의 경기에서 참가해 주세요.");
      if (battle.status !== "waiting") refuse(409, "이미 시작된 배틀입니다.");
      // ponytail: four digits with no limit on tries; a friendly room has nothing to take, add a per-battle try count if that changes
      if (battle.room === "code" && String(code ?? "") !== secret.room_code) refuse(403, "방 코드가 맞지 않습니다.");
      return seatSecond(battle, secret, p2, team, token);
    });
  },

  /* 다시하기 (docs/db/battle_rematch.sql): either player of an ended friendly battle asks. The first to ask opens the next battle
     (a code room, so it stands on no list and no one else comes in) with the same rule and format and writes it on the ended one;
     the other, asking next, sits down in it and it starts. Each plays under the name they played under; the party is the one they
     send, and a random party is drawn again. A rematch that was cancelled, or has already been played, is replaced by a new one. */
  async rematch({ id, token, team }, again = false) {
    const { battle, secret } = await read(String(id));
    const side = await seat(secret, token);
    if (battle.kind !== "friendly") refuse(409, "친선 배틀만 다시 할 수 있습니다.");
    if (battle.status !== "ended") refuse(409, "끝난 배틀만 다시 할 수 있습니다.");
    const { data: row, error } = await db.from("battles").select("regulation, p2_name, rematch_id").eq("id", battle.id).maybeSingle();
    if (error || !row) refuse(503, "다시하기를 아직 쓸 수 없습니다.");
    const mine = side === "p1" ? battle.p1_name : row.p2_name;
    const next = row.rematch_id ? await readOr(row.rematch_id) : null;
    if (next && next.battle.status === "waiting" && next.battle.p1_name !== mine) {
      const fresh = newToken();
      const view = await withRetry(async () => {
        const now = await read(row.rematch_id);
        if (now.battle.status !== "waiting") refuse(409, "다시하기 배틀이 이미 시작되었습니다.");
        return seatSecond(now.battle, now.secret, mine, team, fresh);
      });
      return { id: row.rematch_id, side: "p2", joined: true, ...view };
    }
    // the one this player opened is still waiting, or already being played: the screen goes to it
    if (next && next.battle.p1_name === mine && next.battle.status !== "ended") return { id: row.rematch_id, side: "p1", mine: true };
    const made = await openBattle({ regulation: row.regulation, formatid: battle.format_id, name: mine, team, room: "code" });
    if (await rpc("battle_set_rematch", { p_id: battle.id, p_rematch: made.id, p_expected: row.rematch_id ?? null })) { signal(battle.id, null); return made; }
    // the other asked in the same moment and was written first: ours goes, and theirs is taken
    await rpc("battle_cancel", { p_id: made.id });
    if (again) refuse(409, "다른 요청과 겹쳤습니다. 다시 시도해 주세요.");
    return actions.rematch({ id, token, team }, true);
  },

  async view({ id, token }) {
    const { battle, secret } = await read(String(id));
    const side = await seat(secret, token);
    if (!secret.state) return { side, version: battle.version, status: battle.status, turn: 0, winner: null, request: null, chosen: null, log: "" };
    return playerView(battle, secret, side);
  },

  // rq: requestKey of the request the choice answers (engine.mjs). A client without it is still served, unchecked.
  async choose({ id, token, choice, rq }) {
    return withRetry(async () => {
      const { battle, secret } = await read(String(id));
      const side = await seat(secret, token);
      if (battle.status !== "active") refuse(409, "진행 중인 배틀이 아닙니다.");
      const engine = loadBattle(secret.state);
      const result = choose(engine, secret.pending, side, String(choice ?? ""), rq == null ? undefined : String(rq));
      if (result.stale) refuse(409, "선택할 차례가 바뀌었습니다. 새 선택지에서 다시 골라 주세요.");
      if (!result.ok) refuse(400, "고를 수 없는 선택입니다.", { reason: result.error });
      if (!result.committed) {
        const pending = { ...secret.pending, [side]: String(choice) };
        if (!(await save(battle.id, battle.version, { p_pending: pending }))) return undefined;
        return playerView({ ...battle, version: battle.version + 1 }, { state: secret.state, pending }, side);
      }
      const out = readout(engine);
      const state = engine.toJSON();
      const ended = out.ended ? { p_status: "ended", p_winner: out.winner, p_ended_by: "battle", p_log: out.log, p_input_log: out.inputLog } : {};
      if (!(await save(battle.id, battle.version, { p_turn: out.turn, p_spectator_log: out.spectatorLog, p_state: state, p_pending: {}, ...ended }))) return undefined;
      // the bracket line is written after the answer: the ended screen reads applied_at (or apply_error) when it comes, as it always has
      if (out.ended) later(applyResult(battle.id));
      return playerView({ status: out.ended ? "ended" : "active", winner: out.winner, version: battle.version + 1 }, { state, pending: {} }, side, out);
    });
  },

  async forfeit({ id, token }) {
    return withRetry(async () => {
      const { battle, secret } = await read(String(id));
      const side = await seat(secret, token);
      if (battle.status !== "active") refuse(409, "진행 중인 배틀이 아닙니다.");
      const engine = loadBattle(secret.state);
      forfeit(engine, side);
      const out = readout(engine);
      const state = engine.toJSON();
      const saved = await save(battle.id, battle.version, {
        p_status: "ended", p_winner: out.winner, p_ended_by: "forfeit", p_turn: out.turn, p_spectator_log: out.spectatorLog,
        p_log: out.log, p_input_log: out.inputLog, p_state: state, p_pending: {},
      });
      if (!saved) return undefined;
      later(applyResult(battle.id));
      return playerView({ status: "ended", winner: out.winner, version: battle.version + 1 }, { state, pending: {} }, side, out);
    });
  },

  // The host takes back a battle nobody joined. Nothing was played, so nothing is kept.
  async cancel({ id, token }) {
    const { battle, secret } = await read(String(id));
    const side = await seat(secret, token);
    if (side !== "p1" || battle.status !== "waiting") refuse(409, "이미 시작된 배틀은 취소할 수 없습니다.");
    if (!(await rpc("battle_cancel", { p_id: battle.id }))) refuse(409, "이미 시작된 배틀은 취소할 수 없습니다.");
    signal(battle.id, null);
    return { cancelled: true };
  },

  /* Puts an ended official battle's winner in again: after a failure (the reason stays on the battle), or when the function
     stopped between the end and the bracket. Anyone may ask, since the battle's own facts decide everything. */
  async apply({ id }) {
    await applyResult(String(id ?? ""));
    const { data } = await db.from("battles").select("applied_at, apply_error").eq("id", String(id ?? "")).maybeSingle();
    if (!data) refuse(404, "배틀을 찾을 수 없습니다.");
    return data;
  },

  /* A finished battle with the computer, kept for the computer to learn from (docs/db/cpu_battles.sql). Every fact is read off the
     replay here; a record that does not replay is refused. recorded false: the site is taking too many just now, nothing more. */
  async record({ inputLog }) {
    let facts;
    try { facts = readCpuRecord(inputLog); } catch { refuse(422, "배틀 기록을 읽지 못했습니다."); }
    const text = facts.inputLog;
    const id = await sha256(text);
    const recorded = await rpc("cpu_battle_record", {
      p_id: id, p_format_id: facts.formatid, p_engine: ENGINE, p_winner: facts.winner,
      p_ended_by: facts.endedBy, p_turns: facts.turns, p_input_log: text,
    });
    // id: the kept record's, the address of its replay (cpureplay)
    return { recorded: recorded === true, id };
  },

  /* A finished battle with the computer as a replay anyone with its link can watch (?view=battle&replay=…, 리플레이 공유): played
     again from its kept record by this engine. The record never held the player's name, so the replay names them 선수. */
  async cpureplay({ id }) {
    const key = String(id ?? "");
    if (!/^[0-9a-f]{64}$/.test(key)) refuse(404, "리플레이를 찾을 수 없습니다.");
    const { data } = await db.from("cpu_battles").select("format_id, winner, ended_by, turns, input_log, created_at").eq("id", key).maybeSingle();
    if (!data) refuse(404, "리플레이를 찾을 수 없습니다.");
    const battle = replay(data.input_log);
    return { row: { id: key, kind: "cpu", status: "ended", format_id: data.format_id, winner: data.winner, ended_by: data.ended_by, turn: data.turns,
      p1_name: battle.p1.name, p2_name: CPU_NAME, spectator_log: readout(battle).spectatorLog, created_at: data.created_at, updated_at: data.created_at } };
  },

  /* ---------- the clock (docs/db/battle_timer.sql; DESIGN.md "Battle", The clock) ----------
     The waiting player's screen asks once the deadline has passed. The battle ends on time only when, by this server's clock, the
     deadline is gone and the other side alone still owes a choice; the late side loses as by a forfeit (>forcelose in the input
     log, so the replay plays the same). Nothing is ever chosen for a player. Before that SQL runs there is no deadline to pass. */
  async timeout({ id, token }) {
    return withRetry(async () => {
      const { battle, secret } = await read(String(id));
      const side = await seat(secret, token);
      if (battle.status !== "active") refuse(409, "진행 중인 배틀이 아닙니다.");
      // read on its own, so the function still runs before battle_timer.sql adds the column (there is no deadline to pass then)
      const { data: clock } = await db.from("battles").select("deadline_at").eq("id", battle.id).maybeSingle();
      const deadline = Date.parse(clock?.deadline_at ?? "");
      if (!Number.isFinite(deadline) || Date.now() < deadline + 1000) refuse(409, "아직 시간이 남았습니다.");
      const late = side === "p1" ? "p2" : "p1";
      const engine = loadBattle(secret.state);
      const { request } = readout(engine);
      const owes = (s: string) => Boolean(request[s] && !request[s].wait && !secret.pending?.[s]);
      if (!owes(late) || owes(side)) refuse(409, "시간이 다 된 쪽이 없습니다.");
      forfeit(engine, late);
      const out = readout(engine);
      const state = engine.toJSON();
      const saved = await save(battle.id, battle.version, {
        p_status: "ended", p_winner: out.winner, p_ended_by: "timeout", p_turn: out.turn, p_spectator_log: out.spectatorLog,
        p_log: out.log, p_input_log: out.inputLog, p_state: state, p_pending: {},
      });
      if (!saved) return undefined;
      later(applyResult(battle.id));
      return playerView({ status: "ended", winner: out.winner, version: battle.version + 1 }, { state, pending: {} }, side, out);
    });
  },

  /* An official match: a player of that match takes their side's seat with their party PIN, and plays their
     latest official party. The first one in opens the battle, the second starts it. The same player again (another phone)
     gets a new token for the same seat. */
  async official({ eventId, nodeKey, side, pin }) {
    const seatInfo = await rpc("battle_official_seat", {
      p_event_id: String(eventId ?? ""), p_source_node_key: String(nodeKey ?? ""), p_side: String(side ?? ""), p_pin: String(pin ?? ""),
    });
    if (seatInfo?.status !== "ok") {
      const [status, message] = SEAT_REFUSAL[seatInfo?.status] || [500, "잠시 뒤 다시 시도해 주세요."];
      refuse(status, message);
    }
    // an event played in Pokémon Champions (the default) has no site battles: its results are entered by the operators
    const { data: event } = await db.schema("ypl_schema_validation").from("events").select("competition_settings").eq("id", String(eventId)).maybeSingle();
    const matchPlay = event?.competition_settings?.matchPlay;
    if (matchPlay !== "site" && matchPlay !== "random") refuse(409, "이 대회는 포켓몬 챔피언스로 경기를 치릅니다. 결과는 운영진이 대진표에 넣습니다.");
    let formatid = "";
    try { formatid = formatId(seatInfo.regulation, seatInfo.battleFormat); } catch { refuse(409, "이 대회의 규정은 사이트 배틀이 아직 지원하지 않습니다."); }
    // a random battle event plays a random party drawn for this seat; otherwise the latest official party
    const team = checkTeam(formatid, matchPlay === "random" ? "random" : officialTeam(seatInfo.team));
    const token = newToken();
    const hash = await sha256(token);
    return withRetry(async () => {
      const { data: open } = await db.from("battles").select("*")
        .eq("event_id", String(eventId)).eq("source_node_key", String(nodeKey)).in("status", ["waiting", "active"]).maybeSingle();
      if (!open) {
        const id = newId();
        const { error } = await db.rpc("battle_create_official", {
          p_id: id, p_regulation: seatInfo.regulation, p_format_id: formatid, p_engine: ENGINE, p_p1_name: seatInfo.registrationName,
          p_p1_token_hash: hash, p_p1_team: team, p_event_id: String(eventId), p_source_node_key: String(nodeKey),
          p_p1_entry_id: seatInfo.entryId, p_p1_player_id: seatInfo.playerId,
        });
        if (error?.code === "23505") return undefined; // the other player opened it a moment earlier: read again
        if (error) throw error;
        return { id, token, side: "p1" };
      }
      const mine = open.p1_entry_id === seatInfo.entryId ? "p1" : open.p2_entry_id === seatInfo.entryId ? "p2" : null;
      if (mine) {
        await rpc("battle_set_seat", { p_id: open.id, p_side: mine, p_entry_id: null, p_player_id: null, p_token_hash: hash });
        return { id: open.id, token, side: mine };
      }
      if (open.status !== "waiting") refuse(409, "이미 진행 중인 배틀입니다.");
      const { data: secret } = await db.from("battle_secrets").select("*").eq("battle_id", open.id).maybeSingle();
      const engine = startBattle({ formatid: open.format_id, p1: { name: open.p1_name, team: secret.p1_team }, p2: { name: seatInfo.registrationName, team } });
      const out = readout(engine);
      // the start, the second entry and the engine state go in together, so a failure never leaves a battle nobody can enter
      const saved = await rpc("battle_start_official", {
        p_id: open.id, p_version: open.version, p_p2_name: seatInfo.registrationName, p_turn: out.turn, p_spectator_log: out.spectatorLog,
        p_p2_token_hash: hash, p_state: engine.toJSON(), p_p2_entry_id: seatInfo.entryId, p_p2_player_id: seatInfo.playerId,
      });
      if (saved !== true) return undefined;
      signal(open.id, open.version + 1, true);
      return { id: open.id, token, side: "p2" };
    });
  },
};

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "요청을 읽지 못했습니다." }); }
  const action = actions[String(body?.action)];
  if (!action) return reply(400, { error: "알 수 없는 요청입니다." });
  try {
    return reply(200, await action(body));
  } catch (error) {
    if (error instanceof Refusal) return reply(error.status, { error: error.message, ...error.extra });
    console.error(error);
    return reply(500, { error: "잠시 뒤 다시 시도해 주세요." });
  }
});
