import React from "react";
import { Reveal, Icon, PageHead, STAGGER, SectionHead } from "../components/index.js";
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
  { t: "공식 파티 제출", d: "대회 시작 전까지 사이트에서 파티를 제출합니다.", cta: "팀 빌더", to: "builder" },
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

function Comps({ items }) {
  return (
    <div className="ab-comps">
      {items.map((c, i) => (
        <Reveal key={c.name} delay={i * STAGGER.tile} className="ab-comp">
          <div className="ab-comp-h"><b>{c.name}</b><span className="y-chip">{c.tag}</span></div>
          <p>{c.desc}</p>
        </Reveal>
      ))}
    </div>
  );
}

/* ============================== ABOUT ============================== */
export default function AboutPage({ go }) {
  return (<section className="sec about">
    <PageHead plain="소개" desc="연세대학교 포켓몬스터 동아리 포켓몬 센터 연세점, 줄여서 포센연에서 시작한 배틀 리그의 발자취입니다." />

    {/* 디스코드에서 넘어온 사람의 첫 질문: 나도 나갈 수 있나. */}
    <section className="ab-block" id="join">
      <SectionHead plain="참가하는" silver="법" />
      <ol className="ab-flow ab-join">
        {JOIN.map((s, i) => (
          <Reveal tag="li" key={s.t} delay={i * STAGGER.tile}>
            <span className="ab-flow-n">{i + 1}</span>
            <b>{s.t}</b>
            <span>{s.d}</span>
            {s.href ? <a className="ypl-btn ypl-btn--glass ypl-btn--sm press hl" href={s.href} target="_blank" rel="noreferrer">{s.cta}<Icon n="ext" size={16} /></a>
              : <button type="button" className="ypl-btn ypl-btn--glass ypl-btn--sm press hl" onClick={() => go?.(s.to)}>{s.cta}</button>}
          </Reveal>
        ))}
      </ol>
    </section>

    <section className="ab-block">
      <SectionHead plain="시즌의" silver="흐름" />
      <ol className="ab-flow">
        {FLOW.map((s, i) => (
          <Reveal tag="li" key={s.t} delay={i * STAGGER.tile} className={i === FLOW.length - 1 ? "last" : ""}>
            <span className="ab-flow-n">{i + 1}</span>
            <b>{s.t}</b>
            <span>{s.d}</span>
          </Reveal>
        ))}
      </ol>
    </section>

    <section className="ab-block">
      <SectionHead plain="YPL의" silver="기록" />
      <div className="ab-records">
        {RECORDS.map((r, i) => (
          <Reveal key={r.t} delay={i * STAGGER.tile} className="ab-rec">
            <b>{r.t}</b>
            <p>{r.d}</p>
          </Reveal>
        ))}
      </div>
    </section>

    <section className="ab-block">
      <SectionHead plain="리그" silver="연혁" />
      <ol className="ab-timeline">
        {TIMELINE.map((t, i) => (
          <Reveal tag="li" key={t.date} delay={i * STAGGER.tile}>
            <b>{t.title}</b>
            <time className="tnum">{dateText(t)}</time>
            <p>{t.body}</p>
          </Reveal>
        ))}
      </ol>
    </section>

    <section className="ab-block">
      <SectionHead plain="세 가지" silver="대회" />
      <Comps items={COMPS} />
    </section>

    <section className="ab-block">
      <SectionHead plain="정규" silver="리그" />
      <Reveal tag="p" className="ab-lead">2025년 6월부터 YPL은 두 개의 정규 리그로 운영됩니다.</Reveal>
      <Comps items={LEAGUES} />
    </section>
  </section>);
}
