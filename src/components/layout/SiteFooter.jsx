import React from "react";
import Icon from "../common/Icon.jsx";
import { BrandMark, DISCORD_URL, Wordmark } from "./SiteHeader.jsx";

const YEAR_FOUNDED = 2023;

/* 바닥글은 조용한 한 단락: 로고, 한 줄, 디스코드, 저작권. 메뉴는 탭 바와 상단 바가 이미 갖고 있어 되풀이하지 않는다. */
export default function SiteFooter({ onNavigate, tagline }) {
  const year = new Date().getFullYear();
  const span = year > YEAR_FOUNDED ? `${YEAR_FOUNDED}–${year}` : `${YEAR_FOUNDED}`;

  return (
    <footer className="site-foot">
      <div className="site-foot-in">
        <div className="site-foot-mark">
          <button type="button" className="brand press" onClick={() => onNavigate("home")} aria-label="YPL 홈으로">
            <span className="brand-logo"><BrandMark /></span><Wordmark />
          </button>
          {tagline && <p className="site-foot-tag">{tagline}</p>}
          <a className="ypl-btn ypl-btn--sm ypl-btn--glass press hl site-foot-dc" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
            <Icon n="discord" size={16} />디스코드 참여<Icon n="ext" size={16} />
          </a>
        </div>

        <div className="site-foot-rule">
          <span>© {span} Yonsei Pokémon League</span>
          <span className="site-foot-fine">
            연세대학교 포켓몬스터 동아리 포켓몬 센터 연세점의 비공식 기록 사이트입니다.
            Pokémon 및 포켓몬스터는 Nintendo, Creatures, GAME FREAK의 상표입니다.
          </span>
        </div>
      </div>
    </footer>
  );
}
