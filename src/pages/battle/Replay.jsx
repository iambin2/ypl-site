import React, { useEffect, useState } from "react";
import { Row, SectionHead, Status } from "../../components/common/Board.jsx";
import Button from "../../components/common/Button.jsx";
import Icon from "../../components/common/Icon.jsx";
import { battleHref, endedByLine, isDoubles, readSeat } from "../../services/battleService.js";
import { battleHistoryIds, forgetBattles, listBattlesById } from "../../services/battleWatch.js";
import { siteConfirm } from "../../components/common/SiteDialog.jsx";
import { createBattleReader } from "../../services/battleLog.js";
import { formatDate } from "../../services/dateFormat.js";
import { stopIndex } from "../../services/battleReplay.js";

/* 리플레이와 다시 찾기 (DESIGN.md "Battle", Replay; Finding a battle again).
   끝난 배틀은 무대 아래의 리플레이 줄로 처음, 이전 턴, 재생, 다음 턴, 끝을 오가고, 막대를 끌어 원하는 턴으로 간다. */

const stopWord = s => (s.end ? "끝" : s.turn === 0 ? "선출" : `${s.turn}턴`);

// the replay's controls stand back under the stage: small round keys with their signs and a thin track to drag to any turn
const KEY = { sound: "M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7l-1.4-1.4a3 3 0 0 0 0-4.2zM18.4 6a8.5 8.5 0 0 1 0 12L17 16.6a6.5 6.5 0 0 0 0-9.2z", mute: "M4 9h4l5-4v14l-5-4H4zM15.3 9.4l1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1z", first: "M6 6h2v12H6zM18 6l-9 6 9 6z", prev: "M16 6l-9 6 9 6z", play: "M8 5l11 7-11 7z", pause: "M8 5h3v14H8zM13 5h3v14h-3z", next: "M8 6l9 6-9 6z", last: "M16 6h2v12h-2zM6 6l9 6-9 6z" };
// each key names its keyboard key too (replayKey below), as Showdown's replays answer to theirs
const Key = ({ d, label, keys, hint, ...rest }) => <button type="button" className="bt-rkey" aria-label={label} title={`${label} (${hint})`} aria-keyshortcuts={keys} {...rest}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg></button>;
/* live: a battle still being played (중계), true while the stage follows it: its last key is 실시간, lit with the amber lamp while it
   stands there and the main key once the watcher went back, to come back. The track is the replay's own, nothing added to it */
export function ReplayBar({ stops, at, playing, onJump, onStep, onPlay, sound, awake, onSound, live, onLive }) {
  const i = stopIndex(stops, at);
  const last = stops.length - 1;
  const following = live === true;
  const prev = at > stops[i].at ? i : Math.max(0, i - 1);
  return (
    <div className="bt-replay" role="group" aria-label="리플레이">
      <Key d={KEY.first} label="처음" keys="Home" hint="Home" onClick={() => onJump(stops[0].at)} disabled={at <= stops[0].at} />
      <Key d={KEY.prev} label="이전 턴" keys="ArrowLeft" hint="←" onClick={() => onJump(stops[prev].at)} disabled={at <= stops[0].at} />
      <Key d={playing ? KEY.pause : KEY.play} label={playing ? "일시정지" : live !== undefined ? "재생" : i >= last ? "처음부터 재생" : "재생"} keys="Space" hint="Space" aria-pressed={playing} onClick={onPlay}
        disabled={following} className={"bt-rkey main" + (playing ? " on" : "")} />
      <Key d={KEY.next} label="다음 턴" keys="ArrowRight" hint="→" onClick={onStep} disabled={following || i >= last} />
      {live === undefined ? <Key d={KEY.last} label="끝" keys="End" hint="End" onClick={() => onJump(stops[last].at)} disabled={i >= last} />
        : <button type="button" className={"bt-rkey bt-rlive" + (following ? " on-air" : " main")} onClick={following ? undefined : onLive} aria-pressed={following} title="실시간 (End)">
          {following && <i className="lamp sig" aria-hidden="true" />}실시간</button>}
      {/* where the replay stands, read as any player's scrubber: a rail lit as far as it has played and a square handle where it
          stands, dragged to any turn. The head's turn counter says the number, so no word stands beside it */}
      <span className="bt-replay-track" style={{ "--p": last ? i / last : 1 }}>
        <span className="bt-replay-rail" aria-hidden="true"><i /><span className="bt-replay-at"><b /></span></span>
        <input type="range" min="0" max={last} step="1" value={following ? last : i} onChange={e => { const k = Number(e.target.value); if (live !== undefined && k >= last) onLive(); else onJump(stops[k].at); }}
          aria-label="리플레이 위치" aria-valuetext={stopWord(stops[i])} />
      </span>
      {/* the sound, as Showdown's replays keep it with the playback: lit while the page is still silent and waits for a press */}
      <Key d={sound && awake ? KEY.sound : KEY.mute} label={sound && awake ? "소리 끄기" : "소리 켜기"} keys="M" hint="m"
        onClick={onSound} className={"bt-rkey" + (sound && !awake ? " main" : "")} />
    </div>
  );
}

/* the replay's keyboard, after Showdown's replays (k, j, l, Shift for first and last, < > for speed, m for sound) with the arrows,
   Home and End beside them. A key typed into a field, with a modifier, or a space on a focused key is left to the page */
const REPLAY_KEYS = { " ": "play", k: "play", ArrowLeft: "prev", j: "prev", ArrowRight: "next", l: "next", Home: "first", J: "first", End: "last", L: "last", "<": "slower", ">": "faster", m: "sound" };
export function replayKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return null;
  const t = e.target;
  if (t?.closest?.("input, textarea, select, [contenteditable], dialog, [role=dialog]")) return null;
  if (e.key === " " && t?.closest?.("button, summary, a, [role=button]")) return null;
  return REPLAY_KEYS[e.key] || null;
}

// the replay as a text file: the game's own words turn by turn, then Showdown's protocol, which any Showdown reader can play
export function downloadReplay({ row, log, res, perspective, names }) {
  const reader = createBattleReader({ text: res.text, moves: res.detail.moves, pokedex: res.detail.pokedex, perspective });
  const out = [
    `${names.p1} 대 ${names.p2}`,
    `${row.kind === "official" ? "공식" : row.kind === "cpu" ? "컴퓨터와의" : "친선"} 배틀, ${isDoubles(row.format_id) ? "더블" : "싱글"}, ${formatDate(row.created_at)}`,
    row.winner === "tie" ? "무승부" : row.winner ? `${names[row.winner]} 승리` : "",
    // a battle with the computer has no page of its own to link to
    row.kind === "cpu" ? "" : new URL(battleHref(row.id), window.location.href).href,
  ];
  for (const line of String(log).split("\n")) {
    const { lines, event } = reader.read(line);
    if (event?.verb === "turn") out.push("", `${event.turn}턴`);
    out.push(...lines);
  }
  out.push("", "쇼다운 기록", String(log));
  const url = URL.createObjectURL(new Blob([out.join("\n")], { type: "text/plain;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `ypl-battle-${row.id}.txt` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- finding a battle again: the ones being played now, and the ones this device played or watched ---------- */
const kindLine = b => [b.kind === "official" ? "공식" : "친선", isDoubles(b.format_id) ? "더블" : "싱글", formatDate(b.updated_at), b.turn ? `${b.turn}턴` : ""].filter(Boolean).join(", ");
function result(b) {
  if (b.status === "waiting") return <span className="t12 dim">대기</span>;
  if (b.status === "active") return <Status live>진행 중</Status>;
  const side = readSeat(b.id)?.side;
  if (!side || b.winner === "tie") return <span className="t12 dim">{b.winner === "tie" ? "무승부" : "종료"}</span>;
  const won = b.winner === side;
  return <span className={"rc-place t12" + (won ? " inv" : " dim")}>{won ? "승리" : "패배"}</span>;
}
function BattleRows({ rows, onOpen }) {
  return <div className="stack">
    {rows.map(b => <Row key={b.id} title={`${b.p1_name} 대 ${b.p2_name || "상대 대기"}`}
      line={[kindLine(b), endedByLine(b)].filter(Boolean).join(", ")}
      value={result(b)} onClick={() => onOpen(b.id)}
      label={`${b.p1_name} 대 ${b.p2_name || "상대 대기"}, ${b.status === "active" ? "관전" : b.status === "ended" ? "리플레이 보기" : "열기"}`} />)}
  </div>;
}
export function BattleLists({ onOpen, onCleared }) {
  const [mine, setMine] = useState([]);
  useEffect(() => {
    let on = true;
    listBattlesById(battleHistoryIds()).then(rows => on && setMine(rows));
    return () => { on = false; };
  }, []);
  /* 기록 삭제 picks before it deletes (2026-11-06): the link turns the rows into checks (a 20 square leading each), 취소 leaves. Only
     a battle that is over can be picked: one still waiting or being played keeps its seat, so it stands muted without a check. Under
     the list 전체 선택 and the delete key join on the seam at 1 to 1.618, and the delete asks once. */
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const open = b => b.status === "waiting" || b.status === "active";
  const done = mine.filter(b => !open(b));
  const toggle = id => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = done.length > 0 && done.every(b => picked.has(b.id));
  const leave = () => { setPicking(false); setPicked(new Set()); };
  const remove = async () => {
    const ids = done.filter(b => picked.has(b.id)).map(b => b.id);
    if (!ids.length) return;
    if (!(await siteConfirm({ title: `배틀 기록 ${ids.length}개를 지울까요?`, body: "이 기기의 목록에서만 지웁니다. 서버의 리플레이는 남습니다.", confirmLabel: "삭제", danger: true }))) return;
    forgetBattles(ids);
    const gone = new Set(ids);
    setMine(list => list.filter(b => !gone.has(b.id)));
    leave();
    onCleared?.();
  };
  return <>
    {mine.length > 0 && <section className="bt-list" aria-labelledby="bt-mine-h">
      <SectionHead id="bt-mine-h" title="이 기기의 배틀" link={picking ? "취소" : done.length ? "기록 삭제" : undefined} onLink={picking ? leave : () => setPicking(true)} />
      {picking ? <>
        <div className="stack" role="group" aria-label="지울 배틀">
          {mine.map(b => {
            const can = !open(b), on = picked.has(b.id);
            return <Row key={b.id} className={"bt-pickrow" + (can ? "" : " off")} title={`${b.p1_name} 대 ${b.p2_name || "상대 대기"}`}
              line={can ? [kindLine(b), endedByLine(b)].filter(Boolean).join(", ") : "진행 중이거나 대기 중인 배틀은 남습니다"}
              lead={<span className={"box" + (on ? " on" : "")} aria-hidden="true">{on && <Icon n="check" size={16} />}</span>}
              value={result(b)} onClick={can ? () => toggle(b.id) : undefined}
              label={can ? `${b.p1_name} 대 ${b.p2_name || "상대 대기"}, ${on ? "선택됨" : "선택 안 됨"}` : undefined} />;
          })}
        </div>
        <div className="bt-pickkeys">
          <Button onClick={() => setPicked(all ? new Set() : new Set(done.map(b => b.id)))}>{all ? "선택 해제" : "전체 선택"}</Button>
          <Button onClick={remove} disabled={!picked.size}>{picked.size ? `${picked.size}개 삭제` : "삭제"}</Button>
        </div>
      </> : <BattleRows rows={mine} onOpen={onOpen} />}
    </section>}
  </>;
}
