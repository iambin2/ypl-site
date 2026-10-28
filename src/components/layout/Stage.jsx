import React, { useEffect, useRef } from "react";
import { desktop } from "../common/motion.js";

/* L0 무대: 흑연색 바탕 위로 바로 위에서 떨어지는 부드러운 빛 하나(C3). 40초 넘는 주기로 아주 느리게 흐르고(D1),
   페이지가 바뀌면 빛의 자리가 천천히 옮겨 가며, 대회 상태에 따라 밝기가 달라지고, 스크롤에 아주 약하게 따라온다(D2).
   커서와 기기 기울기에는 반응하지 않는다. */

export default function Stage({ view, state = "open" }) {
  const ref = useRef(null);
  useEffect(() => {
    // 기기 해상도의 디더, 255단계 중 한 단계 수준: 빛의 띠 현상만 막고 눈에는 보이지 않는다(C6)
    try {
      const k = Math.min(3, Math.round(devicePixelRatio || 1)), n = 128 * k, c = document.createElement("canvas");
      c.width = c.height = n;
      const x = c.getContext("2d"), d = x.createImageData(n, n);
      for (let i = 0; i < d.data.length; i += 4) { const v = (Math.random() * 255) | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 3; }
      x.putImageData(d, 0, 0);
      ref.current?.style.setProperty("--grain", `url(${c.toDataURL()})`); // 무대에만: <html>에 쓰면 문서 전체가 다시 계산된다
    } catch { /* canvas unavailable: the stage stays plain */ }
  }, []);
  // 빛의 자리는 <html>의 data-light 로 알린다: 무대뿐 아니라 떠 있는 유리도 같은 천장 빛을 받아 반사광이 따라 옮겨 간다.
  // 값은 tokens.css 가 쓰는 조각에만 건다(<html>의 변수를 바꾸면 문서 전체가 다시 계산된다).
  useEffect(() => { document.documentElement.dataset.light = view; }, [view]);
  return (
    <div className="stage" id="ypl-stage" data-state={state} aria-hidden="true" ref={ref}>
      {/* .light-y 가 스크롤을 따른다(tokens.css, 합성 단계의 스크롤 연동 애니메이션) */}
      <div className="light-y"><div className="light light-a" /></div><div className="light light-b" />
    </div>
  );
}

/* G4, J3: 바는 손가락을 따라 숨고 나온다. 내리는 만큼 밀려 나가고 올리는 만큼 돌아오며, 스크롤한 거리보다 더 숨지 않으니
   맨 위에서는 늘 다 보인다. 스크롤이 멈추면 마지막 방향으로 마저 숨거나 나온다. 바꾸는 것은 translate 하나라 합성 단계에서 움직인다.
   콘텐츠가 상단 바 아래로 지나가면 바 아래에 옅은 그림자. 무대의 빛은 스크롤에 아주 약하게 따라온다. */
const TRAVEL = 80; // 바가 다 숨기까지 스크롤하는 거리(px)
const bars = () => [document.querySelector(".topbar"), document.querySelector(".tabbar"), desktop() ? null : document.querySelector(".admin-dock")];
let hidden = 0, resync = false, unglide = 0;
function place(glide) {
  const f = hidden / TRAVEL, pieces = bars().filter(b => b?.offsetHeight);
  // 읽기를 먼저 모두, 쓰기는 그다음: 바마다 레이아웃을 다시 하지 않는다
  const away = pieces.map(b => b.classList.contains("topbar") ? -(b.offsetTop + b.offsetHeight + 8) : innerHeight - b.offsetTop + 8);
  pieces.forEach((b, i) => {
    b.style.transition = glide ? "translate var(--dur-base) var(--ease-out)" : "none";
    b.style.translate = f ? `0 ${(f * away[i]).toFixed(1)}px` : "";
  });
  clearTimeout(unglide);
  unglide = setTimeout(() => pieces.forEach(b => { b.style.transition = ""; }), glide ? 280 : 0);
}
// 이동 뒤 스크롤 복원(뒤로 가기로 목록 중간에 돌아옴)은 손의 스크롤이 아니다: 바는 나와 있고 그 한 번은 세지 않는다
export function showBars() { resync = true; if (hidden) { hidden = 0; place(true); } }
export function useScrollChrome() {
  useEffect(() => {
    // 스크롤 연동 애니메이션이 없는 브라우저만 빛을 손으로 옮긴다
    const follow = !globalThis.CSS?.supports?.("animation-timeline: scroll()");
    let lastY = Math.max(0, scrollY), dir = 0, timer = 0;
    const settle = () => {
      clearTimeout(timer);
      if (hidden <= 0 || hidden >= TRAVEL) return;
      hidden = dir > 0 && lastY >= TRAVEL ? TRAVEL : 0;
      place(true);
    };
    // 스크롤 이벤트는 프레임마다 한 번, 그리기 직전에 온다: 같은 프레임에 바를 옮긴다
    const onScroll = () => {
      const y = Math.max(0, scrollY);
      if (resync) { resync = false; lastY = y; }
      const dy = y - lastY;
      lastY = y;
      if (dy) dir = Math.sign(dy);
      document.querySelector(".topbar")?.classList.toggle("scrolled", y > 8);
      const next = Math.min(Math.max(hidden + dy, 0), TRAVEL, y);
      if (next !== hidden) { hidden = next; place(false); }
      clearTimeout(timer);
      timer = setTimeout(settle, 160);
      // 빛 하나에만 쓴다: 무대에 쓰면 상속을 따라 무대 전체가 매 스크롤 프레임 다시 계산된다
      if (follow) document.querySelector("#ypl-stage .light-a")?.style.setProperty("--ly", -Math.min(y * 0.05, 48) + "px");
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("scrollend", settle);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("scrollend", settle); clearTimeout(timer); };
  }, []);
}
