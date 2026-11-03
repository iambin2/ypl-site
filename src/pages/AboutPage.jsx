import React, { useEffect, useState } from "react";
import { Icon } from "../components/index.js";
import { Counter, SectionHead } from "../components/common/Board.jsx";
import Seg from "../components/common/Seg.jsx";
import { loadFacts, seenFacts } from "../components/home/homeFacts.js";
import { formatDate } from "../services/dateFormat.js";
import { DISCORD_URL } from "../components/layout/SiteHeader.jsx";

const FLOW = [
  { t: "매월 파이컵", d: "정규 대회에 출전합니다." },
  { t: "포인트 누적", d: "성적이 랭킹으로 쌓입니다." },
  { t: "챔피언스 시리즈", d: "학기 말에 가장 큰 대회가 열립니다." },
  { t: "시즌 챔피언", d: "그 시즌의 주인공이 됩니다." },
];
const JOIN = [
  { t: "디스코드 입장", d: "배틀과 중계는 디스코드에서 열립니다.", cta: "디스코드 참여", href: DISCORD_URL },
  { t: "공지에서 신청", d: "대회 공지의 신청 버튼으로 참가합니다.", cta: "공지 보기", to: "news" },
  { t: "공식 파티 제출", d: "대회 시작 전까지 사이트에서 파티를 제출합니다.", cta: "팀 빌더 열기", to: "builder" },
];
const RECORDS = [
  { t: "모든 대회의 경기 결과", d: "대진표에서 확정된 결과가 트레이너, 대회, 포켓몬 기록에 자동으로 반영됩니다." },
  { t: "역대 시즌의 주인공", d: "챔피언스 시리즈 우승자와 우승 엔트리를 명예의 전당에 보관합니다." },
  { t: "트레이너가 획득한 기록", d: "타입 엑스퍼트, 지방 엘리트, 파트너처럼 조건을 달성하면 받는 칭호를 관리합니다." },
];
// 날짜는 사이트의 한 표기(formatDate)로 쓴다. 기간은 "2023년 – 2025년"처럼 띄운 반각 대시로 잇는다.
const TIMELINE = [
  { date: "2023.05", title: "파이컵 탄생", body: "연세대학교 포켓몬스터 동아리 ‘포켓몬 센터 연세점(포센연)’이 자체 대회인 파이컵을 처음 열었습니다." },
  { date: "2023", until: "2025", title: "매달 이어진 도전", body: "파이컵이 매월 정규 대회로 자리 잡으며 수많은 트레이너의 성적과 칭호가 쌓여 갔습니다." },
  { date: "2025.06", title: "YPL 체제 출범", body: "2025년 6월 리그가 마스터 리그와 루키 리그로 나뉘면서 지금의 YPL(Yonsei Pokémon League) 체제가 자리 잡았습니다." },
  { date: "2026.09", title: "YPL 시즌 3 개막", body: "참가 신청과 공식 파티 제출을 이 사이트에서 받기 시작했습니다. 대진과 결과도 이곳에 바로 기록됩니다." },
];
// 대회와 리그는 같은 종류의 정보라 같은 모양(이름, 성격 칩, 설명 한 줄)으로 둔다.
const COMPS = [
  { tag: "매월 정규 대회", name: "파이컵", desc: "매달 열리는 정규 대회입니다. 여기서 얻은 포인트로 챔피언스 시리즈 출전권에 도전할 수 있습니다." },
  { tag: "번개 대회", name: "파이컵 라이트", desc: "포인트 없이 자유롭게 즐기는 번개 대회입니다. 자체 상품을 걸고 가볍게 진행합니다." },
  { tag: "학기 최강전", name: "챔피언스 시리즈", desc: "한 학기 동안 동아리의 챔피언을 가리는 가장 권위 있는 대회입니다." },
];
const LEAGUES = [
  { tag: "상위 정규 리그", name: "마스터 리그", desc: "리그가 둘로 나뉘며 새로 생긴 상위 정규 리그입니다. YPL 시즌의 중심입니다." },
  { tag: "입문 정규 리그", name: "루키 리그", desc: "신입과 초보 트레이너를 위한 입문 리그입니다. 우승하면 마스터 리그로 올라가고 ‘슈퍼루키’ 칭호를 얻습니다." },
];
const dateText = t => t.until ? `${formatDate(t.date)} – ${formatDate(t.until)}` : formatDate(t.date);

/* 대회와 리그는 같은 모양: 이름, 성격을 말하는 회색 줄, 설명 한 줄 */
function Comps({ items }) {
  return (
    <div className="stack">
      {items.map(c => (
        <div key={c.name} className="pn ab-panel">
          <b className="t15">{c.name}</b>
          <span className="t12 dim">{c.tag}</span>
          <p className="read">{c.desc}</p>
        </div>
      ))}
    </div>
  );
}

/* ============================== ABOUT ==============================
   제목과 한 문단, 그다음 구획마다 20 제목과 패널 스택. 번호는 20의 숫자로 앞에 선다. */
export default function AboutPage({ go, data, admin }) {
  // 리그의 숫자: 홈의 카운터와 같은 계산이라 새로 세는 것이 없다. 이미 센 값은 첫 그림부터 쓴다.
  const [facts, setFacts] = useState(() => admin ? null : seenFacts());
  useEffect(() => {
    let live = true;
    loadFacts(data, admin).then(next => { if (live) setFacts(next); }).catch(error => console.warn("about facts read failed", error));
    return () => { live = false; };
  }, [data, admin]);
  const [year, month] = String(facts?.first || "").match(/\d+/g) || [];
  return (<section className="about">
    <h1 className="t32">소개</h1>
    <div className="stack ab-nums">
      <Counter label="첫 대회" value={year ?? null} cells={4} unit="년"
        after={year && <><span className="t15">년</span><Seg value={month || ""} h={40} cells={2} label={month ? `${Number(month)}월` : ""} className="ab-month" /><span className="t15">월</span></>} />
      <Counter label="대회" value={facts?.tournaments ?? null} unit="회" onClick={() => go?.("records", { tab: "tour" })} />
      <Counter label="트레이너" value={facts?.trainers ?? null} unit="명" onClick={() => go?.("records", { tab: "trainer" })} />
    </div>
    <p className="read ab-lede">연세대학교 포켓몬스터 동아리 포켓몬 센터 연세점, 줄여서 포센연에서 시작한 배틀 리그의 발자취입니다.</p>

    {/* 디스코드에서 넘어온 사람의 첫 질문: 나도 나갈 수 있나. */}
    <section className="ab-sec" id="join" aria-labelledby="ab-join">
      <SectionHead id="ab-join" title="참가하는 법" />
      <ol className="stack ab-list">
        {JOIN.map((s, i) => (
          <li key={s.t} className="pn ab-step">
            <span className="num t20 ab-n">{i + 1}</span>
            <span className="ab-step-body">
              <b className="t15">{s.t}</b>
              <span className="t12 dim reg">{s.d}</span>
              {s.href ? <a className="ab-go t12" href={s.href} target="_blank" rel="noreferrer">{s.cta}<Icon n="ext" size={16} /></a>
                : <button type="button" className="ab-go t12" onClick={() => go?.(s.to)}>{s.cta}<Icon n="arrow" size={16} /></button>}
            </span>
          </li>
        ))}
      </ol>
    </section>

    <section className="ab-sec" aria-labelledby="ab-time">
      <SectionHead id="ab-time" title="리그 연혁" />
      <ol className="stack ab-list">
        {TIMELINE.map(t => (
          <li key={t.date} className="pn ab-time">
            <time className="num t15">{dateText(t)}</time>
            <span className="ab-step-body"><b className="t15">{t.title}</b><span className="t12 dim reg">{t.body}</span></span>
          </li>
        ))}
      </ol>
    </section>

    <section className="ab-sec" aria-labelledby="ab-flow">
      <SectionHead id="ab-flow" title="시즌의 흐름" />
      <ol className="stack ab-list">
        {FLOW.map((s, i) => (
          <li key={s.t} className="ab-step pn">
            <span className="num t20 ab-n">{i + 1}</span>
            <span className="ab-step-body"><b className="t15">{s.t}</b><span className="t12 dim reg">{s.d}</span></span>
          </li>
        ))}
      </ol>
    </section>

    <section className="ab-sec" aria-labelledby="ab-rec">
      <SectionHead id="ab-rec" title="YPL의 기록" />
      <div className="stack">
        {RECORDS.map(r => <div key={r.t} className="pn ab-panel"><b className="t15">{r.t}</b><p className="read">{r.d}</p></div>)}
      </div>
    </section>

    <section className="ab-sec" aria-labelledby="ab-comps">
      <SectionHead id="ab-comps" title="세 가지 대회" />
      <Comps items={COMPS} />
    </section>

    <section className="ab-sec" aria-labelledby="ab-leagues">
      <SectionHead id="ab-leagues" title="정규 리그" />
      <p className="t12 dim reg ab-note">2025년 6월부터 YPL은 두 개의 정규 리그로 운영됩니다.</p>
      <Comps items={LEAGUES} />
    </section>
  </section>);
}
