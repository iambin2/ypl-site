// 사이트 안 배틀. 엔진(engine.mjs)은 여기서만 돌고, 방문자는 좌석 토큰으로 자기 자리에서만 고른다.
// 공개 행(battles)은 누구나 읽고, 엔진 상태와 토큰 해시(battle_secrets)는 이 함수만 읽는다. 쓰기는 battle_create, battle_save 뿐이다.
// 배포: npm run build:battle 로 엔진을 한 파일로 묶은 뒤
//   npx supabase functions deploy battle --use-api --no-verify-jwt --project-ref rqffrogcverfjqzjasax
// (엔진 패키지를 Supabase가 받아 묶게 두면 배포가 내부 오류로 실패했다. 요청은 토큰으로 확인하므로 JWT 검사가 필요 없다.)
import { createClient } from "npm:@supabase/supabase-js@2";
import { ENGINE, formatId, validateTeam, startBattle, loadBattle, choose, forfeit, readout } from "./engine.bundle.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
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

async function read(id: string) {
  const [{ data: battle }, { data: secret }] = await Promise.all([
    db.from("battles").select("*").eq("id", id).maybeSingle(),
    db.from("battle_secrets").select("*").eq("battle_id", id).maybeSingle(),
  ]);
  if (!battle || !secret) refuse(404, "배틀을 찾을 수 없습니다.");
  return { battle, secret };
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

// What a player sees: their request, their own log with their secrets, and whether their choice is waiting on the other side.
function playerView(row: { status: string; winner: string | null }, secret: { state: object; pending: Record<string, string> }, side: string) {
  const out = readout(loadBattle(secret.state));
  return {
    side, status: row.status, turn: out.turn, winner: row.winner ?? out.winner,
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
      return { token, ...playerView({ status: "active", winner: null }, { state, pending: {} }, "p2") };
    });
  },

  async view({ id, token }) {
    const { battle, secret } = await read(String(id));
    const side = await seat(secret, token);
    if (!secret.state) return { side, status: battle.status, turn: 0, winner: null, request: null, chosen: null, log: "" };
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
        return playerView(battle, { state: secret.state, pending }, side);
      }
      const out = readout(engine);
      const state = engine.toJSON();
      const ended = out.ended ? { p_status: "ended", p_winner: out.winner, p_ended_by: "battle", p_log: out.log, p_input_log: out.inputLog } : {};
      if (!(await save(battle.id, battle.version, { p_turn: out.turn, p_spectator_log: out.spectatorLog, p_state: state, p_pending: {}, ...ended }))) return undefined;
      return playerView({ status: out.ended ? "ended" : "active", winner: out.winner }, { state, pending: {} }, side);
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
      return playerView({ status: "ended", winner: out.winner }, { state, pending: {} }, side);
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
