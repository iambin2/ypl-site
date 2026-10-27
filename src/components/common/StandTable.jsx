import React, { useLayoutEffect, useRef, useState } from "react";
import { DUR, EASE_OUT, reduced, springs } from "./motion.js";

/* 점수 순으로 정렬하고 같은 점수는 같은 순위, 다음 순위는 건너뛴다(6, 6, 8). */
export function rankRows(rows) {
  const sorted = [...(rows || [])].sort((a, b) => (b.points || 0) - (a.points || 0));
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || (row.points || 0) !== (sorted[i - 1].points || 0)) rank = i + 1;
    return { ...row, rank };
  });
}

const SHOWN = 7; // 4위부터 10위까지, 나머지는 "전체 보기"로 펼친다

/* 같은 이름이 두 번 나오는 기록도 있어, 몇 번째 이름인지까지 붙여 행을 구분한다. */
function keyed(rows) {
  const seen = new Map();
  return rows.map(r => { const n = (seen.get(r.name) || 0) + 1; seen.set(r.name, n); return [`${r.name}#${n}`, r]; });
}

/* 랭킹의 4위부터: 행 구분선 없는 넉넉한 표(M1). 폰에서는 우승, 준우승, 4강을 이름 아래 한 줄로 접고,
   데스크톱에서는 열로 펼친다. 시즌이 바뀌어 순서가 달라지면 행이 새 자리로 미끄러지고(FLIP), 오른 행은 잠깐 밝아진다(K5).
   rows 는 rankRows 의 결과. */
export default function StandTable({ rows, showNote, total, onName }) {
  const [open, setOpen] = useState(false);
  const body = useRef(null);
  const tops = useRef(new Map());
  const shown = keyed(open ? rows : rows.slice(0, SHOWN));

  useLayoutEffect(() => {
    const trs = body.current ? [...body.current.children] : [];
    const next = new Map(trs.map(tr => [tr.dataset.k, tr.offsetTop]));
    const before = tops.current;
    if (before.size && !reduced()) {
      for (const tr of trs) {
        const f = before.get(tr.dataset.k), l = next.get(tr.dataset.k);
        if (f == null) { tr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: EASE_OUT }); continue; }
        if (Math.abs(f - l) < 0.5) continue;
        tr.animate([{ transform: `translateY(${f - l}px)` }, { transform: "none" }], { duration: DUR.soft, easing: springs().soft });
        if (l < f) { tr.classList.remove("rise"); void tr.offsetWidth; tr.classList.add("rise"); }
      }
    }
    tops.current = next;
  });

  if (!rows.length) return null;
  return (<>
    <div className="ypl-table-wrap card"><table className="ypl-table"><thead><tr>
      <th className="ypl-table__rank c">순위</th><th className="ypl-table__who">트레이너</th>
      <th className="ypl-table__n c wide">우승</th><th className="ypl-table__n c wide">준우승</th><th className="ypl-table__n c wide">4강</th>
      {showNote && <th className="wide">비고</th>}<th className="r">포인트</th>
    </tr></thead><tbody ref={body}>{shown.map(([k, r]) => (<tr key={k} data-k={k} onAnimationEnd={e => e.currentTarget.classList.remove("rise")}>
      <td className="ypl-table__rank c">{r.rank}</td>
      <td>{onName ? <button type="button" className="ypl-table__name rc-name-link" onClick={e => onName(r.name, e.currentTarget)}>{r.name}</button> : <span className="ypl-table__name">{r.name}</span>}
        {(r.win || r.ru || r.top4 || (showNote && r.note)) ? <span className="ypl-table__meta narrow">{[["우승", r.win], ["준우승", r.ru], ["4강", r.top4]].filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).concat(showNote && r.note ? [r.note] : []).join(" ")}</span> : null}</td>
      {[r.win, r.ru, r.top4].map((n, i) => <td key={i} className={"ypl-table__n c wide" + (n ? "" : " zero")}>{n || 0}</td>)}
      {showNote && <td className="ypl-table__note wide">{r.note || ""}</td>}
      <td className="ypl-table__pts r">{(r.points || 0).toLocaleString("ko-KR")}</td>
    </tr>))}</tbody></table></div>
    {!open && rows.length > SHOWN && (
      <button type="button" className="ypl-btn ypl-btn--glass press ypl-table-more" onClick={() => setOpen(true)}>{total}명 전체 보기</button>
    )}
  </>);
}
