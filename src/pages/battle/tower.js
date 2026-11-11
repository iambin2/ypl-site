/* 도전의 탑's tower (DESIGN.md "Battle", 도전의 탑, The tower). Redrawn 2026-11-11 (the user: "지금 너무 단순한 네모의 연속이라 하나도
   안 예뻐. 일반 배틀 초기화면처럼 네모를 고집하지 않아도 홈페이지 컬러 톤 앤 매너만 맞추면 돼. 틀에 박히지 말고 자유롭게 상상해.
   진입 애니메이션도 새로 짜고"; before it the tower was rows of flat cells, one floor a step smaller than the one under it).

   The picture is a round tower at night seen from its foot. Since 2026-11-11 (the eighth pass, the user: the SVG tower read as
   "파워포인트 기본 도형을 마구 덧붙여서 만든 미완성품 같아") the tower itself is a 3D model (towerGL.js) painted on a canvas: upright
   drums set back floor by floor, arched doors with real depth, the gatekeeper's wide gate in the middle, no type colour. This file
   keeps the scene round it: the night behind (SVG: sky, moon, stars, hills or the sea of cloud), the climbers' plaques at their
   floors, and the scene's moves. Nothing stands before the tower (the user: the party in front "오히려 좀 조잡해 보이는데").
   Going into a game is a scene on this picture, never a cut:
     1. between games the tower switches on over the stage, foot first;
     2. the game just won lights and a spark of the lamp runs along the path to the next lamp, which turns amber; after a gatekeeper
        the gate lights, the spark goes in through it, the tower comes down a floor (the model scaled about the point it closes on,
        frame by frame: the lift's rise) and the spark comes round onto the new floor's first lamp;
     3. when the game is made and read, the view goes in through the amber lamp until it fills the stage: two doors shut on a seam;
     4. the shut doors outlive the screen, carry themselves to the next screen's stage, a chime, and they part on the team preview.
   Until the doors stand shut the scene is inside the stage it was called on, so it scrolls with its page. Only light moves on the
   picture, but for the climb; the dive is a transform of the picture already drawn. Reduced motion: the tower stands, then a cut. */
import { DUR, EASE_IN, EASE_OUT, STAGGER, reduced } from "../../components/common/motion.js";
import { sfx } from "./sfx.js";
import { DOORS, buildModel, cameraOf, doorOutline, onFloor, paletteOf, render } from "./towerGL.js";

const SHUT = 560, MOVE = 420, BEAT = 260, READ = 420, RISE = 680, DIVE = 620, RUN = 520;
const INOUT = "cubic-bezier(.65,0,.35,1)";
const inout = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const pause = n => new Promise(resolve => setTimeout(resolve, n));
const settled = anim => anim.finished.catch(() => {});
let scene = null;           // the tower called on a stage: { el, own, master } (own: made for the call, not the tab's hall)
let car = null;             // the shut doors, fixed over the window: { el }
let left = [];              // the going out of the screen the doors shut on, let go when the next one stands
const letGo = () => { left.forEach(a => a.cancel()); left = []; };
const f1 = n => n.toFixed(1);
const pts = list => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");

/* ---------- the picture ---------- */
let uid = 0;
/* the tower in a box: the floor stood on has its foot's radius r0 on screen and its foot at base; the camera (towerGL.js) is set from
   them. On the tab the tower stands lower in its box, the scene's subject alone, a little left of the middle with the moon balancing
   it at the right */
function measure(W, H, hall) {
  const phone = W < 520;
  const r0 = Math.min(W * (phone ? .3 : .22), H * .33);
  const m = { W, H, r0, base: H * (hall ? .82 : .76), ax: W * (phone ? .47 : .45), hall, phone, id: ++uid };
  m.cam = cameraOf(m);
  m.horizon = m.cam.horizon;
  return m;
}
const NODE_U = DOORS.map(th => (th + 90) / 180);
// the run's path on floor k at u (0 the left edge, 1 the right edge): along the terrace in front of the doors
const pathAt = (m, k, u) => m.cam.project(onFloor(k, -90 + 180 * u, .012, 1.14));
// a door's box on screen (foot centre, width, height) for the scene's moves
function doorShape(m, k, game) {
  const p = doorOutline(game).map(([th, y]) => m.cam.project(onFloor(k, th, y)));
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]), [x, y] = m.cam.project(onFloor(k, DOORS[game - 1], 0));
  return { x, y, w: Math.max(...xs) - Math.min(...xs), h: y - Math.min(...ys) };
}

/* the night behind the tower: the sky (deeper the higher the run has climbed), stars (more the higher), and the horizon: on the
   first floor low hills behind the plaza, higher up a sea of cloud far below that rises with every floor. The ground and the terrace
   are the model's */
// the crescent moon at the right (the scene's light) or, in the day, the sun: drawn over the night laid on the tower's top
function moonSVG(m) {
  const mx = m.W * (m.phone ? .84 : .86), my = m.H * .12, mr = Math.max(8, m.W * (m.phone ? .034 : .02));
  return `<mask id="tw-moon-${m.id}"><circle cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr)}" fill="white"/><circle cx="${f1(mx + mr * .42)}" cy="${f1(my - mr * .3)}" r="${f1(mr * .86)}" fill="black"/></mask>`
    + `<circle class="tw-moon" cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr)}" mask="url(#tw-moon-${m.id})"/><circle class="tw-sun" cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr * 1.1)}"/>`;
}
function night(m, floor) {
  let a = 7;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const many = Math.min(2, 1 + (floor - 1) * .1);
  const stars = Array.from({ length: Math.round(m.W * m.H / 9000 * many) }, () => {
    const s = rnd() < .12 ? 2 : 1;
    return `<rect class="tw-star" x="${f1(rnd() * m.W)}" y="${f1(rnd() * m.horizon * .8)}" width="${s}" height="${s}" opacity="${(.12 + rnd() * .4).toFixed(2)}"/>`;
  }).join("");
  const out = [`<rect class="tw-skyfill" width="${m.W}" height="${f1(m.horizon + 1)}"/>`,
    `<rect class="tw-alt" width="${m.W}" height="${f1(m.horizon + 1)}" opacity="${Math.min(.42, (floor - 1) * .05).toFixed(3)}"/>`,
    `<g class="tw-stars">${stars}</g>`];
  const wave = (amp, base, f1a, f2a, ph) => Array.from({ length: 41 }, (_, i) => {
    const x = m.W * i / 40;
    return [x, base - amp * (.55 + .3 * Math.sin(x / m.W * f1a + ph) + .15 * Math.sin(x / m.W * f2a + ph * 2))];
  });
  if (floor === 1) {
    out.push(`<polygon class="tw-hills" points="${pts([[0, m.horizon + 1], ...wave(m.H * .04, m.horizon + 1, 5.5, 17, 1.3), [m.W, m.horizon + 1]])}"/>`);
    out.push(`<rect class="tw-plaza" y="${f1(m.horizon)}" width="${m.W}" height="${f1(m.H - m.horizon)}"/>`);
  } else {
    // the sea of cloud far under the terrace: higher with every floor climbed
    const amp = Math.min(m.H * .06, m.H * .012 * floor);
    out.push(`<polygon class="tw-sea" points="${pts([[0, m.horizon + 1], ...wave(amp, m.horizon + 1, 9, 23, .4), [m.W, m.horizon + 1]])}"/>`);
    out.push(`<rect class="tw-sea" y="${f1(m.horizon)}" width="${m.W}" height="${f1(m.H - m.horizon)}"/>`);
  }
  return out.join("");
}

/* where the tower goes: its upper floors dissolve into the night (the model fades them by their light; the sky's colour laid over the
   top deepens it), the moon over it */
function cloudsHTML(m) {
  const fade = `tw-fade-${m.id}`;
  const body = `<defs><linearGradient id="${fade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="f0"/><stop offset=".5" class="f1"/><stop offset="1" class="f2"/></linearGradient></defs>`
    + `<rect width="${m.W}" height="${f1(m.H * .32)}" fill="url(#${fade})"/>` + moonSVG(m);
  return `<div class="tw-clouds"><svg width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" aria-hidden="true">${body}</svg></div>`;
}
// a few stars that twinkle (spans, so their light is the compositor's), placed by the same fixed draw each time
function twinkleHTML(m) {
  let a = 29;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  return `<div class="tw-twinkle" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<i style="left:${f1(rnd() * m.W)}px;top:${f1(rnd() * m.horizon * .7)}px;animation-delay:${(i * 1.3).toFixed(1)}s"></i>`).join("")}</div>`;
}

// the floors modelled: the one stood on and up to where the tower leaves the window, and one more for the climb
function floorsOf(m) {
  const ks = [];
  for (let k = 0; k < 30; k++) { ks.push(k); if (m.cam.project(onFloor(k, 0, 0))[1] < -m.H * .1) break; }
  ks.push(ks.length);
  return ks;
}

/* the other climbers of the month at their floors (on the tab): a small plaque at the right end of the floor they reached, a pennant on
   it (amber for a run being played), the name and the streak. Only the floors in sight and clear of the night over the top; plaques
   that would touch give way */
function climbersHTML(m, st) {
  const tags = [];
  let last = Infinity;
  for (const c of (st.climbers || []).slice().sort((a, b) => b.wins - a.wins)) {
    const f = Math.floor(c.wins / 5) + 1, k = f - st.floor;
    if (k < 0 || f < 1) continue;
    const [x, y] = m.cam.project(onFloor(k, 80, .06, 1.08));
    if (y < m.H * .22 || y > m.base || Math.abs(last - y) < 22) continue;
    last = y;
    tags.push(`<span class="tw-tag${k > 0 ? " up" : ""}" style="left:${f1(x + 6)}px;top:${f1(y)}px"><i class="flag${c.live ? " live" : ""}"></i>${escapeHTML(c.name)}<b>${c.wins}</b></span>`);
    if (tags.length >= 4) break;
  }
  return tags.join("");
}
const escapeHTML = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

const themeOf = () => document.documentElement.dataset.theme || "";
// the model for a state, painted on the scene's canvas (t: how far the tower has climbed toward the next floor)
function paint(el, st, t = 0) {
  const tw = el.tower, canvas = el.querySelector("canvas.tw-body");
  if (!tw || !canvas) return;
  tw.pal ||= paletteOf(el);
  if (!tw.model || tw.model.st !== st) tw.model = { st, mesh: buildModel(st, floorsOf(tw.m), tw.pal) };
  render(canvas, tw.model.mesh, tw.m.cam, tw.pal, t);
  tw.st = { ...st };
}
/* the tower drawn in el (the tab's hall, or the scene laid over a stage). floor: the floor stood on; at: its game (1 to 5, 6 the floor
   won whole); live: a game is gone into or played (its door amber) or the run rests (its threshold lit); hold: the game at stands
   still unlit (the moment between a lamp won and the next one turning amber). The tab adds climbers ({ name, wins, live }) */
export function drawTower(el, st) {
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return false;
  const m = measure(W, H, el.classList.contains("tw-hall"));
  const svg = (cls, body) => `<svg class="${cls}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
  el.innerHTML = svg("tw-sky", night(m, st.floor)) + twinkleHTML(m)
    + `<div class="tw-cam"><canvas class="tw-body" aria-hidden="true"></canvas>${m.hall ? climbersHTML(m, st) : ""}</div>`
    + cloudsHTML(m);
  el.tower = { m, st: { ...st }, theme: themeOf() };
  paint(el, st);
  return true;
}
// a lamp switching on or off on the drawn tower: the picture as it was laid over the new one and let go
function relight(el, st) {
  const canvas = el.querySelector("canvas.tw-body");
  if (!canvas || reduced()) { paint(el, st); return; }
  const was = canvas.cloneNode();
  was.getContext("2d").drawImage(canvas, 0, 0);
  canvas.after(was);
  paint(el, st);
  settled(was.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.tone, easing: EASE_OUT, fill: "forwards" })).then(() => was.remove());
}
const sameState = (a, b) => a.floor === b.floor && a.at === b.at && a.live === b.live && !a.hold === !b.hold
  && JSON.stringify(a.climbers || []) === JSON.stringify(b.climbers || []);
// the tab's hall draws itself and lights foot first the first time; a resize, a new state or the other theme draws it again where it stands
export function standTower(el, st) {
  const was = el.tower;
  if (was && was.m.W === el.clientWidth && was.m.H === el.clientHeight && was.theme === themeOf() && sameState(was.st, st)) return;
  if (drawTower(el, st) && !was) lightUp(el);
}
// the theme turned: every tower standing is painted again in the other one's tones
if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
  new MutationObserver(() => document.querySelectorAll(".tw").forEach(el => el.tower && drawTower(el, el.tower.st)))
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
/* switching on: the night first, then the tower, then the climbers' plaques, each rising into its light as anything that arrives does */
function lightUp(el, hold = 0) {
  if (reduced()) return Promise.resolve();
  const all = [
    ...[...el.querySelectorAll(".tw-sky, .tw-clouds")].map(x => settled(x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.light, delay: hold, easing: EASE_OUT, fill: "backwards" }))),
    ...[...el.querySelectorAll(".tw-body")].map(x => settled(x.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: DUR.light, delay: hold + STAGGER.display, easing: EASE_OUT, fill: "backwards" }))),
    ...[...el.querySelectorAll(".tw-tag")].map((x, i) => settled(x.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: DUR.light, delay: hold + STAGGER.display * 3 + i * STAGGER.row, easing: EASE_OUT, fill: "backwards" }))),
  ];
  return Promise.all(all);
}

/* ---------- the scene ---------- */
/* the spark: the lamp's light running along the path of the floor stood on from u0 to u1 (a transform of an 8 square, keyframes along
   the path, so it is the compositor's) */
function spark(el, u0, u1, { fadeIn = false, fadeOut = false } = {}) {
  const { m } = el.tower;
  const cam = el.querySelector(".tw-cam");
  const dot = Object.assign(document.createElement("i"), { className: "lamp sig tw-spark" });
  cam.appendChild(dot);
  const n = 16, frames = Array.from({ length: n + 1 }, (_, i) => {
    const [x, y] = pathAt(m, 0, u0 + (u1 - u0) * i / n);
    return { transform: `translate(${f1(x - 3)}px,${f1(y - 3)}px)`, opacity: (fadeIn && i === 0) || (fadeOut && i === n) ? 0 : 1 };
  });
  return settled(dot.animate(frames, { duration: RUN, easing: INOUT, fill: "forwards" })).then(() => dot.remove());
}
// the game just won lights and the spark runs to the next lamp, which turns amber
async function step(el, game) {
  const st = { ...el.tower.st, at: game, live: true };
  await pause(BEAT);
  relight(el, { ...st, hold: true });
  sfx("select");
  await spark(el, NODE_U[game - 2], NODE_U[game - 1]);
  relight(el, st);
  sfx("turn");
  await pause(DUR.tone);
}
/* the lift rises a floor: the gate lights, the spark goes in through it, the tower comes down a floor (the model scaled about the point
   it closes on, so the floor climbed sinks to the foot and the next one stands where it stood), and the spark comes round onto the
   new floor's first lamp */
async function rise(el, floor) {
  const { m, st } = el.tower;
  await pause(BEAT);
  const won = { ...st, at: 6 };
  relight(el, won);
  sfx("select");
  // the light goes in through the gate: the tower is climbed inside
  await spark(el, NODE_U[4], NODE_U[4] + .001, { fadeOut: true });
  sfx("swoosh", { sec: .6 });
  const sky = el.querySelector(".tw-sky");
  // the night is far: it moves a little with the rise, so the tower is seen to climb past it
  sky?.animate([{ transform: "none" }, { transform: `translateY(${f1(m.H * .04)}px)` }], { duration: RISE, easing: INOUT });
  const shown = el.tower.model.st;
  await new Promise(done => {
    const t0 = performance.now();
    const frame = now => {
      if (el.tower?.model?.st !== shown) return done();
      const t = Math.min(1, (now - t0) / RISE);
      paint(el, shown, inout(t));
      if (t < 1) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });
  relight(el, { ...st, floor, at: 0, live: true });
  await spark(el, 0, NODE_U[0], { fadeIn: true });
  relight(el, { ...st, floor, at: 1, live: true });
  sfx("turn");
  await pause(DUR.tone);
}

/* 1 and 2: the tower is shown on target for the game gone into (floor, at). hall: the tab's hall, where it already stands; otherwise
   it switches on over the stage. climbing: the floor's first game after a gatekeeper. again: a lost game gone into again (the three
   lamps), where no lamp was won and the amber lamp stands where it stood. Resolves once it has been read */
export async function towerShow(target, { floor, at: game, master = false, climbing = false, again = false }) {
  towerDrop(true);
  if (!target) return;
  const hall = target.classList.contains("tw-hall");
  const el = hall ? target : Object.assign(document.createElement("div"), { className: "tw over" });
  if (!hall) { el.setAttribute("aria-hidden", "true"); target.appendChild(el); }
  scene = { el, own: !hall, master };
  const keep = hall ? { climbers: el.tower?.st.climbers } : {};
  const now = { ...keep, floor, at: game, live: true };
  // the picture before the step the scene plays: the game just won still the lamp's, or the floor left with its gate still to light
  const before = hall || again ? now : climbing ? { floor: floor - 1, at: 5, live: true } : game > 1 ? { floor, at: game - 1, live: true } : now;
  if (reduced()) { drawTower(el, now); await pause(READ * 2); return; }
  if (hall) {
    // the hall already stands on the game gone into, at the run's rest: its lamp turns amber where it stands (no redraw, so the hall's
    // own switching on goes on under it)
    const was = el.tower?.st;
    if (was && was.floor === floor && was.at === game) relight(el, { ...was, live: true });
    else drawTower(el, now);
    sfx("turn");
  } else {
    drawTower(el, before);
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.tone, easing: EASE_OUT });
    void lightUp(el, DUR.tone);
    await pause(DUR.tone + DUR.light);
  }
  const mine = () => scene?.el === el;
  if (mine() && before.floor !== floor) await rise(el, floor);
  else if (mine() && before.at !== game) await step(el, game);
  if (mine()) await pause(READ);
}

/* 3: the view goes in through the amber lamp until it fills the stage as two doors shut on a seam, while the rest of the screen goes
   out (so the screen is left by the time the doors stand, and nothing waits on a second fade); then the doors leave the page for the
   window (fixed), to outlive the screen. Resolves with the doors shut */
export async function towerDive() {
  if (!scene) return;
  const { el, own, master } = scene;
  scene = null;
  if (!reduced()) {
    // everything of the page that does not hold the scene
    const main = document.getElementById("ypl-main"), rest = [];
    for (let x = el; x && x !== main && x.parentElement; x = x.parentElement) rest.push(...[...x.parentElement.children].filter(y => y !== x && !y.classList.contains("tw")));
    left = rest.map(x => x.animate([{ opacity: getComputedStyle(x).opacity }, { opacity: 0 }], { duration: DUR.leave, delay: DIVE - DUR.leave, easing: EASE_IN, fill: "both" }));
  }
  const { m, st } = el.tower || {};
  const box = el.getBoundingClientRect();
  const doors = Object.assign(document.createElement("div"), { className: "lift in" + (master ? " inv" : "") });
  doors.setAttribute("aria-hidden", "true");
  doors.innerHTML = `<span class="lift-door l"></span><span class="lift-door r"></span><i class="lamp sig lift-lamp"></i>`;
  el.appendChild(doors);
  if (m && !reduced()) {
    // the lamp gone into, and a door's shape about it (a floor's height, golden), from which the doors open out to the stage
    // the window gone into, from which the doors open out to the stage
    const win = doorShape(m, 0, Math.min(Math.max(st.at, 1), 5)), x = win.x, y = win.y - win.h / 2;
    const h = Math.max(win.h, 24), w = Math.max(win.w, h / 1.618), F = Math.max(m.W / w, m.H / h) * 1.2;
    const cam = el.querySelector(".tw-cam");
    cam.getAnimations().forEach(a => a.cancel());
    cam.style.transformOrigin = `${f1(x)}px ${f1(y)}px`;
    sfx("swoosh", { sec: .5 });
    cam.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { opacity: 0, offset: .786 },
      { transform: `translate(${f1(m.W / 2 - x)}px,${f1(m.H / 2 - y)}px) scale(${F.toFixed(3)})`, opacity: 0 }], { duration: DIVE, easing: INOUT, fill: "forwards" });
    for (const x2 of el.querySelectorAll(".tw-sky, .tw-clouds, .tw-twinkle")) x2.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DIVE * .618, easing: EASE_IN, fill: "forwards" });
    await settled(doors.animate([{ transform: `translate(${f1(x - w / 2)}px,${f1(y - h / 2)}px) scale(${(w / m.W).toFixed(4)},${(h / m.H).toFixed(4)})` }, { transform: "none" }],
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
  const lampEl = el.querySelector(".lift-lamp");
  if (lampEl) lampEl.style.opacity = "0";
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
  if (s && !s.own && s.el.tower) drawTower(s.el, { ...s.el.tower.st, live: false });
  if (c) { if (now || reduced()) c.el.remove(); else void part(c.el); }
}
