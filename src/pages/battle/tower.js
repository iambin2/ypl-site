/* 도전의 탑's tower (DESIGN.md "Battle", 도전의 탑, The tower). The ninth pass (2026-11-11, the user: "62점이 100점이 될 수 있도록 모든
   것을 뜯어서 재설계해줘"): the tower is one world under one camera (towerGL.js), seen from the air beside the floor the run stands on,
   the floors climbed going down under it with their doors lit and the ground falling away under them. This file keeps the scene
   round the model: the night behind it (SVG: the sky, its stars, the moon), the climbers' plaques, and the scene's moves, each a
   change of the model's camera or of its doors' light:
     1. between games the tower switches on over the stage;
     2. a game won: its amber room cools to warm, the lamp's light runs along the terrace to the next door, which turns amber;
        after a gatekeeper the gate lights and the camera rises one floor (its last frame the next floor's picture, by construction)
        and the new floor's first door turns amber;
     3. when the game is made and read, the camera goes in through the amber door's arch, the room becoming the lift's doors' tone,
        and the doors stand there shut: only their seam and lamp switch on;
     4. the shut doors outlive the screen, carry themselves to the next screen's stage, a chime, and they part on the team preview.
   Until the doors stand shut the scene is inside the stage it was called on, so it scrolls with its page. Reduced motion: the
   tower stands, then a cut. */
import { DUR, EASE_IN, EASE_OUT, STAGGER, reduced } from "../../components/common/motion.js";
import { sfx } from "./sfx.js";
import { DOORS, H, R, SPAN, buildModel, cameraOf, onFloor, orderOf, paletteOf, render, warmTower } from "./towerGL.js";

// the model's context and program made in the first idle moment after the battle page loads this module
if (typeof window !== "undefined") (window.requestIdleCallback || (f => setTimeout(f, 200)))(() => warmTower(), { timeout: 2000 });

const SHUT = 560, MOVE = 420, BEAT = 260, READ = 420, RISE = 900, DIVE = 620, RUN = 520;
const NEXT = 0.382;
const INOUT = "cubic-bezier(.65,0,.35,1)";
const inout = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const linear = t => t;
const pause = n => new Promise(resolve => setTimeout(resolve, n));
const settled = anim => anim.finished.catch(() => {});
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
let scene = null;           // the tower called on a stage: { el, own, master } (own: made for the call, not the tab's hall)
let car = null;             // the shut doors, fixed over the window: { el }
let left = [];              // the going out of the screen the doors shut on, let go when the next one stands
const letGo = () => { left.forEach(a => a.cancel()); left = []; };
const f1 = n => n.toFixed(1);

/* ---------- the picture ---------- */
let uid = 0;
/* the scene's box: the floor stood on has its foot's radius r0 on screen and its foot at base, its axis at ax; the camera
   (towerGL.js) is set from them. From the second floor up the floor stands just under the middle, so the floors climbed show
   under it; the first has none under it, so it stands low and the floors to climb fill the night. Between the two (the climb
   from the first) the framing goes from one to the other with the camera, and the horizon with it */
function measure(W, H, hall) {
  const phone = W < 520;
  const r0 = Math.min(W * (phone ? .2 : .15), H * .23);
  return { W, H, r0, base1: H * (hall ? .8 : .78), base2: H * (hall ? .6 : .58), ax: W * (phone ? .48 : .46), hall, phone, id: ++uid };
}
// the camera for floor f (a real number while climbing; the mesh's lowest floor lo), or on its way in
const camOf = (m, f, lo, dive = null) => {
  const k = Math.min(1, Math.max(0, f - 1)), base = m.base1 + (m.base2 - m.base1) * k * k * (3 - 2 * k);
  return cameraOf({ ...m, base }, f - lo, dive);
};
const horizonOf = (m, f) => camOf(m, f, f).horizon;
// the floors a mesh holds for a run on floor f: a few under it (the lowest well out of the window) and the ones up into the night
const loOf = f => Math.max(1, f - 4);

/* the night behind the tower: the sky deepening up to the top from the horizon's tone (the ground's fog meets it there, so nothing
   is laid over the one and not the other), and the stars, more the higher the run has climbed */
function skySVG(m, floor) {
  let a = 7;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const many = Math.min(2, 1 + (floor - 1) * .1), hz = Math.max(0, horizonOf(m, floor)), over = m.H * .3;
  const stars = Array.from({ length: Math.round(m.W * hz / 9000 * many) }, () => {
    const s = rnd() < .12 ? 2 : 1;
    return `<rect class="tw-star" x="${f1(rnd() * m.W)}" y="${f1(rnd() * hz * .85)}" width="${s}" height="${s}" opacity="${(.12 + rnd() * .4).toFixed(2)}"/>`;
  }).join("");
  const sky = `tw-sky-${m.id}-${floor}`;
  const body = `<defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient></defs>`
    + `<rect y="${f1(-over)}" width="${m.W}" height="${f1(hz + over + 1)}" fill="url(#${sky})"/>`
    + `<rect class="tw-fog" y="${f1(hz)}" width="${m.W}" height="${f1(m.H - hz + over)}"/>`
    + `<g class="tw-stars">${stars}</g>`;
  return `<svg class="tw-sky" width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" aria-hidden="true">${body}</svg>`;
}
// the crescent moon at the right (the scene's light) or, in the day, the sun, over the night closing on the tower's top
function cloudsHTML(m) {
  const fade = `tw-fade-${m.id}`, mx = m.W * (m.phone ? .84 : .86), my = m.H * .1, mr = Math.max(8, m.W * (m.phone ? .034 : .02));
  const body = `<defs><linearGradient id="${fade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="f0"/><stop offset=".5" class="f1"/><stop offset="1" class="f2"/></linearGradient>`
    + `<mask id="tw-moon-${m.id}"><circle cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr)}" fill="white"/><circle cx="${f1(mx + mr * .42)}" cy="${f1(my - mr * .3)}" r="${f1(mr * .86)}" fill="black"/></mask></defs>`
    + `<rect width="${m.W}" height="${f1(m.H * .22)}" fill="url(#${fade})"/>`
    + `<circle class="tw-moon" cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr)}" mask="url(#tw-moon-${m.id})"/><circle class="tw-sun" cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr * 1.1)}"/>`;
  return `<div class="tw-clouds"><svg width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" aria-hidden="true">${body}</svg></div>`;
}
// a few stars that twinkle (spans, so their light is the compositor's), placed by the same fixed draw each time
function twinkleHTML(m) {
  let a = 29;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  return `<div class="tw-twinkle" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<i style="left:${f1(rnd() * m.W)}px;top:${f1(rnd() * Math.max(0, horizonOf(m, 1)) * .7)}px;animation-delay:${(i * 1.3).toFixed(1)}s"></i>`).join("")}</div>`;
}

/* the other climbers of the month at their floors (on the tab): a small plaque at the right end of the floor they reached, above
   or below the one stood on, a pennant on it (amber for a run being played), the name and the streak. Only the floors in sight;
   plaques that would touch give way */
function climbersHTML(m, st) {
  const lo = loOf(st.floor), cam = camOf(m, st.floor, lo), tags = [];
  const taken = [];
  for (const c of (st.climbers || []).slice().sort((a, b) => b.wins - a.wins)) {
    const f = Math.floor(c.wins / 5) + 1;
    if (f < lo || f > st.floor + 3) continue;
    const [x, y] = cam.project(onFloor(f - lo, 78, .1, 1.04));
    if (y < m.H * .2 || y > m.H - 12 || x > m.W - 40 || taken.some(t => Math.abs(t - y) < 22)) continue;
    taken.push(y);
    tags.push(`<span class="tw-tag${f !== st.floor ? " up" : ""}" style="left:${f1(x + 6)}px;top:${f1(y)}px"><i class="flag${c.live ? " live" : ""}"></i>${escapeHTML(c.name)}<b>${c.wins}</b></span>`);
    if (tags.length >= 4) break;
  }
  return tags.join("");
}
const escapeHTML = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const themeOf = () => document.documentElement.dataset.theme || "";

/* each door's light for a state, by the mesh's floor j and game: 0 dark, .382 the next game while the run rests, 1 won, 2 gone into */
function doorsOf(st, lo) {
  const v = new Float32Array(SPAN * 5);
  for (let j = 0; j < SPAN; j++) {
    const n = lo + j;
    for (let g = 1; g <= 5; g++) {
      v[j * 5 + g - 1] = n < st.floor ? 1 : n > st.floor ? 0
        : st.at > 5 || g < st.at ? 1 : g === st.at ? (st.hold ? 0 : st.live ? 2 : NEXT) : 0;
    }
  }
  return v;
}
const mixc = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
// the lit doors near the floor stood on as lights on the stone: [x, y, z, reach, r, g, b, strength]
function lightsOf(tw, j0) {
  const out = [], { doors, pal } = tw;
  for (const dj of [0, -1, 1]) {
    const j = Math.round(j0) + dj;
    if (j < 0 || j >= SPAN) continue;
    for (let g = 1; g <= 5; g++) {
      const v = doors[j * 5 + g - 1];
      if (v <= .01) continue;
      const col = v <= 1 ? pal.warm : mixc(pal.warm, pal.amber, v - 1);
      out.push([...onFloor(j, DOORS[g - 1], .12, 1.1), (g === 5 ? .55 : .4) * R ** j, ...col, Math.min(1, v) * (v > 1 ? .85 : .5)]);
    }
  }
  return out.slice(0, 11);
}

/* the picture as it stands now: the model's camera at the floor stood on (and how far it has climbed, t), or on its way in */
function paint(el) {
  const tw = el.tower, canvas = el.querySelector("canvas.tw-body");
  if (!tw || !canvas) return;
  // the floors from a few under the one stood on to where the tower has gone into the night, and one more to climb into
  if (!tw.model || tw.st.floor + 6 > tw.model.hi) {
    const lo = tw.model?.lo ?? loOf(tw.st.floor);
    tw.model = buildModel(lo, Math.min(lo + SPAN - 1, tw.st.floor + 7), tw.pal);
    tw.doors = doorsOf(tw.st, lo);
  }
  const j = tw.st.floor - tw.model.lo + tw.t;
  const lights = lightsOf(tw, j);
  if (tw.run) lights.push(tw.run);
  render(canvas, tw.model, camOf(tw.m, tw.st.floor + tw.t, tw.model.lo, tw.dive), tw.pal, { doors: tw.doors, camK: j, lights, lift: tw.lift });
}
/* the scene's moves share one frame loop: each move sets what it changes, then the picture is painted once */
function animate(el, dur, step, ease = inout) {
  const tw = el.tower;
  if (!tw) return Promise.resolve();
  return new Promise(done => {
    tw.anims.add({ t0: null, dur, step, ease, done });
    if (tw.loop) return;
    const frame = now => {
      if (el.tower !== tw) { tw.loop = 0; return; }
      for (const a of [...tw.anims]) {
        a.t0 ??= now;
        const t = Math.min(1, (now - a.t0) / a.dur);
        a.step(a.ease(t));
        if (t >= 1) { tw.anims.delete(a); a.done(); }
      }
      paint(el);
      tw.loop = tw.anims.size ? requestAnimationFrame(frame) : 0;
    };
    tw.loop = requestAnimationFrame(frame);
  });
}
// the doors' light going to a state's, as light does (DUR.tone), never a picture laid over another
function tweenTo(el, st, dur = DUR.tone) {
  const tw = el.tower;
  if (!tw) return Promise.resolve();
  const from = tw.doors.slice(), to = doorsOf(st, tw.model.lo);
  tw.st = { ...tw.st, ...st };
  if (reduced()) { tw.doors = to; paint(el); return Promise.resolve(); }
  return animate(el, dur, e => { for (let i = 0; i < to.length; i++) tw.doors[i] = from[i] + (to[i] - from[i]) * e; }, EASE);
}
const EASE = t => 1 - (1 - t) ** 3;

/* the tower drawn in el (the tab's hall, or the scene laid over a stage). floor: the floor stood on; at: its game (1 to 5, 6 the floor
   won whole, 0 none yet); live: a game is gone into or played (its door amber), else the run rests (its door at .382); hold: the
   game at stands unlit. The tab adds climbers ({ name, wins, live }) */
export function drawTower(el, st) {
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return false;
  el.tower?.anims.forEach(a => a.done());
  const m = measure(W, H, el.classList.contains("tw-hall"));
  el.innerHTML = skySVG(m, st.floor) + twinkleHTML(m)
    + `<div class="tw-cam"><canvas class="tw-body" aria-hidden="true"></canvas>${m.hall ? climbersHTML(m, st) : ""}</div>`
    + cloudsHTML(m);
  el.tower = { m, st: { ...st }, theme: themeOf(), pal: paletteOf(el), model: null, doors: null, t: 0, run: null, dive: null, lift: null, anims: new Set(), loop: 0 };
  paint(el);
  return true;
}
const sameState = (a, b) => a.floor === b.floor && a.at === b.at && a.live === b.live && !a.hold === !b.hold
  && JSON.stringify(a.climbers || []) === JSON.stringify(b.climbers || []);
// the tab's hall draws itself and switches on the first time; a resize, a new state or the other theme draws it again where it stands
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
/* switching on: the night first, then the tower whole, then the climbers' plaques, each rising into its light as anything that
   arrives does */
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
/* a game won: its room cools from amber to warm while the lamp's light runs along the terrace from its door to the next one,
   lighting the stone it passes, and the next door turns amber as the light reaches it */
async function step(el, game) {
  const tw = el.tower, lo = tw.model.lo, j = tw.st.floor - lo, st = { ...tw.st, at: game, live: true };
  const a = DOORS[game - 2], b = DOORS[game - 1], amber = tw.pal.amber;
  sfx("select");
  void tweenTo(el, { ...st, hold: true }, 200);
  const run = animate(el, RUN, e => {
    tw.run = [...onFloor(j, a + (b - a) * inout(e), .08, 1.07), .5 * R ** j, ...amber, Math.sin(Math.PI * Math.min(1, e)) ** .5];
  }, linear);
  await pause(RUN - DUR.tone);
  await tweenTo(el, st);
  await run;
  tw.run = null; paint(el);
  sfx("turn");
}
/* the gatekeeper beaten: the gate lights, the camera rises one floor as the ground and the floors climbed sink under it, and the
   new floor's first door turns amber */
async function rise(el, floor) {
  const tw = el.tower;
  sfx("select");
  await tweenTo(el, { ...tw.st, at: 6, live: true });
  sfx("swoosh", { sec: .7 });
  const tags = [...el.querySelectorAll(".tw-tag")];
  tags.forEach(x => x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.leave, easing: EASE_IN, fill: "forwards" }));
  // the night moves with the horizon where the framing changes (the climb from the first floor)
  const sky = el.querySelector(".tw-sky"), hz0 = horizonOf(tw.m, floor - 1);
  await animate(el, RISE, e => { tw.t = e; if (sky) sky.style.transform = `translateY(${f1(horizonOf(tw.m, floor - 1 + e) - hz0)}px)`; });
  tw.st = { ...tw.st, floor, at: 0 }; tw.t = 0;
  paint(el);
  // the night of the new floor (a few more stars, the sky a little deeper) switches on over the old
  const was = el.querySelector(".tw-sky");
  if (was) {
    was.insertAdjacentHTML("afterend", skySVG(tw.m, floor));
    settled(was.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.light, easing: EASE_OUT, fill: "forwards" })).then(() => was.remove());
  }
  if (tw.m.hall) {
    tags.forEach(x => x.remove());
    el.querySelector(".tw-cam")?.insertAdjacentHTML("beforeend", climbersHTML(tw.m, tw.st));
  }
  sfx("turn");
  await tweenTo(el, { ...tw.st, at: 1, live: true });
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
    // the hall already stands on the game gone into, at the run's rest: its door turns amber where it stands
    const was = el.tower?.st;
    if (was && was.floor === floor && was.at === game) void tweenTo(el, { ...was, live: true });
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

/* 3: the camera goes in through the amber door's arch while the rest of the screen goes out; the room behind becomes the lift's
   doors' own tone, so as the arch passes the stage's edges the doors already stand there, and only their seam and lamp switch on.
   Then the doors leave the page for the window (fixed), to outlive the screen. Resolves with the doors shut */
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
  const tw = el.tower, box = el.getBoundingClientRect();
  if (tw?.model && !reduced()) {
    const g = Math.min(Math.max(tw.st.at, 1), 5), o = orderOf(tw.st.floor), gate = g === 5;
    const dive = { g, t: 0, depth: o.depth * (gate ? 1.7 : 1), yc: (gate ? o.gSpring : .4) * H * .6 };
    const door = (tw.st.floor - tw.model.lo) * 5 + g - 1;
    sfx("swoosh", { sec: .5 });
    // the sky stays (the camera's horizon holds still under it); the stars, the moon and the plaques, which would not turn with it, go
    for (const x of el.querySelectorAll(".tw-stars, .tw-clouds, .tw-twinkle, .tw-tag")) x.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DIVE * .5, easing: EASE_IN, fill: "forwards" });
    await animate(el, DIVE, e => { tw.dive = { ...dive, t: e }; tw.lift = { door, mix: smooth(.74, .96, e), inv: master }; });
  }
  // the doors stand shut where the room's tone already is: fixed over where the stage stands, cut to the window; then the seam and
  // the lamp switch on
  const doors = Object.assign(document.createElement("div"), { className: "lift in" + (master ? " inv" : "") });
  doors.setAttribute("aria-hidden", "true");
  doors.innerHTML = `<span class="lift-door l"></span><span class="lift-door r"></span><i class="lamp sig lift-lamp"></i>`;
  const top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
  Object.assign(doors.style, { left: `${box.left}px`, top: `${top}px`, width: `${box.width}px`, height: `${Math.max(0, bottom - top)}px` });
  (document.querySelector(".ypl") || document.body).appendChild(doors);
  requestAnimationFrame(() => requestAnimationFrame(() => doors.classList.remove("in")));
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
