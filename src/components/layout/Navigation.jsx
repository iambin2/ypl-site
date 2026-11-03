import React, { useSyncExternalStore } from "react";
import Icon from "../common/Icon.jsx";

/* 폰은 화면 아래 탭 바 다섯 칸, 데스크톱은 상단 바에 같은 다섯. 더보기에는 나머지 화면. */
export const TABS = [["home","홈","home"],["news","공지","news"],["bracket","대진표","bracket"],["records","기록","records"],["more","더보기","more"]];
export const MORE_ITEMS = [["titles","칭호"],["champions","명예의 전당"],["board","게시판"],["builder","팀 빌더"],["calc","계산기"],["about","소개"]];
/* 탭 제목에 쓰는 화면 이름. 홈은 빠져서 기본 제목을 쓴다. */
export const NAV_ITEMS = [...TABS, ...MORE_ITEMS].filter(([k]) => k !== "home" && k !== "more");
export const tabOf = (view, wide = false) => TABS.some(([k]) => k === view) || (wide && MORE_ITEMS.some(([k]) => k === view)) ? view : MORE_ITEMS.some(([k]) => k === view) ? "more" : null;

/* 넓은 데스크톱(1100px 이상)은 더보기 없이 모든 화면을 상단 바에 바로 놓는다. 관리자 로그인은 상단 바의 테마 버튼 옆. */
const WIDE = "(min-width: 1100px)";
const wideNow = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(WIDE).matches);
const onWide = fn => { const m = typeof window !== "undefined" && window.matchMedia?.(WIDE); m?.addEventListener("change", fn); return () => m?.removeEventListener("change", fn); };
export const useWideNav = () => useSyncExternalStore(onWide, wideNow, () => false);
export const WIDE_TABS = [...TABS.filter(([k]) => k !== "more"), ...MORE_ITEMS];

/* 더보기 안의 화면에 있을 때는 더보기 칸이 선택 표시를 받지만, 페이지 자체는 아니므로 aria-current 는 달지 않는다. */
/* 더보기는 이제 페이지다: 더보기 안의 화면(칭호 등)에 있을 때는 선택 표시만 받고, 더보기 페이지에서는 그 페이지다. */
export const current = (cur, key, view) => cur !== key ? {} : key === "more" && view !== "more" ? { "data-current": "" } : { "aria-current": "page" };

/* 고른 칸은 켜진 글자(700)와 윗변의 2px 선. 선은 미끄러지지 않고 그 자리에서 켜진다. */
export default function TabBar({ view, onNavigate, live = null }) {
  const cur = tabOf(view);
  return (
    <nav className="tabbar" aria-label="주요 메뉴">
      {TABS.map(([key, label, ic]) => {
        const lit = key === "bracket" && live;
        return <button key={key} type="button" className="tab" data-tab={key} {...current(cur, key, view)}
          onClick={() => onNavigate(key)} aria-label={lit ? `${label}, 진행 중` : undefined}>
          <Icon n={ic} size={24} />
          {lit && <i className="lamp sig tab-lamp" aria-hidden="true" />}
          <span>{label}</span>
        </button>;
      })}
    </nav>
  );
}
