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
export function label(stage, key, text, tone = "") {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .55);
  const el = spawn(stage, `bt-word ${tone}`, [x, y]);
  el.textContent = text;
  return vanish(el, [
    { opacity: 0, transform: "translate(-50%, -50%) translateY(12px)" },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .2, easing: OUT },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .75 },
    { opacity: 0, transform: "translate(-50%, -50%) translateY(-12px)" },
  ], { duration: 900 });
}

/* ---------- a move ---------- */
// a ring that opens and goes out where a blow lands, and the type's shards thrown out of it
export function burst(stage, key, type, power = 1) {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key);
  const size = sizeOf(stage, key);
  const ring = spawn(stage, `bs-ring ${typeClass(type)}`, [x, y], { width: `${size * .5}px`, height: `${size * .5}px` });
  const runs = [vanish(ring, [{ opacity: 1, transform: "translate(-50%, -50%) scale(.2)" }, { opacity: 0, transform: `translate(-50%, -50%) scale(${2.2 * power})` }], { duration: 420, easing: OUT })];
  const count = Math.round(8 * power);
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

// shards in the type's colour travel from one Pokémon to another along an arc, a glowing head first and a trail behind
function projectile(stage, from, to, type, { count = 7, arc = .18, duration = 420 } = {}) {
  const [ax, ay] = centre(stage, from);
  const [bx, by] = centre(stage, to);
  // a quadratic curve whose middle rises by `arc` of the distance, sampled densely so the path never shows a corner
  const lift = -Math.hypot(bx - ax, by - ay) * arc * 2;
  const cx = (ax + bx) / 2, cy = (ay + by) / 2 + lift;
  const point = t => [(1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by];
  const STEPS = 16;
  const runs = [];
  for (let i = 0; i < count; i++) {
    const head = i === 0;
    const p = spawn(stage, `bs-p ${typeClass(type)}${head ? " head" : ""}`, [0, 0]);
    const s = head ? 2.2 : 1.4 - i * .12;
    const frames = Array.from({ length: STEPS + 1 }, (_, j) => {
      const t = j / STEPS;
      const [x, y] = point(t);
      return { offset: t, opacity: j === 0 ? 0 : j === STEPS && !head ? .2 : 1, transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${360 * t}deg) scale(${s})` };
    });
    runs.push(vanish(p, frames, { duration, delay: i * 34, easing: "cubic-bezier(.45,0,.55,1)" }));
  }
  return Promise.all(runs);
}

// a glow gathers at the user before a special move leaves
function charge(stage, key, type) {
  const [x, y] = centre(stage, key);
  const size = sizeOf(stage, key);
  const glow = spawn(stage, `bs-glow ${typeClass(type)}`, [x, y], { width: `${size * .9}px`, height: `${size * .9}px` });
  return vanish(glow, [{ opacity: 0, transform: "translate(-50%, -50%) scale(1.6)" }, { opacity: .9, transform: "translate(-50%, -50%) scale(.6)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(.2)" }], { duration: 300, easing: IN });
}

// rings rise around a Pokémon: a move on itself, a boost
function aura(stage, key, type, rings = 3) {
  const [x, y] = centre(stage, key, .02);
  const size = sizeOf(stage, key);
  return Promise.all(Array.from({ length: rings }, (_, i) => {
    const el = spawn(stage, `bs-aura ${typeClass(type)}`, [x, y], { width: `${size * .9}px`, height: `${size * .28}px` });
    return vanish(el, [{ opacity: 0, transform: "translate(-50%, -50%) translateY(0) scale(.6)" }, { opacity: .9, offset: .3 }, { opacity: 0, transform: `translate(-50%, -50%) translateY(${-size * .8}px) scale(1.1)` }], { duration: 620, delay: i * 120, easing: OUT });
  }));
}

// the user's picture travels toward its target and back (a physical move)
function lunge(stage, from, to) {
  const el = monEl(stage, from);
  if (!el || reduced()) return Promise.resolve();
  const [ax, ay] = centre(stage, from);
  const [bx, by] = centre(stage, to);
  const dx = (bx - ax) * .62, dy = (by - ay) * .62;
  // wind back (out), dash (in, fast), a beat on the blow, then home (in and out): each stretch has its own curve, so nothing snaps
  return play(el, [
    { transform: "none", easing: OUT },
    { transform: `translate(${-dx * .08}px, ${-dy * .08}px) scale(.96)`, offset: .3, easing: IN },
    { transform: `translate(${dx}px, ${dy}px) scale(1.04)`, offset: .48, easing: "linear" },
    { transform: `translate(${dx * .97}px, ${dy * .97}px) scale(1.02)`, offset: .56, easing: "cubic-bezier(.45,0,.55,1)" },
    { transform: "none" },
  ], { duration: 560, easing: "linear", fill: "none" });
}

const QUAKES = new Set(["earthquake", "bulldoze", "magnitude", "earthpower", "highhorsepower", "stompingtantrum", "precipiceblades"]);
/* move: { ident, targets, type, category, verb, spread, miss, move } from the reader */
export async function move(stageNode, event, keyOf) {
  const stage = stageOf(stageNode) || stageNode;
  if (!stage || instant()) return;
  const from = keyOf(event.ident);
  const targets = (event.targets || []).map(keyOf).filter(k => slotEl(stage, k));
  const type = event.type || "Normal";
  if (event.verb === "self" || !targets.length) {
    await Promise.all([aura(stage, from, type), flashMon(stage, from, .6)]);
    return;
  }
  if (reduced()) { await Promise.all(targets.map(t => burst(stage, t, type, .6))); return; }
  if (event.category === "Physical" && !event.spread) {
    const out = lunge(stage, from, targets[0]);
    await wait(280);
    if (!event.miss) burst(stage, targets[0], type, 1);
    await out;
    return;
  }
  if (event.category === "Physical") {
    // a spread physical move: the user rears up and every target takes it at once
    await play(monEl(stage, from), [{ transform: "none" }, { transform: "translateY(-14%) scale(1.05)" }, { transform: "none" }], { duration: 360, easing: OUT, fill: "none" });
    if (QUAKES.has(event.move)) shake(stage, 1.2);
    await Promise.all(targets.map(t => burst(stage, t, type, .9)));
    return;
  }
  // special and status moves aimed at another: a charge, then the shards fly
  await charge(stage, from, type);
  const status = event.category === "Status";
  await Promise.all(targets.map(t => projectile(stage, from, t, type, status ? { count: 5, arc: .08, duration: 520 } : { count: 8, arc: .16, duration: 400 })));
  if (QUAKES.has(event.move)) shake(stage, 1);
  if (!event.miss) await Promise.all(targets.map(t => burst(stage, t, type, status ? .5 : 1)));
}

/* ---------- what happens to a Pokémon ---------- */
export function flashMon(stage, key, strength = 1) {
  const img = monEl(stage, key)?.querySelector("img");
  if (!img || instant()) return Promise.resolve();
  return play(img, [{ filter: "brightness(1)" }, { filter: `brightness(${1 + 1.2 * strength})` }, { filter: "brightness(1)" }], { duration: 240, fill: "none" });
}
// a blow lands: the picture shakes and flashes; how hard is how much it took
export function hit(stage, key, { share = .2, crit = false, strong = false } = {}) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  const p = (4 + Math.min(1, share) * 8) * (crit ? 1.3 : 1);
  const shook = reduced() ? Promise.resolve() : play(el, [
    { transform: "none" }, { transform: `translateX(${-p}px)` }, { transform: `translateX(${p}px)` }, { transform: `translateX(${-p / 2}px)` }, { transform: `translateX(${p / 3}px)` }, { transform: "none" },
  ], { duration: 360, easing: "linear", fill: "none" });
  return Promise.all([shook, flashMon(stage, key, 1), crit ? shake(stage, 1) : null]);
}
// the HP that went or came back rises over the Pokémon
export function number(stage, key, text, heal = false) {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .4);
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
export function leave(stage, key) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  settle(el);
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
