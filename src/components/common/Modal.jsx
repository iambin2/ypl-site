import React, { useEffect } from "react";
import "./shared-ui.css";

export default function Modal({ title, hint, children, onClose }) {
  /* ESC 로 닫기 — 사이트 드롭다운과 동일한 규칙 */
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="md-close" onClick={onClose} aria-label="닫기">✕</button>
        <h3>{title}</h3>
        {hint && <p className="hint">{hint}</p>}
        {children}
      </div>
    </div>
  );
}
