/* 도전의 탑's tower (DESIGN.md "Battle", 도전의 탑, The tower). The tower is one world under one camera (towerGL.js), seen from the air
   beside the floor the run stands on, the floors climbed going down under it with their doors lit and the ground falling away
   under them. This file keeps the scene round the model: the night behind it (SVG: the sky, its stars, the moon), the climbers'
   marks, and the scene's moves, each a move of the model's camera or a change of its doors' light, never a picture slid or laid over:
     0. coming to the tab: the camera sweeps round the tower and rises to the run's floor while the floors climbed light one by one;
     1. between games the tower comes up over the stage as the camera settles before it;
     2. a game won: its amber room cools to warm, the lamp's light runs along the terrace to the next door, which turns amber;
        after a gatekeeper the gate lights and the camera rises one floor (its last frame the next floor's picture, by construction)
        and the new floor's first door turns amber;
     3. when the game is made and read, the camera comes round to stand before the amber door, then walks in through its arch into
        the room, whose dark becomes the stage's own ground;
     4. that dark outlives the screen, goes to the next screen's stage, and the next screen comes up out of it.
   Until the camera is in, the scene is inside the stage it was called on, so it scrolls with its page. Reduced motion: the tower
   stands, then a cut (2026-11-11, the user: the going in was "너무 빨라서 뭐가 뭔지도 모르겠어", its doors parting "이전의 엘리베이터
   연출을 그대로 가져온 것 같고", and coming to the tab "그냥 로딩되는 느낌") */
import { DUR, EASE_IN, EASE_OUT, reduced } from "../../components/common/motion.js";
import { sfx } from "./sfx.js";
import { DOORS, H, R, SPAN, buildModel, cameraOf, onFloor, orderOf, paletteOf, render, warmTower } from "./towerGL.js";

// the model's context and program made in the first idle moment after the battle page loads this module
if (typeof window !== "undefined") (window.requestIdleCallback || (f => setTimeout(f, 200)))(() => warmTower(), { timeout: 2000 });

const MOVE = 420, BEAT = 260, READ = 420, RISE = 1100, DIVE = 1400, RUN = 640, ENTRANCE = 2200, ARRIVE = 1000;
const NEXT = 0.382;
const INOUT = "cubic-bezier(.65,0,.35,1)";
const inout = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const out3 = t => 1 - (1 - t) ** 3;
const linear = t => t;
const pause = n => new Promise(resolve => setTimeout(resolve, n));
const settled = anim => anim.finished.catch(() => {});
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fade = (x, from, to, duration, o = {}) => settled(x.animate([{ opacity: from }, { opacity: to }], { duration, easing: EASE_OUT, fill: "both", ...o }));
let scene = null;           // the tower called on a stage: { el, own } (own: made for the call, not the tab's hall)
let car = null;             // the dark the camera walked into, fixed over the window: { el }
let left = [];              // the going out of the screen the camera walked out of, let go when the next one stands
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
  return { W, H, r0, base1: H * (hall ? .8 : .78), base2: H * (hall ? .6 : .58), ax: W * (phone ? .44 : .44), hall, phone, id: ++uid };
}
// the camera for floor f (a real number while climbing; the mesh's lowest floor lo), on its way in, or swung round the tower
const camOf = (m, f, lo, dive = null, orbit = null) => {
  const k = Math.min(1, Math.max(0, f - 1)), base = m.base1 + (m.base2 - m.base1) * k * k * (3 - 2 * k);
  return cameraOf({ ...m, base }, f - lo, dive, orbit);
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

/* the other climbers of the month, marked where they stand: a hairline from the wall of the floor each reached out into the night to
   the right, and there in one column their name and streak, as a drawing is labelled, a run being played with the amber lamp by its
   name (2026-11-11, the user: the plaques that hung there had "미감이 없어"; then of a square where the line met the wall, "네모점은
   없애자. 그냥 선으로만 하는 게 깔끔할 것 같아"). Only the floors in sight; labels keep apart in
   the column, their lines bending to them. Their floor's own are lit, the others dim */
function climbersHTML(m, st) {
  const lo = loOf(st.floor), cam = camOf(m, st.floor, lo);
  const col = Math.min(m.W - (m.phone ? 104 : 150), m.ax + m.r0 * 1.7);
  const marks = [];
  for (const c of (st.climbers || []).slice().sort((a, b) => b.wins - a.wins)) {
    const f = Math.floor(c.wins / 5) + 1;
    if (f < lo || f > st.floor + 3) continue;
    const [x, y] = cam.project(onFloor(f - lo, 64, .46, 1.0));
    if (y < m.H * .16 || y > m.H - 16 || x > col - 16) continue;
    marks.push({ c, f, x, y });
    if (marks.length >= 4) break;
  }
  if (!marks.length) return "";
  marks.sort((a, b) => a.y - b.y);
  let last = -Infinity;
  for (const k of marks) { k.ly = Math.max(k.y, last + 28); last = k.ly; }
  const lines = marks.map(k => `<path class="${k.f === st.floor ? "on" : ""}" d="M${f1(k.x)} ${f1(k.y)}H${f1(k.x + 14)}L${f1(col - 14)} ${f1(k.ly)}H${f1(col - 4)}"/>`).join("");
  const labels = marks.map(k => `<span class="tw-tag${k.f === st.floor ? " on" : ""}" style="left:${f1(col)}px;top:${f1(k.ly)}px">`
    + `<b>${k.c.live ? `<i class="lamp sig" aria-hidden="true"></i>` : ""}${escapeHTML(k.c.name)}</b><span>${k.c.wins}<small>연승</small></span></span>`).join("");
  return `<svg class="tw-leads" width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" aria-hidden="true">${lines}</svg>${labels}`;
}
const escapeHTML = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const themeOf = () => document.documentElement.dataset.theme || "";
const marksOf = el => [...el.querySelectorAll(".tw-tag, .tw-leads")];

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

/* the picture as it stands now: the model's camera at the floor stood on (and how far it has climbed, t), swung round the tower
   (orbit), or on its way in (dive) */
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
  render(canvas, tw.model, camOf(tw.m, tw.st.floor + tw.t, tw.model.lo, tw.dive, tw.orbit), tw.pal, { doors: tw.doors, camK: j, lights, lift: tw.lift });
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
// every move under way taken to its end at once (a game gone into while the tab's entrance still plays)
function finish(el) {
  const tw = el.tower;
  if (!tw?.anims.size) return;
  for (const a of [...tw.anims]) { a.step(a.ease(1)); tw.anims.delete(a); a.done(); }
  paint(el);
}
// the doors' light going to a state's, as light does (DUR.tone), never a picture laid over another
function tweenTo(el, st, dur = DUR.tone) {
  const tw = el.tower;
  if (!tw) return Promise.resolve();
  const from = tw.doors.slice(), to = doorsOf(st, tw.model.lo);
  tw.st = { ...tw.st, ...st };
  if (reduced()) { tw.doors = to; paint(el); return Promise.resolve(); }
  return animate(el, dur, e => { for (let i = 0; i < to.length; i++) tw.doors[i] = from[i] + (to[i] - from[i]) * e; }, out3);
}

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
  el.tower = { m, st: { ...st }, theme: themeOf(), pal: paletteOf(el), model: null, doors: null, t: 0, run: null, dive: null, orbit: null, lift: null, anims: new Set(), loop: 0 };
  paint(el);
  return true;
}
const sameState = (a, b) => a.floor === b.floor && a.at === b.at && a.live === b.live && !a.hold === !b.hold
  && JSON.stringify(a.climbers || []) === JSON.stringify(b.climbers || []);
// the tab's hall draws itself and comes in with its entrance the first time; a resize, a new state or the other theme draws it again
// where it stands
export function standTower(el, st) {
  const was = el.tower;
  if (was && was.m.W === el.clientWidth && was.m.H === el.clientHeight && was.theme === themeOf() && sameState(was.st, st)) return;
  if (drawTower(el, st) && !was) void entrance(el);
}
// the theme turned: every tower standing is painted again in the other one's tones
if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
  new MutationObserver(() => document.querySelectorAll(".tw").forEach(el => el.tower && drawTower(el, el.tower.st)))
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}

/* ---------- the scene ---------- */
/* 0. coming to the tab: the night switches on, and the camera sweeps a third of the way round the tower and draws in as it rises
   the last floors to the run's (on the first floor it sweeps and draws in alone), while the floors climbed light one by one as it
   passes them, each from its outer doors to its gate, and the run's own door lights last; then the climbers' marks */
async function entrance(el) {
  const tw = el.tower;
  if (!tw || reduced()) return;
  const lo = tw.model.lo, f = tw.st.floor, from = Math.max(1, f - 2), rise = f - from, target = tw.doors.slice();
  const order = [0, 1, 2, 3, 4];               // the games' order is the doors' order from the outside in
  const sky = el.querySelector(".tw-sky"), hz = horizonOf(tw.m, f), marks = marksOf(el);
  marks.forEach(x => { x.style.opacity = "0"; });
  for (const x of el.querySelectorAll(".tw-sky, .tw-clouds, .tw-twinkle")) void fade(x, 0, 1, DUR.light * 1.5);
  void fade(el.querySelector(".tw-body"), 0, 1, DUR.light);
  tw.doors.fill(0);
  await animate(el, ENTRANCE, e => {
    const q = out3(e);
    tw.orbit = { phi: -.62 * (1 - q), k: 1 + .7 * (1 - q) * (1 - q) };
    tw.t = -rise * (1 - q);
    if (sky && rise) sky.style.transform = `translateY(${f1(horizonOf(tw.m, f + tw.t) - hz)}px)`;
    for (let j = 0; j < SPAN; j++) {
      const n = lo + j;
      for (const g of order) {
        const i = j * 5 + g, v = target[i];
        if (!v) continue;
        // a floor lights as the camera comes up past it; the run's own door (amber, or the next at .382) last of all
        const at = v > 1 || (n === f && v < 1) ? .78 : .12 + .5 * Math.max(0, (n - from + .5) / (rise + 1)) + g * .035;
        tw.doors[i] = v * smooth(at, at + .16, e);
      }
    }
  }, linear);
  tw.orbit = null; tw.t = 0;
  if (sky) sky.style.transform = "";
  paint(el);
  if (el.tower === tw) marks.forEach((x, i) => { x.style.opacity = ""; void fade(x, 0, 1, DUR.light, { delay: i * 60 }); });
}
/* 1. between games: the tower comes up over the stage as the camera settles before it, drawing in from a little round the tower */
function arrive(el) {
  for (const x of el.querySelectorAll(".tw-sky, .tw-clouds, .tw-twinkle")) void fade(x, 0, 1, DUR.light);
  void fade(el.querySelector(".tw-body"), 0, 1, DUR.light * .8);
  const tw = el.tower;
  return animate(el, ARRIVE, e => { tw.orbit = e >= 1 ? null : { phi: -.22 * (1 - e), k: 1 + .32 * (1 - e) }; }, out3);
}
/* 2. a game won: its room cools from amber to warm while the lamp's light runs along the terrace from its door to the next one,
   lighting the stone it passes, and the next door turns amber as the light reaches it */
async function step(el, game) {
  const tw = el.tower, lo = tw.model.lo, j = tw.st.floor - lo, st = { ...tw.st, at: game, live: true };
  const a = DOORS[game - 2], b = DOORS[game - 1], amber = tw.pal.amber;
  sfx("select");
  void tweenTo(el, { ...st, hold: true }, 240);
  const run = animate(el, RUN, e => {
    tw.run = [...onFloor(j, a + (b - a) * inout(e), .08, 1.07), .5 * R ** j, ...amber, Math.sin(Math.PI * Math.min(1, e)) ** .5];
  }, linear);
  await pause(RUN - DUR.tone);
  await tweenTo(el, st, DUR.tone * 1.5);
  await run;
  tw.run = null; paint(el);
  sfx("turn");
}
/* the gatekeeper beaten: the gate lights and swings open, the camera rises one floor as the ground and the floors climbed sink
   under it, and the new floor's first door turns amber */
async function rise(el, floor) {
  const tw = el.tower;
  sfx("select");
  await tweenTo(el, { ...tw.st, at: 6, live: true }, DUR.light);
  sfx("swoosh", { sec: .9 });
  const marks = marksOf(el);
  marks.forEach(x => void fade(x, 1, 0, DUR.leave, { easing: EASE_IN }));
  // the night moves with the horizon where the framing changes (the climb from the first floor)
  const sky = el.querySelector(".tw-sky"), hz0 = horizonOf(tw.m, floor - 1);
  await animate(el, RISE, e => { tw.t = e; if (sky) sky.style.transform = `translateY(${f1(horizonOf(tw.m, floor - 1 + e) - hz0)}px)`; });
  tw.st = { ...tw.st, floor, at: 0 }; tw.t = 0;
  paint(el);
  // the night of the new floor (a few more stars, the sky a little deeper) switches on over the old
  const was = el.querySelector(".tw-sky");
  if (was) {
    was.insertAdjacentHTML("afterend", skySVG(tw.m, floor));
    void fade(was, 1, 0, DUR.light).then(() => was.remove());
  }
  if (tw.m.hall) {
    marks.forEach(x => x.remove());
    el.querySelector(".tw-cam")?.insertAdjacentHTML("beforeend", climbersHTML(tw.m, tw.st));
    marksOf(el).forEach(x => void fade(x, 0, 1, DUR.light));
  }
  sfx("turn");
  await tweenTo(el, { ...tw.st, at: 1, live: true }, DUR.tone * 1.5);
}

/* 1 and 2: the tower is shown on target for the game gone into (floor, at). hall: the tab's hall, where it already stands; otherwise
   it comes up over the stage. climbing: the floor's first game after a gatekeeper. again: a lost game gone into again (the three
   lamps), where no lamp was won and the amber lamp stands where it stood. Resolves once it has been read */
export async function towerShow(target, { floor, at: game, climbing = false, again = false }) {
  towerDrop(true);
  if (!target) return;
  const hall = target.classList.contains("tw-hall");
  const el = hall ? target : Object.assign(document.createElement("div"), { className: "tw over" });
  if (!hall) { el.setAttribute("aria-hidden", "true"); target.appendChild(el); }
  scene = { el, own: !hall };
  const keep = hall ? { climbers: el.tower?.st.climbers } : {};
  const now = { ...keep, floor, at: game, live: true };
  // the picture before the step the scene plays: the game just won still the lamp's, or the floor left with its gate still to light
  const before = hall || again ? now : climbing ? { floor: floor - 1, at: 5, live: true } : game > 1 ? { floor, at: game - 1, live: true } : now;
  if (reduced()) { drawTower(el, now); await pause(READ * 2); return; }
  if (hall) {
    // the hall already stands on the game gone into, at the run's rest (its entrance, if it still plays, taken to its end): its door
    // turns amber where it stands
    finish(el);
    const was = el.tower?.st;
    if (was && was.floor === floor && was.at === game) void tweenTo(el, { ...was, live: true }, DUR.light);
    else drawTower(el, now);
    sfx("turn");
  } else {
    drawTower(el, before);
    await arrive(el);
  }
  const mine = () => scene?.el === el;
  if (mine() && before.floor !== floor) await rise(el, floor);
  else if (mine() && before.at !== game) await step(el, game);
  if (mine()) await pause(READ);
}

/* 3. going in, as the camera walks it (DIVE, in two beats: it comes round the tower to stand before the amber door, level with it,
   then walks in through the arch), while the rest of the screen goes out; the room's dark becomes the stage's own ground as the
   arch passes the stage's edges, and that ground is left fixed over the window, to outlive the screen. Resolves with it standing */
export async function towerDive() {
  if (!scene) return;
  const { el, own } = scene;
  scene = null;
  if (!reduced()) {
    // everything of the page that does not hold the scene
    const main = document.getElementById("ypl-main"), rest = [];
    for (let x = el; x && x !== main && x.parentElement; x = x.parentElement) rest.push(...[...x.parentElement.children].filter(y => y !== x && !y.classList.contains("tw")));
    left = rest.map(x => x.animate([{ opacity: getComputedStyle(x).opacity }, { opacity: 0 }], { duration: DUR.light, delay: DIVE * .5, easing: EASE_IN, fill: "both" }));
  }
  const tw = el.tower, box = el.getBoundingClientRect();
  if (tw?.model && !reduced()) {
    finish(el);
    const g = Math.min(Math.max(tw.st.at, 1), 5), o = orderOf(tw.st.floor), gate = g === 5;
    const dive = { g, t: 0, depth: o.depth * (gate ? 1.8 : 1), yc: (gate ? o.gSpring : .4) * H * .62 };
    const door = (tw.st.floor - tw.model.lo) * 5 + g - 1;
    sfx("swoosh", { sec: .6 });
    // the night's stars and moon and the marks, which would not turn with the camera, go as it turns; the sky stays (its horizon holds)
    for (const x of el.querySelectorAll(".tw-stars, .tw-clouds, .tw-twinkle, .tw-tag, .tw-leads")) void fade(x, 1, 0, DIVE * .4, { easing: EASE_IN });
    let stepped = false;
    await animate(el, DIVE, e => {
      tw.dive = { ...dive, t: e };
      // inside, the room's lamp goes out at once (a slow blend from the amber to the ground went brown), leaving the dark
      tw.lift = { door, mix: smooth(.88, .97, e) };
      if (!stepped && e > .5) { stepped = true; sfx("swoosh", { sec: .5 }); }
    }, linear);
  }
  // the dark stands where the stage stood, fixed over the window and cut to it
  const dark = Object.assign(document.createElement("div"), { className: "tw-veil" });
  dark.setAttribute("aria-hidden", "true");
  const top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
  Object.assign(dark.style, { left: `${box.left}px`, top: `${top}px`, width: `${box.width}px`, height: `${Math.max(0, bottom - top)}px` });
  (document.querySelector(".ypl") || document.body).appendChild(dark);
  if (own) el.remove();
  car = { el: dark };
}

// where a stage stands, cut to the window; a team preview is still drawing its cards when the dark arrives and runs past the foot
// once drawn, so its box goes down to the window's foot, less the page's own bottom space
const boxOf = el => {
  const r = el.getBoundingClientRect(), top = Math.max(0, r.top);
  const foot = parseFloat(getComputedStyle(el.closest(".page") || document.body).paddingBottom) || 0;
  return { left: r.left, top, width: r.width, height: Math.max(0, innerHeight - foot - top) };
};
// the next screen comes up out of the dark, as the battle's own stage does
const lift = el => fade(el, 1, 0, DUR.light * 1.5).then(() => el.remove());

/* 4. the next screen has mounted; the dark goes to its stage (target) and the screen comes up out of it. Returns the time until it
   starts to lift, so that screen's arrival can wait for it, or null when no dark waits */
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
    } else await pause(BEAT);
    sfx("turn");
    await lift(el);
  })();
  return moved ? MOVE : BEAT;
}

// a refusal (the game could not be made): the scene goes, or the dark lifts where it stands, and the screen stands again
export function towerDrop(now = false) {
  const s = scene, c = car;
  scene = null; car = null;
  letGo();
  if (s?.own) {
    if (now || reduced()) s.el.remove();
    else void fade(s.el, 1, 0, DUR.leave).then(() => s.el.remove());
  }
  if (s && !s.own && s.el.tower) drawTower(s.el, { ...s.el.tower.st, live: false });
  if (c) { if (now || reduced()) c.el.remove(); else void lift(c.el); }
}
