import React from "react";
import { Mon } from "./Board.jsx";
import Loader from "./Loader.jsx";
import { rosterSheet, useTeamDisplay } from "./TeamSheet.jsx";

/* 우승 엔트리의 여섯 명판: 기록의 파티 시트와 같은 모델(rosterSheet)을 읽되, 전당에 거는 것만 남긴다.
   그림은 세부 값의 포켓몬 그대로(메가, 폼까지) 바닥에 서고, 이름 20, 타입, 도구, 특성, 성격, 그리고 네 기술이 판 폭으로 둘씩. 능력치 표는 기록의 시트가 보인다. */
export default function ChampionPlaques({ sets, regulationId, fallback }) {
  const display = useTeamDisplay(true);
  if (!display) return <Loader small />;
  const rows = rosterSheet({ sets, regulationId }, display);
  if (!rows.length) return fallback;
  return <div className="hof-plaques">{rows.map((row, i) => <article className="pn hof-plaque" key={i} aria-label={row.name}>
    <span className="stand hof-plaque-pic"><i className="floor" aria-hidden="true" /><Mon src={row.sprite} /></span>
    <div className="hof-plaque-who">
      <b className="t20">{row.name}</b>
      {row.types.length > 0 && <span className="hof-types">{row.types.map(t => <span key={t.id} className={`tb-type type-${t.id}`}>{t.label}</span>)}</span>}
      <dl className="hof-spec">
        <div><dt>도구</dt><dd>{row.item || "없음"}</dd></div>
        <div><dt>특성</dt><dd>{row.ability || "없음"}</dd></div>
        <div><dt>성격</dt><dd>{row.nature}<small>{row.natureEffect}</small></dd></div>
      </dl>
    </div>
    <ul className="hof-moves" aria-label={`${row.name} 기술`}>{Array.from({ length: 4 }, (_, k) => {
      const mv = row.moves[k];
      return <li key={k} className={mv ? undefined : "empty"}>{mv
        ? <><b className="t15">{mv.name}</b>{mv.type && <span className={`tb-type type-${mv.type.id}`}>{mv.type.label}</span>}</>
        : <span className="t12">기술 없음</span>}</li>;
    })}</ul>
  </article>)}</div>;
}
