/* 기술마다의 연출 (DESIGN.md "Battle", What the stage plays). 기술 하나는 게임의 기술 설명문을 읽고 쓴 짧은 각본이다
   (scripts/move-anims.mjs → src/data/move-fx.json): "hit fist fast", "rain boulder 4", "spikes stone", "beam wide gather".
   각본은 "then"으로 이은 단계들이고, 단계는 동사 하나와 그 말들이다. 여기서 동사마다 그린다. 모든 그림은 stageFx.js의
   부품(kit)으로 만들고, 그 부품은 캔버스(vfx.js)에 빛으로 그려진다. 동사 하나는 promise를 돌려주고, 그것이 맞는 순간이다
   (결과 줄이 그때 함께 뜬다). false를 돌려주면 stageFx.move의 기본 비행(타입의 날아가는 모양)이 이어 그린다. */
import MOVE_FX from "../../data/move-fx.json";

export const recipeOf = id => MOVE_FX[id] || "";
// a phase's words: the verb, the bare words as a set, a count and key:value pairs
export function parse(phase) {
  const [verb, ...rest] = phase.trim().split(/\s+/);
  const words = new Set(), opts = {};
  let count = 0, noun = null;
  for (const w of rest) {
    if (/^\d+$/.test(w)) count = Number(w);
    else if (w.includes(":")) { const [key, v] = w.split(":"); opts[key] = Number(v) || v; }
    else { if (!noun) noun = w; words.add(w); }
  }
  return { verb, noun, count, opts, has: w => words.has(w) };
}

export function makeDraw(k) {
  const { centre, sizeOf, unitOf, monEl, bit, play, vanish, typeClass: tc, rand, lerp, T, around, times, toss, pop, ring, streaks, sparks, puffs, tint, shake, bolt, lunge, afterimages, charge, aura, fly, fall, sweep, flare, flashMon, heal, wait, OUT, IN, SWAY, emit } = k;
  const D = {};
  const own = (c, key) => k.ownSide(monEl(c.stage, key));
  const dir = (c, t) => { const [ax, ay] = centre(c.stage, c.from), [bx, by] = centre(c.stage, t); return Math.atan2(by - ay, bx - ax); };
  const user = c => monEl(c.stage, c.from);
  const big = (c, key) => Math.max(sizeOf(c.stage, key), 120 * unitOf(c.stage));
  const live = (c, t) => !c.blocked(t) && !c.missed(t);
  const hitAll = (c, o) => c.targets.forEach(t => c.land(t, o));
  const trailOf = type => k.FLIGHT[type]?.trail || "glint";
  // the user's picture moves on top of what it is doing (composite add), never replacing its idle or a dash
  const move = (el, frames, duration, o = {}) => play(el, frames, { duration, easing: "linear", fill: "none", composite: "add", ...o });
  const hop = (c, h = .18, duration = 560) => move(user(c), [{ transform: "none", easing: OUT }, { transform: `translateY(${-h * 100}%)`, offset: .42, easing: IN }, { transform: "none" }], duration);
  const glint = (c, at, size, type = c.type, delay = 0) => pop(c.stage, `bs-spark ${tc(type)}`, at, { w: size * .3, s0: .1, s1: 1, spin: 90, duration: 360, delay });
  const feet = (c, key) => [centre(c.stage, key)[0], centre(c.stage, key, .02)[1]];

  /* ---------- pieces the verbs share ---------- */
  // a shape driven into the target along the line of the blow; face turns the drawn shape to the way it travels
  function thrust(c, t, cls, { w = .5, h = w, from = .5, face = 0, type = c.type, duration = 320, delay = 0, angle = null } = {}) {
    const [bx, by] = centre(c.stage, t), size = sizeOf(c.stage, t), a = angle ?? dir(c, t), deg = a * 180 / Math.PI + face;
    const el = bit(c.stage, `${cls} ${tc(type)}`, size * w, size * h);
    return vanish(el, [
      { opacity: 0, transform: T(bx - Math.cos(a) * size * from, by - Math.sin(a) * size * from, `rotate(${deg}deg) scale(.5)`), easing: OUT },
      { opacity: 1, transform: T(bx, by, `rotate(${deg}deg) scale(1.15)`), offset: .35 },
      { opacity: 1, transform: T(bx, by, `rotate(${deg}deg) scale(1.05)`), offset: .7 },
      { opacity: 0, transform: T(bx + Math.cos(a) * 8, by + Math.sin(a) * 8, `rotate(${deg}deg) scale(1.25)`) },
    ], { duration, delay, easing: "linear" });
  }
  // shapes that circle a point, turning as the circle draws in or out
  function orbit(c, [x, y], size, cls, { n = 6, r0 = .8, r1 = .4, turns = 1.2, flat = .45, w = .14, h = w, duration = 820, delay = 0, rise = 0, face = null } = {}) {
    return times(n, i => {
      const el = bit(c.stage, cls, size * w, size * h), a0 = (i / n) * Math.PI * 2;
      return vanish(el, Array.from({ length: 17 }, (_, j) => {
        const t = j / 16, a = a0 + t * turns * Math.PI * 2, r = size * lerp(r0, r1, t);
        const turn = face == null ? t * 360 : (a * 180) / Math.PI + face;
        return { offset: t, opacity: j === 0 ? 0 : t > .85 ? (1 - t) / .15 : 1, transform: T(x + Math.cos(a) * r, y + Math.sin(a) * r * flat - rise * size * t, `rotate(${turn}deg)`) };
      }), { duration, delay: delay + i * 20, easing: "linear" });
    });
  }
  // shapes that float from the user to the target along a weave, slower than a blow (a status on its way)
  function drift(c, t, cls, { n = 4, w = .16, h = w, ms = 640, gap = 90, wave = .1, arc = .1, face = null, spin = 0 } = {}) {
    const a = centre(c.stage, c.from), b = centre(c.stage, t), size = big(c, t), dist = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / dist, ny = (b[0] - a[0]) / dist;
    return times(n, i => vanish(bit(c.stage, cls, size * w, size * h), Array.from({ length: 19 }, (_, j) => {
      const p = j / 18, off = Math.sin(p * Math.PI * 2 + i) * wave * dist * Math.sin(Math.PI * p);
      const x = lerp(a[0], b[0], p) + nx * off, y = lerp(a[1], b[1], p) + ny * off - Math.sin(Math.PI * p) * arc * dist;
      return { offset: p, opacity: j === 0 ? 0 : 1, transform: T(x, y, `rotate(${face == null ? spin * p : face}deg) scale(${lerp(.6, 1.1, p)})`) };
    }), { duration: ms, delay: i * gap, easing: "linear" }))[0];
  }
  // pieces that jut out of the floor under a Pokémon, each rising and standing a moment, then breaking
  function pillars(c, t, type, { n = 5, cls = "bs-crystal", w = .2, h = .78 } = {}) {
    const [x, y] = feet(c, t), size = sizeOf(c.stage, t);
    puffs(c.stage, [x, y], size, 5, { type, peak: .5, rise: .2, spread: .45 });
    times(n, i => {
      const px = x + (i - (n - 1) / 2) * size * .2, tall = size * h * (1 - Math.abs(i - (n - 1) / 2) * .16), lean = (i - (n - 1) / 2) * 10;
      const el = bit(c.stage, `${cls} ${tc(type)}`, size * w, tall);
      return vanish(el, [
        { opacity: 1, transform: `translate(${px}px, ${y}px) rotate(${lean}deg) scale(1, .05)`, easing: OUT },
        { opacity: 1, transform: `translate(${px}px, ${y - tall / 2}px) rotate(${lean}deg) scale(1, 1.08)`, offset: .3 },
        { opacity: 1, transform: `translate(${px}px, ${y - tall / 2}px) rotate(${lean}deg) scale(1, 1)`, offset: .65 },
        { opacity: 0, transform: `translate(${px}px, ${y - tall / 3}px) rotate(${lean}deg) scale(.8, .6)` },
      ], { duration: 640, delay: Math.abs(i - (n - 1) / 2) * 50, easing: "linear" });
    });
    return wait(170);
  }
  // a ring of the type opening flat on the floor
  const floorRing = (c, at, size, type, o = {}) => ring(c.stage, at, size, type, { s0: .3, s1: 2.6, flat: .32, duration: 560, thick: true, ...o });

  /* ---------- the approach: how the user reaches its target ---------- */
  const dash = (c, t, o = {}) => lunge(c.stage, c.from, t, c.type, { quick: c.event.priority > 0, short: c.blocked(t), ...o });
  // the user rises out of the stage's top and comes down on the target (Fly, Bounce, Flying Press, Supercell Slam)
  async function dropOnto(c, t) {
    const el = user(c), [ax, ay] = centre(c.stage, c.from), [bx, by] = centre(c.stage, t), box = c.stage.getBoundingClientRect();
    if (!el || k.reduced()) return dash(c, t);
    play(el, [
      { transform: "none", opacity: 1, easing: IN }, { transform: `translateY(${-box.height}px) scale(.9)`, opacity: 1, offset: .3 },
      { transform: `translate(${bx - ax}px, ${-box.height}px) scale(1.1)`, opacity: 0, offset: .31 },
      { transform: `translate(${bx - ax}px, ${-box.height * .3}px) scale(1.15)`, opacity: 1, offset: .5, easing: IN },
      { transform: `translate(${bx - ax}px, ${by - ay}px) scale(1.1)`, opacity: 1, offset: .62 },
      { transform: `translate(${bx - ax}px, ${by - ay}px) scale(1.1)`, opacity: 0, offset: .75 }, { transform: "none", opacity: 0, offset: .76 }, { transform: "none", opacity: 1 },
    ], { duration: 1100, easing: "linear", fill: "none" });
    await wait(680);
    floorRing(c, feet(c, t), sizeOf(c.stage, t), c.type);
    puffs(c.stage, feet(c, t), sizeOf(c.stage, t), 7, { peak: .5, rise: .25, spread: .5 });
    shake(c.stage, 1.3);
  }
  // the user sinks into the ground (or its shadow) and comes up beside the target (Dig, Dive, Phantom Force, Shadow Sneak)
  async function underneath(c, t, shadow) {
    const el = user(c), [ax, ay] = centre(c.stage, c.from), [bx, by] = centre(c.stage, t), size = sizeOf(c.stage, c.from);
    if (!el || k.reduced()) return dash(c, t);
    const kind = shadow ? "Dark" : c.type === "Water" ? "Water" : "Ground";
    puffs(c.stage, feet(c, c.from), size, 6, { type: kind, peak: .6, rise: .12, spread: .35 });
    const dx = (bx - ax) * .8, dy = (by - ay) * .8;
    play(el, [
      { opacity: 1, transform: "none", easing: IN }, { opacity: 0, transform: "scale(.9, .2) translateY(30%)", offset: .22 },
      { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.9, .2)`, offset: .3, easing: OUT },
      { opacity: 1, transform: `translate(${dx}px, ${dy}px)`, offset: .45 }, { opacity: 1, transform: `translate(${dx * 1.06}px, ${dy * 1.06}px) scale(1.06)`, offset: .55 },
      { opacity: 1, transform: `translate(${dx}px, ${dy}px)`, offset: .7, easing: IN }, { opacity: 0, transform: `translate(${dx}px, ${dy}px)`, offset: .82 },
      { opacity: 0, transform: "none", offset: .83 }, { opacity: 1, transform: "none" },
    ], { duration: 980, easing: "linear", fill: "none" });
    await wait(300);
    puffs(c.stage, feet(c, t), sizeOf(c.stage, t), 6, { type: kind, peak: .6, rise: .3, spread: .4 });
    await wait(230);
  }
  // the type wrapped round the user as it charges (Flare Blitz in flames, Wave Crash in water, Volt Tackle in sparks)
  function cloak(c, duration = 620) {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    aura(c.stage, c.from, c.type, 2, duration * .7);
    const head = k.FLIGHT[c.type]?.head;
    const cls = head === "flame" ? "bs-flame" : head === "drop" ? `bs-drop ${tc(c.type)}` : head === "leaf" ? `bs-leaf ${tc(c.type)}` : `bs-spark ${tc(c.type)}`;
    orbit(c, [x, y], size, cls, { n: 10, r0: .55, r1: .5, turns: 1.4, flat: .7, duration, w: .16, h: .2, face: 90 });
    if (c.type === "Electric") times(3, i => { const a = around(3, i); bolt(c.stage, [x, y], [x + Math.cos(a) * size * .5, y + Math.sin(a) * size * .5], "Electric", { flicker: 2, depth: .25, duration: 220, delay: i * 70, fork: false, thin: true }); });
  }
  // light gathers at the user before it acts, held a beat (Focus Punch, Solar Blade, Sky Attack)
  async function gather(c, hold = 420) {
    await Promise.all([charge(c.stage, c.from, c.type, hold), aura(c.stage, c.from, c.type, 2, hold), flashMon(c.stage, c.from, .6)]);
  }

  /* ---------- the marks a blow leaves, drawn at the instant it lands ---------- */
  const MARKS = {
    axe: (c, t) => pillars(c, t, c.type, { n: 3, h: .5 }),
    chop: (c, t) => { const [x, y] = centre(c.stage, t), s = sizeOf(c.stage, t); pop(c.stage, `bs-claw ${tc(c.type)}`, [x, y], { w: s * 1.1, h: s * .14, rot: -70, s0: .2, s1: 1.1, duration: 300 }); },
    fist: (c, t) => thrust(c, t, "bs-fist", { w: .42, h: .37, face: 90, from: .6 }),
    hammer: (c, t) => thrust(c, t, "bs-fist", { w: .6, h: .52, face: 90, from: .9, angle: Math.PI / 2, duration: 380 }),
    palm: (c, t) => thrust(c, t, "bs-hand core", { w: .38, h: .42, face: 90, from: .5 }),
    kick: (c, t) => thrust(c, t, "bs-foot", { w: .44, h: .38, from: .7, face: own(c, c.from) ? -20 : 200 }),
    knee: (c, t) => thrust(c, t, "bs-foot", { w: .4, h: .36, from: .6, face: own(c, c.from) ? -60 : 240 }),
    horn: (c, t) => thrust(c, t, "bs-wedge", { w: .8, h: .22, from: .9, duration: 280 }),
    sting: (c, t) => thrust(c, t, "bs-wedge", { w: .6, h: .14, from: .7, duration: 240 }),
    beak: (c, t) => thrust(c, t, "bs-wedge", { w: .55, h: .2, from: .6, duration: 260 }),
    drill: (c, t) => { thrust(c, t, "bs-wedge", { w: .8, h: .24, from: .9, duration: 300 }); times(4, i => ring(c.stage, centre(c.stage, t), sizeOf(c.stage, t) * .3, c.type, { s0: .2, s1: 1 + i * .3, duration: 300, delay: i * 50, flat: .55 })); },
    head: (c, t) => pop(c.stage, `bs-star ${tc(c.type)}`, centre(c.stage, t, .6), { w: sizeOf(c.stage, t) * .7, s0: .3, s1: 1.3, duration: 320 }),
    tail: (c, t) => { const at = centre(c.stage, t), s = sizeOf(c.stage, t); times(2, i => pop(c.stage, `bs-crescent ${tc(c.type)}`, [at[0], at[1] + (i ? 10 : -6)], { w: s * 1.3, h: s * .5, rot: i ? 160 : -20, spin: i ? -50 : 50, s0: .5, s1: 1.15, duration: 360, delay: i * 70 })); },
    whip: (c, t) => { const at = centre(c.stage, t), s = sizeOf(c.stage, t); times(3, i => pop(c.stage, `bs-claw ${tc(c.type)}`, [at[0], at[1] + (i - 1) * s * .15], { w: s * 1.2, h: s * .1, rot: -30 + i * 25, s0: .1, s1: 1.1, duration: 300, delay: i * 70 })); },
    wing: (c, t) => { const at = centre(c.stage, t), u = unitOf(c.stage); times(5, () => toss(c.stage, `bs-feather ${tc(c.type)}`, at, { w: 20 * u, h: 8 * u, dx: rand(-40, 40) * u, dy: rand(-30, 10) * u, g: 30 * u, spin: rand(-300, 300), s0: 1, s1: .7, duration: 760, out: false })); },
    pincer: (c, t) => { const at = centre(c.stage, t), s = sizeOf(c.stage, t); times(2, i => { const sgn = i ? 1 : -1; vanish(bit(c.stage, `bs-crescent ${tc(c.type)}`, s * .9, s * .4), [{ opacity: 0, transform: T(at[0], at[1] + sgn * s * .45, `rotate(${i ? 180 : 0}deg) scale(.7)`), easing: IN }, { opacity: 1, transform: T(at[0], at[1] + sgn * s * .08, `rotate(${i ? 180 : 0}deg) scale(1.05)`), offset: .55 }, { opacity: 0, transform: T(at[0], at[1] + sgn * s * .05, `rotate(${i ? 180 : 0}deg) scale(1.15)`) }], { duration: 380, easing: "linear" }); }); },
    arms: (c, t) => { const at = centre(c.stage, t), s = sizeOf(c.stage, t); times(2, i => pop(c.stage, `bs-crescent ${tc(c.type)}`, at, { w: s * 1.4, h: s * .5, rot: i ? 90 : -90, spin: i ? 90 : -90, s0: .4, s1: 1.2, duration: 380, delay: i * 90 })); },
    bone: (c, t) => thrust(c, t, "bs-wedge", { w: .7, h: .18, from: .8, type: "Ground", duration: 300 }),
    brawl: (c, t) => { const at = centre(c.stage, t), s = sizeOf(c.stage, t); puffs(c.stage, at, s, 9, { peak: .6, rise: .1, spread: .32 }); ["bs-star", "bs-heart", "bs-fist", "bs-star", "bs-heart", "bs-fist"].forEach((cls, i) => pop(c.stage, `${cls} ${tc(c.type)}`, [at[0] + rand(-.32, .32) * s, at[1] + rand(-.3, .2) * s], { w: s * .26, h: s * .24, s0: .3, s1: 1.1, rot: rand(-20, 20), duration: 300, delay: i * 70 })); },
    // the target is grabbed, lifted and slammed into the floor (Seismic Toss, Circle Throw, Storm Throw)
    throw: (c, t) => { move(monEl(c.stage, t), [{ transform: "none", easing: OUT }, { transform: "translateY(-45%) rotate(-25deg)", offset: .4, easing: IN }, { transform: "translateY(4%) scale(1.05, .92)", offset: .62 }, { transform: "none" }], 700); wait(430).then(() => { floorRing(c, feet(c, t), sizeOf(c.stage, t), "Fighting"); shake(c.stage, 1.2); }); },
  };
  // the marks stageFx's own burst draws (a bite's fangs, claws, a blade, crossed blades)
  const OWN_MARK = { fang: "fang", claw: "claw", slash: "slash", cross: "cross", axe: "slash", wing: "slash" };

  /* ---------- verbs: a blow in person ---------- */
  D.hit = async (c, a) => {
    const t = c.targets[0];
    if (!t) return false;
    const mark = a.noun || "body", n = Math.max(1, a.opts.multi || 1);
    if (a.has("gather")) await gather(c);
    if (a.has("bow")) await move(user(c), [{ transform: "none", easing: SWAY }, { transform: "translateY(8%) scale(1, .9)", offset: .5 }, { transform: "none" }], 420);
    if (a.has("flex")) await D.flex(c, a, true);
    if (a.has("rage")) { const [x, y] = centre(c.stage, c.from, .85), s = sizeOf(c.stage, c.from); pop(c.stage, "bs-vein", [x + s * .22, y], { w: s * .3, s0: .3, s1: 1.15, duration: 520 }); tint(c.stage, "Fire", .08, 400); await wait(220); }
    if (a.has("leaves")) { const [x, y] = centre(c.stage, c.from), s = sizeOf(c.stage, c.from); times(10, i => { const ang = around(10, i); toss(c.stage, `bs-leaf ${tc("Grass")}`, [x, y], { w: s * .2, h: s * .1, dx: Math.cos(ang) * s * .7, dy: Math.sin(ang) * s * .5, spin: 400, s0: 1, s1: .6, duration: 620 }); }); }
    if (a.has("wrap") || a.has("zap")) cloak(c, a.has("fast") ? 420 : 680);
    if (a.has("dance")) await D.dance(c, a, true);
    if (a.has("above")) await dropOnto(c, t);
    else if (a.has("burrow") || a.has("shadow")) await underneath(c, t, a.has("shadow"));
    else {
      if (a.has("jump") || a.has("stomp")) hop(c, a.has("stomp") ? .2 : .32, 640);
      if (a.has("spin") || a.has("roll")) move(user(c), [{ transform: "none" }, { transform: "rotate(360deg)" }, { transform: "rotate(720deg)" }], 560, { composite: "replace" });
      if (a.has("glide")) { const [x, y] = feet(c, c.from); times(8, i => toss(c.stage, `bs-leaf ${tc("Grass")}`, [x, y], { w: 14, h: 6, dx: rand(-20, 20), dy: -rand(5, 25), spin: 300, duration: 600, delay: i * 40 })); }
      await dash(c, t, { quick: a.has("fast") || c.event.priority > 0 });
    }
    const hits = live(c, t);
    for (let i = 0; i < n; i++) {
      if (i) await wait(110);
      if (hits && MARKS[mark]) MARKS[mark](c, t);
      if (i < n - 1 && hits) { const at = centre(c.stage, t), s = sizeOf(c.stage, t); pop(c.stage, `bs-star ${tc(c.type)}`, [at[0] + rand(-.3, .3) * s, at[1] + rand(-.3, .2) * s], { w: s * .5, s0: .3, s1: 1.2, duration: 260 }); k.hit(c.stage, t, { share: .15 }); }
    }
    hitAll(c, { mark: OWN_MARK[mark] || null, power: a.has("wrap") || a.has("above") || mark === "hammer" ? 1.15 : 1 });
    if (!hits) return;
    if (a.has("stomp") || a.has("jump") || mark === "hammer") { floorRing(c, feet(c, t), sizeOf(c.stage, t), c.type === "Normal" ? "Ground" : c.type); shake(c.stage, a.has("stomp") ? 1.2 : .9); }
    if (a.has("item")) { const [x, y] = centre(c.stage, t), s = sizeOf(c.stage, t), sg = own(c, t) ? -1 : 1; toss(c.stage, "bs-item", [x, y], { w: 18, h: 18, dx: sg * s * .9, dy: -s * .5, g: s * 1.4, spin: 540, s0: 1.2, s1: 1, duration: 780, out: false, fadeAt: .75 }); }
    if (a.has("drain")) orbit(c, centre(c.stage, t), sizeOf(c.stage, t), `bs-p ${tc("Grass")}`, { n: 8, r0: .2, r1: .7, turns: .6, duration: 520, w: 0 });
    if (a.has("low")) { const [x, y] = feet(c, t); toss(c.stage, `bs-streak typed ${tc(c.type)}`, [x - 40, y], { w: 90, h: 3, dx: 80, s0: 1, s1: 1, out: false, duration: 260, fadeAt: .5 }); }
    if (a.has("back")) { const [ax, ay] = centre(c.stage, c.from), [bx, by] = centre(c.stage, t); emit(c.stage, p => [lerp(bx, ax, p), lerp(by, ay, p) - Math.sin(Math.PI * p) * 24], 260, trailOf(c.type), c.type, 7); }
  };
  // two hands clap at the target (Fake Out, Encore, Helping Hand, After You, Instruct)
  D.clap = async c => {
    const t = c.targets[0] || c.from;
    if (c.event.category === "Physical") await dash(c, t, { quick: true, short: true });
    const [x, y] = centre(c.stage, t, .55), size = big(c, t);
    times(2, i => { const s = i ? 1 : -1; vanish(bit(c.stage, "bs-hand core", size * .3, size * .34), [
      { opacity: 0, transform: T(x + s * size * .45, y, `scale(${-s}, 1) rotate(${s * 20}deg)`), easing: IN },
      { opacity: 1, transform: T(x + s * size * .1, y, `scale(${-s}, 1)`), offset: .45 }, { opacity: 1, transform: T(x + s * size * .12, y, `scale(${-s}, 1)`), offset: .7 },
      { opacity: 0, transform: T(x + s * size * .2, y, `scale(${-s}, 1)`) },
    ], { duration: 640, easing: "linear" }); });
    await wait(290);
    streaks(c.stage, [x, y], size * .8, { n: 10, reach: .8 });
    if (c.targets.length) hitAll(c, { shards: c.event.category !== "Status" });
  };
  // a body coiled round the target squeezes it (Bind, Wrap, Octolock)
  D.squeeze = async c => {
    const t = c.targets[0];
    if (!t) return false;
    await dash(c, t, { short: true });
    const at = centre(c.stage, t), s = sizeOf(c.stage, t);
    times(3, i => ring(c.stage, [at[0], at[1] - s * .25 + i * s * .25], s * 1.1, c.type, { s0: 1.2, s1: .75, flat: .35, duration: 520, delay: i * 80, easing: IN, thick: true }));
    move(monEl(c.stage, t), [{ transform: "none" }, { transform: "scale(.9, 1.06)", offset: .5 }, { transform: "none" }], 560);
    await wait(380);
    hitAll(c, { shards: c.event.category !== "Status" });
  };
  // a trap shuts on the target's feet (Snap Trap, Grass Knot)
  D.trap = async c => {
    const t = c.targets[0];
    if (!t) return false;
    const [x, y] = feet(c, t), s = sizeOf(c.stage, t);
    times(2, i => { const sg = i ? 1 : -1; vanish(bit(c.stage, `bs-crescent ${tc(c.type)}`, s * .9, s * .4), [{ opacity: 0, transform: T(x + sg * s * .5, y - s * .1, `rotate(${sg * 90}deg)`), easing: IN }, { opacity: 1, transform: T(x + sg * s * .12, y - s * .15, `rotate(${sg * 90}deg) scale(1.05)`), offset: .5 }, { opacity: 0, transform: T(x + sg * s * .1, y - s * .15, `rotate(${sg * 90}deg) scale(1.15)`) }], { duration: 480, easing: "linear" }); });
    await wait(240);
    move(monEl(c.stage, t), [{ transform: "none" }, { transform: "rotate(-8deg) translateY(4%)", offset: .4 }, { transform: "none" }], 520);
    hitAll(c);
  };
  // the target's own item rises, glows and strikes it (Poltergeist)
  D.possess = async c => {
    const t = c.targets[0];
    if (!t) return false;
    const [x, y] = centre(c.stage, t), s = sizeOf(c.stage, t);
    puffs(c.stage, [x, y], s, 6, { type: "Ghost", peak: .55, rise: .4 });
    await vanish(bit(c.stage, "bs-item", s * .3, s * .3), [{ opacity: 0, transform: T(x + s * .5, y - s * .4, "rotate(0)") }, { opacity: 1, transform: T(x + s * .5, y - s * .7, "rotate(-30deg) scale(1.3)"), offset: .5, easing: IN }, { opacity: 1, transform: T(x, y, "rotate(200deg) scale(1.2)") }], { duration: 640, easing: "linear" });
    hitAll(c);
  };

  /* ---------- verbs: from afar ---------- */
  // a projectile's shape on the canvas, its type when it is not the move's, its scale
  const SHOT = {
    seed: ["orb", "Grass", .9], rock: ["rock", "Rock", 1.3], boulder: ["rock", "Rock", 3.2], ice: ["crystal", "Ice", 2.2], shard: ["crystal", "Ice", 1.4], icicle: ["crystal", "Ice", 1.8],
    needle: ["wedge", null, 1], dart: ["wedge", "Dragon", 1.6], arrow: ["wedge", null, 1.5], scale: ["crystal", null, 1.3], orb: ["orb", null, 1.4], fireball: ["orb", "Fire", 2],
    item: ["item", null, 1.2], bouquet: ["heart", "Fairy", 1.5], garbage: ["orb", "Poison", 2.6], salt: ["crystal", "Normal", 1.4], apple: ["orb", "Grass", 2.6], star: ["star", "Water", 1.4],
    leaf: ["leaf", "Grass", 1.2], feather: ["feather", null, 1.2], bubble: ["ring", "Water", 1.2], mud: ["orb", "Ground", 1.8], shell: ["shell", null, 1.6], coin: ["spark", "Steel", 1.4],
    water: ["drop", "Water", 1.6], comet: ["orb", "Dragon", 2.4],
  };
  D.shoot = async (c, a) => {
    if (!c.targets.length) return false;
    const [head, type0, scale0] = SHOT[a.noun] || ["orb", null, 1.3], type = type0 || c.type, n = Math.max(1, a.count || 1), heavy = a.has("big");
    const scale = scale0 * (heavy ? 1.5 : 1);
    if (heavy || a.noun === "fireball") { charge(c.stage, c.from, type, 260); await wait(200); }
    const firsts = c.targets.map(t => {
      const from = centre(c.stage, c.from), to = centre(c.stage, t), past = c.missed(t);
      const shot = () => fly(c.stage, from, to, type, { count: 1, ms: a.has("fast") ? 240 : heavy ? 460 : 340, head, arc: a.has("arc") || heavy ? .25 : .1, grow: heavy ? 1.4 : 0, scale, trail: trailOf(type), past, spin: 540 });
      times(n - 1, i => wait((i + 1) * 120).then(shot));
      return shot();
    });
    await Promise.all(firsts);
    hitAll(c, { power: heavy ? 1.15 : 1 });
    if (a.has("pin")) c.targets.forEach(t => pop(c.stage, `bs-wedge ${tc(type)}`, feet(c, t), { w: sizeOf(c.stage, t) * .5, h: sizeOf(c.stage, t) * .14, rot: 90, s0: .3, s1: 1, duration: 600, at: .7 }));
  };
  // pieces drop from above on each target (Rock Slide, Draco Meteor, Make It Rain, Seed Bomb, Grav Apple)
  D.rain = async (c, a) => {
    if (!c.targets.length) return false;
    const [head, type0, scale] = SHOT[a.noun] || ["rock", null, 1.4], type = type0 || c.type;
    if (a.noun === "comet") { tint(c.stage, "Dragon", .12, 800); charge(c.stage, c.from, "Dragon", 300); await wait(240); }
    await Promise.all(c.targets.map(t => fall(c.stage, centre(c.stage, t), type, sizeOf(c.stage, t), { count: a.count || 4, head, scale, trail: trailOf(type), ms: 420 })));
    if (a.has("ring")) c.targets.forEach(t => pillars(c, t, "Rock", { n: 4, h: .55 }));
    c.targets.forEach(t => floorRing(c, feet(c, t), sizeOf(c.stage, t), type, { s1: 2 }));
    shake(c.stage, .7);
    hitAll(c, { power: 1.05 });
  };
  // pieces jut out of the floor under the target (Stone Edge, Frenzy Plant, Drum Beating)
  D.spikes = async (c, a) => {
    if (!c.targets.length) return false;
    const root = a.noun === "root", type = root ? "Grass" : c.type;
    await Promise.all(c.targets.map(t => (c.missed(t) ? wait(200) : pillars(c, t, type, { cls: root ? "bs-wedge" : "bs-crystal", w: root ? .16 : .22, h: root ? .9 : .82, n: root ? 6 : 5 }))));
    shake(c.stage, .6);
    hitAll(c, { power: 1.05 });
  };
  // the ground under the target bursts (Earth Power, Rising Voltage): it glows, then a column of the type erupts
  D.erupt = async c => {
    if (!c.targets.length) return false;
    charge(c.stage, c.from, c.type, 260);
    await wait(200);
    await Promise.all(c.targets.map(t => {
      const [x, y] = feet(c, t), s = sizeOf(c.stage, t);
      floorRing(c, [x, y], s, c.type, { s0: .2, s1: 1.6, duration: 380 });
      const cls = c.type === "Electric" ? `bs-spark ${tc(c.type)}` : c.type === "Fire" ? "bs-flame" : `bs-p ${tc(c.type)}`;
      times(14, i => toss(c.stage, cls, [x + rand(-.25, .25) * s, y], { w: s * .16, h: s * .2, dx: rand(-.1, .1) * s, dy: -s * rand(.8, 1.4), s0: 1.3, s1: .4, duration: 560, delay: 200 + i * 20, face: 0 }));
      if (c.type === "Electric") times(3, i => bolt(c.stage, [x + (i - 1) * s * .2, y], [x + (i - 1) * s * .1, y - s * 1.2], "Electric", { flicker: 2, duration: 300, delay: 220 + i * 50 }));
      return wait(300);
    }));
    shake(c.stage, .8);
    hitAll(c);
  };
  D.beam = async (c, a) => {
    if (!c.targets.length) return false;
    if (a.has("gather")) await gather(c, 520);
    const wide = a.has("wide"), from = centre(c.stage, c.from);
    const one = (t, type, off = 0, delay = 0) => wait(delay).then(() => { const to = centre(c.stage, t); return k.beam(c.stage, [from[0], from[1] + off], [to[0], to[1] + off], type, { past: c.missed(t), width: wide ? 2.6 : 1.5, hold: wide ? 520 : 340, trail: trailOf(type) }); });
    if (a.has("tri")) await Promise.all(c.targets.map(t => Promise.all([one(t, "Fire", -8), one(t, "Electric", 0, 60), one(t, "Ice", 8, 120)])));
    else if (a.has("twin")) await Promise.all(c.targets.map(t => Promise.all([one(t, c.type, -7), one(t, c.type, 7, 70)])));
    else await Promise.all(c.targets.map(t => one(t, c.type)));
    if (wide) { tint(c.stage, c.type, .12, 600); shake(c.stage, .8); }
    hitAll(c, { power: wide ? 1.15 : 1 });
  };
  // a breath or a jet: a dense stream of the type (Flamethrower, Hydro Pump, Scald, Dragon Breath)
  D.stream = async (c, a) => {
    if (!c.targets.length) return false;
    if (a.has("dance")) await D.dance(c, a, true);
    const head = { Fire: "flame", Water: "drop", Ice: "crystal", Dragon: "orb", Poison: "orb", Grass: "drop" }[c.type] || "orb";
    const heavy = a.has("big");
    await Promise.all(c.targets.map(t => fly(c.stage, centre(c.stage, c.from, .55), centre(c.stage, t), c.type, { count: heavy ? 34 : 24, ms: 420, gap: heavy ? 9 : 11, head, body: head, arc: .05, wave: .03, waves: 3, scale: heavy ? 1.7 : 1.25, trail: trailOf(c.type), past: c.missed(t) })));
    if (heavy) shake(c.stage, .6);
    hitAll(c, { power: heavy ? 1.1 : 1 });
  };
  D.bolt = async (c, a) => {
    if (!c.targets.length) return false;
    charge(c.stage, c.from, "Electric", 240);
    await wait(180);
    c.targets.forEach(t => { const from = centre(c.stage, c.from), to = centre(c.stage, t); times(2, i => bolt(c.stage, from, c.missed(t) ? [from[0] + (to[0] - from[0]) * 1.4, from[1] + (to[1] - from[1]) * 1.4] : to, "Electric", { duration: 380, delay: i * 90 })); });
    tint(c.stage, "Electric", .08, 400);
    await wait(90);
    hitAll(c);
    if (a.has("back")) sparks(c.stage, `bs-spark ${tc("Electric")}`, centre(c.stage, c.from), sizeOf(c.stage, c.from), 8);
  };
  D.sky = async c => {
    if (!c.targets.length) return false;
    tint(c.stage, "Electric", .1, 700);
    await Promise.all(c.targets.map(t => k.skyBolt(c.stage, centre(c.stage, t), sizeOf(c.stage, t))));
    shake(c.stage, 1);
    hitAll(c, { power: 1.1 });
  };
  // a wall of the type rolls across the floor from the user's side over the foe's (Surf, Muddy Water, Sludge Wave)
  D.wave = async c => {
    if (!c.targets.length) return false;
    const box = c.stage.getBoundingClientRect(), u = unitOf(c.stage), fromLeft = own(c, c.from);
    const head = c.type === "Water" ? `bs-drop ${tc("Water")}` : `bs-orb ${tc(c.type)}`;
    times(4, row => times(16, i => {
      const y = box.height * (.42 + row * .14) + rand(-8, 8), x0 = fromLeft ? -30 : box.width + 30, x1 = fromLeft ? box.width + 30 : -30;
      return toss(c.stage, head, [x0, y], { w: rand(12, 18) * u, h: rand(16, 24) * u, dx: x1 - x0, dy: -rand(10, 50) * u, s0: 1.3, s1: 1, duration: 820, delay: row * 60 + i * 24, out: false, fadeAt: .82, face: fromLeft ? 90 : -90 });
    }));
    tint(c.stage, c.type, .12, 800);
    await wait(420);
    shake(c.stage, .6);
    hitAll(c);
  };
  // wind across the field, the type's pieces whirling on each target (Heat Wave, Icy Wind, Blizzard, Petal Blizzard)
  D.wind = async (c, a) => {
    if (!c.targets.length) return false;
    const box = c.stage.getBoundingClientRect(), u = unitOf(c.stage), s = own(c, c.from) ? 1 : -1;
    const type = a.noun === "petal" ? "Fairy" : c.type;
    times(16, i => toss(c.stage, `bs-streak typed ${tc(type)}`, [s > 0 ? -40 : box.width + 40, box.height * rand(.12, .9)], { w: rand(70, 140) * u, h: 2, dx: s * (box.width + 80), dy: rand(-20, 20), s0: 1, s1: 1, out: false, duration: 560, delay: i * 26, fadeAt: .7, face: s > 0 ? 0 : 180 }));
    const head = a.noun === "petal" ? "leaf" : k.FLIGHT[c.type]?.head;
    const cls = head === "flame" ? "bs-flame" : head === "leaf" || head === "crescent" ? `bs-leaf ${tc(type)}` : head === "crystal" ? `bs-crystal ${tc(type)}` : `bs-p ${tc(type)}`;
    times(18, i => toss(c.stage, cls, [s > 0 ? -20 : box.width + 20, box.height * rand(.2, .85)], { w: 14 * u, h: 10 * u, dx: s * (box.width + 40), dy: rand(-40, 30), spin: 720, s0: 1.2, s1: .8, out: false, duration: 700, delay: 60 + i * 30 }));
    tint(c.stage, type, .1, 700);
    await wait(260);
    c.targets.forEach(t => orbit(c, centre(c.stage, t), sizeOf(c.stage, t), cls, { n: 10, r0: .9, r1: .3, turns: 1.3, duration: 700, w: .14, h: .1, face: 0 }));
    await wait(220);
    hitAll(c);
  };
  // the type whirls round the target, rising (Fire Spin, Whirlpool, Sand Tomb, Hurricane, Leaf Storm, Infestation)
  D.vortex = async (c, a) => {
    if (!c.targets.length) return false;
    charge(c.stage, c.from, c.type, 240);
    await wait(180);
    const type = a.has("sand") ? "Ground" : c.type;
    const head = a.has("sand") ? "p" : k.FLIGHT[c.type]?.head || "p";
    const cls = head === "flame" ? "bs-flame" : head === "drop" ? `bs-drop ${tc(type)}` : head === "leaf" || head === "crescent" ? `bs-leaf ${tc(type)}` : `bs-p ${tc(type)}`;
    await Promise.all(c.targets.map(t => {
      const at = centre(c.stage, t), s = sizeOf(c.stage, t), n = a.has("big") ? 22 : 16;
      orbit(c, [at[0], at[1] + s * .3], s, cls, { n, r0: .75, r1: .5, turns: 1.8, duration: 1000, rise: .8, w: .14, h: .18, face: 90 });
      orbit(c, [at[0], at[1] + s * .3], s, `bs-streak typed ${tc(type)}`, { n: 6, r0: .7, r1: .55, turns: 1.6, duration: 900, rise: .7, w: .3, h: .02, face: 0 });
      return wait(420);
    }));
    hitAll(c);
  };
  // sound: rings swell as they travel (Hyper Voice, Bug Buzz, Boomburst, Snarl, Overdrive, Screech, Roar)
  D.rings = async (c, a) => {
    if (!c.targets.length) return false;
    const n = a.has("big") ? 8 : 5;
    await Promise.all(c.targets.map(t => fly(c.stage, centre(c.stage, c.from, .6), centre(c.stage, t), c.type, { rings: true, count: n, gap: 70, ms: 440, past: c.missed(t) })));
    if (a.has("big")) shake(c.stage, 1);
    c.targets.forEach(t => move(monEl(c.stage, t), [{ transform: "none" }, { transform: "scale(1.04, .96)" }, { transform: "none" }], 260));
    hitAll(c, { shards: c.event.category !== "Status" });
  };
  // a pulse: rings of the type round a bright heart (Dark Pulse, Dragon Pulse, Water Pulse, Vacuum Wave)
  D.pulse = async (c, a) => {
    if (!c.targets.length) return false;
    charge(c.stage, c.from, c.type, a.has("fast") ? 160 : 280);
    await wait(a.has("fast") ? 120 : 200);
    await Promise.all(c.targets.map(t => Promise.all([
      fly(c.stage, centre(c.stage, c.from), centre(c.stage, t), c.type, { rings: true, count: a.has("big") ? 6 : 4, gap: 55, ms: 420, past: c.missed(t) }),
      fly(c.stage, centre(c.stage, c.from), centre(c.stage, t), c.type, { count: 1, ms: 420, head: "orb", grow: 1.8, scale: 1.5, trail: trailOf(c.type), past: c.missed(t) }),
    ])));
    hitAll(c, { shards: c.event.category !== "Status", power: a.has("big") ? 1.1 : 1 });
  };
  // a great orb, and on landing the type thrown out in five arms (Fire Blast, Blast Burn, Overheat)
  D.blast = async c => {
    const t = c.targets[0];
    if (!t) return false;
    await gather(c, 360);
    await fly(c.stage, centre(c.stage, c.from), centre(c.stage, t), c.type, { count: 1, ms: 440, head: "orb", grow: 2.8, scale: 1.6, trail: trailOf(c.type), past: c.missed(t) });
    if (live(c, t)) {
      const [x, y] = centre(c.stage, t), s = sizeOf(c.stage, t);
      times(5, i => { const ang = -Math.PI / 2 + (i / 5) * Math.PI * 2; times(5, j => toss(c.stage, c.type === "Fire" ? "bs-flame" : `bs-orb ${tc(c.type)}`, [x, y], { w: s * .18, h: s * .24, dx: Math.cos(ang) * s * (.3 + j * .2), dy: Math.sin(ang) * s * (.3 + j * .2), s0: 1.3, s1: .4, duration: 560, delay: j * 40, face: (ang * 180) / Math.PI + 90 })); });
      tint(c.stage, c.type, .16, 500);
      shake(c.stage, 1.2);
    }
    c.land(t, { power: 1.2 });
  };
  // an explosion round the user over the whole field (Explosion, Self-Destruct, Discharge, Lava Plume, Misty Explosion)
  D.burst = async (c, a) => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from), type = c.type === "Normal" ? "Fire" : c.type, huge = a.has("big");
    await play(user(c)?.querySelector("img"), [{ filter: "brightness(1)" }, { filter: "brightness(2.6)" }], { duration: huge ? 520 : 320, fill: "none", easing: IN });
    flare(c.stage, [x, y], size * (huge ? 3.4 : 2.4), { duration: 760 });
    times(3, i => ring(c.stage, [x, y], size, type, { s0: .3, s1: (huge ? 5 : 3.6) + i, duration: 680, delay: i * 90, thick: !i }));
    sparks(c.stage, `bs-spark ${tc(type)}`, [x, y], size * (huge ? 2.6 : 1.8), huge ? 22 : 14, { duration: 700 });
    if (c.type === "Electric") times(6, i => { const ang = around(6, i); bolt(c.stage, [x, y], [x + Math.cos(ang) * size * 1.6, y + Math.sin(ang) * size], "Electric", { flicker: 2, duration: 300, delay: i * 40 }); });
    puffs(c.stage, [x, y], size * (huge ? 2 : 1.4), huge ? 12 : 7, { type: type === "Fire" ? "Fire" : null, peak: .6, rise: .3, spread: .55 });
    tint(c.stage, type, huge ? .22 : .14, 600);
    shake(c.stage, huge ? 2.2 : 1.2);
    hitAll(c, { power: huge ? 1.25 : 1.05 });
    if (a.has("drain")) c.targets.forEach(t => k.flow(c.stage, t, c.from));
  };
  // a white flash opens from the user over the field (Dazzling Gleam, Burning Jealousy)
  D.flash = async c => {
    if (!c.targets.length) return false;
    await charge(c.stage, c.from, c.type, 260);
    await sweep(c.stage, c.from, c.type);
    k.flashStage(c.stage, .45, 420);
    c.targets.forEach(t => glint(c, centre(c.stage, t), sizeOf(c.stage, t) * 1.5));
    hitAll(c);
  };
  // the mind takes hold: rings close in on the target, it is lifted and let go (Psychic, Extrasensory, Night Shade)
  D.mind = async (c, a) => {
    if (!c.targets.length) return false;
    await charge(c.stage, c.from, c.type, 300);
    await Promise.all(c.targets.map(t => {
      if (!live(c, t)) return wait(300);
      const at = centre(c.stage, t), s = sizeOf(c.stage, t);
      times(4, i => ring(c.stage, at, s * .5, c.type, { s0: 2.6 - i * .3, s1: .3, duration: 440, delay: i * 70, easing: IN, peak: .9 }));
      move(monEl(c.stage, t), [{ transform: "none", easing: OUT }, { transform: "translateY(-10%) scale(.95, 1.05)", offset: .55, easing: IN }, { transform: "translateY(2%)", offset: .8 }, { transform: "none" }], 640);
      tint(c.stage, c.type, .1, 560);
      return wait(400);
    }));
    if (a.has("big")) { c.targets.forEach(t => ring(c.stage, centre(c.stage, t), sizeOf(c.stage, t), c.type, { s0: .3, s1: 3.6, duration: 560, thick: true })); shake(c.stage, .8); }
    hitAll(c);
  };
  D.orb = async (c, a) => {
    if (!c.targets.length) return false;
    if (a.has("gather")) await gather(c, 420); else { charge(c.stage, c.from, c.type, 300); await wait(220); }
    await Promise.all(c.targets.map(t => fly(c.stage, centre(c.stage, c.from), centre(c.stage, t), c.type, { count: 1, ms: 460, head: "orb", grow: a.has("big") ? 3 : 2.2, scale: a.has("big") ? 1.8 : 1.4, trail: trailOf(c.type), past: c.missed(t) })));
    hitAll(c, { power: a.has("big") ? 1.15 : 1 });
  };
  // the moon rises over the user, and its light flies (Moonblast)
  D.moon = async c => {
    const t = c.targets[0];
    if (!t) return false;
    const [x, y] = centre(c.stage, c.from, 1.1), s = sizeOf(c.stage, c.from), top = [x, Math.max(30, y - s * .4)];
    await pop(c.stage, `bs-orb ${tc("Fairy")}`, top, { w: s * .8, s0: .2, s1: 1.1, duration: 640, at: .7 });
    await fly(c.stage, top, centre(c.stage, t), "Fairy", { count: 3, ms: 420, gap: 60, head: "orb", body: "spark", grow: 2, scale: 1.4, trail: "spark", past: c.missed(t) });
    c.land(t, { power: 1.05 });
  };
  // crystals form round the target and lock it in frost (Freeze-Dry, Sheer Cold)
  D.frost = async (c, a) => {
    if (!c.targets.length) return false;
    await charge(c.stage, c.from, "Ice", 280);
    const n = a.has("big") ? 12 : 8;
    c.targets.forEach(t => { const [x, y] = centre(c.stage, t), s = sizeOf(c.stage, t); times(n, i => { const ang = around(n, i, .1); pop(c.stage, `bs-crystal ${tc("Ice")}`, [x + Math.cos(ang) * s * .45, y + Math.sin(ang) * s * .45], { w: s * .1, h: s * .32, rot: (ang * 180) / Math.PI + 90, s0: .1, s1: 1.1, duration: 700, delay: i * 30, at: .7 }); }); puffs(c.stage, [x, y], s, 6, { type: "Ice", peak: .5 }); });
    tint(c.stage, "Ice", .14, 700);
    await wait(360);
    hitAll(c);
  };
  D.shards = async c => {
    if (!c.targets.length) return false;
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from), u = unitOf(c.stage);
    times(6, i => { const ang = around(6, i, .1); pop(c.stage, `bs-crystal ${tc(c.type)}`, [x + Math.cos(ang) * size * .55, y + Math.sin(ang) * size * .38], { w: 11 * u, h: 26 * u, rot: (ang * 180) / Math.PI + 90, s0: .2, s1: 1.1, duration: 460, delay: i * 40, at: .7 }); });
    await wait(380);
    await Promise.all(c.targets.map(t => fly(c.stage, [x, y], centre(c.stage, t), c.type, { count: 6, ms: 340, gap: 45, head: "crystal", body: "crystal", twinkle: true, trail: "spark", scale: 1.3, past: c.missed(t) })));
    hitAll(c);
  };
  // blades of energy fly in a volley (Air Slash, Air Cutter, Psycho Cut, Aqua Cutter)
  D.cut = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => fly(c.stage, centre(c.stage, c.from), centre(c.stage, t), c.type, { count: 5, gap: 45, ms: 320, head: "crescent", body: "crescent", wave: .05, waves: 1, scale: 1.3, trail: trailOf(c.type), past: c.missed(t) })));
    hitAll(c, { mark: "slash" });
  };
  // life is pulled out of the target and streams back (Giga Drain, Draining Kiss, Strength Sap, Pain Split)
  D.drain = async (c, a) => {
    const t = c.targets[0];
    if (!t) return false;
    if (a.has("kiss")) await drift(c, t, "bs-heart", { n: 3, w: .16, h: .15, ms: 520, gap: 60, face: 0 });
    else await fly(c.stage, centre(c.stage, c.from), centre(c.stage, t), c.type, { count: 6, ms: 360, gap: 30, head: "orb", body: "p", wave: .06, trail: trailOf(c.type), past: c.missed(t) });
    c.land(t, { shards: c.event.category !== "Status" });
    if (!c.missed(t)) { orbit(c, centre(c.stage, t), sizeOf(c.stage, t), `bs-p ${tc("Grass")}`, { n: 10, r0: .2, r1: .7, turns: .6, duration: 520, w: 0 }); k.flow(c.stage, t, c.from); }
  };
  D.web = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => {
      const [ax, ay] = centre(c.stage, c.from), [bx, by] = centre(c.stage, t), size = sizeOf(c.stage, t);
      vanish(bit(c.stage, `bs-net ${tc(c.type)}`, size, size), [
        { opacity: 0, transform: T(ax, ay, "rotate(0) scale(.2)") }, { opacity: 1, transform: T(bx, by, "rotate(200deg) scale(.6)"), offset: .5, easing: OUT },
        { opacity: 1, transform: T(bx, by, "rotate(220deg) scale(1.2)"), offset: .78 }, { opacity: 0, transform: T(bx, by, "rotate(225deg) scale(1.25)") },
      ], { duration: 860, easing: "linear" });
      if (c.type === "Electric") wait(430).then(() => Promise.all(k.IMPACT.Electric(c.stage, [bx, by], size, .8)));
      return wait(430);
    }));
    hitAll(c, { shards: c.event.category !== "Status" });
  };
  // the type shoots up out of the user and comes down on the targets (Eruption, Water Spout)
  D.volcano = async c => {
    if (!c.targets.length) return false;
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    const cls = c.type === "Fire" ? "bs-flame" : c.type === "Water" ? `bs-drop ${tc("Water")}` : `bs-orb ${tc(c.type)}`;
    times(16, i => toss(c.stage, cls, [x + rand(-.2, .2) * size, y], { w: size * .18, h: size * .24, dx: rand(-.25, .25) * size, dy: -y - 30, s0: 1.3, s1: .9, duration: 440, delay: i * 26, out: false, face: 0 }));
    tint(c.stage, c.type, .14, 800);
    shake(c.stage, .8);
    await wait(420);
    await Promise.all(c.targets.map(t => fall(c.stage, centre(c.stage, t), c.type, sizeOf(c.stage, t), { count: 6, head: c.type === "Fire" ? "flame" : c.type === "Water" ? "drop" : "orb", scale: 1.5, trail: trailOf(c.type) })));
    hitAll(c, { power: 1.15 });
  };
  // the user stomps and the ground answers: a wave runs out across the floor, dust rising along it, the stage shaking
  D.quake = async (c, a) => {
    const [x, y] = feet(c, c.from), size = sizeOf(c.stage, c.from), box = c.stage.getBoundingClientRect();
    await hop(c, a.has("stomp") ? .16 : .22, 520);
    times(3, i => ring(c.stage, [x, y], size, "Ground", { s0: .3, s1: 7 - i, flat: .3, duration: 820, delay: i * 120, thick: !i }));
    times(16, i => puffs(c.stage, [box.width * (i / 15), box.height * rand(.5, .95)], size * .8, 1, { type: "Ground", peak: .55, rise: .35, delay: 80 + Math.abs(i / 15 - x / box.width) * 400 }));
    shake(c.stage, 2);
    await wait(320);
    c.targets.forEach(t => move(monEl(c.stage, t), [{ transform: "none" }, { transform: "translateY(-6%)", offset: .3 }, { transform: "none" }], 360));
    hitAll(c, { power: 1.1 });
  };
  // the floor splits from the user to the target and it drops in (Fissure)
  D.crack = async c => {
    const t = c.targets[0];
    if (!t) return false;
    const [ax, ay] = feet(c, c.from), [bx, by] = feet(c, t);
    k.beam(c.stage, [ax, ay], [bx, by], "Dark", { width: 1.2, hold: 600 });
    times(10, i => puffs(c.stage, [lerp(ax, bx, i / 9), lerp(ay, by, i / 9)], sizeOf(c.stage, t), 1, { type: "Ground", peak: .55, rise: .4, delay: i * 40 }));
    shake(c.stage, 1.6);
    await wait(420);
    if (live(c, t)) move(monEl(c.stage, t), [{ transform: "none", easing: IN }, { transform: "translateY(25%)", offset: .5 }, { transform: "none" }], 700);
    c.land(t, { power: 1.3 });
  };

  /* ---------- verbs: on itself ---------- */
  D.blades = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    orbit(c, [x, y], size, `bs-blade ${tc("Steel")}`, { n: 4, r0: .75, r1: .25, turns: 1.2, duration: 800, w: .7, h: .17, face: 90, rise: .4 });
    await wait(660);
    times(2, i => pop(c.stage, `bs-blade ${tc("Steel")}`, [x, y - size * .62], { w: size * .8, h: size * .2, rot: i ? 135 : 45, s0: .7, s1: 1.15, duration: 480, at: .5 }));
    glint(c, [x, y - size * .62], size * 1.4, "Steel", 120);
    k.flashStage(c.stage, .12, 260);
    await wait(380);
  };
  D.dance = async (c, a, quick) => {
    move(user(c), [{ transform: "none", easing: SWAY }, { transform: "rotate(-8deg) translateY(-5%)", offset: .25, easing: SWAY }, { transform: "rotate(8deg)", offset: .6, easing: SWAY }, { transform: "none" }], quick ? 520 : 900);
    const [x, y] = feet(c, c.from), size = sizeOf(c.stage, c.from);
    orbit(c, [x, y], size, `bs-spark ${tc(c.type)}`, { n: 10, r0: .6, r1: .45, turns: 1.6, duration: quick ? 520 : 940, rise: 1, w: .12 });
    orbit(c, [x, y], size, `bs-streak typed ${tc(c.type)}`, { n: 5, r0: .65, r1: .5, turns: 1.4, duration: quick ? 520 : 900, rise: .9, w: .3, h: .02, face: 0 });
    await Promise.all([aura(c.stage, c.from, c.type, quick ? 1 : 3, quick ? 420 : 780), wait(quick ? 420 : 760)]);
  };
  D.flex = async (c, a, quick) => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from), type = c.type === "Normal" ? "Fighting" : c.type;
    move(user(c), [{ transform: "none", easing: OUT }, { transform: "scale(1.08)", offset: .2, easing: SWAY }, { transform: "none", offset: .45, easing: OUT }, { transform: "scale(1.1)", offset: .65, easing: SWAY }, { transform: "none" }], quick ? 520 : 820, { composite: "replace" });
    streaks(c.stage, [x, y], size * 1.3, { n: 12, type, reach: 1.1, delay: 120 });
    if (!quick) streaks(c.stage, [x, y], size * 1.4, { n: 12, type, reach: 1.2, delay: 500 });
    await Promise.all([aura(c.stage, c.from, type, 2, quick ? 420 : 660), wait(quick ? 380 : 760)]);
  };
  D.gears = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    times(2, i => { const gx = x + (i ? .45 : -.35) * size, gy = y - size * .3, turn = i ? -1 : 1; vanish(bit(c.stage, `bs-ring thick ${tc("Steel")}`, size * (i ? .5 : .7), size * (i ? .5 : .7)), [{ opacity: 0, transform: T(gx, gy, "rotate(0deg) scale(.6)") }, { opacity: 1, transform: T(gx, gy, `rotate(${turn * 360}deg) scale(1)`), offset: .5 }, { opacity: 0, transform: T(gx, gy, `rotate(${turn * 720}deg) scale(1.1)`) }], { duration: 900, easing: "linear" }); });
    sparks(c.stage, `bs-spark ${tc("Steel")}`, [x, y], size * .8, 10, { delay: 300 });
    await wait(820);
  };
  D.shell = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    await flashMon(c.stage, c.from, 1);
    times(10, i => { const ang = around(10, i, .2); toss(c.stage, `bs-shell ${tc("Normal")}`, [x, y], { w: size * .32, h: size * .14, dx: Math.cos(ang) * size, dy: Math.sin(ang) * size * .7, g: size * .6, spin: rand(-400, 400), face: (ang * 180) / Math.PI + 90, s0: 1, s1: .8, duration: 760, out: false, fadeAt: .7 }); });
    ring(c.stage, [x, y], size * .7, "Normal", { s0: .4, s1: 2.8, duration: 520, thick: true });
    shake(c.stage, .7);
    await wait(560);
  };
  D.drum = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    for (let i = 0; i < 3; i++) {
      ring(c.stage, [x, y], size * .7, "Fighting", { s0: .5, s1: 2.6, duration: 380, thick: true });
      pop(c.stage, `bs-star ${tc("Fighting")}`, [x, y - size * .2], { w: size * .5, s0: .3, s1: 1.1, duration: 300 });
      move(user(c), [{ transform: "none" }, { transform: "scale(1.07, .94)" }, { transform: "none" }], 220);
      shake(c.stage, .3);
      await wait(240);
    }
  };
  D.sigil = async c => {
    const [x, y] = centre(c.stage, c.from, .98), size = sizeOf(c.stage, c.from);
    vanish(bit(c.stage, `bs-sigil ${tc(c.type)}`, size * .75, size * .75), [
      { opacity: 0, transform: T(x, y, "scale(.3) rotate(0deg)"), easing: OUT }, { opacity: 1, transform: T(x, y, "scale(1, 1) rotate(60deg)"), offset: .3, easing: SWAY },
      { opacity: 1, transform: T(x, y, "scale(-1, 1) rotate(120deg)"), offset: .6, easing: SWAY }, { opacity: 0, transform: T(x, y, "scale(1.3, 1.3) rotate(180deg)") },
    ], { duration: 1000, easing: "linear" });
    charge(c.stage, c.from, c.type, 640);
    await wait(880);
    glint(c, [x, y], size * 1.3, c.type);
  };
  D.focus = async c => {
    const at = centre(c.stage, c.from, .75), size = sizeOf(c.stage, c.from);
    times(12, i => { const ang = around(12, i, .1), r = size; toss(c.stage, `bs-streak typed ${tc("Fighting")}`, [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r], { w: size * .32, h: 2, dx: -Math.cos(ang) * r * .85, dy: -Math.sin(ang) * r * .85, face: (ang * 180) / Math.PI + 180, s0: 1, s1: .3, duration: 380, delay: i * 18 }); });
    await wait(360);
    await glint(c, at, size * 1.3, "Fighting");
  };
  D.harden = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    times(8, i => { const ang = around(8, i, 0), deg = (ang * 180) / Math.PI + 90; vanish(bit(c.stage, `bs-crystal ${tc(c.type)}`, size * .14, size * .38), [
      { opacity: 0, transform: T(x + Math.cos(ang) * size, y + Math.sin(ang) * size * .7, `rotate(${deg}deg)`), easing: IN },
      { opacity: 1, transform: T(x + Math.cos(ang) * size * .48, y + Math.sin(ang) * size * .34, `rotate(${deg}deg)`), offset: .6 },
      { opacity: 0, transform: T(x + Math.cos(ang) * size * .42, y + Math.sin(ang) * size * .3, `rotate(${deg}deg) scale(1.2)`) },
    ], { duration: 600, delay: i * 25, easing: "linear" }); });
    await wait(440);
    await Promise.all([flashMon(c.stage, c.from, 1), ring(c.stage, [x, y], size, c.type, { s0: 1.25, s1: .9, duration: 380, thick: true })]);
  };
  D.speed = async c => {
    const el = user(c), size = sizeOf(c.stage, c.from), [x, y] = centre(c.stage, c.from), s = own(c, c.from) ? -1 : 1;
    if (el && !k.reduced()) {
      const frames = [{ transform: "none", easing: OUT }, { transform: `translateX(${s * size * .22}px)`, offset: .25, easing: SWAY }, { transform: `translateX(${-s * size * .18}px)`, offset: .55, easing: SWAY }, { transform: "none" }];
      afterimages(c.stage, el, frames, 640, .55);
      move(el, frames, 640, { composite: "replace" });
    }
    times(12, i => toss(c.stage, "bs-streak", [x - s * size * .2, y + (i - 5.5) * size * .1], { w: size * .6, h: 2, dx: s * size * 1.2, s0: 1, s1: 1, out: false, duration: 320, delay: i * 26, fadeAt: .5 }));
    await wait(640);
  };
  D.charge = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    times(6, i => { const ang = around(6, i), b = ang + rand(1, 2); bolt(c.stage, [x + Math.cos(ang) * size * .55, y + Math.sin(ang) * size * .55], [x + Math.cos(b) * size * .3, y + Math.sin(b) * size * .3], "Electric", { flicker: 2, depth: .3, duration: 280, delay: i * 80, fork: false, thin: true }); });
    await charge(c.stage, c.from, "Electric", 720);
  };
  D.aura = async c => { await Promise.all([aura(c.stage, c.from, c.type, 3, 680), flashMon(c.stage, c.from, .6)]); };
  D.heal = async c => { await Promise.all([heal(c.stage, c.from), aura(c.stage, c.from, "Grass", 2, 620)]); };
  D.roost = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from), u = unitOf(c.stage);
    move(user(c), [{ transform: "translateY(-14%)", easing: IN }, { transform: "translateY(2%) scale(1.04, .96)", offset: .5, easing: SWAY }, { transform: "none" }], 620);
    times(9, () => toss(c.stage, `bs-feather ${tc("Flying")}`, [x + rand(-.5, .5) * size, y - size * .6], { w: 20 * u, h: 8 * u, dx: rand(-20, 20) * u, dy: size * rand(.4, .8), spin: rand(-200, 200), s0: 1, s1: .8, duration: 920, out: false, fadeAt: .7 }));
    await heal(c.stage, c.from);
  };
  // a column of light comes down on the user (Moonlight, Morning Sun, Synthesis)
  const column = (c, type, w, opacity, duration) => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    // a cone is drawn down from its top, so it stands at the top of the stage over the user
    return vanish(bit(c.stage, `bs-cone ${tc(type)}`, size * w, y + size * .55), [{ opacity: 0, transform: `translate(${x}px, 0px) scale(.3, 1)` }, { opacity, transform: `translate(${x}px, 0px) scale(1, 1)`, offset: .3 }, { opacity, transform: `translate(${x}px, 0px) scale(1, 1)`, offset: .7 }, { opacity: 0, transform: `translate(${x}px, 0px) scale(1.1, 1)` }], { duration, easing: OUT });
  };
  D.sunheal = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from), type = c.id === "moonlight" ? "Fairy" : "Electric";
    column(c, type, 1.2, .6, 1100);
    times(7, i => glint(c, [x + rand(-.4, .4) * size, y - rand(0, .6) * size], size * .6, type, 100 + i * 90));
    await heal(c.stage, c.from);
  };
  D.rest = async c => { await Promise.all([k.ailment(c.stage, c.from, "slp"), heal(c.stage, c.from)]); };
  D.wish = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    await fall(c.stage, [x, y - size * .3], "Fairy", size, { count: 1, head: "star", ms: 560, scale: 2, trail: "spark" });
    await Promise.all([glint(c, [x, y - size * .3], size * 1.8, "Fairy"), ring(c.stage, [x, y], size * .5, "Fairy", { s0: .3, s1: 2.4, duration: 520 })]);
  };
  // the guard itself is drawn when it holds (the protect line); the move only braces for it
  D.protect = async c => { await flashMon(c.stage, c.from, .6); };
  D.endure = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    move(user(c), [{ transform: "none" }, { transform: "scale(.96, 1.04)" }, { transform: "none" }], 360);
    await Promise.all([ring(c.stage, [x, y], size * .9, "Fighting", { s0: 1.4, s1: .8, duration: 420, easing: IN, thick: true }), flashMon(c.stage, c.from, .8)]);
  };
  D.guard = async c => {
    const [x, y] = centre(c.stage, c.from, .3), size = sizeOf(c.stage, c.from);
    await vanish(bit(c.stage, `bs-aura ${tc(c.type)}`, size * 2.6, size * .55), [{ opacity: 0, transform: T(x, y + size * .3, "scale(.4, .2)"), easing: OUT }, { opacity: 1, transform: T(x, y, "scale(1, 1)"), offset: .4 }, { opacity: 0, transform: T(x, y - size * .2, "scale(1.1, 1)") }], { duration: 780, easing: "linear" });
  };
  // a light falls on the user from above and draws every eye (Follow Me, Rage Powder)
  D.spotlight = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    column(c, c.type === "Bug" ? "Bug" : "Normal", 1.4, .55, 1100);
    if (c.id === "ragepowder") orbit(c, [x, y], size, `bs-p ${tc("Bug")}`, { n: 12, r0: .7, r1: .3, turns: 1, rise: -.2, duration: 900, w: 0 });
    await Promise.all([ring(c.stage, feet(c, c.from), size * .6, "Normal", { s0: .4, s1: 1.8, flat: .28, duration: 600, delay: 200 }), wait(820)]);
  };
  D.sub = async c => { await aura(c.stage, c.from, "Normal", 2, 520); };
  D.morph = async c => { await k.morph(c.stage, c.from); };

  /* ---------- verbs: at another, not to harm ---------- */
  D.wisp = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => drift(c, t, "bs-flame", { n: 3, w: .2, h: .28, ms: 820, gap: 110, wave: .14, face: 0 })));
    c.targets.forEach(t => orbit(c, centre(c.stage, t), big(c, t), "bs-flame", { n: 3, r0: .5, r1: .2, turns: .8, duration: 560, w: .16, h: .22, face: 0 }));
    await wait(200);
    hitAll(c, { shards: false });
  };
  D.zap = async c => {
    if (!c.targets.length) return false;
    charge(c.stage, c.from, "Electric", 220);
    await wait(160);
    c.targets.forEach(t => { const a = centre(c.stage, c.from), b = centre(c.stage, t); times(3, i => bolt(c.stage, a, b, "Electric", { flicker: 2, depth: .14, duration: 280, delay: i * 90, fork: false, thin: true })); });
    await wait(320);
    hitAll(c, { shards: false });
  };
  // one great drop lobbed over, bursting into a splash (Toxic, Soak, Acid Spray, Venoshock)
  D.splash = async c => {
    if (!c.targets.length) return false;
    const type = c.type === "Water" ? "Water" : c.type === "Grass" ? "Grass" : "Poison";
    await Promise.all(c.targets.map(t => fly(c.stage, centre(c.stage, c.from), centre(c.stage, t), type, { count: 1, ms: 520, head: "drop", arc: .35, scale: 2.4, trail: "drip", past: c.missed(t) })));
    c.targets.forEach(t => { if (!c.missed(t)) Promise.all(k.IMPACT[type](c.stage, centre(c.stage, t), big(c, t), 1)); });
    hitAll(c, { shards: c.event.category !== "Status" });
  };
  D.powder = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => fall(c.stage, centre(c.stage, t, .9), c.type, big(c, t) * .7, { count: 8, ms: 560, head: "p", trail: "spark" })));
    c.targets.forEach(t => puffs(c.stage, centre(c.stage, t), big(c, t), 6, { type: c.type, peak: .5, rise: .1 }));
    hitAll(c, { shards: false });
  };
  D.yawn = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => drift(c, t, `bs-ring ${tc("Water")}`, { n: 1, w: .5, ms: 1100, wave: .05, arc: .12 })));
    c.targets.forEach(t => { const at = centre(c.stage, t), size = big(c, t); ring(c.stage, at, size * .5, "Water", { s0: 1, s1: 1.6, duration: 260 }); sparks(c.stage, `bs-p ${tc("Water")}`, at, size * .5, 8, { duration: 360 }); });
    hitAll(c, { shards: false });
  };
  D.hypnosis = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => drift(c, t, `bs-ring ${tc("Psychic")}`, { n: 6, w: .4, ms: 760, gap: 90, wave: .04, arc: 0 })));
    hitAll(c, { shards: false });
  };
  D.notes = async c => {
    const ts = c.targets.length ? c.targets : [c.from];
    await Promise.all(ts.map(t => (t === c.from ? orbit(c, centre(c.stage, t), big(c, t), "bs-note core", { n: 6, r0: .5, r1: .7, turns: .5, rise: .6, duration: 900, w: .16, h: .18, face: -90 })[0] : drift(c, t, "bs-note core", { n: 6, w: .16, h: .18, ms: 860, gap: 90, wave: .14, face: 0 }))));
    hitAll(c, { shards: false });
  };
  D.charm = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => drift(c, t, "bs-heart", { n: 5, w: .2, h: .18, ms: 720, gap: 80, wave: .1, face: 0 })));
    c.targets.forEach(t => { const at = centre(c.stage, t), size = big(c, t); times(6, i => pop(c.stage, "bs-heart", [at[0] + rand(-.4, .4) * size, at[1] + rand(-.4, .2) * size], { w: size * .18, h: size * .16, s0: .3, s1: 1.2, duration: 460, delay: i * 50 })); });
    hitAll(c, { shards: false });
  };
  D.tears = async c => {
    if (!c.targets.length) return false;
    c.targets.forEach(t => { const [x, y] = centre(c.stage, t, .75), size = big(c, t); times(8, i => toss(c.stage, `bs-drop ${tc("Water")}`, [x + (i % 2 ? .14 : -.14) * size, y], { w: size * .1, h: size * .14, dx: (i % 2 ? 1 : -1) * size * .12, dy: size * .1, g: size * .5, s0: .8, s1: 1, duration: 900, delay: i * 90, out: false })); });
    await wait(480);
    hitAll(c, { shards: false });
  };
  D.confuse = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => drift(c, t, `bs-orb ${tc(c.type)}`, { n: 3, w: .2, ms: 720, gap: 80, wave: .12 })));
    c.targets.forEach(t => k.sway(c.stage, t));
    hitAll(c, { shards: false });
  };
  D.anger = async c => {
    if (!c.targets.length) return false;
    c.targets.forEach(t => { const [x, y] = centre(c.stage, t, .85), size = big(c, t); times(2, i => pop(c.stage, "bs-vein", [x + size * (i ? -.2 : .24), y - i * 8], { w: size * .3, s0: .3, s1: 1.15, duration: 720, delay: i * 260 })); });
    tint(c.stage, "Fire", .08, 600);
    await wait(480);
    hitAll(c, { shards: false });
  };
  D.chain = async c => {
    if (!c.targets.length) return false;
    c.targets.forEach(t => orbit(c, centre(c.stage, t), big(c, t), `bs-link ${tc("Steel")}`, { n: 9, r0: 1.1, r1: .55, turns: .4, duration: 820, w: .22, h: .1, face: 90 }));
    await wait(600);
    hitAll(c, { shards: false });
  };
  // an eye opens over the user and its gaze strikes (Glare, Mean Look, Scary Face, Lock-On)
  D.glare = async c => {
    if (!c.targets.length) return false;
    const [x, y] = centre(c.stage, c.from, .85), size = big(c, c.from), type = c.type === "Normal" ? "Dark" : c.type;
    await pop(c.stage, `bs-eye ${tc(type)}`, [x, y], { w: size * .5, h: size * .28, s0: .2, s1: 1.15, duration: 560, at: .6 });
    c.targets.forEach(t => k.beam(c.stage, [x, y], centre(c.stage, t), type, { width: .6, hold: 140 }));
    await wait(170);
    c.targets.forEach(t => k.hit(c.stage, t, { share: 0, weak: true }));
    hitAll(c, { shards: false });
  };
  D.seed = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => fly(c.stage, centre(c.stage, c.from), centre(c.stage, t), "Grass", { count: 3, ms: 540, gap: 60, head: "orb", arc: .3, scale: 1.1, past: c.missed(t) })));
    c.targets.forEach(t => { if (c.missed(t)) return; const at = centre(c.stage, t), size = big(c, t); times(8, i => { const ang = around(8, i); pop(c.stage, `bs-leaf ${tc("Grass")}`, [at[0] + Math.cos(ang) * size * .25, at[1] + Math.sin(ang) * size * .2], { w: size * .24, h: size * .12, rot: (ang * 180) / Math.PI, s0: .1, s1: 1, duration: 560, delay: i * 40, at: .6 }); }); });
    hitAll(c, { shards: false });
  };
  D.cloud = async c => {
    if (!c.targets.length) return false;
    const type = c.type === "Normal" ? "Ground" : c.type;
    await Promise.all(c.targets.map(t => drift(c, t, `bs-puff ${tc(type)}`, { n: 5, w: .34, ms: 580, gap: 50, wave: .06 })));
    c.targets.forEach(t => puffs(c.stage, centre(c.stage, t), big(c, t), 9, { type, peak: .6, rise: .15 }));
    hitAll(c, { shards: c.event.category !== "Status" });
  };
  D.curse = async c => {
    const ts = c.targets.length ? c.targets : [c.from];
    ts.forEach(t => { const at = centre(c.stage, t), size = big(c, t); puffs(c.stage, at, size, 8, { type: "Ghost", peak: .6, rise: .45 }); ring(c.stage, at, size * .5, "Ghost", { s0: 2.2, s1: .3, duration: 560, easing: IN }); });
    tint(c.stage, "Ghost", .1, 700);
    await wait(560);
    hitAll(c, { shards: false });
  };
  D.link = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    await Promise.all([ring(c.stage, [x, y], size * .6, "Ghost", { s0: 2, s1: .5, duration: 560, easing: IN }), puffs(c.stage, [x, y], size, 7, { type: "Ghost", peak: .55, rise: .4 })[0]]);
    await flashMon(c.stage, c.from, .4);
  };
  // swapped things cross in the air (Trick, Skill Swap, Ally Switch)
  D.swap = async c => {
    const t = c.targets[0];
    if (!t) return false;
    const a = centre(c.stage, c.from), b = centre(c.stage, t);
    const cls = /trick|switcheroo|bestow/.test(c.id) ? "bs-item" : `bs-orb ${tc(c.type)}`;
    toss(c.stage, cls, a, { w: 18, h: 18, dx: b[0] - a[0], dy: b[1] - a[1], g: -50, spin: 360, s0: 1.2, s1: 1.2, duration: 640, out: false, fadeAt: .9 });
    toss(c.stage, cls, b, { w: 18, h: 18, dx: a[0] - b[0], dy: a[1] - b[1], g: 50, spin: -360, s0: 1.2, s1: 1.2, duration: 640, out: false, fadeAt: .9 });
    await wait(640);
    hitAll(c, { shards: false });
  };
  D.feathers = async c => {
    if (!c.targets.length) return false;
    await Promise.all(c.targets.map(t => drift(c, t, `bs-feather ${tc("Flying")}`, { n: 8, w: .28, h: .11, ms: 780, gap: 60, wave: .16, spin: 360 })));
    hitAll(c, { shards: false });
  };
  // what is set on the foe's side is thrown there and lands on its floor (Stealth Rock, Spikes, Sticky Web)
  D.hazard = async c => {
    const box = c.stage.getBoundingClientRect(), [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from), foeOwn = !own(c, c.from);
    const to = [box.width * (foeOwn ? .3 : .66), box.height * (foeOwn ? .9 : .56)];
    if (c.id === "stickyweb") {
      await vanish(bit(c.stage, `bs-net ${tc("Bug")}`, size, size), Array.from({ length: 13 }, (_, j) => { const p = j / 12; return { offset: p, opacity: j === 12 ? .9 : 1, transform: T(lerp(x, to[0], p), lerp(y, to[1], p) - Math.sin(Math.PI * p) * size * .8, `rotate(${p * 180}deg) scale(${lerp(.3, 1.4, p)}, ${lerp(.3, p > .8 ? .45 : 1, p)})`) }; }), { duration: 740, easing: "linear" });
      return;
    }
    const head = c.id === "stealthrock" ? "rock" : "crystal", type = c.id === "stealthrock" ? "Rock" : c.id === "toxicspikes" ? "Poison" : "Steel";
    await Promise.all(times(c.id === "stealthrock" ? 5 : 3, i => fly(c.stage, [x, y], [to[0] + (i - 2) * size * .3, to[1] + (i % 2) * 6], type, { count: 1, ms: 540, head, arc: .32, scale: 2, spin: 540, trail: c.id === "stealthrock" ? "dust" : null }).then(() => puffs(c.stage, [to[0] + (i - 2) * size * .3, to[1]], size * .5, 2, { type, peak: .45 })[0])));
  };
  D.clear = async c => {
    const box = c.stage.getBoundingClientRect();
    times(16, i => toss(c.stage, "bs-puff smoke", [box.width * rand(.05, .95), box.height * rand(.3, .9)], { w: box.width * rand(.14, .22), dx: rand(-20, 20), dy: -rand(10, 30), s0: .4, s1: 1.7, peak: .45, fadeAt: .4, duration: 1200, delay: i * 30 }));
    await wait(760);
  };
  // gusts blow across from behind the user (Tailwind, Defog, Whirlwind, Tidy Up)
  D.gust = async c => {
    const box = c.stage.getBoundingClientRect(), u = unitOf(c.stage), s = own(c, c.from) ? 1 : -1;
    times(16, i => toss(c.stage, "bs-streak", [s > 0 ? -60 : box.width + 60, box.height * rand(.1, .9)], { w: rand(60, 120) * u, h: 2, dx: s * (box.width + 120), dy: rand(-14, 14), s0: 1, s1: 1, out: false, duration: 580, delay: i * 34, fadeAt: .75, face: s > 0 ? 0 : 180 }));
    times(8, i => toss(c.stage, `bs-leaf ${tc("Flying")}`, [s > 0 ? -20 : box.width + 20, box.height * rand(.3, .8)], { w: 14 * u, h: 6 * u, dx: s * (box.width + 40), dy: rand(-40, 10), spin: 720, s0: 1, s1: .8, out: false, duration: 780, delay: 80 + i * 60 }));
    if (c.targets.length && c.event.category !== "Status") { await wait(320); hitAll(c); return; }
    await wait(640);
  };
  // the field's own change answers on its line; the move sends its type up into the sky first
  D.weather = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    await charge(c.stage, c.from, c.type, 320);
    times(14, i => toss(c.stage, `bs-orb ${tc(c.type)}`, [x + rand(-.3, .3) * size, y], { w: 10, h: 10, dx: rand(-.4, .4) * size, dy: -y - 20, s0: 1.2, s1: .6, duration: 540, delay: i * 30, out: false }));
    k.flashStage(c.stage, .12, 500);
    await wait(460);
  };
  D.terrain = async c => {
    const [x, y] = feet(c, c.from), size = sizeOf(c.stage, c.from);
    move(user(c), [{ transform: "none" }, { transform: "translateY(-12%)", easing: IN }, { transform: "none" }], 440);
    await wait(400);
    times(3, i => ring(c.stage, [x, y], size, c.type, { s0: .3, s1: 7 - i, flat: .3, duration: 800, delay: i * 120, thick: !i }));
    tint(c.stage, c.type, .1, 700);
    shake(c.stage, .5);
    await wait(520);
  };
  D.room = async c => {
    const box = c.stage.getBoundingClientRect(), at = [box.width / 2, box.height * .62];
    await charge(c.stage, c.from, c.type, 380);
    times(3, i => ring(c.stage, at, box.width * .2, c.type, { s0: .2, s1: 3 - i * .5, flat: .5, duration: 780, delay: i * 120 }));
    k.flashStage(c.stage, .14, 500);
    await wait(540);
  };
  D.screen = async c => {
    const [x, y] = centre(c.stage, c.from), size = sizeOf(c.stage, c.from);
    await charge(c.stage, c.from, c.type, 300);
    await Promise.all(times(3, i => ring(c.stage, [x, y], size * 1.3, c.type, { s0: .5 + i * .2, s1: 1.4 + i * .2, duration: 540, delay: i * 90, peak: .9 })));
  };
  D.lock = async c => {
    const box = c.stage.getBoundingClientRect(), at = [box.width / 2, box.height * .6];
    orbit(c, at, box.width * .5, `bs-link ${tc("Steel")}`, { n: 12, r0: .9, r1: .7, turns: .3, flat: .35, duration: 900, w: .07, h: .035, face: 90 });
    await wait(700);
  };
  D.hex = () => false;
  return D;
}

/* plays a move's script: each phase in its turn. A phase that hands back false gives the move to stageFx.move's own drawing
   (only the first phase can: a later one has already drawn). Only the last phase lands the blow, so no target is hit twice. */
export async function playScript(D, c, script) {
  const phases = String(script || "").split(" then ").filter(Boolean);
  if (!phases.length) return false;
  for (let i = 0; i < phases.length; i++) {
    const a = parse(phases[i]);
    const draw = D[a.verb];
    if (!draw) return i > 0 ? undefined : false;
    const out = await draw(i < phases.length - 1 ? { ...c, land: () => null } : c, a);
    if (out === false) return i > 0 ? undefined : false;
  }
  return undefined;
}
