import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./navigation-tools.css";

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

/* 현재 위치 지시자 — 링크마다 밑줄을 켜는 대신, 하나의 밑줄이 자리를 옮긴다.
   위치는 CSS 변수(--ind-x 이동 / --ind-s 신축 배율 / --ind-o)로 넘기고,
   움직임은 CSS가 맡는다. 폭이 아니라 배율을 넘기는 이유는 레이아웃을 다시
   계산하지 않고 합성만으로 늘어나게 하기 위해서다(기준 폭 100px).
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
      box.style.setProperty("--ind-x", `${rect.left - boxRect.left}px`);
      box.style.setProperty("--ind-s", `${rect.width / 100}`);
      box.style.setProperty("--ind-o", "1");
    };

    if (!settled.current) box.classList.add("no-slide");
    place();
    let raf = 0;
    if (!settled.current) {
      settled.current = true;
      raf = requestAnimationFrame(() => box.classList.remove("no-slide"));
    }

    /* 웹폰트가 늦게 들어오면 링크 폭이 바뀐다 — 그때 한 번 더 맞춘다. */
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
    <div className="nav-links" ref={linksRef}>
      <NavButtons items={NAV_ITEMS_BEFORE_TOOLS} view={view} onNavigate={onNavigate} />
      <div className={"nav-tools" + (toolsOpen ? " open" : "")} ref={toolsRef}>
        <button
          className={"nlink nav-tools-trigger" + (toolsActive ? " on" : "")}
          onClick={() => setToolsOpen(open => !open)}
          aria-haspopup="menu"
          aria-expanded={toolsOpen}
        >
          <span>도구</span><span className="nav-tools-chevron" aria-hidden="true"><svg viewBox="0 0 12 8"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
        </button>
        <div className="nav-tools-menu" role="menu" aria-hidden={!toolsOpen}>
          {TOOL_ITEMS.map(([key, label]) => (
            <button key={key} role="menuitem" className={"nav-tools-item" + (view === key ? " on" : "")} onClick={() => navigateTool(key)}>{label}</button>
          ))}
        </div>
      </div>
      <NavButtons items={NAV_ITEMS_AFTER_TOOLS} view={view} onNavigate={onNavigate} />
    </div>
  );
}

export function MobileNavigation({ view, onNavigate, open }) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsActive = TOOL_ITEMS.some(([key]) => view === key);

  useEffect(() => {
    if (!open) setToolsOpen(false);
  }, [open]);

  const navigate = key => {
    setToolsOpen(false);
    onNavigate(key);
  };

  let delayIndex = 0;
  const buttonStyle = () => ({ transitionDelay: (open ? delayIndex++ * 32 : 0) + "ms" });

  return (
    <div className={"nav-drawer" + (open ? " open" : "")} aria-hidden={!open}>
      {NAV_ITEMS_BEFORE_TOOLS.map(([key, label]) => (
        <button key={key} className={"nav-ditem" + (view === key ? " on" : "")} aria-current={view === key ? "page" : undefined} tabIndex={open ? 0 : -1} style={buttonStyle()} onClick={() => onNavigate(key)}>{label}</button>
      ))}
      <button
        className={"nav-ditem nav-tools-mobile-trigger" + (toolsActive ? " on" : "")}
        tabIndex={open ? 0 : -1}
        style={buttonStyle()}
        onClick={() => setToolsOpen(value => !value)}
        aria-expanded={toolsOpen}
      >
        <span>도구</span><span className="nav-tools-chevron" aria-hidden="true"><svg viewBox="0 0 12 8"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
      </button>
      <div className={"nav-tools-mobile-menu" + (toolsOpen ? " open" : "")}>
        {TOOL_ITEMS.map(([key, label]) => (
          <button key={key} className={"nav-ditem nav-tools-mobile-item" + (view === key ? " on" : "")} tabIndex={open && toolsOpen ? 0 : -1} onClick={() => navigate(key)}>{label}</button>
        ))}
      </div>
      {NAV_ITEMS_AFTER_TOOLS.map(([key, label]) => (
        <button key={key} className={"nav-ditem" + (view === key ? " on" : "")} aria-current={view === key ? "page" : undefined} tabIndex={open ? 0 : -1} style={buttonStyle()} onClick={() => onNavigate(key)}>{label}</button>
      ))}
    </div>
  );
}
