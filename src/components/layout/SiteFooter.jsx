import React from "react";
import Icon from "../common/Icon.jsx";
import { BrandMark, DISCORD_URL } from "./SiteHeader.jsx";

const YEAR_FOUNDED = 2023;

const GROUPS = [
  ["리그", [["about", "소개"], ["news", "공지"], ["board", "게시판"]]],
  ["기록", [["records", "기록"], ["bracket", "대진표"], ["titles", "칭호"], ["champions", "명예의 전당"]]],
  ["도구", [["builder", "팀 빌더"]]],
];

export default function SiteFooter({ onNavigate, tagline }) {
  const year = new Date().getFullYear();
  const span = year > YEAR_FOUNDED ? `${YEAR_FOUNDED}–${year}` : `${YEAR_FOUNDED}`;

  return (
    <footer className="site-foot">
      <div className="site-foot-in">
        <div className="site-foot-top">
          <div className="site-foot-mark">
            <button className="brand" onClick={() => onNavigate("home")} aria-label="YPL 홈으로">
              <BrandMark size={26} /><span className="brand-word">YPL</span>
            </button>
            {tagline && <p className="site-foot-tag">{tagline}</p>}
            <a className="btn btn-ghost btn-sm site-foot-dc" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
              <Icon n="discord" size={15} />디스코드 참여<Icon n="ext" size={13} />
            </a>
          </div>

          <nav className="site-foot-nav" aria-label="사이트 지도">
            {GROUPS.map(([title, items]) => (
              <div className="site-foot-col" key={title}>
                <h3>{title}</h3>
                {items.map(([key, label]) => (
                  <button key={key} onClick={() => onNavigate(key)}>{label}</button>
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="site-foot-rule">
          <span>© {span} Yonsei Pokémon League</span>
          <span className="site-foot-fine">
            연세대학교 포켓몬스터 동아리 포켓몬 센터 연세점의 비공식 기록 사이트입니다.
            Pokémon 및 포켓몬스터는 Nintendo · Creatures · GAME FREAK 의 상표입니다.
          </span>
        </div>
      </div>
    </footer>
  );
}
