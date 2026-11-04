/* 배틀 무대의 연출 (DESIGN.md "Battle", The stage). 무대(Stage.jsx) 위에서 기술, 피격, 등장, 쓰러짐, 메가진화, 능력 변화를 Web Animations로 그린다.
   무대의 장면만 보드의 규칙에서 물러나 날아가고 터지고 흔들린다. 그 위에 뜨는 말(턴, 급소, 숫자, 특성)은 보드의 판(battle.css)이고,
   색은 보드의 색과 타입 색뿐이다. 세기는 쇼다운만큼 절제한다: 흔들림은 작게, 번쩍임은 옅게.
   모든 연출은 끝나지 않아도 정해진 시간 뒤에는 넘어간다: 숨은 페이지는 애니메이션 시계를 멈춘다.
   speed: 1 보통, .5 빠르게, 0 건너뛰기(연출 없이 상태만). */
import { reduced } from "../../components/common/motion.js";

let speed = 1;
export const setSpeed = s => { speed = s; };
export const instant = () => speed === 0;
const ms = n => Math.max(1, n * (speed || 0));
const OUT = "cubic-bezier(.22,1,.36,1)";
const IN = "cubic-bezier(.5,0,.75,0)";

// an animation that is done when it finishes, or when it would have, whichever comes first
function done(anim) {
  if (!anim?.finished) return Promise.resolve();
  const t = anim.effect?.getComputedTiming?.().endTime || 400;
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(resolve, t + 120); });
  return Promise.race([anim.finished, late]).catch(() => {}).finally(() => clearTimeout(timer));
}
export const wait = n => (instant() ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms(n))));
// what is left of n after `since` (a performance.now()): a line's reading time runs while its effect plays, not after it
export const hold = (since, n) => (instant() ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, Math.max(0, ms(n) - (performance.now() - since)))));
// the script's own animations on an element (never the CSS idle, which a cancel would stop for good)
const settle = el => el?.getAnimations?.().forEach(a => { if (!(typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation)) a.cancel(); });

/* ---------- where things stand on the stage ---------- */
const stageOf = el => el?.closest(".bs-stage");
const fxOf = stage => stage?.querySelector(".bs-fx");
const slotEl = (stage, key) => stage?.querySelector(`[data-mon="${key}"]`);
const monEl = (stage, key) => slotEl(stage, key)?.querySelector(".bs-mon");
// the centre of a Pokémon's picture (or of its slot) in the stage's own pixels
function centre(stage, key, lift = .45) {
  const box = stage.getBoundingClientRect();
  const el = monEl(stage, key) || slotEl(stage, key);
  if (!el) return [box.width / 2, box.height / 2];
  const r = el.getBoundingClientRect();
  return [r.left - box.left + r.width / 2, r.top - box.top + r.height * (1 - lift)];
}
const sizeOf = (stage, key) => monEl(stage, key)?.getBoundingClientRect().width || 80;

// a shape on the effect layer; at a point, or where its own class places it (a banner, a plate) when there is none
function spawn(stage, className, at, style = {}) {
  const fx = fxOf(stage);
  if (!fx) return null;
  const el = document.createElement("i");
  el.className = className;
  Object.assign(el.style, at ? { left: `${at[0]}px`, top: `${at[1]}px` } : {}, style);
  fx.appendChild(el);
  return el;
}
const play = (el, frames, options) => (el ? done(el.animate(frames, { fill: "both", ...options, duration: ms(options.duration), delay: ms(options.delay || 0) })) : Promise.resolve());
const vanish = (el, frames, options) => play(el, frames, options).then(() => el?.remove());
const typeClass = type => `type-${String(type || "normal").toLowerCase()}`;

/* ---------- the stage itself ---------- */
export function shake(stage, power = 1) {
  const el = stage?.querySelector(".bs-world");
  if (!el || instant() || reduced()) return Promise.resolve();
  const p = 3 * power;
  return play(el, [{ transform: "none" }, { transform: `translate(${-p}px, ${p / 2}px)` }, { transform: `translate(${p}px, ${-p / 2}px)` }, { transform: `translate(${-p / 2}px, ${p / 3}px)` }, { transform: `translate(${p / 3}px, 0)` }, { transform: "none" }], { duration: 320, easing: "linear", fill: "none" });
}
export function flashStage(stage, peak = .35, duration = 360) {
  if (!stage || instant()) return Promise.resolve();
  const el = spawn(stage, "bt-fx-flash", [0, 0]);
  return vanish(el, [{ opacity: 0 }, { opacity: peak, offset: .2 }, { opacity: 0 }], { duration, easing: "ease-out" });
}
// a word across the stage: 3턴, 승리
export function banner(stage, text, { tone = "" } = {}) {
  if (!stage || instant()) return Promise.resolve();
  const el = spawn(stage, `bt-banner ${tone}`);
  el.textContent = text;
  return vanish(el, [
    { opacity: 0, transform: "translate(-50%, -50%) translateY(12px)" },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .25, easing: OUT },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .8 },
    { opacity: 0, transform: "translate(-50%, -50%)" },
  ], { duration: tone === "win" ? 1600 : 760, easing: "linear" });
}
// a word over a Pokémon: 급소, 효과가 굉장하다, 빗나감
// tone: "hard" lit (급소, 효과가 굉장하다), "soft" dim (효과가 별로, 빗나감)
// the words of one blow land together, so a second word over the same Pokémon stands one plate above the first
const words = {};
export function label(stage, key, text, tone = "") {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .25);
  const n = words[key] = (words[key] || 0) + 1;
  const el = spawn(stage, `bt-word ${tone}`, [x, Math.max(12, y - 32 - (n - 1) * 26)]);
  el.textContent = text;
  return vanish(el, [
    { opacity: 0, transform: "translate(-50%, -50%) translateY(12px)" },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .2, easing: OUT },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .75 },
    { opacity: 0, transform: "translate(-50%, -50%) translateY(-12px)" },
  ], { duration: 900 }).then(() => { words[key] -= 1; });
}

/* ---------- a move ---------- */
// a ring that opens and goes out where a blow lands, and the type's shards thrown out of it; how hard is `power` (a critical or
// super effective blow is larger, a resisted one smaller)
export function burst(stage, key, type, power = 1, { shards = true } = {}) {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key);
  const size = sizeOf(stage, key);
  const ring = spawn(stage, `bs-ring ${typeClass(type)}`, [x, y], { width: `${size * .5}px`, height: `${size * .5}px` });
  const runs = [vanish(ring, [{ opacity: 1, transform: "translate(-50%, -50%) scale(.2)" }, { opacity: 0, transform: `translate(-50%, -50%) scale(${2.2 * power})` }], { duration: 420, easing: OUT })];
  const count = shards ? Math.round(8 * power) : 0;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * .5;
    const d = size * (.45 + Math.random() * .35) * power;
    const p = spawn(stage, `bs-p ${typeClass(type)}`, [x, y]);
    runs.push(vanish(p, [
      { opacity: 1, transform: `translate(-50%, -50%) rotate(${a}rad) scale(1.2)` },
      { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) rotate(${a + 2}rad) scale(.3)` },
    ], { duration: 460 + Math.random() * 160, easing: OUT }));
  }
  return Promise.all(runs);
}

/* How each type's move travels: one small table, not a case per move. Every flight is the head and a trail of the type's shards
   along one path, sampled densely so it never shows a corner.
   arc: the path's middle rises by this share of the distance; wave and waves: a weave across the path (its depth as a share of the
   distance, and how many times); zig: a bolt's jagged line, every shard on the same one; spin: turns over the flight (orient:
   each shard points the way it goes instead); grow: the shards swell as they go (an orb, a pulse); twinkle: they glint; gap: ms
   between shards; beam: one line drawn from the user to the target at once. */
const FLIGHT = {
  Normal: { count: 6, ms: 360 },
  Fire: { arc: .16, count: 9, ms: 420, wave: .03, waves: 3 },
  Water: { arc: .05, count: 11, ms: 380, gap: 22, wave: .04, waves: 2 },
  Electric: { zig: .16, count: 10, ms: 240, gap: 14, spin: 0 },
  Grass: { wave: .12, waves: 1.5, count: 7, ms: 520, spin: 540 },
  Ice: { beam: true },
  Fighting: { count: 3, ms: 360, grow: 1.7, gap: 50 },
  Poison: { arc: .34, count: 6, ms: 520 },
  Ground: { arc: .3, count: 6, ms: 480 },
  Flying: { count: 5, ms: 260, orient: true, gap: 40 },
  Psychic: { wave: .07, waves: 1.5, count: 5, ms: 520, grow: 1.8, gap: 60, spin: 0 },
  Bug: { wave: .1, waves: 3, count: 8, ms: 440 },
  Rock: { arc: .26, count: 6, ms: 460 },
  Ghost: { wave: .14, waves: 1, count: 5, ms: 620, gap: 60, spin: 0 },
  Dragon: { wave: .1, waves: 1, count: 9, ms: 480 },
  Dark: { wave: .06, waves: 2, count: 6, ms: 440 },
  Steel: { beam: true },
  Fairy: { arc: .2, count: 8, ms: 520, twinkle: true },
};
/* the few moves the current regulation sees most that a type alone would not draw: they keep their type's colour and shape and
   change only how they travel. rings: a sound, rings that swell as they go; fall: dropped from above the target; beam: a line */
const SIGNATURE = {
  hypervoice: { rings: true }, boomburst: { rings: true }, snarl: { rings: true }, bugbuzz: { rings: true }, overdrive: { rings: true },
  disarmingvoice: { rings: true }, alluringvoice: { rings: true }, psychicnoise: { rings: true }, sparklingaria: { rings: true }, torchsong: { rings: true },
  dracometeor: { fall: true }, thunder: { fall: true }, makeitrain: { fall: true }, rockslide: { fall: true }, blizzard: { fall: true }, meteorbeam: { beam: true },
  hyperbeam: { beam: true }, solarbeam: { beam: true }, flashcannon: { beam: true }, chargebeam: { beam: true }, psybeam: { beam: true }, aurorabeam: { beam: true },
  dazzlinggleam: { beam: true }, moonblast: { grow: 2, count: 3, gap: 60, arc: .1 }, aurasphere: { grow: 2.2, count: 3, arc: 0 }, shadowball: { grow: 1.8, count: 3, gap: 70 },
  hurricane: { wave: .16, waves: 2.5, count: 10, ms: 520 }, airslash: { orient: true, count: 4, gap: 60 }, energyball: { grow: 1.8, count: 3, gap: 60 },
  sludgebomb: { arc: .36, grow: 1.5, count: 4 }, icywind: { wave: .08, waves: 2, count: 10 }, electroweb: { zig: .1, count: 12 },
};
// powders fall on the target; every other status move at another drifts over as a few soft motes and leaves a ring, no shards
const POWDERS = new Set(["spore", "sleeppowder", "stunspore", "poisonpowder", "magicpowder", "cottonspore"]);
const QUAKES = new Set(["earthquake", "bulldoze", "magnitude", "earthpower", "highhorsepower", "stompingtantrum", "precipiceblades", "headlongrush"]);

const lerp = (a, b, t) => a + (b - a) * t;
// a cheap fixed noise for a bolt's jags: the same line for every shard of one bolt
const jag = j => { const v = Math.sin(j * 12.9898) * 43758.5453; return v - Math.floor(v); };

// the shards fly from one point to another; the promise is the impact (the head arriving), the trail still flying after it
function fly(stage, [ax, ay], [bx, by], type, style) {
  const { arc = 0, wave = 0, waves = 1, zig = 0, count = 7, ms: duration = 420, gap = 34, spin = 360, orient = false, grow = 0, twinkle = false, rings = false, past = false } = style;
  const dx = bx - ax, dy = by - ay, dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist, ny = dx / dist; // across the path
  const lift = -dist * arc * 2;
  const end = past ? 1.35 : 1; // a miss flies on past the target
  const pace = Math.min(1.2, Math.max(.55, dist / 160)); // a short way is a short flight, never a hover
  const STEPS = 18;
  const point = (t, i) => {
    const cx = (ax + bx) / 2, cy = (ay + by) / 2 + lift;
    let x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx;
    let y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by;
    const env = Math.sin(Math.PI * Math.min(1, t));
    const off = (wave ? Math.sin(t * Math.PI * 2 * waves + i * .9) * wave * dist : 0) * env + (zig ? (jag(Math.round(t * STEPS)) - .5) * 2 * zig * dist * env : 0);
    return [x + nx * off, y + ny * off];
  };
  const runs = [];
  for (let i = 0; i < count; i++) {
    const head = i === 0;
    const p = spawn(stage, rings ? `bs-ring ${typeClass(type)}` : `bs-p ${typeClass(type)}${head ? " head" : ""}`, [0, 0], rings ? { width: "28px", height: "28px" } : {});
    const s = rings ? 1 : head ? 1.7 : 1.4 - i * .1;
    const frames = Array.from({ length: STEPS + 1 }, (_, j) => {
      const t = (j / STEPS) * end;
      const [x, y] = point(t, i);
      const [x2, y2] = point(Math.min(t + .02, end), i);
      const turn = orient ? `${Math.atan2(y2 - y, x2 - x)}rad` : `${spin * t}deg`;
      const scale = rings ? lerp(.35, 1.6, t) : s * (grow ? lerp(.7, grow, t) : 1) * (twinkle ? (j % 3 === 1 ? 1.5 : .8) : 1);
      const fade = past && t > 1 ? Math.max(0, 1 - (t - 1) / (end - 1)) : rings ? lerp(1, .5, t) : j === STEPS && !head ? .2 : 1;
      return { offset: j / STEPS, opacity: j === 0 ? 0 : fade, transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${turn}) scale(${scale})` };
    });
    runs.push(vanish(p, frames, { duration: duration * pace * end, delay: i * gap, easing: "linear" }));
  }
  return runs[0];
}

// one line drawn from the user to the target at once, held a beat, then thinning out; the promise is the impact (the line reaching)
function beam(stage, [ax, ay], [bx, by], type, { past = false } = {}) {
  const dist = Math.hypot(bx - ax, by - ay) * (past ? 1.6 : 1);
  const el = spawn(stage, `bs-beam ${typeClass(type)}`, [ax, ay], { width: `${dist}px` });
  const turn = `rotate(${Math.atan2(by - ay, bx - ax)}rad)`;
  vanish(el, [
    { opacity: 1, transform: `translateY(-50%) ${turn} scaleX(0)`, easing: OUT },
    { opacity: 1, transform: `translateY(-50%) ${turn} scaleX(1)`, offset: .3 },
    { opacity: 1, transform: `translateY(-50%) ${turn} scaleX(1) scaleY(1)`, offset: .62, easing: IN },
    { opacity: 0, transform: `translateY(-50%) ${turn} scaleX(1) scaleY(.1)` },
  ], { duration: 460, easing: "linear" });
  return wait(140);
}

// shards dropped from above onto a point (Rock Slide, Draco Meteor, Make It Rain, Stealth Rock); the promise is the first landing
function fall(stage, [x, y], type, size, { count = 4, ms: duration = 380 } = {}) {
  const runs = Array.from({ length: count }, (_, i) => {
    const off = (i % 2 ? 1 : -1) * size * (.12 + (i * .37 % 1) * .3);
    const p = spawn(stage, `bs-p ${typeClass(type)} head`, [0, 0]);
    return vanish(p, [
      { opacity: 0, transform: `translate(${x + off * 1.6}px, ${y - size * 1.4}px) translate(-50%, -50%) rotate(0deg) scale(1.6)`, easing: IN },
      { opacity: 1, transform: `translate(${x + off * 1.2}px, ${y - size}px) translate(-50%, -50%) rotate(60deg) scale(1.6)`, offset: .25, easing: IN },
      { opacity: 1, transform: `translate(${x + off * .4}px, ${y}px) translate(-50%, -50%) rotate(220deg) scale(1.6)` },
    ], { duration, delay: i * 70, easing: "linear" });
  });
  return runs[0];
}

// a sound or a heat across the field: a flat ring opens from the user's feet over the whole court
function sweep(stage, from, type) {
  const [x, y] = centre(stage, from, .05);
  const size = sizeOf(stage, from);
  const el = spawn(stage, `bs-ring ${typeClass(type)}`, [x, y], { width: `${size}px`, height: `${size}px` });
  vanish(el, [{ opacity: .9, transform: "translate(-50%, -50%) scale(.3, .1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(5, 1.6)" }], { duration: 560, easing: OUT });
  return wait(200);
}

// a light gathers at the user before a special move leaves: a ring and a few motes drawn in, never a filled disc
export function charge(stage, key, type, duration = 300) {
  if (!stage || instant() || !monEl(stage, key)) return Promise.resolve();
  const [x, y] = centre(stage, key);
  const size = sizeOf(stage, key);
  const ring = spawn(stage, `bs-ring ${typeClass(type)}`, [x, y], { width: `${size * .9}px`, height: `${size * .9}px` });
  const runs = [vanish(ring, [{ opacity: 0, transform: "translate(-50%, -50%) scale(1.4)" }, { opacity: 1, transform: "translate(-50%, -50%) scale(.8)", offset: .5 }, { opacity: 0, transform: "translate(-50%, -50%) scale(.15)" }], { duration, easing: IN })];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + .6;
    const p = spawn(stage, `bs-p ${typeClass(type)}`, [x, y]);
    runs.push(vanish(p, [
      { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(a) * size * .6}px), calc(-50% + ${Math.sin(a) * size * .6}px))` },
      { opacity: 1, offset: .4 },
      { opacity: 0, transform: "translate(-50%, -50%) scale(.4)" },
    ], { duration, delay: i * 30, easing: IN }));
  }
  return Promise.all(runs);
}

// rings rise around a Pokémon: a move on itself
function aura(stage, key, type, rings = 3, duration = 620) {
  const [x, y] = centre(stage, key, .02);
  const size = sizeOf(stage, key);
  return Promise.all(Array.from({ length: rings }, (_, i) => {
    const el = spawn(stage, `bs-aura ${typeClass(type)}`, [x, y], { width: `${size * .9}px`, height: `${size * .28}px` });
    return vanish(el, [{ opacity: 0, transform: "translate(-50%, -50%) translateY(0) scale(.6)" }, { opacity: .9, offset: .3 }, { opacity: 0, transform: `translate(-50%, -50%) translateY(${-size * .8}px) scale(1.1)` }], { duration, delay: i * 120, easing: OUT });
  }));
}

/* the user's picture travels toward its target and back (a physical move): wind back (out), dash (in, fast), a beat on the blow
   (the impact frame), then home (in and out). A priority move dashes with no wind-up. `short` stops at a guard. The promise is
   the contact; the way home goes on while the blow lands. */
function lunge(stage, from, to, { quick = false, short = false } = {}) {
  const el = monEl(stage, from);
  if (!el || reduced()) return Promise.resolve();
  const [ax, ay] = centre(stage, from);
  const [bx, by] = centre(stage, to);
  const reach = short ? .4 : .62;
  const dx = (bx - ax) * reach, dy = (by - ay) * reach;
  const duration = quick ? 400 : 560;
  const strike = quick ? .3 : .48;
  play(el, quick ? [
    { transform: "none", easing: IN },
    { transform: `translate(${dx}px, ${dy}px) scale(1.04)`, offset: strike, easing: "linear" },
    { transform: `translate(${dx * .97}px, ${dy * .97}px) scale(1.02)`, offset: .42, easing: "cubic-bezier(.45,0,.55,1)" },
    { transform: "none" },
  ] : [
    { transform: "none", easing: OUT },
    { transform: `translate(${-dx * .08}px, ${-dy * .08}px) scale(.96)`, offset: .3, easing: IN },
    { transform: `translate(${dx}px, ${dy}px) scale(1.04)`, offset: strike, easing: "linear" },
    { transform: `translate(${dx * .97}px, ${dy * .97}px) scale(1.02)`, offset: .56, easing: "cubic-bezier(.45,0,.55,1)" },
    { transform: "none" },
  ], { duration, easing: "linear", fill: "none" });
  return wait(duration * strike);
}

// a target that is missed steps aside and back
function dodge(stage, key) {
  const el = monEl(stage, key);
  if (!el || reduced()) return Promise.resolve();
  const d = sizeOf(stage, key) * .18 * (ownSide(el) ? -1 : 1);
  return play(el, [{ transform: "none", easing: OUT }, { transform: `translateX(${d}px)`, offset: .35, easing: "cubic-bezier(.45,0,.55,1)" }, { transform: `translateX(${d}px)`, offset: .55 }, { transform: "none" }], { duration: 420, easing: "linear", fill: "none", composite: "add" });
}

/* move: { ident, targets, type, category, verb, spread, miss, still, move, priority } from the reader and the move's data;
   ahead: what the lines right after it say about the blow (Stage.jsx reads them): power by target (critical and super effective
   larger, resisted smaller), the targets that are missed, the ones whose guard holds.
   The promise is the impact: the blow's result plays with it, so a target never waits a beat to react. */
export async function move(stageNode, event, keyOf, ahead = {}) {
  const stage = stageOf(stageNode) || stageNode;
  if (!stage || instant() || event.still) return;
  const from = keyOf(event.ident);
  const targets = (event.targets || []).map(keyOf).filter(k => slotEl(stage, k));
  const type = event.type || "Normal";
  const id = event.move;
  const power = k => Math.max(.6, ahead.power?.[k] || 1);
  const missed = k => ahead.missed?.has(k) || (event.miss && k === targets[0]);
  const blocked = k => ahead.blocked?.has(k);
  const land = k => {
    if (blocked(k)) return null;
    if (missed(k)) return dodge(stage, k);
    return burst(stage, k, type, power(k), { shards: event.category !== "Status" });
  };
  if (event.verb === "self") { await Promise.all([aura(stage, from, type), flashMon(stage, from, .6)]); return; }
  if (!targets.length) { await flashMon(stage, from, .4); return; }
  if (reduced()) { targets.forEach(land); await wait(240); return; }
  const sig = SIGNATURE[id] || {};
  const at = (k, lift) => centre(stage, k, lift);
  if (event.category === "Physical" && !event.spread) {
    const t = targets[0];
    if (sig.fall) { await fall(stage, at(t), type, sizeOf(stage, t)); land(t); return; }
    await lunge(stage, from, t, { quick: event.priority > 0, short: blocked(t) });
    land(t);
    return;
  }
  if (event.category === "Physical") {
    // a spread physical move: the user rears up and every target takes it at once; a quake shakes the stage, a slide drops rocks
    play(monEl(stage, from), [{ transform: "none" }, { transform: "translateY(-14%) scale(1.05)" }, { transform: "none" }], { duration: 360, easing: OUT, fill: "none" });
    if (sig.fall) await Promise.all(targets.map(t => fall(stage, at(t), type, sizeOf(stage, t))));
    else await wait(200);
    if (QUAKES.has(id)) shake(stage, 1.2);
    targets.forEach(land);
    return;
  }
  const status = event.category === "Status";
  if (status && POWDERS.has(id)) {
    await Promise.all(targets.map(t => fall(stage, at(t, .9), type, sizeOf(stage, t) * .6, { count: 6, ms: 520 })));
    targets.forEach(land);
    return;
  }
  // special and status moves aimed at another: a light gathers, and the flight leaves as it closes, never after a dead beat
  charge(stage, from, type, status ? 220 : 300);
  await wait(status ? 160 : 220);
  const style = { ...FLIGHT[type] || FLIGHT.Normal, ...sig };
  const soft = status ? { ...style, beam: false, fall: false, rings: false, grow: 0, count: 4, ms: Math.max(480, (style.ms || 420) * 1.2), gap: 70, wave: style.wave || .08 } : style;
  const one = t => {
    const a = at(from), b = at(t);
    const past = missed(t);
    if (blocked(t)) { const r = sizeOf(stage, t) * .6, d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; b[0] -= (b[0] - a[0]) / d * r; b[1] -= (b[1] - a[1]) / d * r; }
    if (soft.fall) return fall(stage, b, type, sizeOf(stage, t));
    if (soft.beam) return beam(stage, a, b, type, { past });
    return fly(stage, a, b, type, { ...soft, past });
  };
  if (event.spread && !soft.rings && !soft.fall) { await sweep(stage, from, type); await Promise.all(targets.map(one)); }
  else await Promise.all(targets.map(one));
  if (QUAKES.has(id)) shake(stage, 1);
  targets.forEach(land);
}

/* ---------- what happens to a Pokémon ---------- */
export function flashMon(stage, key, strength = 1) {
  const img = monEl(stage, key)?.querySelector("img");
  if (!img || instant()) return Promise.resolve();
  // faint, as Showdown keeps it: the picture lifts toward light, it never turns white
  return play(img, [{ filter: "brightness(1)" }, { filter: `brightness(${1 + .7 * strength})` }, { filter: "brightness(1)" }], { duration: 240, fill: "none" });
}
const ownSide = el => Boolean(el?.closest(".bs-side")?.classList.contains("own"));
/* a blow lands: the picture is knocked back away from the foe and settles, and flashes; how hard is how much it took, a critical
   or super effective blow harder, a resisted one softer. HP lost to the field or a status (direct: false) only shudders in place.
   composite add: it moves on top of whatever the picture is doing (an attacker still on its way home), never replacing it */
export function hit(stage, key, { share = .2, crit = false, strong = false, weak = false, direct = true } = {}) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  const p = (3 + Math.min(1, share) * 9) * (crit ? 1.3 : 1) * (strong ? 1.15 : weak ? .7 : 1);
  const sx = ownSide(el) ? -1 : 1, sy = ownSide(el) ? .35 : -.35;
  const frames = direct
    ? [{ transform: "none", easing: OUT }, { transform: `translate(${sx * p * 1.4}px, ${sy * p}px)`, offset: .12, easing: "cubic-bezier(.45,0,.55,1)" },
      { transform: `translate(${-sx * p * .45}px, ${-sy * p * .3}px)`, offset: .36, easing: "cubic-bezier(.45,0,.55,1)" },
      { transform: `translate(${sx * p * .2}px, 0)`, offset: .6, easing: "cubic-bezier(.45,0,.55,1)" }, { transform: "none" }]
    : [{ transform: "none" }, { transform: "translateY(2px)" }, { transform: "translateY(-1px)" }, { transform: "translateY(2px)" }, { transform: "none" }];
  const shook = reduced() ? Promise.resolve() : play(el, frames, { duration: direct ? 420 : 320, easing: "linear", fill: "none", composite: "add" });
  return Promise.all([shook, flashMon(stage, key, direct ? (strong || crit ? 1.3 : weak ? .6 : 1) : .45), crit ? shake(stage, .8) : null]);
}

/* HP lost to the field or a status, drawn in what took it: a burn's flames, poison's bubbles, the sand's grains, rocks dropped on
   a Pokémon coming in over Stealth Rock. Recoil and a confused self-hit have no shape of their own: the shudder says it. */
const RESIDUAL = { brn: "Fire", psn: "Poison", tox: "Poison", sandstorm: "Rock", hail: "Ice", spikes: "Ground", leechseed: "Grass", saltcure: "Rock", curse: "Ghost", nightmare: "Ghost", partiallytrapped: "Normal", lifeorb: "Psychic", rockyhelmet: "Steel", roughskin: "Normal", ironbarbs: "Steel", blacksludge: "Poison", stickybarb: "Steel", bind: "Normal", firespin: "Fire", whirlpool: "Water", sandtomb: "Ground", infestation: "Bug", magmastorm: "Fire" };
export function residual(stage, key, from) {
  if (!stage || instant() || !monEl(stage, key)) return Promise.resolve();
  if (from === "stealthrock") return reduced() ? burst(stage, key, "Rock", .5) : fall(stage, centre(stage, key), "Rock", sizeOf(stage, key), { count: 3 }).then(() => burst(stage, key, "Rock", .5, { shards: false }));
  const type = RESIDUAL[from];
  return type ? burst(stage, key, type, .55) : Promise.resolve();
}

// HP that flows from one Pokémon to another (a draining move, Leech Seed): green motes drift from the one losing it to the one gaining it
export function flow(stage, from, to) {
  if (!stage || instant() || reduced() || !slotEl(stage, from) || !slotEl(stage, to) || from === to) return Promise.resolve();
  return fly(stage, centre(stage, from), centre(stage, to), "Grass", { wave: .1, waves: 1, count: 6, ms: 520, gap: 50, spin: 0 });
}

// why a Pokémon could not move: paralysis crackles, sleep breathes slow rings, a freeze glints, a flinch jolts it back
export function cant(stage, key, why) {
  if (!stage || instant() || !monEl(stage, key)) return Promise.resolve();
  if (why === "par") return Promise.all([burst(stage, key, "Electric", .5), hit(stage, key, { share: 0, direct: false })]);
  if (why === "slp") return reduced() ? flashMon(stage, key, .3) : aura(stage, key, "Psychic", 2, 900);
  if (why === "frz") return Promise.all([burst(stage, key, "Ice", .6, { shards: false }), flashMon(stage, key, .6)]);
  if (why === "flinch") return hit(stage, key, { share: 0, weak: true });
  return flashMon(stage, key, .4);
}

// confused: the picture sways side to side before it acts (or hurts itself)
export function sway(stage, key) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  if (reduced()) return flashMon(stage, key, .3);
  return play(el, [{ transform: "none" }, { transform: "rotate(-6deg)" }, { transform: "rotate(6deg)" }, { transform: "rotate(-4deg)" }, { transform: "none" }], { duration: 640, easing: "cubic-bezier(.45,0,.55,1)", fill: "none", composite: "add" });
}

// a substitute: the doll rises out of the floor when it is made, and breaks (swells and goes out) when it falls
export function doll(stage, key, on) {
  const sub = monEl(stage, key)?.querySelector(".bs-sub");
  const img = monEl(stage, key)?.querySelector("img");
  if (instant()) return Promise.resolve();
  if (on) return sub ? play(sub, reduced() ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: "scaleY(0)", easing: OUT }, { transform: "scaleY(1.08)", offset: .6 }, { transform: "scaleY(1)" }], { duration: 360, fill: "backwards" }) : Promise.resolve();
  // after the doll went: the Pokémon comes back into view where it stood
  return img ? play(img, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: OUT, fill: "backwards" }) : Promise.resolve();
}
export function breakDoll(stage, key) {
  const sub = monEl(stage, key)?.querySelector(".bs-sub");
  if (!sub || instant()) return Promise.resolve();
  // the burst plays on while the Pokémon comes back, so there is no empty beat between the doll and it
  burst(stage, key, "Normal", .6);
  return play(sub, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: reduced() ? "none" : "scale(1.2)" }], { duration: 260, easing: IN, fill: "forwards" });
}

// Transform: the picture narrows to a line of light and opens again as the other
export function morph(stage, key) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  if (reduced()) return flashMon(stage, key, 1);
  return Promise.all([
    play(el, [{ transform: "none", easing: IN }, { transform: "scaleX(.08)", offset: .45 }, { transform: "scaleX(.08)", offset: .55, easing: OUT }, { transform: "none" }], { duration: 620, easing: "linear", fill: "none", composite: "add" }),
    play(el.querySelector("img"), [{ filter: "brightness(1)" }, { filter: "brightness(2.4)", offset: .5 }, { filter: "brightness(1)" }], { duration: 620, fill: "none" }),
  ]);
}

// a move that takes a turn to charge (Solar Beam, Meteor Beam): the light gathers twice and stays gathered a beat
export async function gather(stage, key, type) {
  if (!stage || instant() || !monEl(stage, key)) return;
  await Promise.all([charge(stage, key, type, 420), reduced() ? null : aura(stage, key, type, 2, 520)]);
  await flashMon(stage, key, .5);
}

// Trick Room: the space turns a little and comes back, as the room comes up round the court
export function twist(stage) {
  const el = stage?.querySelector(".bs-world");
  if (!el || instant() || reduced()) return Promise.resolve();
  return play(el, [{ transform: "none" }, { transform: "rotate(-1.4deg) scale(1.03)", offset: .4 }, { transform: "rotate(.6deg) scale(1.01)", offset: .7 }, { transform: "none" }], { duration: 760, easing: "cubic-bezier(.45,0,.55,1)", fill: "none" });
}

// a screen broken by a blow (Brick Break, Psychic Fangs): its dome falls apart in shards of its colour before it fades
const SCREEN_TYPE = { reflect: "Psychic", lightscreen: "Electric", auroraveil: "Ice" };
export function shatter(stage, own, id) {
  const dome = stage?.querySelector(`.bs-screens.${own ? "own" : "foe"} .bs-dome.${id}`);
  if (!dome || instant() || !SCREEN_TYPE[id]) return Promise.resolve();
  if (reduced()) return flashStage(stage, .12, 260);
  const r = dome.getBoundingClientRect(), box = stage.getBoundingClientRect();
  // the dome itself goes as its shards fly (it stays the same node while it leaves, so it never comes back)
  play(dome, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: OUT, fill: "forwards" });
  return Promise.all(Array.from({ length: 12 }, (_, i) => {
    const u = (i + .5) / 12;
    const x = r.left - box.left + u * r.width, y = r.top - box.top + (1 - Math.sin(Math.PI * u)) * r.height;
    const p = spawn(stage, `bs-p ${typeClass(SCREEN_TYPE[id])}`, [x, y]);
    const drift = (u - .5) * 40;
    return vanish(p, [
      { opacity: 1, transform: "translate(-50%, -50%) rotate(0deg) scale(1.4)", easing: OUT },
      { opacity: 1, transform: `translate(calc(-50% + ${drift * .5}px), calc(-50% - 6px)) rotate(90deg) scale(1.3)`, offset: .25, easing: IN },
      { opacity: 0, transform: `translate(calc(-50% + ${drift}px), calc(-50% + ${r.height * .6}px)) rotate(300deg) scale(.6)` },
    ], { duration: 640, delay: (i % 4) * 30, easing: "linear" });
  }));
}
// the HP that went or came back rises over the Pokémon
export function number(stage, key, text, heal = false) {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .25);
  const el = spawn(stage, `bt-num${heal ? " heal" : ""}`, [x, y]);
  el.textContent = text;
  return vanish(el, [
    { opacity: 0, transform: "translate(-50%, -50%) translateY(12px)" },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .2, easing: OUT },
    { opacity: 1, transform: "translate(-50%, -50%) translateY(-12px)", offset: .75 },
    { opacity: 0, transform: "translate(-50%, -50%) translateY(-24px)" },
  ], { duration: 1000 });
}
// HP moves: one sweep across the ten cells, quick at first and settling, each cell filling or emptying in its turn;
// the bar keeps its colour until the sweep crosses a fifth or a half, where the colour changes, as the games do
const toneAt = share => (share <= .2 ? "type-fire" : share <= .5 ? "type-electric" : "type-grass");
export function drain(stage, key, from, to) {
  const bar = stage?.closest(".bt-arena")?.querySelector(`[data-bar="${key}"] .bt-gauge`);
  const clamp = v => Math.max(0, Math.min(1, v));
  const a = clamp(from) * 10, b = clamp(to) * 10, span = Math.abs(a - b);
  if (!bar || instant() || span < .01) return Promise.resolve();
  const total = Math.min(1100, Math.max(420, span * 120));
  const when = x => (1 - Math.sqrt(Math.max(0, 1 - Math.abs(x - a) / span))) * total; // the sweep stands at x then (ease-out)
  const runs = [...bar.children].map((cell, i) => {
    const f0 = clamp(a - i), f1 = clamp(b - i);
    if (f0 === f1 || !cell.firstElementChild) return null;
    const start = when(a > b ? Math.min(a, i + 1) : Math.max(a, i)), end = when(a > b ? Math.max(b, i) : Math.min(b, i + 1));
    return play(cell.firstElementChild, [{ transform: `scaleX(${f0})` }, { transform: `scaleX(${f1})` }], { duration: Math.max(1, end - start), delay: start, easing: "linear", fill: "backwards" });
  });
  const base = bar.className.replace(/\btype-[a-z]+/g, "").trim();
  if (toneAt(from) !== toneAt(to)) {
    bar.className = `${base} ${toneAt(from)}`;
    for (const edge of [2, 5]) if ((a - edge) * (b - edge) < 0) setTimeout(() => { bar.className = `${base} ${toneAt((edge + (b > a ? .01 : -.01)) / 10)}`; }, ms(when(edge)));
    setTimeout(() => { bar.className = `${base} ${toneAt(to)}`; }, ms(total));
  }
  return Promise.all(runs);
}
export function heal(stage, key) {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .1);
  const size = sizeOf(stage, key);
  return Promise.all(Array.from({ length: 7 }, (_, i) => {
    const p = spawn(stage, "bs-plus", [x + (Math.random() - .5) * size * .7, y]);
    return vanish(p, [{ opacity: 0, transform: "translate(-50%, -50%) scale(.5)" }, { opacity: 1, offset: .3 }, { opacity: 0, transform: `translate(-50%, -50%) translateY(${-size * (.6 + Math.random() * .4)}px) scale(1)` }], { duration: 760, delay: i * 70, easing: OUT });
  }));
}
// fainting: it greys where it stands, holds a beat, then sinks into the floor (clipped at its feet) and goes out
export function faint(stage, key) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  settle(el);
  const slot = slotEl(stage, key);
  if (!reduced()) slot.style.clipPath = "inset(-100% -100% 0 -100%)";
  const runs = [
    play(el, [
      { transform: "none", opacity: 1, filter: "grayscale(0) brightness(1)", easing: OUT },
      { transform: "translateY(1%)", opacity: 1, filter: "grayscale(1) brightness(.8)", offset: .22, easing: "linear" },
      { transform: "translateY(1%)", opacity: 1, filter: "grayscale(1) brightness(.8)", offset: .34, easing: "cubic-bezier(.55,0,.8,.4)" },
      { transform: reduced() ? "translateY(1%)" : "translateY(40%)", opacity: 0, filter: "grayscale(1) brightness(.6)" },
    ], { duration: 860, easing: "linear", fill: "forwards" }),
  ];
  if (!reduced()) {
    const [x] = centre(stage, key);
    const r = slot.getBoundingClientRect(), box = stage.getBoundingClientRect();
    const dust = spawn(stage, "bs-ring type-normal", [x, r.bottom - box.top - r.height * .04], { width: `${r.width * .5}px`, height: `${r.width * .5}px` });
    runs.push(vanish(dust, [
      { opacity: 0, transform: "translate(-50%, -50%) scale(.4, .12)" },
      { opacity: .6, transform: "translate(-50%, -50%) scale(.7, .2)", offset: .5 },
      { opacity: 0, transform: "translate(-50%, -50%) scale(1.3, .34)" },
    ], { duration: 620, delay: 300, easing: OUT }));
  }
  return Promise.all(runs).then(() => { if (slot) slot.style.clipPath = ""; });
}
// a light that blooms and goes out at a point: what a Pokémon comes out of and goes back into
function flare(stage, [x, y], size, { grow = true, duration = 560 } = {}) {
  const disc = spawn(stage, "bs-flare", [x, y], { width: `${size}px`, height: `${size}px` });
  return vanish(disc, grow
    ? [{ opacity: 0, transform: "translate(-50%, -50%) scale(.2)", easing: OUT }, { opacity: .95, transform: "translate(-50%, -50%) scale(.9)", offset: .3, easing: "cubic-bezier(.45,0,.55,1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(1.25)" }]
    : [{ opacity: .9, transform: "translate(-50%, -50%) scale(1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(.2)" }],
  { duration, easing: "linear" });
}
// sent in: a light blooms where it will stand and the Pokémon grows out of it, bright at first, settling to its own colours
export async function enter(stage, key) {
  const el = monEl(stage, key);
  if (!el || instant()) return;
  settle(el);
  el.style.opacity = "0";
  // the picture is decoded before it is shown, so it never grows out of an empty frame
  const img = el.querySelector("img");
  if (img && !img.complete) await Promise.race([img.decode?.().catch(() => {}), new Promise(resolve => setTimeout(resolve, 900))]);
  el.style.opacity = "";
  if (reduced()) { await play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 }); return; }
  const at = centre(stage, key, .42);
  const size = sizeOf(stage, key);
  const ring = spawn(stage, "bs-ring type-normal", at, { width: `${size * .5}px`, height: `${size * .5}px` });
  await Promise.all([
    flare(stage, at, size * 1.1),
    vanish(ring, [{ opacity: 0, transform: "translate(-50%, -50%) scale(.3)" }, { opacity: .8, offset: .2 }, { opacity: 0, transform: "translate(-50%, -50%) scale(2.2)" }], { duration: 620, easing: OUT }),
    play(el, [
      { transform: "scale(.5)", filter: "brightness(2.6)", opacity: 0, easing: OUT },
      { transform: "scale(1.02)", filter: "brightness(1.5)", opacity: 1, offset: .55, easing: "cubic-bezier(.45,0,.55,1)" },
      { transform: "scale(1)", filter: "brightness(1)", opacity: 1 },
    ], { duration: 500, delay: 90, easing: "linear", fill: "backwards" }),
  ]);
}
// called back: the Pokémon brightens and shrinks into a light that goes out
// dragged out (Roar, Whirlwind, Dragon Tail): it is blown off its side the way it faces away, and goes out
export function leave(stage, key, { drag = false } = {}) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  settle(el);
  if (drag && !reduced()) {
    const d = ownSide(el) ? -60 : 60;
    return play(el, [{ transform: "none", opacity: 1, easing: IN }, { transform: `translateX(${d}%) rotate(${d / 6}deg)`, opacity: 0 }], { duration: 340, easing: "linear", fill: "forwards" });
  }
  const at = centre(stage, key, .42);
  const size = sizeOf(stage, key);
  return Promise.all([
    play(el, [
      { transform: "scale(1)", filter: "brightness(1)", opacity: 1, easing: IN },
      { transform: "scale(.5)", filter: "brightness(2.4)", opacity: 0 },
    ], { duration: 320, easing: "linear", fill: "forwards" }),
    reduced() ? null : flare(stage, at, size * .8, { grow: false, duration: 380 }),
  ]);
}
// Mega Evolution: the picture lights from within inside a turning rainbow, the stage goes white, and it stands changed
export async function megaStart(stage, key) {
  const el = monEl(stage, key);
  if (!el || instant()) return;
  const [x, y] = centre(stage, key);
  const size = sizeOf(stage, key);
  const shell = spawn(stage, "bs-mega", [x, y], { width: `${size * 1.3}px`, height: `${size * 1.3}px` });
  // the ring turns in and closes round the picture as the light inside it builds in two swells; the ring goes out as the stage lights
  const turn = vanish(shell, [
    { opacity: 0, transform: "translate(-50%, -50%) scale(.4) rotate(0)", easing: OUT },
    { opacity: 1, transform: "translate(-50%, -50%) scale(1) rotate(300deg)", offset: .5, easing: "cubic-bezier(.45,0,.55,1)" },
    { opacity: 1, transform: "translate(-50%, -50%) scale(.82) rotate(480deg)", offset: .86, easing: IN },
    { opacity: 0, transform: "translate(-50%, -50%) scale(.6) rotate(540deg)" },
  ], { duration: 1200, easing: "linear" });
  await play(el.querySelector("img"), [
    { filter: "brightness(1)", easing: "cubic-bezier(.45,0,.55,1)" }, { filter: "brightness(1.7)", offset: .35, easing: "cubic-bezier(.45,0,.55,1)" },
    { filter: "brightness(1.35)", offset: .55, easing: "cubic-bezier(.45,0,.55,1)" }, { filter: "brightness(2.6)" },
  ], { duration: 1050, easing: "linear", fill: "forwards" });
  await Promise.all([turn, flashStage(stage, .32, 460)]);
}
export async function megaEnd(stage, key) {
  const img = monEl(stage, key)?.querySelector("img");
  if (instant()) { settle(img); return; }
  await Promise.all([burst(stage, key, "Fairy", 1.3), play(img, [{ filter: "brightness(2.6)" }, { filter: "brightness(1)" }], { duration: 620, easing: OUT, fill: "forwards" })]);
  // the start held the picture lit (fill forwards) across the change of form; both let go here, so it never stays lit
  settle(img);
}
// a stat change: arrows rise (up) or fall (down) through the picture, warm for up and cold for down
export function boost(stage, key, amount) {
  if (!stage || instant() || !amount) return Promise.resolve();
  const up = amount > 0;
  const [x, y] = centre(stage, key, .4);
  const size = sizeOf(stage, key);
  const count = Math.min(3, Math.abs(amount)) * 3;
  const runs = Array.from({ length: count }, (_, i) => {
    const p = spawn(stage, `bs-arrow${up ? "" : " down"}`, [x + (i % 3 - 1) * size * .28, y]);
    const d = size * .55;
    return vanish(p, [
      { opacity: 0, transform: `translate(-50%, -50%) translateY(${up ? d : -d}px)` },
      { opacity: 1, offset: .3 },
      { opacity: 0, transform: `translate(-50%, -50%) translateY(${up ? -d : d}px)` },
    ], { duration: 640, delay: i * 60, easing: up ? OUT : IN });
  });
  const tint = monEl(stage, key)?.querySelector("img");
  runs.push(play(tint, [{ filter: "none" }, { filter: up ? "brightness(1.3)" : "brightness(.8)" }, { filter: "none" }], { duration: 640, fill: "none" }));
  return Promise.all(runs);
}
const STATUS_TYPE = { brn: "Fire", par: "Electric", psn: "Poison", tox: "Poison", slp: "Normal", frz: "Ice" };
export function status(stage, key, id) {
  if (!stage || instant()) return Promise.resolve();
  return Promise.all([burst(stage, key, STATUS_TYPE[id] || "Normal", .7), flashMon(stage, key, .5)]);
}
export function shield(stage, key) {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key);
  const size = sizeOf(stage, key);
  const el = spawn(stage, "bs-shield", [x, y], { width: `${size * 1.15}px`, height: `${size * 1.15}px` });
  return vanish(el, [
    { opacity: 0, transform: "translate(-50%, -50%) scale(.5)" },
    { opacity: 1, transform: "translate(-50%, -50%) scale(1.05)", offset: .25, easing: OUT },
    { opacity: .9, transform: "translate(-50%, -50%) scale(1)", offset: .75 },
    { opacity: 0, transform: "translate(-50%, -50%) scale(1.15)" },
  ], { duration: 900 });
}
// an ability or an item announced: a plate slides in on its owner's side, as the games show it
export function popup(stage, key, owner, name, own) {
  if (!stage || instant()) return Promise.resolve();
  const el = spawn(stage, `bt-popup${own ? " own" : ""}`);
  el.innerHTML = "";
  const small = document.createElement("small"); small.textContent = owner;
  const big = document.createElement("b"); big.textContent = name;
  el.append(small, big);
  const off = own ? "-110%" : "110%";
  return vanish(el, [
    { transform: `translateX(${off})`, opacity: 0 },
    { transform: "translateX(0)", opacity: 1, offset: .16, easing: OUT },
    { transform: "translateX(0)", opacity: 1, offset: .82 },
    { transform: `translateX(${off})`, opacity: 0 },
  ], { duration: 1500 });
}
