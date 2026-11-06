import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChampionPanel, Counter, Mon, Podium, SectionHead } from "../components/common/Board.jsx";
import { NoticeLead, NoticeRow } from "../components/common/NoticeRows.jsx";
import Button from "../components/common/Button.jsx";
import ChampionSheet from "../components/common/ChampionSheet.jsx";
import { DUR, light } from "../components/common/motion.js";
import Seg from "../components/common/Seg.jsx";
import StandTable from "../components/common/StandTable.jsx";
import { loadChampions, loadFacts, seenChampions, seenFacts } from "../components/home/homeFacts.js";
import { dotDate } from "../services/dateFormat.js";
import { listNormalizedBracketRuntimes } from "../services/normalizedCompetitionService.js";
import { freshRead } from "../services/readCache.js";
import { liveMatches } from "../services/recordsAnalytics.js";
import { listEventBattles } from "../services/battleService.js";
import { submissionDue } from "../services/submissionDue.js";
import { applicationsOpen } from "../services/announcementTimes.js";

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
    // each day with its start time (HH:MM, announcementTimes.js): the event-day clock reads it
    const dates = champions ? [[draft.qualifierHeldOn ?? draft.heldOn, draft.qualifierStartTime], [draft.finalHeldOn, draft.finalStartTime]] : [[draft.heldOn, draft.startTime]];
    for (const [raw, time] of dates) {
      const day = dayOf(raw);
      if (!day) continue;
      const dday = Math.round((day - today) / DAY_MS);
      if (dday < 0 || (best && best.dday <= dday)) continue;
      best = { a, draft, champions, raw, time, dday };
    }
  }
  return best;
}

/* 오늘 열리는 대회: 바의 램프, 대진표 탭의 램프, 다른 화면의 진행 띠가 읽는다. 없으면 null. */
export function todayEvent(announcements) {
  const upcoming = nextEvent(announcements);
  return upcoming?.dday === 0 ? { name: upcoming.draft.name || upcoming.a.title } : null;
}

/* 첫 등장은 사이트에 들어올 때마다 한 번이다. 판정은 처음 그릴 때 받아 두고 그려진 뒤에 지운다
   (개발 모드의 두 번 호출도 같은 답을 받는다). 홈에 다시 오면 보통의 화면 전환으로 선다. */
let firstOpen = true;
const opening = () => firstOpen;

/* 좁은 줄의 날짜: 11.07, 그 옆에 흐린 요일 */
const Day = ({ d }) => d && <span className="num">{d.day}<span className="dim wd">{d.weekday}</span></span>;


/* ============================== HOME ==============================
   전광판 한 장 (DESIGN.md "Layout and pages").
   첫 화면: 다음 대회까지의 날(없으면 꺼진 판), 대회 이름, 주 행동, 현 챔피언의 패널, 세 카운터. 아래: 시즌 순위, 공지, 역대 챔피언.
   데스크톱은 709와 439의 두 단이고, 두 단은 머리글 줄과 마지막 줄을 함께 쓴다. */
export default function HomePage({ data, go, admin }) {
  const [enter] = useState(opening);
  const root = useRef(null);
  const [champions, setChampions] = useState(seenChampions), [facts, setFacts] = useState(() => admin ? null : seenFacts()), [pop, setPop] = useState(null);

  useEffect(() => {
    let live = true;
    loadChampions(data, admin).then(rows => { if (live) setChampions(rows); }).catch(error => { console.warn("home champions read failed", error); if (live) setChampions([]); });
    loadFacts(data, admin).then(next => { if (live) setFacts(next); }).catch(error => { console.warn("home facts read failed", error); if (live) setFacts(seen => seen || {}); });
    return () => { live = false; };
  }, [data]);
  /* the reign and the league's numbers are one block of the board: on a first visit the champion waits for the counters (its picture
     is fetched meanwhile) so the block lights at once, never longer than a second; a returning visitor has both from the first frame */
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!champions || facts || waited) return undefined;
    const src = champions[0]?.party[0]?.img;
    if (src) { const picture = new Image(); picture.fetchPriority = "high"; picture.src = src; }
    const timer = setTimeout(() => setWaited(true), 1000);
    return () => clearTimeout(timer);
  }, [champions, facts, waited]);

  useLayoutEffect(() => {
    firstOpen = false;
    if (enter) light(root.current);
  }, [enter]);
  /* the season's ranking and the past champions come after the first paint (homeFacts.js): a section that appears later switches on
     the moment it appears, as the rest of the board did, instead of standing there lit */
  const litSecs = useRef(null);
  useLayoutEffect(() => {
    const secs = [...root.current.querySelectorAll(":scope > .ho-sec")];
    if (!litSecs.current) { litSecs.current = new Set(secs); return; }
    secs.filter(sec => !litSecs.current.has(sec)).forEach(sec => { litSecs.current.add(sec); light(sec, DUR.leave); });
  });

  /* 대회 단계: 남은 날과 주 행동이 같은 계산을 읽는다 */
  const now = useMemo(() => {
    const upcoming = nextEvent(data.announcements);
    if (!upcoming) return null;
    const { a, draft, raw, time, dday } = upcoming;
    const date = dotDate(raw);
    return { today: dday === 0, dday, name: draft.name || a.title, date: date && { ...date, clock: time || date.clock }, eventId: a.form?.eventId || null, noticeId: a.id,
      // 파티 제출은 대회 시작까지다: 그 전날까지는 남은 날이 위의 카운트다운과 같아서, 그날 시작 전에만 남은 시간을 센다
      open: dday > 0 && applicationsOpen(a.form), due: dday === 0 ? submissionDue(draft) : null };
  }, [data.announcements]);
  /* 대회 당일의 지금 경기: 그날 대회의 대진표를 대진표 화면과 같은 읽기로 가져와 아직 승자가 없는 경기를 보인다 */
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (!now?.today || !now.eventId) { setLive(null); return undefined; }
    let on = true;
    freshRead("brackets", listNormalizedBracketRuntimes)
      .then(rows => { if (!on) return; const b = (rows || []).map(row => row.bracket).find(x => x?.eventId === now.eventId); setLive(b ? liveMatches(b) : null); })
      .catch(error => { console.warn("home live matches read failed", error); if (on) setLive(null); });
    return () => { on = false; };
  }, [now?.today, now?.eventId]);
  // a match of that event being played as a site battle: the home opens it to watch
  const [liveBattle, setLiveBattle] = useState(null);
  useEffect(() => {
    if (!now?.today || !now.eventId) { setLiveBattle(null); return undefined; }
    let on = true;
    listEventBattles(now.eventId).then(rows => { if (on) setLiveBattle(rows.find(row => row.status === "active") || null); });
    return () => { on = false; };
  }, [now?.today, now?.eventId]);
  const primary = !now ? ["공지 보기", "news"] : now.today ? ["대진표 보기", "bracket"] : now.open ? ["이번 대회 신청", "news"] : ["대회 공지 보기", "news", { notice: now.noticeId }];
  const notices = useMemo(() => [...data.announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.date < b.date ? 1 : -1)).slice(0, 3), [data.announcements]);
  const reigning = (facts || waited) ? champions?.[0] || null : null;
  const readingReign = !reigning && (!champions || (champions.length > 0 && !(facts || waited)));
  const season = facts?.season;

  return (<div className="ho" ref={root}>
    <section className="ho-next" aria-labelledby="ho-title">
      <p className="ho-label t12" data-light>
        {now?.today
          ? <span className="ho-lamp"><i className="lamp sig" aria-hidden="true" />오늘 대회 진행 중</span>
          : now?.open
            ? <span className="ho-lamp"><i className="lamp sig" aria-hidden="true" />신청 접수 중</span>
            : <span className="ho-lamp dim"><i className={"lamp" + (now ? "" : " unlit")} aria-hidden="true" />{now ? "다음 대회까지" : "다음 대회"}</span>}
        {now?.date && <span className="dim"><Day d={now.date} /></span>}
      </p>
      <div className={"ho-board" + (now?.today ? " today" : "")}>
        {now?.today
          ? <><Seg value={now.date?.clock || "  :  "} h={84} cells={4} label={now.date?.clock ? `${now.date.clock} 시작` : "시작 시각 미정"} /><span className="ho-unit">시작</span></>
          : <><Seg value={now ? String(now.dday).padStart(2, "0") : ""} h={120} cells={now?.dday >= 100 ? 3 : 2} label={now ? `${now.dday}일 남음` : "다음 대회 없음"} className="ho-days" /><span className={"ho-unit" + (now ? "" : " dim")} data-light>일</span></>}
      </div>
      {/* with an event ahead the board says it alone: the countdown under its label; the name stays for screen readers (2026-11-06) */}
      <h1 className={"ho-title" + (now ? " sr-only" : "")} id="ho-title" data-light>{now ? now.name : <>다음 대회 일정은{" "}<br />공지에 올라옵니다.</>}</h1>
      {now?.due && <div className="stack ho-due">
        <Counter label={now.due.unit === "시간" ? "파티 제출 마감까지" : "파티 제출까지"} lamp={now.due.unit === "시간" ? "sig" : true} value={String(now.due.value).padStart(2, "0")} cells={now.due.value >= 100 ? 3 : 2} unit={now.due.unit}
          after={<span className="t15">{now.due.unit}</span>} onClick={() => go("news", { notice: now.noticeId })} />
      </div>}
      <div className="ho-go">
        <Button variant="main" onClick={() => go(primary[1], primary[2])}>{primary[0]}</Button>
        <Button variant="link" size="lg" className="ho-about" data-light onClick={() => go("about")}>리그 소개</Button>
      </div>
    </section>

    {live?.live.length > 0 && <section className="ho-sec ho-live" aria-labelledby="ho-live">
      <SectionHead id="ho-live" title="지금 경기" link="대진표 전체" onLink={() => go("bracket")} />
      <div className="stack">
        <p className="pn ho-live-head t12"><span className="dim">{live.live[0].stage}</span><span className="ho-lamp"><i className="lamp sig" aria-hidden="true" />진행 중</span></p>
        <p className="pn ho-live-row t15">{live.live[0].a}</p>
        <p className="pn ho-live-row t15">{live.live[0].b}</p>
        <p className="pn ho-live-head t12"><span className="dim">{live.stage} 진행</span><span>{live.done} / {live.total} 종료</span></p>
        {liveBattle && <button type="button" className="pn ho-live-head t12" onClick={() => go("battle", { battle: liveBattle.id })}>
          <span className="ho-lamp"><i className="lamp sig" aria-hidden="true" />{`${liveBattle.p1_name} 대 ${liveBattle.p2_name} 배틀 진행 중`}</span><span>관전</span>
        </button>}
      </div>
    </section>}

    <div className="ho-reign">
      <ChampionPanel champion={reigning} onClick={() => setPop(reigning)} />
      {/* the six stand switched off at their size while the reign is read, so the column does not grow when they light */}
      {(reigning?.party.length > 0 || readingReign) && <div className="stack ho-six" role="img" aria-label={reigning ? reigning.party.map(m => m.name).filter(Boolean).join(", ") : "현 챔피언의 파티"}>
        {(reigning ? reigning.party : Array(6).fill(null)).map((m, i) => <span className="pn stand" key={i}><i className="floor" aria-hidden="true" />{m && <Mon src={m.img} />}</span>)}
      </div>}
      <div className="stack ho-counts">
        <Counter label="대회" value={facts?.tournaments ?? null} unit="회" onClick={() => go("records", { tab: "tour" })} />
        <Counter label="트레이너" value={facts?.trainers ?? null} unit="명" onClick={() => go("records", { tab: "trainer" })} />
        <Counter label="역대 시즌" value={facts?.seasons ?? null} unit="개" onClick={() => go("records", { tab: "rank" })} />
      </div>
    </div>

    {/* while the ranking is read its place stands switched off, so the notices under it do not move when it lights */}
    {(season || !facts) && <section className="ho-sec ho-rank" aria-labelledby="ho-rank">
      <SectionHead id="ho-rank" title={season ? `${season.name} 순위` : " "} link={season && "전체 보기"} onLink={() => go("records", { tab: "rank" })} />
      {season
        ? <StandTable rows={season.rows} shown={2} onName={name => go("records", { trainer: name })} />
        : <Podium rows={null} />}
    </section>}

    {notices.length > 0 && <section className="ho-sec ho-news" aria-labelledby="ho-news">
      <SectionHead id="ho-news" title="공지" link="전체 보기" onLink={() => go("news")} />
      <div className="stack">
        {notices.map((a, i) => i === 0
          ? <NoticeLead key={a.id} a={a} onOpen={() => go("news", { notice: a.id })} />
          : <NoticeRow key={a.id} a={a} onOpen={() => go("news", { notice: a.id })} />)}
      </div>
    </section>}

    {champions?.length > 1 && <section className="ho-sec ho-hall" aria-labelledby="ho-hall">
      <SectionHead id="ho-hall" title="역대 챔피언" link="명예의 전당" onLink={() => go("champions")} />
      <div className="ho-line" style={{ "--n": champions.length - 1 }}>
        {champions.slice(1).map(c => <button type="button" className="ho-col" key={c.key} onClick={() => setPop(c)} aria-label={`${c.label} 챔피언 ${c.name}, ${c.line}`}>
          <span className="pn2 ho-col-gen" aria-hidden="true">{c.generation > 0 ? <Seg value={String(c.generation)} h={32} cells={1} label="" /> : <span className="t12">{c.label}</span>}</span>
          <span className="pn stand ho-col-mon"><i className="floor" aria-hidden="true" /><Mon src={c.party[0]?.img} loading="lazy" /></span>
          <span className="pn ho-col-who"><b className="t12">{c.name}</b><span className="t12 dim reg">{c.line.replace(/ 우승$/, "")}</span></span>
        </button>)}
      </div>
    </section>}

    {pop && <ChampionSheet name={pop.name} line={pop.line} generation={pop.generation} genText={pop.label} reigning={pop.key === reigning?.key}
      party={pop.party} sets={pop.sets} regulationId={pop.regulationId} onClose={() => setPop(null)}>
      {/* the same sheet carries the same action wherever it opens (명예의 전당): the champion's record, and the hall beside it */}
      <Button variant="main" onClick={() => { setPop(null); go("records", { trainer: pop.name }); }}>{pop.name} 기록 보기</Button>
      <Button variant="link" size="lg" data-tab="champions" onClick={() => go("champions")}>명예의 전당 보기</Button>
    </ChampionSheet>}
  </div>);
}
