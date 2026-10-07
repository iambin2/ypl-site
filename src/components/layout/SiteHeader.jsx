import React, { useEffect, useId } from "react";
import { DesktopNavigation, MobileNavigation } from "./Navigation.jsx";
import Icon from "../common/Icon.jsx";

export const DISCORD_URL = "https://discord.gg/T7UZHhGvUh";

/* YPL Wing Y — 승인된 C안. 이마깃 없이 워글의 꼬리 띠만 남긴다.
   원본: public/brand/ypl-wing-y.svg. 테마의 빛 색상으로 채운다. */
const MARK_PATH = "M410 134 L650 238 C687 255 723 338 768 411 C813 338 849 255 886 238 L1126 134 C1111 200 1056 241 989 280 L1079 259 C1049 342 974 367 894 405 C854 425 826 455 808 496 L856 598 Q835 610 809 617 L798 589 L804 619 Q768 629 732 619 L738 589 L727 617 Q701 610 680 598 L728 496 C710 455 682 425 642 405 C562 367 487 342 457 259 L547 280 C480 241 425 200 410 134 Z M674 608 Q696 620 724 627 L715 663 L660 636 Z M735 630 Q768 639 801 630 L809 675 Q768 685 727 675 Z M812 627 Q840 620 862 608 L876 636 L821 663 Z";
const MARK_RATIO = 716 / 546;
const SILVER_STOPS = [[0, 1], [.28, 2], [.54, 3], [.78, 4], [1, 5]];
export function BrandMark({ size = 24 }) {
  const id = useId();
  return (
    <svg className="brand-mark" width={Math.round(size * MARK_RATIO)} height={size} viewBox="410 134 716 546" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1=".3" x2="1" y2=".7">
          {SILVER_STOPS.map(([at, n]) => <stop key={n} offset={at} style={{ stopColor: `var(--silver-${n})` }} />)}
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

export default function SiteHeader({
  view,
  onNavigate,
  dark,
  onToggleTheme,
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

  const themeLabel = dark ? "라이트 모드로 전환" : "다크 모드로 전환";
  const adminLabel = admin ? "관리자 로그아웃" : "관리자 로그인";

  return (
    <header className={"gnav" + (menuOpen ? " menu-open" : "")}>
      <div className="gnav-in">
        <button className="brand" onClick={() => onNavigate("home")} aria-label="YPL 홈으로">
          <BrandMark />
          <span className="brand-word silver">YPL</span>
        </button>

        <DesktopNavigation view={view} onNavigate={onNavigate} />

        <div className="gnav-actions">
          <button className="iconbtn press" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
            <Icon n={dark ? "sun" : "moon"} size={18} />
          </button>
          <button className={"iconbtn gnav-admin press" + (admin ? " on" : "")} onClick={onAdminClick} aria-label={adminLabel} title={adminLabel}>
            {admin ? <span className="gnav-admin-tx">로그아웃</span> : <Icon n="lock" size={18} />}
          </button>
          <a className="gnav-discord ypl-btn ypl-btn--sm ypl-btn--glass press" href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label="YPL 공식 디스코드 참여 (새 창)">
            <Icon n="discord" size={16} /><span>디스코드</span>
          </a>
          <button className={"iconbtn gnav-burger press" + (menuOpen ? " open" : "")} onClick={onToggleMenu}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={menuOpen} aria-controls="ypl-mobile-menu">
            <span /><span />
          </button>
        </div>
      </div>

      <MobileNavigation view={view} onNavigate={onNavigate} open={menuOpen}>
        <a className="ypl-btn ypl-btn--primary press" href={DISCORD_URL} target="_blank" rel="noopener noreferrer" tabIndex={menuOpen ? 0 : -1}>
          <Icon n="discord" size={16} />디스코드 참여<Icon n="ext" size={16} />
        </a>
        <button className="ypl-btn ypl-btn--glass press" onClick={onAdminClick} tabIndex={menuOpen ? 0 : -1}>
          <Icon n="lock" size={16} />{adminLabel}
        </button>
      </MobileNavigation>
    </header>
  );
}
