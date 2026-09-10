import React from "react";
import { NAV_ITEMS } from "./Navigation.jsx";
import Icon from "../common/Icon.jsx";

const YEAR_FOUNDED = 2023;

/* 사이트의 마지막 줄.
   지금까지 모든 페이지가 그냥 끝나 버려서, 스크롤을 다 내리면 화면이 비었습니다.
   등록부에는 판권장이 있어야 합니다 — 이름 · 갈 곳 · 출처. */
export default function SiteFooter({ onNavigate, tagline }) {
  const year = new Date().getFullYear();
  const span = year > YEAR_FOUNDED ? `${YEAR_FOUNDED}–${year}` : `${YEAR_FOUNDED}`;

  return (
    <footer className="site-foot">
      <div className="site-foot-in">
        <div className="site-foot-mark">
          <button className="site-foot-brand" onClick={() => onNavigate("home")}>
            <span className="disp">YPL</span>
            <small>POKÉMON CENTER YONSEI</small>
          </button>
          {tagline && <p className="site-foot-tag">{tagline}</p>}
        </div>

        <nav className="site-foot-nav" aria-label="사이트 지도">
          {NAV_ITEMS.map(([key, label]) => (
            <button key={key} onClick={() => onNavigate(key)}>{label}</button>
          ))}
        </nav>

        <div className="site-foot-side">
          <a
            className="y-btn y-btn-secondary"
            href="https://discord.gg/T7UZHhGvUh"
            target="_blank"
            rel="noopener noreferrer"
          >디스코드 참여<Icon n="ext" size={13} /></a>
        </div>
      </div>

      <div className="site-foot-rule">
        <span>© {span} Yonsei Pokémon League</span>
        <span className="site-foot-fine">
          연세대학교 포켓몬스터 동아리 포켓몬 센터 연세점의 비공식 기록 사이트입니다.
          Pokémon 및 포켓몬스터는 Nintendo · Creatures · GAME FREAK 의 상표입니다.
        </span>
      </div>
    </footer>
  );
}
