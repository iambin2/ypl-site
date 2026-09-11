import React, { useEffect, useId } from "react";
import { DesktopNavigation, MobileNavigation } from "./Navigation.jsx";
import Icon from "../common/Icon.jsx";

export const DISCORD_URL = "https://discord.gg/T7UZHhGvUh";

/* YPL 마크 — 왼쪽을 보는 워글(Braviary)의 머리. 뒤로 길게 넘어간 볏 깃털 세 장,
   벌린 갈고리 부리, 날카로운 눈. 잉크 한 가지 색이고 눈과 부리선, 깃털 사이 선은
   바탕이 비치는 구멍이다. 그림의 중심이 (32, 26.5)라 viewBox를 위로 5.5 올려 가운데에 둔다. */
const MARK_HEAD = "M8 47C1.5 40 2.5 27 19 22.5C29 20 39 11 50 4C45 13 40 19 35 22.5C44 20 54 20 62 22C55 27 47 31 40 32.5C47 35 53 41 55 49C48 45 41 43 34 43.5C27 44 20 44.5 14 42.6C12 41.5 10 43 8 47Z";
const MARK_CUTS = [
  "M20.5 30.2L30 27L29 31.2Q24.5 32.6 20.5 30.2Z",
  "M9.6 42.2Q15.6 38.6 24 38.6L24 40.2Q16.4 40.4 10.6 43.4Z",
  "M35 22.5Q31.4 24.2 30.2 27.2L31.2 27.8Q32.6 25.2 35.8 23.8Z",
  "M40 32.5Q35.4 33.6 32.6 36.2L33.4 37Q36.4 34.8 40.6 33.8Z",
];
export function BrandMark({ size = 32 }) {
  const mask = "ypl-mark-" + useId().replace(/:/g, "");
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 -5.5 64 64" aria-hidden="true" focusable="false">
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="-5.5" width="64" height="64">
        <rect x="0" y="-5.5" width="64" height="64" fill="#fff" />
        {MARK_CUTS.map(d => <path key={d} d={d} fill="#000" />)}
      </mask>
      <path fill="var(--ink)" d={MARK_HEAD} mask={`url(#${mask})`} />
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
