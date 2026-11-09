/* 연승 도전's lift (DESIGN.md "Battle", 연승 도전, The lift; 2026-11-09, the user: "엘리베이터 컨셉으로 가는 게 나을 것 같네",
   "엘리베이터 전환 연출 신경 좀 많이 써줘"). Going into a game of a run is a ride, never a cut:
     1. the doors slide shut over the stage the key was pressed under (from both sides, meeting on a seam), or, from the tab, the
        hall's doors already stand shut;
     2. the floor lights on them: its number in segments on the left door with the amber lamp, its five games as a track on the right
        (the games won lit, this one the lamp's amber); a gatekeeper's game shuts in inverted doors. Climbing to a new floor, the
        number switches from the floor left to the new one as a score does and the track empties to its first game: the car rises;
     3. while the game is made and its pictures read, the shut car stands; when the next screen has mounted, the car carries itself to
        where that screen's stage stands (only when it is somewhere else);
     4. a chime, and the doors part on the team preview, whose cards switch on as the doors open.
   The car is one fixed element over the page, so it outlives the screen it shut on. The hall on the tab draws the same doors from
   the same markup (liftMarkup), so the car taking its place is the same picture. Reduced motion: no slide, the floor stands a moment. */
import { DUR, reduced } from "../../components/common/motion.js";
import { segMarkup } from "../../components/common/seg.js";
import { sfx } from "./sfx.js";

const SHUT = 560, MOVE = 420, BEAT = 260, HOLD = 900;
const INOUT = "cubic-bezier(.65,0,.35,1)", OUT = "cubic-bezier(.22,1,.36,1)";
const pause = n => new Promise(resolve => setTimeout(resolve, n));
let car = null;

/* the two doors. floor: the floor's number; at: this game (1 to 5); live: a game is being played or gone into (the lamp and the track's
   game lit amber) or the run rests (lit at .382); from: the floor being left, climbing (its track all won) */
const trackHTML = (at, live) => `<span class="lift-track">${[1, 2, 3, 4, 5].map(i => `<i class="${i < at ? "won" : i === at ? (live ? "now" : "next") : ""}"></i>`).join("")}</span>`;
export function liftMarkup({ floor, at, live = true, from = null }) {
  const cells = String(floor).length;
  return `<span class="lift-door l"><span class="lift-in"><i class="lamp${live ? " sig" : ""}"></i><span class="lift-digits">${segMarkup(String(from ?? floor), 120, cells)}</span></span></span>`
    + `<span class="lift-door r"><span class="lift-in">${trackHTML(from != null ? 6 : at, live)}</span></span>`;
}

// where a stage stands, cut to the window; toFoot: down to the window's foot (a team preview is still drawing its cards when the car
// arrives, and runs past the foot once drawn), less the page's own bottom space
const boxOf = (el, toFoot = false) => {
  const r = el.getBoundingClientRect(), top = Math.max(0, r.top);
  const foot = parseFloat(getComputedStyle(el.closest(".page") || document.body).paddingBottom) || 0;
  const bottom = toFoot ? innerHeight - foot : Math.min(innerHeight, r.bottom);
  return { left: r.left, top, width: r.width, height: Math.max(0, bottom - top) };
};
const place = (el, b) => Object.assign(el.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
const settled = anim => anim.finished.catch(() => {});
const slide = (door, from, to, duration) => settled(door.animate([{ transform: `translateX(${from * 101}%)` }, { transform: `translateX(${to * 101}%)` }], { duration, easing: INOUT, fill: "forwards" }));

export const liftWaiting = () => Boolean(car);

/* 1 and 2: the doors shut over target (a stage box, or the hall: shut, already shut) and the floor lights on them; resolves once the
   floor has stood long enough to be read */
export async function liftClose(target, { floor, at, master = false, climbing = false, shut = false }) {
  liftDrop(true);
  if (!target) return;
  const el = document.createElement("div");
  el.className = "lift" + (master ? " inv" : "");
  el.setAttribute("aria-hidden", "true");
  place(el, boxOf(target));
  el.innerHTML = liftMarkup({ floor, at, from: climbing ? floor - 1 : null });
  (document.querySelector(".ypl") || document.body).appendChild(el);
  car = { el };
  if (reduced()) { await pause(HOLD); return; }
  const doors = el.querySelectorAll(".lift-door"), ins = [...el.querySelectorAll(".lift-in")];
  if (!shut) {
    ins.forEach(i => { i.style.opacity = "0"; });
    sfx("swoosh", { sec: .5 });
    await Promise.all([slide(doors[0], -1, 0, SHUT), slide(doors[1], 1, 0, SHUT)]);
    await Promise.all(ins.map((i, k) => settled(i.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.leave, delay: k * 62, easing: OUT, fill: "forwards" }))));
  }
  if (climbing && car?.el === el) {
    await pause(560);
    // the car rises: the floor left switches to the new one as a score does, its full track empties to the first game
    el.querySelector(".lift-digits").innerHTML = segMarkup(String(floor), 120, String(floor).length);
    el.querySelector(".lift-track").outerHTML = trackHTML(at, true);
    sfx("select");
    for (const g of el.querySelectorAll(".lift-digits .on > g, .lift-track > i.now")) g.animate([{ opacity: .382 }, { opacity: 1 }], { duration: DUR.tone, easing: OUT });
  }
  await pause(HOLD);
}

/* 3 and 4: the next screen has mounted; the car goes to its stage (target) and opens. Returns the time until the doors start to part,
   so that screen's arrival can wait for it, or null when no car waits */
export function liftArrive(target) {
  if (!car || !target) return null;
  const { el } = car;
  car = null;
  if (reduced()) { el.remove(); return 0; }
  const was = el.getBoundingClientRect(), to = boxOf(target, true);
  const moved = Math.abs(to.left - was.left) + Math.abs(to.top - was.top) + Math.abs(to.width - was.width) + Math.abs(to.height - was.height) > 4;
  (async () => {
    if (moved) {
      await settled(el.animate([
        { left: `${was.left}px`, top: `${was.top}px`, width: `${was.width}px`, height: `${was.height}px` },
        { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` },
      ], { duration: MOVE, easing: INOUT, fill: "forwards" }));
      place(el, to);
    }
    // arrived: the chime, then the doors part
    sfx("turn");
    await pause(BEAT);
    const doors = el.querySelectorAll(".lift-door");
    sfx("swoosh", { sec: .5 });
    await Promise.all([slide(doors[0], 0, -1, SHUT), slide(doors[1], 0, 1, SHUT)]);
    el.remove();
  })();
  return (moved ? MOVE : 0) + BEAT;
}

// a refusal (the game could not be made): the doors open where they shut and the screen stands again
export function liftDrop(now = false) {
  if (!car) return;
  const { el } = car;
  car = null;
  if (now || reduced()) { el.remove(); return; }
  const doors = el.querySelectorAll(".lift-door");
  Promise.all([slide(doors[0], 0, -1, SHUT), slide(doors[1], 0, 1, SHUT)]).then(() => el.remove());
}
