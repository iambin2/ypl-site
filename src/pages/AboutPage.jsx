import React from "react";
import { Reveal, Icon } from "../components/index.js";

const FLOW = [
  { t: "매월 파이컵", d: "정규 대회에 출전합니다" },
  { t: "포인트 누적", d: "성적이 랭킹으로 쌓입니다" },
  { t: "챔피언스 시리즈", d: "학기말 최고 권위의 대회" },
  { t: "시즌 챔피언", d: "그 시즌의 주인공이 됩니다" },
];
const RECORDS = [
  { k: "전적", icon: "chart", t: "모든 대회의 경기 결과", d: "대진표에서 확정된 결과가 트레이너, 대회, 포켓몬 기록으로 자동 연동됩니다." },
  { k: "챔피언", icon: "crown", t: "역대 시즌의 주인공", d: "챔피언스 시리즈 우승자와 우승 엔트리를 명예의 전당에 보관합니다." },
  { k: "칭호", icon: "medal", t: "트레이너가 획득한 기록", d: "타입 엑스퍼트, 지방 엘리트, 파트너 등 조건 달성 칭호를 관리합니다." },
];
const TIMELINE = [
  { date: "2023.05", title: "파이컵 탄생", body: "연세대학교 포켓몬스터 동아리 '포켓몬 센터 연세점(포센연)' 내에서 자체적으로 치러진 대회, 파이컵이 처음 개최되었습니다." },
  { date: "2023 – 2025", title: "매월의 도전", body: "파이컵이 매월 정규 대회로 자리 잡으며 수많은 트레이너의 성적과 칭호가 쌓여 갔습니다." },
  { date: "2025.06", title: "YPL 체제 확립", body: "2025년 6월 마스터 리그와 루키 리그로의 양분화라는 대격변을 맞이하며, 비로소 YPL (Yonsei Pokémon League) 체제가 확립되었습니다." },
];
const COMPS = [
  { tag: "매월 정규 대회", name: "파이컵", desc: "매월 펼쳐지는 정규 대회입니다. 이곳에서 획득한 포인트로 챔피언스 시리즈 출전권을 노릴 수 있습니다." },
  { tag: "번개 이벤트", name: "파이컵 라이트", desc: "포인트 없이 자유롭게 즐기는 번개 형식의 대회입니다. 자체적인 상품을 걸고 가볍게 진행됩니다." },
  { tag: "최고 권위", name: "챔피언스 시리즈", desc: "한 학기 동아리의 챔피언을 결정짓는 최고 권위의 대회입니다.", major: true },
];
const LEAGUES = [
  { tier: "상위 정규 리그", name: "마스터 리그", en: "Master League", key: "master", desc: "리그 양분화로 신설된 상위 정규 리그입니다. YPL 시즌의 중심입니다." },
  { tier: "입문 정규 리그", name: "루키 리그", en: "Rookie League", key: "rookie", desc: "신입과 초보 트레이너를 위한 입문 리그입니다. 우승하면 마스터 리그로 승급하며 '슈퍼루키' 칭호를 얻습니다." },
];

/* ============================== ABOUT ============================== */
export default function AboutPage() {
  return (<section className="sec about">
    <Reveal className="sec-head">
      <div>
        <h2>우리들의 이야기</h2>
        <p className="sub">연세대학교 포켓몬스터 동아리인 포켓몬 센터 연세점, 일명 포센연에서 시작된 배틀 리그의 발자취입니다.</p>
      </div>
    </Reveal>

    <section className="ab-block">
      <Reveal tag="h3" className="ab-h">시즌은 이렇게 흘러갑니다</Reveal>
      <ol className="ab-flow">
        {FLOW.map((s, i) => (
          <Reveal tag="li" key={s.t} delay={i * 70} className={i === FLOW.length - 1 ? "last" : ""}>
            <span className="ab-flow-n">{i + 1}</span>
            <b>{s.t}</b>
            <span>{s.d}</span>
          </Reveal>
        ))}
      </ol>
    </section>

    <section className="ab-block ab-split">
      <Reveal tag="h3" className="ab-h">YPL이 기록하는 것</Reveal>
      <div className="ab-records">
        {RECORDS.map((r, i) => (
          <Reveal key={r.k} delay={i * 70} className="ab-rec">
            <span className="ab-rec-ic"><Icon n={r.icon} size={20} /></span>
            <div>
              <b>{r.t}</b>
              <p>{r.d}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>

    <section className="ab-block">
      <Reveal tag="h3" className="ab-h">연혁</Reveal>
      <ol className="ab-timeline">
        {TIMELINE.map((t, i) => (
          <Reveal tag="li" key={t.date} delay={i * 80}>
            <time className="tnum">{t.date}</time>
            <div><b>{t.title}</b><p>{t.body}</p></div>
          </Reveal>
        ))}
      </ol>
    </section>

    <section className="ab-block">
      <Reveal tag="h3" className="ab-h">대회</Reveal>
      <div className="ab-comps">
        {COMPS.map((c, i) => (
          <Reveal key={c.name} delay={i * 70} className={"ab-comp" + (c.major ? " major" : "")}>
            <div className="ab-comp-h"><b>{c.name}</b><span className={"y-chip" + (c.major ? " y-chip-laurel" : "")}>{c.major && <Icon n="trophy" size={13} />}{c.tag}</span></div>
            <p>{c.desc}</p>
          </Reveal>
        ))}
      </div>
    </section>

    <section className="ab-block">
      <Reveal tag="h3" className="ab-h">정규 리그</Reveal>
      <Reveal tag="p" className="ab-lead">2025년 6월 양분화 이후, YPL은 두 개의 정규 리그 체제로 운영됩니다.</Reveal>
      <div className="ab-leagues">
        {LEAGUES.map((lg, i) => (
          <Reveal key={lg.key} delay={i * 90} className={"ab-league " + lg.key}>
            <b>{lg.name}</b>
            <span className="ab-league-en">{lg.en}</span>
            <p>{lg.desc}</p>
          </Reveal>
        ))}
      </div>
    </section>
  </section>);
}
