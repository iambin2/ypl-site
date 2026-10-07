import { useEffect } from "react";

/* 커서 빛(08 모션). 데스크톱, 정밀한 포인터, 동작 줄이기 꺼짐에서만 켠다. */
const QUERY = "(hover: hover) and (pointer: fine) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)";

/* 커서가 곧 광원: 페이지 뒤의 큰 빛이 커서를 따라오고, 모든 유리가 그 빛 하나에서
   자기 자리에 떨어지는 만큼만 밝아진다. 좌표(--lx, --ly, 뷰포트 px)를 html에 쓰면
   등록된 속성이 CSS에서 duration-follow 만큼 늦게 따라온다. 조건이 아니면 html에
   light-live가 없고, 빛은 느리게 흐르는 기본 상태로 남는다. */
export function useLightSource() {
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return undefined;
    const root = document.documentElement;
    const move = e => {
      root.style.setProperty("--lx", e.clientX + "px");
      root.style.setProperty("--ly", e.clientY + "px");
    };
    const sync = () => {
      if (mq.matches) {
        root.style.setProperty("--lx", window.innerWidth * .76 + "px");
        root.style.setProperty("--ly", window.innerHeight * .06 + "px");
        root.classList.add("light-live");
        window.addEventListener("pointermove", move, { passive: true });
      } else {
        root.classList.remove("light-live");
        window.removeEventListener("pointermove", move);
      }
    };
    sync();
    mq.addEventListener?.("change", sync);
    return () => { mq.removeEventListener?.("change", sync); window.removeEventListener("pointermove", move); root.classList.remove("light-live"); };
  }, []);
}

/* 빛 글자(히어로 마지막 줄, 피처 이름): 포인터 위치를 --mx, --my(퍼센트)로 넘기면
   글자 위의 밝은 점이 따라온다. 떠나면 기본 위치(70%, 20%)로 돌아간다. */
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
