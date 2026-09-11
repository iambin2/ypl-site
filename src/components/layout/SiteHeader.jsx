import React, { useEffect } from "react";
import { DesktopNavigation, MobileNavigation } from "./Navigation.jsx";
import Icon from "../common/Icon.jsx";

export const DISCORD_URL = "https://discord.gg/T7UZHhGvUh";

/* YPL 마크 — 공식 일러스트를 따라 그린 워글(Braviary)의 머리.
   알아보는 단서는 네 가지다: 위로 솟은 흰 볏(뒤쪽은 복슬한 한 덩어리, 앞쪽은 긴 깃털),
   이마의 V자 무늬(원화의 빨강)와 부리 위 삼각형(파랑), 벌어진 갈고리 부리(노랑),
   어두운 얼굴 속 동그란 눈. 사이트가 무채색이라 원화의 색은 밝기 순서대로 회색에 옮겼다.
   좌표는 원화(475px) 기준이고 viewBox가 머리 부분만 잘라 쓴다. 타일 모서리는 CSS clip-path. */
export function BrandMark({ size = 34 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="40 196 156 156" aria-hidden="true" focusable="false">
      <rect x="40" y="196" width="156" height="156" fill="#1D1D1F" />
      <path fill="#3A3A3C" d="M98 362L104 318L118 300L150 282L176 270L212 260L212 362Z"/>
      <path fill="#E3E3E8" stroke="#1D1D1F" strokeWidth="1.6" strokeLinejoin="round" d="M100 284C98 262 97 240 99 222L104 214L108 219L113 203L118 209L122 200L128 207L133 199L138 206L146 198L149 211L157 213L163 219L170 212L174 222L182 225L187 236L181 240L190 247L180 252L187 262L179 266L181 272L150 284L118 292Z"/>
      <g stroke="#1D1D1F" strokeWidth="1.6" strokeLinejoin="round">
      <path fill="#FFFFFF" d="M83 289.19Q87.99 250.83 81 212Q77 250.4 73 288.81Z"/>
      <path fill="#FFFFFF" d="M92.58 285.43Q99.13 246.7 93 207Q86.85 245.76 81.42 284.57Z"/>
      <path fill="#FFFFFF" d="M105.83 284.74Q117.66 245 113 202Q98.23 241.16 88.17 281.26Z"/>
      <path fill="#FFFFFF" d="M109.49 289.49Q146.99 264.99 163 219Q128.32 246.32 92.51 272.51Z"/>
      <path fill="#FFFFFF" d="M114.72 294.81Q149.76 292 181 272Q145.97 274.81 111.28 279.19Z"/>
      <path fill="#FFFFFF" d="M111.13 299.28Q135.61 306.42 161 311Q139.72 294.81 114.87 288.72Z"/>
      <path fill="#FFFFFF" d="M107.71 301.27Q118.2 315.43 131 328Q125.45 310.43 114.29 296.73Z"/>
      </g>
      <path fill="#48484A" stroke="#1D1D1F" strokeWidth="1.6" strokeLinejoin="round" d="M92 300C96 292 104 289 112 290C118 291 121 296 119 302C117 309 111 314 104 314C98 314 93 309 92 300Z"/>
      <path fill="#8E8E93" stroke="#1D1D1F" strokeWidth="1.6" strokeLinejoin="round" d="M70 266L79 282L90 251L96 278L138 261L141 268L112 290L91 303L75 299C71 290 69 278 70 266Z"/>
      <path fill="#3A3A3C" stroke="#1D1D1F" strokeWidth="1.6" strokeLinejoin="round" d="M75 299L82 285C86 290 88.5 296 89.5 303Z"/>
      <circle cx="101.5" cy="302" r="5.2" fill="#F2F2F7" stroke="#1D1D1F" strokeWidth="1.4"/>
      <circle cx="101" cy="302.4" r="2.6" fill="#1D1D1F"/>
      <path fill="#48484A" d="M95.6 299.6C98 296 105 296 107.6 299.4C104.6 298.4 98.8 298.4 95.6 299.6Z"/>
      <path fill="#636366" stroke="#1D1D1F" strokeWidth="1.6" strokeLinejoin="round" d="M93 322L108 312C107.6 322 104.6 331 100 337C96.6 333 94 328 93 322Z"/>
      <path fill="#C7C7CC" stroke="#1D1D1F" strokeWidth="1.6" strokeLinejoin="round" d="M100 338C103.4 330 106 322 108 313L112 315.6C111.2 324 108.4 332 103.4 340Z"/>
      <path fill="#C7C7CC" stroke="#1D1D1F" strokeWidth="1.6" strokeLinejoin="round" d="M75 299C84 299 96 302 104 306L112 310C108 315.6 101 318.4 95 320.4C89 323.6 84 328 80 333C77.4 336 75.2 338.2 73 339C69 340.2 65.6 339.2 63.8 336.8C59.6 332.6 58.8 326.6 60 321.6C61.6 313.6 66.4 305.6 75 299Z"/>
      <path fill="none" stroke="#8E8E93" strokeWidth="1.2" strokeLinecap="round" d="M78 309C83 308 88 309 91 311"/>
      <rect x="40" y="196" width="156" height="156" rx="36" fill="none" stroke="var(--line-2)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
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
