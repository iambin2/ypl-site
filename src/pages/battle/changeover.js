/* going into a battle from the team preview (DESIGN.md "Battle", Going in; 2026-11-10, the user: "일반 배틀도 도전의 탑처럼 ...
   부드러운 화면 전환을 위한 전환 애니메이션을 추가해줘. 엘리베이터 연출을 그대로 가져오지 말고 새로운 걸 고안해봐"). The board
   changes over, as a scoreboard turns from one picture to the next: the stage's room becomes a row of blank panels joined on the seam,
   switching on from the middle, where the two sides meet, out to the edges, so the preview goes off behind them; the board stands
   blank a beat while the court takes the room; then the panels switch off the same way, middle first, on the court standing dark,
   whose lamps come on after. Only the panels' opacity moves (DESIGN.md: things switch on, they do not fly). Reduced motion: a cut. */
import { DUR, EASE_IN, EASE_OUT, STAGGER, reduced } from "../../components/common/motion.js";

const settled = anim => anim.finished.catch(() => {});
// a panel's turn: the two in the middle first, then each pair outward
const turn = (i, n) => Math.floor(Math.abs(i - (n - 1) / 2));
const sweep = (el, from, to, easing, hold = 0) => {
  const n = el.children.length;
  return Promise.all([...el.children].map((p, i) => settled(p.animate([{ opacity: from }, { opacity: to }],
    { duration: DUR.tone, delay: hold + turn(i, n) * STAGGER.row, easing, fill: "both" }))));
};

// the panels switch on over box (the stage's room); resolves with them once the board stands blank
export async function boardOff(box) {
  if (!box || reduced()) return null;
  const el = document.createElement("div");
  el.className = "bt-change";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = "<i></i>".repeat(matchMedia("(min-width: 860px)").matches ? 8 : 4);
  box.appendChild(el);
  await sweep(el, 0, 1, EASE_OUT);
  return el;
}

// the panels switch off on what now stands under them, after the blank board has been seen a beat, and leave
export async function boardOn(el) {
  if (!el) return;
  await sweep(el, 1, 0, EASE_IN, DUR.tone);
  el.remove();
}
