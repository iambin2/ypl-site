import React from "react";
import Icon from "../common/Icon.jsx";
import { BrandMark, DISCORD_URL, Wordmark } from "./SiteHeader.jsx";

const YEAR_FOUNDED = 2023;

/* 바닥글은 바탕 위, 머리카락 선 아래의 조용한 한 단락: 24 브랜드, 리그의 한 줄, 그 오른쪽 끝에 관리자 로그인과 디스코드 참여가
   같은 15의 밑줄 단어로 한 줄에 선다(2026-11-06: 맨 아래 작은 글씨로는 운영진이 찾지 못했다. 모든 폭에서 보인다).
   그 아래 12px의 한 줄은 저작권과 개인정보처리방침, 그 아래 팬 사이트 안내. 메뉴는 탭 바와 상단 바가 이미 갖고 있어 되풀이하지 않는다. */
export default function SiteFooter({ onNavigate, tagline, onAdmin }) {
  const year = new Date().getFullYear();
  const span = year > YEAR_FOUNDED ? `${YEAR_FOUNDED}–${year}` : `${YEAR_FOUNDED}`;

  return (
    <footer className="site-foot">
      <div className="site-foot-in">
        <div className="site-foot-mark">
          <button type="button" className="brand" onClick={() => onNavigate("home")} aria-label="YPL 홈으로">
            <BrandMark size={24} /><Wordmark />
          </button>
          {tagline && <p className="site-foot-tag">{tagline}</p>}
          <span className="site-foot-links">
            {onAdmin && <button type="button" className="site-foot-login" onClick={onAdmin}>관리자 로그인</button>}
            <a className="site-foot-dc" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">디스코드 참여<Icon n="ext" size={16} /></a>
          </span>
        </div>

        <div className="site-foot-rule">
          <span className="site-foot-line">
            <span>© {span} Yonsei Pokémon League</span>
            <button type="button" className="site-foot-admin" onClick={() => onNavigate("privacy")}>개인정보처리방침</button>
          </span>
          <span className="site-foot-fine">
            연세대학교 포켓몬스터 동아리 포켓몬 센터 연세점이 운영하는 팬 사이트로, Nintendo, Creatures, GAME FREAK, The Pokémon Company와 관계가 없습니다.
            Pokémon 및 포켓몬스터는 각 회사의 상표입니다.
          </span>
        </div>
      </div>
    </footer>
  );
}
