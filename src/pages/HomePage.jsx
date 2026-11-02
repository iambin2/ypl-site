import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Case from "../components/common/Case.jsx";
import ChampionSheet from "../components/common/ChampionSheet.jsx";
import { STAGGER, place, reduced, seal } from "../components/common/motion.js";
import Icon from "../components/common/Icon.jsx";
import { loadChampions, loadFacts, seenChampions, seenFacts } from "../components/home/homeFacts.js";
import { formatDate } from "../services/dateFormat.js";
import { excerptOf } from "../services/noticeExcerpt.js";
import Button from "../components/common/Button.jsx";

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

/* 첫 기록의 달: "2023-05-20", "2023.05" → "2023년 5월" */
const monthOf = s => { const n = String(s || "").match(/\d+/g); return n?.length >= 2 ? `${n[0]}년 ${+n[1]}월` : ""; };

/* 역대 챔피언 레일: 브라우저의 가로 스크롤이라 손가락과 어긋날 일이 없다. 마우스로는 옆으로 밀 수 없어 화살표를 둔다. */
function HallRail({ champions, onOpen }) {
  const rail = useRef(null);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const el = rail.current, check = () => setOver(el.scrollWidth > el.clientWidth + 1);
    check();
    const watch = new ResizeObserver(check);
    watch.observe(el);
    return () => watch.disconnect();
  }, [champions.length]);
  const push = dir => {
    const el = rail.current, [first, second] = el.children;
    el.scrollBy({ left: dir * (second ? second.offsetLeft - first.offsetLeft : 0), behavior: reduced() ? "auto" : "smooth" });
  };
  return (
    <section className="hm-sec" aria-labelledby="hm-hall">
      <div className="hm-head">
        <h2 id="hm-hall">역대 챔피언</h2>
        {over && <div className="hm-arrows">
          <button type="button" className="hm-arrow is-back" onClick={() => push(-1)} aria-label="이전 챔피언"><Icon n="arrow" size={20} /></button>
          <button type="button" className="hm-arrow" onClick={() => push(1)} aria-label="다음 챔피언"><Icon n="arrow" size={20} /></button>
        </div>}
      </div>
      <div className="hm-rail" ref={rail}>
        {champions.map(c => <Case key={c.key} title={c.name} line={c.line} fig={c.generation || null} unit="대" sprite={c.party[0]?.img || ""} onClick={() => onOpen(c)} label={`${c.label} 챔피언 ${c.name}, ${c.line}`} />)}
      </div>
    </section>
  );
}

/* ============================== HOME ==============================
   φ로 거듭 나눈 한 장. 첫 화면은 틈 없이 맞닿은 네 면이고, 면 하나에 사실 하나다: 다음 대회, 챔피언, 지난 우승, 대회 수.
   눈은 큰 면에서 작은 면으로 돌고, 면을 누르면 그 사실이 사는 화면으로 간다.
   아래로 갈수록 시간을 거슬러 간다: 지금(공지, 시즌) → 역대 챔피언 → 첫 기록. 글자는 움직이지 않고, 첫 등장은 제자리에 놓인다. */
export default function HomePage({ data, go, admin }) {
  const [enter] = useState(opening);
  const lead = useRef(null), crown = useRef(null), last = useRef(null), count = useRef(null);
  const [champions, setChampions] = useState(seenChampions), [facts, setFacts] = useState(() => admin ? null : seenFacts()), [pop, setPop] = useState(null);
  /* 세 면의 사실은 다 읽힌 뒤 한 번에 도착한다. 이미 들고 있던 값으로 그린 복귀에서는 아무것도 움직이지 않는다. */
  const filled = Boolean(champions && facts);
  const held = useRef(filled), arrives = enter || !held.current;

  useEffect(() => {
    let live = true;
    loadChampions(data).then(rows => { if (live) setChampions(rows); }).catch(error => { console.warn("home champions read failed", error); if (live) setChampions([]); });
    loadFacts(data, admin).then(next => { if (live) setFacts(next); }).catch(error => { console.warn("home facts read failed", error); if (live) setFacts(seen => seen || {}); });
    return () => { live = false; };
  }, [data]);

  useLayoutEffect(() => {
    firstOpen = false;
    if (enter) place([...lead.current.children], { step: STAGGER.tile });
  }, [enter]);

  const reigning = champions?.[0];
  useLayoutEffect(() => {
    if (!filled || !arrives) return undefined;
    place([crown, last, count].flatMap(plane => [...plane.current.querySelectorAll(":scope > :not(i, img)")]));
    /* 챔피언은 그림이 풀린 뒤에 선다: 데이터에 맞춰 움직이면 느린 회선에서 움직임이 끝난 뒤에 그림이 툭 나타난다 */
    const img = crown.current.querySelector("img");
    let live = Boolean(img);
    img?.decode().catch(() => {}).then(() => {
      if (!live) return;
      img.classList.remove("hm-wait");
      place(img);
      if (enter) seal(crown.current, STAGGER.tile);
    });
    return () => { live = false; };
  }, [filled]);

  /* 대회 단계: 남은 날과 주 행동이 같은 계산을 읽는다 */
  const now = useMemo(() => {
    const upcoming = nextEvent(data.announcements);
    if (!upcoming) return null;
    const { a, draft, raw, dday } = upcoming, today = dday === 0;
    return { today, dday, name: draft.name || a.title, when: formatDate(raw, { time: true }) };
  }, [data.announcements]);
  const primary = !now ? ["기록 보기", "records"] : now.today ? ["대진표 보기", "bracket"] : ["이번 대회 신청", "news"];
  const notices = useMemo(() => [...data.announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.date < b.date ? 1 : -1)).slice(0, 3), [data.announcements]);
  const first = monthOf(facts?.first);

  return (<div className="hm">
    <section className="hm-plate" aria-label="지금의 YPL">
      <div className="hm-a" ref={lead}>
        <div className="hm-say">
          <h1><span>모든 승부가</span> <span>기록이 됩니다.</span></h1>
          <p>포켓몬 센터 연세점의 공식 배틀 리그입니다.</p>
        </div>
        <div className="hm-next">
          {now
            ? <p className="hm-when">{now.today && <i className="live-dot" aria-hidden="true" />}<b className="tnum">{now.today ? "오늘" : `D-${now.dday}`}</b><span><strong>{now.name}</strong>{now.when}</span></p>
            : <p className="hm-when">다음 대회 일정은 공지에 올라옵니다.</p>}
          <div className="hm-actions">
            <Button type="button" variant="inverse" size="lg" onClick={() => go(primary[1])}>{primary[0]}<Icon n="arrow" size={20} /></Button>
            <Button type="button" size="lg" onClick={() => go("about")}>리그 소개</Button>
          </div>
        </div>
      </div>

      <button type="button" className="hm-plane hm-b" ref={crown} onClick={() => reigning ? setPop(reigning) : go("champions")} aria-label={reigning ? `${reigning.label} 챔피언 ${reigning.name}, ${reigning.line}` : "명예의 전당"}>
        <i className="hm-slant" aria-hidden="true" />
        <i className="case-band" aria-hidden="true" />
        {filled && <Icon n="arrow" size={20} />}
        {filled && reigning && <><b>{reigning.name}</b><small>{reigning.label} 챔피언, <span className="hm-keep">{reigning.line}</span></small></>}
        {filled && reigning?.party[0]?.img && <img className={arrives ? "hm-wait" : undefined} src={reigning.party[0].img} alt="" decoding="async" />}
      </button>

      <button type="button" className="hm-plane hm-c" ref={last} onClick={() => go("records", { tab: "tour" })} aria-label={facts?.latest ? `지난 대회 우승 ${facts.latest.winner}, ${facts.latest.name}` : "대회 기록"}>
        {filled && <Icon n="arrow" size={20} />}
        {filled && facts.latest && <><b>{facts.latest.winner}</b><small>{facts.latest.name} 우승</small></>}
      </button>

      <button type="button" className="hm-plane hm-d" ref={count} onClick={() => go("records", { tab: "tour" })} aria-label={facts?.tournaments ? `지금까지 대회 ${facts.tournaments}회` : "대회 기록"}>
        {filled && facts.tournaments > 0 && <><b className="tnum">{facts.tournaments}</b><em>회</em><small>지금까지의 대회</small></>}
      </button>
    </section>

    <div className="hm-now">
        {notices.length > 0 && <section className="hm-sec" aria-labelledby="hm-notices">
          <div className="hm-head">
            <h2 id="hm-notices">공지</h2>
            <button type="button" className="hm-all" data-tab="news" onClick={() => go("news")}>공지 전체 보기</button>
          </div>
          <div className="hm-list">
            {notices.map(a => {
              const excerpt = excerptOf(a.body, a.title);
              return <button type="button" className="hm-row" key={a.id} onClick={() => go("news", { notice: a.id })}><span><b>{a.title}</b><small>{formatDate(a.date)}{excerpt && `, ${excerpt}`}</small></span></button>;
            })}
          </div>
        </section>}
        {facts?.season && <section className="hm-sec" aria-labelledby="hm-season">
          <div className="hm-head">
            <h2 id="hm-season">{facts.season.name}</h2>
            <button type="button" className="hm-all" onClick={() => go("records", { tab: "rank" })}>랭킹 전체 보기</button>
          </div>
          <ol className="hm-list">
            {facts.season.rows.map(r => <li key={r.name}><button type="button" className="hm-row" onClick={() => go("records", { trainer: r.name })}><i>{r.rank}</i><span><b>{r.name}</b>{facts.season.rows.filter(other => other.rank === r.rank).length > 1 && <small>공동 {r.rank}위</small>}</span><strong>{r.points}<small>점</small></strong></button></li>)}
          </ol>
        </section>}
    </div>

    {champions?.length > 1 && <div className="hm-wrap hm-ledger"><HallRail champions={champions.slice(1)} onOpen={setPop} /></div>}

    <section className="hm-close" aria-label="YPL의 시작">
      <div className="hm-first">
        <h2>{first ? `첫 기록은 ${first}입니다.` : "다음 기록을 남길 차례입니다."}</h2>
        <div className="hm-actions"><Button type="button" variant="inverse" size="lg" onClick={() => go("records")}>기록 보기</Button></div>
      </div>
      {facts?.trainers > 0 && champions && <dl>
        <div><dt>트레이너</dt><dd>{facts.trainers}<small>명</small></dd></div>
        <div><dt>챔피언</dt><dd>{champions.length}<small>명</small></dd></div>
      </dl>}
    </section>

    {pop && <ChampionSheet name={pop.name} hint={`${pop.label} 챔피언, ${pop.line}`} party={pop.party} onClose={() => setPop(null)}>
      <Button type="button" data-tab="champions" onClick={() => go("champions")}>명예의 전당 보기</Button>
    </ChampionSheet>}
  </div>);
}
