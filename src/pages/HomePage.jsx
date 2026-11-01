import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { reduced, EASE_IN_OUT, EASE_OUT } from "../components/common/motion.js";
import { WORDMARK_PATH } from "../components/layout/SiteHeader.jsx";
import { formatDate } from "../services/dateFormat.js";
import { arenaField } from "../components/home/arenaField.js";

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

/* YPL의 좌표(viewBox). 글자 모양의 마스크 하나 안에서 빛만 움직인다 */
const VB = [-4, -4, 318, 108];
const MARK_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${VB.join(" ")}'><path transform='skewX(-12) translate(21 0)' fill-rule='evenodd' d='${WORDMARK_PATH}'/></svg>`)}") center / contain no-repeat`;

function rise(el, delay) {
  if (!el) return;
  el.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 480, delay, easing: EASE_OUT, fill: "backwards" });
}

/* 원근으로 누운 배틀 필드: 바깥 선, 양 끝의 트레이너 박스, 가운데 선과 원과 단추(몬스터볼). 필드는 움직이지 않으므로 한 번 계산해
   평면 그림(SVG)으로 그린다(arenaField.js). 등장에서 따로 움직이는 부분마다 한 장씩이고, 그린 뒤로는 다시 그리지 않는다. */
const Lines = ({ g, d, className }) => <svg className={"ha-f " + className} width={g.w} height={g.h} viewBox={`0 0 ${g.w} ${g.h}`} aria-hidden="true"><path d={d} /></svg>;
/* 무대(100vw, 100svh)의 크기와 바닥의 높이. 첫 그림은 창 크기로 짐작하고, 그려지기 전에 실제 크기로 고친다 */
const guessField = () => { const w = innerWidth, h = innerHeight, floorY = h * (w >= 860 ? .56 : .54); return { w, h, floorY, paths: arenaField(w, h, floorY) }; };

/* ============================== HOME ==============================
   홈은 아레나 한 화면(DECISIONS 18차): 원근으로 누운 배틀 필드의 몬스터볼 위에 YPL이 서고 바닥에 비친다. 그 아래 다가오는 대회와 행동.
   움직임의 원칙(14차의 피드백): 물체는 서 있고 빛만 움직인다. 포인터는 필드 위의 빛과 YPL 위의 빛을 옮기고, 빈 곳을 누르면 빛의 파동이 바닥을 지나간다.
   첫 등장은 1초 안에: 위의 빛이 켜지고, 선이 가운데에서 그어지고, 몬스터볼에 불이 들어오며 파동이 지나간 뒤, YPL이 어둠을 벗는다.
   무엇도 다시 그리지 않는다(23차): 필드의 밝은 선은 아래에 그려 두고, 그 위를 덮은 어두운 장의 구멍을 변형으로만 옮긴다. 등장도 변형과 투명도뿐이다. */
export default function HomePage({ data, go }) {
  const [enter] = useState(firstCover);
  const stageRef = useRef(null), markRef = useRef(null), bandRef = useRef(null), lampRef = useRef(null), coverRef = useRef(null), infoRef = useRef(null);
  const [field, setField] = useState(guessField);
  const [fine] = useState(() => matchMedia("(pointer: fine)").matches);
  useLayoutEffect(() => {
    const st = stageRef.current;
    const measure = () => {
      const w = st.clientWidth, h = st.clientHeight, floorY = Math.round(h * parseFloat(getComputedStyle(st).getPropertyValue("--floor")) / 100);
      setField(f => f.w === w && f.h === h && f.floorY === floorY ? f : { w, h, floorY, paths: arenaField(w, h, floorY) });
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, []);

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
    if (!stageRef.current || reduced()) return;
    stageRef.current.querySelector(".ha-wave").animate([{ transform: "scale(1)", opacity: .9 }, { transform: "scale(11)", opacity: 0 }], { duration: 2400, easing: EASE_OUT });
  };

  /* 첫 등장. 다시 오면 글이 화면 전환을 따라 선다 */
  useLayoutEffect(() => {
    coverPending = false;
    if (!enter || reduced()) return undefined;
    const st = stageRef.current;
    const play = (s, kf, o) => st.querySelectorAll(s).forEach(el => el.animate(kf, { easing: EASE_OUT, fill: "backwards", ...o }));
    const fade = [{ opacity: 0 }, { opacity: 1 }];
    play(".ha-beam, .ha-sky", fade, { duration: 480 });
    play(".ha-floor", fade, { duration: 480, delay: 60 });
    play(".ha-line", [{ transform: "scaleX(0)" }, { transform: "none" }], { duration: 420, delay: 120 });
    play(".ha-rect", [{ opacity: 0, transform: "scaleY(.2)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: 150 });
    play(".ha-ring", fade, { duration: 360, delay: 240 });
    play(".ha-ball", fade, { duration: 270, delay: 360 });
    play(".ha-lit", fade, { duration: 420, delay: 420 });
    play(".ha-mark > svg:not(.ha-refl), .ha-shine", fade, { duration: 600, delay: 300 });
    play(".ha-refl", [{ opacity: 0 }, { opacity: .3 }], { duration: 600, delay: 300 });
    bandRef.current.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(100%)" }], { duration: 900, delay: 600, easing: EASE_IN_OUT });
    const timer = setTimeout(wave, 300);
    rise(infoRef.current, 420);
    return () => clearTimeout(timer);
  }, [enter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 아래 글은 원의 가까운 끝 바로 밑에 선다(글과 단추는 그린 선 위에 서지 않는다). 원근으로 누운 원이 바닥 밑으로 얼마나
     내려오는지는 화면 크기마다 달라 계산 대신 잰다. 무대는 바닥과 함께 움직이므로 이 거리는 글의 자리와 상관없다. */
  useLayoutEffect(() => {
    const ha = stageRef.current.closest(".ha"), ring = stageRef.current.querySelector(".ha-ring path");
    const fit = () => {
      if (!ring) return;
      const near = Math.ceil(ring.getBoundingClientRect().bottom - markRef.current.getBoundingClientRect().top) + "px";
      if (ha.style.getPropertyValue("--field-near") !== near) ha.style.setProperty("--field-near", near);
    };
    fit();
  }, [field]);

  /* 포인터의 빛: 작은 캔버스에 무대 색의 장과 부드러운 구멍을 그려 화면보다 크게 늘린다. 필드의 밝은 선은 그 아래에 있고,
     구멍을 옮기는 일은 변형 하나뿐이라 아무것도 다시 그리지 않는다. 그림은 크기와 테마가 바뀔 때만 다시 그린다. */
  const floorAt = () => { const st = stageRef.current; return [st.clientWidth / 2, st.clientHeight * parseFloat(getComputedStyle(st).getPropertyValue("--floor")) / 100]; };
  const placeCover = (x, y) => { const c = coverRef.current, half = c.offsetWidth / 2; c.style.transform = `translate3d(${(x - half).toFixed(1)}px,${(y - half).toFixed(1)}px,0)`; };
  useLayoutEffect(() => {
    const c = coverRef.current;
    if (!c) return undefined;
    const size = Math.max(field.w, field.h) * 2.6, hole = Math.min(field.w * .4, 360) / size * c.width, mid = c.width / 2;
    c.style.width = c.style.height = size + "px";
    const paint = () => {
      const x = c.getContext("2d");
      x.globalCompositeOperation = "source-over"; x.fillStyle = getComputedStyle(stageRef.current).getPropertyValue("--stage"); x.fillRect(0, 0, c.width, c.height);
      const light = x.createRadialGradient(mid, mid, 0, mid, mid, hole);
      light.addColorStop(0, "#000"); light.addColorStop(1, "transparent");
      x.globalCompositeOperation = "destination-out"; x.fillStyle = light; x.fillRect(0, 0, c.width, c.height);
    };
    paint();
    placeCover(...floorAt());
    const theme = new MutationObserver(paint);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => theme.disconnect();
  }, [field]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 포인터가 필드 위의 빛과 YPL 위의 빛을 옮긴다. 포인터가 없거나 떠나면 빛은 몬스터볼과 YPL의 위 가운데로 돌아가 머문다 */
  useEffect(() => {
    if (reduced() || !fine) return undefined;
    const stage = stageRef.current, lamp = lampRef.current, shine = lamp.parentElement;
    const lampRest = () => [shine.clientWidth / 2, -shine.clientHeight * .1];
    let [fx, fy] = floorAt(), [tfx, tfy] = [fx, fy], [lx, ly] = lampRest(), [tlx, tly] = [lx, ly], raf = 0;
    const step = () => {
      fx += (tfx - fx) * .12; fy += (tfy - fy) * .12; lx += (tlx - lx) * .12; ly += (tly - ly) * .12;
      placeCover(fx, fy);
      lamp.style.transform = `translate3d(${lx.toFixed(1)}px,${ly.toFixed(1)}px,0)`;
      raf = Math.abs(tfx - fx) + Math.abs(tfy - fy) + Math.abs(tlx - lx) + Math.abs(tly - ly) > .3 ? requestAnimationFrame(step) : 0;
    };
    const glide = () => { if (!raf) raf = requestAnimationFrame(step); };
    const onMove = e => {
      if (e.pointerType !== "mouse") return;
      const s = stage.getBoundingClientRect(), m = shine.getBoundingClientRect();
      tfx = e.clientX - s.left; tfy = e.clientY - s.top;
      tlx = e.clientX - m.left; tly = Math.max(-m.height * .3, e.clientY - m.top);
      glide();
    };
    const onLeave = () => { [tfx, tfy] = floorAt(); [tlx, tly] = lampRest(); glide(); };
    step();
    addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => { removeEventListener("pointermove", onMove); document.documentElement.removeEventListener("pointerleave", onLeave); cancelAnimationFrame(raf); };
  }, [fine]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = (offset, opacity) => <stop offset={offset} style={{ stopColor: "var(--fg)", stopOpacity: opacity }} />;
  const letters = <path transform="skewX(-12) translate(21 0)" fillRule="evenodd" d={WORDMARK_PATH} fill="url(#ha-body)" />;
  const { rect, line, ring, knob, face, boxT, boxB } = field.paths;

  return (<div className="ha" onClick={e => !e.target.closest("button, a") && wave()}>
    {/* YPL이 서는 자리. 필드의 바닥이 이 자리의 아래 끝에 놓여, YPL과 그 아래 글이 한 무리로 화면 가운데에 선다 */}
    <div className="ha-slot">
    <div className="ha-stage" ref={stageRef}>
      <i className="ha-floor" aria-hidden="true" />
      <Lines g={field} className="ha-lit" d={rect + line + ring + knob + face + boxT + boxB} />
      {fine && <canvas className="ha-cover" ref={coverRef} width="256" height="256" aria-hidden="true" />}
      <Lines g={field} className="ha-rect" d={rect} />
      <Lines g={field} className="ha-line" d={line} />
      <Lines g={field} className="ha-ring" d={ring} />
      <Lines g={field} className="ha-ball" d={knob + face + boxT + boxB} />
      <i className="ha-fade" aria-hidden="true" /><i className="ha-sky" aria-hidden="true" /><i className="ha-beam" aria-hidden="true" /><i className="ha-wave" aria-hidden="true" />
      <h1 className="ha-mark" ref={markRef}><span className="sr-only">Yonsei Pokémon League</span>
        <svg viewBox={VB.join(" ")} aria-hidden="true">
          <defs><linearGradient id="ha-body" x1="0" y1="0" x2="0" y2="1">{stop(0, .95)}{stop(1, .6)}</linearGradient></defs>
          {letters}
        </svg>
        <span className="ha-shine" style={{ WebkitMask: MARK_MASK, mask: MARK_MASK }} aria-hidden="true"><i className="ha-band" ref={bandRef} /><i className="ha-lamp" ref={lampRef} /></span>
        <svg className="ha-refl" viewBox={VB.join(" ")} aria-hidden="true">{letters}</svg>
      </h1>
    </div>
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
        <button type="button" className="ypl-btn ypl-btn--soft press hl" onClick={() => go("about")}>리그 소개</button>
      </div>
    </div>
  </div>);
}
