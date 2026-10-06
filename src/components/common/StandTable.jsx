import React, { useState } from "react";

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

/* 랭킹의 4위부터(법전 Table): 유리 목록의 행. 폰에서는 우승, 준우승, 4강을
   이름 아래 메타 한 줄로 접고, 데스크톱에서는 열로 펼친다. rows 는 rankRows 의 결과. */
export default function StandTable({ rows, showNote, total }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  const shown = open ? rows : rows.slice(0, SHOWN);
  return (<>
    <div className="ypl-table-wrap sq"><table className="ypl-table"><thead><tr>
      <th className="ypl-table__rank">순위</th><th className="ypl-table__who">트레이너</th>
      <th className="ypl-table__n r wide">우승</th><th className="ypl-table__n r wide">준우승</th><th className="ypl-table__n r wide">4강</th>
      {showNote && <th className="wide">비고</th>}<th className="r">포인트</th>
    </tr></thead><tbody>{shown.map((r, i) => (<tr key={i}>
      <td className="ypl-table__rank">{r.rank}</td>
      <td><span className="ypl-table__name">{r.name}</span>
        <span className="ypl-table__meta narrow">우승 {r.win || 0} 준우승 {r.ru || 0} 4강 {r.top4 || 0}{showNote && r.note ? ` ${r.note}` : ""}</span></td>
      <td className="ypl-table__n r wide">{r.win || 0}</td><td className="ypl-table__n r wide">{r.ru || 0}</td><td className="ypl-table__n r wide">{r.top4 || 0}</td>
      {showNote && <td className="ypl-table__note wide">{r.note || ""}</td>}
      <td className="ypl-table__pts r">{(r.points || 0).toLocaleString("ko-KR")}</td>
    </tr>))}</tbody></table></div>
    {!open && rows.length > SHOWN && (
      <button type="button" className="ypl-btn ypl-btn--glass press ypl-table-more" onClick={() => setOpen(true)}>{total}명 전체 보기</button>
    )}
  </>);
}
