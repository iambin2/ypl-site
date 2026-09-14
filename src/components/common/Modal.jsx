import React, { useEffect, useId, useLayoutEffect, useRef } from "react";
import Icon from "./Icon.jsx";

/* 닫힘 애니메이션 — 대화상자는 부모가 상태를 지우는 순간 사라진다(X, 저장 후 닫기, 탭 이동 모두).
   그래서 React 가 떼어 낸 overlay 노드를 그 자리에 잠깐 다시 붙여 사라지는 모습만 재생하고 지운다.
   React 는 이 노드를 다시 건드리지 않는다. StrictMode 의 가짜 해제는 노드가 붙어 있으므로 건너뛴다. */
export function useExitAnimation(ref) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    return () => {
      const parent = node.parentNode;
      const next = node.nextSibling;
      const scrollTop = node.querySelector(".modal")?.scrollTop || 0;
      queueMicrotask(() => {
        // 다른 대화상자로 바로 넘어가는 경우엔 배경이 두 겹으로 어두워지므로 그대로 바꾼다.
        if (node.isConnected || document.querySelector(".overlay:not(.is-closing)")) return;
        const host = parent?.isConnected ? parent : (document.querySelector(".ypl") || document.body);
        node.classList.add("is-closing");
        node.inert = true;
        node.setAttribute("aria-hidden", "true");
        host.insertBefore(node, host === parent && next?.parentNode === parent ? next : null);
        const sheet = node.querySelector(".modal");
        if (sheet) sheet.scrollTop = scrollTop;
        const done = () => node.remove();
        Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)).then(done, done);
        setTimeout(done, 700);
      });
    };
  }, [ref]);
}

/* 대화상자 — 데스크톱은 가운데 창, 폰은 아래에서 올라오는 시트(CSS).
   Esc 와 바깥 클릭으로 닫히고, 열려 있는 동안 뒤 페이지는 스크롤되지 않는다. */
export default function Modal({ title, hint, children, onClose }) {
  const titleId = useId();
  const overlayRef = useRef(null);
  useExitAnimation(overlayRef);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = event => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => { root.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div className="overlay" ref={overlayRef} onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}>
        <button type="button" className="modal-x" onClick={onClose} aria-label="닫기"><Icon n="x" size={16} /></button>
        <h3 id={titleId}>{title}</h3>
        {hint && <p className="hint">{hint}</p>}
        {children}
      </div>
    </div>
  );
}
