import React, { useEffect, useState } from "react";
import { championsData } from "../../services/index.js";
import { buildTeamSheet, fromTeamSnapshotV1, localizedPokemonName, onSpriteError, savedTeamSheet } from "../../services/teamBuilderCore.js";
import { REGULATIONS } from "../../data/index.js";

let teamDisplay = null;
function loadTeamDisplay() {
  return teamDisplay ||= Promise.all([championsData.load(), championsData.loadSpeciesNames()])
    .then(([detailData, names]) => ({ detailData, koreanNames: names.koreanByEnglish }))
    .catch(error => { teamDisplay = null; throw error; });
}
/* 배틀 데이터. 처음 쓸 때 한 번만 받는다. 못 받으면 "error" */
export function useTeamDisplay(enabled = true) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    loadTeamDisplay().then(d => live && setState(d), () => live && setState("error"));
    return () => { live = false; };
  }, [enabled]);
  return state;
}
export function sheetOf(team, display) {
  if (!display || display === "error") return [];
  return savedTeamSheet(team, { ...display, legalItems: championsData.legalItems(display.detailData, team?.regulationId) });
}
/* 공식 기록의 파티(스냅숏 멤버)를 같은 모델로 되살린다 */
export function rosterSheet(roster, display, only = null) {
  if (!display || display === "error" || !roster?.sets?.length) return [];
  const regulation = REGULATIONS[roster.regulationId] || Object.values(REGULATIONS)[0];
  const restored = fromTeamSnapshotV1({ snapshot: { schema_version: 1 }, members: only ? [only] : roster.sets, regulation, detailData: display.detailData });
  if (!restored.ok) return [];
  return buildTeamSheet(restored.team, { detailData: display.detailData, displayPokemon: pokemon => localizedPokemonName(pokemon, display.koreanNames) || pokemon?.name });
}

/* 팀 시트: 빌더 편집기에 있는 모든 값을 포켓몬마다 한 장의 케이스에. 이미지 저장도 같은 모델을 그린다. */
export default function TeamSheet({ sheet, idPrefix = "" }) {
  return <div className={"sc-sheet" + (sheet.length > 1 ? " multi" : "")}>{sheet.map((row, i) => (
    <article className="case sc-mon" key={i} id={idPrefix ? idPrefix + i : undefined}>
      <header className="case-label">
        <span className="case-who"><b>{row.name}</b><span>{[row.english !== row.name ? row.english : "", row.num != null ? `No. ${String(row.num).padStart(4, "0")}` : ""].filter(Boolean).join("  ")}</span></span>
      </header>
      <div className="case-win sc-win">
        <i className="case-band" aria-hidden="true" />
        <img src={row.sprite} alt="" onError={onSpriteError()} />
        <div className="tb-types">{row.types.map(t => <span key={t.id} className={`tb-type type-${t.id}`}>{t.label}</span>)}</div>
      </div>
      <div className="sc-spec">
        {row.unresolved && <p className="bk-hint">지금 데이터에서 확인할 수 없는 포켓몬입니다.</p>}
        <dl className="sc-facts">
          <div><dt>특성</dt><dd>{row.ability || "없음"}</dd></div>
          <div><dt>도구</dt><dd>{row.item || "없음"}</dd></div>
          <div><dt>성격</dt><dd>{row.nature}<small>{row.natureEffect}</small></dd></div>
        </dl>
        <div className="sc-stats" role="table" aria-label={`${row.name} 능력치`}>
          <div className="sc-stat sc-stat-h" role="row"><span role="columnheader">능력</span><span role="columnheader">종족값</span><span role="columnheader">능력 포인트 {row.spTotal} / 66</span><span role="columnheader">실수치</span></div>
          {row.stats.map(st => (<div className="sc-stat" role="row" key={st.key}>
            <b role="cell">{st.label}{st.mark === "+" ? " ↑" : st.mark === "-" ? " ↓" : ""}</b>
            <span role="cell" className="tnum">{st.base ?? ""}</span>
            <span role="cell" className="sc-sp"><i style={{ "--sp": st.sp / 32 }} /><em className={"tnum" + (st.sp ? " on" : "")}>{st.sp}</em></span>
            <strong role="cell" className="tnum">{st.final}</strong>
          </div>))}
        </div>
        <ul className="sc-moves">{Array.from({ length: 4 }, (_, k) => {
          const mv = row.moves[k];
          return <li key={k} className={mv ? "" : "empty"}>{mv ? <><b>{mv.name}</b><span className="sc-move-line">{mv.type?.label && <span className={`tb-type type-${mv.type?.id || ""}`}>{mv.type.label}</span>}{mv.category && <small>{mv.category}</small>}</span></> : <small>기술 없음</small>}</li>;
        })}</ul>
      </div>
    </article>))}</div>;
}
