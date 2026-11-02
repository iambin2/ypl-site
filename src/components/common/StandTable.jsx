import React from "react";
import { Row } from "./Board.jsx";
import Button from "./Button.jsx";

/* 점수 순으로 정렬하고 같은 점수는 같은 순위, 다음 순위는 건너뛴다(6, 6, 8). */
export function rankRows(rows) {
  const sorted = [...(rows || [])].sort((a, b) => (b.points || 0) - (a.points || 0));
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || (row.points || 0) !== (sorted[i - 1].points || 0)) rank = i + 1;
    return { ...row, rank };
  });
}

const SHOWN = 12;
/* 0인 성적은 쓰지 않는다: "우승 2, 4강 1" */
const recordLine = (r) => [["우승", r.win], ["준우승", r.ru], ["4강", r.top4]].filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(", ");

/* A ranking (DESIGN.md "Records"): rows of 52 under a 32 head strip, the rank at 20, the points at 20 with 점. The record holder inverts,
   only when one stands alone at the top; tied ranks read 1, 1, 1 with a grey sentence under the stack saying how many share it.
   The record line (우승 2, 4강 1) and a note stand under the name. rows are raw; they are ranked here. */
export default function StandTable({ rows, total, onName, open = false, onMore }) {
  const ranked = rankRows(rows);
  if (!ranked.length) return null;
  const shown = open ? ranked : ranked.slice(0, SHOWN);
  const tops = ranked.filter((r) => r.rank === 1).length;
  const seen = new Map();
  return (<>
    <div className="rank-th t12 mute" aria-hidden="true"><span>순위</span><span>트레이너</span><span>점수</span></div>
    <div className="stack rank-rows">
      {shown.map((r) => {
        const n = (seen.get(r.name) || 0) + 1; seen.set(r.name, n);
        const line = [recordLine(r), r.note].filter(Boolean).join(", ");
        return <Row key={`${r.name}#${n}`} className={tops === 1 && r.rank === 1 ? "inv" : ""} lead={<span className="num t20">{r.rank}</span>} title={r.name} line={line || undefined}
          value={<><span className="num t20">{(r.points || 0).toLocaleString("ko-KR")}</span><span className="t12 dim">점</span></>}
          onClick={onName ? (e) => onName(r.name, e.currentTarget) : undefined} label={`${r.rank}위 ${r.name}, ${r.points || 0}점`} />;
      })}
    </div>
    {tops > 1 && <p className="rank-tie t12 mute reg">{tops}명이 공동 1위입니다.</p>}
    {!open && ranked.length > SHOWN && onMore && <div className="rank-more"><Button variant="second" onClick={onMore}>{total || ranked.length}명 전체 보기</Button></div>}
  </>);
}
