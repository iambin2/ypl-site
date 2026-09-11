import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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

/* 현재 위치 지시자 — 링크마다 밑줄을 켜는 대신 하나의 막대가 자리를 옮긴다.
   위치는 CSS 변수(--ind-x 이동 / --ind-s 배율 / --ind-o)로 넘기고 움직임은 CSS가 맡는다.
   첫 렌더에서는 미끄러지지 않도록 한 프레임 동안 no-slide 를 건다. */
function useActiveIndicator(view) {
  const boxRef = useRef(null);
  const settled = useRef(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    const place = () => {
      const active = box.querySelector(".nlink.on, .nav-tools-trigger.on");
      if (!active) { box.style.setProperty("--ind-o", "0"); return; }
      const boxRect = box.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      box.style.setProperty("--ind-x", `${rect.left - boxRect.left + 12}px`);
      box.style.setProperty("--ind-s", `${Math.max(0, rect.width - 24) / 100}`);
      box.style.setProperty("--ind-o", "1");
    };

    if (!settled.current) box.classList.add("no-slide");
    place();
    let raf = 0;
    if (!settled.current) {
      settled.current = true;
      raf = requestAnimationFrame(() => box.classList.remove("no-slide"));
    }

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place).catch(() => {});
    const observer = new ResizeObserver(place);
    observer.observe(box);
    window.addEventListener("resize", place);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [view]);

  return boxRef;
}

function NavButtons({ items, view, onNavigate }) {
  return items.map(([key, label]) => (
    <button key={key} className={"nlink" + (view === key ? " on" : "")} aria-current={view === key ? "page" : undefined} onClick={() => onNavigate(key)}>{label}</button>
  ));
}

export function DesktopNavigation({ view, onNavigate }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);
  const toolsActive = TOOL_ITEMS.some(([key]) => view === key);
  useOutsideClose(toolsRef, () => setToolsOpen(false));
  const linksRef = useActiveIndicator(view);

  const navigateTool = key => {
    setToolsOpen(false);
    onNavigate(key);
  };

  return (
    <nav className="nav-links" ref={linksRef} aria-label="주요 메뉴">
      <NavButtons items={NAV_ITEMS_BEFORE_TOOLS} view={view} onNavigate={onNavigate} />
      <div className={"nav-tools" + (toolsOpen ? " open" : "")} ref={toolsRef}>
        <button
          className={"nlink nav-tools-trigger" + (toolsActive ? " on" : "")}
          onClick={() => setToolsOpen(open => !open)}
          aria-haspopup="menu"
          aria-expanded={toolsOpen}
        >
          <span>도구</span><Icon n="chev" size={14} className="nav-tools-chevron" />
        </button>
        <div className="nav-tools-menu" role="menu" aria-hidden={!toolsOpen}>
          {TOOL_ITEMS.map(([key, label]) => (
            <button key={key} role="menuitem" tabIndex={toolsOpen ? 0 : -1} className={"nav-tools-item" + (view === key ? " on" : "")} onClick={() => navigateTool(key)}>
              <span className="nav-tools-ic"><Icon n="team" size={18} /></span>
              <span><b>{label}</b><small>Pokémon Champions 엔트리 구성</small></span>
            </button>
          ))}
        </div>
      </div>
      <NavButtons items={NAV_ITEMS_AFTER_TOOLS} view={view} onNavigate={onNavigate} />
    </nav>
  );
}

/* 모바일 메뉴 — 화면 전체를 덮는 큰 목록. 도구도 접지 않고 같은 목록에 둔다. */
export function MobileNavigation({ view, onNavigate, open, children }) {
  let delayIndex = 0;
  const itemStyle = () => ({ transitionDelay: (open ? 60 + delayIndex++ * 28 : 0) + "ms" });
  const item = ([key, label]) => (
    <button key={key} className={"nav-ditem" + (view === key ? " on" : "")} aria-current={view === key ? "page" : undefined}
      tabIndex={open ? 0 : -1} style={itemStyle()} onClick={() => onNavigate(key)}>
      <span>{label}</span><Icon n="arrow" size={18} />
    </button>
  );

  return (
    <div className={"nav-drawer" + (open ? " open" : "")} aria-hidden={!open} id="ypl-mobile-menu">
      <div className="nav-drawer-in">
        <div className="nav-dgroup">{[["home", "홈"], ...NAV_ITEMS_BEFORE_TOOLS, ...NAV_ITEMS_AFTER_TOOLS].map(item)}</div>
        <div className="nav-dlabel" style={itemStyle()}>도구</div>
        <div className="nav-dgroup">{TOOL_ITEMS.map(item)}</div>
        <div className="nav-dfoot" style={itemStyle()}>{children}</div>
      </div>
    </div>
  );
}
