import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Case from "../components/common/Case.jsx";
import ChampionSheet from "../components/common/ChampionSheet.jsx";
import Roll from "../components/common/Roll.jsx";
import { DUR, EASE_IN_OUT, EASE_OUT, place, reduced, seal, stand } from "../components/common/motion.js";
import { WORDMARK_PATH, Wordmark } from "../components/layout/SiteHeader.jsx";
import Icon from "../components/common/Icon.jsx";
import { arenaField } from "../components/home/arenaField.js";
import { loadChampions, loadCounts } from "../components/home/homeFacts.js";
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
let heroPending = true, arenaPending = true;
const firstHero = () => heroPending;

const MARK_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 310 100'><path transform='skewX(-12) translate(21 0)' fill-rule='evenodd' d='${WORDMARK_PATH}'/></svg>`)}") center / 100% 100% no-repeat`;

/* 슬랩 레일: 최신 챔피언이 맨 앞에 서고 옆으로 밀면 옛 챔피언이 이어진다. 브라우저의 가로 스크롤이라 손가락과 어긋날 일이 없다.
   마우스로는 옆으로 밀 수 없어 포인터가 있는 넓은 화면에만 화살표를 둔다. */
function SlabRail({ champions, enter, onOpen }) {
  const rail = useRef(null);
  useLayoutEffect(() => {
    if (!enter) return undefined;
    const slabs = [...rail.current.children];
    stand(slabs);
    seal(slabs[0], 540);
    return undefined;
  }, [enter]);
  const push = dir => {
    const el = rail.current, [first, second] = el.children;
    el.scrollBy({ left: dir * (second ? second.offsetLeft - first.offsetLeft : 0), behavior: reduced() ? "auto" : "smooth" });
  };
  return (
    <section className="hm-belt" aria-label="역대 챔피언">
      <div className="hm-arrows">
        <button type="button" className="hm-arrow is-back" onClick={() => push(-1)} aria-label="이전 챔피언"><Icon n="arrow" size={20} /></button>
        <button type="button" className="hm-arrow" onClick={() => push(1)} aria-label="다음 챔피언"><Icon n="arrow" size={20} /></button>
      </div>
      <div className="hm-rail" ref={rail}>
        {champions.map(c => <Case key={c.key} title={c.name} line={c.line} fig={c.generation || null} unit="대" sprite={c.party[0]?.img || ""} onClick={() => onOpen(c)} label={`${c.label} 챔피언 ${c.name}, ${c.line}`} />)}
      </div>
    </section>
  );
}

/* 슬랩이 오기 전에 같은 크기의 빈 케이스가 자리를 지킨다: 아래가 밀려 내려가지 않는다 */
const SlabGhosts = () => (
  <div className="hm-belt" aria-hidden="true"><div className="hm-rail is-ghost">
    {[0, 1, 2, 3, 4, 5].map(i => <Case key={i} title="" sprite="" />)}
  </div></div>
);

/* 아레나: 원근으로 누운 배틀 필드(arenaField). 밝은 선 위를 네이비 장이 덮고, 장의 또렷한 구멍을 변형으로만 옮긴다.
   위에 어두운 선을 겹쳐 그리면 구멍 안의 선만 밝게 보인다. 무엇도 다시 그리지 않는다. */
const Lines = ({ g, d, className }) => <svg className={"hm-f " + className} width={g.w} height={g.h} viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden="true"><path d={d} /></svg>;
const shape = el => { const phone = el.clientWidth < 860, h = phone ? 620 : 840, floorY = Math.round(h * (phone ? .42 : .4)); return { w: el.clientWidth, h, floorY }; };
function Arena({ primary, go }) {
  const close = useRef(null), stage = useRef(null), hole = useRef(null), wave = useRef(null), mark = useRef(null), band = useRef(null), ringRef = useRef(null), knobRef = useRef(null);
  const [field, setField] = useState(null);
  const rest = useRef([0, 0]), waveAt = useRef("none");
  useLayoutEffect(() => {
    const measure = () => { const g = shape(close.current); setField(f => f && f.w === g.w && f.h === g.h ? f : { ...g, paths: arenaField(g.w, g.h, g.floorY) }); };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);
  const placeHole = (x, y) => { hole.current.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; };
  useLayoutEffect(() => {
    if (!field) return;
    const ring = ringRef.current.getBBox(), knob = knobRef.current.getBBox();
    /* YPL은 단추의 먼 끝에 선다. 글과 단추는 원의 가까운 끝 아래에 선다 */
    mark.current.style.top = Math.round(knob.y) - 8 + "px";
    close.current.style.paddingTop = Math.ceil(ring.y + ring.height + 56) + "px";
    rest.current = [field.w / 2, knob.y + knob.height / 2];
    placeHole(...rest.current);
    const ww = ring.width * 3.2, wh = ring.height * 3.2;
    Object.assign(wave.current.style, { width: ww + "px", height: wh + "px" });
    waveAt.current = `translate(${rest.current[0] - ww / 2}px,${rest.current[1] - wh / 2}px)`;
  }, [field]);
  /* 파동은 몬스터볼에서 나가는 또렷한 원 하나다 */
  const fireWave = () => {
    if (reduced()) return;
    wave.current.animate([{ transform: `${waveAt.current} scale(.05)`, opacity: .9 }, { transform: `${waveAt.current} scale(1)`, opacity: 0 }], { duration: DUR.wait, easing: EASE_OUT });
  };
  /* 처음 화면에 들어올 때 한 번: 선이 가운데에서 그어지고, 몬스터볼이 켜지고, 파동이 지나고, 띠 하나가 YPL을 지나간다 */
  useEffect(() => {
    if (!field || !arenaPending || reduced() || typeof IntersectionObserver !== "function") return undefined;
    const st = stage.current;
    let timer = 0;
    st.classList.add("pre");
    const once = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      once.disconnect();
      arenaPending = false;
      st.classList.remove("pre");
      const play = (s, kf, o) => st.querySelectorAll(s).forEach(el => el.animate(kf, { easing: EASE_OUT, fill: "backwards", ...o }));
      const fade = [{ opacity: 0 }, { opacity: 1 }];
      play(".hm-line", [{ transform: "scaleX(0)" }, { transform: "none" }], { duration: DUR.place, delay: 120 });
      play(".hm-rect", [{ opacity: 0, transform: "scaleY(.2)" }, { opacity: 1, transform: "none" }], { duration: DUR.place, delay: 150 });
      play(".hm-ring", fade, { duration: DUR.place, delay: 240 });
      play(".hm-ball", fade, { duration: DUR.leave, delay: 360 });
      play(".hm-lit", fade, { duration: DUR.place, delay: 420 });
      play(".hm-mark > .wordmark", fade, { duration: DUR.place, delay: 300 });
      band.current.animate([{ transform: "translateX(-160%) skewX(-12deg)" }, { transform: "translateX(480%) skewX(-12deg)" }], { duration: DUR.seal, delay: 600, easing: EASE_IN_OUT });
      timer = setTimeout(fireWave, 360);
    }, { threshold: .3 });
    once.observe(st);
    return () => { once.disconnect(); clearTimeout(timer); st.classList.remove("pre"); };
  }, [Boolean(field)]); // eslint-disable-line react-hooks/exhaustive-deps
  /* 포인터의 빛: 구멍 하나를 옮긴다. 떠나면 몬스터볼로 돌아가 머문다 */
  useEffect(() => {
    if (!field || reduced() || !matchMedia("(pointer: fine)").matches) return undefined;
    const box = close.current;
    let [x, y] = rest.current, [tx, ty] = rest.current, raf = 0;
    const step = () => {
      x += (tx - x) * .12; y += (ty - y) * .12;
      placeHole(x, y);
      raf = Math.abs(tx - x) + Math.abs(ty - y) > .3 ? requestAnimationFrame(step) : 0;
    };
    const glide = () => { if (!raf) raf = requestAnimationFrame(step); };
    const onMove = e => {
      if (e.pointerType !== "mouse") return;
      const r = stage.current.getBoundingClientRect();
      tx = e.clientX - r.left; ty = e.clientY - r.top;
      glide();
    };
    const onLeave = () => { [tx, ty] = rest.current; glide(); };
    box.addEventListener("pointermove", onMove, { passive: true });
    box.addEventListener("pointerleave", onLeave);
    return () => { box.removeEventListener("pointermove", onMove); box.removeEventListener("pointerleave", onLeave); cancelAnimationFrame(raf); };
  }, [field]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = field?.paths;
  return (
    <section className="hm-close" ref={close} onClick={e => !e.target.closest("button, a") && fireWave()}>
      <div className="hm-arena" ref={stage} style={field ? { height: field.h, "--floor": field.floorY + "px" } : undefined}>
        {field && <Lines g={field} className="hm-lit" d={p.rect + p.line + p.ring + p.knob + p.face} />}
        <i className="hm-hole" ref={hole} aria-hidden="true" style={field ? { "--hole": Math.min(field.w * .36, 320) + "px" } : undefined} />
        {field && <div className="hm-dim">
          <Lines g={field} className="hm-rect" d={p.rect} />
          <Lines g={field} className="hm-line" d={p.line} />
          <svg className="hm-f hm-ring" width={field.w} height={field.h} viewBox={`0 0 ${field.w} ${field.h}`} aria-hidden="true"><path d={p.ring} ref={ringRef} /></svg>
          <svg className="hm-f hm-ball" width={field.w} height={field.h} viewBox={`0 0 ${field.w} ${field.h}`} aria-hidden="true"><path d={p.knob + p.face} ref={knobRef} /></svg>
        </div>}
        <i className="hm-wave" ref={wave} aria-hidden="true" />
        <div className="hm-mark" ref={mark}><Wordmark /><span className="hm-shine" style={{ WebkitMask: MARK_MASK, mask: MARK_MASK }} aria-hidden="true"><i className="hm-band" ref={band} /></span></div>
      </div>
      <div className="hm-end">
        <h2>다음 기록을 남길 차례입니다.</h2>
        <Button type="button" variant="inverse" size="lg" onClick={() => go(primary[1])}>{primary[0]}</Button>
      </div>
    </section>
  );
}

/* ============================== HOME ==============================
   기록부 한 권: 네이비 앞표지(문장, 다음 대회, 봉인된 챔피언), 흰 속지(리그의 숫자, 공지, 갈 곳), 네이비 뒤표지(아레나).
   첫 등장은 1초 안에: 문장이 솟고, 슬랩이 앞에서부터 스프링으로 서고, 사선 면 하나가 현재 챔피언을 지나간다. */
export default function HomePage({ data, go, admin }) {
  const [enter] = useState(firstHero);
  const hero = useRef(null);
  const [champions, setChampions] = useState(null), [counts, setCounts] = useState(null), [pop, setPop] = useState(null);

  useEffect(() => {
    let live = true;
    loadChampions(data).then(rows => { if (live) setChampions(rows); }).catch(error => { console.warn("home champions read failed", error); if (live) setChampions([]); });
    loadCounts(data, admin).then(next => { if (live) setCounts(next); }).catch(error => console.warn("home counts read failed", error));
    return () => { live = false; };
  }, [data]);

  useLayoutEffect(() => {
    heroPending = false;
    if (!enter) return;
    const q = s => [...hero.current.querySelectorAll(s)];
    place(q(".hm-ln"), { delay: 60, step: 100 });
    place(q(".hm-next, .hm-actions"), { delay: 260, step: 100 });
  }, [enter]);

  /* 대회 단계: 남은 날과 주 행동이 같은 계산을 읽는다 */
  const now = useMemo(() => {
    const upcoming = nextEvent(data.announcements);
    if (!upcoming) return null;
    const { a, draft, raw, dday } = upcoming, today = dday === 0;
    return { today, dday, name: draft.name || a.title, when: formatDate(raw, { time: true }) };
  }, [data.announcements]);
  const primary = !now ? ["기록 보기", "records"] : now.today ? ["대진표 보기", "bracket"] : ["이번 대회 신청", "news"];
  const notices = useMemo(() => [...data.announcements].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.date < b.date ? 1 : -1)).slice(0, 3), [data.announcements]);
  const routes = [["bracket", "대진표", "지금 열린 대회의 대진과 결과"], ["records", "기록", "트레이너, 대회, 포켓몬, 랭킹"], ["champions", "명예의 전당", "역대 챔피언과 우승 엔트리"], ["builder", "팀 빌더", "현재 규정으로 팀을 짜고 저장"]];
  const showCounts = counts && counts.tournaments > 0 && counts.trainers > 0 && champions;

  return (<div className="hm">
    <div className="hm-cover">
      <section className="hm-lead" ref={hero}>
        <h1><span className="hm-ln">모든 승부가</span> <span className="hm-ln">기록이 됩니다.</span></h1>
        <div className="hm-now">
          {now
            ? <p className="hm-next">{now.today && <i className="live-dot" aria-hidden="true" />}<b className="tnum">{now.today ? "오늘" : `D-${now.dday}`}</b><span><strong>{now.name}</strong>{now.when}</span></p>
            : <p className="hm-next">다음 대회 일정은 공지에 올라옵니다.</p>}
          <div className="hm-actions">
            <Button type="button" variant="inverse" size="lg" onClick={() => go(primary[1])}>{primary[0]}</Button>
            <Button type="button" size="lg" onClick={() => go("about")}>리그 소개</Button>
          </div>
        </div>
      </section>
      {champions?.length ? <SlabRail champions={champions} enter={enter} onOpen={setPop} /> : champions ? null : <SlabGhosts />}
    </div>

    <div className="hm-wrap hm-figs" role="group" aria-label="리그의 숫자">
      {showCounts && [[counts.tournaments, "회", "대회"], [counts.trainers, "명", "트레이너"], [champions.length, "명", "챔피언"]].map(([n, unit, label]) => (
        <Case key={label} title={label}><span className="hm-fig"><Roll value={n} /><small>{unit}</small></span></Case>
      ))}
    </div>

    <div className="hm-wrap hm-board">
      {notices.length > 0 && <section className="hm-notices">
        <div className="hm-head">
          <h2>공지</h2>
          <button type="button" className="hm-all" data-tab="news" onClick={() => go("news")}>공지 전체 보기</button>
        </div>
        <div className="hm-list">
          {notices.map(a => {
            const excerpt = excerptOf(a.body, a.title);
            return <button type="button" className="hm-row" key={a.id} onClick={() => go("news", { notice: a.id })}><b>{a.title}</b><span>{formatDate(a.date)}{excerpt && `, ${excerpt}`}</span></button>;
          })}
        </div>
      </section>}
      <nav className="hm-routes" aria-label="바로 가기">
        {routes.map(([view, title, line]) => <Case key={view} title={title} line={line} data-tab={view} onClick={() => go(view)} />)}
      </nav>
    </div>

    <Arena primary={primary} go={go} />

    {pop && <ChampionSheet name={pop.name} hint={`${pop.label} 챔피언, ${pop.line}`} party={pop.party} onClose={() => setPop(null)}>
      <Button type="button" data-tab="champions" onClick={() => go("champions")}>명예의 전당 보기</Button>
    </ChampionSheet>}
  </div>);
}
