/* 배틀 무대의 연출 (DESIGN.md "Battle", The stage). 무대(Stage.jsx) 위에서 기술, 피격, 등장, 쓰러짐, 메가진화, 능력 변화를 Web Animations로 그린다.
   무대의 장면만 보드의 규칙에서 물러나 날아가고 터지고 흔들린다. 그 위에 뜨는 말(턴, 급소, 숫자, 특성)은 보드의 판(battle.css)이고,
   색은 보드의 색과 타입 색뿐이다. 모양은 타입의 것이다: 불은 불꽃, 물은 물방울, 전기는 꺾인 번개, 풀은 잎, 얼음은 결정, 베기는 초승달.
   한 번의 기술은 세 겹으로 그린다: 모으고(쓴 쪽), 날아가며 자취를 남기고(길), 맞는 순간 터진다(맞은 쪽: 충격 별, 속도선, 타입의 파편).
   번쩍임은 옅게, 흔들림은 작게: 화려함은 모양과 겹으로 내고, 밝기로 내지 않는다.
   모든 연출은 끝나지 않아도 정해진 시간 뒤에는 넘어간다: 숨은 페이지는 애니메이션 시계를 멈춘다.
   speed: 1 보통, .5 빠르게, 0 건너뛰기(연출 없이 상태만). */
import { reduced } from "../../components/common/motion.js";

let speed = 1;
export const setSpeed = s => { speed = s; };
export const instant = () => speed === 0;
const ms = n => Math.max(1, n * (speed || 0));
const OUT = "cubic-bezier(.22,1,.36,1)";
const IN = "cubic-bezier(.5,0,.75,0)";
const SWAY = "cubic-bezier(.45,0,.55,1)";

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
// shapes are drawn for a phone's stage (430 wide) and grow with a wider one
const unitOf = stage => Math.min(1.6, Math.max(.85, (stage?.clientWidth || 430) / 430));
const ownSide = el => Boolean(el?.closest(".bs-side")?.classList.contains("own"));

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
// a shape of a size (stage pixels) at the layer's corner, placed by its frames; w 0 keeps the size its class gives it
const bit = (stage, cls, w = 0, h = w) => spawn(stage, cls, [0, 0], w ? { width: `${w}px`, height: `${h}px` } : {});
const play = (el, frames, options) => (el ? done(el.animate(frames, { fill: "both", ...options, duration: ms(options.duration), delay: ms(options.delay || 0) })) : Promise.resolve());
const vanish = (el, frames, options) => play(el, frames, options).then(() => el?.remove());
const typeClass = type => `type-${String(type || "normal").toLowerCase()}`;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const T = (x, y, more = "") => `translate(${x}px, ${y}px) translate(-50%, -50%) ${more}`;
const around = (n, i, jitter = .35) => (i / n) * Math.PI * 2 + rand(-jitter, jitter);
const times = (n, make) => Array.from({ length: Math.max(0, Math.round(n)) }, (_, i) => make(i));

/* ---------- the pieces every effect is made of ---------- */
/* a shape thrown from a point: it travels (dx, dy) over its life, gravity pulling it down by g by the end, turning `spin` degrees
   and scaling from s0 to s1; `out` eases the travel out (a burst), otherwise it is a throw. It stands at `peak` until fadeAt. */
function toss(stage, cls, [x, y], { dx = 0, dy = 0, g = 0, spin = 0, face = 0, s0 = 1, s1 = .4, w = 0, h = w, duration = 520, delay = 0, peak = 1, fadeAt = .55, out = true } = {}) {
  const el = bit(stage, cls, w, h);
  const N = 12;
  return vanish(el, Array.from({ length: N + 1 }, (_, j) => {
    const t = j / N, p = out ? 1 - (1 - t) ** 2 : t;
    return { offset: t, opacity: t <= fadeAt ? peak : peak * (1 - (t - fadeAt) / (1 - fadeAt)), transform: T(x + dx * p, y + dy * p + g * t * t, `rotate(${face + spin * t}deg) scale(${lerp(s0, s1, t)})`) };
  }), { duration, delay, easing: "linear" });
}
// a shape that opens in place and goes out
function pop(stage, cls, [x, y], { w = 0, h = w, s0 = .2, s1 = 1.2, rot = 0, spin = 0, peak = 1, duration = 300, delay = 0, at = .35 } = {}) {
  const el = bit(stage, cls, w, h);
  return vanish(el, [
    { opacity: peak, transform: T(x, y, `rotate(${rot}deg) scale(${s0})`), easing: OUT },
    { opacity: peak, transform: T(x, y, `rotate(${rot + spin * at}deg) scale(${lerp(s0, s1, .75)})`), offset: at },
    { opacity: 0, transform: T(x, y, `rotate(${rot + spin}deg) scale(${s1})`) },
  ], { duration, delay, easing: "linear" });
}
// a ring that opens (flat: squashed onto the floor) and goes out
function ring(stage, [x, y], size, type, { s0 = .2, s1 = 2, flat = 1, peak = 1, duration = 420, delay = 0, easing = OUT, thick = false } = {}) {
  const el = bit(stage, `bs-ring${thick ? " thick" : ""} ${typeClass(type)}`, size, size);
  return vanish(el, [{ opacity: peak, transform: T(x, y, `scale(${s0}, ${s0 * flat})`) }, { opacity: 0, transform: T(x, y, `scale(${s1}, ${s1 * flat})`) }], { duration, delay, easing });
}
// speed lines shot out of a point, the way a blow lands in a drawing
function streaks(stage, [x, y], size, { n = 8, type = null, reach = 1, duration = 300, delay = 0 } = {}) {
  return Promise.all(times(n, i => {
    const a = (i / n) * 360 + rand(-14, 14);
    const el = spawn(stage, `bs-streak${type ? ` typed ${typeClass(type)}` : ""}`, [x, y], { width: `${size * rand(.26, .4)}px` });
    const r0 = size * .14, r1 = size * rand(.55, .8) * reach;
    return vanish(el, [
      { opacity: 1, transform: `translateY(-50%) rotate(${a}deg) translateX(${r0}px) scaleX(.2)`, easing: OUT },
      { opacity: 1, transform: `translateY(-50%) rotate(${a}deg) translateX(${lerp(r0, r1, .45)}px) scaleX(1)`, offset: .4 },
      { opacity: 0, transform: `translateY(-50%) rotate(${a}deg) translateX(${r1}px) scaleX(.2)` },
    ], { duration, delay, easing: "linear" });
  }));
}
// a radial throw of small pieces
const sparks = (stage, cls, at, reach, n, { lift = 0, ...opt } = {}) => times(n, i => {
  const a = around(n, i), d = reach * rand(.55, 1);
  return toss(stage, cls, at, { dx: Math.cos(a) * d, dy: Math.sin(a) * d + lift, spin: rand(-360, 360), s0: 1.2, s1: .3, duration: rand(420, 580), ...opt });
});
// soft puffs of smoke or dust where something lands or goes
const puffs = (stage, [x, y], size, n, { type = null, peak = .45, rise = .25, spread = .38, delay = 0 } = {}) => times(n, i => toss(stage, `bs-puff ${type ? typeClass(type) : "smoke"}`, [x + rand(-spread, spread) * size, y + rand(-.04, .04) * size], {
  w: size * rand(.16, .26), dx: rand(-.18, .18) * size, dy: -size * rand(.04, rise), s0: .4, s1: 1.5, peak, fadeAt: .22, duration: rand(520, 720), delay: delay + i * 24,
}));
// the stage takes a faint wash of the blow's colour (never white, never bright)
function tint(stage, type, peak = .1, duration = 320) {
  if (reduced()) return Promise.resolve();
  const el = spawn(stage, `bs-tint ${typeClass(type)}`, [0, 0]);
  return vanish(el, [{ opacity: 0 }, { opacity: peak, offset: .18 }, { opacity: 0 }], { duration, easing: "ease-out" });
}
// the camera leans into a hard blow: the scene swells a little round the point it lands on, the effects staying where they are
function punch(stage, [x, y], power = 1) {
  const el = stage?.querySelector(".bs-world");
  if (!el || reduced()) return Promise.resolve();
  el.style.transformOrigin = `${x}px ${y}px`;
  return play(el, [{ transform: "scale(1)" }, { transform: `scale(${1 + .022 * power})`, offset: .22 }, { transform: "scale(1)" }], { duration: 300, easing: OUT, fill: "none", composite: "add" });
}

/* ---------- the stage itself ---------- */
export function shake(stage, power = 1) {
  const el = stage?.querySelector(".bs-world");
  if (!el || instant() || reduced()) return Promise.resolve();
  const p = 3 * power;
  return play(el, [{ transform: "none" }, { transform: `translate(${-p}px, ${p / 2}px)` }, { transform: `translate(${p}px, ${-p / 2}px)` }, { transform: `translate(${-p / 2}px, ${p / 3}px)` }, { transform: `translate(${p / 3}px, 0)` }, { transform: "none" }], { duration: 320, easing: "linear", fill: "none", composite: "add" });
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

/* ---------- a bolt: a jagged line drawn between two points, struck again with a new jag each flicker ---------- */
const NS = "http://www.w3.org/2000/svg";
function jagged([ax, ay], [bx, by], depth, steps = 9) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, o = i === 0 || i === steps ? 0 : rand(-1, 1) * depth * d;
    return [ax + dx * t + nx * o, ay + dy * t + ny * o];
  });
}
const pts = list => list.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
function bolt(stage, a, b, type = "Electric", { flicker = 3, depth = .09, duration = 340, delay = 0, fork = true, thin = false } = {}) {
  const fx = fxOf(stage);
  if (!fx) return Promise.resolve();
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", `bs-bolt${thin ? " thin" : ""} ${typeClass(type)}`);
  fx.appendChild(svg);
  const slot = duration / flicker;
  const runs = times(flicker, f => {
    const g = document.createElementNS(NS, "g");
    const line = jagged(a, b, depth);
    let html = `<polyline class="o" points="${pts(line)}"/>`;
    if (fork) {
      const at = line[2 + (f % 4)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) * .3;
      const turn = Math.atan2(b[1] - a[1], b[0] - a[0]) + (f % 2 ? .7 : -.7);
      html += `<polyline class="o fork" points="${pts(jagged(at, [at[0] + Math.cos(turn) * len, at[1] + Math.sin(turn) * len], depth * 1.6, 4))}"/>`;
    }
    g.innerHTML = `${html}<polyline class="c" points="${pts(line)}"/>`;
    g.style.opacity = "0";
    svg.appendChild(g);
    const last = f === flicker - 1;
    return play(g, last
      ? [{ opacity: 1 }, { opacity: 1, offset: .4 }, { opacity: 0 }]
      : [{ opacity: 1 }, { opacity: 1, offset: .7 }, { opacity: 0, offset: .71 }, { opacity: 0 }], { duration: last ? slot * 1.8 : slot, delay: delay + f * slot, easing: "linear", fill: "forwards" });
  });
  return Promise.all(runs).then(() => svg.remove());
}

/* ---------- what a blow throws on the one it lands on, by its type ---------- */
const IMPACT = {
  Fire: (s, [x, y], size, p) => [
    ...times(6 * p, i => toss(s, "bs-flame", [x + rand(-.3, .3) * size, y + size * .12], { w: size * .16, h: size * .22, dx: rand(-.1, .1) * size, dy: -size * rand(.32, .55), s0: rand(1, 1.4), s1: .2, duration: rand(460, 620), delay: i * 28, fadeAt: .35 })),
    ...sparks(s, "bs-p type-fire", [x, y], size * .65 * p, 6, { lift: -size * .2 }),
  ],
  Water: (s, [x, y], size, p) => [
    ...times(9 * p, () => toss(s, "bs-drop type-water", [x, y], { w: size * .09, h: size * .13, dx: rand(-.6, .6) * size, dy: -size * rand(.18, .42), g: size * .85, s0: 1.1, s1: .7, duration: rand(520, 640), out: false, fadeAt: .7 })),
    ring(s, [x, y + size * .36], size * .5, "Water", { flat: .28, s0: .3, s1: 2.2, duration: 600 }),
    ring(s, [x, y + size * .36], size * .5, "Water", { flat: .28, s0: .2, s1: 1.5, duration: 600, delay: 120, peak: .6 }),
  ],
  Electric: (s, [x, y], size, p) => [
    ...times(3, i => { const a = around(3, i); return bolt(s, [x, y], [x + Math.cos(a) * size * .5 * p, y + Math.sin(a) * size * .5 * p], "Electric", { flicker: 2, depth: .22, duration: 220, delay: i * 50, fork: false, thin: true }); }),
    ...sparks(s, "bs-p type-electric", [x, y], size * .7 * p, 6),
  ],
  Grass: (s, at, size, p) => times(8 * p, i => { const a = around(8, i); return toss(s, "bs-leaf type-grass", at, { w: size * .2, h: size * .1, dx: Math.cos(a) * size * .55, dy: Math.sin(a) * size * .4, g: size * .35, spin: rand(-420, 420), s0: 1.1, s1: .6, duration: rand(560, 720), fadeAt: .6 }); }),
  Ice: (s, [x, y], size, p) => [
    ...times(7, i => {
      const a = around(7, i, .2), r = size * .22;
      const el = bit(s, "bs-crystal type-ice", size * .09, size * .26 * p);
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, turn = (a * 180) / Math.PI + 90;
      return vanish(el, [
        { opacity: 1, transform: T(px, py, `rotate(${turn}deg) scale(1, 0)`), easing: OUT },
        { opacity: 1, transform: T(px, py, `rotate(${turn}deg) scale(1, 1.15)`), offset: .3 },
        { opacity: 1, transform: T(px + Math.cos(a) * 4, py + Math.sin(a) * 4, `rotate(${turn}deg) scale(1, 1)`), offset: .62 },
        { opacity: 0, transform: T(px + Math.cos(a) * 12, py + Math.sin(a) * 12, `rotate(${turn}deg) scale(.6, .6)`) },
      ], { duration: 560, delay: i * 18, easing: "linear" });
    }),
    pop(s, "bs-spark type-ice", [x - size * .12, y - size * .14], { w: size * .3, s0: .1, s1: 1, spin: 90, duration: 420, delay: 160 }),
  ],
  Fighting: (s, [x, y], size, p) => [
    pop(s, "bs-star type-fighting", [x + size * .14, y - size * .1], { w: size * .42, s0: .3, s1: 1.15, rot: 20, duration: 260, delay: 70 }),
    streaks(s, [x, y], size, { n: 6, type: "Fighting", reach: 1.2 * p, delay: 40 }),
  ],
  Poison: (s, [x, y], size, p) => [
    ...times(7 * p, () => toss(s, "bs-orb type-poison", [x, y], { w: size * rand(.07, .12), dx: rand(-.55, .55) * size, dy: -size * rand(.15, .38), g: size * .8, s0: 1, s1: .7, duration: 560, out: false, fadeAt: .7 })),
    ...times(5, i => toss(s, "bs-ring type-poison", [x + rand(-.25, .25) * size, y + size * .2], { w: size * rand(.08, .14), dy: -size * rand(.3, .5), dx: rand(-8, 8), s0: .4, s1: 1.2, duration: 760, delay: 120 + i * 70, fadeAt: .5 })),
  ],
  Ground: (s, [x, y], size, p) => [
    ...puffs(s, [x, y + size * .38], size, 6, { type: "Ground", peak: .5, rise: .3, spread: .45 }),
    ...times(6 * p, () => toss(s, "bs-p type-ground", [x, y + size * .2], { dx: rand(-.5, .5) * size, dy: -size * rand(.3, .55), g: size * .9, spin: rand(-400, 400), s0: 1.2, s1: .8, duration: 600, out: false, fadeAt: .7 })),
  ],
  Rock: (s, [x, y], size, p) => [
    ...times(7 * p, () => toss(s, "bs-p type-rock head", [x, y], { dx: rand(-.55, .55) * size, dy: -size * rand(.2, .45), g: size * .9, spin: rand(-400, 400), s0: rand(.6, 1), s1: .5, duration: 600, out: false, fadeAt: .7 })),
    ...puffs(s, [x, y + size * .3], size, 4, { type: "Rock", peak: .45 }),
  ],
  Flying: (s, [x, y], size, p) => [
    ...times(2, i => pop(s, "bs-crescent type-flying", [x, y], { w: size * .7 * p, h: size * .35 * p, rot: i ? 40 : -40, spin: i ? 60 : -60, s0: .5, s1: 1.2, duration: 360, delay: i * 70 })),
    ...times(5, () => toss(s, "bs-leaf type-flying", [x, y], { w: size * .14, h: size * .06, dx: rand(-.6, .6) * size, dy: rand(-.4, .1) * size, g: size * .3, spin: rand(-300, 300), duration: 700, fadeAt: .6 })),
  ],
  Psychic: (s, [x, y], size) => [
    ...times(3, i => ring(s, [x, y], size * .5, "Psychic", { s0: 2.4 - i * .4, s1: .2, duration: 420, delay: i * 80, easing: IN, peak: .9 })),
    ...sparks(s, "bs-p type-psychic", [x, y], size * .55, 5, { delay: 260 }),
  ],
  Bug: (s, [x, y], size, p) => times(12 * p, i => { const a = around(12, i); return toss(s, "bs-p type-bug", [x, y], { dx: Math.cos(a) * size * .6, dy: Math.sin(a) * size * .45, spin: 720, s0: 1, s1: .3, duration: rand(380, 520), delay: (i % 4) * 30 }); }),
  Ghost: (s, [x, y], size) => [
    ...times(6, i => toss(s, "bs-puff type-ghost", [x + rand(-.3, .3) * size, y + rand(-.1, .2) * size], { w: size * rand(.18, .28), dx: rand(-.15, .15) * size, dy: -size * rand(.25, .45), s0: .5, s1: 1.4, peak: .55, duration: 820, delay: i * 50, fadeAt: .3 })),
    ring(s, [x, y], size * .5, "Ghost", { s0: 1.8, s1: .3, duration: 460, easing: IN }),
  ],
  Dragon: (s, [x, y], size, p) => [
    ...times(10 * p, i => { const a = around(10, i), d = size * rand(.4, .7); return toss(s, "bs-p type-dragon", [x, y], { dx: Math.cos(a + .8) * d, dy: Math.sin(a + .8) * d, spin: 540, s0: 1.3, s1: .3, duration: 560, delay: i * 14 }); }),
    ring(s, [x, y], size * .5, "Dragon", { s0: .3, s1: 2.6, duration: 520, delay: 60, peak: .8, thick: true }),
  ],
  Dark: (s, [x, y], size, p) => [
    ...times(2, i => pop(s, "bs-crescent type-dark", [x, y], { w: size * .75 * p, h: size * .36 * p, rot: i ? 135 : -45, spin: 30, s0: .4, s1: 1.15, duration: 340, delay: i * 80 })),
    ...puffs(s, [x, y], size, 4, { type: "Dark", peak: .5, rise: .2 }),
  ],
  Steel: (s, [x, y], size, p) => [
    ...times(4, i => pop(s, "bs-spark type-steel", [x + rand(-.35, .35) * size, y + rand(-.3, .3) * size], { w: size * rand(.16, .26), s0: .1, s1: 1, spin: 90, duration: 380, delay: i * 60 })),
    ...sparks(s, "bs-p type-steel", [x, y], size * .65 * p, 7),
  ],
  Fairy: (s, [x, y], size, p) => [
    ...times(9 * p, i => { const a = around(9, i), d = size * rand(.35, .65); return toss(s, "bs-spark type-fairy", [x, y], { w: size * rand(.1, .18), dx: Math.cos(a) * d, dy: Math.sin(a) * d - size * .1, spin: 180, s0: .4, s1: 1, duration: rand(520, 700), delay: i * 20, fadeAt: .4 }); }),
    ring(s, [x, y], size * .5, "Fairy", { s0: .3, s1: 2, duration: 480, delay: 60, peak: .8 }),
  ],
};

/* the mark a contact move leaves: fangs close, claws rake, a blade cuts once, two blades cross */
const MARK = {
  fang: (s, [x, y], size) => times(2, i => {
    const el = bit(s, "bs-fang", size * .62, size * .22);
    const from = (i ? 1 : -1) * size * .36, to = (i ? 1 : -1) * size * .07, r = i ? 180 : 0;
    return vanish(el, [
      { opacity: 0, transform: T(x, y + from, `rotate(${r}deg)`), easing: IN },
      { opacity: 1, transform: T(x, y + from * .6, `rotate(${r}deg)`), offset: .3, easing: IN },
      { opacity: 1, transform: T(x, y + to, `rotate(${r}deg) scale(1.05)`), offset: .55 },
      { opacity: 0, transform: T(x, y + to, `rotate(${r}deg) scale(1.1)`) },
    ], { duration: 360, easing: "linear" });
  }),
  claw: (s, [x, y], size, type) => times(3, i => {
    const el = bit(s, `bs-claw ${typeClass(type)}`, size * .9, size * .12);
    const px = x + (i - 1) * size * .17, py = y + (i - 1) * size * .05;
    return vanish(el, [
      { opacity: 1, transform: T(px, py, "rotate(-58deg) scale(0, 1)"), easing: OUT },
      { opacity: 1, transform: T(px, py, "rotate(-58deg) scale(1, 1)"), offset: .4 },
      { opacity: 0, transform: T(px, py, "rotate(-58deg) scale(1.08, .5)") },
    ], { duration: 360, delay: i * 45, easing: "linear" });
  }),
  slash: (s, [x, y], size, type) => {
    const el = bit(s, `bs-crescent ${typeClass(type)}`, size * 1.15, size * .55);
    return vanish(el, [
      { opacity: 0, transform: T(x, y, "rotate(-80deg) scale(.6)"), easing: OUT },
      { opacity: 1, transform: T(x, y, "rotate(-30deg) scale(1)"), offset: .35 },
      { opacity: 0, transform: T(x, y, "rotate(10deg) scale(1.1)") },
    ], { duration: 380, easing: "linear" });
  },
  cross: (s, [x, y], size, type) => times(2, i => {
    const el = bit(s, `bs-claw ${typeClass(type)}`, size * 1, size * .13);
    const r = i ? 45 : -45;
    return vanish(el, [
      { opacity: 1, transform: T(x, y, `rotate(${r}deg) scale(0, 1)`), easing: OUT },
      { opacity: 1, transform: T(x, y, `rotate(${r}deg) scale(1, 1)`), offset: .4 },
      { opacity: 0, transform: T(x, y, `rotate(${r}deg) scale(1.08, .5)`) },
    ], { duration: 380, delay: i * 80, easing: "linear" });
  }),
};
const markOf = id => (/fang|crunch|bite|jawlock/.test(id) ? "fang"
  : /cross|xscissor/.test(id) ? "cross"
    : /claw|scratch|furyswipes/.test(id) ? "claw"
      : /slash|cut|blade|sword|cleave|ceaselessedge|razorshell|kowtow|leafblade/.test(id) ? "slash" : null);

/* a blow lands: a shockwave ring, a star of light, speed lines, and what its type throws; a critical or super effective blow
   (power over 1.25) adds a second ring, a faint wash of its colour and a lean of the camera; a resisted one is smaller.
   shards false: a quiet landing, the ring alone (a status move arriving). */
export function burst(stage, key, type, power = 1, { shards = true, mark = null } = {}) {
  if (!stage || instant()) return Promise.resolve();
  const at = centre(stage, key);
  const size = sizeOf(stage, key);
  const runs = [ring(stage, at, size * .5, type, { s0: .2, s1: 2.2 * Math.min(1.4, power), duration: 420, thick: power >= 1.25 })];
  if (!shards) return Promise.all(runs);
  runs.push(pop(stage, `bs-star ${typeClass(type)}`, at, { w: size * .6 * Math.min(1.5, power), s0: .25, s1: 1.25, rot: rand(0, 36), spin: 18, duration: 280 }));
  if (reduced()) return Promise.all(runs);
  runs.push(streaks(stage, at, size, { n: Math.round(6 + 4 * power), reach: power }));
  runs.push(...(IMPACT[type]?.(stage, at, size, Math.max(.6, power)) || []));
  if (mark && MARK[mark]) runs.push(...[].concat(MARK[mark](stage, at, size, type)));
  if (power >= 1.25) {
    runs.push(ring(stage, at, size * .5, type, { s0: .2, s1: 3.2, duration: 600, delay: 70, peak: .7 }));
    tint(stage, type, .09);
    punch(stage, at, power);
  }
  return Promise.all(runs);
}

/* How each type's move travels: one small table, not a case per move. A flight is a head and a body of the type's shapes along one
   path, sampled densely so it never shows a corner, and the trail it leaves where it passes.
   arc: the path's middle rises by this share of the distance; wave and waves: a weave across the path (its depth as a share of the
   distance, and how many times); zig: a jagged line; spin: turns over the flight (a shape with a face points the way it goes
   instead); grow: the shapes swell as they go (an orb, a pulse); twinkle: they glint; gap: ms between shapes; scale: their size;
   beam: one line drawn at once; bolt: a bolt struck between the two; trail: what is left along the way (TRAIL). */
const FLIGHT = {
  Normal: { head: "orb", body: "p", count: 4, ms: 360, gap: 40, trail: "glint" },
  Fire: { arc: .16, wave: .03, waves: 3, head: "flame", body: "flame", count: 8, ms: 440, gap: 30, trail: "ember" },
  Water: { arc: .05, wave: .04, waves: 2, head: "orb", body: "drop", count: 13, ms: 380, gap: 18, trail: "bubble" },
  Electric: { bolt: true },
  Grass: { wave: .12, waves: 1.5, head: "leaf", body: "leaf", count: 9, ms: 520, spin: 720, gap: 30, trail: "leaf" },
  Ice: { beam: true, trail: "crystal" },
  Fighting: { head: "orb", body: "ring", count: 3, ms: 380, grow: 1.7, gap: 50, trail: "ring" },
  Poison: { arc: .34, head: "orb", body: "orb", count: 4, ms: 520, gap: 60, grow: 1.2, trail: "drip" },
  Ground: { arc: .3, head: "rock", body: "rock", count: 6, ms: 480, trail: "dust" },
  Flying: { head: "crescent", body: "crescent", count: 3, ms: 300, gap: 60, trail: "glint" },
  Psychic: { wave: .07, waves: 1.5, head: "ring", body: "ring", count: 5, ms: 520, grow: 1.8, gap: 60, spin: 0, trail: "ring" },
  Bug: { wave: .1, waves: 3, head: "p", body: "p", count: 14, ms: 440, gap: 18, trail: "spark" },
  Rock: { arc: .26, head: "rock", body: "rock", count: 6, ms: 460, trail: "dust" },
  Ghost: { wave: .14, waves: 1, head: "orb", body: "puff", count: 6, ms: 620, gap: 50, spin: 0, trail: "wisp" },
  Dragon: { wave: .1, waves: 1, head: "orb", body: "p", count: 12, ms: 480, gap: 22, trail: "spark" },
  Dark: { wave: .06, waves: 2, head: "crescent", body: "puff", count: 6, ms: 440, trail: "wisp" },
  Steel: { beam: true, trail: "spark" },
  Fairy: { arc: .2, head: "spark", body: "spark", count: 9, ms: 520, twinkle: true, trail: "spark" },
};
/* the few moves the current regulation sees most that a type alone would not draw: they keep their type's colour and shape and
   change only how they travel. rings: a sound, rings that swell as they go; fall: dropped from above the target; sky: a bolt from
   the sky; beam: a line (width, and how long it holds) */
const SIGNATURE = {
  hypervoice: { rings: true }, boomburst: { rings: true, count: 6 }, snarl: { rings: true }, bugbuzz: { rings: true }, overdrive: { rings: true },
  disarmingvoice: { rings: true }, alluringvoice: { rings: true }, psychicnoise: { rings: true }, sparklingaria: { rings: true }, torchsong: { rings: true }, darkpulse: { rings: true },
  dracometeor: { fall: true, head: "orb", trail: "ember", count: 4, scale: 1.4 }, thunder: { sky: true }, makeitrain: { fall: true, head: "spark", trail: "glint", count: 7 },
  rockslide: { fall: true, trail: null }, blizzard: { fall: true, head: "crystal", trail: "crystal", count: 7 }, meteorbeam: { beam: true, width: 1.8, hold: 380 },
  hyperbeam: { beam: true, width: 2.2, hold: 440 }, solarbeam: { beam: true, width: 1.8, hold: 380, trail: "leaf" }, flashcannon: { beam: true, width: 1.4 }, chargebeam: { beam: true, trail: "glint" },
  psybeam: { beam: true, trail: "ring" }, aurorabeam: { beam: true, trail: "spark" }, dazzlinggleam: { beam: true, width: 1.4, trail: "spark" }, icebeam: { beam: true, width: 1.3 },
  moonblast: { grow: 2.2, count: 3, gap: 60, arc: .1, head: "orb", body: "spark" }, aurasphere: { grow: 2.2, count: 3, arc: 0 }, focusblast: { grow: 2.2, count: 3, arc: .05, scale: 1.2 },
  shadowball: { grow: 1.9, count: 4, gap: 70 }, energyball: { grow: 1.9, count: 3, gap: 60, head: "orb", body: "leaf" }, sludgebomb: { arc: .36, grow: 1.5, count: 5 },
  hurricane: { wave: .16, waves: 2.5, count: 10, ms: 520, head: "crescent", body: "leaf" }, airslash: { count: 4, gap: 60 }, icywind: { wave: .08, waves: 2, count: 10, head: "crystal", body: "crystal" },
  electroweb: { zig: .1, count: 12, head: "p", body: "p", bolt: false }, heatwave: { count: 10 }, eruption: { count: 12, scale: 1.3 }, overheat: { count: 12, scale: 1.3 }, fireblast: { count: 11, scale: 1.25 },
  flamethrower: { count: 12, gap: 22, arc: .08 }, hydropump: { count: 18, gap: 14, scale: 1.25 }, surf: { count: 16 }, muddywater: { count: 16 }, dragonpulse: { rings: true, count: 5 },
};
// powders fall on the target; every other status move at another drifts over as a few soft motes and leaves a ring, no shards
const POWDERS = new Set(["spore", "sleeppowder", "stunspore", "poisonpowder", "magicpowder", "cottonspore"]);
const QUAKES = new Set(["earthquake", "bulldoze", "magnitude", "earthpower", "highhorsepower", "stompingtantrum", "precipiceblades", "headlongrush"]);

// a cheap fixed noise for a jag: the same line for every shard of one flight
const jag = j => { const v = Math.sin(j * 12.9898) * 43758.5453; return v - Math.floor(v); };
function pathOf([ax, ay], [bx, by], { arc = 0, wave = 0, waves = 1, zig = 0 } = {}, i = 0) {
  const dx = bx - ax, dy = by - ay, dist = Math.hypot(dx, dy) || 1, nx = -dy / dist, ny = dx / dist;
  const cx = (ax + bx) / 2, cy = (ay + by) / 2 - dist * arc * 2;
  return t => {
    const x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx;
    const y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by;
    const env = Math.sin(Math.PI * Math.min(1, t));
    const off = (wave ? Math.sin(t * Math.PI * 2 * waves + i * .9) * wave * dist : 0) * env + (zig ? (jag(Math.round(t * 18)) - .5) * 2 * zig * dist * env : 0);
    return [x + nx * off, y + ny * off];
  };
}
// what flies: a class and a size at a phone's stage; face: the turn that points the shape the way it travels
const SHAPE = {
  p: { cls: t => `bs-p ${t}`, w: 0 },
  flame: { cls: () => "bs-flame", w: 13, h: 18, face: -90 },
  drop: { cls: t => `bs-drop ${t}`, w: 8, h: 11, face: -90 },
  leaf: { cls: t => `bs-leaf ${t}`, w: 18, h: 9 },
  orb: { cls: t => `bs-orb ${t}`, w: 16 },
  crescent: { cls: t => `bs-crescent ${t}`, w: 34, h: 17, face: 90 },
  spark: { cls: t => `bs-spark ${t}`, w: 14 },
  ring: { cls: t => `bs-ring ${t}`, w: 26 },
  crystal: { cls: t => `bs-crystal ${t}`, w: 7, h: 18, face: 90 },
  rock: { cls: () => "bs-p type-rock head", w: 0 },
  puff: { cls: t => `bs-puff ${t}`, w: 14 },
};
// what a flight leaves where it passes, left to fade there
const TRAIL = {
  ember: (s, at, type, delay, u) => toss(s, "bs-p type-fire", at, { dx: rand(-8, 8) * u, dy: -rand(14, 30) * u, s0: .9, s1: .2, duration: 520, delay }),
  bubble: (s, at, type, delay, u) => toss(s, "bs-ring type-water", at, { w: rand(6, 11) * u, dx: rand(-6, 6) * u, dy: -rand(10, 24) * u, s0: .5, s1: 1.1, duration: 620, delay, peak: .8 }),
  leaf: (s, at, type, delay, u) => toss(s, `bs-leaf ${typeClass(type)}`, at, { w: 10 * u, h: 5 * u, dx: rand(-14, 14) * u, dy: rand(4, 14) * u, g: 10 * u, spin: rand(-240, 240), s0: 1, s1: .6, duration: 640, delay, out: false }),
  crystal: (s, [x, y], type, delay, u) => pop(s, `bs-crystal ${typeClass(type)}`, [x + rand(-5, 5) * u, y + rand(-5, 5) * u], { w: 5 * u, h: 13 * u, rot: rand(0, 180), s0: .3, s1: 1, duration: 440, delay, peak: .9 }),
  drip: (s, at, type, delay, u) => toss(s, `bs-drop ${typeClass(type)}`, at, { w: 6 * u, h: 8 * u, dy: 4 * u, g: 26 * u, s0: .9, s1: .6, duration: 480, delay, out: false }),
  dust: (s, [x, y], type, delay, u) => toss(s, `bs-puff ${typeClass(type)}`, [x + rand(-6, 6) * u, y + rand(-6, 6) * u], { w: rand(14, 20) * u, dx: rand(-6, 6) * u, dy: -8 * u, s0: .4, s1: 1.4, peak: .3, fadeAt: .15, duration: 620, delay }),
  wisp: (s, at, type, delay, u) => toss(s, `bs-puff ${typeClass(type)}`, at, { w: 14 * u, dx: rand(-8, 8) * u, dy: -rand(10, 20) * u, s0: .6, s1: 1.5, peak: .4, fadeAt: .2, duration: 720, delay }),
  spark: (s, [x, y], type, delay, u) => pop(s, `bs-spark ${typeClass(type)}`, [x + rand(-6, 6) * u, y + rand(-6, 6) * u], { w: 10 * u, s0: .2, s1: 1, spin: 90, duration: 380, delay }),
  ring: (s, at, type, delay, u) => ring(s, at, 22 * u, type, { s0: .4, s1: 1.5, peak: .6, duration: 440, delay }),
  glint: (s, at, type, delay, u) => toss(s, "bs-puff smoke", at, { w: 6 * u, s0: 1, s1: .2, peak: .7, fadeAt: .3, duration: 320, delay }),
};
function emit(stage, at, life, kind, type, n, delay0 = 0) {
  const make = TRAIL[kind];
  if (!make || reduced()) return;
  const u = unitOf(stage);
  for (let j = 1; j <= n; j++) { const t = j / (n + 1); make(stage, at(t), type, delay0 + life * t, u); }
}

// the shapes fly from one point to another; the promise is the impact (the head arriving), the body still flying after it
function fly(stage, a, b, type, style) {
  const { count = 7, ms: duration = 420, gap = 34, spin = 360, grow = 0, twinkle = false, rings = false, past = false, head = "p", body = head, trail = null, scale = 1 } = style;
  const tc = typeClass(type), u = unitOf(stage);
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const end = past ? 1.35 : 1; // a miss flies on past the target
  const pace = Math.min(1.2, Math.max(.55, dist / 160)); // a short way is a short flight, never a hover
  const life = duration * pace * end;
  const STEPS = 18;
  const runs = [];
  for (let i = 0; i < count; i++) {
    const lead = i === 0;
    const kind = SHAPE[rings ? "ring" : lead ? head : body] || SHAPE.p;
    const at = pathOf(a, b, style, i);
    const el = bit(stage, `${kind.cls(tc)}${lead && kind.cls(tc).startsWith("bs-p") ? " head" : ""}`, kind.w * u * scale, (kind.h || kind.w) * u * scale);
    const s = rings ? 1 : lead ? 1.4 : 1.2 - i * (.5 / count);
    const frames = Array.from({ length: STEPS + 1 }, (_, j) => {
      const t = (j / STEPS) * end;
      const [x, y] = at(t);
      const [x2, y2] = at(t + .02);
      const turn = kind.face != null ? (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI + kind.face : spin * t;
      const sc = rings ? lerp(.35, 1.7, t) : s * (grow ? lerp(.7, grow, t) : 1) * (twinkle ? (j % 3 === 1 ? 1.5 : .8) : 1);
      const fade = past && t > 1 ? Math.max(0, 1 - (t - 1) / (end - 1)) : rings ? lerp(1, .45, t) : j === STEPS && !lead ? .2 : 1;
      return { offset: j / STEPS, opacity: j === 0 ? 0 : fade, transform: T(x, y, `rotate(${turn}deg) scale(${sc})`) };
    });
    runs.push(vanish(el, frames, { duration: life, delay: i * gap, easing: "linear" }));
  }
  if (trail) emit(stage, pathOf(a, b, style, 0), life / end, trail, type, Math.round(Math.min(14, dist / 22)));
  return runs[0];
}

/* one line drawn from the user to the target at once, swelling twice while it holds, motes running down it, then thinning out;
   the promise is the impact (the line reaching) */
function beam(stage, [ax, ay], [bx, by], type, { past = false, width = 1, hold = 260, trail = null } = {}) {
  const dist = Math.hypot(bx - ax, by - ay) * (past ? 1.6 : 1);
  const u = unitOf(stage), w = width * u;
  const el = spawn(stage, `bs-beam ${typeClass(type)}`, [ax, ay], { width: `${dist}px` });
  const turn = `rotate(${Math.atan2(by - ay, bx - ax)}rad)`;
  const reach = 150, total = reach + hold + 220;
  vanish(el, [
    { opacity: 1, transform: `translateY(-50%) ${turn} scale(0, ${w * .6})`, easing: OUT },
    { opacity: 1, transform: `translateY(-50%) ${turn} scale(1, ${w * 1.25})`, offset: reach / total, easing: SWAY },
    { opacity: 1, transform: `translateY(-50%) ${turn} scale(1, ${w * .85})`, offset: (reach + hold * .5) / total, easing: SWAY },
    { opacity: 1, transform: `translateY(-50%) ${turn} scale(1, ${w * 1.15})`, offset: (reach + hold) / total, easing: IN },
    { opacity: 0, transform: `translateY(-50%) ${turn} scale(1, .05)` },
  ], { duration: total, easing: "linear" });
  ring(stage, [ax, ay], 30 * u * width, type, { s0: .5, s1: 1.6, duration: 360 });
  if (!reduced()) {
    const at = t => [lerp(ax, bx, t), lerp(ay, by, t)];
    times(6, i => {
      const p = bit(stage, `bs-spark ${typeClass(type)}`, 10 * u, 10 * u);
      return vanish(p, Array.from({ length: 9 }, (_, j) => { const t = j / 8, [x, y] = at(t); return { offset: t, opacity: j === 0 || j === 8 ? 0 : 1, transform: T(x, y, `rotate(${t * 180}deg)`) }; }), { duration: 220, delay: reach + i * (hold / 6), easing: "linear" });
    });
    if (trail) emit(stage, at, hold, trail, type, 6, reach);
  }
  return wait(reach * .9);
}

// shapes dropped from above onto a point (Rock Slide, Draco Meteor, Make It Rain, Blizzard); the promise is the first landing
function fall(stage, [x, y], type, size, { count = 4, ms: duration = 380, head = "rock", trail = null, scale = 1 } = {}) {
  const u = unitOf(stage), kind = SHAPE[head] || SHAPE.rock, tc = typeClass(type);
  const runs = times(count, i => {
    const off = (i % 2 ? 1 : -1) * size * (.12 + (i * .37 % 1) * .3);
    const from = [x + off * 1.6, y - size * 1.5], to = [x + off * .4, y];
    const el = bit(stage, kind.cls(tc), kind.w * u * scale, (kind.h || kind.w) * u * scale);
    const face = kind.face != null ? (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI + kind.face : null;
    const run = vanish(el, [
      { opacity: 0, transform: T(from[0], from[1], `rotate(${face ?? 0}deg) scale(1.5)`), easing: IN },
      { opacity: 1, transform: T(lerp(from[0], to[0], .3), lerp(from[1], to[1], .3), `rotate(${face ?? 60}deg) scale(1.5)`), offset: .25, easing: IN },
      { opacity: 1, transform: T(to[0], to[1], `rotate(${face ?? 220}deg) scale(1.5)`) },
    ], { duration, delay: i * 70, easing: "linear" });
    if (trail) emit(stage, t => [lerp(from[0], to[0], t), lerp(from[1], to[1], t)], duration, trail, type, 5, i * 70);
    // each one lands with its own small puff
    if (!reduced()) wait(duration + i * 70).then(() => { if (!instant()) Promise.all(puffs(stage, to, size * .6, 2, { type, peak: .4 })); });
    return run;
  });
  return runs[0];
}

// a bolt from the sky onto the target (Thunder): struck three times, the stage washed faintly in its colour
function skyBolt(stage, [x, y], size) {
  const top = [x + rand(-.2, .2) * size, -10];
  tint(stage, "Electric", .1, 420);
  bolt(stage, top, [x, y], "Electric", { flicker: 3, depth: .07, duration: 420 });
  return wait(90);
}

// a sound or a heat across the field: two flat rings open from the user's feet over the whole court, motes on their edge
function sweep(stage, from, type) {
  const [x, y] = centre(stage, from, .05);
  const size = sizeOf(stage, from);
  ring(stage, [x, y], size, type, { s0: .3, s1: 5, flat: .32, peak: .9, duration: 560 });
  ring(stage, [x, y], size, type, { s0: .2, s1: 3.6, flat: .32, peak: .6, duration: 560, delay: 90 });
  if (!reduced()) sparks(stage, `bs-p ${typeClass(type)}`, [x, y], size * 2, 10, { lift: -size * .1, duration: 560 });
  return wait(200);
}

// a light gathers at the user before a special move leaves: motes spiral in, a ring closes, a glint where they meet
export function charge(stage, key, type, duration = 300) {
  if (!stage || instant() || !monEl(stage, key)) return Promise.resolve();
  const [x, y] = centre(stage, key);
  const size = sizeOf(stage, key), u = unitOf(stage), tc = typeClass(type);
  const ringEl = bit(stage, `bs-ring ${tc}`, size * .9, size * .9);
  const runs = [vanish(ringEl, [{ opacity: 0, transform: T(x, y, "scale(1.4)") }, { opacity: 1, transform: T(x, y, "scale(.8)"), offset: .5 }, { opacity: 0, transform: T(x, y, "scale(.15)") }], { duration, easing: IN })];
  if (!reduced()) {
    runs.push(...times(8, i => {
      const a0 = (i / 8) * Math.PI * 2, el = bit(stage, i % 2 ? `bs-spark ${tc}` : `bs-p ${tc}`, i % 2 ? 10 * u : 0);
      return vanish(el, Array.from({ length: 9 }, (_, j) => {
        const t = j / 8, a = a0 + t * 2.4, r = size * .7 * (1 - t) ** 1.4;
        return { offset: t, opacity: j === 0 ? 0 : t > .85 ? .4 : 1, transform: T(x + Math.cos(a) * r, y + Math.sin(a) * r * .8, `rotate(${t * 200}deg) scale(${lerp(1.1, .4, t)})`) };
      }), { duration, delay: i * 12, easing: "linear" });
    }));
    runs.push(pop(stage, `bs-spark ${tc}`, [x, y], { w: size * .32, s0: .1, s1: 1, spin: 90, duration: 260, delay: duration * .8 }));
  }
  return Promise.all(runs);
}

// rings rise around a Pokémon and its type's shapes spiral up it: a move on itself
function aura(stage, key, type, rings = 3, duration = 620) {
  const [x, y] = centre(stage, key, .02);
  const size = sizeOf(stage, key), u = unitOf(stage), tc = typeClass(type);
  const runs = times(rings, i => {
    const el = bit(stage, `bs-aura ${tc}`, size * .9, size * .28);
    return vanish(el, [{ opacity: 0, transform: T(x, y, "translateY(0) scale(.6)") }, { opacity: .9, offset: .3 }, { opacity: 0, transform: T(x, y, `translateY(${-size * .8}px) scale(1.1)`) }], { duration, delay: i * 120, easing: OUT });
  });
  if (!reduced()) {
    runs.push(...times(10, i => {
      const a0 = (i / 10) * Math.PI * 2, el = bit(stage, i % 3 ? `bs-p ${tc}` : `bs-spark ${tc}`, i % 3 ? 0 : 11 * u);
      return vanish(el, Array.from({ length: 11 }, (_, j) => {
        const t = j / 10, a = a0 + t * Math.PI * 2;
        return { offset: t, opacity: j === 0 ? 0 : 1 - t * .8, transform: T(x + Math.cos(a) * size * .42, y - t * size * .85 + Math.sin(a) * size * .08, `scale(${lerp(1, .5, t)})`) };
      }), { duration: duration * 1.1, delay: i * 26, easing: "linear" });
    }));
    runs.push(pop(stage, `bs-spark ${tc}`, [x, y - size * .9], { w: size * .3, s0: .1, s1: 1, spin: 90, duration: 320, delay: duration * .7 }));
  }
  return Promise.all(runs);
}

/* the user's picture travels toward its target and back (a physical move): wind back (out), dash (in, fast), a beat on the blow
   (the impact frame), then home (in and out), two afterimages following it, its type's trail left on the way. A priority move
   dashes with no wind-up. `short` stops at a guard. The promise is the contact; the way home goes on while the blow lands. */
function lunge(stage, from, to, type, { quick = false, short = false } = {}) {
  const el = monEl(stage, from);
  if (!el || reduced()) return Promise.resolve();
  const [ax, ay] = centre(stage, from);
  const [bx, by] = centre(stage, to);
  const reach = short ? .4 : .62;
  const dx = (bx - ax) * reach, dy = (by - ay) * reach;
  const duration = quick ? 400 : 560;
  const strike = quick ? .3 : .48;
  const frames = quick ? [
    { transform: "none", easing: IN },
    { transform: `translate(${dx}px, ${dy}px) scale(1.04)`, offset: strike, easing: "linear" },
    { transform: `translate(${dx * .97}px, ${dy * .97}px) scale(1.02)`, offset: .42, easing: SWAY },
    { transform: "none" },
  ] : [
    { transform: "none", easing: OUT },
    { transform: `translate(${-dx * .08}px, ${-dy * .08}px) scale(.96)`, offset: .3, easing: IN },
    { transform: `translate(${dx}px, ${dy}px) scale(1.04)`, offset: strike, easing: "linear" },
    { transform: `translate(${dx * .97}px, ${dy * .97}px) scale(1.02)`, offset: .56, easing: SWAY },
    { transform: "none" },
  ];
  play(el, frames, { duration, easing: "linear", fill: "none" });
  afterimages(stage, el, frames, duration, strike);
  // the dash leaves its type behind it, from where it sets off to where it strikes
  const set = quick ? 0 : .3;
  const trail = type === "Normal" ? "glint" : FLIGHT[type]?.trail || "glint";
  emit(stage, t => [lerp(ax - dx * .08, ax + dx, t), lerp(ay - dy * .08, ay + dy, t)], duration * (strike - set), trail, type, 5, duration * set);
  return wait(duration * strike);
}
// copies of the picture that follow a dash a few frames late and fade, so speed reads as speed
function afterimages(stage, el, frames, duration, strike) {
  const img = el.querySelector("img");
  const fx = fxOf(stage);
  if (!img || !fx) return;
  const box = stage.getBoundingClientRect(), r = img.getBoundingClientRect();
  const flip = ownSide(el) ? " scaleX(-1)" : "";
  [[.34, 40], [.18, 80]].forEach(([peak, lag]) => {
    const ghost = new Image();
    ghost.src = img.currentSrc || img.src;
    ghost.alt = "";
    ghost.className = "bs-after";
    Object.assign(ghost.style, { left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    fx.appendChild(ghost);
    vanish(ghost, frames.map((f, i) => ({ ...f, transform: `${f.transform === "none" ? "" : f.transform}${flip}` || "none", opacity: i === 0 || i === frames.length - 1 ? 0 : (f.offset ?? 1) <= strike + .01 ? peak : peak * .4 })), { duration, delay: lag, easing: "linear" });
  });
}

// a target that is missed steps aside and back, leaving a faint copy where it stood
function dodge(stage, key) {
  const el = monEl(stage, key);
  if (!el || reduced()) return Promise.resolve();
  const d = sizeOf(stage, key) * .18 * (ownSide(el) ? -1 : 1);
  const frames = [{ transform: "none", easing: OUT }, { transform: `translateX(${d}px)`, offset: .35, easing: SWAY }, { transform: `translateX(${d}px)`, offset: .55 }, { transform: "none" }];
  afterimages(stage, el, frames, 420, .35);
  return play(el, frames, { duration: 420, easing: "linear", fill: "none", composite: "add" });
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
  const mark = event.category === "Physical" ? markOf(id || "") : null;
  const land = k => {
    if (blocked(k)) return null;
    if (missed(k)) return dodge(stage, k);
    return burst(stage, k, type, power(k), { shards: event.category !== "Status", mark });
  };
  if (event.verb === "self") { await Promise.all([aura(stage, from, type), flashMon(stage, from, .6)]); return; }
  if (!targets.length) { await flashMon(stage, from, .4); return; }
  if (reduced()) { targets.forEach(land); await wait(240); return; }
  const sig = SIGNATURE[id] || {};
  const at = (k, lift) => centre(stage, k, lift);
  const style = { ...FLIGHT[type] || FLIGHT.Normal, ...sig };
  if (event.category === "Physical" && !event.spread) {
    const t = targets[0];
    if (sig.fall) { await fall(stage, at(t), type, sizeOf(stage, t), style); land(t); return; }
    await lunge(stage, from, t, type, { quick: event.priority > 0, short: blocked(t) });
    land(t);
    return;
  }
  if (event.category === "Physical") {
    // a spread physical move: the user rears up and every target takes it at once; a quake shakes the stage, a slide drops rocks
    play(monEl(stage, from), [{ transform: "none" }, { transform: "translateY(-14%) scale(1.05)" }, { transform: "none" }], { duration: 360, easing: OUT, fill: "none" });
    if (sig.fall) await Promise.all(targets.map(t => fall(stage, at(t), type, sizeOf(stage, t), style)));
    else { if (QUAKES.has(id)) quake(stage, from); await wait(200); }
    if (QUAKES.has(id)) shake(stage, 1.2);
    targets.forEach(land);
    return;
  }
  const status = event.category === "Status";
  if (status && POWDERS.has(id)) {
    await Promise.all(targets.map(t => fall(stage, at(t, .9), type, sizeOf(stage, t) * .6, { count: 6, ms: 520, head: "p", trail: "spark" })));
    targets.forEach(land);
    return;
  }
  // special and status moves aimed at another: a light gathers, and the flight leaves as it closes, never after a dead beat
  charge(stage, from, type, status ? 220 : 300);
  await wait(status ? 160 : 220);
  const soft = status ? { ...style, beam: false, bolt: false, sky: false, fall: false, rings: false, grow: 0, count: 4, ms: Math.max(480, (style.ms || 420) * 1.2), gap: 70, wave: style.wave || .08, head: "spark", body: "p", trail: "spark" } : style;
  const one = t => {
    const a = at(from), b = at(t);
    const past = missed(t);
    if (blocked(t)) { const r = sizeOf(stage, t) * .6, d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; b[0] -= (b[0] - a[0]) / d * r; b[1] -= (b[1] - a[1]) / d * r; }
    if (soft.sky && !past) return skyBolt(stage, b, sizeOf(stage, t));
    if (soft.fall) return fall(stage, b, type, sizeOf(stage, t), soft);
    if (soft.beam) return beam(stage, a, b, type, { past, width: soft.width, hold: soft.hold, trail: soft.trail });
    if (soft.bolt) { bolt(stage, a, past ? [a[0] + (b[0] - a[0]) * 1.4, a[1] + (b[1] - a[1]) * 1.4] : b, type, { duration: 340 }); return wait(70); }
    return fly(stage, a, b, type, { ...soft, past });
  };
  if (event.spread && !soft.rings && !soft.fall) { await sweep(stage, from, type); await Promise.all(targets.map(one)); }
  else await Promise.all(targets.map(one));
  if (QUAKES.has(id)) shake(stage, 1);
  targets.forEach(land);
}
// the ground answers a quake: cracks of dust run out across the court from the user's feet
function quake(stage, from) {
  if (reduced()) return;
  const [x, y] = centre(stage, from, .02);
  const size = sizeOf(stage, from);
  ring(stage, [x, y], size, "Ground", { s0: .3, s1: 5, flat: .3, duration: 620, thick: true });
  times(10, i => { const a = (i / 10) * Math.PI * 2; Promise.all(puffs(stage, [x + Math.cos(a) * size * 1.2, y + Math.sin(a) * size * .35], size, 1, { type: "Ground", peak: .5, delay: 80 + i * 20 })); });
}

/* ---------- what happens to a Pokémon ---------- */
export function flashMon(stage, key, strength = 1) {
  const img = monEl(stage, key)?.querySelector("img");
  if (!img || instant()) return Promise.resolve();
  // faint, as Showdown keeps it: the picture lifts toward light, it never turns white
  return play(img, [{ filter: "brightness(1)" }, { filter: `brightness(${1 + .7 * strength})` }, { filter: "brightness(1)" }], { duration: 240, fill: "none" });
}
/* a blow lands: the picture is knocked back away from the foe and settles, and flashes; how hard is how much it took, a critical
   or super effective blow harder, a resisted one softer. HP lost to the field or a status (direct: false) only shudders in place.
   A substitute squashes and springs back as it takes the blow.
   composite add: it moves on top of whatever the picture is doing (an attacker still on its way home), never replacing it */
export function hit(stage, key, { share = .2, crit = false, strong = false, weak = false, direct = true } = {}) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  const p = (3 + Math.min(1, share) * 9) * (crit ? 1.3 : 1) * (strong ? 1.15 : weak ? .7 : 1);
  const sx = ownSide(el) ? -1 : 1, sy = ownSide(el) ? .35 : -.35;
  const frames = direct
    ? [{ transform: "none", easing: OUT }, { transform: `translate(${sx * p * 1.4}px, ${sy * p}px)`, offset: .12, easing: SWAY },
      { transform: `translate(${-sx * p * .45}px, ${-sy * p * .3}px)`, offset: .36, easing: SWAY },
      { transform: `translate(${sx * p * .2}px, 0)`, offset: .6, easing: SWAY }, { transform: "none" }]
    : [{ transform: "none" }, { transform: "translateY(2px)" }, { transform: "translateY(-1px)" }, { transform: "translateY(2px)" }, { transform: "none" }];
  const shook = reduced() ? Promise.resolve() : play(el, frames, { duration: direct ? 420 : 320, easing: "linear", fill: "none", composite: "add" });
  const sub = el.querySelector(".bs-sub");
  if (sub && direct && !reduced()) play(sub, [{ transform: "none", easing: OUT }, { transform: "scale(1.16, .8)", offset: .2, easing: SWAY }, { transform: "scale(.94, 1.08)", offset: .55, easing: SWAY }, { transform: "none" }], { duration: 440, fill: "none" });
  return Promise.all([shook, flashMon(stage, key, direct ? (strong || crit ? 1.3 : weak ? .6 : 1) : .45), crit ? shake(stage, .8) : null]);
}

/* a status drawn on a Pokémon in its own shapes: a burn's flames lick up it, paralysis crackles over it, poison bubbles up out of
   it, sleep lets out slow Zs, a freeze closes crystals round it. n: how much (a residual tick is lighter than the status landing) */
const AILMENT = {
  brn: (s, [x, y], size, n) => times(6 * n, i => toss(s, "bs-flame", [x + rand(-.36, .36) * size, y + size * .32], { w: size * .14, h: size * .2, dx: rand(-.06, .06) * size, dy: -size * rand(.3, .55), s0: 1.1, s1: .2, duration: rand(560, 720), delay: i * 60, fadeAt: .35 })),
  par: (s, [x, y], size, n) => times(3 * n, i => { const a = around(3, i, .6), b = a + rand(1.4, 2.2); return bolt(s, [x + Math.cos(a) * size * .32, y + Math.sin(a) * size * .32], [x + Math.cos(b) * size * .3, y + Math.sin(b) * size * .3], "Electric", { flicker: 2, depth: .3, duration: 200, delay: i * 90, fork: false, thin: true }); }),
  psn: (s, [x, y], size, n) => times(7 * n, i => toss(s, i % 3 ? "bs-ring type-poison" : "bs-orb type-poison", [x + rand(-.3, .3) * size, y + size * .25], { w: size * rand(.07, .13), dx: rand(-.05, .05) * size, dy: -size * rand(.35, .6), s0: .4, s1: 1.2, duration: rand(640, 820), delay: i * 70, fadeAt: .5 })),
  slp: (s, [x, y], size, n) => times(3 * n, i => toss(s, "bs-z", [x + size * .12, y - size * .3], { w: size * (.11 + i * .03), dx: size * (.18 + i * .08), dy: -size * (.3 + i * .12), spin: -20, s0: .4, s1: 1.2, duration: 900, delay: i * 240, fadeAt: .6, out: false })),
  frz: (s, [x, y], size) => [
    ...times(8, i => {
      const a = around(8, i, .15), r = size * .42, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * .9, turn = (a * 180) / Math.PI - 90;
      const el = bit(s, "bs-crystal type-ice", size * .08, size * .22);
      return vanish(el, [{ opacity: 0, transform: T(px, py, `rotate(${turn}deg) scale(.2)`), easing: OUT }, { opacity: 1, transform: T(px, py, `rotate(${turn}deg) scale(1)`), offset: .35 }, { opacity: 1, offset: .7, transform: T(px, py, `rotate(${turn}deg) scale(1)`) }, { opacity: 0, transform: T(px, py, `rotate(${turn}deg) scale(1.2)`) }], { duration: 760, delay: i * 30, easing: "linear" });
    }),
    pop(s, "bs-spark type-ice", [x + size * .14, y - size * .2], { w: size * .3, s0: .1, s1: 1, spin: 90, duration: 420, delay: 380 }),
  ],
};
AILMENT.tox = AILMENT.psn;
const ailment = (stage, key, id, n = 1) => (reduced() || !AILMENT[id] ? Promise.resolve() : Promise.all([].concat(AILMENT[id](stage, centre(stage, key), sizeOf(stage, key), n))));

/* HP lost to the field or a status, drawn in what took it: a burn's flames, poison's bubbles, the sand's grains blown across it,
   hail on it, rocks dropped on a Pokémon coming in over Stealth Rock. Recoil and a confused self-hit have no shape of their own. */
const RESIDUAL = { sandstorm: "Rock", hail: "Ice", spikes: "Ground", leechseed: "Grass", saltcure: "Rock", curse: "Ghost", nightmare: "Ghost", partiallytrapped: "Normal", lifeorb: "Psychic", rockyhelmet: "Steel", roughskin: "Normal", ironbarbs: "Steel", blacksludge: "Poison", stickybarb: "Steel", bind: "Normal", firespin: "Fire", whirlpool: "Water", sandtomb: "Ground", infestation: "Bug", magmastorm: "Fire" };
export function residual(stage, key, from) {
  if (!stage || instant() || !monEl(stage, key)) return Promise.resolve();
  if (from === "brn" || from === "psn" || from === "tox") return ailment(stage, key, from, .6);
  const at = centre(stage, key), size = sizeOf(stage, key);
  if (from === "stealthrock") return reduced() ? burst(stage, key, "Rock", .5, { shards: false }) : fall(stage, at, "Rock", size, { count: 3, trail: "dust" }).then(() => Promise.all(IMPACT.Rock(stage, at, size, .5)));
  if (from === "sandstorm" && !reduced()) return Promise.all(times(10, i => toss(stage, i % 2 ? "bs-p type-rock" : "bs-streak typed type-rock", [at[0] - size * .7, at[1] + rand(-.35, .3) * size], { w: i % 2 ? 0 : size * .2, h: i % 2 ? 0 : 2, dx: size * 1.4, dy: size * .1, s0: 1, s1: .8, out: false, duration: 380, delay: i * 30, fadeAt: .7 })));
  if (from === "hail" && !reduced()) return fall(stage, at, "Ice", size * .7, { count: 5, head: "crystal", ms: 320 });
  const type = RESIDUAL[from];
  if (!type) return Promise.resolve();
  return Promise.all([ring(stage, at, size * .5, type, { s0: .3, s1: 1.6, duration: 380 }), ...(reduced() ? [] : IMPACT[type]?.(stage, at, size, .5) || [])]);
}

// HP that flows from one Pokémon to another (a draining move, Leech Seed): green motes and leaves stream from the one losing it
export function flow(stage, from, to) {
  if (!stage || instant() || reduced() || !slotEl(stage, from) || !slotEl(stage, to) || from === to) return Promise.resolve();
  return fly(stage, centre(stage, from), centre(stage, to), "Grass", { wave: .1, waves: 1, count: 9, ms: 560, gap: 40, spin: 0, head: "orb", body: "p", trail: "spark" });
}

// why a Pokémon could not move: paralysis crackles and jolts it, sleep lets out Zs, a freeze glints, a flinch jolts it back
export function cant(stage, key, why) {
  if (!stage || instant() || !monEl(stage, key)) return Promise.resolve();
  if (why === "par") return Promise.all([ailment(stage, key, "par"), hit(stage, key, { share: 0, direct: false }), flashMon(stage, key, .4)]);
  if (why === "slp") return reduced() ? flashMon(stage, key, .3) : ailment(stage, key, "slp");
  if (why === "frz") return Promise.all([ailment(stage, key, "frz"), flashMon(stage, key, .6)]);
  if (why === "flinch") {
    const at = centre(stage, key, .7);
    return Promise.all([hit(stage, key, { share: 0, weak: true }), reduced() ? null : streaks(stage, at, sizeOf(stage, key) * .7, { n: 5, reach: .8 })]);
  }
  return flashMon(stage, key, .4);
}

// confused: the picture sways side to side before it acts (or hurts itself), small stars turning over its head
export function sway(stage, key) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  if (reduced()) return flashMon(stage, key, .3);
  const [x, y] = centre(stage, key, .92), size = sizeOf(stage, key);
  const stars = times(3, i => {
    const s = bit(stage, "bs-spark type-electric", size * .14, size * .14);
    return vanish(s, Array.from({ length: 17 }, (_, j) => { const t = j / 16, a = (i / 3) * Math.PI * 2 + t * Math.PI * 3; return { offset: t, opacity: j === 0 || j === 16 ? 0 : Math.sin(a) > -.2 ? 1 : .45, transform: T(x + Math.cos(a) * size * .26, y + Math.sin(a) * size * .07, `scale(${Math.sin(a) > 0 ? 1 : .75})`) }; }), { duration: 900, easing: "linear" });
  });
  return Promise.all([...stars, play(el, [{ transform: "none" }, { transform: "rotate(-6deg)" }, { transform: "rotate(6deg)" }, { transform: "rotate(-4deg)" }, { transform: "none" }], { duration: 640, easing: SWAY, fill: "none", composite: "add" })]);
}

// before a substitute: the Pokémon shrinks into a puff of smoke (Stage.jsx swaps in the doll once it has gone)
export function hideForDoll(stage, key) {
  const mon = monEl(stage, key);
  if (instant() || !mon) return Promise.resolve();
  if (reduced()) return play(mon, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" });
  const [x, y] = centre(stage, key, .12), size = sizeOf(stage, key);
  puffs(stage, [x, y], size, 8, { peak: .55, rise: .35, spread: .32 });
  return play(mon, [{ opacity: 1, transform: "none", easing: IN }, { opacity: 0, transform: "scale(.6)" }], { duration: 220, fill: "forwards" });
}
/* a substitute: a puff of smoke, and the doll drops onto the Pokémon's place, squashes as it lands and springs up; when it falls it
   squashes once more and bursts in a puff of stuffing and scraps, and the Pokémon comes back where it stood */
export function doll(stage, key, on) {
  const mon = monEl(stage, key);
  const sub = mon?.querySelector(".bs-sub"), img = mon?.querySelector("img");
  if (instant() || !mon) return Promise.resolve();
  const [x, y] = centre(stage, key, .12), size = sizeOf(stage, key);
  if (on) {
    if (!sub) return Promise.resolve();
    settle(mon); // the hiding let go: the doll is what shows now
    if (reduced()) return play(sub, [{ opacity: 0 }, { opacity: 1 }], { duration: 360, fill: "backwards" });
    return Promise.all([
      ...puffs(stage, [x, y], size, 4, { peak: .45, rise: .25, spread: .3, delay: 200 }),
      play(sub, [
        { transform: `translateY(${-size * .45}px) scale(.8)`, opacity: 0, easing: IN },
        { transform: "translateY(0) scale(1)", opacity: 1, offset: .42, easing: OUT },
        { transform: "scale(1.2, .76)", offset: .56, easing: SWAY },
        { transform: "scale(.9, 1.12)", offset: .76, easing: SWAY },
        { transform: "none" },
      ], { duration: 640, fill: "backwards" }),
    ]);
  }
  // after the doll went: the Pokémon comes back out of the smoke where it stood
  if (!img) return Promise.resolve();
  return play(img, [{ opacity: 0, filter: "brightness(1.8)" }, { opacity: 1, filter: "brightness(1.3)", offset: .5 }, { opacity: 1, filter: "brightness(1)" }], { duration: 360, easing: OUT, fill: "backwards" });
}
export function breakDoll(stage, key) {
  const sub = monEl(stage, key)?.querySelector(".bs-sub");
  if (!sub || instant()) return Promise.resolve();
  if (reduced()) return play(sub, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: "forwards" });
  const [x, y] = centre(stage, key, .28), size = sizeOf(stage, key);
  // the scraps and smoke play on while the Pokémon comes back, so there is no empty beat between the doll and it
  puffs(stage, [x, y + size * .1], size, 8, { peak: .55, rise: .4, spread: .3, delay: 120 });
  times(9, i => toss(stage, i % 3 ? "bs-scrap" : "bs-scrap dark", [x, y], { w: size * rand(.06, .1), h: size * rand(.05, .08), dx: rand(-.7, .7) * size, dy: -size * rand(.2, .55), g: size * .95, spin: rand(-540, 540), s0: 1.2, s1: .8, duration: rand(600, 760), delay: 120, out: false, fadeAt: .6 }));
  ring(stage, [x, y], size * .5, "Normal", { s0: .3, s1: 2, duration: 420, delay: 120 });
  return play(sub, [
    { opacity: 1, transform: "none", easing: IN },
    { opacity: 1, transform: "scale(1.18, .78)", offset: .4, easing: OUT },
    { opacity: 0, transform: "scale(.7, 1.3) translateY(-12%)" },
  ], { duration: 300, fill: "forwards" });
}

// Transform: the picture narrows to a line of light and opens again as the other, sparks thrown from the line
export function morph(stage, key) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  if (reduced()) return flashMon(stage, key, 1);
  const at = centre(stage, key), size = sizeOf(stage, key);
  wait(280).then(() => { if (!instant()) Promise.all(sparks(stage, "bs-spark type-normal", at, size * .7, 8, { w: size * .1 })); });
  return Promise.all([
    play(el, [{ transform: "none", easing: IN }, { transform: "scaleX(.08)", offset: .45 }, { transform: "scaleX(.08)", offset: .55, easing: OUT }, { transform: "none" }], { duration: 620, easing: "linear", fill: "none", composite: "add" }),
    play(el.querySelector("img"), [{ filter: "brightness(1)" }, { filter: "brightness(2.4)", offset: .5 }, { filter: "brightness(1)" }], { duration: 620, fill: "none" }),
  ]);
}

// a move that takes a turn to charge (Solar Beam, Meteor Beam): the light gathers twice and stays gathered a beat
export async function gather(stage, key, type) {
  if (!stage || instant() || !monEl(stage, key)) return;
  await Promise.all([charge(stage, key, type, 420), reduced() ? null : aura(stage, key, type, 2, 520)]);
  await Promise.all([charge(stage, key, type, 300), flashMon(stage, key, .5)]);
}

// Trick Room: the space turns a little and comes back, as the room comes up round the court
export function twist(stage) {
  const el = stage?.querySelector(".bs-world");
  if (!el || instant() || reduced()) return Promise.resolve();
  el.style.transformOrigin = "";
  return play(el, [{ transform: "none" }, { transform: "rotate(-1.4deg) scale(1.03)", offset: .4 }, { transform: "rotate(.6deg) scale(1.01)", offset: .7 }, { transform: "none" }], { duration: 760, easing: SWAY, fill: "none" });
}

// a screen broken by a blow (Brick Break, Psychic Fangs): its dome falls apart in shards of its colour before it fades
const SCREEN_TYPE = { reflect: "Psychic", lightscreen: "Electric", auroraveil: "Ice" };
export function shatter(stage, own, id) {
  const dome = stage?.querySelector(`.bs-screens.${own ? "own" : "foe"} .bs-dome.${id}`);
  if (!dome || instant() || !SCREEN_TYPE[id]) return Promise.resolve();
  if (reduced()) return flashStage(stage, .12, 260);
  const r = dome.getBoundingClientRect(), box = stage.getBoundingClientRect(), u = unitOf(stage);
  // the dome itself goes as its shards fly (it stays the same node while it leaves, so it never comes back)
  play(dome, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: OUT, fill: "forwards" });
  return Promise.all(times(16, i => {
    const t = (i + .5) / 16;
    const x = r.left - box.left + t * r.width, y = r.top - box.top + (1 - Math.sin(Math.PI * t)) * r.height;
    return toss(stage, `bs-crystal ${typeClass(SCREEN_TYPE[id])}`, [x, y], { w: rand(5, 8) * u, h: rand(12, 20) * u, dx: (t - .5) * 50, dy: -8, g: r.height * .7, spin: rand(-300, 300), face: rand(0, 180), s0: 1.2, s1: .7, duration: 680, delay: (i % 4) * 30, out: false, fadeAt: .6 });
  }));
}
// the HP that went or came back rises over the Pokémon; the hits of one multi-hit move (slot 0, 1, 2…) stack at its side, one
// plate above the other, so they never cover each other or the count over its head
export function number(stage, key, text, heal = false, slot = null) {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .25);
  const size = sizeOf(stage, key);
  const at = slot == null ? [x, y] : [x + size * .46, y + size * .2 - Math.min(slot, 5) * 26];
  const el = spawn(stage, `bt-num${heal ? " heal" : ""}`, at);
  el.textContent = text;
  return vanish(el, [
    { opacity: 0, transform: "translate(-50%, -50%) translateY(12px)" },
    { opacity: 1, transform: "translate(-50%, -50%)", offset: .2, easing: OUT },
    { opacity: 1, transform: "translate(-50%, -50%) translateY(-12px)", offset: .75 },
    { opacity: 0, transform: "translate(-50%, -50%) translateY(-24px)" },
  ], { duration: 1000 });
}
// HP moves: one sweep across the ten cells, quick at first and settling, each cell filling or emptying in its turn;
// the bar keeps its colour until the sweep crosses a fifth or a half, where the colour changes, as the games do.
// quick: one hit of several, a short sweep so the hits keep their rhythm
const toneAt = share => (share <= .2 ? "type-fire" : share <= .5 ? "type-electric" : "type-grass");
export function drain(stage, key, from, to, { quick = false } = {}) {
  const bar = stage?.closest(".bt-arena")?.querySelector(`[data-bar="${key}"] .bt-gauge`);
  const clamp = v => Math.max(0, Math.min(1, v));
  const a = clamp(from) * 10, b = clamp(to) * 10, span = Math.abs(a - b);
  if (!bar || instant() || span < .01) return Promise.resolve();
  const total = quick ? Math.min(520, Math.max(300, span * 90)) : Math.min(1100, Math.max(420, span * 120));
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
// healing: green crosses and glints rise round it, a ring of light climbing from its feet
export function heal(stage, key) {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key, .1);
  const size = sizeOf(stage, key), u = unitOf(stage);
  const runs = times(8, i => {
    const p = spawn(stage, i % 3 ? "bs-plus" : "bs-spark type-grass", [x + (Math.random() - .5) * size * .75, y], i % 3 ? {} : { width: `${10 * u}px`, height: `${10 * u}px` });
    return vanish(p, [{ opacity: 0, transform: "translate(-50%, -50%) scale(.5)" }, { opacity: 1, offset: .3 }, { opacity: 0, transform: `translate(-50%, -50%) translateY(${-size * (.6 + Math.random() * .4)}px) scale(1)` }], { duration: 760, delay: i * 60, easing: OUT });
  });
  if (!reduced()) {
    const el = bit(stage, "bs-aura type-grass", size * .9, size * .28);
    runs.push(vanish(el, [{ opacity: 0, transform: T(x, y, "scale(.7)") }, { opacity: .9, transform: T(x, y - size * .1, "scale(1)"), offset: .25 }, { opacity: 0, transform: T(x, y - size * .8, "scale(.8)") }], { duration: 760, easing: OUT }));
  }
  return Promise.all(runs);
}
// fainting: it greys where it stands, holds a beat, then sinks into the floor (clipped at its feet) and goes out in a little dust
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
    const floor = r.bottom - box.top - r.height * .04;
    runs.push(ring(stage, [x, floor], r.width * .5, "Normal", { s0: .5, s1: 1.4, flat: .26, peak: .6, duration: 620, delay: 300 }));
    runs.push(...puffs(stage, [x, floor], r.width * .8, 6, { peak: .4, rise: .18, spread: .32, delay: 320 }));
  }
  return Promise.all(runs).then(() => { if (slot) slot.style.clipPath = ""; });
}
// a light that blooms and goes out at a point: what a Pokémon comes out of and goes back into
function flare(stage, [x, y], size, { grow = true, duration = 560 } = {}) {
  const disc = spawn(stage, "bs-flare", [x, y], { width: `${size}px`, height: `${size}px` });
  return vanish(disc, grow
    ? [{ opacity: 0, transform: "translate(-50%, -50%) scale(.2)", easing: OUT }, { opacity: .95, transform: "translate(-50%, -50%) scale(.9)", offset: .3, easing: SWAY }, { opacity: 0, transform: "translate(-50%, -50%) scale(1.25)" }]
    : [{ opacity: .9, transform: "translate(-50%, -50%) scale(1)" }, { opacity: 0, transform: "translate(-50%, -50%) scale(.2)" }],
  { duration, easing: "linear" });
}
// sent in: a light blooms where it will stand, glints scatter from it, and the Pokémon grows out of it, bright at first, settling
// to its own colours, a ring opening round it and a ring on the floor at its feet
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
  const feet = centre(stage, key, .04);
  await Promise.all([
    flare(stage, at, size * 1.1),
    ring(stage, at, size * .5, "Normal", { s0: .3, s1: 2.2, peak: .8, duration: 620 }),
    ring(stage, feet, size * .6, "Normal", { s0: .3, s1: 1.7, flat: .26, peak: .7, duration: 620, delay: 120 }),
    ...sparks(stage, "bs-spark type-normal", at, size * .75, 8, { w: size * .09, delay: 60, duration: 520 }),
    play(el, [
      { transform: "scale(.5)", filter: "brightness(2.6)", opacity: 0, easing: OUT },
      { transform: "scale(1.02)", filter: "brightness(1.5)", opacity: 1, offset: .55, easing: SWAY },
      { transform: "scale(1)", filter: "brightness(1)", opacity: 1 },
    ], { duration: 500, delay: 90, easing: "linear", fill: "backwards" }),
  ]);
}
// called back: the Pokémon brightens and shrinks into a light that goes out
// dragged out (Roar, Whirlwind, Dragon Tail): it is blown off its side the way it faces away, gusts carrying it, and goes out
export function leave(stage, key, { drag = false } = {}) {
  const el = monEl(stage, key);
  if (!el || instant()) return Promise.resolve();
  settle(el);
  if (drag && !reduced()) {
    const d = ownSide(el) ? -60 : 60;
    const [x, y] = centre(stage, key), size = sizeOf(stage, key);
    times(6, i => toss(stage, "bs-streak", [x - Math.sign(d) * size * .4, y + (i - 2.5) * size * .14], { w: size * .4, h: 2, dx: Math.sign(d) * size * 1.2, s0: 1, s1: 1, out: false, duration: 320, delay: i * 20, fadeAt: .5 }));
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
    { opacity: 1, transform: "translate(-50%, -50%) scale(1) rotate(300deg)", offset: .5, easing: SWAY },
    { opacity: 1, transform: "translate(-50%, -50%) scale(.82) rotate(480deg)", offset: .86, easing: IN },
    { opacity: 0, transform: "translate(-50%, -50%) scale(.6) rotate(540deg)" },
  ], { duration: 1200, easing: "linear" });
  if (!reduced()) charge(stage, key, "Fairy", 900);
  await play(el.querySelector("img"), [
    { filter: "brightness(1)", easing: SWAY }, { filter: "brightness(1.7)", offset: .35, easing: SWAY },
    { filter: "brightness(1.35)", offset: .55, easing: SWAY }, { filter: "brightness(2.6)" },
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
// a stat change: arrows rise (up) or fall (down) through the picture in columns, warm for up and cold for down, a band of light
// passing the same way, the picture brightening or dimming once
export function boost(stage, key, amount) {
  if (!stage || instant() || !amount) return Promise.resolve();
  const up = amount > 0;
  const [x, y] = centre(stage, key, .4);
  const size = sizeOf(stage, key);
  const count = Math.min(3, Math.abs(amount)) * 4;
  const runs = times(count, i => {
    const p = spawn(stage, `bs-arrow${up ? "" : " down"}`, [x + ((i % 4) - 1.5) * size * .22, y]);
    const d = size * .55;
    return vanish(p, [
      { opacity: 0, transform: `translate(-50%, -50%) translateY(${up ? d : -d}px)` },
      { opacity: 1, offset: .3 },
      { opacity: 0, transform: `translate(-50%, -50%) translateY(${up ? -d : d}px)` },
    ], { duration: 640, delay: i * 50, easing: up ? OUT : IN });
  });
  if (!reduced()) {
    const band = bit(stage, `bs-aura ${up ? "type-fighting" : "type-water"}`, size * .85, size * .26);
    const lo = y + size * .5, hi = y - size * .45;
    runs.push(vanish(band, [{ opacity: 0, transform: T(x, up ? lo : hi) }, { opacity: .9, offset: .25 }, { opacity: 0, transform: T(x, up ? hi : lo) }], { duration: 640, easing: up ? OUT : IN }));
  }
  const tint2 = monEl(stage, key)?.querySelector("img");
  runs.push(play(tint2, [{ filter: "none" }, { filter: up ? "brightness(1.3)" : "brightness(.8)" }, { filter: "none" }], { duration: 640, fill: "none" }));
  return Promise.all(runs);
}
// a status lands: its ring, and the status drawn on it in its own shapes
const STATUS_TYPE = { brn: "Fire", par: "Electric", psn: "Poison", tox: "Poison", slp: "Normal", frz: "Ice" };
export function status(stage, key, id) {
  if (!stage || instant()) return Promise.resolve();
  const at = centre(stage, key), size = sizeOf(stage, key);
  return Promise.all([ring(stage, at, size * .5, STATUS_TYPE[id] || "Normal", { s0: .3, s1: 2, duration: 460 }), ailment(stage, key, id), flashMon(stage, key, .5)]);
}
// Protect and its kin: a dome of light closes round it, a glint crossing it
export function shield(stage, key) {
  if (!stage || instant()) return Promise.resolve();
  const [x, y] = centre(stage, key);
  const size = sizeOf(stage, key);
  const el = spawn(stage, "bs-shield", [x, y], { width: `${size * 1.15}px`, height: `${size * 1.15}px` });
  if (!reduced()) {
    ring(stage, [x, y], size * 1.15, "Grass", { s0: 1.3, s1: 1, duration: 300, easing: OUT });
    pop(stage, "bs-spark type-grass", [x - size * .3, y - size * .32], { w: size * .26, s0: .1, s1: 1, spin: 90, duration: 420, delay: 200 });
  }
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
