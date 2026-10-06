import React from "react";

/* 순위표. 폰에서는 우승, 준우승, 4강 열을 이름 아래 한 줄 요약으로 접는다.
   from 이 2면 1위는 위의 리드 타일이 맡으므로 2위부터 그린다. */
export default function StandTable({ rows, showNote, from = 1 }) {
  const sorted=[...rows].sort((a,b)=>(b.points||0)-(a.points||0)).slice(from-1);
  if(!sorted.length) return null;
  return (<div className="ypl-table-wrap sq"><table className="ypl-table"><thead><tr>
    <th className="ypl-table__rank">순위</th><th>트레이너</th>
    <th className="ypl-table__n r wide">우승</th><th className="ypl-table__n r wide">준우승</th><th className="ypl-table__n r wide">4강</th>
    {showNote&&<th className="wide">비고</th>}<th className="r">포인트</th>
  </tr></thead><tbody>{sorted.map((r,i)=>(<tr key={i}>
    <td className="ypl-table__rank"><span className="num">{i+from}</span></td>
    <td><span className="ypl-table__name">{r.name}</span>
      <span className="ypl-table__meta narrow">우승 {r.win||0}, 준우승 {r.ru||0}, 4강 {r.top4||0}{showNote&&r.note?`, ${r.note}`:""}</span></td>
    <td className="ypl-table__n r wide">{r.win||0}</td><td className="ypl-table__n r wide">{r.ru||0}</td><td className="ypl-table__n r wide">{r.top4||0}</td>
    {showNote&&<td className="ypl-table__note wide">{r.note||""}</td>}
    <td className="r"><span className="ypl-table__pts"><span className="num">{(r.points||0).toLocaleString("ko-KR")}</span><span className="unit">점</span></span></td>
  </tr>))}</tbody></table></div>);
}
