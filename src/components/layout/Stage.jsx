import { useEffect } from "react";
import { desktop, reduced, springTo } from "../common/motion.js";

/* L0 무대: 흑연색 바탕 위로 바로 위에서 떨어지는 부드러운 빛 하나(C3). 페이지 자체(<html>)의 바탕으로 그린다(tokens.css):
   따로 떠 있는 층이 없어 페이지가 한 장으로 스크롤된다. 빛은 대회 상태에 따라 밝기만 달라진다(data-stage). */
export function useStage(state = "open") {
  useEffect(() => {
    // 기기 해상도의 디더, 255단계 중 한 단계 수준: 빛의 띠 현상만 막고 눈에는 보이지 않는다(C6). --grain 은 상속하지 않는다.
    try {
      const k = Math.min(3, Math.round(devicePixelRatio || 1)), n = 128 * k, c = document.createElement("canvas");
      c.width = c.height = n;
      const x = c.getContext("2d"), d = x.createImageData(n, n);
      for (let i = 0; i < d.data.length; i += 4) { const v = (Math.random() * 255) | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 3; }
      x.putImageData(d, 0, 0);
      document.documentElement.style.setProperty("--grain", `url(${c.toDataURL()})`);
    } catch { /* canvas unavailable: the stage stays plain */ }
  }, []);
  useEffect(() => { document.documentElement.dataset.stage = state; }, [state]);
}

/* G4, J3: 바는 손가락에 붙어 있다. 내리는 만큼 밀려 나가고 올리는 만큼 돌아오며(1:1, 늦음 없이), 스크롤한 거리보다 더 숨지
   않으니 맨 위에서는 늘 다 보인다. 스크롤이 멈추면 그때의 속도를 이어받은 스프링으로 마지막 방향까지 마저 가고, 살짝 넘었다
   돌아와 선다. 스크롤을 따라가는 동안은 transform 만 바꾸고 CSS 전환은 걸지 않는다(전환이 끼면 바가 손가락을 뒤쫓았다).
   스프링은 Web Animations 로 합성 단계에서 돌고, 도중에 다시 스크롤하면 보이는 그 자리에서 이어받는다.
   콘텐츠가 상단 바 아래로 지나가면 바 아래에 옅은 그림자. */
const TRAVEL = 80;               // 바가 다 숨기까지 스크롤하는 거리(px)
const SPRING = [0.4, 0.68];      // 반응 시간(s)과 감쇠: 5% 남짓 넘었다 돌아온다
const bars = () => [document.querySelector(".topbar"), document.querySelector(".tabbar"), desktop() ? null : document.querySelector(".admin-dock")];
let hidden = 0, resync = false, run = null;
// 바마다 다 숨었을 때의 거리. 읽기만 하고(고정 요소의 offsetTop 은 transform 과 무관), 쓰기는 따로 한다
const pieces = () => bars().filter(b => b?.offsetHeight).map(b => [b, b.classList.contains("topbar") ? -(b.offsetTop + b.offsetHeight + 8) : innerHeight - b.offsetTop + 8]);
const at = (h, away) => `translateY(${(h / TRAVEL * away).toFixed(2)}px)`;
const apply = (h, list = pieces()) => list.forEach(([b, away]) => { b.style.transform = h ? at(h, away) : ""; });
/* 돌던 스프링을 지금 보이는 자리에서 멈춘다 */
function stop() {
  if (!run) return;
  const { anims, values, duration } = run, t = Math.min(duration, anims[0].currentTime ?? 0);
  hidden = values[Math.round(t / duration * (values.length - 1))];
  apply(hidden);
  anims.forEach(a => a.cancel());
  run = null;
}
/* 속도 v0(px/s)를 이어받아 to 까지 스프링으로 간다 */
function glide(to, v0 = 0) {
  stop();
  if (hidden === to) return;
  const list = pieces(), from = hidden;
  hidden = to;
  if (reduced()) { apply(to, list); return; }
  // the inline place stays at the start until the spring has run: a new animation takes effect only from the next frame,
  // and an inline end written now showed the bar at its end for that one frame
  const { values, duration } = springTo(from, to, v0, ...SPRING);
  const anims = list.map(([b, away]) => b.animate(values.map(h => ({ transform: at(h, away) })), { duration, easing: "linear", fill: "forwards" }));
  run = { anims, values, duration };
  anims[0].onfinish = () => { if (run?.anims !== anims) return; apply(to, list); anims.forEach(a => a.cancel()); run = null; };
}
// 이동 뒤 스크롤 복원(뒤로 가기로 목록 중간에 돌아옴)은 손의 스크롤이 아니다: 바는 나와 있고 그 한 번은 세지 않는다
export function showBars() { resync = true; if (hidden || run) glide(0); }
export function useScrollChrome() {
  useEffect(() => {
    let lastY = Math.max(0, scrollY), lastT = performance.now(), v = 0, dir = 0, timer = 0;
    const settle = () => {
      clearTimeout(timer);
      if (run || hidden <= 0 || hidden >= TRAVEL) return;
      const speed = performance.now() - lastT < 80 ? Math.max(-1500, Math.min(1500, v)) : 0;
      glide(dir > 0 && lastY >= TRAVEL ? TRAVEL : 0, speed);
    };
    // 스크롤 이벤트는 프레임마다 한 번, 그리기 직전에 온다: 같은 프레임에 바를 옮긴다
    const onScroll = () => {
      const y = Math.max(0, scrollY), now = performance.now();
      if (resync) { resync = false; lastY = y; }
      const dy = y - lastY;
      if (dy) { dir = Math.sign(dy); v = v * .4 + dy / Math.max(8, now - lastT) * 1000 * .6; }
      lastY = y; lastT = now;
      document.querySelector(".topbar")?.classList.toggle("scrolled", y > 8);
      if (!dy) return;
      stop();
      const next = Math.min(Math.max(hidden + dy, 0), TRAVEL, y);
      if (next !== hidden) { hidden = next; apply(hidden); }
      clearTimeout(timer);
      timer = setTimeout(settle, 120);
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("scrollend", settle);
    return () => { removeEventListener("scroll", onScroll); removeEventListener("scrollend", settle); clearTimeout(timer); };
  }, []);
}
