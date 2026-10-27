import React, { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import Icon from "../common/Icon.jsx";
import { placePill } from "../common/motion.js";

/* G1, G2: 폰은 하단 글래스 탭 바 5칸, 데스크톱은 상단 바 가운데에 같은 다섯. 더보기에는 나머지 다섯 화면. */
export const TABS = [["home","홈","home"],["news","공지","news"],["bracket","대진표","bracket"],["records","기록","records"],["more","더보기","more"]];
export const MORE_ITEMS = [["titles","칭호","medal"],["champions","명예의 전당","trophy"],["board","게시판","chats"],["builder","팀 빌더","users"],["calc","계산기","calc"],["about","소개","info"]];
/* 탭 제목에 쓰는 화면 이름. 홈은 빠져서 기본 제목을 쓴다. */
export const NAV_ITEMS = [...TABS, ...MORE_ITEMS].filter(([k]) => k !== "home" && k !== "more");
export const tabOf = (view, wide = false) => TABS.some(([k]) => k === view) || (wide && MORE_ITEMS.some(([k]) => k === view)) ? view : MORE_ITEMS.some(([k]) => k === view) ? "more" : null;

/* 넓은 데스크톱(1100px 이상)은 더보기 없이 모든 화면을 상단 바에 바로 놓는다. 관리자 로그인은 상단 바의 테마 버튼 옆. */
const WIDE = "(min-width: 1100px)";
const wideNow = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(WIDE).matches);
const onWide = fn => { const m = typeof window !== "undefined" && window.matchMedia?.(WIDE); m?.addEventListener("change", fn); return () => m?.removeEventListener("change", fn); };
export const useWideNav = () => useSyncExternalStore(onWide, wideNow, () => false);
export const WIDE_TABS = [...TABS.filter(([k]) => k !== "more"), ...MORE_ITEMS];

/* 선택 알약은 페이지가 바뀌어도 끊기지 않고 미끄러진다(I2, K3). 크기가 바뀌면 애니메이션 없이 다시 맞춘다. */
export function usePill(ref, cur) {
  const placed = useRef(false);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    placePill(box, placed.current);
    placed.current = true;
    const again = () => placePill(box, false);
    addEventListener("resize", again);
    document.fonts?.ready.then(again);
    return () => removeEventListener("resize", again);
  }, [ref, cur]);
}

/* 누른 순간 알약이 먼저 출발한다(K1, K3). 새 페이지를 그리는 무거운 일은 그다음 프레임에 하고, 알약은 변형만 쓰므로
   그동안에도 합성 단계에서 계속 미끄러진다. 페이지가 그려진 뒤의 usePill은 이미 가는 중인 알약을 끊지 않는다. */
export function leadPills(view) {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".tabbar, .navlinks").forEach(box => {
    const target = box.querySelector(`[data-tab="${view}"]`) || (MORE_ITEMS.some(([k]) => k === view) ? box.querySelector('[data-tab="more"]') : null);
    if (target && box.offsetParent !== null) placePill(box, true, target);
  });
}

/* 더보기 안의 화면에 있을 때는 더보기 칸이 선택 표시를 받지만, 페이지 자체는 아니므로 aria-current 는 달지 않는다. */
export const current = (cur, key) => cur !== key ? {} : key === "more" ? { "data-current": "" } : { "aria-current": "page" };

export default function TabBar({ view, moreOpen, onNavigate, onMore }) {
  const ref = useRef(null);
  const cur = tabOf(view);
  usePill(ref, cur);
  return (
    <nav className="tabbar glass" aria-label="주요 메뉴" ref={ref}>
      <span className="pill-ind" aria-hidden="true"><i /><i /><i /></span>
      {TABS.map(([key, label, ic]) => (
        <button key={key} type="button" className="tab press" data-tab={key} {...current(cur, key)}
          {...(key === "more" ? { "aria-haspopup": "menu", "aria-expanded": moreOpen } : {})}
          onClick={e => key === "more" ? onMore(e.currentTarget) : onNavigate(key)}>
          <span className="ics"><Icon n={ic} size={24} className="ic-off" /><Icon n={ic + "-fill"} size={24} className="ic-on" /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
