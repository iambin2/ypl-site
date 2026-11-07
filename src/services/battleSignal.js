import { SUPA_KEY, SUPA_URL } from "../storage.js";

/* 배틀이 움직였다는 신호 (supabase/functions/battle signal). 함수는 저장할 때마다 Realtime broadcast로 battle:<id>에 알린다.
   신호는 "지금 다시 읽어라"는 귀띔일 뿐이고 아무것도 정하지 않는다: 화면은 늘 공개 행과 자기 자리의 view를 읽고,
   소켓이 없거나 끊겨도 폴링(battlePollDelay)이 그대로 돈다. 그래서 신호를 잃으면 아낄 수 있던 시간만 잃는다.
   Phoenix 프로토콜을 직접 쓴다: 공개 채널 하나에 들어가 25초마다 심장 박동을 보내는 것이 전부라 라이브러리를 들이지 않는다.
   onSignal({ version, moved }): version은 새 version(모르면 null), moved는 엔진이 움직였는지(자리의 view를 새로 받아야 하는지).
   관전자 수 (DESIGN.md "Battle", 중계): 같은 채널의 presence로 이 화면이 있다는 것만 알린다(자리가 없는 화면은 w: 1).
   onWatchers(n)는 지금 지켜보는 화면의 수를 받는다. 이름도 기기도 보내지 않는다. */
export function watchBattleSignal(id, onSignal, { watcher = false, onWatchers = null } = {}) {
  if (!SUPA_URL || !SUPA_KEY || typeof WebSocket === "undefined") return () => {};
  const topic = `realtime:battle:${id}`;
  const url = `${SUPA_URL.replace(/^http/, "ws").replace(/\/?$/, "")}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPA_KEY)}&vsn=1.0.0`;
  let ws = null, beat = null, retry = null, closed = false, ref = 0;
  // who is on the channel now, as presence tells it: key -> metas
  let here = {};
  const count = () => onWatchers?.(Object.values(here).reduce((n, metas) => n + metas.filter(m => m?.w === 1).length, 0));
  const send = (t, event, payload, join) => {
    if (ws?.readyState !== 1) return;
    ref += 1;
    ws.send(JSON.stringify({ topic: t, event, payload, ref: String(ref), ...(join ? { join_ref: String(ref) } : {}) }));
  };
  const open = () => {
    try { ws = new WebSocket(url); } catch { return; }
    ws.onopen = () => {
      send(topic, "phx_join", { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [], private: false } }, true);
      here = {};
      send(topic, "presence", { type: "presence", event: "track", payload: { w: watcher ? 1 : 0 } });
      beat = setInterval(() => send("phoenix", "heartbeat", {}), 25_000);
    };
    ws.onmessage = event => {
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      if (m?.topic !== topic) return;
      if (m.event === "broadcast") onSignal(m.payload?.payload || {});
      else if (m.event === "presence_state") { here = { ...m.payload }; Object.keys(here).forEach(k => { here[k] = here[k]?.metas || []; }); count(); }
      else if (m.event === "presence_diff") {
        for (const [k, v] of Object.entries(m.payload?.leaves || {})) { const gone = new Set((v?.metas || []).map(x => x.phx_ref)); here[k] = (here[k] || []).filter(x => !gone.has(x.phx_ref)); if (!here[k].length) delete here[k]; }
        // a join can come both in the first state and in a diff after it: one screen is counted once, by its ref
        for (const [k, v] of Object.entries(m.payload?.joins || {})) { const add = v?.metas || [], refs = new Set(add.map(x => x.phx_ref)); here[k] = [...(here[k] || []).filter(x => !refs.has(x.phx_ref)), ...add]; }
        count();
      }
    };
    // a dropped socket comes back after a while; meanwhile the polls carry the battle as they did before there was a signal
    ws.onclose = () => { clearInterval(beat); if (!closed) retry = setTimeout(open, 5000); };
  };
  open();
  return () => { closed = true; clearTimeout(retry); clearInterval(beat); try { ws?.close(); } catch { /* 이미 닫혔다 */ } };
}
