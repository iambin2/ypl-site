import React, { useEffect, useId } from "react";
import Icon from "./Icon.jsx";

/* 대화상자 — 데스크톱은 가운데 창, 폰은 아래에서 올라오는 시트(CSS).
   Esc 와 바깥 클릭으로 닫히고, 열려 있는 동안 뒤 페이지는 스크롤되지 않는다. */
export default function Modal({ title, hint, children, onClose }) {
  const titleId = useId();
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = event => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => { root.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}>
        <button type="button" className="modal-x" onClick={onClose} aria-label="닫기"><Icon n="x" size={16} /></button>
        <h3 id={titleId}>{title}</h3>
        {hint && <p className="hint">{hint}</p>}
        {children}
      </div>
    </div>
  );
}
