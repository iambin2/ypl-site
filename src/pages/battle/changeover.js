/* going into a battle from the team preview (DESIGN.md "Battle", Going in; 2026-11-10, the user: "일반 배틀도 도전의 탑처럼 ...
   부드러운 화면 전환을 위한 전환 애니메이션을 추가해줘. 엘리베이터 연출을 그대로 가져오지 말고 새로운 걸 고안해봐"; rebuilt the same
   day, the user: "지금은 그냥 너무 심플해서": it was eight blank panels switching on from the middle and off again). The board
   changes over as two sides meeting: the stage's room is a board of square modules joined on the seam, and
     1. the modules switch on from the left edge and from the right edge at once, each row a step behind the middle one, so two
        arrowheads of light run at each other across the preview; a module comes on lit (the board's own white) and settles to a panel;
     2. they meet in the middle, and where they meet a ring of light runs back out over the whole board, once, as the amber lamp of
        a live battle comes on at its centre;
     3. the board stands while the court takes the room under it (the stage's mount is the one long stop of a battle: the ring is
        drawn by the compositor, so it goes on running over that stop);
     4. the modules switch off from the centre out, the lamp first, on the court standing dark, whose lamps then come on bank by bank.
   Only opacity moves (DESIGN.md: things switch on, they do not fly), and no word stands on the board. Reduced motion: a cut. */
import { DUR, EASE_IN, EASE_OUT, reduced } from "../../components/common/motion.js";

const CELL = 64;          // a module's side, about: the board is cut to whole modules, an even number across so the sides meet on a seam
const CHARGE = 300;       // from the edges to the middle
const RING = 320;         // from the middle back out to the corners
const POP = 60, SETTLE = 260;
const PASS = 200, RINGLIGHT = .618;   // the ring over one module: how long, and how lit (a ring at full light whitened the whole board)
const settled = anim => anim.finished.catch(() => {});

// the modules switch on over box (the stage's room); resolves with the board once it covers the room
export async function boardOff(box) {
  if (!box || reduced()) return null;
  const W = box.clientWidth, H = box.clientHeight;
  if (!W || !H) return null;
  const cols = Math.max(4, Math.round(W / CELL / 2) * 2), rows = Math.max(3, Math.round(H / CELL));
  const el = document.createElement("div");
  el.className = "bt-change";
  el.setAttribute("aria-hidden", "true");
  el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  el.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  el.innerHTML = "<i><b></b></i>".repeat(cols * rows) + `<span class="lamp sig bt-change-lamp"></span>`;
  box.appendChild(el);
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2, far = Math.hypot(cx, cy), last = cols / 2 - 1 + cy / 2;
  const cells = [...el.querySelectorAll("i")];
  el.board = { born: performance.now(), cells, at: cells.map((_, i) => Math.hypot(i % cols - cx, Math.floor(i / cols) - cy) / far) };
  cells.forEach((cell, i) => {
    const c = i % cols, r = Math.floor(i / cols), light = cell.firstChild;
    // 1: how far in from its own edge, the middle row first
    const wait = (Math.min(c, cols - 1 - c) + Math.abs(r - cy) / 2) / last * CHARGE;
    cell.animate([{ opacity: 0 }, { opacity: 1 }], { duration: POP, delay: wait, fill: "both" });
    /* its light settles, and 2: comes on once more as the ring from where they met passes it. One animation for both: two on one
       property are not handed to the compositor, and the ring then stood still through the stage's mount (2026-11-10, recorded) */
    const from = wait + POP, ring = CHARGE + el.board.at[i] * RING - from, all = ring + PASS;
    const frames = ring <= SETTLE
      // by the middle the module's own coming on is the meeting's light
      ? [{ opacity: 1, easing: EASE_OUT }, { opacity: 0 }]
      : [{ opacity: 1, easing: EASE_OUT }, { opacity: 0, offset: SETTLE / all }, { opacity: 0, offset: ring / all }, { opacity: RINGLIGHT, offset: (ring + PASS * .236) / all }, { opacity: 0 }];
    light.animate(frames, { duration: ring <= SETTLE ? SETTLE : all, delay: from, fill: "both" });
  });
  el.lastChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.tone, delay: CHARGE, easing: EASE_OUT, fill: "both" });
  await new Promise(resolve => setTimeout(resolve, CHARGE + POP));
  return el;
}

// the modules switch off on what now stands under them, from the centre out, after the board has been seen a beat, and leave
export async function boardOn(el) {
  if (!el?.board) { el?.remove(); return; }
  const { born, cells, at } = el.board;
  // a beat on what stands under it, and not before the ring has run out over the board
  const hold = Math.max(DUR.tone, born + CHARGE + RING + PASS - performance.now());
  el.lastChild.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.tone, delay: hold - DUR.tone, easing: EASE_IN, fill: "both" });
  await Promise.all(cells.map((cell, i) => settled(cell.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.tone, delay: hold + at[i] * RING, easing: EASE_IN, fill: "both" }))));
  el.remove();
}
