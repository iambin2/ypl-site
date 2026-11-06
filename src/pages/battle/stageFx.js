/* 배틀 무대의 연출 (DESIGN.md "Battle", The stage). 기술, 피격, 등장, 쓰러짐, 메가진화, 능력 변화, 상태 이상을 GPU 무대(gl.js)에 그린다.
   한 번의 기술은 게임처럼 네 박자다: 모으고(쓴 쪽의 빛), 놓고(카메라가 대상 쪽으로), 날아가고(궤적과 파편), 맞는다(섬광, 충격파,
   타입의 파편, 히트 스톱, 카메라의 반동). 맞은 쪽의 결과 줄은 맞는 순간에 함께 뜬다.
   말(턴, 승자, 특성, 이름)은 무대 밖의 판(.bs-over)이고 보드의 판(battle.css)이다.
   speed: 1 보통, .5 빠르게, 0 건너뛰기(연출 없이 상태만). */
import { reduced } from "../../components/common/motion.js";
import { makeDraw, recipeOf, playScript } from "./moveFx.js";
import { glOf, rand, lerp, clamp, typeId, colorOf, TYPE_COLOR } from "./gl.js";
import { setField } from "./arena.js";
import "./arena.js";

let speed = 1;
export const setSpeed = s => { speed = s; };
export const instant = () => speed === 0;
let slowed = 1;
const ms = n => Math.max(1, n * (speed || 0));
export const wait = n => (instant() ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms(n) * slowed)));
export const hold = (since, n) => (instant() ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, Math.max(0, ms(n) - (performance.now() - since)))));
const OUT = "cubic-bezier(.22,1,.36,1)";
const IN = "cubic-bezier(.5,0,.75,0)";

/* ---------- the engine of a stage, at the playback speed ---------- */
const E = stage => { const e = glOf(stage); if (e) e.rate = speed ? 1 / speed : 1; return e; };
export function slowMo(stage, duration = 700) {
  const e = E(stage);
  if (!e || instant() || reduced()) return;
  slowed = 2; e.slow(duration * speed, .45);
  setTimeout(() => { slowed = 1; }, duration * speed);
}
// the stage's DOM changed (a Pokémon came, went or changed form): the engine reads it again
export function sync(stage) { glOf(stage)?.sync(); }
export function field(stage, f) { const e = glOf(stage); if (e) setField(e, f); }

/* ---------- where things stand ---------- */
const actorOf = (stage, key) => glOf(stage)?.actors.get(key);
const slotEl = (stage, key) => stage?.querySelector(`[data-mon="${key}"]`);
const overOf = stage => stage?.querySelector(".bs-over");
// a Pokémon's body (its ink in its picture, as it stands now): lift 0 is its feet, 1 the top of its head
function centre(stage, key, lift = .45) {
  const e = glOf(stage), a = e?.actors.get(key), p = a && e.placed(a);
  if (p) { const [x0, y0, x1, y1] = a.ink || [0, 0, 1, 1]; return [p.x + p.w * (a.own ? 1 - (x0 + x1) / 2 : (x0 + x1) / 2), p.y + p.h * lerp(y1, y0, lift)]; }
  const el = slotEl(stage, key), box = stage?.getBoundingClientRect();
  if (!el || !box) return [(stage?.clientWidth || 400) / 2, (stage?.clientHeight || 300) / 2];
  const r = el.getBoundingClientRect();
  return [r.left - box.left + r.width / 2, r.top - box.top + r.height * (1 - lift)];
}
export const spot = centre;
function sizeOf(stage, key) {
  const e = glOf(stage), a = e?.actors.get(key), p = a && e.placed(a);
  if (p) { const [x0, y0, x1, y1] = a.ink || [0, 0, 1, 1]; return Math.max(46, (p.w * (x1 - x0) + p.h * (y1 - y0)) / 2); }
  return slotEl(stage, key)?.getBoundingClientRect().width * .7 || 80;
}
const unitOf = stage => Math.min(1.6, Math.max(.85, (stage?.clientWidth || 430) / 430));
const ownKey = (stage, key) => Boolean(actorOf(stage, key)?.own ?? slotEl(stage, key)?.closest(".bs-side")?.classList.contains("own"));
const times = (n, make) => Array.from({ length: Math.max(0, Math.round(n)) }, (_, i) => make(i));
const around = (n, i, j = .3) => (i / n) * Math.PI * 2 + rand(-j, j);

/* ---------------------------------------------------------------- pieces ---------------------------------------------------------------- */
// a soft light that blooms and goes
function glow(e, at, size, type = "normal", { dur = 360, alpha = .5, ramp = null, delay = 0, layer = 1, s0 = .25 } = {}) {
  e.emit({ at, tex: "glow", ramp: ramp || `${typeId(type)}.h`, size: [size * s0, size], life: dur, alpha, delay, layer, grow: true });
}
// a ring of light opening (flat: lying on the floor)
function ring(e, at, size, type = "normal", { dur = 420, flat = 1, alpha = .7, delay = 0, tex = "ring", ramp = null, layer = 1, s0 = .15 } = {}) {
  e.emit({ at, tex, ramp: ramp || `${typeId(type)}.h`, size: [size * s0 * flat, size * flat], aspect: 1 / flat, life: dur, alpha, delay, layer, grow: true });
}
// the air bends round a point (a hard blow, an explosion)
function shock(e, at, size, { dur = 420, flat = 1, delay = 0, alpha = 1 } = {}) {
  if (reduced()) return;
  e.emit({ at, tex: "wave", ramp: "white", size: [size * .1 * flat, size * flat], aspect: 1 / flat, life: dur, alpha, delay, distort: true, grow: true });
}
// streaks of light thrown out of a point
function sparks(e, at, n, type, { speed = [260, 620], size = 3, len = [6, 12], life = [220, 380], delay = 0, dir = null, arc = null, ramp = null, drag = 3.5, acc = null } = {}) {
  e.emit({ n, at, tex: "streak", ramp: ramp || typeId(type), speed, dir: dir ?? 0, arc: dir == null ? null : arc ?? 1, drag, acc, face: true, size: [size, size * .6], aspect: len, life, delay });
}
function smoke(e, at, size, n = 5, { ramp = null, rise = 40, delay = 0, life = [700, 1100], alpha = .7, spread = .3 } = {}) {
  e.emit({ n, at, r: [size * spread, size * spread * .4], tex: "smoke", ramp: ramp || (e.light ? "smoke.l" : "smoke"), size: [[size * .25, size * .35], [size * .6, size * .8]], vel: () => [rand(-20, 20), -rand(rise * .5, rise)], life, alpha, occ: .55, emis: 0, erode: .55, rot: "rand", spin: [-.6, .6], delay, grow: true });
}
function dust(e, at, size, n = 6, delay = 0) { smoke(e, at, size, n, { ramp: "dust", rise: 26, delay, spread: .45, alpha: .75 }); }
const shakeOf = (e, p) => { e.shake(p); };

/* ---------- ribbons ---------- */
// a beam: it reaches out from a to b, burns with a scrolling core, breathes in width and goes out thin
function beamStrip(e, a, b, { color = "#FFFFFF", width = 18, dur = 700, grow = .16, mode = 0, delay = 0, tile = .6, taper = .4, wobble = .1 } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  e.strip({ dur, delay, color, mode, emis: 1, uLen: 70, tile, points: (k, age) => {
    const reach = clamp(k / grow), fade = k > .75 ? 1 - (k - .75) / .25 : 1, w = width * (.55 + .45 * clamp(k / grow)) * (1 + wobble * Math.sin(age * .05)) * (.25 + .75 * fade);
    const n = Math.max(6, Math.round(len / 18));
    return times(n + 1, i => { const t = i / n * reach, s = Math.sin(Math.PI * Math.min(1, t * 6)) * .3 + .7; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), w * lerp(1 - taper, 1, Math.min(1, t * 4)) * s, fade]; });
  } });
}
// a bolt: a jagged path struck again with a new shape each flicker, forks off it
function boltStrip(e, a, b, { color = TYPE_COLOR.electric, width = 7, dur = 380, flicker = 7, depth = .13, forks = 2, delay = 0, steps = 12 } = {}) {
  const jag = (p, q, d, n) => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L; return times(n + 1, i => { const t = i / n, o = i === 0 || i === n ? 0 : (Math.random() * 2 - 1) * d * L; return [p[0] + dx * t + nx * o, p[1] + dy * t + ny * o]; }); };
  const cache = new Map();
  const shape = f => { if (!cache.has(f)) { const main = jag(a, b, depth, steps), out = [main]; for (let i = 0; i < forks; i++) { const at = main[2 + Math.floor(Math.random() * (steps - 4))], ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + rand(-1.1, 1.1), L = Math.hypot(b[0] - a[0], b[1] - a[1]) * rand(.15, .3); out.push(jag(at, [at[0] + Math.cos(ang) * L, at[1] + Math.sin(ang) * L], depth * 1.6, 5)); } cache.set(f, out); } return cache.get(f); };
  for (let fi = 0; fi <= forks; fi++) e.strip({ dur, delay, color, mode: 1, emis: 1, points: (k, age) => {
    const f = Math.floor(age / (dur / flicker)), local = (age / (dur / flicker)) % 1, al = (local < .65 ? 1 : 1 - (local - .65) / .35) * (k > .8 ? (1 - k) / .2 : 1);
    const line = shape(f)[fi];
    return line && line.map(([x, y], i) => [x, y, (fi ? width * .55 : width) * (1 - i / line.length * .3), al]);
  } });
}
// a cut: a curved sweep of light, its head running ahead and its tail chasing it, thick in the middle
function slashStrip(e, at, angle, len, { color = "#FFFFFF", width = 10, dur = 260, curve = .22, delay = 0, mode = 2 } = {}) {
  const [x, y] = at, dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
  const pt = t => { const s = (t - .5) * len, bend = (1 - (2 * t - 1) ** 2) * curve * len; return [x + dx * s + nx * bend, y + dy * s + ny * bend]; };
  e.strip({ dur, delay, color, mode, emis: 1, points: k => {
    const head = clamp(k / .5), tail = clamp((k - .2) / .7);
    if (head - tail < .01) return null;
    return times(17, i => { const t = lerp(tail, head, i / 16), [px, py] = pt(t); return [px, py, width * Math.sin(Math.PI * i / 16) * (1.1 - k * .5) + .5, 1]; });
  } });
}
// a ribbon that follows a path over its life (a stream of water, a vine, a whip)
function pathStrip(e, path, { color = "#FFFFFF", width = 10, dur = 500, delay = 0, mode = 3, head = .45, tailLag = .35, n = 24, taper = true } = {}) {
  e.strip({ dur, delay, color, mode, emis: 1, uLen: 50, tile: .8, points: k => {
    const h = clamp(k / head), t = clamp((k - tailLag) / (1 - tailLag));
    if (h - t < .01) return null;
    return times(n + 1, i => { const u = lerp(t, h, i / n), [x, y] = path(u); return [x, y, width * (taper ? .35 + .65 * Math.sin(Math.PI * Math.min(1, (i / n) * .5 + .5)) : 1) * (k > .85 ? (1 - k) / .15 : 1), 1]; });
  } });
}

/* ---------- what lands: a type's own debris ---------- */
const DEBRIS = {
  fire(e, at, s, p) {
    e.emit({ n: 12 * p, at, r: [s * .22, s * .14], tex: "flame", ramp: "fire", vel: () => [rand(-40, 40), -rand(90, 200)], acc: [0, -s * 1.2], size: [[s * .2, s * .32], s * .06], life: [420, 720], erode: .6, rot: "rand", rj: .3, grow: true });
    e.emit({ n: 16 * p, at, tex: "dot", ramp: "fire", speed: [s * 1.6, s * 3.6], drag: 1.6, acc: [0, s * 2.2], size: [4, 1.5], life: [600, 1000] });
    smoke(e, [at[0], at[1] - s * .1], s, 4 * p, { delay: 160, rise: 50, alpha: .55 });
  },
  water(e, at, s, p) {
    e.emit({ n: 18 * p, at, tex: "drop", ramp: "spray", speed: [s * 1.2, s * 2.6], dir: -Math.PI / 2, arc: 2.6, acc: [0, s * 4.5], face: true, rot: -Math.PI / 2, size: [[s * .07, s * .11], s * .05], aspect: .72, life: [520, 760], emis: .9, occ: .3 });
    e.emit({ n: 10 * p, at, r: s * .2, tex: "glow", ramp: "spray", speed: [s * .4, s * 1.2], size: [s * .1, s * .32], life: [380, 560], alpha: .7, grow: true });
    ring(e, [at[0], at[1] + s * .38], s * 1.3, "water", { flat: .3, dur: 640, layer: 0 });
    e.emit({ n: 6 * p, at, r: s * .3, tex: "bubble", ramp: "water.h", vel: () => [rand(-20, 20), -rand(40, 90)], size: [s * .05, s * .1], life: [600, 900], emis: .8, occ: .2 });
  },
  electric(e, at, s, p) {
    for (let i = 0; i < 4; i++) { const a = around(4, i); boltStrip(e, at, [at[0] + Math.cos(a) * s * .6 * p, at[1] + Math.sin(a) * s * .6 * p], { width: 4, dur: 260, flicker: 4, depth: .25, forks: 0, delay: i * 30, steps: 6 }); }
    sparks(e, at, 18 * p, "electric", { speed: [s * 2.4, s * 5], len: [5, 10] });
    glow(e, at, s * 1.1, "electric", { dur: 220, ramp: "electric.h", alpha: .4 });
  },
  grass(e, at, s, p) {
    e.emit({ n: 14 * p, at, tex: "leaf", ramp: "grass.m", speed: [s * 1.2, s * 2.4], drag: 2.2, acc: [0, s * .9], size: [[s * .14, s * .2], "same"], aspect: 1.9, rot: "rand", spin: [-9, 9], life: [800, 1200], occ: .85, emis: .25 });
    sparks(e, at, 8, "grass", { len: [4, 7] });
  },
  ice(e, at, s, p) {
    e.emit({ n: 12 * p, at, tex: "shard", ramp: "ice", speed: [s * 1.4, s * 3], drag: 2.4, face: true, rot: Math.PI / 2, size: [[s * .14, s * .24], s * .08], aspect: .42, life: [500, 800], emis: 1, occ: .2 });
    e.emit({ n: 10, at, r: s * .3, tex: "spark", ramp: "ice", size: [s * .18, 0], life: [400, 700], delay: 100 });
    smoke(e, at, s, 3, { ramp: "steam", rise: 18, alpha: .45 });
  },
  rock(e, at, s, p) {
    e.emit({ n: 12 * p, at, tex: "rock", ramp: "stone", speed: [s * 1.6, s * 3], dir: -Math.PI / 2, arc: 2.8, acc: [0, s * 6], size: [[s * .08, s * .16], "same"], rot: "rand", spin: [-8, 8], life: [600, 900], occ: 1, emis: .1 });
    dust(e, [at[0], at[1] + s * .2], s, 5 * p);
  },
  ground(e, at, s, p) {
    dust(e, [at[0], at[1] + s * .3], s * 1.3, 7 * p);
    e.emit({ n: 10 * p, at: [at[0], at[1] + s * .3], tex: "rock", ramp: "ground.m", speed: [s * 1.4, s * 2.6], dir: -Math.PI / 2, arc: 2.2, acc: [0, s * 6], size: [[s * .05, s * .1], "same"], rot: "rand", spin: [-8, 8], life: [500, 800], occ: 1, emis: .1 });
  },
  poison(e, at, s, p) {
    e.emit({ n: 12 * p, at, r: s * .3, tex: "bubble", ramp: "toxic", vel: () => [rand(-30, 30), -rand(40, 110)], size: [[s * .05, s * .12], s * .16], life: [500, 900], emis: .8, occ: .35, grow: true });
    e.emit({ n: 10 * p, at, tex: "dot", ramp: "poison.m", speed: [s * 1.2, s * 2.4], acc: [0, s * 3], size: [[5, 8], 3], life: [500, 700], occ: .6, emis: .5 });
    smoke(e, at, s, 3, { ramp: "toxic", alpha: .45 });
  },
  psychic(e, at, s, p) {
    for (let i = 0; i < 3; i++) ring(e, at, s * (1 + i * .35) * p, "psychic", { dur: 520, delay: i * 70 });
    e.emit({ n: 12, at, r: s * .4, tex: "spark", ramp: "psychic", size: [s * .14, 0], life: [400, 700] });
    shock(e, at, s * 1.6, { dur: 520 });
  },
  ghost(e, at, s, p) {
    e.emit({ n: 10 * p, at, r: [s * .3, s * .2], tex: "flame", ramp: "ghost", vel: () => [rand(-30, 30), -rand(60, 130)], size: [[s * .16, s * .26], s * .05], life: [600, 900], erode: .6, emis: .9 });
    smoke(e, at, s, 5, { ramp: "shadow", alpha: .55, rise: 30 });
  },
  dark(e, at, s, p) {
    smoke(e, at, s * 1.2, 7 * p, { ramp: "ink", alpha: .7, rise: 20, spread: .4 });
    sparks(e, at, 10, "dark", { ramp: "white", len: [6, 12] });
  },
  dragon(e, at, s, p) {
    e.emit({ n: 12 * p, at, tex: "scale", ramp: "dragon", speed: [s * 1.4, s * 3], drag: 2.5, rot: "rand", spin: [-6, 6], size: [[s * .1, s * .16], s * .04], life: [500, 800] });
    e.emit({ n: 8, at, r: s * .3, tex: "flame", ramp: "dragon", vel: () => [rand(-20, 20), -rand(50, 110)], size: [s * .2, s * .05], life: [500, 800], erode: .5 });
  },
  fairy(e, at, s, p) {
    e.emit({ n: 12 * p, at, tex: "star", ramp: "fairy", speed: [s * 1, s * 2.4], drag: 2.4, rot: "rand", spin: [-5, 5], size: [[s * .1, s * .18], 0], life: [600, 900] });
    e.emit({ n: 10, at, r: s * .4, tex: "spark", ramp: "fairy", size: [s * .2, 0], life: [400, 800], delay: 60 });
    e.emit({ n: 4, at, r: s * .3, tex: "heart", ramp: "fairy.h", vel: () => [rand(-20, 20), -rand(40, 80)], size: [s * .1, s * .12], life: 700, emis: .8 });
  },
  steel(e, at, s, p) {
    sparks(e, at, 22 * p, "steel", { ramp: "gold", speed: [s * 3, s * 7], len: [10, 22], size: 2.4, drag: 2, acc: [0, s * 4], life: [300, 520] });
    ring(e, at, s * 1.2, "steel", { dur: 300 });
  },
  fighting(e, at, s, p) {
    e.emit({ at, tex: "star", ramp: "fighting", size: [s * .3, s * 1.1 * p], life: 260, rot: "rand", grow: true });
    sparks(e, at, 12, "fighting", { speed: [s * 3, s * 6], len: [12, 22], size: 3 });
    dust(e, [at[0], at[1] + s * .35], s, 3);
  },
  flying(e, at, s, p) {
    e.emit({ n: 9 * p, at, tex: "feather", ramp: "flying.m", speed: [s * .8, s * 2], drag: 2.6, acc: [0, s * .5], rot: "rand", spin: [-4, 4], size: [[s * .14, s * .2], "same"], aspect: 2.2, life: [800, 1200], occ: .8, emis: .3 });
    for (let i = 0; i < 2; i++) slashStrip(e, at, rand(-.5, .5) + i * Math.PI, s * 1.2, { color: "#E8F4FF", width: 5, dur: 300, curve: .4, delay: i * 50 });
  },
  bug(e, at, s, p) {
    e.emit({ n: 14 * p, at, tex: "dot", ramp: "bug", speed: [s * 1.4, s * 3], drag: 2.6, size: [[4, 7], 1], life: [400, 700] });
    e.emit({ n: 6, at, tex: "leaf", ramp: "bug.m", speed: [s, s * 2], rot: "rand", spin: [-8, 8], size: [s * .1, s * .1], aspect: 1.8, life: 700, occ: .7 });
  },
  normal(e, at, s, p) {
    e.emit({ n: 5 * p, at, r: s * .3, tex: "star", ramp: "normal", size: [s * .12, s * .22], rot: "rand", spin: [-4, 4], life: [260, 380], grow: true });
    sparks(e, at, 10, "normal", { speed: [s * 2.5, s * 5], len: [10, 18] });
  },
};
export const debris = (stage, at, type, size, power = 1) => { const e = E(stage); if (e) (DEBRIS[typeId(type)] || DEBRIS.normal)(e, at, size, power); };

/* ---------- the marks a blow of the body leaves ---------- */
const MARK = {
  fang(e, at, s, t) {
    // jaws: two rows of fangs closing on it
    for (const sg of [-1, 1]) e.emit({ at: [at[0], at[1] + sg * s * .3], vel: [0, -sg * s * 1.6], drag: 6, tex: "fang", ramp: "white.h", size: [s * .3, s * .3], aspect: 2.6, rot: sg > 0 ? Math.PI : 0, life: 300, emis: 1, alpha: .95 });
    e.at(150, () => sparks(e, at, 10, t, { speed: [s * 2, s * 4], len: [5, 10] }));
  },
  claw(e, at, s, t) { for (let i = -1; i <= 1; i++) slashStrip(e, [at[0] + i * s * .16, at[1] + i * s * .05], 1.05, s * 1.25, { color: colorOf(t), width: 9, dur: 280, curve: .12, delay: (i + 1) * 40 }); },
  slash(e, at, s, t) { slashStrip(e, at, rand(.4, .8), s * 1.5, { color: "#FFFFFF", width: 13, dur: 280, curve: .26 }); slashStrip(e, at, rand(.4, .8), s * 1.5, { color: colorOf(t), width: 20, dur: 300, curve: .26, mode: 0 }); },
  cross(e, at, s, t) { slashStrip(e, at, .8, s * 1.4, { color: colorOf(t), width: 12, dur: 280, curve: .1 }); slashStrip(e, at, -.8 + Math.PI, s * 1.4, { color: colorOf(t), width: 12, dur: 280, curve: .1, delay: 70 }); },
};
const markOf = id => (/(bite|fang|crunch|jaw|chomp)/.test(id) ? "fang" : /cross|xscissor/.test(id) ? "cross" : /(claw|swipe|scratch|fury)/.test(id) ? "claw" : /(slash|cut|blade|sword|leaf|cleave|edge|razor|axe|scissor|aqua cutter)/.test(id) ? "slash" : null);

/* ---------------------------------------------------------------- the stage itself ---------------------------------------------------------------- */
export function shake(stage, power = 1) { const e = E(stage); if (e && !instant()) e.shake(.22 * power); return Promise.resolve(); }
export function flashStage(stage, peak = .35, duration = 360, color = "#FFFFFF") {
  const e = E(stage);
  if (!e || instant() || reduced()) return Promise.resolve();
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255);
  return e.anim(e.grade, { flashA: [0, peak * (e.light ? .6 : 1), 0], fR: [r, r], fG: [g, g], fB: [b, b] }, { dur: duration, at: [0, .12, 1], ease: "out2" });
}
// the arena's lamps drop a step (a big move, a fall), the ones in the light keep theirs
export function darken(stage, to = .45, dur = 700, holdMs = 0) {
  const e = E(stage);
  if (!e || instant()) return Promise.resolve();
  return e.anim(e.grade, { dim: [1, to, to, 1] }, { dur: dur + holdMs, at: [0, .25, holdMs ? .75 : .5, 1], ease: "inout" });
}
// a word across the stage: 3턴, 승리
export function banner(stage, text, { tone = "" } = {}) {
  const over = overOf(stage);
  if (!over || instant()) return Promise.resolve();
  const el = document.createElement("i");
  el.className = `bt-banner ${tone}`;
  el.textContent = text;
  over.appendChild(el);
  return done(el.animate([
    { opacity: 0, transform: "translate(-50%, -50%) translateY(12px)" },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .25, easing: OUT },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .8 },
    { opacity: 0, transform: "translate(-50%, -50%)" },
  ], { duration: ms(tone === "win" ? 1600 : 760), fill: "both" })).then(() => el.remove());
}
function done(anim) {
  if (!anim?.finished) return Promise.resolve();
  const t = anim.effect?.getComputedTiming?.().endTime || 400;
  let timer;
  return Promise.race([anim.finished, new Promise(r => { timer = setTimeout(r, t + 120); })]).catch(() => {}).finally(() => clearTimeout(timer));
}

/* ---------------------------------------------------------------- a blow ---------------------------------------------------------------- */
// the moment it lands: a white heart, the type's light, streaks out of it, a ring, the air bending, the type's debris, the mark
export function burst(stage, key, type, power = 1, { shards = true, mark = null } = {}) {
  const e = E(stage);
  if (!e || instant()) return Promise.resolve();
  const at = centre(stage, key), s = sizeOf(stage, key), t = typeId(type), p = clamp(power, .5, 1.8);
  // a sharp star of light at the point of the blow, turned at random, and only a little of the type's light round it
  e.emit({ at, tex: "spark", ramp: "white", size: [s * .3 * p, s * 1.15 * p], rot: rand(0, Math.PI), life: 170, alpha: .9, grow: true });
  e.emit({ at, tex: "spark", ramp: `${t}.h`, size: [s * .4 * p, s * 1.5 * p], rot: rand(0, Math.PI), life: 240, alpha: .55, grow: true });
  glow(e, at, s * .85 * p, t, { dur: 300, ramp: `${t}.h`, alpha: .25 });
  sparks(e, at, Math.round(12 * p), t, { speed: [s * 3, s * 6.5], len: [8, 16] });
  ring(e, at, s * 1.2 * p, t, { dur: 340, alpha: .5 });
  if (p > 1.02) { shock(e, at, s * 2.4 * p, { dur: 460 }); ring(e, at, s * 1.8 * p, t, { dur: 480, tex: "wave", alpha: .3, delay: 40 }); }
  if (shards) (DEBRIS[t] || DEBRIS.normal)(e, at, s, p);
  if (mark && MARK[mark]) MARK[mark](e, at, s, t);
  e.kick(.012 * p); e.shake(.16 * p);
  return e.after(240);
}

export function flashMon(stage, key, strength = 1) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  return e.anim(a, { flash: [0, .75 * strength, 0] }, { dur: 260, at: [0, .25, 1] });
}
/* it is struck: knocked back away from the foe and settling, flashing white, a critical blow sharper; a blow from the field or a
   status only shudders it in place. A substitute squashes as it takes it. */
export function hit(stage, key, { share = .2, crit = false, strong = false, weak = false, direct = true } = {}) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  const s = sizeOf(stage, key), p = (.05 + Math.min(1, share) * .14) * s * (crit ? 1.35 : 1) * (strong ? 1.15 : weak ? .7 : 1);
  const sx = a.own ? -1 : 1, sy = a.own ? .3 : -.3;
  const runs = [];
  if (direct) {
    runs.push(e.anim(a, { x: [0, sx * p * 1.3, -sx * p * .35, sx * p * .12, 0], y: [0, sy * p, -sy * p * .2, 0, 0], rot: [0, sx * .05, -sx * .02, 0, 0] }, { dur: 460, at: [0, .1, .36, .62, 1], ease: "out2" }));
    // the blink of a blow: two short flashes, never a white-out
    runs.push(e.anim(a, { flash: [0, .55, 0, .35, 0] }, { dur: 300, ease: "linear" }));
    if (a.src.startsWith("data:")) runs.push(e.anim(a, { sx: [1, 1.18, .94, 1], sy: [1, .8, 1.08, 1] }, { dur: 440 }));
    if (crit) { runs.push(e.anim(e.grade, { ca: [0, .012, 0] }, { dur: 360, at: [0, .15, 1] })); e.shake(.4); flashStage(stage, .1, 220); }
    else if (strong) e.shake(.25);
  } else runs.push(e.anim(a, { x: [0, 2, -2, 1.5, 0], flash: [0, .35, 0] }, { dur: 320, ease: "linear" }));
  return Promise.all(runs);
}

/* a status drawn in its own shapes: a burn's flames lick up it, paralysis crackles over it, poison bubbles out of it, sleep lets out
   Zs, a freeze closes ice round it. n: how much (a residual tick is lighter than the status landing) */
const AILMENT = {
  brn(e, a, s, n, key, stage) {
    const [x, y] = centre(stage, key, .1);
    e.emit({ n: 16 * n, at: [x, y], r: [s * .32, s * .04], tex: "flame", ramp: "fire", vel: () => [rand(-15, 15), -rand(80, 160)], acc: [0, -s * .8], size: [[s * .16, s * .26], s * .04], life: [500, 800], erode: .6, over: 500 * n, grow: true });
    e.anim(a, { tintR: [1, 1], tintG: [.35, .35], tintB: [.2, .2], tintA: [0, .4, 0] }, { dur: 700 });
  },
  par(e, a, s, n, key, stage) {
    const [x, y] = centre(stage, key);
    for (let i = 0; i < 4 * n; i++) { const a0 = around(4, i, .6), a1 = a0 + rand(1.2, 2.2); boltStrip(e, [x + Math.cos(a0) * s * .4, y + Math.sin(a0) * s * .45], [x + Math.cos(a1) * s * .4, y + Math.sin(a1) * s * .45], { width: 3.5, dur: 240, flicker: 3, depth: .3, forks: 0, delay: i * 80, steps: 6 }); }
    sparks(e, [x, y], 10 * n, "electric", { speed: [s, s * 2.5], len: [4, 8] });
    e.anim(a, { tintR: [1, 1], tintG: [.9, .9], tintB: [.2, .2], tintA: [0, .45, 0, .35, 0], x: [0, 2, -2, 2, 0] }, { dur: 520, ease: "linear" });
  },
  psn(e, a, s, n, key, stage) {
    const [x, y] = centre(stage, key, .25);
    e.emit({ n: 16 * n, at: [x, y], r: [s * .3, s * .2], tex: "bubble", ramp: "toxic", vel: () => [rand(-12, 12), -rand(40, 90)], size: [[s * .05, s * .1], s * .14], life: [600, 950], emis: .8, occ: .35, over: 500 * n, grow: true });
    e.anim(a, { tintR: [.75, .75], tintG: [.3, .3], tintB: [1, 1], tintA: [0, .45, 0] }, { dur: 760 });
  },
  slp(e, a, s, n, key, stage) {
    const [x, y] = centre(stage, key, .85);
    e.emit({ n: 3 * n, at: [x + s * .15, y], each: i => ({ delay: i * 280, size: [s * (.1 + i * .03), s * (.16 + i * .04)] }), tex: "z", ramp: "white.h", vel: [s * .25, -s * .4], life: 1100, emis: .9, occ: .4, rot: -.2 });
  },
  frz(e, a, s, n, key, stage) {
    const [x, y] = centre(stage, key, .4);
    for (let i = 0; i < 10; i++) { const ang = around(10, i, .12); e.emit({ at: [x + Math.cos(ang) * s * .42, y + Math.sin(ang) * s * .48], tex: "shard", ramp: "ice.h", size: [s * .05, s * .22], aspect: .45, rot: ang + Math.PI / 2, life: 900, delay: i * 25, emis: .9, occ: .3, grow: true }); }
    e.emit({ n: 8, at: [x, y], r: s * .45, tex: "spark", ramp: "ice", size: [s * .2, 0], life: [500, 800], delay: 300 });
    smoke(e, [x, y], s, 4, { ramp: "steam", rise: 12, alpha: .5 });
    e.anim(a, { tintR: [.6, .6], tintG: [.9, .9], tintB: [1, 1], tintA: [0, .6, .6, 0] }, { dur: 1000, at: [0, .2, .8, 1] });
  },
};
AILMENT.tox = AILMENT.psn;
const ailment = (stage, key, id, n = 1) => { const e = E(stage), a = actorOf(stage, key); if (!e || !a || !AILMENT[id]) return Promise.resolve(); AILMENT[id](e, a, sizeOf(stage, key), n, key, stage); return e.after(560); };

const RESIDUAL = { sandstorm: "rock", hail: "ice", spikes: "ground", leechseed: "grass", saltcure: "rock", curse: "ghost", nightmare: "ghost", partiallytrapped: "normal", lifeorb: "psychic", rockyhelmet: "steel", roughskin: "normal", ironbarbs: "steel", blacksludge: "poison", stickybarb: "steel", bind: "normal", firespin: "fire", whirlpool: "water", sandtomb: "ground", infestation: "bug", magmastorm: "fire" };
export function residual(stage, key, from) {
  const e = E(stage);
  if (!e || instant() || !actorOf(stage, key)) return Promise.resolve();
  if (from === "brn" || from === "psn" || from === "tox") return ailment(stage, key, from, .6);
  const at = centre(stage, key), s = sizeOf(stage, key);
  if (from === "stealthrock") {
    // the pointed stones floating round its side fly in at it
    for (let i = 0; i < 4; i++) { const a0 = -Math.PI / 2 + rand(-1.2, 1.2), d = s * 1.2, st = [at[0] + Math.cos(a0) * d, at[1] + Math.sin(a0) * d]; e.emit({ at: st, vel: [(at[0] - st[0]) / .28, (at[1] - st[1]) / .28], tex: "rock", ramp: "rock.h", size: [s * .16, s * .12], rot: "rand", spin: 8, life: 280, delay: i * 60, occ: 1, emis: .15 }); }
    e.at(300, () => { DEBRIS.rock(e, at, s, .7); e.shake(.18); });
    return e.after(420);
  }
  if (from === "sandstorm") { e.emit({ n: 30, at: [at[0] - s, at[1]], r: [s * .2, s * .5], vel: () => [rand(s * 3, s * 4.5), rand(-20, 20)], tex: "streak", ramp: "sand", face: true, size: [2, 2], aspect: [5, 12], life: 500, over: 300, occ: .5, emis: .3 }); return e.after(400); }
  if (from === "hail") { e.emit({ n: 8, at: () => [at[0] + rand(-s * .4, s * .4), at[1] - s * 1.4], vel: [0, s * 4.5], tex: "shard", ramp: "ice.h", size: [s * .07, s * .06], aspect: .6, life: 300, over: 260, emis: .8, occ: .3 }); e.at(300, () => DEBRIS.ice(e, at, s, .5)); return e.after(420); }
  if (from === "leechseed") { e.emit({ n: 8, at, r: s * .3, tex: "leaf", ramp: "grass.m", vel: () => [rand(-30, 30), rand(-30, 30)], size: [s * .12, s * .06], aspect: 1.8, rot: "rand", spin: 4, life: 600, occ: .8 }); return e.after(300); }
  const type = RESIDUAL[from];
  if (!type) return Promise.resolve();
  ring(e, at, s * .9, type, { dur: 380 });
  (DEBRIS[type] || DEBRIS.normal)(e, at, s, .5);
  return e.after(380);
}

// HP that flows from one Pokémon to another (a draining move, Leech Seed): green motes stream across, arriving as the bar fills
export function flow(stage, from, to) {
  const e = E(stage);
  if (!e || instant() || reduced() || from === to || !actorOf(stage, from) || !actorOf(stage, to)) return Promise.resolve();
  const a = centre(stage, from), b = centre(stage, to), s = sizeOf(stage, to);
  orbs(e, a, b, "grass", { n: 22, dur: 560, over: 380, wave: .14, size: 7 });
  e.at(560, () => { glow(e, b, s * 1.2, "grass", { dur: 400, alpha: .7 }); e.emit({ n: 10, at: b, r: s * .4, tex: "plus", ramp: "grass.h", vel: [0, -50], size: [s * .08, s * .04], life: 700, emis: .9 }); });
  return e.after(620);
}
// motes carried along a weave from a to b, each arriving in turn
function orbs(e, a, b, type, { n = 16, dur = 520, over = 300, wave = .1, size = 6, ramp = null, tex = "glow", trail = true } = {}) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d;
  for (let i = 0; i < n; i++) {
    const t0 = over * i / Math.max(1, n - 1), ph = rand(0, Math.PI * 2), amp = wave * d * rand(.5, 1);
    // a weave is a line plus a sideways swing, written as steps of a few short flights
    const steps = 6;
    for (let j = 0; j < steps; j++) {
      const p0 = j / steps, p1 = (j + 1) / steps, off = p => Math.sin(p * Math.PI * 2 + ph) * amp * Math.sin(Math.PI * p);
      const x0 = lerp(a[0], b[0], p0) + nx * off(p0), y0 = lerp(a[1], b[1], p0) + ny * off(p0), x1 = lerp(a[0], b[0], p1) + nx * off(p1), y1 = lerp(a[1], b[1], p1) + ny * off(p1);
      const seg = dur / steps;
      e.emit({ at: [x0, y0], vel: [(x1 - x0) / seg * 1000, (y1 - y0) / seg * 1000], tex, ramp: ramp || `${typeId(type)}.h`, size: [size, size], life: seg + 8, delay: t0 + j * seg, emis: 1 });
      if (trail) e.emit({ at: [x0, y0], tex: "glow", ramp: typeId(type), size: [size * 1.4, 0], life: 260, delay: t0 + j * seg, alpha: .6 });
    }
  }
}

export function cant(stage, key, why) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  if (why === "par") return Promise.all([ailment(stage, key, "par"), flashMon(stage, key, .4)]);
  if (why === "slp") return ailment(stage, key, "slp").then(() => e.after(500));
  if (why === "frz") return Promise.all([ailment(stage, key, "frz"), flashMon(stage, key, .6)]);
  if (why === "flinch") { sparks(e, centre(stage, key, .75), 6, "normal", { len: [8, 14] }); return hit(stage, key, { share: 0, weak: true }); }
  return flashMon(stage, key, .4);
}
// confused: it sways, stars circling over its head
export function sway(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .95), s = sizeOf(stage, key);
  // a circle seen from the side: three stars, each a run of short flights round it
  for (let i = 0; i < 3; i++) for (let j = 0; j < 16; j++) {
    const a0 = i / 3 * Math.PI * 2 + j / 16 * Math.PI * 3, a1 = a0 + Math.PI * 3 / 16, seg = 900 / 16, p0 = [x + Math.cos(a0) * s * .3, y + Math.sin(a0) * s * .08], p1 = [x + Math.cos(a1) * s * .3, y + Math.sin(a1) * s * .08];
    e.emit({ at: p0, vel: [(p1[0] - p0[0]) / seg * 1000, (p1[1] - p0[1]) / seg * 1000], tex: "star", ramp: "electric.h", size: [s * (Math.sin(a0) > 0 ? .1 : .07), s * (Math.sin(a1) > 0 ? .1 : .07)], life: seg + 6, delay: j * seg, emis: 1 });
  }
  return e.anim(a, { rot: [0, -.1, .1, -.07, 0] }, { dur: 900, ease: "sine" });
}

/* ---------- the substitute ---------- */
export function hideForDoll(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .15), s = sizeOf(stage, key);
  smoke(e, [x, y], s * 1.2, 8, { ramp: "steam", rise: 50, alpha: .8 });
  return e.anim(a, { alpha: [1, 0], sx: [1, .6], sy: [1, .6] }, { dur: 240, ease: "in2", fill: true });
}
export async function doll(stage, key, on) {
  const e = E(stage);
  if (!e || instant()) return;
  e.sync();
  const a = actorOf(stage, key);
  if (!a) return;
  e.cancel(a);
  await a.ready;
  const s = sizeOf(stage, key), [x, y] = centre(stage, key, .1);
  if (on) {
    smoke(e, [x, y], s, 4, { ramp: "steam", rise: 30, delay: 200 });
    e.at(270, () => { dust(e, [x, y], s, 3); e.shake(.1); });
    await e.anim(a, { y: [-s * .6, 0, 0, 0, 0], alpha: [0, 1, 1, 1, 1], sx: [.85, 1, 1.2, .92, 1], sy: [1.1, 1, .78, 1.1, 1] }, { dur: 680, at: [0, .4, .56, .78, 1], eases: ["in2", "out", "inout", "inout"] });
    return;
  }
  await e.anim(a, { alpha: [0, 1], flash: [1.2, 0] }, { dur: 380 });
}
export function breakDoll(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .3), s = sizeOf(stage, key);
  e.at(120, () => {
    smoke(e, [x, y], s, 8, { ramp: "steam", rise: 60, alpha: .8 });
    e.emit({ n: 12, at: [x, y], tex: "rock", ramp: "grass.m", speed: [s * 1.2, s * 2.4], dir: -Math.PI / 2, arc: 2.6, acc: [0, s * 3.5], size: [[s * .05, s * .09], "same"], rot: "rand", spin: [-10, 10], life: [600, 800], occ: 1, emis: .1 });
    ring(e, [x, y], s * 1.4, "normal", { dur: 420 });
  });
  return e.anim(a, { sx: [1, 1.2, .7], sy: [1, .78, 1.3], alpha: [1, 1, 0] }, { dur: 320, fill: true });
}
export function morph(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  const at = centre(stage, key), s = sizeOf(stage, key);
  e.at(300, () => { sparks(e, at, 14, "normal", { len: [6, 12] }); glow(e, at, s * 1.6, "normal", { dur: 400 }); });
  return e.anim(a, { sx: [1, .06, .06, 1], flash: [0, 1.6, 1.6, 0] }, { dur: 640, at: [0, .45, .55, 1], eases: ["in", "linear", "out"] });
}
// a move that takes a turn to charge: the light gathers twice and stays gathered a beat
export async function gather(stage, key, type) {
  const e = E(stage);
  if (!e || instant() || !actorOf(stage, key)) return;
  await charge(stage, key, type, 520);
  await Promise.all([charge(stage, key, type, 360), flashMon(stage, key, .6)]);
}
// Trick Room: the space turns a little and comes back as the room goes up round the court
export function twist(stage) {
  const e = E(stage);
  if (!e || instant() || reduced()) return Promise.resolve();
  // the roll is the camera's own target, eased by its spring: there and back without a cut
  e.cam.smooth = .18; e.cam.tr = -.05; e.at(300, () => { e.cam.tr = .025; }); e.at(560, () => { e.cam.tr = 0; e.cam.smooth = .35; });
  return Promise.all([e.after(820), e.anim(e.grade, { ca: [0, .01, 0] }, { dur: 820 }), flashStage(stage, .12, 500, "#FF8AC0")]);
}
// a screen broken by a blow: it falls apart in shards of its colour
const SCREEN_TYPE = { reflect: "water", lightscreen: "electric", auroraveil: "ice" };
export function shatter(stage, own, id) {
  const e = E(stage);
  if (!e || instant() || !SCREEN_TYPE[id]) return Promise.resolve();
  const sideEl = [...stage.querySelectorAll(`.bs-side.${own ? "own" : "foe"} .bs-slot`)].map(s => s.getBoundingClientRect()), box = stage.getBoundingClientRect();
  const l = Math.min(...sideEl.map(r => r.left)) - box.left, r = Math.max(...sideEl.map(r2 => r2.right)) - box.left, top = Math.min(...sideEl.map(r2 => r2.top)) - box.top, bot = Math.max(...sideEl.map(r2 => r2.bottom)) - box.top;
  if (!isFinite(l)) return Promise.resolve();
  e.emit({ n: 40, at: () => [rand(l, r), rand(top, bot)], tex: "shard", ramp: `${SCREEN_TYPE[id]}.h`, vel: () => [rand(-120, 120), rand(-160, 0)], acc: [0, 900], rot: "rand", spin: [-10, 10], size: [[6, 12], "same"], aspect: .5, life: [600, 900], emis: .9, occ: .3 });
  flashStage(stage, .12, 260);
  e.shake(.2);
  return e.after(200);
}

/* ---------- HP: the bar is a page element (battle.css), slid by Web Animations ---------- */
const toneAt = share => (share <= .2 ? "type-fire" : share <= .5 ? "type-electric" : "type-grass");
export function drain(stage, key, from, to, { quick = false } = {}) {
  const bar = stage?.closest(".bt-arena")?.querySelector(`[data-bar="${key}"] .bt-hp`);
  const a = clamp(from), b = clamp(to), span = Math.abs(a - b);
  const fill = bar?.querySelector("b");
  if (!fill || instant() || span < .001) return Promise.resolve();
  const total = quick ? Math.min(520, Math.max(300, span * 900)) : Math.min(1100, Math.max(420, span * 1200));
  const when = x => (1 - Math.sqrt(Math.max(0, 1 - Math.abs(x - a) / span))) * total;
  if (b < a) {
    const trail = document.createElement("i");
    trail.className = "bt-hp-lost";
    trail.style.left = `${b * 100}%`;
    trail.style.width = `${(a - b) * 100}%`;
    bar.appendChild(trail);
    done(trail.animate([{ opacity: .9 }, { opacity: .9, offset: .45 }, { opacity: 0 }], { duration: ms(total + 260), fill: "both" })).then(() => trail.remove());
  }
  const run = done(fill.animate([{ transform: `scaleX(${a})` }, { transform: `scaleX(${b})` }], { duration: ms(total) * slowed, easing: OUT, fill: "backwards" }));
  const base = bar.className.replace(/\btype-[a-z]+/g, "").trim();
  if (toneAt(from) !== toneAt(to)) {
    bar.className = `${base} ${toneAt(from)}`;
    for (const edge of [.2, .5]) if ((a - edge) * (b - edge) < 0) setTimeout(() => { bar.className = `${base} ${toneAt(edge + (b > a ? .001 : -.001))}`; }, ms(when(edge)));
    setTimeout(() => { bar.className = `${base} ${toneAt(to)}`; }, ms(total));
  }
  return run;
}
// healing: green light washes up it from its feet, crosses and glints rising, its outline lit
export function heal(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  const s = sizeOf(stage, key), [x, y] = centre(stage, key, .02);
  ring(e, [x, y], s * 1.3, "grass", { flat: .3, dur: 800, layer: 0 });
  e.emit({ n: 18, at: [x, y], r: [s * .4, s * .05], tex: "glow", ramp: "grass.h", vel: () => [rand(-8, 8), -rand(s * .9, s * 1.6)], size: [s * .06, s * .02], life: [700, 1000], over: 400, emis: 1 });
  e.emit({ n: 8, at: [x, y - s * .3], r: [s * .4, s * .3], tex: "plus", ramp: "grass.h", vel: () => [0, -rand(30, 60)], size: [s * .06, s * .1], life: [700, 900], over: 400, emis: .9 });
  e.emit({ at: [x, y - s * .4], tex: "streak", ramp: "grass", size: [s * .8, s * .8], aspect: .35, rot: Math.PI / 2, life: 700, alpha: .5 });
  return e.anim(a, { rimR: [.5, .5], rimG: [1, 1], rimB: [.5, .5], rimA: [0, 1, 0], flash: [0, .35, 0] }, { dur: 900 });
}
// fainting: it greys, holds a beat, sinks through the floor and goes out in a little dust; the lamps dim a step
export function faint(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  e.cancel(a);
  const s = sizeOf(stage, key), p = e.placed(a), [x] = centre(stage, key);
  e.at(380, () => { ring(e, [x, p?.fy || 0], s * 1.4, "normal", { flat: .26, dur: 640, alpha: .6, layer: 0 }); dust(e, [x, p?.fy || 0], s, 6); });
  return e.anim(a, { gray: [0, 1, 1, 1], bright: [1, .75, .75, .55], y: [0, s * .02, s * .02, (p?.h || s) * 1.02], clip: [1, 1, 1, 1], alpha: [1, 1, 1, .9] }, { dur: 900, at: [0, .22, .36, 1], eases: ["out", "linear", "in2"], fill: true });
}

/* ---------------------------------------------------------------- the big moments ---------------------------------------------------------------- */
/* a Poké Ball, lit as the Pokémon's own renders are (2026-11-06: the flat disc with a gloss spot sat on the stage like a sticker).
   Each frame is a sphere shaded pixel by pixel: the light from the upper left in front, a soft fall-off to its edge, a highlight,
   a faint cool rim the stadium throws back, and the red, the white, the band and the button turned with the ball, so it tumbles as
   it flies instead of spinning flat. FRAMES frames make one turn; they are painted once and kept for every stage. */
const FRAMES = 24, BALL_PX = 160;
let ballCanvases = null;
function paintBalls() {
  const out = [], R = BALL_PX / 2 - 3, C = BALL_PX / 2;
  const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const L = norm([-.55, .62, .56]), Hv = norm([L[0], L[1], L[2] + 1]), axis = norm([1, .28, .22]);
  const RED = [222, 38, 52], WHITE = [240, 243, 248], BAND = [26, 30, 42], RING = [34, 39, 56], BUTTON = [246, 247, 250];
  for (let f = 0; f < FRAMES; f++) {
    const th = -f / FRAMES * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), [ax, ay, az] = axis;
    // the ball's own frame: a point on the screen's sphere turned back by the spin (Rodrigues)
    const local = ([x, y, z]) => { const d = ax * x + ay * y + az * z, cx = ay * z - az * y, cy = az * x - ax * z, cz = ax * y - ay * x;
      return [x * cs + cx * sn + ax * d * (1 - cs), y * cs + cy * sn + ay * d * (1 - cs), z * cs + cz * sn + az * d * (1 - cs)]; };
    const c = Object.assign(document.createElement("canvas"), { width: BALL_PX, height: BALL_PX }), g = c.getContext("2d"), img = g.createImageData(BALL_PX, BALL_PX), px = img.data;
    for (let j = 0; j < BALL_PX; j++) for (let i = 0; i < BALL_PX; i++) {
      const nx = (i + .5 - C) / R, ny = -(j + .5 - C) / R, d2 = nx * nx + ny * ny, edge = (1 - Math.sqrt(d2)) * R + .5;
      if (edge <= 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d2)), n = [nx, ny, nz], q = local(n);
      const fromFront = Math.acos(Math.max(-1, Math.min(1, q[2])));
      let col, shine = .55;
      if (fromFront < .17) { col = BUTTON; }
      else if (fromFront < .27) { col = RING; shine = .3; }
      else if (fromFront < .31 || Math.abs(q[1]) < .07) { col = BAND; shine = .3; }
      else col = q[1] > 0 ? RED : WHITE;
      const diff = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      const spec = Math.pow(Math.max(0, n[0] * Hv[0] + n[1] * Hv[1] + n[2] * Hv[2]), 60) * shine;
      const rim = Math.pow(1 - nz, 3) * .22, k = .34 + .74 * diff, a = Math.min(1, edge) * 255, o = (j * BALL_PX + i) * 4;
      px[o] = Math.min(255, col[0] * k + 255 * spec + 90 * rim); px[o + 1] = Math.min(255, col[1] * k + 255 * spec + 130 * rim); px[o + 2] = Math.min(255, col[2] * k + 255 * spec + 230 * rim); px[o + 3] = a;
    }
    g.putImageData(img, 0, 0);
    out.push(c);
  }
  return out;
}
const upload = (gl, canvas) => {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
};
const ballTex = e => {
  if (!e.ballTex) { ballCanvases ||= paintBalls(); e.ballTex = ballCanvases.map(c => upload(e.gl, c)); }
  return e.ballTex;
};
// the ball's shadow on the floor: a soft dark oval, painted once
let shadowCanvas = null;
const shadowTex = e => {
  if (!e.shadowTex) {
    if (!shadowCanvas) {
      shadowCanvas = Object.assign(document.createElement("canvas"), { width: 128, height: 128 });
      const g = shadowCanvas.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
      gr.addColorStop(0, "rgba(2,6,16,.75)"); gr.addColorStop(.55, "rgba(2,6,16,.35)"); gr.addColorStop(1, "rgba(2,6,16,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    e.shadowTex = upload(e.gl, shadowCanvas);
  }
  return e.shadowTex;
};
// thrown in from its trainer's corner over an arc, tumbling as it goes, its shadow crossing the floor under it, opening at the top
// of its fall where the Pokémon will stand
export function throwBall(stage, key) {
  const e = E(stage);
  if (!e || instant() || reduced()) return Promise.resolve();
  /* the camera stays wide (gl.js CAMERA_MOVES), so the ball is sized by the Pokémon it carries, not the stage (it was 40 at most,
     16 to 20 on a phone), and its arc stays inside the stage (the foe's peaked above the top edge) */
  const own = ownKey(stage, key), { W, H } = e, [tx, ty] = centre(stage, key, .5), [, fy] = centre(stage, key, 0), dur = 720;
  const size = clamp(sizeOf(stage, key) * .28, 26, 64);
  const from = own ? [-size * 2, H * .92] : [W + size * 2, H * .34];
  const peak = Math.max(size, Math.min(from[1], ty) - H * (own ? .34 : .2)), t0 = e.T;
  const frames = ballTex(e), turns = own ? 2.2 : 1.6;
  const pathAt = t => [lerp(from[0], tx, t), (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * peak + t * t * ty];
  // the floor under it runs from the near edge (or the far side's floor) to the feet of the place it lands on
  const floorFrom = own ? H * 1.02 : Math.max(fy - H * .08, H * .3);
  e.sprites.push({ tex: shadowTex(e), at: T => {
    const t = (T - t0) / dur;
    if (t > 1) return null;
    const [x, y] = pathAt(t), gy = lerp(floorFrom, fy, t), lift = Math.max(0, gy - y) / H, k = Math.max(.25, 1 - lift * 2.2);
    return { x, y: gy, w: size * 1.6 * (own ? lerp(1.3, 1, t) : 1), h: size * .5, alpha: .55 * k * Math.min(1, t * 4) };
  } });
  e.sprites.push({ tex: frames[0], at: T => {
    const t = (T - t0) / dur;
    if (t > 1) return null;
    const [x, y] = pathAt(t), z = own ? lerp(1.3, 1, t) : lerp(.8, 1, t);
    return { x, y, w: size * z, h: size * z, tex: frames[Math.floor(t * turns * FRAMES) % FRAMES] };
  } });
  // its light trails it
  for (let i = 0; i < 14; i++) { const t = i / 14, [x, y] = pathAt(t); e.emit({ at: [x, y], tex: "glow", ramp: "white", size: [size * .8, 0], life: 240, delay: t * dur, alpha: .3 }); }
  return e.after(dur);
}
// the Pokémon standing on the canvas go out at once (before the opening's throws, so no lead stands before its ball comes)
// dark: the lamps stay off until the opening switches them on (the gate lifts onto a dark stage)
export function hideAll(stage, { dark = false } = {}) {
  const e = glOf(stage);
  if (!e) return;
  e.sync();
  for (const a of e.actors.values()) { e.cancel(a); a.base.alpha = 0; }
  if (dark && !instant()) e.gradeBase.dim = .18;
}
// the opening: the trainers' names and VS on plates, while the arena's lamps switch on. plates false: the gate said the names, the
// lamps alone switch on, a beat longer since the gate is parting over them
export async function opening(stage, ours, theirs, { plates = true } = {}) {
  const over = overOf(stage), e = E(stage);
  // the stage hideAll left dark comes back to its own lamps, whatever plays next
  const darkened = e?.gradeBase.dim !== 1;
  if (e) e.gradeBase.dim = 1;
  if (!over || instant()) return;
  if (!plates) {
    // the gate has lifted onto the dark stage: the lamps switch on in view, and the throws come on their rise
    if (e && darkened) e.anim(e.grade, { dim: [.18, 1], bloom: [1.6, 1] }, { dur: 900, ease: "inout" });
    await wait(reduced() ? 200 : 450);
    return;
  }
  const box = document.createElement("div");
  box.className = "bt-intro";
  const make = (cls, text) => { const el = document.createElement("span"); el.className = cls; el.textContent = text; box.appendChild(el); return el; };
  const a = make("bt-intro-name own", ours), vs = make("bt-intro-vs", "VS"), b = make("bt-intro-name", theirs);
  over.appendChild(box);
  if (e) { e.anim(e.grade, { dim: [.18, .18, 1], bloom: [1, 1.6, 1] }, { dur: 1900, at: [0, .5, 1], ease: "inout" }); e.shot(e.W / 2, e.H * .44, 1.08, { smooth: .1 }); e.at(60, () => e.shot(e.W / 2, e.H / 2, 1, { smooth: .9 })); }
  if (reduced()) { await wait(900); box.remove(); return; }
  const D = ms(1900);
  const slide = (n, dx) => done(n.animate([{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: `translateX(${dx}px)`, opacity: 0, offset: .1, easing: OUT }, { transform: "none", opacity: 1, offset: .3 },
    { transform: "none", opacity: 1, offset: .82, easing: IN }, { transform: `translateX(${-dx / 2}px)`, opacity: 0, offset: .92 }, { opacity: 0 }], { duration: D, fill: "both" }));
  await Promise.all([
    // the band opens from its middle line and closes back into it
    done(box.animate([{ transform: "scaleY(0)" }, { transform: "none", offset: .14, easing: OUT }, { transform: "none", offset: .9, easing: IN }, { transform: "scaleY(0)" }], { duration: D, fill: "both" })),
    slide(a, -32), slide(b, 32),
    done(vs.animate([{ transform: "scale(1.5)", opacity: 0 }, { transform: "scale(1.5)", opacity: 0, offset: .16, easing: OUT }, { transform: "none", opacity: 1, offset: .3 }, { transform: "none", opacity: 1, offset: .82 }, { opacity: 0, offset: .92 }, { opacity: 0 }], { duration: D, fill: "both" })),
  ]);
  box.remove();
}
// the end: a shower of light and streamers falls, the lamps flare once
export function victory(stage) {
  const e = E(stage);
  if (!e || instant()) return Promise.resolve();
  const { W, H } = e;
  e.emit({ n: 70, at: () => [rand(-.05, 1.05) * W, -H * .08], vel: () => [rand(-40, 40), rand(160, 300)], tex: "star", ramp: "gold", size: [[5, 10], "same"], rot: "rand", spin: [-4, 4], bob: [6, 14], period: [1.2, 2], life: [2600, 3600], over: 1200, emis: 1 });
  e.emit({ n: 50, at: () => [rand(0, 1) * W, -H * .05], vel: () => [rand(-30, 30), rand(120, 220)], tex: "petal", ramp: "rainbow", size: [[6, 9], "same"], aspect: .7, rot: "rand", spin: [-6, 6], bob: [8, 16], period: [1, 1.8], life: [3000, 4000], over: 1400, occ: .6, emis: .6 });
  e.anim(e.grade, { bloom: [1, 1.8, 1] }, { dur: 1400 });
  return e.after(1600);
}
/* sent in: the ball opens in a burst of light, a column of it rises, the Pokémon grows out of it white and settles into its colours */
export async function enter(stage, key, { ball = true } = {}) {
  const e = E(stage);
  if (!e || instant()) return;
  e.sync();
  const a = actorOf(stage, key);
  if (!a) return;
  e.cancel(a);
  a.base.alpha = 0;
  await Promise.all([a.ready, ball && !reduced() ? throwBall(stage, key) : null]);
  a.base.alpha = 1;
  if (reduced()) { await e.anim(a, { alpha: [0, 1] }, { dur: 260 }); return; }
  const at = centre(stage, key, .45), s = sizeOf(stage, key), feet = centre(stage, key, 0);
  glow(e, at, s * 1.2, "normal", { dur: 420, ramp: "white", alpha: .6 });
  glow(e, at, s * 2.2, "normal", { dur: 600, ramp: "blue", alpha: .3 });
  sparks(e, at, 18, "normal", { ramp: "white", speed: [s * 2, s * 4.5], len: [6, 12] });
  e.emit({ n: 12, at, r: s * .3, tex: "spark", ramp: "blue", size: [s * .18, 0], life: [400, 700], delay: 80 });
  e.emit({ at: [feet[0], feet[1] - s * .6], tex: "streak", ramp: "white", size: [s * .9, s * .9], aspect: .3, rot: Math.PI / 2, life: 520, alpha: .7 });
  ring(e, feet, s * 1.8, "normal", { flat: .26, dur: 640, ramp: "blue", layer: 0, delay: 100 });
  shock(e, at, s * 2.2, { dur: 500 });
  await e.anim(a, { sx: [.35, 1.08, 1], sy: [.35, 1.08, 1], flash: [2, .8, 0], alpha: [0, 1, 1], rimA: [1, .6, 0] }, { dur: 540, at: [0, .55, 1], eases: ["out", "inout"] });
}
/* called back, as sent in played backwards (DESIGN.md "Battle", What the stage plays): red light takes it from its edge in while
   motes gather to its heart and a ring on the floor closes on its feet; it swells a breath, folds into its own middle as one red
   light, and that light flies home to its trainer's corner on the arc the ball came in on, a comet with a tail that thins behind it.
   Dragged out (울부짖기), it is blown off its side on gusts. */
export async function leave(stage, key, { drag = false } = {}) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return;
  e.cancel(a);
  const at = centre(stage, key, .45), s = sizeOf(stage, key), feet = centre(stage, key, 0);
  if (reduced()) { await e.anim(a, { alpha: [1, 0] }, { dur: 260, fill: true }); return; }
  if (drag) {
    const d = (a.own ? -1 : 1) * s * 1.4;
    e.emit({ n: 12, at: [at[0] - Math.sign(d) * s * .5, at[1]], r: [s * .1, s * .4], vel: () => [Math.sign(d) * rand(s * 4, s * 6), 0], tex: "streak", ramp: "white", face: true, size: [2.5, 2.5], aspect: [14, 24], life: 320, over: 140 });
    await e.anim(a, { x: [0, d], rot: [0, Math.sign(d) * .3], alpha: [1, 0] }, { dur: 360, ease: "in2", fill: true });
    return;
  }
  const { W, H } = e, ball = a.own ? [-W * .03, H * 1.03] : [W * 1.03, -H * .03];
  const FOLD = 700;
  glow(e, at, s * 1.5, "normal", { ramp: "recall.h", dur: FOLD, alpha: .22, s0: .9 });
  // motes drawn in to its heart from round its body
  for (let i = 0; i < 18; i++) {
    const ang = around(18, i), r = s * rand(.55, .9), st = [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r * .9], life = rand(380, 520);
    e.emit({ at: st, vel: [(at[0] - st[0]) / life * 1000, (at[1] - st[1]) / life * 1000], tex: "spark", ramp: "recall", size: [s * .09, s * .02], life, delay: 60 + i * 14, emis: 1 });
  }
  // the ring at its feet closes in, the mirror of the one that opens as it comes out
  ring(e, feet, s * .5, "normal", { flat: .26, dur: FOLD, ramp: "recall.h", layer: 0, s0: 3.4, alpha: .8 });
  // it folds into its own middle: the scale keeps the heart where it is, so the picture closes on its centre, not its feet
  const lift = at[1] - feet[1];
  await e.anim(a, {
    // the colour channels add to the actor's base (1, 1, 1): these take it to the ball's red (1, .16, .2) and a pink-red rim
    tintG: [-.84, -.84], tintB: [-.8, -.8], tintA: [0, .82, .94, .96],
    rimG: [-.58, -.58], rimB: [-.58, -.58], rimA: [0, .7, .8, .8],
    flash: [0, 0, .08, .7], sx: [1, 1.04, .96, .04], sy: [1, 1.04, .96, .04], y: [0, -lift * .04, lift * .04, lift * .96], alpha: [1, 1, 1, 0],
  }, { dur: FOLD, at: [0, .3, .5, 1], eases: ["out", "inout", "in2"], fill: true });
  // what it became: one red light, a flash, and the light running home up the beam
  glow(e, at, s * .7, "normal", { ramp: "recall", dur: 260, alpha: .8, s0: .5 });
  e.emit({ at, tex: "spark", ramp: "recall", size: [s * .45, 0], life: 260, emis: 1 });
  // home on the ball's own arc, mirrored: up and over, then down into the corner it was thrown from
  const peak = Math.min(at[1], ball[1]) - H * (a.own ? .22 : .1), HOME = 460;
  const arc = u => [lerp(at[0], ball[0], u), (1 - u) * (1 - u) * at[1] + 2 * (1 - u) * u * peak + u * u * ball[1]];
  pathStrip(e, arc, { color: "#FF4A55", width: Math.max(5, s * .08), dur: HOME, head: .62, tailLag: .34, n: 28 });
  for (let i = 0; i < 12; i++) { const u = i / 12; e.emit({ at: arc(u), tex: "glow", ramp: "recall", size: [s * .28, s * .06], life: 240, delay: u * HOME * .62, alpha: .85, emis: 1 }); }
  await e.after(HOME * .7);
}
// Mega Evolution: the arena goes dark round it, light spirals in from every side into a cocoon of rainbow, it whites out, the stage
// flashes and it stands changed (megaEnd lets the light go)
export async function megaStart(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return;
  const at = centre(stage, key), s = sizeOf(stage, key);
  a.lit = true;
  e.anim(e.grade, { dim: [1, .25] }, { dur: 500, fill: true }).then(() => {});
  e.megaDim = true;
  e.shot(at[0], at[1], 1.3, { smooth: .5 });
  // the rainbow, closing in round it
  for (let i = 0; i < 48; i++) {
    const ang = i / 48 * Math.PI * 2 * 3, r = s * rand(1.1, 1.6), st = [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r * .8], life = rand(500, 800);
    e.emit({ at: st, vel: [(at[0] - st[0]) / life * 1000, (at[1] - st[1]) / life * 1000], tex: "glow", ramp: "rainbow", size: [s * .12, s * .04], life, delay: i * 16, emis: 1 });
  }
  e.emit({ at, tex: "orb", ramp: "rainbow", size: [s * .4, s * 1.5], life: 1150, alpha: .8, grow: true });
  for (let i = 0; i < 3; i++) ring(e, at, s * 1.8, "normal", { ramp: "rainbow", dur: 600, delay: 200 + i * 250, s0: 1, alpha: .8 });
  await e.anim(a, { flash: [0, 1, .6, 2.6], rimA: [0, 1, 1, 1], rimR: [1, 1], rimG: [.85, .85], rimB: [1, 1] }, { dur: 1100, at: [0, .35, .55, 1], fill: true, ease: "inout" });
  await flashStage(stage, .7, 420);
}
export async function megaEnd(stage, key) {
  const e = E(stage);
  if (!e) return;
  e.sync();
  const a = actorOf(stage, key);
  if (a) { e.cancel(a); a.lit = false; }
  if (e.megaDim) { e.cancel(e.grade); e.megaDim = false; }
  if (instant() || !a) return;
  const at = centre(stage, key), s = sizeOf(stage, key);
  glow(e, at, s * 3, "normal", { dur: 600, ramp: "rainbow" });
  sparks(e, at, 24, "normal", { ramp: "rainbow", speed: [s * 2, s * 5], len: [8, 16] });
  shock(e, at, s * 3, { dur: 600 });
  e.emit({ n: 18, at, r: s * .5, tex: "spark", ramp: "rainbow", size: [s * .22, 0], life: [500, 900], delay: 80 });
  e.shake(.35);
  await Promise.all([e.anim(a, { flash: [2.6, 0], rimA: [1, 0] }, { dur: 700 }), e.anim(e.grade, { dim: [.25, 1] }, { dur: 700 })]);
  e.wide(.6);
}
// a stat change: arrows rise (warm) or fall (cold) through it in columns, a band of light passing the same way
export function boost(stage, key, amount) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant() || !amount) return Promise.resolve();
  const up = amount > 0, [x, y] = centre(stage, key, .45), s = sizeOf(stage, key), n = Math.min(3, Math.abs(amount)) * 5;
  const ramp = up ? "fire.h" : "water.h";
  e.emit({ n, at: () => [x + rand(-.42, .42) * s, y + (up ? s * .5 : -s * .5)], vel: [0, (up ? -1 : 1) * s * 1.6], tex: "chevron", ramp, size: [s * .12, s * .12], rot: up ? 0 : Math.PI, life: 620, over: 360, emis: .9, occ: .3 });
  e.emit({ at: [x, y], tex: "glow", ramp: up ? "fire" : "water", size: [s * 1.2, s * 1.3], aspect: 1.1, life: 600, alpha: .45 });
  return e.anim(a, { rimR: up ? [1, 1] : [.4, .4], rimG: up ? [.45, .45] : [.7, .7], rimB: up ? [.2, .2] : [1, 1], rimA: [0, .9, 0], bright: [1, up ? 1.15 : .85, 1] }, { dur: 700 });
}
const STATUS_TYPE = { brn: "fire", par: "electric", psn: "poison", tox: "poison", slp: "normal", frz: "ice" };
export function status(stage, key, id) {
  const e = E(stage);
  if (!e || instant() || !actorOf(stage, key)) return Promise.resolve();
  ring(e, centre(stage, key), sizeOf(stage, key) * 1.3, STATUS_TYPE[id] || "normal", { dur: 460 });
  return Promise.all([ailment(stage, key, id), flashMon(stage, key, .5)]);
}
// Protect and its kin: a sphere of hexagonal panels closes round it, a glint crossing it; the guards that hurt show their teeth
const GUARD_TYPE = { protect: "grass", detect: "fighting", kingsshield: "steel", spikyshield: "grass", banefulbunker: "poison", silktrap: "bug", burningbulwark: "fire", obstruct: "dark", wideguard: "rock", quickguard: "fighting", maxguard: "normal" };
export function shield(stage, key, id = "protect") {
  const e = E(stage);
  if (!e || instant() || !actorOf(stage, key)) return Promise.resolve();
  const at = centre(stage, key), s = sizeOf(stage, key) * 1.5, t = GUARD_TYPE[id] || "grass";
  e.emit({ at, tex: "hexgrid", ramp: `${t}.h`, size: [s * 1.25, s], life: 900, alpha: .8, grow: true });
  e.emit({ at, tex: "bubble", ramp: `${t}.h`, size: [s * 1.1, s], life: 900, alpha: .7, emis: 1, grow: true });
  ring(e, at, s, t, { dur: 320, s0: 1.3 });
  e.emit({ at: [at[0] - s * .25, at[1] - s * .25], tex: "spark", ramp: "white", size: [0, s * .4], life: 420, delay: 220 });
  if (/spiky|kings|baneful|bulwark|obstruct/.test(id)) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; e.emit({ at: [at[0] + Math.cos(a) * s * .5, at[1] + Math.sin(a) * s * .5], tex: "shard", ramp: `${t}.h`, size: [s * .04, s * .16], aspect: .45, rot: a + Math.PI / 2, life: 600, delay: 100 + i * 15, emis: .9, grow: true }); }
  return e.after(900);
}
// an ability or an item announced: a plate slides in on its owner's side
export function popup(stage, key, owner, name, own) {
  const over = overOf(stage);
  if (!over || instant()) return Promise.resolve();
  const el = document.createElement("i");
  el.className = `bt-popup${own ? " own" : ""}`;
  const small = document.createElement("small"); small.textContent = owner;
  const big = document.createElement("b"); big.textContent = name;
  el.append(small, big);
  over.appendChild(el);
  const off = own ? "-110%" : "110%";
  return done(el.animate([
    { transform: `translateX(${off})`, opacity: 0 }, { transform: "translateX(0)", opacity: 1, offset: .16, easing: OUT },
    { transform: "translateX(0)", opacity: 1, offset: .82 }, { transform: `translateX(${off})`, opacity: 0 },
  ], { duration: ms(1500), fill: "both" })).then(() => el.remove());
}

/* ---------------------------------------------------------------- the pieces a move is built of ---------------------------------------------------------------- */
// light gathering at the user: motes drawn in from all round it, a heart of light swelling, a ring closing
export function charge(stage, key, type, duration = 420) {
  const e = E(stage);
  if (!e || instant()) return Promise.resolve();
  const at = centre(stage, key), s = sizeOf(stage, key), t = typeId(type), D = duration;
  for (let i = 0; i < 26; i++) {
    const ang = rand(0, Math.PI * 2), r = s * rand(.8, 1.3), st = [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r], life = D * rand(.45, .7);
    e.emit({ at: st, vel: [(at[0] - st[0]) / life * 1000, (at[1] - st[1]) / life * 1000], tex: "streak", ramp: t, face: true, size: [3, 1.5], aspect: 6, life, delay: rand(0, D - life), emis: 1 });
  }
  e.emit({ at, tex: "glow", ramp: `${t}.h`, size: [s * .1, s * .9], life: D, alpha: .9, grow: true });
  e.emit({ at, tex: "dot", ramp: "white.h", size: [s * .05, s * .3], life: D, alpha: .9, grow: true });
  ring(e, at, s * 1.6, t, { dur: D, s0: 1, alpha: .6 });
  const a = actorOf(stage, key), c = colorOf(t), [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  if (a) e.anim(a, { rimR: [r, r], rimG: [g, g], rimB: [b, b], rimA: [0, .9, 0] }, { dur: D + 200 });
  return e.after(D);
}
// the type's light rising round the user (a cloak of flames, a shine of steel)
export function aura(stage, key, type, rounds = 1, duration = 600) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  const t = typeId(type), s = sizeOf(stage, key), [x, y] = centre(stage, key, .05), c = colorOf(t), [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const tex = t === "fire" ? "flame" : t === "water" ? "bubble" : t === "grass" ? "leaf" : t === "electric" ? "spark" : "flame";
  e.emit({ n: 22 * rounds, at: [x, y], r: [s * .38, s * .06], tex, ramp: t === "fire" ? "fire" : t, vel: () => [rand(-10, 10), -rand(s * .9, s * 1.6)], size: [[s * .1, s * .18], s * .03], life: [500, 800], over: duration * .7, erode: tex === "flame" ? .55 : 0, emis: 1 });
  return e.anim(a, { rimR: [r, r], rimG: [g, g], rimB: [b, b], rimA: [0, 1, .8, 0], flash: [0, .25, 0] }, { dur: duration, at: [0, .3, .7, 1] });
}
// the user dashes to its target and back; the promise is the instant it strikes
function lunge(stage, from, to, type, { quick = false, short = false, dur = null, arc = 0, spin = 0 } = {}) {
  const e = E(stage), a = actorOf(stage, from);
  if (!e || !a || reduced()) return wait(200);
  const [ax, ay] = centre(stage, from), [bx, by] = centre(stage, to), k = short ? .45 : .78, dx = (bx - ax) * k, dy = (by - ay) * k;
  const D = dur || (quick ? 440 : 640), strike = .42;
  a.trail = true; a.hist = [];
  e.anim(a, { ghost: [0, 0, 1, 1, 0] }, { dur: D, at: [0, .18, .3, .5, .7] });
  const back = -.08;
  e.anim(a, { x: [0, dx * back, dx, dx * .94, 0], y: [0, dy * back - arc * .3, dy - arc, dy * .94, 0], rot: [0, -spin * .2, spin, spin, 0], sx: [1, 1.04, 1.08, 1.04, 1], sy: [1, .96, .95, 1, 1] }, { dur: D, at: [0, .2, strike, .56, 1], eases: ["out", "in2", "linear", "inout"] }).then(() => { a.trail = false; });
  // the camera rides with it
  const p = e.placed(a);
  if (p) { e.follow(() => [ax + a.st.x * .85, ay + a.st.y * .85], 1.16, .14); e.at(D * strike, () => e.shot(bx, by, 1.2, { smooth: .22 })); }
  return e.after(D * strike);
}
// the field answers a quake: the court cracks under the user's feet out to every side, dust and stones jump, the picture shakes
function quake(stage, from, { big = true } = {}) {
  const e = E(stage);
  if (!e) return;
  const [x, y] = centre(stage, from, 0), s = sizeOf(stage, from), { W, H } = e;
  for (let i = 0; i < 7; i++) { const at = [rand(.1, .9) * W, rand(.46, .98) * H], f = clamp(.18 + (at[1] / H - .42) * .55, .16, .5); e.emit({ at, tex: "crack", ramp: e.light ? "ink" : "dust", size: [W * .22 * f, W * .26 * f], aspect: 1 / f, life: 1600, delay: i * 60, occ: .9, emis: e.light ? 0 : .3, alpha: .9, layer: 0, grow: true }); }
  ring(e, [x, y], W * 1.2, "ground", { flat: .3, dur: 800, tex: "wave", ramp: "dust", layer: 0, alpha: .7 });
  shock(e, [x, y], W * .9, { flat: .35, dur: 700 });
  for (let i = 0; i < 14; i++) dust(e, [rand(.05, .95) * W, rand(.5, 1) * H], s * .9, 1, 60 + i * 30);
  e.shake(big ? .9 : .55);
}

/* move: { ident, targets, type, category, verb, spread, miss, still, move, priority } from the reader and the move's data;
   ahead: what the lines right after it say about the blow: power by target, the targets missed, the ones whose guard holds.
   The promise is the impact: the blow's result plays with it. */
export async function move(stageNode, event, keyOf, ahead = {}) {
  const stage = stageNode?.closest?.(".bs-stage") || stageNode;
  const e = E(stage);
  if (!e || instant() || event.still) return;
  e.sync();
  const from = keyOf(event.ident);
  const targets = (event.targets || []).map(keyOf).filter(k => slotEl(stage, k));
  const type = event.type || "Normal";
  const id = event.move;
  const power = k => Math.max(.6, ahead.power?.[k] || 1);
  const missed = k => ahead.missed?.has(k) || (event.miss && k === targets[0]);
  const blocked = k => ahead.blocked?.has(k);
  const mark = event.category === "Physical" ? markOf(id || "") : null;
  const land = (k, o = {}) => {
    if (blocked(k)) return null;
    if (missed(k)) return dodge(stage, k);
    return burst(stage, k, o.type || type, power(k) * (o.power || 1), { shards: o.shards ?? event.category !== "Status", mark: o.mark === undefined ? mark : o.mark });
  };
  const recipe = recipeOf(id);
  const at = (k, lift) => centre(stage, k, lift);
  const c = { stage, e, from, targets, type, id, event, power, missed, blocked, land, at };
  if (recipe && (await playScript(DRAW, c, recipe)) !== false) return;
  if (event.verb === "self" || !targets.length) { await aura(stage, from, type); return; }
  // no recipe (Struggle, a move the regulation never brings): the type's own flight
  await charge(stage, from, type, 300);
  await Promise.all(targets.map(t => DRAW.flight(c, t)));
  targets.forEach(t => land(t));
}
// a target that is missed steps aside and back, a faint copy where it stood
function dodge(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a) return Promise.resolve();
  const d = sizeOf(stage, key) * .3 * (a.own ? -1 : 1);
  a.trail = true; a.hist = [];
  return e.anim(a, { x: [0, d, d, 0], ghost: [0, 1, 1, 0] }, { dur: 460, at: [0, .3, .55, 1], eases: ["out", "linear", "inout"] }).then(() => { a.trail = false; });
}

/* the kit every move's recipe (moveFx.js) is drawn with */
const kit = {
  E, centre, sizeOf, unitOf, actorOf, ownKey, rand, lerp, clamp, times, around, typeId, colorOf,
  glow, ring, shock, sparks, smoke, dust, beamStrip, boltStrip, slashStrip, pathStrip, orbs, DEBRIS, MARK,
  burst, hit, charge, aura, lunge, quake, dodge, flashMon, flashStage, darken, heal, boost, ailment, sway, morph, leave, shake: shakeOf, wait, reduced,
};
const DRAW = makeDraw(kit);
