import React, { useEffect, useState } from "react";
import { Row, SectionHead, Status } from "../../components/common/Board.jsx";
import { battleHref, isDoubles, readSeat } from "../../services/battleService.js";
import { battleHistoryIds, listBattlesById, listLiveBattles } from "../../services/battleWatch.js";
import { createBattleReader } from "../../services/battleLog.js";
import { formatDate } from "../../services/dateFormat.js";
import { stopIndex } from "../../services/battleReplay.js";

/* 리플레이와 다시 찾기 (DESIGN.md "Battle", Replay; Finding a battle again).
   끝난 배틀은 무대 아래의 리플레이 줄로 처음, 이전 턴, 재생, 다음 턴, 끝을 오가고, 막대를 끌어 원하는 턴으로 간다. */

const stopWord = s => (s.end ? "끝" : s.turn === 0 ? "선출" : `${s.turn}턴`);

// the replay's keys: a bar on its track to drag to any turn, then five keys in a row of small actions; playing inverts its key
export function ReplayBar({ stops, at, playing, onJump, onStep, onPlay }) {
  const i = stopIndex(stops, at);
  const last = stops.length - 1;
  const prev = at > stops[i].at ? i : Math.max(0, i - 1);
  return (
    <div className="bt-replay">
      <span className="tb-bar bt-replay-bar">
        <i style={{ transform: `scaleX(${last ? i / last : 1})` }} />
        <input type="range" min="0" max={last} step="1" value={i} onChange={e => onJump(stops[Number(e.target.value)].at)}
          aria-label="리플레이 위치" aria-valuetext={stopWord(stops[i])} />
      </span>
      <div className="stack bt-replay-keys" role="group" aria-label="리플레이">
        <button type="button" className="pn t15" onClick={() => onJump(stops[0].at)} disabled={at <= stops[0].at}>처음</button>
        <button type="button" className="pn t15" onClick={() => onJump(stops[prev].at)} disabled={at <= stops[0].at}>이전 턴</button>
        <button type="button" className={(playing ? "inv" : "pn") + " t15"} aria-pressed={playing} onClick={onPlay}>{playing ? "일시정지" : "재생"}</button>
        <button type="button" className="pn t15" onClick={onStep} disabled={i >= last}>다음 턴</button>
        <button type="button" className="pn t15" onClick={() => onJump(stops[last].at)} disabled={i >= last}>끝</button>
      </div>
    </div>
  );
}

// the replay as a text file: the game's own words turn by turn, then Showdown's protocol, which any Showdown reader can play
export function downloadReplay({ row, log, res, perspective, names }) {
  const reader = createBattleReader({ text: res.text, moves: res.detail.moves, perspective });
  const out = [
    `${names.p1} 대 ${names.p2}`,
    `${row.kind === "official" ? "공식" : "친선"} 배틀, ${isDoubles(row.format_id) ? "더블" : "싱글"}, ${formatDate(row.created_at)}`,
    row.winner === "tie" ? "무승부" : row.winner ? `${names[row.winner]} 승리` : "",
    new URL(battleHref(row.id), window.location.href).href,
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
      line={[kindLine(b), b.ended_by === "forfeit" ? "기권" : b.ended_by === "timeout" ? "시간 초과" : ""].filter(Boolean).join(", ")}
      value={result(b)} onClick={() => onOpen(b.id)}
      label={`${b.p1_name} 대 ${b.p2_name || "상대 대기"}, ${b.status === "active" ? "관전" : b.status === "ended" ? "리플레이 보기" : "열기"}`} />)}
  </div>;
}
export function BattleLists({ onOpen }) {
  const [live, setLive] = useState([]);
  const [mine, setMine] = useState([]);
  useEffect(() => {
    let on = true;
    listLiveBattles().then(rows => on && setLive(rows));
    listBattlesById(battleHistoryIds()).then(rows => on && setMine(rows));
    return () => { on = false; };
  }, []);
  return <>
    {live.length > 0 && <section className="bt-list" aria-labelledby="bt-live-h">
      <SectionHead id="bt-live-h" title="진행 중인 배틀" />
      <BattleRows rows={live} onOpen={onOpen} />
    </section>}
    {mine.length > 0 && <section className="bt-list" aria-labelledby="bt-mine-h">
      <SectionHead id="bt-mine-h" title="이 기기의 배틀" />
      <BattleRows rows={mine} onOpen={onOpen} />
    </section>}
  </>;
}
