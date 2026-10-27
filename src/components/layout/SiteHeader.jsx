import React, { useRef } from "react";
import Icon from "../common/Icon.jsx";
import { TABS, WIDE_TABS, current, tabOf, usePill, useWideNav } from "./Navigation.jsx";

export const DISCORD_URL = "https://discord.gg/T7UZHhGvUh";

/* YPL Wing Y (2026-10-27 다듬음, H) — public/brand/ypl-wing-y.svg 와 같은 도형, 단색(F1): 다크에서 흰색, 라이트에서 검정.
   2026-10-12 로고를 그린 규칙(윗변과 나란한 깃털 층, 한 사선 위의 깃털 끝, 세 갈래 꼬리)으로 다시 세우고
   깃털을 날개 아래 하나로 줄이고, 획과 몸통을 굵게, 틈은 바에서 보일 만큼, 폭은 0.94배로 모았다.
   깃털은 팔의 바깥선에서 멈춘다(겹치면 evenodd 가 구멍을 낸다). 모든 면이 직선이고 좌우가 정확히 대칭이다.
   상단 바는 고정된 길잡이라서 로고는 움직이지 않는다(2026-10-12, 등장과 로딩 빛 띠를 뺐다). */
const MARK_PATH = "M0 0 L427.7 118 L657.5 430 L887.4 118 L1315.1 0 L1199.8 164 L947.9 233.5 L755.3 495.5 L755.3 536.5 L559.8 536.5 L559.8 495.5 L367.1 233.5 L115.3 164 Z M246.8 351.1 L149.5 212.7 L403.3 282.8 L506.3 422.7 Z M808.8 422.7 L911.7 282.8 L1165.6 212.7 L1068.3 351.1 Z M559.8 574.5 L755.3 574.5 L755.3 608.1 L916.1 732.5 L805.8 811.8 L713.7 639.1 L692.3 639.1 L751.1 811.8 L657.5 870.6 L564 811.8 L622.8 639.1 L601.3 639.1 L509.3 811.8 L399 732.5 L559.8 608.1 Z";
const MARK_RATIO = 1315.1 / 870.6;
export function BrandMark({ size = 24, className = "" }) {
  return (
    <svg className={"logo" + (className ? " " + className : "")} width={Math.round(size * MARK_RATIO)} height={size}
      viewBox="0 0 1315.1 870.6" aria-hidden="true" focusable="false">
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
          <button key={key} type="button" className="navlink press" data-tab={key} {...current(cur, key)}
            {...(key === "more" ? { "aria-haspopup": "menu", "aria-expanded": moreOpen } : {})}
            onClick={e => key === "more" ? onMore(e.currentTarget) : onNavigate(key)}>{label}</button>
        ))}
      </nav>
      {onAdmin && <button type="button" className="iconbtn press" onClick={onAdmin} aria-label="관리자 로그인" title="관리자 로그인"><Icon n="login" size={22} /></button>}
      <button type="button" className="iconbtn press" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
        <span className="theme-ic"><Icon n="sun" size={22} className="i-sun" /><Icon n="moon" size={22} className="i-moon" /></span>
      </button>
    </header>
  );
}
