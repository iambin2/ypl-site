import React, { useEffect } from "react";
import { DesktopNavigation, MobileNavigation } from "./Navigation.jsx";
import Icon from "../common/Icon.jsx";

export const DISCORD_URL = "https://discord.gg/T7UZHhGvUh";

/* YPL 마크 — 날개를 편 워글(Braviary). 사용자가 직접 만든 로고를 벡터로 옮긴 것이다.
   세 갈래 날개, V자 몸, 머리 위 볏 깃털 세 장, 흰 얼굴 속 눈매, 갈고리 부리.
   잉크 한 가지 색이고 흰 얼굴은 바탕이 비치는 구멍(evenodd)이라 테마에 따라 반전된다.
   좌표는 원본 1254px 대지 기준, viewBox는 로고 부분만 잘라 쓴다(가로:세로 = 1094:648). */
const MARK_BODY = "M627 930C590 860 500 810 425 765C390 785 340 800 290 795C200 780 140 730 125 668C180 690 260 695 322 688C220 672 110 620 85 490C140 540 220 575 292 590C230 570 150 510 125 440C108 390 112 340 130 293C200 390 300 480 380 545C395 610 425 660 462 690C462 640 482 605 525 580L612 574L716 576C762 590 790 625 797 665C800 685 785 702 758 714L740 742C790 700 850 630 873 545C954 480 1054 390 1124 293C1142 340 1146 390 1129 440C1104 510 1024 570 962 590C1034 575 1114 540 1169 490C1144 620 1034 672 932 688C994 695 1074 690 1129 668C1114 730 1054 780 964 795C914 800 864 785 829 765C754 810 664 860 627 930ZM546 588L712 586C752 600 776 628 782 662C785 682 776 695 762 702C750 690 730 680 708 684C690 690 668 700 662 720C660 760 650 815 628 858C600 810 570 760 553 705L540 660L492 688C496 645 512 612 548 594Z";
const MARK_PARTS = [
  "M440 502C482 494 512 530 530 582L500 580C462 570 442 540 440 502Z",
  "M478 420C548 440 600 510 616 578L575 572C525 548 478 490 478 420Z",
  "M585 383C655 418 712 495 720 580L664 574C615 525 578 455 585 383Z",
  "M640 594L722 624L700 637Z",
];
const MARK_RATIO = 1094 / 648;
export function BrandMark({ size = 30 }) {
  return (
    <svg className="brand-mark" width={Math.round(size * MARK_RATIO)} height={size} viewBox="80 288 1094 648" fill="var(--ink)" aria-hidden="true" focusable="false">
      <path fillRule="evenodd" d={MARK_BODY} />
      {MARK_PARTS.map(d => <path key={d} d={d} />)}
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
