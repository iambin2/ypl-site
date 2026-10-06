import React, { useEffect, useRef, useState } from "react";
import Icon from "../common/Icon.jsx";

export const NAV_ITEMS_BEFORE_TOOLS = [["about","소개"],["news","공지"],["board","게시판"],["records","기록"],["bracket","대진표"],["titles","칭호"],["champions","명예의 전당"]];
export const TOOL_ITEMS = [["builder","팀 빌더"]];
export const NAV_ITEMS_AFTER_TOOLS = [];
export const NAV_ITEMS = [...NAV_ITEMS_BEFORE_TOOLS, ...TOOL_ITEMS, ...NAV_ITEMS_AFTER_TOOLS];

function useOutsideClose(ref, close) {
  useEffect(() => {
    const onPointerDown = event => {
      if (ref.current && !ref.current.contains(event.target)) close();
    };
    const onKeyDown = event => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, close]);
}

function NavButtons({ items, view, onNavigate }) {
  return items.map(([key, label]) => (
    <button key={key} className={"nlink press" + (view === key ? " on" : "")} aria-current={view === key ? "page" : undefined} onClick={() => onNavigate(key)}>{label}</button>
  ));
}

export function DesktopNavigation({ view, onNavigate }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);
  const toolsActive = TOOL_ITEMS.some(([key]) => view === key);
  useOutsideClose(toolsRef, () => setToolsOpen(false));

  const navigateTool = key => {
    setToolsOpen(false);
    onNavigate(key);
  };

  return (
    <nav className="nav-links" aria-label="주요 메뉴">
      <NavButtons items={NAV_ITEMS_BEFORE_TOOLS} view={view} onNavigate={onNavigate} />
      <div className={"nav-tools" + (toolsOpen ? " open" : "")} ref={toolsRef}>
        <button
          className={"nlink press nav-tools-trigger" + (toolsActive ? " on" : "")}
          onClick={() => setToolsOpen(open => !open)}
          aria-haspopup="menu"
          aria-expanded={toolsOpen}
        >
          <span>도구</span><Icon n="chev" size={16} className="nav-tools-chevron" />
        </button>
        <div className="nav-tools-menu sq" role="menu" aria-hidden={!toolsOpen}>
          {TOOL_ITEMS.map(([key, label]) => (
            <button key={key} role="menuitem" tabIndex={toolsOpen ? 0 : -1} className={"nav-tools-item sq press" + (view === key ? " on" : "")} onClick={() => navigateTool(key)}>
              <span className="nav-tools-ic sq"><Icon n="team" size={20} /></span>
              <span><b>{label}</b><small>포켓몬 챔피언스 엔트리 구성</small></span>
            </button>
          ))}
        </div>
      </div>
      <NavButtons items={NAV_ITEMS_AFTER_TOOLS} view={view} onNavigate={onNavigate} />
    </nav>
  );
}

/* 모바일 메뉴 — 화면 전체를 덮는 큰 글자 목록(보드 A안). 도구도 접지 않고 같은 목록에 둔다.
   항목은 읽는 순서대로 40ms씩 늦게 올라오고, 처음 6개까지만 순서를 준다(08 모션 6번 법칙). */
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
        <ul className="nav-mlist">{[["home", "홈"], ...NAV_ITEMS_BEFORE_TOOLS, ...NAV_ITEMS_AFTER_TOOLS].map(item)}</ul>
        <p className="nav-mlabel" style={delay()}>도구</p>
        <ul className="nav-mlist">{TOOL_ITEMS.map(item)}</ul>
        <div className="nav-mfoot" style={delay()}>{children}</div>
      </div>
    </div>
  );
}
