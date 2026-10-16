import React, { useRef } from "react";
import Icon from "../common/Icon.jsx";
import { TABS, WIDE_TABS, current, tabOf, usePill, useWideNav } from "./Navigation.jsx";

export const DISCORD_URL = "https://discord.gg/T7UZHhGvUh";

/* YPL Wing Y (2026-10-12 교체) — 형태는 그대로(public/brand/ypl-wing-y.svg), 단색(F1): 다크에서 흰색, 라이트에서 검정.
   날개 둘, 가운데 Y, 띠 아래 세 갈래 꼬리. 모든 면이 직선이고 좌우가 정확히 대칭이다.
   상단 바는 고정된 길잡이라서 로고는 움직이지 않는다(2026-10-12, 등장과 로딩 빛 띠를 뺐다). */
const MARK_PATH = "M0 0 L455 118 L699.5 402.5 L944 118 L1399 0 L1322 103 L1007.5 190 L768.5 495.5 L768.5 536.5 L630.5 536.5 L630.5 495.5 L391.5 190 L77 103 Z M99 136.5 L158 218 L424 284 L372.5 212 Z M1026.5 212 L975 284 L1241 218 L1300 136.5 Z M196.5 254 L258 338 L511.5 403 L446.5 316.5 Z M952.5 316.5 L887.5 403 L1141 338 L1202.5 254 Z M630.5 559.5 L768.5 559.5 L768.5 591.5 L882 710 L801.5 785.5 L736.5 621 L728 621 L769.5 785.5 L699.5 841.5 L629.5 785.5 L671 621 L662.5 621 L597.5 785.5 L517 710 L630.5 591.5 Z";
const MARK_RATIO = 1399 / 841.5;
export function BrandMark({ size = 28, className = "" }) {
  return (
    <svg className={"logo" + (className ? " " + className : "")} width={Math.round(size * MARK_RATIO)} height={size}
      viewBox="0 0 1399 841.5" aria-hidden="true" focusable="false">
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
