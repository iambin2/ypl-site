/* 도전의 탑's tower (DESIGN.md "Battle", 도전의 탑, The tower; 2026-11-10, the user: "엘리베이터 컨셉 자체는 좋아. 하지만 너무
   단순해. 전광판 숫자만 반복되는 느낌 ... 엘리베이터 컨셉과 탑이라는 정체성도 잘 매치가 안 되고", "포켓몬 배틀이 무한하게 이어지는
   탑"). The run is shown as the tower itself, seen from its foot: the floor stood on is the widest, at the bottom, and every floor over
   it is the same floor a step smaller (R), so the tower runs up out of the window and would close far over it. A floor is the lift's
   cell with the floor's number, four doors and the gatekeeper's gate, wider, at the row's end: a door won is lit, the door of the game
   gone into carries the amber lamp, so the lit run grows from the lift to the gate. The floor under the one stood on shows its top
   edge at the window's foot, lit: what was climbed.
   Going into a game is a scene on this picture, never a cut:
     1. between games the tower switches on over the stage, foot first;
     2. the game just won lights and the lamp steps to the next door; after a gatekeeper the lift rises: the whole tower comes down a
        floor (one similarity about the point it closes on) and the new floor's cell lights;
     3. when the game is made and read, the view goes in through the lamp's door until it fills the stage: two doors shut on a seam;
     4. the shut doors outlive the screen, carry themselves to the next screen's stage, a chime, and they part on the team preview.
   Until the doors stand shut the scene is inside the stage it was called on, so it scrolls with its page (the lift's car was fixed
   over the window from the first frame, and a scroll moved the page under it: "스크롤을 하면 그 애니메이션도 층 위에서 움직이는 게
   노골적으로 보이는"). Reduced motion: the tower stands, then a cut. */
import { DUR, EASE_IN, EASE_OUT, STAGGER, reduced } from "../../components/common/motion.js";
import { segMarkup, segWidth } from "../../components/common/seg.js";
import { sfx } from "./sfx.js";

const R = 0.854;            // a floor to the one under it: three floors are one phi step
const GATE = 1.618;         // the gate to a door
const SHUT = 560, MOVE = 420, BEAT = 260, READ = 420, RISE = 680, DIVE = 620;
const INOUT = "cubic-bezier(.65,0,.35,1)";
const pause = n => new Promise(resolve => setTimeout(resolve, n));
const settled = anim => anim.finished.catch(() => {});
let scene = null;           // the tower called on a stage: { el, own } (own: made for the call, not the tab's hall)
let car = null;             // the shut doors, fixed over the window: { el }
let left = [];              // the going out of the screen the doors shut on, let go when the next one stands
const letGo = () => { left.forEach(a => a.cancel()); left = []; };

/* ---------- the picture ---------- */
// the tower in a box: the floor stood on is h0 high and w0 wide with its foot at base; slot k is that floor scaled R^k about apex
function measure(W, H) {
  const gap = 2, foot = W < 480 ? 12 : 20;
  const w0 = Math.round(W * (W < 480 ? .9 : .786));
  const unit = (w0 - 5 * gap) / (5 + GATE);
  const h0 = Math.round(Math.min(H * .236, unit * GATE));
  const base = H - foot;
  return { W, H, gap, w0, h0, unit, base, ax: W / 2, ay: base - (h0 + gap) / (1 - R) };
}
const slot = (m, k) => { const s = R ** k; return { s, x: m.ax - m.w0 * s / 2, y: m.ay + (m.base - m.ay) * s - m.h0 * s }; };
// a floor's light by its place: the one stood on and the one under it whole, each floor over it a step dimmer
const lightOf = k => (k <= 0 ? 1 : R ** k);
const SEG_H = [120, 84, 64, 52, 44, 32, 24, 20, 16];
const digits = (m, f) => {
  const n = String(f).length, h = SEG_H.find(x => x <= m.h0 - 16 && segWidth(x, n) <= m.unit - 8) || 16;
  return segMarkup(String(f), h, n);
};
// a door's state on floor f: at is the game gone into (1 to 5; 6 when the floor is won whole)
const doorOf = (f, i, { floor, at, live }) => (f < floor || (f === floor && i < at) ? " won" : f === floor && i === at ? (live ? " now" : " next") : "");
function floorHTML(m, k, st) {
  const f = st.floor + k, { s, x, y } = slot(m, k);
  const style = `width:${m.w0}px;height:${m.h0}px;transform:translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${s.toFixed(4)});opacity:${lightOf(k).toFixed(3)}`;
  // under the first floor is the ground the tower stands on
  if (f < 1) return `<div class="tw-floor ground" data-k="${k}" style="${style}"></div>`;
  return `<div class="tw-floor${f < st.floor ? " done" : f === st.floor ? " here" : ""}" data-k="${k}" style="${style}">`
    + `<span class="tw-car">${digits(m, f)}</span>`
    + [1, 2, 3, 4, 5].map(i => `<i class="tw-door${i === 5 ? " gate" : ""}${doorOf(f, i, st)}" data-door="${i}"></i>`).join("") + `</div>`;
}
/* the tower drawn in el (the tab's hall, or the scene laid over a stage). floor: the floor stood on; at: its game (1 to 5, 6 the floor
   won whole); live: a game is gone into or played (the lamp amber) or the run rests (its housing) */
export function drawTower(el, st) {
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return false;
  const m = measure(W, H);
  // floors up to where the tower leaves the window, and one more for the lift's rise to bring in
  const ks = [-1];
  for (let k = 0; k < 24; k += 1) { ks.push(k); if (m.ay + (m.base - m.ay) * R ** k < -m.h0 || R ** k < .06) break; }
  el.innerHTML = `<div class="tw-stack">${ks.map(k => floorHTML(m, k, st)).join("")}</div>`;
  el.tower = { m, st: { ...st } };
  return true;
}
// the tab's hall draws itself and lights foot first the first time; a resize draws it again where it stands
export function standTower(el, st) {
  const was = el.tower;
  if (was && was.m.W === el.clientWidth && was.m.H === el.clientHeight && was.st.floor === st.floor && was.st.at === st.at && was.st.live === st.live) return;
  if (drawTower(el, st) && !was) lightUp(el);
}
function lightUp(el, hold = 0) {
  if (reduced()) return Promise.resolve();
  return Promise.all([...el.querySelectorAll(".tw-floor")].map((f, i) => settled(f.animate([{ opacity: 0 }, { opacity: f.style.opacity }],
    { duration: DUR.light, delay: hold + i * STAGGER.row, easing: EASE_OUT, fill: "backwards" }))));
}
const once = (el, from = .382) => el?.animate?.([{ opacity: from }, { opacity: 1 }], { duration: DUR.tone, easing: EASE_OUT });

/* ---------- the scene ---------- */
// the game just won lights and the lamp steps to the next door
async function step(el, at) {
  const st = { ...el.tower.st, at, live: true };
  await pause(BEAT);
  drawTower(el, st);
  sfx("select");
  once(el.querySelector(`.here > [data-door="${at - 1}"]`));
  once(el.querySelector(`.here > [data-door="${at}"]`), 0);
  await pause(DUR.tone);
}
// the lift rises a floor: the gate lights, the floor won whole; then the tower comes down a floor and the new one's cell lights
async function rise(el, floor) {
  const { m, st } = el.tower;
  await pause(BEAT);
  drawTower(el, { ...st, at: 6 });
  sfx("select");
  once(el.querySelector(`.here > [data-door="5"]`));
  await pause(BEAT + DUR.tone);
  const stack = el.querySelector(".tw-stack");
  stack.style.transformOrigin = `${m.ax}px ${m.ay}px`;
  sfx("swoosh", { sec: .6 });
  const floors = [...stack.children];
  floors.forEach(f => f.animate([{ opacity: f.style.opacity }, { opacity: lightOf(+f.dataset.k - 1) }], { duration: RISE, easing: INOUT, fill: "forwards" }));
  await settled(stack.animate([{ transform: "scale(1)" }, { transform: `scale(${(1 / R).toFixed(4)})` }], { duration: RISE, easing: INOUT, fill: "forwards" }));
  drawTower(el, { floor, at: 1, live: true });
  sfx("turn");
  once(el.querySelector(".here > .tw-car"));
  once(el.querySelector(`.here > [data-door="1"]`), 0);
  await pause(DUR.tone);
}

/* 1 and 2: the tower is shown on target for the game gone into (floor, at). hall: the tab's hall, where it already stands; otherwise
   it switches on over the stage. climbing: the floor's first game after a gatekeeper. Resolves once it has been read */
export async function towerShow(target, { floor, at, master = false, climbing = false }) {
  towerDrop(true);
  if (!target) return;
  const hall = target.classList.contains("tw-hall");
  const el = hall ? target : Object.assign(document.createElement("div"), { className: "tw over" });
  if (!hall) { el.setAttribute("aria-hidden", "true"); target.appendChild(el); }
  scene = { el, own: !hall, master };
  // the picture before the step the scene plays: the game just won still the lamp's, or the floor left with its gate still to light
  const now = { floor, at, live: true };
  const before = hall ? now : climbing ? { floor: floor - 1, at: 5, live: true } : at > 1 ? { floor, at: at - 1, live: true } : now;
  if (reduced()) { drawTower(el, now); await pause(READ * 2); return; }
  if (hall) {
    // the hall already stands on the game gone into, at the run's rest: only the lamp's housing turns amber
    drawTower(el, now);
    once(el.querySelector(`.here > [data-door="${at}"]`), 0);
  } else {
    drawTower(el, before);
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.tone, easing: EASE_OUT });
    // the foot is lit first; the floors over it go on lighting while the step is played
    void lightUp(el, DUR.tone);
    await pause(DUR.tone + DUR.light);
  }
  const mine = () => scene?.el === el;
  if (mine() && before.floor !== floor) await rise(el, floor);
  else if (mine() && before.at !== at) await step(el, at);
  if (mine()) await pause(READ);
}

/* 3: the view goes in through the lamp's door until the door is the stage, shut on its seam, while the rest of the screen goes out
   (so the screen is left by the time the doors stand, and nothing waits on a second fade); then the doors leave the page for the
   window (fixed), to outlive the screen. Resolves with the doors shut */
export async function towerDive() {
  if (!scene) return;
  const { el, own, master } = scene;
  scene = null;
  if (!reduced()) {
    // everything of the page that does not hold the scene
    const main = document.getElementById("ypl-main"), rest = [];
    for (let at = el; at && at !== main && at.parentElement; at = at.parentElement) rest.push(...[...at.parentElement.children].filter(x => x !== at && !x.classList.contains("tw")));
    left = rest.map(x => x.animate([{ opacity: getComputedStyle(x).opacity }, { opacity: 0 }], { duration: DUR.leave, delay: DIVE - DUR.leave, easing: EASE_IN, fill: "both" }));
  }
  const { m, st } = el.tower || {};
  const box = el.getBoundingClientRect();
  const doors = Object.assign(document.createElement("div"), { className: "lift in" + (master ? " inv" : "") });
  doors.setAttribute("aria-hidden", "true");
  doors.innerHTML = `<span class="lift-door l"></span><span class="lift-door r"></span><i class="lamp sig lift-lamp"></i>`;
  el.appendChild(doors);
  if (m && !reduced()) {
    const at = Math.min(st.at, 5), w = m.unit * (at === 5 ? GATE : 1);
    const x = m.ax - m.w0 / 2 + at * (m.unit + m.gap), y = m.base - m.h0, F = Math.max(m.W / w, m.H / m.h0);
    const stack = el.querySelector(".tw-stack");
    stack.getAnimations().forEach(a => a.cancel());
    stack.style.transformOrigin = `${x + w / 2}px ${y + m.h0 / 2}px`;
    sfx("swoosh", { sec: .5 });
    stack.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { opacity: 0, offset: .786 },
      { transform: `translate(${m.W / 2 - x - w / 2}px,${m.H / 2 - y - m.h0 / 2}px) scale(${F.toFixed(3)})`, opacity: 0 }], { duration: DIVE, easing: INOUT, fill: "forwards" });
    await settled(doors.animate([{ transform: `translate(${x}px,${y}px) scale(${(w / m.W).toFixed(4)},${(m.h0 / m.H).toFixed(4)})` }, { transform: "none" }],
      { duration: DIVE, easing: INOUT, fill: "backwards" }));
  }
  // the doors stand shut: from here they are the window's (fixed over where the stage stands, cut to the window)
  const top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
  doors.classList.remove("in");
  Object.assign(doors.style, { left: `${box.left}px`, top: `${top}px`, width: `${box.width}px`, height: `${Math.max(0, bottom - top)}px` });
  (document.querySelector(".ypl") || document.body).appendChild(doors);
  if (own) el.remove();
  car = { el: doors };
}

// where a stage stands, cut to the window; a team preview is still drawing its cards when the doors arrive and runs past the foot
// once drawn, so its box goes down to the window's foot, less the page's own bottom space
const boxOf = el => {
  const r = el.getBoundingClientRect(), top = Math.max(0, r.top);
  const foot = parseFloat(getComputedStyle(el.closest(".page") || document.body).paddingBottom) || 0;
  return { left: r.left, top, width: r.width, height: Math.max(0, innerHeight - foot - top) };
};
const slide = (door, from, to) => settled(door.animate([{ transform: `translateX(${from * 101}%)` }, { transform: `translateX(${to * 101}%)` }], { duration: SHUT, easing: INOUT, fill: "forwards" }));
const part = async el => {
  const lamp = el.querySelector(".lift-lamp");
  if (lamp) lamp.style.opacity = "0";
  sfx("swoosh", { sec: .5 });
  const doors = el.querySelectorAll(".lift-door");
  await Promise.all([slide(doors[0], 0, -1), slide(doors[1], 0, 1)]);
  el.remove();
};

/* 4: the next screen has mounted; the doors go to its stage (target) and part. Returns the time until they start to part, so that
   screen's arrival can wait for it, or null when no doors wait */
export function liftArrive(target) {
  letGo();
  if (!car || !target) return null;
  const { el } = car;
  car = null;
  if (reduced()) { el.remove(); return 0; }
  const was = el.getBoundingClientRect(), to = boxOf(target);
  const moved = Math.abs(to.left - was.left) + Math.abs(to.top - was.top) + Math.abs(to.width - was.width) + Math.abs(to.height - was.height) > 4;
  const px = b => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
  (async () => {
    if (moved) {
      await settled(el.animate([px(was), px(to)], { duration: MOVE, easing: INOUT, fill: "forwards" }));
      Object.assign(el.style, px(to));
    }
    // arrived: the chime, and the doors part (carrying themselves was the beat; standing where they shut they wait one)
    sfx("turn");
    if (!moved) await pause(BEAT);
    await part(el);
  })();
  return moved ? MOVE : BEAT;
}

// a refusal (the game could not be made): the scene goes, or the doors part where they shut, and the screen stands again
export function towerDrop(now = false) {
  const s = scene, c = car;
  scene = null; car = null;
  letGo();
  if (s?.own) {
    if (now || reduced()) s.el.remove();
    else settled(s.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.leave, fill: "forwards" })).then(() => s.el.remove());
  }
  if (c) { if (now || reduced()) c.el.remove(); else void part(c.el); }
}
