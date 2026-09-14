import React, { useEffect, useId, useLayoutEffect, useRef } from "react";
import Icon from "./Icon.jsx";

/* 닫힘 애니메이션 — 떠 있는 층(대화상자, 드롭다운 메뉴, 토스트)은 부모가 상태를 지우는 순간 사라진다.
   그래서 React 가 떼어 낸 노드를 그 자리에 잠깐 다시 붙여 사라지는 모습만 재생하고 지운다.
   React 는 이 노드를 다시 건드리지 않는다. StrictMode 의 가짜 해제는 노드가 붙어 있으므로 건너뛴다.
   - replacedBy: 같은 종류의 새 층이 이미 떠 있으면(대화상자에서 대화상자로) 겹치지 않게 그대로 바꾼다.
   - inPlace: 부모 안에서 위치가 정해지는 층(드롭다운 메뉴)은 부모가 사라졌으면 재생하지 않는다. */
export function useExitAnimation(ref, { replacedBy = null, inPlace = false } = {}) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    return () => {
      const parent = node.parentNode;
      const next = node.nextSibling;
      const scrollers = [node, ...node.querySelectorAll(".modal")].map(el => [el, el.scrollTop]);
      const liveBefore = replacedBy ? document.querySelectorAll(`${replacedBy}:not(.is-closing)`).length : 0;
      queueMicrotask(() => {
        if (node.isConnected) return;
        // 같은 커밋에서 새 층이 들어와 개수가 줄지 않았다면 "교체"다. 아래에 남은 창 위의 확인창이 닫힐 때는 재생한다.
        if (replacedBy && document.querySelectorAll(`${replacedBy}:not(.is-closing)`).length >= liveBefore) return;
        if (inPlace && !parent?.isConnected) return;
        const host = parent?.isConnected ? parent : (document.querySelector(".ypl") || document.body);
        node.classList.add("is-closing");
        node.inert = true;
        node.setAttribute("aria-hidden", "true");
        host.insertBefore(node, host === parent && next?.parentNode === parent ? next : null);
        scrollers.forEach(([el, top]) => { el.scrollTop = top; });
        const done = () => node.remove();
        Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)).then(done, done);
        setTimeout(done, 700);
      });
    };
  }, [ref, replacedBy, inPlace]);
}

/* 대화상자 — 데스크톱은 가운데 창, 폰은 아래에서 올라오는 시트(CSS).
   Esc 와 바깥 클릭으로 닫히고, 열려 있는 동안 뒤 페이지는 스크롤되지 않는다. */
export default function Modal({ title, hint, children, onClose }) {
  const titleId = useId();
  const overlayRef = useRef(null);
  useExitAnimation(overlayRef, { replacedBy: ".overlay" });
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = event => {
      if (event.key !== "Escape") return;
      // 창 위에 창이 떠 있으면 Esc 는 맨 위 창만 닫는다.
      const live = document.querySelectorAll(".overlay:not(.is-closing)");
      if (live[live.length - 1] === overlayRef.current) onClose?.();
    };
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
