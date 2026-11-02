import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChampionPanel, Counter, Mon, Row, SectionHead } from "../components/common/Board.jsx";
import Button from "../components/common/Button.jsx";
import ChampionSheet from "../components/common/ChampionSheet.jsx";
import { light } from "../components/common/motion.js";
import Seg from "../components/common/Seg.jsx";
import { loadChampions, loadFacts, seenChampions, seenFacts } from "../components/home/homeFacts.js";
import { dotDate } from "../services/dateFormat.js";

const DAY_MS = 86400000;
/* "2026-10-04", "2026.10.04", "2026-10-04T15:21" → 그날 0시의 Date. 일까지 없으면 null. */
function dayOf(s) {
  const n = String(s || "").match(/\d+/g);
  if (!n || n.length < 3) return null;
  const d = new Date(+n[0], +n[1] - 1, +n[2]);
  return Number.isNaN(d.getTime()) ? null : d;
}
/* 홈의 다음 행동. 이미 불러온 공지(site_data)의 대회 정보만 읽는다. */
function nextEvent(announcements, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best = null;
  for (const a of announcements || []) {
    const draft = a?.form?.enabled ? a.form.eventDraft : null;
    if (!draft) continue;
    const champions = draft.eventType === "champions";
    const dates = champions ? [draft.qualifierHeldOn ?? draft.heldOn, draft.finalHeldOn] : [draft.heldOn];
    for (const raw of dates) {
      const day = dayOf(raw);
      if (!day) continue;
      const dday = Math.round((day - today) / DAY_MS);
      if (dday < 0 || (best && best.dday <= dday)) continue;
      best = { a, draft, champions, raw, dday };
    }
  }
  return best;
}

/* 상단 바의 대회 행동: 다음 대회가 있을 때만 [글자, 화면]. 오늘 열리면 대진표로 간다. */
export function eventAction(announcements) {
  const upcoming = nextEvent(announcements);
  return !upcoming ? null : upcoming.dday === 0 ? ["대진표", "bracket"] : ["대회 신청", "news"];
}

/* 첫 등장은 사이트에 들어올 때마다 한 번이다. 판정은 처음 그릴 때 받아 두고 그려진 뒤에 지운다
   (개발 모드의 두 번 호출도 같은 답을 받는다). 홈에 다시 오면 보통의 화면 전환으로 선다. */
let firstOpen = true;
const opening = () => firstOpen;

/* 좁은 줄의 날짜: 11.07, 그 옆에 흐린 요일 */
const Day = ({ d }) => d && <span className="num">{d.day}<span className="dim ho-wd">{d.weekday}</span></span>;

/* 같은 순위가 둘 이상이면 스택 아래의 회색 문장이 몇 명인지 말한다 */
function tieNote(rows) {
  const tied = rows.find(r => rows.filter(o => o.rank === r.rank).length > 1);
  return tied ? `${rows.filter(o => o.rank === tied.rank).length}명이 공동 ${tied.rank}위입니다.` : "";
}

/* ============================== HOME ==============================
   전광판 한 장 (DESIGN.md "Layout and pages", docs/redesign-next c3, c21 가, c23).
   첫 화면: 다음 대회까지의 날(없으면 꺼진 판), 대회 이름, 주 행동, 현 챔피언의 패널, 세 카운터. 아래: 시즌 순위, 공지, 역대 챔피언.
   데스크톱은 709와 439의 두 단이고, 두 단은 머리글 줄과 마지막 줄을 함께 쓴다. */
export default function HomePage({ data, go, admin }) {
  const [enter] = useState(opening);
  const root = useRef(null);
  const [champions, setChampions] = useState(seenChampions), [facts, setFacts] = useState(() => admin ? null : seenFacts()), [pop, setPop] = useState(null);

  useEffect(() => {
    let live = true;
    loadChampions(data).then(rows => { if (live) setChampions(rows); }).catch(error => { console.warn("home champions read failed", error); if (live) setChampions([]); });
    loadFacts(data, admin).then(next => { if (live) setFacts(next); }).catch(error => { console.warn("home facts read failed", error); if (live) setFacts(seen => seen || {}); });
    return () => { live = false; };
  }, [data]);

  useLayoutEffect(() => {
    firstOpen = false;
    if (enter) light(root.current);
  }, [enter]);

  /* 대회 단계: 남은 날과 주 행동이 같은 계산을 읽는다 */
  const now = useMemo(() => {
    const upcoming = nextEvent(data.announcements);
    if (!upcoming) return null;
    const { a, draft, raw, dday } = upcoming;
    return { today: dday === 0, dday, name: draft.name || a.title, date: dotDate(raw) };
  }, [data.announcements]);
  const primary = !now ? ["공지 보기", "news"] : now.today ? ["대진표 보기", "bracket"] : ["이번 대회 신청", "news"];
  const notices = useMemo(() => [...data.announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.date < b.date ? 1 : -1)).slice(0, 3), [data.announcements]);
  const reigning = champions?.[0] || null;
  const season = facts?.season;
  const tie = season ? tieNote(season.rows) : "";

  return (<div className="ho" ref={root}>
    <section className="ho-next" aria-labelledby="ho-title">
      <p className="ho-label t12" data-light>
        {now?.today
          ? <span className="ho-lamp"><i className="lamp sig" aria-hidden="true" />오늘 대회 진행 중</span>
          : <span className="ho-lamp dim"><i className={"lamp" + (now ? "" : " unlit")} aria-hidden="true" />{now ? "다음 대회까지" : "다음 대회"}</span>}
        {now?.date && <span className="dim"><Day d={now.date} /></span>}
      </p>
      <div className="ho-board">
        {now?.today
          ? <><Seg value={now.date?.clock || "  :  "} h={84} cells={4} label={now.date?.clock ? `${now.date.clock} 시작` : "시작 시각 미정"} /><span className="ho-unit">시작</span></>
          : <><Seg value={now ? String(now.dday).padStart(2, "0") : ""} h={120} cells={now?.dday >= 100 ? 3 : 2} label={now ? `${now.dday}일 남음` : "다음 대회 없음"} className="ho-days" /><span className={"ho-unit" + (now ? "" : " dim")}>일</span></>}
      </div>
      <h1 className="ho-title" id="ho-title" data-light>{now ? now.name : <>다음 대회 일정은{" "}<br />공지에 올라옵니다.</>}</h1>
      <div className="ho-go">
        <Button variant="main" onClick={() => go(primary[1])}>{primary[0]}</Button>
        <Button variant="link" size="lg" className="ho-about" onClick={() => go("about")}>리그 소개</Button>
      </div>
    </section>

    <div className="ho-reign">
      <ChampionPanel champion={reigning} onClick={() => setPop(reigning)} />
      {reigning?.party.length > 0 && <div className="stack ho-six" role="img" aria-label={reigning.party.map(m => m.name).filter(Boolean).join(", ")}>
        {reigning.party.map((m, i) => <span className="pn stand" key={i}><i className="floor" aria-hidden="true" /><Mon src={m.img} /></span>)}
      </div>}
      <div className="stack ho-counts">
        <Counter label="대회" value={facts?.tournaments ?? null} unit="회" onClick={() => go("records", { tab: "tour" })} />
        <Counter label="트레이너" value={facts?.trainers ?? null} unit="명" onClick={() => go("records", { tab: "trainer" })} />
        <Counter label="시즌" value={facts?.seasons ?? null} unit="개" onClick={() => go("records", { tab: "rank" })} />
      </div>
    </div>

    {season && <section className="ho-sec ho-rank" aria-labelledby="ho-rank">
      <SectionHead id="ho-rank" title={`${season.name} 순위`} link="전체 보기" onLink={() => go("records", { tab: "rank" })} />
      <div className="stack">
        {season.rows.map(r => <Row key={r.name} lead={<span className="num t20">{r.rank}</span>} title={r.name}
          value={<><span className="num t20">{r.points}</span><span className="t12 dim">점</span></>}
          onClick={() => go("records", { trainer: r.name })} label={`${r.rank}위 ${r.name}, ${r.points}점`} />)}
      </div>
      {tie && <p className="ho-tie t12 mute reg">{tie}</p>}
    </section>}

    {notices.length > 0 && <section className="ho-sec ho-news" aria-labelledby="ho-news">
      <SectionHead id="ho-news" title="공지" link="전체 보기" onLink={() => go("news")} />
      <div className="stack">
        {notices.map(a => <Row key={a.id} lead={<span className="t15"><Day d={dotDate(a.date)} /></span>} title={a.title} lamp={false}
          onClick={() => go("news", { notice: a.id })} />)}
      </div>
    </section>}

    {champions?.length > 1 && <section className="ho-sec ho-hall" aria-labelledby="ho-hall">
      <SectionHead id="ho-hall" title="역대 챔피언" link="명예의 전당" onLink={() => go("champions")} />
      <div className="ho-rail">
        {champions.slice(1).map(c => <button type="button" className="pn stand ho-past" key={c.key} onClick={() => setPop(c)} aria-label={`${c.label} 챔피언 ${c.name}, ${c.line}`}>
          {c.generation > 0 && <span className="ho-gen"><span className="num t20">{c.generation}</span><span className="t12 dim">대</span></span>}
          <Mon src={c.party[0]?.img} />
          <span className="floor ho-band"><b className="t15">{c.name}</b><span className="t12 dim reg">{c.line.replace(/ 우승$/, "")}</span></span>
        </button>)}
      </div>
    </section>}

    {pop && <ChampionSheet name={pop.name} hint={`${pop.label} 챔피언, ${pop.line}`} party={pop.party} onClose={() => setPop(null)}>
      <Button type="button" data-tab="champions" onClick={() => go("champions")}>명예의 전당 보기</Button>
    </ChampionSheet>}
  </div>);
}
