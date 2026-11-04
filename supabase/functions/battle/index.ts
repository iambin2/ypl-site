// 사이트 안 배틀. 엔진(engine.mjs)은 여기서만 돌고, 방문자는 좌석 토큰으로 자기 자리에서만 고른다.
// 공개 행(battles)은 누구나 읽고, 엔진 상태와 토큰 해시(battle_secrets)는 이 함수만 읽는다. 쓰기는 battles.sql 과 battle_links.sql 의 함수로만 한다.
// 공식 경기는 그 경기 선수의 신청 이름과 제출 비밀번호로 앉고, 끝나면 승자가 운영진의 선택과 같은 계산으로 대진표에 들어간다.
// 배포: npm run build:battle 로 엔진을 한 파일로 묶은 뒤
//   npx supabase functions deploy battle --use-api --no-verify-jwt --project-ref rqffrogcverfjqzjasax
// (엔진 패키지를 Supabase가 받아 묶게 두면 배포가 내부 오류로 실패했다. 요청은 토큰으로 확인하므로 JWT 검사가 필요 없다.)
import { createClient } from "npm:@supabase/supabase-js@2";
import { ENGINE, formatId, validateTeam, startBattle, loadBattle, choose, forfeit, readout, planMatchWinner, projectRuntimeFacts } from "./engine.bundle.mjs";

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

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");

const cleanName = (name: unknown) => {
  const value = String(name ?? "").trim();
  if (value.length < 1 || value.length > 20) refuse(400, "이름은 1자에서 20자로 입력해 주세요.");
  return value;
};
function checkTeam(formatid: string, team: unknown) {
  const problems = validateTeam(formatid, team);
  if (problems) refuse(422, "파티가 규정에 맞지 않습니다.", { problems });
  return team;
}

/* The public row and its secrets in one query, so one snapshot: two separate reads could see a save between them (the
   version after it, the state before it) and a choice would then be applied to the old state under the new version.
   Only the columns the actions use; the logs stay in the database. */
async function read(id: string) {
  const { data, error } = await db.from("battles")
    .select("id, kind, status, version, format_id, p1_name, winner, battle_secrets(*)").eq("id", id).maybeSingle();
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
  no_pin: [403, "공식 파티를 제출한 선수만 배틀로 치를 수 있습니다."],
  no_team: [409, "제출한 공식 파티가 없습니다. 파티를 먼저 제출해 주세요."],
};

/* An official battle's winner goes into the bracket the way an operator's pick does: the same calculation
   (bracketWinnerPlan.js) on the bracket as it stands, written by one locked transaction. If the bracket moved meanwhile the
   database answers stale and this reads and plans again. What cannot be applied is kept on the battle for the operators. */
async function applyResult(battleId: string) {
  try {
    for (let tries = 0; tries < 3; tries++) {
      const { data: battle } = await db.from("battles").select("*").eq("id", battleId).maybeSingle();
      if (!battle || battle.kind !== "official" || battle.applied_at || battle.status !== "ended") return;
      const winnerEntryId = battle.winner === "p1" ? battle.p1_entry_id : battle.winner === "p2" ? battle.p2_entry_id : null;
      if (!winnerEntryId) throw new Error("무승부라 승자를 넣지 않았습니다.");
      const facts = await rpc("battle_bracket_facts", { p_event_id: battle.event_id });
      if (facts?.status !== "ok") throw new Error("대진표를 찾을 수 없습니다.");
      const ok = (data: unknown) => ({ data, error: null });
      const projected = projectRuntimeFacts(facts.runtime, facts.event, {
        slots: ok(facts.slots), entries: ok(facts.entries), participants: ok(facts.participants),
        matches: ok(facts.matches), registrations: ok(facts.registrations),
      });
      const plan = planMatchWinner(projected, battle.source_node_key, winnerEntryId, new Date().toISOString());
      const result = await rpc("battle_apply_result", {
        p_battle_id: battleId, p_expected_stamp: facts.stamp, p_mode: plan.mode, p_runtime_id: plan.runtimeId,
        p_updates: plan.updates || [], p_inserts: plan.inserts || [], p_delete_ids: plan.deleteIds || [],
      });
      if (result === "ok" || result === "already") return;
      if (result !== "stale") throw new Error(`대진표에 넣지 못했습니다 (${result}).`);
    }
    throw new Error("대진표가 계속 바뀌어 넣지 못했습니다.");
  } catch (error) {
    console.error(error);
    await db.rpc("battle_mark_apply_error", { p_battle_id: battleId, p_error: String((error as Error)?.message || error) });
  }
}

// What a player sees: their request, their own log with their secrets, and whether their choice is waiting on the other side.
// version is the public row's version this view is of, so the screen does not ask again when its poll reaches that version.
function playerView(row: { status: string; winner: string | null; version: number }, secret: { state: object; pending: Record<string, string> }, side: string) {
  const out = readout(loadBattle(secret.state));
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

const actions: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
  async create({ regulation, battleFormat, name, team }) {
    let formatid = "";
    try { formatid = formatId(String(regulation), String(battleFormat)); } catch { refuse(400, "알 수 없는 규정입니다."); }
    const p1 = cleanName(name);
    checkTeam(formatid, team);
    const id = newId();
    const token = newToken();
    const { error } = await db.rpc("battle_create", {
      p_id: id, p_regulation: regulation, p_format_id: formatid, p_engine: ENGINE,
      p_p1_name: p1, p_p1_token_hash: await sha256(token), p_p1_team: team,
    });
    if (error) refuse(error.code === "P0001" ? 429 : 500, error.code === "P0001" ? error.message : "배틀을 열지 못했습니다.");
    return { id, token, side: "p1" };
  },

  async join({ id, name, team }) {
    const p2 = cleanName(name);
    const token = newToken();
    return withRetry(async () => {
      const { battle, secret } = await read(String(id));
      if (battle.kind === "official") refuse(409, "공식 경기는 대진표의 경기에서 참가해 주세요.");
      if (battle.status !== "waiting") refuse(409, "이미 시작된 배틀입니다.");
      if (p2 === battle.p1_name) refuse(400, "상대와 다른 이름을 입력해 주세요.");
      checkTeam(battle.format_id, team);
      const engine = startBattle({ formatid: battle.format_id, p1: { name: battle.p1_name, team: secret.p1_team }, p2: { name: p2, team } });
      const out = readout(engine);
      const state = engine.toJSON();
      const saved = await save(battle.id, battle.version, {
        p_status: "active", p_p2_name: p2, p_turn: out.turn, p_spectator_log: out.spectatorLog,
        p_p2_token_hash: await sha256(token), p_state: state, p_pending: {},
      });
      if (!saved) return undefined;
      return { token, ...playerView({ status: "active", winner: null, version: battle.version + 1 }, { state, pending: {} }, "p2") };
    });
  },

  async view({ id, token }) {
    const { battle, secret } = await read(String(id));
    const side = await seat(secret, token);
    if (!secret.state) return { side, version: battle.version, status: battle.status, turn: 0, winner: null, request: null, chosen: null, log: "" };
    return playerView(battle, secret, side);
  },

  async choose({ id, token, choice }) {
    return withRetry(async () => {
      const { battle, secret } = await read(String(id));
      const side = await seat(secret, token);
      if (battle.status !== "active") refuse(409, "진행 중인 배틀이 아닙니다.");
      const engine = loadBattle(secret.state);
      const result = choose(engine, secret.pending, side, String(choice ?? ""));
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
      if (out.ended) await applyResult(battle.id);
      return playerView({ status: out.ended ? "ended" : "active", winner: out.winner, version: battle.version + 1 }, { state, pending: {} }, side);
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
      await applyResult(battle.id);
      return playerView({ status: "ended", winner: out.winner, version: battle.version + 1 }, { state, pending: {} }, side);
    });
  },

  // The host takes back a battle nobody joined. Nothing was played, so nothing is kept.
  async cancel({ id, token }) {
    const { battle, secret } = await read(String(id));
    const side = await seat(secret, token);
    if (side !== "p1" || battle.status !== "waiting") refuse(409, "이미 시작된 배틀은 취소할 수 없습니다.");
    if (!(await rpc("battle_cancel", { p_id: battle.id }))) refuse(409, "이미 시작된 배틀은 취소할 수 없습니다.");
    return { cancelled: true };
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
    let formatid = "";
    try { formatid = formatId(seatInfo.regulation, seatInfo.battleFormat); } catch { refuse(409, "이 대회의 규정은 사이트 배틀이 아직 지원하지 않습니다."); }
    const team = checkTeam(formatid, officialTeam(seatInfo.team));
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
      const saved = await save(open.id, open.version, {
        p_status: "active", p_p2_name: seatInfo.registrationName, p_turn: out.turn, p_spectator_log: out.spectatorLog,
        p_p2_token_hash: hash, p_state: engine.toJSON(), p_pending: {},
      });
      if (!saved) return undefined;
      await rpc("battle_set_seat", { p_id: open.id, p_side: "p2", p_entry_id: seatInfo.entryId, p_player_id: seatInfo.playerId, p_token_hash: null });
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
