import React, { useEffect, useId } from "react";
import { DesktopNavigation, MobileNavigation } from "./Navigation.jsx";
import Icon from "../common/Icon.jsx";

export const DISCORD_URL = "https://discord.gg/T7UZHhGvUh";

/* YPL 마크 — 워글의 실루엣. 양털 여덟 송이가 둥근 몸을 이루고, 얼굴과 두 다리가
   가는 틈으로 양털과 떨어진다. 한 가지 색, 눈과 틈은 바탕이 비치는 구멍. */
const WOOL = [[32, 12], [42.61, 16.39], [47, 27], [42.61, 37.61], [32, 42], [21.39, 37.61], [17, 27], [21.39, 16.39]];
export function BrandMark({ size = 28 }) {
  const id = "ypl-mark-" + useId().replace(/:/g, "");
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" fill="var(--brand)" aria-hidden="true" focusable="false">
      <mask id={id + "w"}>
        <rect width="64" height="64" fill="#fff" />
        <rect x="22.1" y="25.6" width="19.8" height="24.8" rx="9.9" fill="#000" />
        <rect x="19.1" y="48.6" width="9.8" height="14.8" rx="4.9" fill="#000" />
        <rect x="35.1" y="48.6" width="9.8" height="14.8" rx="4.9" fill="#000" />
      </mask>
      <mask id={id + "f"}>
        <rect width="64" height="64" fill="#fff" />
        <circle cx="28.6" cy="37.5" r="2" fill="#000" />
        <circle cx="35.4" cy="37.5" r="2" fill="#000" />
      </mask>
      <g mask={`url(#${id}w)`}>
        <circle cx="32" cy="27" r="16" />
        {WOOL.map(([cx, cy]) => <circle key={cx + "-" + cy} cx={cx} cy={cy} r="10" />)}
      </g>
      <rect x="24.5" y="28" width="15" height="20" rx="7.5" mask={`url(#${id}f)`} />
      <rect x="21.5" y="51" width="5" height="10" rx="2.5" />
      <rect x="37.5" y="51" width="5" height="10" rx="2.5" />
    </svg>
  );
}

export default function SiteHeader({
  view,
  onNavigate,
  dark,
  onToggleTheme,
  scrolled,
  menuOpen,
  onToggleMenu,
  admin,
  onAdminClick,
}) {
  /* 메뉴가 열려 있는 동안 뒤 페이지는 스크롤되지 않는다. Esc 로 닫힌다. */
  useEffect(() => {
    if (!menuOpen) return undefined;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = event => { if (event.key === "Escape") onToggleMenu(); };
    window.addEventListener("keydown", onKey);
    return () => { root.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [menuOpen, onToggleMenu]);

  const themeLabel = dark ? "밝은 모드로 전환" : "어두운 모드로 전환";
  const adminLabel = admin ? "관리자 로그아웃" : "관리자 로그인";

  return (
    <header className={"gnav" + (scrolled ? " scrolled" : "") + (menuOpen ? " menu-open" : "")}>
      <div className="gnav-in">
        <button className="brand" onClick={() => onNavigate("home")} aria-label="YPL 홈으로">
          <BrandMark />
          <span className="brand-word">YPL</span>
        </button>

        <DesktopNavigation view={view} onNavigate={onNavigate} />

        <div className="gnav-actions">
          <button className="gnav-icon" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
            <Icon n={dark ? "sun" : "moon"} size={18} />
          </button>
          <button className={"gnav-icon gnav-admin" + (admin ? " on" : "")} onClick={onAdminClick} aria-label={adminLabel} title={adminLabel}>
            {admin ? <span className="gnav-admin-tx">로그아웃</span> : <Icon n="lock" size={17} />}
          </button>
          <a className="gnav-discord" href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label="YPL 공식 디스코드 참여 (새 창)">
            <Icon n="discord" size={17} /><span>디스코드</span>
          </a>
          <button className={"gnav-burger" + (menuOpen ? " open" : "")} onClick={onToggleMenu}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={menuOpen} aria-controls="ypl-mobile-menu">
            <span /><span />
          </button>
        </div>
      </div>

      <MobileNavigation view={view} onNavigate={onNavigate} open={menuOpen}>
        <a className="nav-dlink" href={DISCORD_URL} target="_blank" rel="noopener noreferrer" tabIndex={menuOpen ? 0 : -1}>
          <Icon n="discord" size={18} />디스코드 참여<Icon n="ext" size={14} />
        </a>
        <button className="nav-dlink" onClick={onAdminClick} tabIndex={menuOpen ? 0 : -1}>
          <Icon n="lock" size={17} />{adminLabel}
        </button>
      </MobileNavigation>
    </header>
  );
}
