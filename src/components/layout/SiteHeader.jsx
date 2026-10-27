import React, { useRef } from "react";
import Icon from "../common/Icon.jsx";
import { TABS, WIDE_TABS, current, tabOf, usePill, useWideNav } from "./Navigation.jsx";

export const DISCORD_URL = "https://discord.gg/T7UZHhGvUh";

/* YPL Wing Y (2026-10-27 다듬음, F) — public/brand/ypl-wing-y.svg 와 같은 도형, 단색(F1): 다크에서 흰색, 라이트에서 검정.
   2026-10-12 로고를 그린 규칙(윗변과 나란한 깃털 층, 한 사선 위의 깃털 끝, 세 갈래 꼬리)으로 다시 세우고
   깃털을 날개 아래 하나로 줄이고 틈을 넓히고 폭을 0.84배로 모았다. 모든 면이 직선이고 좌우가 정확히 대칭이다.
   상단 바는 고정된 길잡이라서 로고는 움직이지 않는다(2026-10-12, 등장과 로딩 빛 띠를 뺐다). */
const MARK_PATH = "M0 0 L382.2 118 L587.6 402.5 L793 118 L1175.2 0 L1110.5 103 L850.8 183.2 L645.5 495.5 L645.5 536.5 L529.6 536.5 L529.6 495.5 L324.4 183.2 L64.7 103 Z M161.3 256.8 L109.8 174.8 L441.7 277.3 L496.2 360.2 Z M679 360.2 L733.5 277.3 L1065.4 174.8 L1013.9 256.8 Z M529.6 580.5 L645.5 580.5 L645.5 612.5 L740.9 731 L680 806.5 L625.4 642 L603.1 642 L638 806.5 L587.6 862.5 L537.2 806.5 L572 642 L549.8 642 L495.2 806.5 L434.3 731 L529.6 612.5 Z";
const MARK_RATIO = 1175.2 / 862.5;
export function BrandMark({ size = 24, className = "" }) {
  return (
    <svg className={"logo" + (className ? " " + className : "")} width={Math.round(size * MARK_RATIO)} height={size}
      viewBox="0 0 1175.2 862.5" aria-hidden="true" focusable="false">
      <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/* YPL 워드마크 B "띠"(E6): 그린 글자를 12도 기울이고, Wing Y 꼬리의 띠와 같은 높이(56–64)로 한 줄의 틈이 세 글자를 관통한다.
   틈은 마스크가 아니라 도형에 새겼다. 마스크 경계가 P의 아래끝(64)과 겹치면 안티에일리어싱이 곱해져 가는 회색 선이 남는다.
   skewX(-12) translate(21 0) 안에서 그린다. 상단 바와 대진표 이미지 저장(BracketsPage)이 같이 쓴다. */
export const WORDMARK_PATH = "M0 0 H34.7 L55 27.7 L75.3 0 H110 L69 56 H41 Z M41 64 H69 V100 H41 Z"
  + " M118 0 H188 A18 18 0 0 1 206 18 V46 A18 18 0 0 1 202.9666 56 H118 Z M146 24 H178 V42 H146 Z M118 64 H146 V100 H118 Z"
  + " M214 0 H242 V56 H214 Z M214 64 H242 V76 H286 V100 H214 Z";
export function Wordmark() {
  return (
    <svg className="wordmark" viewBox="0 0 310 100" aria-hidden="true" focusable="false">
      <path transform="skewX(-12) translate(21 0)" fillRule="evenodd" d={WORDMARK_PATH} />
    </svg>
  );
}

/* G3: 데스크톱은 화면 가장자리에서 떨어진 알약형 글래스 바, 폰은 같은 바에 로고와 테마 버튼만.
   바의 폭은 본문과 같아 가장자리가 본문과 한 줄에 맞는다. 넓은 데스크톱은 더보기가 없어 관리자 로그인이 테마 버튼 옆에 선다(onAdmin). */
export default function SiteHeader({ view, onNavigate, dark, onToggleTheme, moreOpen, onMore, onAdmin }) {
  const nav = useRef(null);
  const wide = useWideNav();
  const cur = tabOf(view, wide);
  usePill(nav, cur + (wide ? ":wide" : ""));
  const themeLabel = dark ? "라이트 테마로 바꾸기" : "다크 테마로 바꾸기";
  return (
    <header className="topbar glass">
      <button type="button" className="brand press" onClick={() => onNavigate("home")} aria-label="YPL 홈으로">
        <span className="brand-logo"><BrandMark /></span><Wordmark />
      </button>
      <nav className="navlinks groove" aria-label="주요 메뉴" ref={nav}>
        <span className="pill-ind" aria-hidden="true"><i /><i /><i /></span>
        {(wide ? WIDE_TABS : TABS).map(([key, label]) => (
          <button key={key} type="button" className="navlink press" {...current(cur, key)}
            {...(key === "more" ? { "aria-haspopup": "menu", "aria-expanded": moreOpen } : {})}
            onClick={e => key === "more" ? onMore(e.currentTarget) : onNavigate(key)}>{label}</button>
        ))}
      </nav>
      {onAdmin && <button type="button" className="iconbtn press" onClick={onAdmin} aria-label="관리자 로그인" title="관리자 로그인"><Icon n="lock" size={22} /></button>}
      <button type="button" className="iconbtn press" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
        <span className="theme-ic"><Icon n="sun" size={22} className="i-sun" /><Icon n="moon" size={22} className="i-moon" /></span>
      </button>
    </header>
  );
}
