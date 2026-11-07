/* 배틀 무대의 연출 (DESIGN.md "Battle", The stage). 기술, 피격, 등장, 쓰러짐, 메가진화, 능력 변화, 상태 이상을 GPU 무대(gl.js)에 그린다.
   한 번의 기술은 게임처럼 네 박자다: 모으고(쓴 쪽의 빛), 놓고(카메라가 대상 쪽으로), 날아가고(궤적과 파편), 맞는다(섬광, 충격파,
   타입의 파편, 히트 스톱, 카메라의 반동). 맞은 쪽의 결과 줄은 맞는 순간에 함께 뜬다.
   말(턴, 승자, 특성, 이름)은 무대 밖의 판(.bs-over)이고 보드의 판(battle.css)이다.
   speed: 1 보통, .5 빠르게, 0 건너뛰기(연출 없이 상태만). */
import { reduced } from "../../components/common/motion.js";
import { playBoard } from "./Scoreboard.jsx";
import { makeDraw, recipeOf, playScript } from "./moveFx.js";
import { glOf, rand, lerp, clamp, typeId, colorOf, TYPE_COLOR } from "./gl.js";
import { setField } from "./arena.js";
import "./arena.js";
import { sfx, setSfxSpeed, setMoveType } from "./sfx.js";

let speed = 1;
export const setSpeed = s => { speed = s; setSfxSpeed(s); };
export const instant = () => speed === 0;
let slowed = 1;
const ms = n => Math.max(1, n * (speed || 0));
export const wait = n => (instant() ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms(n) * slowed)));
export const hold = (since, n) => (instant() ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, Math.max(0, ms(n) - (performance.now() - since)))));
const OUT = "cubic-bezier(.22,1,.36,1)";
const IN = "cubic-bezier(.5,0,.75,0)";

/* ---------- the engine of a stage, at the playback speed ---------- */
const E = stage => { const e = glOf(stage); if (e) e.rate = speed ? 1 / speed : 1; return e; };
// where a sound stands between the ears: ours on the left, theirs on the right (sfx.js)
const panOf = (e, at) => (e?.W && at ? clamp(at[0] / e.W * 2 - 1, -1, 1) * .55 : 0);
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
// smoke and dust: lit billows, rounded lobes catching the light from the upper left (2026-11-06 remake: the flat puffs read as stains)
function smoke(e, at, size, n = 5, { ramp = null, rise = 40, delay = 0, life = [700, 1100], alpha = .7, spread = .3 } = {}) {
  e.emit({ n, at, r: [size * spread, size * spread * .4], tex: "billow", lit: true, ramp: ramp || (e.light ? "smoke.l" : "smoke"), size: [[size * .22, size * .32], [size * .55, size * .75]], vel: () => [rand(-20, 20), -rand(rise * .5, rise)], life, alpha, occ: .7, emis: 0, erode: .5, rot: "rand", spin: [-.6, .6], delay, grow: true });
}
function dust(e, at, size, n = 6, delay = 0) { smoke(e, at, size, n, { ramp: "dust", rise: 26, delay, spread: .45, alpha: .8 }); }
/* fire as the games draw it: billowing lobes, white-hot where they burst, through yellow and orange to red, eaten away at their edges
   as they cool into brown smoke, embers thrown off them. at: where, s: how big, n: how many, up: how fast they rise */
function fire(e, at, s, n = 10, { r = .3, up = 1, life = [460, 760], delay = 0, over = 0, size = [.22, .5], vel = null, alpha = .95, layer = 1, embers = true } = {}) {
  e.emit({ n, at, r: Array.isArray(r) ? [s * r[0], s * r[1]] : [s * r, s * r * .7], tex: "billow", lit: true, ramp: "fire.s", vel: vel || (() => [rand(-30, 30), -rand(60, 160) * up]), acc: [0, -s * .8 * up], size: [[s * size[0] * .8, s * size[0] * 1.2], [s * size[1] * .8, s * size[1] * 1.2]], life, erode: .42, rot: "rand", spin: [-1.4, 1.4], emis: .6, occ: .75, alpha, delay, over, layer, grow: true });
  if (embers) e.emit({ n: Math.round(n * 1.4), at, r: s * .2, tex: "dot", ramp: "fire.c", speed: [s * 1.4, s * 3.4], drag: 1.6, acc: [0, s * 1.4], size: [[2.5, 4.5], 1], life: [500, 900], delay, over });
}
// a splash of water: glossy drops thrown up and falling, white foam bursting, a ring on the floor
function splash(e, at, s, p = 1, { delay = 0, ring: floorRing = true } = {}) {
  e.emit({ n: 16 * p, at, tex: "drop", lit: true, ramp: "water.l", speed: [s * 1.2, s * 2.8], dir: -Math.PI / 2, arc: 2.6, acc: [0, s * 4.5], face: true, rot: -Math.PI / 2, size: [[s * .07, s * .12], s * .05], aspect: .72, life: [520, 760], emis: .5, occ: .8, delay });
  // (round 3: the foam is a spray of blue water, fewer and smaller; seven white lobes covered the body)
  e.emit({ n: 4 * p, at, r: s * .2, tex: "billow", lit: true, ramp: "water.l", speed: [s * .5, s * 1.3], drag: 3, size: [[s * .12, s * .18], [s * .26, s * .36]], life: [340, 500], erode: .55, rot: "rand", emis: .35, occ: .85, delay, grow: true });
  // (2026-11-07 round 3: no ring on the floor; a flat circle reads as a sign. Spray skims out low along the floor instead)
  if (floorRing) e.emit({ n: 10 * p, at: [at[0], at[1] + s * .38], tex: "drop", lit: true, ramp: "water.l", speed: [s * 1.5, s * 2.6], dir: 0, arc: 7, acc: [0, s * 3], face: true, size: [s * .05, s * .02], aspect: .6, life: [300, 450], emis: .5, occ: .8, delay });
}
// the games' glint: a four-rayed sparkle
function glints(e, at, s, n = 6, ramp = "glint", { r = .5, delay = 0, over = 300, size = .22 } = {}) {
  e.emit({ n, at, r: s * r, tex: "glint", ramp, size: [s * size * .4, s * size], rot: 0, life: [320, 560], delay, over, emis: 1, grow: true });
}
const shakeOf = (e, p) => { e.shake(p); };
// the floor struck hard (a stomp, a landing, a bolt from the sky): it cracks, dust is thrown out low along it, chips jump, the air bends
function stamp(e, at, s, p = 1, type = "ground") {
  e.emit({ at, tex: "crack", ramp: e.light ? "ink" : "dust", size: [s * .5 * .3, s * 1.6 * p * .3], aspect: 1 / .3, rot: rand(0, 6), life: 1100, occ: .9, emis: e.light ? 0 : .3, alpha: .85, layer: 0, grow: true });
  e.emit({ n: Math.round(14 * p), at, r: [s * .2, s * .06], tex: "billow", lit: true, ramp: "dust", vel: () => { const a = rand(0, Math.PI * 2), v = rand(s * 1.6, s * 3) * p; return [Math.cos(a) * v, Math.sin(a) * v * .28 - s * .2]; }, drag: 3.2, size: [[s * .14, s * .22], [s * .36, s * .52]], life: [600, 900], erode: .5, rot: "rand", occ: .7, emis: 0, alpha: .8, grow: true });
  e.emit({ n: Math.round(10 * p), at, tex: "chip", lit: true, ramp: type === "rock" ? "stone" : "earth", speed: [s * 1.4, s * 2.8], dir: -Math.PI / 2, arc: 2.4, acc: [0, s * 7], size: [[s * .04, s * .09], "same"], rot: "rand", spin: [-8, 8], life: [500, 800], occ: 1, emis: .05 });
  shock(e, at, s * 2.6 * p, { flat: .35, dur: 520 });
}

/* ---------- ribbons ---------- */
// a beam: it reaches out from a to b, burns with a scrolling core, breathes in width and goes out thin
function beamStrip(e, a, b, { color = "#FFFFFF", width = 18, dur = 700, grow = .16, mode = 0, delay = 0, tile = .6, taper = .4, wobble = .1 } = {}) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  sfx("beam", { dur, at: delay, pan: panOf(e, a) });
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
  sfx("zap", { dur, at: delay, pan: panOf(e, b), big: width >= 7 && dur >= 360, type: "electric" });
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
  sfx("slash", { at: delay, pan: panOf(e, at) });
  const pt = t => { const s = (t - .5) * len, bend = (1 - (2 * t - 1) ** 2) * curve * len; return [x + dx * s + nx * bend, y + dy * s + ny * bend]; };
  // (round 4: a blade's body (mode 0) is lit matter of its colour; at full light it summed with its edge into a white cut)
  e.strip({ dur, delay, color, mode, emis: mode === 0 ? .55 : 1, occ: mode === 0 ? .6 : 0, points: k => {
    const head = clamp(k / .5), tail = clamp((k - .2) / .7);
    if (head - tail < .01) return null;
    return times(17, i => { const t = lerp(tail, head, i / 16), [px, py] = pt(t); return [px, py, width * Math.sin(Math.PI * i / 16) * (1.1 - k * .5) + .5, 1]; });
  } });
}
// a ribbon that follows a path over its life (a stream of water, a vine, a whip)
function pathStrip(e, path, { color = "#FFFFFF", width = 10, dur = 500, delay = 0, mode = 3, head = .45, tailLag = .35, n = 24, taper = true, occ = 0, emis = 1 } = {}) {
  sfx("swoosh", { dur, at: delay, pan: panOf(e, path(.5)) });
  e.strip({ dur, delay, color, mode, emis, occ, uLen: 50, tile: .8, points: k => {
    const h = clamp(k / head), t = clamp((k - tailLag) / (1 - tailLag));
    if (h - t < .01) return null;
    return times(n + 1, i => { const u = lerp(t, h, i / n), [x, y] = path(u); return [x, y, width * (taper ? .35 + .65 * Math.sin(Math.PI * Math.min(1, (i / n) * .5 + .5)) : 1) * (k > .85 ? (1 - k) / .15 : 1), 1]; });
  } });
}

/* ---------- what lands: a type's own debris ---------- */
/* 2026-11-06 remake: what each type throws is lit matter (a billow of fire, glossy drops and foam, cut stone and crystal, a leaf with
   its rib), drawn as 포켓몬 챔피언스 draws it, with the games' four-rayed glints for sparkle */
const DEBRIS = {
  fire(e, at, s, p) {
    fire(e, at, s, Math.round(10 * p), { r: [.3, .22], up: .9, size: [.2, .46] });
    smoke(e, [at[0], at[1] - s * .15], s, 3 * p, { delay: 260, rise: 50, alpha: .5 });
  },
  water(e, at, s, p) { splash(e, at, s, p); },
  electric(e, at, s, p) {
    for (let i = 0; i < 4; i++) { const a = around(4, i); boltStrip(e, at, [at[0] + Math.cos(a) * s * .6 * p, at[1] + Math.sin(a) * s * .6 * p], { width: 4, dur: 260, flicker: 4, depth: .25, forks: 0, delay: i * 30, steps: 6 }); }
    sparks(e, at, 16 * p, "electric", { ramp: "electric.h", speed: [s * 2.4, s * 5], len: [5, 10] });
    glints(e, at, s, 6, "electric.h", { r: .55 });
    glow(e, at, s * 1.1, "electric", { dur: 220, ramp: "electric.h", alpha: .4 });
  },
  grass(e, at, s, p) {
    e.emit({ n: 12 * p, at, tex: "leaf", lit: true, ramp: "leaf.c", speed: [s * 1.2, s * 2.4], drag: 2.2, acc: [0, s * .9], size: [[s * .14, s * .2], "same"], aspect: 1.9, rot: "rand", spin: [-9, 9], life: [800, 1200], occ: 1, emis: .15 });
    glints(e, at, s, 5, "grass.h", { r: .45 });
  },
  ice(e, at, s, p) {
    e.emit({ n: 10 * p, at, tex: "crystal", lit: true, ramp: "ice.c", speed: [s * 1.4, s * 3], drag: 2.4, size: [[s * .1, s * .2], s * .06], aspect: .6, rot: "rand", spin: [-6, 6], life: [500, 800], emis: .45, occ: .85 });
    glints(e, at, s, 8, "ice.h", { r: .45, delay: 80 });
    smoke(e, at, s, 3, { ramp: "steam", rise: 18, alpha: .4 });
  },
  rock(e, at, s, p) {
    e.emit({ n: 12 * p, at, tex: "chip", lit: true, ramp: "stone", speed: [s * 1.6, s * 3], dir: -Math.PI / 2, arc: 2.8, acc: [0, s * 6], size: [[s * .07, s * .15], "same"], rot: "rand", spin: [-8, 8], life: [600, 900], occ: 1, emis: .05 });
    dust(e, [at[0], at[1] + s * .2], s, 5 * p);
  },
  ground(e, at, s, p) {
    dust(e, [at[0], at[1] + s * .3], s * 1.3, 7 * p);
    e.emit({ n: 10 * p, at: [at[0], at[1] + s * .3], tex: "chip", lit: true, ramp: "earth", speed: [s * 1.4, s * 2.6], dir: -Math.PI / 2, arc: 2.2, acc: [0, s * 6], size: [[s * .05, s * .1], "same"], rot: "rand", spin: [-8, 8], life: [500, 800], occ: 1, emis: .05 });
  },
  poison(e, at, s, p) {
    e.emit({ n: 12 * p, at, r: s * .3, tex: "bubble", lit: true, ramp: "toxic.c", vel: () => [rand(-30, 30), -rand(40, 110)], size: [[s * .05, s * .12], s * .16], life: [500, 900], emis: .6, occ: .8, grow: true });
    e.emit({ n: 10 * p, at, tex: "drop", lit: true, ramp: "toxic.c", speed: [s * 1.2, s * 2.4], acc: [0, s * 3], face: true, rot: -Math.PI / 2, aspect: .72, size: [[s * .05, s * .09], s * .04], life: [500, 700], occ: 1, emis: .3 });
    smoke(e, at, s, 3, { ramp: "toxic", alpha: .4 });
  },
  psychic(e, at, s, p) {
    e.emit({ n: 12, at, r: s * .3, tex: "streak", ramp: "magenta", speed: [s * 2.5, s * 5], face: true, size: [3, 2], aspect: [10, 18], life: [260, 420] });
    glints(e, at, s, 8, "psychic.h", { r: .5 });
    shock(e, at, s * 1.6, { dur: 520 });
  },
  ghost(e, at, s, p) {
    // the games' ghost blow: a black jagged corona round a violet heart, violet flames licking off it
    e.emit({ at, tex: "splat", ramp: "ink", size: [s * .3, s * 1.1 * p], rot: rand(0, 6), life: 320, occ: .9, emis: 0, alpha: .85, grow: true });
    e.emit({ n: 8 * p, at, r: [s * .3, s * .2], tex: "flame", ramp: "ghost", vel: () => [rand(-30, 30), -rand(60, 130)], size: [[s * .16, s * .26], s * .05], life: [600, 900], erode: .6, emis: .9 });
    glints(e, at, s, 5, "ghost.h", { r: .5 });
  },
  dark(e, at, s, p) {
    e.emit({ at, tex: "splat", ramp: "ink", size: [s * .3, s * 1.15 * p], rot: rand(0, 6), life: 340, occ: .9, emis: 0, alpha: .9, grow: true });
    smoke(e, at, s * 1.1, 5 * p, { ramp: "ink", alpha: .6, rise: 20, spread: .4 });
    sparks(e, at, 10, "dark", { ramp: "recall", len: [6, 12] });
  },
  dragon(e, at, s, p) {
    e.emit({ n: 10 * p, at, tex: "scale", lit: true, ramp: "dragon.m", speed: [s * 1.4, s * 3], drag: 2.5, rot: "rand", spin: [-6, 6], size: [[s * .1, s * .16], s * .04], life: [500, 800], occ: 1, emis: .3 });
    // (2026-11-07 round 3: the wisps are matter of its colour, not light: eight emissive wisps per blow summed to white over a flurry)
    e.emit({ n: Math.round(6 * p), at, r: s * .3, tex: "billow", lit: true, ramp: "dragon.m", vel: () => [rand(-20, 20), -rand(50, 110)], size: [s * .12, s * .3], life: [500, 800], erode: .5, emis: .35, occ: .75, grow: true });
  },
  fairy(e, at, s, p) {
    glints(e, at, s, 12 * p, "fairy.h", { r: .6, size: .3 });
    e.emit({ n: 10 * p, at, tex: "star", lit: true, ramp: "fairy.m", speed: [s * 1, s * 2.4], drag: 2.4, rot: "rand", spin: [-5, 5], size: [[s * .07, s * .12], 0], life: [600, 900], emis: .6, occ: .6 });
  },
  steel(e, at, s, p) {
    sparks(e, at, 22 * p, "steel", { ramp: "gold", speed: [s * 3, s * 7], len: [10, 22], size: 2.4, drag: 2, acc: [0, s * 4], life: [300, 520] });
    // (round 3: gold sparks only; a white star and white glints over the burst's own star read as a white body)
  },
  fighting(e, at, s, p) {
    e.emit({ at, tex: "splat", ramp: "fighting.m", size: [s * .3, s * 1.1 * p], life: 240, rot: rand(0, 6), grow: true, alpha: .35 });
    sparks(e, at, 16, "fighting", { speed: [s * 3, s * 7], len: [14, 26], size: 3.4 });
    dust(e, [at[0], at[1] + s * .35], s, 3);
  },
  flying(e, at, s, p) {
    e.emit({ n: 4 * p, at, tex: "feather", lit: true, ramp: "flying.m", speed: [s * .8, s * 2], drag: 2.6, acc: [0, s * .5], rot: "rand", spin: [-4, 4], size: [[s * .1, s * .15], "same"], aspect: 2.2, life: [800, 1200], occ: 1, emis: .2 });
    for (let i = 0; i < 2; i++) slashStrip(e, at, rand(-.5, .5) + i * Math.PI, s * 1.2, { color: "#8FC2FF", width: 5, dur: 300, curve: .4, delay: i * 50 });
  },
  bug(e, at, s, p) {
    e.emit({ n: 12 * p, at, tex: "chip", lit: true, ramp: "bug.m", speed: [s * 1.4, s * 3], drag: 2.6, rot: "rand", spin: [-8, 8], size: [[s * .04, s * .08], "same"], life: [400, 700], occ: 1, emis: .2 });
    glints(e, at, s, 6, "bug.h", { r: .5 });
  },
  normal(e, at, s, p) {
    // a blow of no type: a star of warm light with streaks thrown out of it, the games' plain hit (a white splat read as a white-out)
    e.emit({ at, tex: "splat", ramp: "gold", size: [s * .3, s * .9 * p], life: 220, rot: rand(0, 6), grow: true, alpha: .4 });
    sparks(e, at, 16, "normal", { ramp: "gold", speed: [s * 3, s * 6.5], len: [12, 24], size: 3.2 });
    glints(e, at, s, 4, "glint", { r: .45 });
  },
};
export const debris = (stage, at, type, size, power = 1) => { const e = E(stage); if (e) (DEBRIS[typeId(type)] || DEBRIS.normal)(e, at, size, power); };

/* ---------- the marks a blow of the body leaves ---------- */
// a blade's two colours, its body and its edge, as Scarlet and Violet paint them (2026-11-07 round 3, from the showcase videos):
// a dragon's sweep is magenta with a blue edge, a fighting chop orange with a yellow edge; the rest their colour with a white edge
// (2026-11-07 round 4: every type has its own edge; a white edge on Flying, Normal, Steel, Water read as a white cut across a white body)
const BLADE = {
  dragon: ["#D83ACB", "#7FA0FF"], fighting: ["#FF7A2A", "#FFD24A"], fire: ["#FF6A1F", "#FFD86A"], ghost: ["#7A4AD8", "#D8B8FF"], dark: ["#4A3A6A", "#C9A8FF"], poison: ["#A64FEA", "#F0C8FF"],
  flying: ["#5E9EF0", "#9CCBFF"], normal: ["#D8A848", "#FFE6A8"], steel: ["#6F9AB8", "#DCEAF4"], water: ["#2F7BE0", "#A8DCFF"], ice: ["#3FB8E0", "#D0F6FF"], bug: ["#8FA820", "#E4F27A"],
  grass: ["#3FAE2A", "#C4F09A"], electric: ["#E8A800", "#FFEC80"], rock: ["#A08A58", "#EADBB0"], ground: ["#B07A3A", "#EECB94"], psychic: ["#E0307A", "#FFB4D8"], fairy: ["#E05AC8", "#FFD2F4"],
};
const bladeOf = t => BLADE[t] || [colorOf(t), "#FFFFFF"];
const MARK = {
  fang(e, at, s, t) {
    // jaws as the games draw them (번개엄니, 깨물어부수기): two big rows of fangs in the type's colour, lit and solid, snapping shut on it
    const ramp = { normal: "white.h", dark: "white.h", electric: "electric.h", ice: "ice.c", fire: "fire.s", psychic: "magenta", poison: "toxic.c", bug: "bug.m" }[t] || "white.h";
    for (const sg of [-1, 1]) e.emit({ at: [at[0], at[1] + sg * s * .42], vel: [0, -sg * s * 2.3], drag: 7, tex: "fang", lit: true, ramp, size: [s * .5, s * .5], aspect: 2.4, rot: sg > 0 ? Math.PI : 0, life: 340, emis: .35, occ: .95, alpha: 1 });
    e.at(130, () => { sparks(e, at, 10, t, { speed: [s * 2, s * 4], len: [5, 10] }); glints(e, at, s, 4, `${t}.h`, { r: .4 }); });
  },
  claw(e, at, s, t) { const [b0, b1] = bladeOf(t); for (let i = -1; i <= 1; i++) { slashStrip(e, [at[0] + i * s * .2, at[1] + i * s * .06], 1.05, s * 1.5, { color: b0, width: 18, dur: 300, curve: .12, delay: (i + 1) * 40, mode: 0 }); slashStrip(e, [at[0] + i * s * .2, at[1] + i * s * .06], 1.05, s * 1.4, { color: b1, width: 5, dur: 280, curve: .12, delay: (i + 1) * 40 }); } },
  slash(e, at, s, t) { const a = rand(.4, .8), [b0, b1] = bladeOf(t); slashStrip(e, at, a, s * 1.8, { color: b0, width: 32, dur: 320, curve: .26, mode: 0 }); slashStrip(e, at, a, s * 1.7, { color: b1, width: 10, dur: 300, curve: .26 }); sparks(e, at, 12, t, { dir: a, arc: .5, speed: [s * 3, s * 6], len: [12, 22] }); },
  cross(e, at, s, t) { const [b0, b1] = bladeOf(t); for (const [a, d] of [[.8, 0], [-.8 + Math.PI, 70]]) { slashStrip(e, at, a, s * 1.7, { color: b0, width: t === "fighting" ? 34 : 24, dur: 300, curve: .1, delay: d, mode: 0 }); slashStrip(e, at, a, s * 1.6, { color: b1, width: 7, dur: 280, curve: .1, delay: d }); } },
};
const markOf = id => (id === "stoneedge" ? null : /(bite|fang|crunch|jaw|chomp)/.test(id) ? "fang" : /cross|xscissor/.test(id) ? "cross" : /(claw|swipe|scratch|fury)/.test(id) ? "claw" : /(slash|cut|blade|sword|leaf|cleave|edge|razor|axe|scissor|aqua cutter)/.test(id) ? "slash" : null);

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
/* a weather arriving: its first gust sweeps the whole stage, in front of everything, while its air comes in behind (arena.js):
   rain darkens the arena and a flash of lightning breaks it, harsh sun bursts gold, sand and snow blow across from the left */
const WEATHER_IN = { raindance: "rain", primordialsea: "rain", sunnyday: "sun", desolateland: "sun", sandstorm: "sand", snowscape: "snow", snow: "snow", hail: "snow" };
export function weatherIn(stage, id) {
  const e = E(stage), kind = WEATHER_IN[id];
  if (!e || !kind || instant() || reduced()) return Promise.resolve();
  const { W, H } = e, U = clamp(W / 800, .55, 1.6);
  sfx(kind);
  if (kind === "rain") {
    darken(stage, .55, 900);
    e.at(320, () => flashStage(stage, .55, 260, "#DCE8FF"));
    e.emit({ n: 160, at: () => [rand(-.05, 1.25) * W, -H * .15], vel: () => [-380, rand(2300, 2600)], tex: "streak", ramp: e.light ? "rain.l" : "rain", size: [2.6 * U, 2.6 * U], aspect: 44, face: true, life: 560, over: 700, alpha: .9 });
  } else if (kind === "sun") {
    flashStage(stage, .6, 760, "#FFE2A0");
    e.emit({ at: [W * .02, -H * .1], tex: "glow", ramp: "sunray", size: [W * .4, W * 2.2], life: 900, alpha: .9 });
  } else {
    const sand = kind === "sand";
    if (!sand) flashStage(stage, .3, 600, "#E8F4FF");
    e.emit({ n: sand ? 140 : 120, at: () => [-W * rand(.05, .5), rand(-.05, 1.05) * H], vel: () => [rand(1500, 2100), rand(-60, sand ? 60 : 160)], tex: sand ? "streak" : "dot", ramp: sand ? "sand" : e.light ? "ice.h" : "snow", size: sand ? [2.6 * U, 2.6 * U] : [[3 * U, 6 * U], "same"], aspect: sand ? [20, 40] : 1, face: sand, life: 900, over: 300, alpha: .9, occ: e.light ? .6 : .2, emis: .6 });
    e.emit({ n: 6, at: () => [-W * rand(.2, .5), rand(.1, .9) * H], vel: () => [rand(1100, 1400), 0], tex: "cloud", ramp: sand ? "dust.c" : "steam", size: [W * .5, W * .5], aspect: 2.2, life: 1100, over: 200, alpha: .55, occ: .6, emis: .1 });
  }
  return e.after(900);
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
// the moment it lands: a white heart, the type's light, streaks out of it, the air bending, the type's debris, the mark (no ring:
// 포켓몬 챔피언스's blows land as a flash and the type's matter, and a lone circle read as a sign, not a blow)
const PALE_LIGHT = { flying: "flying.d", steel: "steel.d", ice: "ice.d", rock: "rock.d" };
export function burst(stage, key, type, power = 1, { shards = true, mark = null } = {}) {
  const e = E(stage);
  if (!e || instant()) return Promise.resolve();
  const at = centre(stage, key), s = sizeOf(stage, key), t = typeId(type), p = clamp(power, .5, 1.8);
  sfx("impact", { type: t, p, pan: panOf(e, at), mark, soft: !shards });
  // (2026-11-07 round 4) a landing on a target struck a moment ago keeps only its streaks, debris and mark: the blow's own marks
  // already lit that point, and a second star, glint, splat and glow over them summed to a white blob
  const now = performance.now(), quiet = (e.burstAt?.get(key) || 0) > now - 420;
  (e.burstAt ||= new Map()).set(key, now);
  if (quiet) {
    sparks(e, at, Math.round(8 * p), t, { speed: [s * 3.5, s * 7], len: [12, 24], size: 3 });
    if (shards) (DEBRIS[t] || DEBRIS.normal)(e, at, s, p * .7);
    if (mark && MARK[mark]) MARK[mark](e, at, s, t);
    e.shake(.12 * p);
    return e.after(200);
  }
  // a sharp star of light at the point of the blow, turned at random, and only a little of the type's light round it
  // 2026-11-07: the star of the blow is in its type's colour with a small white heart (a white star over a white-flashing target read as a
  // white-out), its streaks long and coloured, a corona of the type behind it and the air bending every time
  // (2026-11-07 round 3: the star held in its colour from its first frame, `.m`; the type ramp opens white, and four quick blows
  // stacked four white stars into a white body)
  const lit = PALE_LIGHT[t] || `${t}.m`;
  e.emit({ at, tex: "spark", ramp: lit, size: [s * .3 * p, s * 1.3 * p], rot: rand(0, Math.PI), life: 230, alpha: 1, grow: true });
  e.emit({ at, tex: "spark", ramp: "white", size: [s * .08 * p, s * .28 * p], rot: rand(0, Math.PI), life: 120, alpha: .45, grow: true });
  if (!["normal", "flying", "ice", "steel", "rock"].includes(t)) e.emit({ at, tex: "glint", ramp: `${t}.h`, size: [s * .4 * p, s * 1.6 * p], rot: rand(-.3, .3), life: 260, alpha: .3, grow: true });
  // a splat of light only for the deep colours: a pale one (Flying, Ice, Steel, Normal, Fairy) laid a white sheet over the body
  if (!["normal", "flying", "ice", "steel", "fairy", "rock"].includes(t)) e.emit({ at, tex: "splat", ramp: `${t}.m`, size: [s * .3, s * 1.05 * p], rot: rand(0, 6), life: 260, alpha: .32, emis: 1, grow: true });
  glow(e, at, s * .9 * p, t, { dur: 320, ramp: `${t}.h`, alpha: .2 });
  sparks(e, at, Math.round(16 * p), t, { speed: [s * 3.5, s * 7.5], len: [12, 26], size: 3.4, ramp: PALE_LIGHT[t] });
  shock(e, at, s * 2 * p, { dur: 420 });
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
  const runs = [], pan = panOf(e, centre(stage, key));
  sfx(!direct ? "knock" : crit ? "crit" : strong ? "super" : weak ? "resist" : "damage", { share, pan });
  if (direct && crit && strong) sfx("super", { pan });
  if (direct) {
    runs.push(e.anim(a, { x: [0, sx * p * 1.3, -sx * p * .35, sx * p * .12, 0], y: [0, sy * p, -sy * p * .2, 0, 0], rot: [0, sx * .05, -sx * .02, 0, 0] }, { dur: 460, at: [0, .1, .36, .62, 1], ease: "out2" }));
    // the blink of a blow: two short flashes, never a white-out. Blinks do not stack (2026-11-07: a flurry of hits summed them to .6,
    // a white body for half a second); a blow inside another's blink only shakes it
    const now = performance.now();
    if (!(a.blinkUntil > now)) { a.blinkUntil = now + ms(300); runs.push(e.anim(a, { flash: [0, .26, 0, .14, 0] }, { dur: 300, ease: "linear" })); }
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
    fire(e, [x, y], s, Math.round(10 * n), { r: [.34, .05], up: .8, size: [.12, .3], over: 500 * n, embers: n > .7 });
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
    e.emit({ n: 14 * n, at: [x, y], r: [s * .3, s * .2], tex: "bubble", lit: true, ramp: "toxic.c", vel: () => [rand(-12, 12), -rand(40, 90)], size: [[s * .05, s * .1], s * .14], life: [600, 950], emis: .6, occ: .8, over: 500 * n, grow: true });
    e.anim(a, { tintR: [.75, .75], tintG: [.3, .3], tintB: [1, 1], tintA: [0, .45, 0] }, { dur: 760 });
  },
  slp(e, a, s, n, key, stage) {
    const [x, y] = centre(stage, key, .85);
    e.emit({ n: 3 * n, at: [x + s * .15, y], each: i => ({ delay: i * 280, size: [s * (.1 + i * .03), s * (.16 + i * .04)] }), tex: "z", ramp: "white.h", vel: [s * .25, -s * .4], life: 1100, emis: .9, occ: .4, rot: -.2 });
  },
  frz(e, a, s, n, key, stage) {
    const [x, y] = centre(stage, key, .4);
    // crystals of ice close round it, clear and cut, glints running over them
    for (let i = 0; i < 12; i++) { const ang = around(12, i, .12); e.emit({ at: [x + Math.cos(ang) * s * .4, y + Math.sin(ang) * s * .46], tex: "crystal", lit: true, ramp: "ice.c", size: [s * .05, s * .26], aspect: .55, rot: ang + Math.PI / 2, life: 900, delay: i * 25, emis: .4, occ: .85, grow: true }); }
    glints(e, [x, y], s, 8, "ice.h", { r: .45, delay: 300 });
    smoke(e, [x, y], s, 4, { ramp: "steam", rise: 12, alpha: .5 });
    e.anim(a, { tintR: [.6, .6], tintG: [.9, .9], tintB: [1, 1], tintA: [0, .6, .6, 0] }, { dur: 1000, at: [0, .2, .8, 1] });
  },
};
AILMENT.tox = AILMENT.psn;
const ailment = (stage, key, id, n = 1) => { const e = E(stage), a = actorOf(stage, key); if (!e || !a || !AILMENT[id]) return Promise.resolve(); sfx(`st_${id === "tox" ? "psn" : id}`, { n, pan: panOf(e, centre(stage, key)) }); AILMENT[id](e, a, sizeOf(stage, key), n, key, stage); return e.after(560); };

const RESIDUAL = { sandstorm: "rock", hail: "ice", spikes: "ground", leechseed: "grass", saltcure: "rock", curse: "ghost", nightmare: "ghost", partiallytrapped: "normal", lifeorb: "psychic", rockyhelmet: "steel", roughskin: "normal", ironbarbs: "steel", blacksludge: "poison", stickybarb: "steel", bind: "normal", firespin: "fire", whirlpool: "water", sandtomb: "ground", infestation: "bug", magmastorm: "fire" };
export function residual(stage, key, from) {
  const e = E(stage);
  if (!e || instant() || !actorOf(stage, key)) return Promise.resolve();
  if (from === "brn" || from === "psn" || from === "tox") return ailment(stage, key, from, .6);
  const at = centre(stage, key), s = sizeOf(stage, key), pan = panOf(e, at);
  if (from === "stealthrock") {
    sfx("rocks", { pan, at: 60 }); sfx("impact", { type: "rock", p: .7, pan, at: 300 });
    // the pointed stones floating round its side fly in at it
    for (let i = 0; i < 7; i++) { const a0 = -Math.PI / 2 + rand(-1.2, 1.2), d = s * 1.2, st = [at[0] + Math.cos(a0) * d, at[1] + Math.sin(a0) * d]; e.emit({ at: st, vel: [(at[0] - st[0]) / .28, (at[1] - st[1]) / .28], tex: "chip", lit: true, ramp: "chip", size: [s * .12, s * .1], rot: "rand", spin: 8, life: 280, delay: i * 60, occ: 1, emis: .05 }); }
    e.at(300, () => { DEBRIS.rock(e, at, s, .7); e.shake(.18); });
    return e.after(420);
  }
  if (from === "sandstorm") { sfx("wind", { pan }); e.emit({ n: 30, at: [at[0] - s, at[1]], r: [s * .2, s * .5], vel: () => [rand(s * 3, s * 4.5), rand(-20, 20)], tex: "streak", ramp: "sand", face: true, size: [2, 2], aspect: [5, 12], life: 500, over: 300, occ: .5, emis: .3 }); return e.after(400); }
  if (from === "hail") { sfx("impact", { type: "ice", p: .5, pan, at: 300 }); e.emit({ n: 8, at: () => [at[0] + rand(-s * .4, s * .4), at[1] - s * 1.4], vel: [0, s * 4.5], tex: "crystal", lit: true, ramp: "ice.c", size: [s * .07, s * .06], aspect: .6, life: 300, over: 260, emis: .4, occ: .85 }); e.at(300, () => DEBRIS.ice(e, at, s, .5)); return e.after(420); }
  if (from === "leechseed") { sfx("squeeze", { pan }); e.emit({ n: 8, at, r: s * .3, tex: "leaf", ramp: "grass.m", vel: () => [rand(-30, 30), rand(-30, 30)], size: [s * .12, s * .06], aspect: 1.8, rot: "rand", spin: 4, life: 600, occ: .8 }); return e.after(300); }
  const type = RESIDUAL[from];
  if (!type) return Promise.resolve();
  sfx("impact", { type, p: .5, pan });
  glints(e, at, s, 4, `${type}.h`, { r: .4 });
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
  sfx("motes", { type: typeId(type), dur: dur + over, pan: panOf(e, b) });
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
  if (why === "flinch") { sfx("flinch", { pan: panOf(e, centre(stage, key)) }); sparks(e, centre(stage, key, .75), 6, "normal", { len: [8, 14] }); return hit(stage, key, { share: 0, weak: true }); }
  return flashMon(stage, key, .4);
}
// confused: it sways, stars circling over its head
export function sway(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .95), s = sizeOf(stage, key);
  sfx("confused", { pan: panOf(e, [x, y]) });
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
  sfx("puff", { pan: panOf(e, [x, y]) });
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
    sfx("boing", { at: 270, pan: panOf(e, [x, y]) });
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
  sfx("pop", { at: 120, pan: panOf(e, [x, y]) });
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
  sfx("morph", { pan: panOf(e, at) });
  e.at(300, () => { sparks(e, at, 14, "normal", { len: [6, 12] }); glow(e, at, s * 1.6, "normal", { dur: 400 }); });
  // (round 3: a pale violet-white sheen, not a white cut-out, as it folds to a line and opens as the other)
  return e.anim(a, { sx: [1, .06, .06, 1], flash: [0, .7, .7, 0], rimR: [.8, .8], rimG: [.6, .6], rimB: [1, 1], rimA: [0, 1, 1, 0] }, { dur: 640, at: [0, .45, .55, 1], eases: ["in", "linear", "out"] });
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
  if (!e || instant()) return Promise.resolve();
  sfx("room");
  if (reduced()) return Promise.resolve();
  // the roll is the camera's own target, eased by its spring: there and back without a cut
  e.cam.smooth = .18; e.cam.tr = -.05; e.at(300, () => { e.cam.tr = .025; }); e.at(560, () => { e.cam.tr = 0; e.cam.smooth = .35; });
  return Promise.all([e.after(820), e.anim(e.grade, { ca: [0, .01, 0] }, { dur: 820 }), flashStage(stage, .12, 500, "#FF8AC0")]);
}
// a screen broken by a blow: it falls apart in shards of its colour
const SCREEN_TYPE = { reflect: "bar.gold", lightscreen: "bar.pink", auroraveil: "aurora.v" };
export function shatter(stage, own, id) {
  const e = E(stage);
  if (!e || instant() || !SCREEN_TYPE[id]) return Promise.resolve();
  const sideEl = [...stage.querySelectorAll(`.bs-side.${own ? "own" : "foe"} .bs-slot`)].map(s => s.getBoundingClientRect()), box = stage.getBoundingClientRect();
  const l = Math.min(...sideEl.map(r => r.left)) - box.left, r = Math.max(...sideEl.map(r2 => r2.right)) - box.left, top = Math.min(...sideEl.map(r2 => r2.top)) - box.top, bot = Math.max(...sideEl.map(r2 => r2.bottom)) - box.top;
  if (!isFinite(l)) return Promise.resolve();
  sfx("glass", { pan: own ? -.4 : .4 });
  e.emit({ n: 40, at: () => [rand(l, r), rand(top, bot)], tex: "shard", lit: true, ramp: SCREEN_TYPE[id], vel: () => [rand(-120, 120), rand(-160, 0)], acc: [0, 900], rot: "rand", spin: [-10, 10], size: [[6, 12], "same"], aspect: .5, life: [600, 900], emis: .6, occ: .7 });
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
  sfx("heal", { pan: panOf(e, [x, y]) });
  e.emit({ at: [x, y - s * .45], tex: "glow", ramp: "grass.h", size: [s * .3, s * 1.5], aspect: .8, life: 900, alpha: .07, layer: 0, grow: true });
  e.emit({ n: 26, at: [x, y], r: [s * .45, s * .06], tex: "glow", ramp: "grass.h", vel: () => [rand(-8, 8), -rand(s * .9, s * 1.7)], size: [s * .07, s * .02], life: [700, 1100], over: 500, emis: 1 });
  e.emit({ n: 14, at: [x, y], r: [s * .45, s * .06], tex: "streak", ramp: "grass", vel: () => [rand(-4, 4), -rand(s * .9, s * 1.5)], face: true, size: [3, 2], aspect: [8, 14], life: [500, 800], over: 500 });
  e.emit({ n: 8, at: [x, y - s * .3], r: [s * .4, s * .3], tex: "plus", ramp: "grass.h", vel: () => [0, -rand(30, 60)], size: [s * .06, s * .1], life: [700, 900], over: 400, emis: .9 });
  return e.anim(a, { rimR: [.4, .4], rimG: [1, 1], rimB: [.45, .45], rimA: [0, .7, 0] }, { dur: 900 });
}
// fainting: it greys, holds a beat, sinks through the floor and goes out in a little dust; the lamps dim a step
export function faint(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  e.cancel(a);
  const s = sizeOf(stage, key), p = e.placed(a), [x] = centre(stage, key);
  sfx("faint", { pan: panOf(e, [x, 0]) });
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
  sfx("throw", { dur, pan: own ? -.5 : .5 });
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
/* the opening: the arena's lamps switch on and, unless the gate has just said who plays, the match board lights over them (Scoreboard.jsx:
   the head strip, the opponent's row above ours with their dark cells) and goes before the throws. The camera holds (2026-11-06: the
   names no longer slide in across VS and the shot no longer pushes in; the board switches on, as it does going in and at the end).
   plates false: the gate said the names, the lamps alone switch on, a beat longer since the gate is parting over them */
export async function opening(stage, ours, theirs, { plates = true, seated = false } = {}) {
  const over = overOf(stage), e = E(stage);
  // the stage hideAll left dark comes back to its own lamps, whatever plays next
  const darkened = e?.gradeBase.dim !== 1;
  if (e) e.gradeBase.dim = 1;
  if (!over || instant()) return;
  sfx("lamps");
  if (!plates) {
    // the gate has lifted onto the dark stage: the lamps switch on in view, and the throws come on their rise
    if (e && darkened) e.anim(e.grade, { dim: [.18, 1], bloom: [1.6, 1] }, { dur: 900, ease: "inout" });
    await wait(reduced() ? 200 : 450);
    return;
  }
  if (e) e.anim(e.grade, { dim: [.18, .18, 1] }, { dur: 1600, at: [0, .5, 1], ease: "inout" });
  await playBoard(over, { say: "배틀 시작", rows: [{ label: seated ? "상대" : "", name: theirs }, { label: seated ? "나" : "", name: ours }] }, [[ms(700), {}]]);
}
/* the end (DESIGN.md "Battle", The big moments): the match board over the arena, the camera holding wide. The Pokémon each side knocked
   out switch on, then the winner's row inverts with 승리 and the loser's dims (a tie dims both); it stands a moment and goes */
export async function final(stage, { players, sides, turn, winner, perspective, seated = false }) {
  const over = overOf(stage);
  if (!over || instant()) return;
  const them = perspective === "p1" ? "p2" : "p1";
  const knocked = side => Object.values(sides[side === "p1" ? "p2" : "p1"]?.team || {}).filter(m => m.fainted).length;
  const row = (side, label) => ({ label: seated ? label : "", name: players[side] || "", score: knocked(side) });
  const rows = [row(them, "상대"), row(perspective, "나")];
  const sideAt = i => (i ? perspective : them);
  // seated, the label keeps who the row is before the result (나, 승리), so the end still says which side is yours
  const said = (r, word) => (r.label ? `${r.label}, ${word}` : word);
  const decided = rows.map((r, i) => winner === "tie" || !winner ? { ...r, label: said(r, "무승부"), lost: true }
    : { ...r, label: said(r, sideAt(i) === winner ? "승리" : "패배"), won: sideAt(i) === winner, lost: sideAt(i) !== winner });
  sfx(winner === "tie" || !winner ? "draw" : !seated || winner === perspective ? "win" : "lose", { at: 580 });
  await playBoard(over, { say: `종료, ${turn}턴`, rows: rows.map(r => ({ ...r, score: null })) },
    [[ms(160), { rows }], [ms(420), { rows: decided, done: true }], [ms(1600), {}]]);
}
/* sent in: the ball opens in a burst of light, a column of it rises, the Pokémon grows out of it white and settles into its colours */
// cry: called as it appears; the entrance lasts until the cry has been heard
export async function enter(stage, key, { ball = true, cry = null } = {}) {
  const e = E(stage);
  if (!e || instant()) return;
  e.sync();
  const a = actorOf(stage, key);
  if (!a) return;
  e.cancel(a);
  a.base.alpha = 0;
  await Promise.all([a.ready, ball && !reduced() ? throwBall(stage, key) : null]);
  a.base.alpha = 1;
  if (ball) sfx("ballOpen", { pan: panOf(e, centre(stage, key)) });
  const heard = cry?.();
  if (reduced()) { await Promise.all([e.anim(a, { alpha: [0, 1] }, { dur: 260 }), heard]); return; }
  const at = centre(stage, key, .45), s = sizeOf(stage, key), feet = centre(stage, key, 0);
  glow(e, at, s * 1.2, "normal", { dur: 420, ramp: "white", alpha: .6 });
  glow(e, at, s * 2.2, "normal", { dur: 600, ramp: "blue", alpha: .3 });
  sparks(e, at, 18, "normal", { ramp: "white", speed: [s * 2, s * 4.5], len: [6, 12] });
  e.emit({ n: 12, at, r: s * .3, tex: "spark", ramp: "blue", size: [s * .18, 0], life: [400, 700], delay: 80 });
  e.emit({ at: [feet[0], feet[1] - s * .6], tex: "streak", ramp: "white", size: [s * .9, s * .9], aspect: .3, rot: Math.PI / 2, life: 520, alpha: .7 });
  ring(e, feet, s * 1.8, "normal", { flat: .26, dur: 640, ramp: "blue", layer: 0, delay: 100 });
  shock(e, at, s * 2.2, { dur: 500 });
  await Promise.all([e.anim(a, { sx: [.35, 1.08, 1], sy: [.35, 1.08, 1], flash: [2, .8, 0], alpha: [0, 1, 1], rimA: [1, .6, 0] }, { dur: 540, at: [0, .55, 1], eases: ["out", "inout"] }), heard]);
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
  sfx(drag ? "drag" : "recall", { pan: panOf(e, at) });
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
    // the ball's red (1, .16, .2) and a pink-red rim (colour channels are set, gl.js ASSIGN)
    tintR: [1, 1], tintG: [.16, .16], tintB: [.2, .2], tintA: [0, .82, .94, .96],
    rimR: [1, 1], rimG: [.42, .42], rimB: [.42, .42], rimA: [0, .7, .8, .8],
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
/* Mega Evolution, as the games play it (2026-11-06 remake, the user: "원작과 거의 똑같이, 고퀄리티로"). The stage goes dark round it;
   from its trainer's corner (the Key Stone) two strands of rainbow light twist round each other as a helix and fly into the Pokémon,
   where its Mega Stone flares in a four-rayed star. The Pokémon whites out inside a cocoon of light, a glossy sphere lit from the upper
   left as the HOME renders are, its rim turning through the rainbow, and the Mega Evolution emblem (the user's image, drawn as given)
   rises on it while it swells twice. megaEnd breaks the cocoon: the stadium flashes once, shards of rainbow light fly out with a
   shockwave and a ring across the floor, and the new form stands lit, settling to its own colours as it roars (Stage.jsx plays the cry) */
let cocoonCanvas = null, emblemImg = null;
function paintCocoon() {
  // 2026-11-07, from Pokémon Champions: a ball wound in bands of light, white, pale cyan, lavender and violet sweeping round it the way
  // the cocoon hides the Pokémon; the bands are densest at the middle, the ball's edge soft, a gloss up on the left. No rainbow rim.
  const N = 256, C = N / 2, c = Object.assign(document.createElement("canvas"), { width: N, height: N }), g = c.getContext("2d"), R = C * .94;
  g.save(); g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.clip();
  let gr = g.createRadialGradient(C, C, 0, C, C, R);
  gr.addColorStop(0, "rgba(246,242,255,.95)"); gr.addColorStop(.6, "rgba(196,180,255,.85)"); gr.addColorStop(1, "rgba(120,96,230,.7)");
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  const BANDS = ["#FFFFFF", "#CFEFFF", "#A88CFF", "#F2ECFF", "#86D8FF", "#8A66F0", "#FFFFFF", "#BFA8FF", "#DFF6FF"];
  BANDS.forEach((col, i) => {
    const y = C + (i - (BANDS.length - 1) / 2) * R * .22, bend = (i % 2 ? 1 : -1) * R * .18;
    g.globalAlpha = .55 + .3 * (1 - Math.abs(i - 4) / 4); g.strokeStyle = col; g.lineWidth = R * (.1 + .06 * ((i * 7) % 3)); g.lineCap = "round";
    g.beginPath(); g.moveTo(C - R * 1.1, y + bend * .6); g.bezierCurveTo(C - R * .4, y - bend, C + R * .4, y + bend, C + R * 1.1, y - bend * .6); g.stroke();
  });
  g.globalAlpha = 1; g.restore();
  // the edge thins out into the dark, so the ball has no drawn outline
  gr = g.createRadialGradient(C, C, R * .82, C, C, R);
  gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out"; g.fillStyle = gr; g.beginPath(); g.arc(C, C, R, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = "source-over";
  gr = g.createRadialGradient(C * .62, C * .5, 0, C * .62, C * .5, C * .34);
  gr.addColorStop(0, "rgba(255,255,255,.8)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.beginPath(); g.ellipse(C * .62, C * .5, C * .34, C * .2, -.6, 0, Math.PI * 2); g.fill();
  return c;
}
const megaTex = e => {
  if (!e.megaTex) {
    cocoonCanvas ||= paintCocoon();
    e.megaTex = { cocoon: upload(e.gl, cocoonCanvas), emblem: null };
    if (!emblemImg) { emblemImg = new Image(); emblemImg.src = `${import.meta.env?.BASE_URL ?? "/"}brand/mega-evolution.png`; }
    const take = () => { if (e.megaTex && !e.megaTex.emblem && emblemImg.naturalWidth) e.megaTex.emblem = upload(e.gl, emblemImg); };
    if (emblemImg.complete) take(); else emblemImg.addEventListener("load", take, { once: true });
  }
  return e.megaTex;
};
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
export async function megaStart(stage, key) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return;
  const at = centre(stage, key), s = sizeOf(stage, key), { W, H } = e, own = ownKey(stage, key), tex = megaTex(e);
  a.lit = true;
  sfx("megaStart", { pan: panOf(e, at) });
  e.anim(e.grade, { dim: [1, .22] }, { dur: 500, fill: true }).then(() => {});
  e.megaDim = true;
  e.shot(at[0], at[1], 1.25, { smooth: .5 });
  // the Key Stone's light: two strands twisting round each other from the trainer's corner into the Mega Stone
  const from = own ? [-W * .04, H * 1.04] : [W * 1.04, -H * .04], dx = at[0] - from[0], dy = at[1] - from[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  const FLY = 640, N = 70;
  for (const phase of [0, Math.PI]) for (let i = 0; i <= N; i++) {
    const t = i / N, amp = s * .2 * Math.sin(Math.PI * Math.min(1, t * 1.15)), w = Math.sin(t * Math.PI * 5 + phase) * amp;
    e.emit({ at: [from[0] + dx * t + nx * w, from[1] + dy * t + ny * w], tex: "glow", ramp: "rainbow", size: [s * .2, s * .09], life: 560, delay: t * FLY, alpha: 1, emis: 1 });
    if (i % 2 === 0) e.emit({ at: [from[0] + dx * t, from[1] + dy * t], tex: "glow", ramp: "white", size: [s * .14, s * .04], life: 360, delay: t * FLY, alpha: .8 });
  }
  // the Mega Stone flares where the strands meet
  const stone = [at[0], at[1] - s * .05];
  e.emit({ at: stone, tex: "glint", ramp: "glint", size: [s * .2, s * 1.1], life: 620, delay: FLY - 40, grow: true, emis: 1 });
  e.emit({ at: stone, tex: "glow", ramp: "rainbow", size: [s * .3, s * 1.2], life: 700, delay: FLY - 40, alpha: .7, grow: true });
  // the light it gathers: motes of every colour spiral in while it whites out
  for (let i = 0; i < 54; i++) {
    const ang = i / 54 * Math.PI * 6, r = s * rand(1.1, 1.7), st = [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r * .8], life = rand(420, 640);
    e.emit({ at: st, vel: [(at[0] - st[0]) / life * 1000, (at[1] - st[1]) / life * 1000], tex: "glow", ramp: "rainbow", size: [s * .1, s * .03], life, delay: FLY + i * 12, emis: 1 });
  }
  // the cocoon: it grows round the Pokémon, swells twice, and holds until megaEnd breaks it (or gives up on its own)
  const t0 = e.T + FLY + 120, m = { burst: Infinity };
  e.mega = m;
  const R = s * 1.5;
  e.sprites.push({ tex: tex.cocoon, at: T => {
    const t = T - t0;
    if (t > 5000 || T > m.burst + 260) return null;
    if (t < 0) return { x: at[0], y: at[1], w: 0, h: 0, alpha: 0 };
    const swell = 1 + .05 * Math.sin(Math.max(0, t - 420) / 330 * Math.PI * 2) * (t > 420 ? 1 : 0);
    const k = T > m.burst ? 1 + (T - m.burst) / 260 * .5 : easeOut(t / 420) * swell;
    const al = T > m.burst ? 1 - (T - m.burst) / 260 : Math.min(1, t / 240) * .92;
    return { x: at[0], y: at[1], w: R * k, h: R * k * 1.06, alpha: al, rot: Math.sin(t / 900) * .25 };
  } });
  e.sprites.push({ tex: tex.cocoon, at: T => {
    if (T - t0 > 5000 || T > m.burst + 420) return null;
    const t = T - t0 - 380;
    if (t < 0 || !tex.emblem) return { x: at[0], y: at[1], w: 0, h: 0, alpha: 0 };
    const k = T > m.burst ? 1 + (T - m.burst) / 420 * .8 : easeOut(t / 300) * (1 + .06 * Math.sin(t / 330 * Math.PI * 2));
    const al = T > m.burst ? 1 - (T - m.burst) / 420 : Math.min(1, t / 200);
    const h = s * .62 * k;
    return { tex: tex.emblem, x: at[0], y: at[1], w: h * 185 / 225, h, alpha: al };
  } });
  // (2026-11-07, from Pokémon Champions: no rings; ribbons of white, cyan and violet light keep winding round the ball while it holds,
  // and long streaks sweep past it on both sides)
  const COLS = ["#FFFFFF", "#9FE2FF", "#B08CFF", "#E4D8FF"];
  for (let k = 0; k < 9; k++) e.at(FLY + 200 + k * 420, () => {
    if (e.T > m.burst) return;
    for (let i = 0; i < 3; i++) { const tilt = rand(-.45, .45), ph = rand(0, 6.28), ry = R * rand(.12, .26), yy = rand(-.25, .25) * R; pathStrip(e, u => { const th = ph + u * Math.PI * 2.2; return [at[0] + Math.cos(th) * R * .52, at[1] + yy + Math.sin(th) * ry + Math.cos(th) * R * .52 * tilt]; }, { color: COLS[(k + i) % 4], width: rand(6, 12), dur: 520, mode: 2, head: .35, tailLag: .4, n: 40, emis: .9 }); }
    for (const sg of [-1, 1]) e.emit({ n: 2, at: [at[0] + sg * R * .9, at[1] + rand(-.3, .3) * R], vel: [sg * R * 3, 0], tex: "streak", ramp: "white", face: true, size: [5, 3], aspect: [30, 50], life: 260, alpha: .8 });
  });
  // the Pokémon goes into the light (not white: its picture fades inside the ball)
  await e.anim(a, { alpha: [1, 1, .12, .12], rimA: [0, .9, .9, .9], rimR: [.75, .75], rimG: [.62, .62], rimB: [1, 1] }, { dur: FLY + 1100, at: [0, FLY / (FLY + 1100), .75, 1], fill: true, ease: "inout" });
}
export async function megaEnd(stage, key) {
  const e = E(stage);
  if (!e) return;
  e.sync();
  const a = actorOf(stage, key);
  if (a) { e.cancel(a); a.lit = false; }
  if (e.megaDim) { e.cancel(e.grade); e.megaDim = false; }
  if (e.mega) { e.mega.burst = e.T; e.mega = null; }
  if (instant() || !a) return;
  const at = centre(stage, key), s = sizeOf(stage, key);
  sfx("megaEnd");
  // (2026-11-07, from Pokémon Champions: the ball bursts in a short lavender flash, not a white page; the new form stands posed before a
  // violet field of sparkles with two great arcs of light sweeping behind it; no ring on the floor and no white stars)
  flashStage(stage, .3, 360, "#E6DCFF");
  const { W, H } = e;
  e.emit({ at, tex: "glow", ramp: "magenta.h", size: [s * 1.6, s * 3.4], life: 1100, alpha: .32, layer: 0, grow: true });
  for (const ramp of ["white.h", "magenta.h", "guard"]) e.emit({ n: 24, at: () => [rand(0, 1) * W, rand(0, 1) * H], tex: "dot", ramp, vel: () => [rand(-12, 12), rand(-20, 4)], size: [[s * .015, s * .04], 0], life: [700, 1200], over: 400, emis: 1 });
  for (const [col, a0, d] of [["#B08CFF", -.5, 0], ["#7FE0C8", .6, 90]]) pathStrip(e, u => { const th = a0 + Math.PI * (.2 + u * 1.1); return [at[0] + Math.cos(th) * s * 1.25, at[1] + Math.sin(th) * s * .7]; }, { color: col, width: 14, dur: 700, delay: d, mode: 2, head: .4, tailLag: .5, n: 40, emis: .8 });
  e.emit({ n: 20, at, r: s * .35, tex: "crystal", lit: true, ramp: "ice.c", speed: [s * 2, s * 4.5], drag: 2.4, size: [[s * .05, s * .1], s * .02], aspect: .6, rot: "rand", spin: [-9, 9], life: [500, 800], emis: .5, occ: .6 });
  sparks(e, at, 24, "psychic", { ramp: "magenta.h", speed: [s * 2.5, s * 6], len: [10, 20] });
  shock(e, at, s * 3.4, { dur: 640 });
  e.shake(.4);
  await Promise.all([e.anim(a, { alpha: [.12, 1, 1], flash: [.45, .1, 0], rimR: [.75, .75], rimG: [.62, .62], rimB: [1, 1], rimA: [1, .7, 0], sx: [1.12, 1], sy: [1.12, 1] }, { dur: 900, at: [0, .25, 1] }), e.anim(e.grade, { dim: [.22, 1] }, { dur: 900 })]);
  e.wide(.6);
}
// a stat change: arrows rise (warm) or fall (cold) through it in columns, a band of light passing the same way
export function boost(stage, key, amount) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant() || !amount) return Promise.resolve();
  const up = amount > 0, [x, y] = centre(stage, key, .45), s = sizeOf(stage, key), n = Math.min(3, Math.abs(amount)) * 5;
  const ramp = up ? "fire.h" : "water.h";
  sfx(up ? "statUp" : "statDown", { n: Math.abs(amount), pan: panOf(e, [x, y]) });
  e.emit({ n, at: () => [x + rand(-.42, .42) * s, y + (up ? s * .5 : -s * .5)], vel: [0, (up ? -1 : 1) * s * 1.6], tex: "chevron", ramp, size: [s * .12, s * .12], rot: up ? 0 : Math.PI, life: 620, over: 360, emis: .9, occ: .3 });
  // (round 3: the glow is held red-orange behind it; the "fire" light ramp opens white and lay a white sheet over the body)
  e.emit({ at: [x, y], tex: "glow", ramp: up ? "fire.h" : "water.h", size: [s * 1.2, s * 1.3], aspect: 1.1, life: 600, alpha: .2, layer: 0 });
  return e.anim(a, { rimR: up ? [1, 1] : [.4, .4], rimG: up ? [.45, .45] : [.7, .7], rimB: up ? [.2, .2] : [1, 1], rimA: [0, .9, 0], bright: [1, up ? 1.07 : .9, 1] }, { dur: 700 });
}
export function status(stage, key, id) {
  const e = E(stage);
  if (!e || instant() || !actorOf(stage, key)) return Promise.resolve();
  // the status shows in its own matter on the Pokémon (flames, crystals, bubbles), with no ring round it
  return Promise.all([ailment(stage, key, id), flashMon(stage, key, .5)]);
}
// Protect and its kin: a sphere of hexagonal panels closes round it, a glint crossing it; the guards that hurt show their teeth
const GUARD_TYPE = { protect: "grass", detect: "fighting", kingsshield: "steel", spikyshield: "grass", banefulbunker: "poison", silktrap: "bug", burningbulwark: "fire", obstruct: "dark", wideguard: "rock", quickguard: "fighting", maxguard: "normal" };
export function shield(stage, key, id = "protect") {
  const e = E(stage);
  if (!e || instant() || !actorOf(stage, key)) return Promise.resolve();
  const at = centre(stage, key), s = sizeOf(stage, key) * 1.5, t = GUARD_TYPE[id] || "grass";
  sfx("protect", { pan: panOf(e, at), spiky: /spiky|kings|baneful|bulwark|obstruct/.test(id) });
  // 2026-11-07, matched to Scarlet and Violet: Protect is a pale sky-blue ball of hexagonal panes sinking to a deep blue violet at its
  // rim; its kin keep the ball in their own colour
  const pane = id === "protect" ? "guard" : `${t}.h`, rim = id === "protect" ? "guard.rim" : `${t}.h`;
  e.emit({ at, tex: "glow", ramp: rim, size: [s * .8, s * 1.15], life: 900, alpha: .45, layer: 0, grow: true });
  e.emit({ at, tex: "hexball", ramp: pane, size: [s * .72, s * 1.02], life: 900, alpha: .7, emis: 1, grow: true });
  e.emit({ at, tex: "bubble", ramp: rim, size: [s * .74, s * 1.04], life: 900, alpha: .5, emis: 1, grow: true });
  if (/spiky|kings|baneful|bulwark|obstruct/.test(id)) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; e.emit({ at: [at[0] + Math.cos(a) * s * .5, at[1] + Math.sin(a) * s * .5], tex: "shard", ramp: `${t}.h`, size: [s * .04, s * .16], aspect: .45, rot: a + Math.PI / 2, life: 600, delay: 100 + i * 15, emis: .9, grow: true }); }
  return e.after(900);
}
// an ability or an item announced: a plate slides in on its owner's side
export function popup(stage, key, owner, name, own) {
  const over = overOf(stage);
  if (!over || instant()) return Promise.resolve();
  sfx(/도구$/.test(owner) ? "item" : "ability", { pan: own ? -.4 : .4 });
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
// a pale type's rim is drawn in a deeper tone of it, so the outline reads as its colour and not as white
const RIM_OF = { normal: "#F0B830", steel: "#7F93B8", flying: "#6F9CFF", rock: "#B89A4A", ice: "#4FC0F0", ground: "#C8964A", fairy: "#FF6FC8" };
export function charge(stage, key, type, duration = 420) {
  const e = E(stage);
  if (!e || instant()) return Promise.resolve();
  const at = centre(stage, key), s = sizeOf(stage, key), t = typeId(type), D = duration;
  sfx("charge", { type: t, dur: D, pan: panOf(e, at) });
  for (let i = 0; i < 26; i++) {
    const ang = rand(0, Math.PI * 2), r = s * rand(.8, 1.3), st = [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r], life = D * rand(.45, .7);
    e.emit({ at: st, vel: [(at[0] - st[0]) / life * 1000, (at[1] - st[1]) / life * 1000], tex: "streak", ramp: t, face: true, size: [3, 1.5], aspect: 6, life, delay: rand(0, D - life), emis: 1 });
  }
  // 2026-11-07: no ring round it (a flat circle read as a sign); the light is drawn in as lit motes and swells into a sphere at its heart
  // (round 3: motes, not four-rayed glints; a ring of glints over a pale type read as white stars)
  e.emit({ n: 16, at: () => { const ang = rand(0, Math.PI * 2), r = s * rand(.7, 1.1); return [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r * .8]; }, tex: "dot", ramp: `${t}.h`, size: [s * .03, s * .05], life: D * .6, over: D * .35, emis: 1 });
  e.emit({ at, tex: "glow", ramp: `${t}.h`, size: [s * .1, s * .6], life: D + 120, alpha: .2, grow: true });
  e.emit({ at, tex: "orb", lit: true, ramp: `${t}.h`, size: [s * .04, s * .2], life: D + 120, occ: .3, emis: .9, grow: true });
  e.emit({ at, tex: "dot", ramp: "white.h", size: [s * .02, s * .05], life: D + 120, alpha: .5, grow: true });
  e.at(D * .85, () => { e.emit({ at, tex: "spark", ramp: `${t}.m`, size: [s * .2, s * .8], rot: rand(0, Math.PI), life: 200, alpha: .7, grow: true }); });
  const a = actorOf(stage, key), c = RIM_OF[t] || colorOf(t), [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  if (a) e.anim(a, { rimR: [r, r], rimG: [g, g], rimB: [b, b], rimA: [0, .9, 0] }, { dur: D + 200 });
  return e.after(D);
}
// the type's light rising round the user (a cloak of flames, a shine of steel)
export function aura(stage, key, type, rounds = 1, duration = 600) {
  const e = E(stage), a = actorOf(stage, key);
  if (!e || !a || instant()) return Promise.resolve();
  const t = typeId(type), s = sizeOf(stage, key), [x, y] = centre(stage, key, .05), c = RIM_OF[t] || colorOf(t), [r, g, b] = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  sfx("aura", { type: t, dur: duration, pan: panOf(e, [x, y]) });
  if (t === "fire") fire(e, [x, y], s, Math.round(14 * rounds), { r: [.38, .06], up: 1.3, size: [.14, .3], over: duration * .7, embers: false });
  else if (["steel", "rock", "ground", "bug"].includes(t)) {
    // (2026-11-07 round 3) stone and metal rise off it as lit chips of their matter; white flames of their pale colour read as a white-out
    e.emit({ n: 14 * rounds, at: [x, y], r: [s * .4, s * .06], tex: "chip", lit: true, ramp: { steel: "steel.c", rock: "stone", ground: "earth", bug: "bug.m" }[t], vel: () => [rand(-14, 14), -rand(s * .7, s * 1.2)], size: [[s * .05, s * .1], "same"], rot: "rand", spin: [-5, 5], life: [500, 800], over: duration * .7, occ: 1, emis: .15 });
  } else if (t === "flying" || t === "normal" || t === "electric") {
    e.emit({ n: 16 * rounds, at: [x, y], r: [s * .42, s * .1], tex: "streak", ramp: t === "normal" ? "gold" : t, vel: () => [rand(-6, 6), -rand(s * 1.4, s * 2.2)], face: true, size: [3, 2], aspect: [10, 18], life: [300, 460], over: duration * .7 });
  } else {
    const tex = t === "water" ? "bubble" : t === "grass" ? "leaf" : t === "electric" ? "glint" : t === "ice" ? "crystal" : "flame", lit = tex === "bubble" || tex === "leaf" || tex === "crystal";
    e.emit({ n: 22 * rounds, at: [x, y], r: [s * .38, s * .06], tex, lit, ramp: tex === "leaf" ? "leaf.c" : tex === "bubble" ? "water.l" : tex === "crystal" ? "ice.c" : `${t}.h`, vel: () => [rand(-10, 10), -rand(s * .9, s * 1.6)], size: [[s * .1, s * .18], s * .03], life: [500, 800], over: duration * .7, erode: tex === "flame" ? .55 : 0, emis: lit ? .5 : 1, occ: lit ? .8 : 0 });
  }
  // 2026-11-07: a soft rim of its colour, no flash (a full rim and a flash read as the body turning white)
  return e.anim(a, { rimR: [r, r], rimG: [g, g], rimB: [b, b], rimA: [0, .55, .4, 0] }, { dur: duration, at: [0, .3, .7, 1] });
}
// the user dashes to its target and back; the promise is the instant it strikes
function lunge(stage, from, to, type, { quick = false, short = false, dur = null, arc = 0, spin = 0 } = {}) {
  const e = E(stage), a = actorOf(stage, from);
  if (!e || !a || reduced()) return wait(200);
  const [ax, ay] = centre(stage, from), [bx, by] = centre(stage, to), k = short ? .45 : .78, dx = (bx - ax) * k, dy = (by - ay) * k;
  const D = dur || (quick ? 440 : 640), strike = .42;
  sfx("dash", { dur: D * strike, pan: panOf(e, [ax, ay]) });
  a.trail = true; a.hist = []; a.ghostColor = colorOf(typeId(type));
  e.anim(a, { ghost: [0, 0, 1, 1, 0] }, { dur: D, at: [0, .18, .3, .5, .7] });
  // lines of speed streaming back off it as it dashes, in its type's light
  for (let i = 0; i < 6; i++) e.at(D * (.18 + i * .04), () => { const [x, y] = [ax + a.st.x, ay + a.st.y], s = sizeOf(stage, from); e.emit({ n: 4, at: [x, y], r: [s * .45, s * .4], vel: [-(bx - ax) * 1.2, -(by - ay) * 1.2], tex: "streak", ramp: typeId(type), face: true, size: [3, 2], aspect: [12, 22], life: 200, alpha: .75 }); });
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
  sfx("quake", { pan: panOf(e, [x, y]) });
  for (let i = 0; i < 7; i++) { const at = [rand(.1, .9) * W, rand(.46, .98) * H], f = clamp(.18 + (at[1] / H - .42) * .55, .16, .5); e.emit({ at, tex: "crack", ramp: e.light ? "ink" : "dust", size: [W * .22 * f, W * .26 * f], aspect: 1 / f, life: 1600, delay: i * 60, occ: .9, emis: e.light ? 0 : .3, alpha: .9, layer: 0, grow: true }); }
  stamp(e, [x, y], s, 1.6);
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
  setMoveType(typeId(type));
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
  sfx("miss", { pan: panOf(e, centre(stage, key)) });
  a.trail = true; a.hist = [];
  return e.anim(a, { x: [0, d, d, 0], ghost: [0, 1, 1, 0] }, { dur: 460, at: [0, .3, .55, 1], eases: ["out", "linear", "inout"] }).then(() => { a.trail = false; });
}

/* the kit every move's recipe (moveFx.js) is drawn with */
const kit = {
  E, centre, sizeOf, unitOf, actorOf, ownKey, rand, lerp, clamp, times, around, typeId, colorOf,
  glow, ring, shock, sparks, smoke, dust, fire, splash, glints, stamp, beamStrip, boltStrip, slashStrip, pathStrip, orbs, DEBRIS, MARK, bladeOf,
  burst, hit, charge, aura, lunge, quake, dodge, flashMon, flashStage, darken, heal, boost, ailment, sway, morph, leave, shake: shakeOf, wait, reduced,
};
const DRAW = makeDraw(kit);
