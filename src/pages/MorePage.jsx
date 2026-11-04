import React from "react";
import { Choice, Row } from "../components/common/Board.jsx";
import Icon from "../components/common/Icon.jsx";
import { PushSwitch } from "../components/common/PushControl.jsx";
import { DISCORD_URL } from "../components/layout/SiteHeader.jsx";

/* 더보기 (DESIGN.md "Bars and navigation"): 탭 바에 없는 화면을 묶음 제목 아래 같은 줄로 두고,
   그 아래에 설정(테마, 공지 알림)과 관리자 로그인을 둔다. 줄은 52, 오른쪽 끝에 → 또는 바깥으로 나가는 표시. */
const GROUPS = [
  ["기록", [["titles", "칭호"], ["champions", "명예의 전당"]]],
  ["함께하기", [["board", "게시판"], ["builder", "팀 빌더"], ["battle", "배틀"], ["calc", "계산기"]]],
  ["리그", [["about", "소개"]]],
];

const THEMES = [["dark", "어둡게"], ["light", "밝게"], ["system", "기기 설정"]];
export default function MorePage({ go, themePref, onTheme, admin, onAdmin }) {
  return (
    <section className="more">
      <h1 className="t32">더보기</h1>
      {GROUPS.map(([label, items]) => (
        <div className="more-group" key={label}>
          <p className="t12 dim more-label">{label}</p>
          <div className="stack">
            {items.map(([key, text]) => <Row key={key} title={text} value={<Icon n="chevr" size={20} />} onClick={() => go(key)} />)}
            {label === "리그" && <a className="pn row" href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
              <span className="row-main"><b className="t15">디스코드 참여</b></span><span className="row-value"><Icon n="ext" size={20} /></span>
            </a>}
          </div>
        </div>
      ))}
      <div className="more-group">
        <p className="t12 dim more-label">설정</p>
        <Choice name="theme" options={THEMES.map(([, label]) => label)} value={THEMES.find(([key]) => key === themePref)?.[1]} onChange={v => { const key = THEMES.find(([, label]) => label === v)?.[0]; if (key && key !== themePref) onTheme(key); }} />
        <div className="stack more-switch"><PushSwitch /></div>
      </div>
      <div className="more-group">
        <div className="stack"><Row title={admin ? "관리자 로그아웃" : "관리자 로그인"} value={<Icon n={admin ? "logout" : "login"} size={20} />} onClick={onAdmin} /></div>
      </div>
    </section>
  );
}
