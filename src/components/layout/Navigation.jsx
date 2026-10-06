import React from "react";

export const NAV_ITEMS_BEFORE_TOOLS = [["about","소개"],["news","공지"],["board","게시판"],["records","기록"],["bracket","대진표"],["titles","칭호"],["champions","명예의 전당"]];
export const TOOL_ITEMS = [["builder","팀 빌더"]];
export const NAV_ITEMS_AFTER_TOOLS = [];
export const NAV_ITEMS = [...NAV_ITEMS_BEFORE_TOOLS, ...TOOL_ITEMS, ...NAV_ITEMS_AFTER_TOOLS];

/* NavBar 카드의 순서. 게시판은 헤더에 두지 않고 푸터에서 들어간다. */
const PAGES = [["home","홈"],["news","공지"],["bracket","대진표"],["records","기록"],["titles","칭호"],["champions","명예의 전당"],["about","소개"]];

/* 데스크톱 링크: 가운데, 현재 페이지는 fill 캡슐(09). 도구는 접지 않고 한 줄에 둔다. */
export function DesktopNavigation({ view, onNavigate }) {
  return (
    <nav className="nav-links" aria-label="주요 메뉴">
      {[...PAGES.slice(0, 6), ...TOOL_ITEMS, ...PAGES.slice(6)].map(([key, label]) => (
        <button key={key} className={"nlink press" + (view === key ? " on" : "")} aria-current={view === key ? "page" : undefined} onClick={() => onNavigate(key)}>{label}</button>
      ))}
    </nav>
  );
}

/* MobileMenu: 헤더 아래 화면 전체의 큰 글자 목록. 도구는 라틴 머리말 TOOL 하나로만 나눈다.
   항목은 읽는 순서대로 40ms씩 늦게 올라오고, 처음 6개까지만 순서를 준다(08 모션 7번 법칙). */
export function MobileNavigation({ view, onNavigate, open, children }) {
  let order = 0;
  const delay = () => ({ "--menu-delay": Math.min(order++, 6) * 40 + "ms" });
  const item = ([key, label]) => (
    <li key={key} style={delay()}>
      <button className={"nav-mitem press" + (view === key ? " on" : "")} aria-current={view === key ? "page" : undefined}
        tabIndex={open ? 0 : -1} onClick={() => onNavigate(key)}>{label}</button>
    </li>
  );

  return (
    <div className={"nav-menu" + (open ? " open" : "")} aria-hidden={!open} id="ypl-mobile-menu">
      <div className="nav-menu-in">
        <ul className="nav-mlist">{PAGES.map(item)}</ul>
        <p className="nav-mlabel eyebrow" style={delay()}>Tool</p>
        <ul className="nav-mlist">{TOOL_ITEMS.map(item)}</ul>
        <div className="nav-mfoot" style={delay()}>{children}</div>
      </div>
    </div>
  );
}
