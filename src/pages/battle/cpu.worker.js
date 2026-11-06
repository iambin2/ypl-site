/* 컴퓨터와의 배틀 (src/services/battleCpu.js). 엔진과 컴퓨터가 이 워커에서 돌아 화면은 생각하는 동안에도 멈추지 않는다.
   서버와 DB에는 아무것도 남지 않는다. 화면은 입력 기록(시드와 모든 선택)을 이 기기에 두고, 다시 열면 그대로 다시 돌려 이어 간다.

   주고받는 말: start { formatid, name, team } · resume { inputLog } · choose { choice } · forfeit
   답은 { row, view, inputLog }(화면이 배틀 서버에서 받는 것과 같은 꼴). 컴퓨터가 고른 뒤 턴이 넘어가면 같은 꼴을 { push: true }로 보낸다. */
import { formatId, randomTeam, readout, replay, startBattle, choose, forfeit, validateTeam } from "../../../supabase/functions/battle/engine.mjs";
import { createCpu, quickChoice } from "../../services/battleCpu.js";

const CPU = "p2";
const CPU_NAME = "컴퓨터";
let battle = null, cpu = null, meta = null;

function snapshot() {
  const out = readout(battle);
  const status = out.ended ? "ended" : "active";
  const request = out.request.p1;
  return {
    inputLog: out.inputLog,
    row: {
      id: "cpu", kind: "cpu", regulation: meta.regulation, format_id: battle.format.id, status, p1_name: battle.p1.name, p2_name: battle.p2.name,
      turn: out.turn, winner: out.winner, ended_by: meta.endedBy || (out.ended ? "battle" : null), spectator_log: out.spectatorLog, created_at: meta.createdAt,
    },
    view: {
      side: "p1", status, turn: out.turn, winner: out.winner, request: out.ended ? null : request,
      // the player chose and the computer is still to: the screen waits as it waits for a person
      chosen: !out.ended && request && !request.wait && battle.p1.isChoiceDone() ? "chosen" : null,
      log: out.sideLog.p1,
    },
  };
}

/* the computer answers whatever the battle asks of it. A choice the engine refuses (never expected) falls back to the quick player.
   true when its choice completed a turn (the engine wrote it to the input log), so the screen has something new */
function think() {
  let moved = false;
  for (let i = 0; i < 6 && battle && !battle.ended; i++) {
    const req = battle[CPU].activeRequest;
    if (!req || req.wait || battle[CPU].isChoiceDone()) break;
    const before = battle.inputLog.length;
    let picked = null;
    try { picked = cpu.decide(battle, CPU); } catch (e) { console.error("cpu", e); }
    if (!picked || !choose(battle, null, CPU, picked).ok) choose(battle, null, CPU, quickChoice(battle, CPU));
    if (battle.inputLog.length === before) break;
    moved = true;
  }
  return moved;
}

function begin(next, info) {
  battle = next;
  meta = info;
  cpu = createCpu(battle.format.id);
}

const handlers = {
  start({ regulation, battleFormat, name, team }) {
    const formatid = formatId(regulation, battleFormat);
    const p1 = team === "random" ? randomTeam(formatid) : team;
    const problems = validateTeam(formatid, p1);
    if (problems) throw Object.assign(new Error("파티가 규정에 맞지 않습니다."), { problems });
    const seed = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x10000));
    const p2 = randomTeam(formatid, Math.random, { meta: true });
    begin(startBattle({ formatid, seed, p1: { name, team: p1 }, p2: { name: CPU_NAME, team: p2 } }), { regulation, createdAt: new Date().toISOString() });
    return snapshot();
  },
  resume({ inputLog, regulation, createdAt, endedBy }) {
    begin(replay(inputLog), { regulation, createdAt, endedBy });
    return snapshot();
  },
  choose({ choice }) {
    const done = choose(battle, null, "p1", String(choice));
    if (!done.ok) throw new Error(done.error?.replace(/^\[[^\]]+\]\s*/, "") || "고를 수 없는 선택입니다.");
    return snapshot();
  },
  forfeit() {
    forfeit(battle, "p1");
    meta.endedBy = "forfeit";
    return snapshot();
  },
};

self.onmessage = ({ data }) => {
  const { id, type, ...args } = data;
  try {
    self.postMessage({ id, ok: true, ...handlers[type](args) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e.message || String(e), problems: e.problems });
    return;
  }
  // the reply goes first; then the computer thinks, and a turn its choice completes is sent on its own
  if (battle && !battle.ended) setTimeout(() => { if (think()) self.postMessage({ push: true, ok: true, ...snapshot() }); }, 0);
};
