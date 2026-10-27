import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReigningChampion } from "../components/home/useReigningChampion.js";
import { reduced, EASE_OUT } from "../components/common/motion.js";
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

/* D2: 무대의 밝기는 대회 상태를 따른다. 오늘 열리면 진행 중, 다가오면 접수 중, 없으면 종료. */
export function stageStateOf(announcements) {
  const upcoming = nextEvent(announcements);
  return !upcoming ? "done" : upcoming.dday === 0 ? "live" : "open";
}

/* 전당의 첫 등장은 사이트에 들어올 때마다 한 번이다. 판정은 처음 그릴 때 받아 두고 그려진 뒤에 지운다
   (개발 모드의 두 번 호출도 같은 답을 받는다). 홈에 다시 오면 다 켜진 전당이 보통의 화면 전환으로 선다. */
let coverPending = true;
const firstCover = () => coverPending;

/* 거대한 YPL의 좌표(viewBox)와 빛이 쉬는 자리: 위 가운데 */
const VB = [-4, -4, 318, 108];
const LAMP_REST = [155, -10];
/* V자: 가운데 둘이 크고 앞에, 양 끝으로 갈수록 작고 뒤에 */
/* 그림이 오지 않으면 숨긴다(그림자 마스크도 같은 그림이라 함께 비고, 자리만 남는다) */
const hideBroken = e => { e.currentTarget.hidden = true; };
const sizeAt = (i, n) => { const d = Math.abs(i - (n - 1) / 2); return d < 1 ? 1 : d < 2 ? .84 : .7; };

function rise(el, delay) {
  if (!el) return;
  const still = reduced();
  el.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(12px)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
    { duration: still ? 1 : 900, delay, easing: EASE_OUT, fill: "backwards" });
}
/* 빛의 띠가 YPL 위를 한 번 지나간다(양끝이 느린 곡선) */
function sweep(band, ms) {
  let t0 = 0, raf = 0;
  const step = t => {
    t0 ||= t;
    const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, x = -160 + e * 640;
    band.setAttribute("x1", x); band.setAttribute("x2", x + 120);
    if (k < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/* ============================== HOME ==============================
   홈은 전당 한 화면(DECISIONS 14차): 거대한 YPL 앞에 V자로 선 현 챔피언의 여섯, 챔피언의 명판, 다가오는 대회와 행동.
   움직임의 원칙: 물체는 서 있고 빛만 움직인다. 포인터는 YPL 위의 빛을 옮기고, 포켓몬 위에 올리면(폰은 누르면) 그 한 마리의 조명만 밝아진다.
   첫 등장: YPL이 어둠에서 흐림을 벗고, 빛의 띠가 지나가고, 하얀 그림자 여섯이 선 뒤 가운데부터 한 마리씩 조명을 받아 제 색을 찾는다. */
export default function HomePage({ data, go }) {
  const [enter] = useState(firstCover);
  const reigning = useReigningChampion(data.champions);
  const party = reigning ? reigning.party : [];
  const [lit, setLit] = useState(() => new Set());
  const [focus, setFocus] = useState(null);
  const giantRef = useRef(null), bandRef = useRef(null), lampRef = useRef(null), rowRef = useRef(null), plaqueRef = useRef(null), infoRef = useRef(null);
  const t0 = useRef(0);

  /* 대회 단계: 남은 날과 주 행동이 같은 계산을 읽는다 */
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

  /* 첫 등장의 YPL, 빛의 띠, 대회와 행동. 다시 오면 글이 화면 전환을 따라 선다 */
  useLayoutEffect(() => {
    coverPending = false;
    t0.current = performance.now();
    if (!enter || reduced()) { rise(infoRef.current, reduced() ? 0 : 640); return undefined; }
    giantRef.current.animate([{ opacity: 0, transform: "scale(1.03)", filter: "blur(24px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
      { duration: 2000, easing: EASE_OUT, fill: "backwards" });
    let stopSweep = null;
    const timer = setTimeout(() => { stopSweep = sweep(bandRef.current, 2600); }, 900);
    rise(infoRef.current, 2860);
    return () => { clearTimeout(timer); stopSweep?.(); };
  }, [enter]);

  /* 명판은 전당 기록이 오면 선다(첫 등장이면 그 차례에 맞춰) */
  const hasReigning = Boolean(reigning);
  useLayoutEffect(() => {
    if (!hasReigning) return;
    const since = performance.now() - t0.current;
    rise(plaqueRef.current, reduced() ? 0 : Math.max(0, (enter ? 2700 : 520) - since));
  }, [hasReigning, enter]);

  /* 여섯: 첫 등장이면 하얀 그림자로 함께 선 뒤 가운데부터 한 마리씩 조명이 켜지며 제 색을 찾는다. 아니면 다 켜진 채로 */
  const partyKey = party.map(m => m.img).join("|");
  useLayoutEffect(() => {
    if (!partyKey) return undefined;
    const n = party.length, all = new Set(party.map((_, i) => i));
    const row = rowRef.current, mons = [...row.querySelectorAll(".hh-mon")];
    if (!enter || reduced()) { setLit(all); return undefined; }
    const since = performance.now() - t0.current, appear = Math.max(0, 1500 - since), first = Math.max(appear + 1000, 2500 - since);
    for (const el of [...row.querySelectorAll(".hh-fig:not(.hh-refl), .hh-floor, .hh-edge")]) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1000, delay: appear, easing: EASE_OUT, fill: "backwards" });
    for (const el of row.querySelectorAll(".hh-refl")) el.animate([{ opacity: 0 }, { opacity: .22 }], { duration: 1000, delay: appear, easing: EASE_OUT, fill: "backwards" });
    const order = mons.map((_, i) => i).sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
    const timers = order.map((i, k) => setTimeout(() => {
      const m = mons[i];
      m.querySelector(".hh-beam").animate([{ opacity: 0 }, { opacity: .85, offset: .4 }, { opacity: .55 }], { duration: 1800, easing: EASE_OUT });
      for (const s of m.querySelectorAll(".hh-sil")) s.animate([{ opacity: 1, filter: "brightness(1)" }, { opacity: 1, filter: "brightness(1.5) drop-shadow(0 0 18px var(--fg))", offset: .3 }, { opacity: 0 }], { duration: 1100, easing: EASE_OUT });
      for (const img of m.querySelectorAll("img")) img.animate([{ opacity: 0 }, { opacity: 0, offset: .3 }, { opacity: 1 }], { duration: 1100, easing: EASE_OUT });
      setLit(prev => new Set(prev).add(i));
    }, first + k * 260));
    return () => timers.forEach(clearTimeout);
    // party 는 partyKey 로 대신한다(같은 그림이면 다시 차례를 밟지 않는다)
  }, [partyKey, enter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 포인터가 YPL 위의 빛을 옮긴다. 글자는 움직이지 않는다. 포인터가 없으면 빛은 위 가운데에 머문다 */
  useEffect(() => {
    if (reduced() || !matchMedia("(pointer: fine)").matches) return undefined;
    const lamp = lampRef.current, giant = giantRef.current;
    let [x, y] = LAMP_REST, [tx, ty] = LAMP_REST, raf = 0;
    const step = () => {
      x += (tx - x) * .08; y += (ty - y) * .08;
      lamp.setAttribute("cx", x.toFixed(1)); lamp.setAttribute("cy", y.toFixed(1));
      raf = Math.abs(tx - x) + Math.abs(ty - y) > .2 ? requestAnimationFrame(step) : 0;
    };
    const aim = (nx, ny) => { tx = nx; ty = ny; if (!raf) raf = requestAnimationFrame(step); };
    const onMove = e => {
      if (e.pointerType !== "mouse") return;
      const r = giant.getBoundingClientRect();
      aim(VB[0] + (e.clientX - r.left) / r.width * VB[2], Math.max(-30, VB[1] + (e.clientY - r.top) / r.height * VB[3]));
    };
    const onLeave = () => aim(...LAMP_REST);
    addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => { removeEventListener("pointermove", onMove); document.documentElement.removeEventListener("pointerleave", onLeave); cancelAnimationFrame(raf); };
  }, []);

  /* 홈의 화면 내리기는 목표 위치로 미끄러져 간다. 휠은 한 칸씩 목표를 옮기고, 터치(2026-10-24, 사용자 요청)는 끄는 동안 손가락을 바짝 따르다가
     놓으면 그 빠르기로 더 미끄러져 서서히 선다. 시트 안, 확대(ctrl) 휠, 두 손가락(핀치)은 건드리지 않는다.
     따라가는 정도는 프레임 길이로 맞춘다(120Hz 폰에서도 같은 빠르기). */
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    let cur = scrollY, target = scrollY, raf = 0, last = 0, ease = .14;
    const max = () => document.documentElement.scrollHeight - innerHeight;
    const step = now => {
      const k = 1 - (1 - ease) ** (Math.min(64, now - (last || now - 16.7)) / 16.7);
      last = now;
      cur += (target - cur) * k;
      if (Math.abs(target - cur) < 0.5) { cur = target; raf = 0; last = 0; } else raf = requestAnimationFrame(step);
      scrollTo(0, cur);
    };
    const push = (dy, e) => {
      if (!raf) cur = target = scrollY;
      ease = e;
      target = Math.max(0, Math.min(max(), target + dy));
      if (!raf) raf = requestAnimationFrame(step);
    };
    const onWheel = e => {
      if (e.ctrlKey || e.target.closest?.(".overlay")) return;
      e.preventDefault();
      push(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1), .14);
    };
    let drag = false, y0 = 0, t0 = 0, vel = 0;
    const onStart = e => {
      drag = e.touches.length === 1 && !e.target.closest?.(".overlay");
      if (!drag) return;
      y0 = e.touches[0].clientY; t0 = e.timeStamp; vel = 0;
      cancelAnimationFrame(raf); raf = 0; last = 0;
    };
    const onMove = e => {
      if (!drag) return;
      if (e.touches.length !== 1) { drag = false; return; }
      e.preventDefault();
      const y = e.touches[0].clientY, dy = y0 - y, dt = Math.max(1, e.timeStamp - t0);
      y0 = y; t0 = e.timeStamp;
      vel = vel * .2 + (dy / dt) * .8;
      push(dy, .5);
    };
    const onEnd = e => {
      if (!drag) return;
      drag = false;
      // 멈췄다 놓으면 미끄러지지 않는다
      if (e.timeStamp - t0 > 80) vel = 0;
      push(vel * 320, .075);
    };
    addEventListener("wheel", onWheel, { passive: false });
    addEventListener("touchstart", onStart, { passive: true });
    addEventListener("touchmove", onMove, { passive: false });
    addEventListener("touchend", onEnd);
    addEventListener("touchcancel", onEnd);
    return () => {
      removeEventListener("wheel", onWheel); removeEventListener("touchstart", onStart); removeEventListener("touchmove", onMove);
      removeEventListener("touchend", onEnd); removeEventListener("touchcancel", onEnd); cancelAnimationFrame(raf);
    };
  }, []);

  const pick = i => lit.has(i) && setFocus(i);
  const fig = m => <><i className="hh-sil" style={{ "--src": `url("${m.img}")` }} /><img src={m.img} alt="" decoding="async" onError={hideBroken} /></>;
  const stop = (offset, opacity, color = "var(--fg)") => <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />;
  const shine = "var(--hh-shine)";

  return (<div className="hh">
    <section className="hh-hall" aria-labelledby="hh-title">
      <h1 id="hh-title"><span className="sr-only">Yonsei Pokémon League</span>
        <svg className="hh-giant" ref={giantRef} viewBox={VB.join(" ")} aria-hidden="true">
          <defs>
            <linearGradient id="hh-body" x1="0" y1="0" x2="0" y2="1">{stop(0, .78)}{stop(.5, .36)}{stop(1, .03)}</linearGradient>
            <radialGradient id="hh-lamp" ref={lampRef} gradientUnits="userSpaceOnUse" cx={LAMP_REST[0]} cy={LAMP_REST[1]} r="90">{stop(0, .6, shine)}{stop(1, 0, shine)}</radialGradient>
            <linearGradient id="hh-band" ref={bandRef} gradientUnits="userSpaceOnUse" x1="-160" y1="0" x2="-40" y2="0">{stop(0, 0, shine)}{stop(.5, .9, shine)}{stop(1, 0, shine)}</linearGradient>
          </defs>
          {["body", "lamp", "band"].map(k => <path key={k} transform="skewX(-12) translate(21 0)" fillRule="evenodd" d={WORDMARK_PATH} fill={`url(#hh-${k})`} />)}
        </svg>
      </h1>
      {party.length > 0 && <>
        <div className="hh-row" ref={rowRef} role="group" aria-label="현 챔피언의 파티" onPointerLeave={e => e.pointerType === "mouse" && setFocus(null)}>
          <i className="hh-floor" aria-hidden="true" />
          {party.map((m, i) => (
            <button key={i} type="button" style={{ "--s": sizeAt(i, party.length) }} aria-label={m.name || "포켓몬"}
              className={"hh-mon" + (lit.has(i) ? " lit" : "") + (focus === i ? " focus" : focus !== null ? " dim" : "")}
              onPointerEnter={e => e.pointerType === "mouse" && pick(i)} onClick={() => (focus === i ? setFocus(null) : pick(i))}>
              <i className="hh-beam" aria-hidden="true" />
              <span className="hh-fig">{fig(m)}</span>
              <span className="hh-fig hh-refl" aria-hidden="true">{fig(m)}</span>
            </button>
          ))}
          <i className="hh-edge" aria-hidden="true" />
        </div>
        <p className={"hh-name" + (focus !== null ? " on" : "")} aria-live="polite">{focus !== null ? party[focus]?.name : ""}</p>
      </>}
    </section>
    {reigning && <div className="hh-plaque" ref={plaqueRef}>
      <b>{reigning.name}</b>
      <span>{reigning.label}</span>
    </div>}
    <div className="hh-info" ref={infoRef}>
      {now && <div className="hh-ev">
        <div className="hh-ev-row"><span className="fig hh-dday">{now.today ? "오늘" : `D-${now.dday}`}</span><span className="hh-ev-name">{now.name}</span></div>
        <span className="hh-ev-meta">{now.today && <i className="live-dot" aria-hidden="true" />}{now.dueLabel}, {now.status}</span>
      </div>}
      <div className="hh-actions">
        <button type="button" className="ypl-btn ypl-btn--primary press hl" onClick={() => go(primary[1])}>{primary[0]}</button>
        <button type="button" className="ypl-btn ypl-btn--glass press hl" onClick={() => go("about")}>리그 소개</button>
      </div>
    </div>
  </div>);
}
