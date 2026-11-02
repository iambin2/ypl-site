import React from "react";
import Icon from "./Icon.jsx";

/* A search: a 52 field panel with the search icon; focus draws the 2px line. The count stands beside it while a word is typed. */
export default function ListSearch({ q, setQ, placeholder, count }) {
  return (
    <div className="search">
      <label className="pn search-in">
        <Icon n="search" size={20} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label="검색" />
        {q && <button type="button" className="search-clear" onClick={() => setQ("")} aria-label="검색어 지우기"><Icon n="x" size={20} /></button>}
      </label>
      {q && <span className="search-count t12 dim">{count}건</span>}
    </div>
  );
}
