import React, { useEffect, useRef } from "react";
import { DUR, light } from "./motion.js";
import Icon from "./Icon.jsx";

/* Pager (DESIGN.md "Controls"): three panels, back, the page as 1 / 2, next. */
export default function Pager({ page, pages, onGo, unit = "페이지" }) {
  const ref = useRef(null), first = useRef(true);
  // a turned page lights its rows, as a page does; the list stands just before the pager's place
  useEffect(() => { if (first.current) { first.current = false; return; } light(ref.current?.parentElement?.previousElementSibling, DUR.leave); }, [page]);
  if (pages <= 1) return null;
  return (
    <nav className="pager stack" aria-label={unit} ref={ref}>
      <button type="button" className="pn" onClick={() => onGo(page - 1)} disabled={page <= 1} aria-label={`이전 ${unit}`}><Icon n="chevl" size={20} /></button>
      <span className="pn num t15" aria-current="page">{page}<span className="dim pager-of">/</span>{pages}</span>
      <button type="button" className="pn" onClick={() => onGo(page + 1)} disabled={page >= pages} aria-label={`다음 ${unit}`}><Icon n="chevr" size={20} /></button>
    </nav>
  );
}
