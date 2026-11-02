import React from "react";
import Icon from "../common/Icon.jsx";
import { TABS, WIDE_TABS, current, tabOf, useWideNav } from "./Navigation.jsx";

export const DISCORD_URL = "https://discord.gg/T7UZHhGvUh";

/* YPL Wing Y (2026-10-27 다듬음, H) — public/brand/ypl-wing-y.svg 와 같은 도형, 단색(F1): 서 있는 면의 글자색을 따른다.
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

/* YPL 워드마크 솔리드(2026-11-01 B안): 그린 글자를 12도 기울인 한 덩어리. 띠를 없애 14px에서도 글자가 뭉치지 않는다.
   skewX(-12) translate(21 0) 안에서 그린다. 상단 바, 홈의 아레나, 대진표와 팀 시트의 이미지 저장이 같이 쓴다. */
export const WORDMARK_PATH = "M0 0 H34.7 L55 27.7 L75.3 0 H110 L69 56 V100 H41 V56 Z"
  + " M118 0 H188 A18 18 0 0 1 206 18 V46 A18 18 0 0 1 188 64 H146 V100 H118 Z M146 24 H178 V40 H146 Z"
  + " M214 0 H242 V76 H286 V100 H214 Z";
export function Wordmark() {
  return (
    <svg className="wordmark" viewBox="0 0 310 100" aria-hidden="true" focusable="false">
      <path transform="skewX(-12) translate(21 0)" fillRule="evenodd" d={WORDMARK_PATH} />
    </svg>
  );
}

/* 바는 바탕 톤에 아래 머리카락 선 하나, 움직이지 않는다. 폰은 Wing Y와 워드마크, 오른쪽 끝에 테마 버튼.
   데스크톱(860 이상)은 1200 안에 브랜드, 화면 이름(지금 화면은 아래 2px 선), 테마 버튼. 넓은 데스크톱은 더보기가 없어
   관리자 로그인이 테마 버튼 옆에 선다(onAdmin). 테마 버튼은 바꿀 쪽을 보인다: 다크에서는 해, 라이트에서는 달. */
export default function SiteHeader({ view, onNavigate, dark, onToggleTheme, moreOpen, onMore, onAdmin }) {
  const wide = useWideNav();
  const cur = tabOf(view, wide);
  const themeLabel = dark ? "라이트 테마로 바꾸기" : "다크 테마로 바꾸기";
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={() => onNavigate("home")} aria-label="YPL 홈으로">
        <BrandMark size={20} /><Wordmark />
      </button>
      <nav className="navlinks" aria-label="주요 메뉴">
        {(wide ? WIDE_TABS : TABS).map(([key, label]) => (
          <button key={key} type="button" className="navlink" data-tab={key} {...current(cur, key)}
            {...(key === "more" ? { "aria-haspopup": "menu", "aria-expanded": moreOpen } : {})}
            onClick={e => key === "more" ? onMore(e.currentTarget) : onNavigate(key)}>{label}</button>
        ))}
      </nav>
      {onAdmin && <button type="button" className="iconbtn" onClick={onAdmin} aria-label="관리자 로그인" title="관리자 로그인"><Icon n="login" size={24} /></button>}
      <button type="button" className="iconbtn" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel}>
        <Icon n={dark ? "sun" : "moon"} size={24} />
      </button>
    </header>
  );
}
