import { useEffect } from "react";

/* 커서 빛(08 모션): 히어로의 실버 줄과 피처 카드 두 곳에만.
   포인터 위치를 --mx, --my(퍼센트)로 넘기면 CSS의 등록된 속성이 duration-follow 동안 따라온다.
   데스크톱, 정밀한 포인터, 동작 줄이기 꺼짐에서만 듣는다. 떠나면 기본 위치(70%, 20%)로 돌아간다. */
const QUERY = "(hover: hover) and (pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)";

export default function useCursorLight(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia?.(QUERY).matches) return undefined;
    const move = e => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      el.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    };
    const leave = () => { el.style.removeProperty("--mx"); el.style.removeProperty("--my"); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, [ref]);
}
