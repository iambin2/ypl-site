import React from "react";

/* 패널 내부용 검색창. 사이트 공통 검색 UI(.lsearch)를 그대로 재사용한다.
   countLabel 은 "71명", "25종" 처럼 화면마다 다른 단위를 그대로 받는다. */
export default function PanelSearch({ value, onChange, placeholder, countLabel, className }) {
  return (
    <div className={"list-tools panel-search" + (className ? " " + className : "")}>
      <div className="lsearch">
        <span className="ls-ico" aria-hidden="true">🔍</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder || "검색"} />
        {value && <button className="ls-clear" onClick={() => onChange("")} aria-label="검색어 지우기">✕</button>}
      </div>
      {countLabel && <span className="list-count">{countLabel}</span>}
    </div>
  );
}
