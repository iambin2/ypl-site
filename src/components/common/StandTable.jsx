import React from "react";
import { Podium, Row } from "./Board.jsx";
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

/* A ranking (DESIGN.md "Records"): the top three stand as the home's podium, and the table goes on from the fourth in rows of 52
   under a 32 head strip, the rank at 20, the points at 20 with 점. A tie reads in the podium's equal columns; only when more than
   three share first place does a grey sentence under the stack say how many. A tie in the table is named as the podium names it
   (공동 4), and the rank column widens to 84 for the whole table so the names keep one line. The record line (우승 2, 4강 1) and a note stand under
   the name. rows are raw; they are ranked here, unless placed: the 연승 도전's board comes ranked from the database (the same wins
   stand in the order they were reached, so no place is shared). unit and head say what the points count (연승). A row's live run
   carries the amber lamp with 도전 중, and its open (as the podium's) is its door. */
export default function StandTable({ rows, total, onName, open = false, onMore, shown: limit = SHOWN, placed = false, unit = "점", head = "점수" }) {
  const ranked = placed ? rows || [] : rankRows(rows);
  if (!ranked.length) return null;
  const rest = ranked.slice(3);
  const shown = open ? rest : rest.slice(0, limit);
  const tops = ranked.filter((r) => r.rank === 1).length;
  const seen = new Map();
  const per = new Map(); ranked.forEach((r) => per.set(r.rank, (per.get(r.rank) || 0) + 1));
  const tied = (r) => per.get(r.rank) > 1;
  const tie = shown.some(tied) ? " tie" : "";
  return (<>
    <Podium rows={ranked} onName={onName} unit={unit} />
    {rest.length > 0 && <>
      <div className={"rank-th t12 mute" + tie} aria-hidden="true"><span>순위</span><span>트레이너</span><span>{head}</span></div>
      <div className={"stack rank-rows" + tie}>
        {shown.map((r) => {
          const n = (seen.get(r.name) || 0) + 1; seen.set(r.name, n);
          const line = [recordLine(r), r.note].filter(Boolean).join(", ");
          return <Row key={`${r.name}#${n}`} lead={<span className="num t20">{tied(r) ? `공동 ${r.rank}` : r.rank}</span>} title={r.name} line={line || undefined}
            value={<><span className="num t20">{(r.points || 0).toLocaleString("ko-KR")}</span><span className="t12 dim">{unit}</span></>}
            lamp={r.live ? "도전 중" : undefined} sig
            onClick={r.open || (onName ? (e) => onName(r.name, e.currentTarget) : undefined)} label={`${tied(r) ? "공동 " : ""}${r.rank}위 ${r.name}, ${r.points || 0}${unit}${r.live ? ", 도전 중" : ""}`} />;
        })}
      </div>
    </>}
    {tops > 3 && <p className="rank-tie t12 mute reg">{tops}명이 공동 1위입니다.</p>}
    {!open && rest.length > limit && onMore && <div className="rank-more"><Button variant="second" onClick={onMore}>{total || ranked.length}명 전체 보기</Button></div>}
  </>);
}
