import React from "react";
import Icon from "./Icon.jsx";

/* Pager (DESIGN.md "Controls"): three panels, back, the page as 1 / 2, next. */
export default function Pager({ page, pages, onGo }) {
  if (pages <= 1) return null;
  return (
    <nav className="pager stack" aria-label="페이지">
      <button type="button" className="pn" onClick={() => onGo(page - 1)} disabled={page <= 1} aria-label="이전 페이지"><Icon n="chevl" size={20} /></button>
      <span className="pn num t15" aria-current="page">{page}<span className="dim pager-of">/</span>{pages}</span>
      <button type="button" className="pn" onClick={() => onGo(page + 1)} disabled={page >= pages} aria-label="다음 페이지"><Icon n="chevr" size={20} /></button>
    </nav>
  );
}
