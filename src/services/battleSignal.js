import { SUPA_KEY, SUPA_URL } from "../storage.js";

/* 배틀이 움직였다는 신호 (supabase/functions/battle signal). 함수는 저장할 때마다 Realtime broadcast로 battle:<id>에 알린다.
   신호는 "지금 다시 읽어라"는 귀띔일 뿐이고 아무것도 정하지 않는다: 화면은 늘 공개 행과 자기 자리의 view를 읽고,
   소켓이 없거나 끊겨도 폴링(battlePollDelay)이 그대로 돈다. 그래서 신호를 잃으면 아낄 수 있던 시간만 잃는다.
   Phoenix 프로토콜을 직접 쓴다: 공개 채널 하나에 들어가 25초마다 심장 박동을 보내는 것이 전부라 라이브러리를 들이지 않는다.
   onSignal({ version, moved }): version은 새 version(모르면 null), moved는 엔진이 움직였는지(자리의 view를 새로 받아야 하는지). */
export function watchBattleSignal(id, onSignal) {
  if (!SUPA_URL || !SUPA_KEY || typeof WebSocket === "undefined") return () => {};
  const topic = `realtime:battle:${id}`;
  const url = `${SUPA_URL.replace(/^http/, "ws").replace(/\/?$/, "")}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPA_KEY)}&vsn=1.0.0`;
  let ws = null, beat = null, retry = null, closed = false, ref = 0;
  const send = (t, event, payload, join) => {
    if (ws?.readyState !== 1) return;
    ref += 1;
    ws.send(JSON.stringify({ topic: t, event, payload, ref: String(ref), ...(join ? { join_ref: String(ref) } : {}) }));
  };
  const open = () => {
    try { ws = new WebSocket(url); } catch { return; }
    ws.onopen = () => {
      send(topic, "phx_join", { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [], private: false } }, true);
      beat = setInterval(() => send("phoenix", "heartbeat", {}), 25_000);
    };
    ws.onmessage = event => {
      let m;
      try { m = JSON.parse(event.data); } catch { return; }
      if (m?.event === "broadcast" && m.topic === topic) onSignal(m.payload?.payload || {});
    };
    // a dropped socket comes back after a while; meanwhile the polls carry the battle as they did before there was a signal
    ws.onclose = () => { clearInterval(beat); if (!closed) retry = setTimeout(open, 5000); };
  };
  open();
  return () => { closed = true; clearTimeout(retry); clearInterval(beat); try { ws?.close(); } catch { /* 이미 닫혔다 */ } };
}
