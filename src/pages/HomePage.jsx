import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/index.js";
import { lineBlock } from "../components/home/brandTitle.js";
import { startGlassCover } from "../components/home/glassCover.js";
import { WORDMARK_PATH } from "../components/layout/SiteHeader.jsx";
import { formatDate } from "../services/dateFormat.js";

const DAY_MS = 86400000;
/* "2026-10-04", "2026.10.04", "2026-10-04T15:21" → 그날 0시의 Date. 일까지 없으면 null. */
function dayOf(s) {
  const n = String(s || "").match(/\d+/g);
  if (!n || n.length < 3) return null;
  const d = new Date(+n[0], +n[1] - 1, +n[2]);
  return Number.isNaN(d.getTime()) ? null : d;
}
/* 홈 첫 화면의 다음 행동. 이미 불러온 공지(site_data)의 대회 정보만 읽는다. 새 조회는 없다. */
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

/* D2: 무대의 밝기는 대회 상태를 따른다. 오늘 열리면 진행 중, 다가오면 접수 중, 없으면 종료. */
export function stageStateOf(announcements) {
  const upcoming = nextEvent(announcements);
  return !upcoming ? "done" : upcoming.dday === 0 ? "live" : "open";
}

/* 표지의 첫 등장(벽이 켜지고 유리 YPL이 내려앉는다)은 사이트에 들어올 때마다 한 번이다.
   판정은 처음 그릴 때 받아 두고 그려진 뒤에 지운다(개발 모드의 두 번 호출도 같은 답을 받는다). 홈에 다시 오면 보통의 화면 전환만. */
let coverPending = true;
const firstCover = () => coverPending;

/* 표지의 이름(11차): 유리로 된 YPL 워드마크 하나와 그 아래 같은 글자로 그린 한 줄 YONSEI POKEMON LEAGUE.
   무대가 켜지면 YPL 자리는 비워 두고 유리(glassCover.js)가 그 자리에 선다. 무대가 없으면 워드마크를 그대로 그린다. */
function FullName() {
  const b = lineBlock();
  return (
    <svg className="hx-fullname" viewBox={`${b.left} 0 ${b.right - b.left} ${b.h}`} aria-hidden="true">
      <g transform="skewX(-12)" fillRule="evenodd">{b.glyphs.map((g, i) => <path key={i} transform={`translate(${g.x} 0)`} d={g.d} />)}</g>
    </svg>
  );
}

/* ============================== HOME ==============================
   홈은 표지 한 화면(DECISIONS 11차, 12차): 포켓몬 벽 위의 유리 YPL(glassCover.js)과 그 아래 리그의 이름, 다가오는 대회의 남은 날,
   행동 두 개와 최신 공지. 예전의 대진표 무대와 세 장(9차)은 12차에 걷어냈다. 이미 불러온 공지만 읽는다(새 조회 없음). */
const EASE = "cubic-bezier(.22,1,.36,1)";
export default function HomePage({ data, go }) {
  const [enter] = useState(firstCover);
  const glassRef = useRef(null), slotRef = useRef(null), txtRef = useRef(null);
  const [staged, setStaged] = useState(false);

  const notice = useMemo(() => [...(data.announcements || [])].sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null, [data.announcements]);

  /* 대회 단계: 표지의 큰 그림과 주 행동이 같은 계산을 읽는다 */
  const now = useMemo(() => {
    const upcoming = nextEvent(data.announcements);
    if (!upcoming) return null;
    const { a, draft, raw, dday } = upcoming;
    const today = dday === 0;
    return {
      today, dday,
      name: draft.name || a.title,
      status: today ? "오늘 열립니다" : "참가 신청 중",
      dueLabel: today ? `오늘 ${formatDate(raw, { time: true })}` : formatDate(raw, { time: true }),
    };
  }, [data.announcements]);
  const primary = !now ? ["기록 보기", "records"] : now.today ? ["대진표 보기", "bracket"] : ["이번 대회 신청하기", "news"];
  const dday = now ? (now.today ? "오늘" : `D-${now.dday}`) : null;

  /* 표지는 그리기 전에 켠다(평면 배치가 한 프레임 비치지 않게). 낮은 화면(가로로 든 폰)은 평면 배치로 남는다.
     글은 표지의 첫 등장이 끝난 뒤에 나온다(처음 1.5초, 다시 오면 페이지 전환이 끝난 뒤). */
  useLayoutEffect(() => {
    coverPending = false;
    if (innerHeight < 520) return undefined;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches, txt = txtRef.current;
    /* 첫 방문의 글은 유리가 나오기 시작한 때에 맞춘다(onShown). 다시 오면 페이지 전환이 끝난 뒤. 알림이 오지 않으면 4초에 선다. */
    let txtShown = false;
    const showTxt = delay => {
      if (txtShown || !txt) return;
      txtShown = true; txt.style.opacity = "";
      txt.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
        { duration: still ? 1 : 480, delay, easing: EASE, fill: "backwards" });
    };
    if (enter) { if (txt) txt.style.opacity = "0"; } else showTxt(520);
    const fallback = setTimeout(() => showTxt(0), 4000);
    const glass = startGlassCover(glassRef.current, slotRef.current, {
      enter, follow: slotRef.current.nextElementSibling, onShown: delay => enter && showTxt(delay),
    });
    setStaged(true);
    return () => { clearTimeout(fallback); glass.stop(); if (txt) txt.style.opacity = ""; };
  }, [enter]);

  /* 홈의 휠 스크롤은 목표 위치로 미끄러져 간다. 터치는 기기의 관성 그대로, 시트 안이나 확대(ctrl) 휠은 건드리지 않는다. */
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let cur = scrollY, target = scrollY, raf = 0;
    const step = () => {
      cur += (target - cur) * 0.14;
      if (Math.abs(target - cur) < 0.5) { cur = target; raf = 0; } else raf = requestAnimationFrame(step);
      scrollTo(0, cur);
    };
    const onWheel = e => {
      if (e.ctrlKey || e.target.closest?.(".overlay")) return;
      e.preventDefault();
      if (!raf) cur = target = scrollY;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
      target = Math.max(0, Math.min(document.documentElement.scrollHeight - innerHeight, target + dy));
      if (!raf) raf = requestAnimationFrame(step);
    };
    addEventListener("wheel", onWheel, { passive: false });
    return () => { removeEventListener("wheel", onWheel); cancelAnimationFrame(raf); };
  }, []);

  return (<div className={"home" + (staged ? " staged" : "")}>
    <section className="hx-act hx-cover" aria-labelledby="hx-title">
      <div className="hx-pin">
        <div className="hx-glass" ref={glassRef} aria-hidden="true" />
        <h1 className="hx-title" id="hx-title">
          <span className="sr-only">Yonsei Pokémon League</span>
          <span className="hx-ypl" ref={slotRef} aria-hidden="true">
            {!staged && <svg viewBox="0 0 310 100"><path transform="skewX(-12) translate(21 0)" fillRule="evenodd" d={WORDMARK_PATH} /></svg>}
          </span>
          <FullName />
        </h1>
        <div className="hx-txt" ref={txtRef}>
          {now && <div className="hx-moment">
            <span className="hx-dday tnum">{dday}</span>
            <span className="hx-moment-name">{now.name}</span>
            <span className="hx-moment-meta">{now.today && <i className="live-dot" aria-hidden="true" />}{now.dueLabel}, {now.status}</span>
          </div>}
          <div className="hx-actions">
            <button type="button" className="ypl-btn ypl-btn--primary press hl" onClick={() => go(primary[1])}>{primary[0]}</button>
            <button type="button" className="ypl-btn ypl-btn--glass press hl" onClick={() => go("about")}>리그 소개</button>
          </div>
          {notice && <button type="button" className="hx-notice press" onClick={() => go("news", { notice: notice.id })}>
            <b>공지</b><span className="hx-notice-t">{notice.title}</span><Icon n="chevr" size={14} />
          </button>}
        </div>
      </div>
    </section>
  </div>);
}
