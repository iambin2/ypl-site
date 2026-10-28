import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

/* 아레나의 첫 등장은 사이트에 들어올 때마다 한 번이다. 판정은 처음 그릴 때 받아 두고 그려진 뒤에 지운다
   (개발 모드의 두 번 호출도 같은 답을 받는다). 홈에 다시 오면 다 켜진 아레나가 보통의 화면 전환으로 선다. */
let coverPending = true;
const firstCover = () => coverPending;

/* YPL의 좌표(viewBox)와 그 위의 빛이 쉬는 자리: 위 가운데 */
const VB = [-4, -4, 318, 108];
const LAMP_REST = [155, -10];

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

/* 원근으로 누운 배틀 필드: 바깥 선, 양 끝의 트레이너 박스, 가운데 선과 원과 단추(몬스터볼). 같은 필드를 두 장 겹쳐
   아래 장은 흐린 선, 위 장은 빛을 받은 선이다. 위 장은 빛이 닿는 자리만 보인다(--hx, --hy). */
function Field({ lit }) {
  return (
    <div className={"ha-persp" + (lit ? " lit" : "")} aria-hidden="true">
      <div className="ha-plane">
        {!lit && <i className="ha-pool" />}
        <i className="ha-rect" /><i className="ha-box t" /><i className="ha-box b" /><i className="ha-line" /><i className="ha-ring" />
        {lit && <i className="ha-wave" />}
        <i className="ha-knob" />
      </div>
    </div>
  );
}

/* ============================== HOME ==============================
   홈은 아레나 한 화면(DECISIONS 18차): 원근으로 누운 배틀 필드의 몬스터볼 위에 YPL이 서고 바닥에 비친다. 그 아래 다가오는 대회와 행동.
   움직임의 원칙(14차의 피드백): 물체는 서 있고 빛만 움직인다. 포인터는 필드 위의 빛과 YPL 위의 빛을 옮기고, 빈 곳을 누르면 빛의 파동이 바닥을 지나간다.
   첫 등장은 무겁고 느리게: 위의 빛이 켜지고, 선이 가운데에서 그어지고, 몬스터볼에 불이 들어오며 파동이 지나간 뒤, YPL이 어둠과 흐림을 벗는다. */
export default function HomePage({ data, go }) {
  const [enter] = useState(firstCover);
  const stageRef = useRef(null), markRef = useRef(null), bandRef = useRef(null), lampRef = useRef(null), infoRef = useRef(null);

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

  /* 빛의 파동 하나가 몬스터볼에서 바닥을 지나간다 */
  const wave = () => {
    const stage = stageRef.current;
    if (!stage || reduced()) return;
    stage.querySelector(".ha-wave").animate([{ transform: "scale(1)", opacity: .9 }, { transform: "scale(14)", opacity: 0 }], { duration: 2400, easing: EASE_OUT });
    for (const k of stage.querySelectorAll(".ha-knob")) k.animate([{ filter: "brightness(2)" }, { filter: "none" }], { duration: 1200, easing: EASE_OUT });
  };

  /* 첫 등장. 다시 오면 글이 화면 전환을 따라 선다 */
  useLayoutEffect(() => {
    coverPending = false;
    if (!enter || reduced()) { rise(infoRef.current, reduced() ? 0 : 640); return undefined; }
    const st = stageRef.current, q = s => [...st.querySelectorAll(s)];
    const play = (s, kf, o) => q(s).forEach(el => el.animate(kf, { easing: EASE_OUT, fill: "backwards", ...o }));
    const fade = [{ opacity: 0 }, { opacity: 1 }];
    play(".ha-beam", fade, { duration: 1600 });
    play(".ha-pool", fade, { duration: 1600, delay: 200 });
    play(".ha-line", [{ transform: "scaleX(0)" }, { transform: "none" }], { duration: 1400, delay: 400 });
    play(".ha-rect", [{ clipPath: "inset(50% 0 50% 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 1600, delay: 500 });
    play(".ha-ring", fade, { duration: 1200, delay: 800 });
    play(".ha-knob", fade, { duration: 900, delay: 1200 });
    play(".ha-box", fade, { duration: 900, delay: 1300 });
    play(".ha-persp.lit", fade, { duration: 1400, delay: 1400 });
    play(".ha-mark svg:not(.ha-refl)", [{ opacity: 0, filter: "blur(24px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 2000, delay: 1700 });
    play(".ha-refl", [{ opacity: 0 }, { opacity: .3 }], { duration: 2000, delay: 1700 });
    let stopSweep = null;
    const timers = [setTimeout(wave, 1700), setTimeout(() => { stopSweep = sweep(bandRef.current, 2600); }, 2600)];
    rise(infoRef.current, 3200);
    return () => { timers.forEach(clearTimeout); stopSweep?.(); };
  }, [enter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 포인터가 빛을 옮긴다: 필드 위의 빛(닿는 자리의 선만 밝아진다)과 YPL 위의 빛. 필드와 글자는 움직이지 않는다.
     포인터가 없거나 떠나면 빛은 몬스터볼과 YPL의 위 가운데로 돌아가 머문다 */
  useEffect(() => {
    if (reduced() || !matchMedia("(pointer: fine)").matches) return undefined;
    const stage = stageRef.current, lit = stage.querySelector(".ha-persp.lit"), lamp = lampRef.current, mark = markRef.current.querySelector("svg");
    const rest = () => { const r = stage.getBoundingClientRect(); return [r.width / 2, r.height * parseFloat(getComputedStyle(stage).getPropertyValue("--floor")) / 100]; };
    let [fx, fy] = rest(), [tfx, tfy] = [fx, fy], [lx, ly] = LAMP_REST, [tlx, tly] = LAMP_REST, raf = 0;
    const step = () => {
      fx += (tfx - fx) * .07; fy += (tfy - fy) * .07; lx += (tlx - lx) * .08; ly += (tly - ly) * .08;
      lit.style.setProperty("--hx", fx.toFixed(1) + "px"); lit.style.setProperty("--hy", fy.toFixed(1) + "px");
      lamp.setAttribute("cx", lx.toFixed(1)); lamp.setAttribute("cy", ly.toFixed(1));
      raf = Math.abs(tfx - fx) + Math.abs(tfy - fy) + Math.abs(tlx - lx) + Math.abs(tly - ly) > .3 ? requestAnimationFrame(step) : 0;
    };
    const glide = () => { if (!raf) raf = requestAnimationFrame(step); };
    const onMove = e => {
      if (e.pointerType !== "mouse") return;
      const s = stage.getBoundingClientRect(), m = mark.getBoundingClientRect();
      tfx = e.clientX - s.left; tfy = e.clientY - s.top;
      tlx = VB[0] + (e.clientX - m.left) / m.width * VB[2]; tly = Math.max(-30, VB[1] + (e.clientY - m.top) / m.height * VB[3]);
      glide();
    };
    const onLeave = () => { [tfx, tfy] = rest(); [tlx, tly] = LAMP_REST; glide(); };
    addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => { removeEventListener("pointermove", onMove); document.documentElement.removeEventListener("pointerleave", onLeave); cancelAnimationFrame(raf); };
  }, []);

  const stop = (offset, opacity, color = "var(--fg)") => <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />;
  const shine = "var(--home-shine)";
  const letters = ["body", "lamp", "band"].map(k => <path key={k} transform="skewX(-12) translate(21 0)" fillRule="evenodd" d={WORDMARK_PATH} fill={`url(#ha-${k})`} />);

  return (<div className="ha" onClick={e => !e.target.closest("button, a") && wave()}>
    <div className="ha-stage" ref={stageRef}>
      <i className="ha-beam" aria-hidden="true" />
      <Field /><Field lit />
      <h1 className="ha-mark" ref={markRef}><span className="sr-only">Yonsei Pokémon League</span>
        <svg viewBox={VB.join(" ")} aria-hidden="true">
          <defs>
            <linearGradient id="ha-body" x1="0" y1="0" x2="0" y2="1">{stop(0, .95)}{stop(1, .6)}</linearGradient>
            <radialGradient id="ha-lamp" ref={lampRef} gradientUnits="userSpaceOnUse" cx={LAMP_REST[0]} cy={LAMP_REST[1]} r="90">{stop(0, .55, shine)}{stop(1, 0, shine)}</radialGradient>
            <linearGradient id="ha-band" ref={bandRef} gradientUnits="userSpaceOnUse" x1="-160" y1="0" x2="-40" y2="0">{stop(0, 0, shine)}{stop(.5, .9, shine)}{stop(1, 0, shine)}</linearGradient>
          </defs>
          {letters}
        </svg>
        <svg className="ha-refl" viewBox={VB.join(" ")} aria-hidden="true">{letters}</svg>
      </h1>
    </div>
    <div className="ha-info" ref={infoRef}>
      {now && <div className="ha-ev">
        <div className="ha-ev-row"><span className="fig">{now.today ? "오늘" : `D-${now.dday}`}</span><span className="ha-ev-name">{now.name}</span></div>
        <span className="ha-ev-meta">{now.today && <i className="live-dot" aria-hidden="true" />}{now.dueLabel}, {now.status}</span>
      </div>}
      {/* 잡힌 대회가 없을 때도 처음 온 사람이 다음에 무엇을 볼지 한 줄로 안다 */}
      {!now && <p className="ha-ev-meta">다음 대회 일정은 공지에 올라옵니다.</p>}
      <div className="ha-actions">
        <button type="button" className="ypl-btn ypl-btn--primary press hl" onClick={() => go(primary[1])}>{primary[0]}</button>
        <button type="button" className="ypl-btn ypl-btn--glass press hl" onClick={() => go("about")}>리그 소개</button>
      </div>
    </div>
  </div>);
}
