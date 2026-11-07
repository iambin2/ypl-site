/* 기술마다의 연출 (DESIGN.md "Battle", What the stage plays). 기술 하나는 게임의 기술 설명문을 읽고 쓴 짧은 각본이다
   (scripts/move-anims.mjs → src/data/move-fx.json): "hit fist fast", "rain boulder 4", "spikes stone", "beam wide gather".
   각본은 "then"으로 이은 단계들이고, 단계는 동사 하나와 그 말들이다. 동사마다 GPU 무대(gl.js)에 그린다: 불은 혀처럼 핥는
   불꽃과 불티와 연기, 물은 물방울과 물보라와 물줄기의 리본, 전기는 매 순간 다시 꺾이는 번개, 빔은 흐르는 심을 가진 빛의 띠.
   타입이 같아도 기술의 이름이 모양을 정한다(화염방사는 입에서 뿜는 불길, 불대문자는 大 자로 터지는 불).
   동사 하나는 promise를 돌려주고, 그것이 맞는 순간이다(결과 줄이 그때 함께 뜬다). */
import MOVE_FX from "../../data/move-fx.json";
import { sfx, verbSound } from "./sfx.js";

export const recipeOf = id => MOVE_FX[id] || "";
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
  const { centre, sizeOf, unitOf, actorOf, rand, lerp, clamp, times, around, typeId, colorOf, glow, ring, shock, sparks, smoke, dust, fire, splash, glints, stamp, beamStrip, boltStrip, slashStrip, pathStrip, orbs, DEBRIS, MARK, bladeOf, charge, aura, lunge, quake, flashMon, flashStage, darken, heal, boost, ailment, sway, morph, reduced } = k;
  const D = {};
  /* ---------- where, how big, which way ---------- */
  const A = (c, lift = .5) => centre(c.stage, c.from, lift);
  const B = (c, t, lift = .45) => centre(c.stage, t, lift);
  // where one blow of a flurry lands: each a little apart over the body (c.jit, set by hit), as a barrage of fists does
  const BJ = (c, t, lift) => { const b = B(c, t, lift); return c.jit ? [b[0] + c.jit[0], b[1] + c.jit[1]] : b; };
  const S = (c, key) => sizeOf(c.stage, key ?? c.from);
  const U = c => unitOf(c.stage);
  const T = c => typeId(c.type);
  const COL = c => colorOf(T(c));
  const mouth = c => A(c, .66);
  const live = (c, t) => !c.blocked(t) && !c.missed(t);
  const landAll = (c, o) => c.targets.forEach(t => c.land(t, o));
  const after = (c, n) => c.e.after(n);
  const aim = c => c.targets.find(t => t !== c.from) || c.targets[0];
  const foes = c => c.targets.filter(t => t !== c.from);
  const dirTo = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  // where a sound stands between the ears (sfx.js): ours on the left, theirs on the right
  const panAt = (c, p) => (c.e.W && p ? clamp(p[0] / c.e.W * 2 - 1, -1, 1) * .55 : 0);
  // where a thing aimed at t ends: short of a guard that holds, past one it misses
  function endOf(c, t, lift = .45) {
    const a = mouth(c), b = B(c, t, lift), d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (c.blocked(t)) { const r = S(c, t) * .62; return [b[0] - (b[0] - a[0]) / d * r, b[1] - (b[1] - a[1]) / d * r]; }
    if (c.missed(t)) return [a[0] + (b[0] - a[0]) * 1.5, a[1] + (b[1] - a[1]) * 1.5];
    return b;
  }
  /* ---------- the camera: on the user as it gathers, on both as it lets go, on the target as it lands ---------- */
  const camUser = (c, z = 1.14, smooth = .3) => { const [x, y] = A(c); c.e.shot(x, y, z, { smooth }); };
  const camOn = (c, t, z = 1.18, smooth = .26) => { const [x, y] = B(c, t); c.e.shot(x, y, z, { smooth }); };
  const camTwo = (c, t, smooth = .4) => {
    const a = A(c), b = B(c, t), { W, H } = c.e;
    const z = clamp(Math.min(W / (Math.abs(b[0] - a[0]) + W * .55), H / (Math.abs(b[1] - a[1]) + H * .5)), 1, 1.16);
    c.e.shot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z, { smooth });
  };
  const camWide = (c, smooth = .45) => c.e.wide(smooth);
  const camFor = (c, smooth) => { const t = aim(c); if (c.event.spread || foes(c).length > 1 || !t) camWide(c, smooth); else camTwo(c, t, smooth); };

  /* ---------- a thing in flight ---------- */
  // carried from a to b over dur (an arc raises it by arc of the distance at its height), its light about it and its trail behind
  function fly(c, a, b, { tex = "orb", ramp = null, size = 18, dur = 360, arc = 0, spin = 0, face = false, rot = 0, trail = true, trailRamp = null, glowK = 2.4, aspect = 1, occ = 0, emis = 1, delay = 0, alpha = 1, core = true, trailN = 18, trailTex = "glow", erode = 0, lit = false, trailLit = false } = {}) {
    const e = c.e, sec = Math.max(.05, dur / 1000), dx = b[0] - a[0], dy = b[1] - a[1], dist = Math.hypot(dx, dy);
    const g = arc ? 8 * arc * dist / (sec * sec) : 0, vx = dx / sec, vy = dy / sec - .5 * g * sec;
    const pos = t => [a[0] + vx * t, a[1] + vy * t + .5 * g * t * t];
    const R = ramp || `${T(c)}.h`;
    sfx("shot", { type: T(c), dur, at: delay, pan: panAt(c, a) });
    if (glowK) e.emit({ at: a, vel: [vx, vy], acc: [0, g], tex: "glow", ramp: R, size: [size * glowK, size * glowK], life: dur, delay, alpha: .55 * alpha, layer: 1 });
    e.emit({ at: a, vel: [vx, vy], acc: [0, g], tex, ramp: R, size: [size, size], aspect, life: dur, delay, spin, face, rot, occ, emis, alpha, erode, lit });
    if (core && !occ && !lit) e.emit({ at: a, vel: [vx, vy], acc: [0, g], tex: "dot", ramp: "white.h", size: [size * .28, size * .28], life: dur, delay, alpha: .7 });
    if (trail) for (let i = 0; i < trailN; i++) { const t = i / trailN * sec; e.emit({ at: pos(t), tex: trailTex, ramp: trailRamp || T(c), size: trailLit ? [size * .8, size * .25] : [size * 1.1, size * .1], life: rand(200, 320), delay: delay + t * 1000, alpha: .75, vj: 16, rot: "rand", erode: trailTex === "flame" || trailLit ? .5 : 0, lit: trailLit, occ: trailLit ? .5 : 0, emis: trailLit ? .9 : 1 }); }
    return e.after(dur + delay);
  }
  // a stream from a toward b: n pieces over `over`, each flying the distance in `travel`, spreading and growing as they go
  function stream(c, a, b, { n = 90, over = 600, travel = 300, spread = .12, tex = "flame", ramp = "fire", size = [8, 40], erode = .5, occ = 0, emis = 1, life = 1.25, drag = 0, spin = 0, rot = "rand", face = false, aspect = 1, delay = 0, alpha = 1, layer = 1, vj = 0, lit = false } = {}) {
    const ang = dirTo(a, b), dist = Math.hypot(b[0] - a[0], b[1] - a[1]), sp = dist / (travel / 1000);
    sfx("stream", { type: T(c), dur: over + travel * .5, at: delay, pan: panAt(c, a) });
    c.e.emit({ n, at: a, dir: ang, arc: spread * 2, speed: [sp * .88, sp * 1.12], size, life: [travel * life * .9, travel * life * 1.1], over, tex, ramp, erode, occ, emis, drag, spin, rot, face, aspect, delay, alpha, layer, vj, lit, grow: true });
    return c.e.after(travel + delay);
  }
  // pieces falling from above onto a point, each in its turn, landing on it with their own debris
  function fallOn(c, at, { n = 4, tex = "rock", ramp = "stone", size = 30, dur = 420, gap = 110, spread = .4, slant = .25, occ = 1, emis = .1, spin = 4, land = null, type = "rock", trail = null, glowK = 0, aspect = 1, face = false, rot = 0, lit = true } = {}) {
    const e = c.e, H = e.H, s = size;
    for (let i = 0; i < n; i++) {
      const x = at[0] + rand(-spread, spread) * s * 2, y = at[1] + rand(-.2, .3) * s, from = [x - H * slant, y - H * 1.05], d = gap * i;
      const sec = dur / 1000, v = [(x - from[0]) / sec, (y - from[1]) / sec];
      sfx("fall", { dur, at: d, pan: panAt(c, [x, y]) }); sfx("impact", { type, p: .6, at: d + dur, pan: panAt(c, [x, y]) });
      e.emit({ at: from, vel: v, tex, ramp, size: [s, s], aspect, life: dur, delay: d, occ, emis, spin, rot: face ? rot : "rand", face, lit });
      if (glowK) e.emit({ at: from, vel: v, tex: "glow", ramp: `${type}.h`, size: [s * glowK, s * glowK], life: dur, delay: d, alpha: .6 });
      if (trail) for (let j = 0; j < 10; j++) { const t = j / 10; e.emit({ at: [lerp(from[0], x, t), lerp(from[1], y, t)], tex: trail[0], ramp: trail[1], size: [s * .9, s * .3], life: 300, delay: d + t * dur, alpha: .7, vj: 10, rot: "rand", erode: .5, lit: trail[0] === "billow", occ: trail[0] === "billow" ? .4 : 0 }); }
      e.at(d + dur, () => { (land || (p => DEBRIS[type]?.(e, p, s * 1.6, .7)))([x, y], i); e.shake(.14); });
    }
    return e.after(dur + gap * (n - 1));
  }
  // pieces drawn round a point and turning, from r0 to r1 (shares of size), squashed by flat, rising by rise
  function orbit(c, at, size, { n = 10, r0 = .8, r1 = .5, turns = 1, flat = .45, dur = 800, tex = "glow", ramp = null, sz = 8, rise = 0, steps = 10, delay = 0, occ = 0, emis = 1, aspect = 1, face = false, lit = false } = {}) {
    const e = c.e, seg = dur / steps;
    for (let i = 0; i < n; i++) for (let j = 0; j < steps; j++) {
      const p0 = j / steps, p1 = (j + 1) / steps, a0 = i / n * Math.PI * 2, at0 = a0 + p0 * turns * Math.PI * 2, at1 = a0 + p1 * turns * Math.PI * 2;
      const q0 = [at[0] + Math.cos(at0) * size * lerp(r0, r1, p0), at[1] + Math.sin(at0) * size * lerp(r0, r1, p0) * flat - rise * size * p0];
      const q1 = [at[0] + Math.cos(at1) * size * lerp(r0, r1, p1), at[1] + Math.sin(at1) * size * lerp(r0, r1, p1) * flat - rise * size * p1];
      const front = Math.sin(at0) > 0;
      e.emit({ at: q0, vel: [(q1[0] - q0[0]) / seg * 1000, (q1[1] - q0[1]) / seg * 1000], tex, ramp: ramp || `${T(c)}.h`, size: [sz, sz], aspect, life: seg + 8, delay: delay + j * seg + i * 12, alpha: front ? 1 : .5, layer: front ? 1 : 0, occ, emis, face, rot: face ? 0 : at0, lit, erode: tex === "billow" ? .4 : 0 });
    }
    return e.after(dur + delay);
  }
  // pieces jutting out of the floor under a point, standing a moment, breaking
  function pillars(c, t, { n = 5, tex = "shard", ramp = "chip", w = .22, h = .9, occ = 1, type = "rock" } = {}) {
    const e = c.e, [x, y] = B(c, t, 0), s = S(c, t);
    dust(e, [x, y], s * 1.2, 6);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2), px = x + off * s * .22, tall = s * h * (1 - Math.abs(off) * .14), lean = off * .2;
      e.emit({ at: [px, y], vel: [0, -tall * 4.5], drag: 9, tex, ramp, size: [tall * .3, tall * 1.25], aspect: w * 2.2, rot: lean, life: 760, delay: Math.abs(off) * 45, occ, emis: .3, lit: true, grow: true });
    }
    e.at(150, () => { DEBRIS[type]?.(e, [x, y - s * .3], s, .8); e.shake(.3); });
    return e.after(170);
  }
  // the user's picture moves on top of what it does
  const move = (c, key, chans, o) => (actorOf(c.stage, key) ? c.e.anim(actorOf(c.stage, key), chans, o) : Promise.resolve());
  const hop = (c, h = .3, dur = 560) => move(c, c.from, { y: [0, -S(c) * h, 0], sy: [1, 1.06, 1] }, { dur, eases: ["out2", "in2"] });
  // light of the type travelling with the user while it moves (a cloak of flames as it charges)
  function cloak(c, dur = 620) {
    // 2026-11-07: a shroud of the type round the whole body (Flare Blitz in flames, Brave Bird in a pale blue blaze, Wild Charge in
    // lightning), lobes licking up off it and streaks thrown back as it runs, as 포켓몬 챔피언스 wraps a charging body
    const e = c.e, a = actorOf(c.stage, c.from), s = S(c), t = T(c), steps = Math.round(dur / 30);
    if (!a) return;
    const look = {
      fire: ["billow", "fire.s", true, .42], water: ["drop", "water.l", true, 0], electric: ["glint", "electric.h", false, 0], grass: ["leaf", "leaf.c", true, 0],
      ice: ["crystal", "ice.c", true, 0], poison: ["billow", "toxic.c", true, .5], dragon: ["billow", "dragon.m", true, .5], fairy: ["flame", "fairy.m", false, .55], bug: ["chip", "bug.m", true, 0],
    }[t] || ["flame", `${t}.m`, false, .6];
    // pale types (flying, steel, normal, rock) would shroud it in white: (2026-11-07 round 3) no lobes of light and no glow; stone and
    // metal throw off lit chips of their matter, Flying and Normal only their speed lines, and the type rim (stageFx aura) carries the colour
    const pale = ["flying", "steel", "normal", "rock", "ice", "ground"].includes(t), al = pale || ["bug", "electric"].includes(t) ? .55 : .9;
    // the bright ones (Bug's lime, Electric's yellow) stack into white too: fewer lobes, fainter
    const bright = ["bug", "electric"].includes(t);
    const chip = { steel: "steel.c", rock: "stone", ground: "earth" }[t], n = !pale ? (bright ? 2 : 4) : t === "ice" ? 2 : 0;
    const [tex, ramp, lit, erode] = look;
    for (let i = 0; i < steps; i++) e.at(i * 30, () => {
      const [x, y] = A(c); const px = x + a.st.x, py = y + a.st.y;
      if (chip && i % 2 === 0) e.emit({ n: 2, at: [px, py], r: [s * .42, s * .42], tex: "chip", lit: true, ramp: chip, vel: () => [rand(-40, 40), -rand(40, 110)], acc: [0, s * 2], size: [[s * .05, s * .1], "same"], rot: "rand", spin: [-8, 8], life: [300, 480], occ: 1, emis: .15 });
      if (n && i % 2 === 0) e.emit({ n, alpha: al, at: [px, py], r: [s * .4, s * .42], tex, ramp, lit, vel: () => [rand(-30, 30), -rand(80, 170)], acc: [0, -s * .6], size: [[s * .2, s * .32], s * .05], life: [260, 420], erode, rot: "rand", spin: [-1, 1], emis: lit ? .55 : 1, occ: lit ? .75 : 0, face: tex === "crystal" || tex === "drop", aspect: tex === "crystal" ? .55 : tex === "leaf" ? 1.9 : tex === "drop" ? .72 : 1 });
      if (t === "water" && i % 2 === 0) pathStrip(e, u => { const ang = u * Math.PI * 1.6 + i * .5; return [px + Math.cos(ang) * s * .5, py + Math.sin(ang) * s * .45 - u * s * .2]; }, { color: e.light ? "#3F9CEB" : "#5DB4FF", width: 6, dur: 260, mode: 2, head: .5, tailLag: .6, occ: .6, emis: .5 });
      if (!pale && !bright) e.emit({ at: [px, py], tex: "glow", ramp: `${t}.h`, size: [s * 1.3, s * 1.4], aspect: .8, life: 90, alpha: .1 });
      if (i % 2 === 0) e.emit({ n: 2, at: [px, py], r: [s * .35, s * .4], tex: "streak", ramp: t, vel: [-(a.st.x || 1) * 3, -(a.st.y || 0) * 3], face: true, size: [3, 2], aspect: [10, 18], life: 240, alpha: .8 });
      if (t === "electric") { const a0 = rand(0, 6.28), a1 = a0 + rand(1, 2); boltStrip(e, [px + Math.cos(a0) * s * .45, py + Math.sin(a0) * s * .5], [px + Math.cos(a1) * s * .45, py + Math.sin(a1) * s * .5], { width: 4, dur: 160, flicker: 3, depth: .3, forks: 0, steps: 6 }); }
    });
    aura(c.stage, c.from, c.type, 1, dur);
  }
  const gatherUp = (c, hold = 420) => Promise.all([charge(c.stage, c.from, c.type, hold), flashMon(c.stage, c.from, .3)]);
  // the light at the mouth as it lets go
  // (round 4: no white dot; it lit the user's face white before every shot)
  const muzzle = (c, at, size, dur = 400, ramp = null) => { c.e.emit({ at, tex: "glow", ramp: ramp || `${T(c)}.h`, size: [size * .5, size * .6], life: dur, alpha: .35 }); };
  // a continuous splash where a stream or beam is hitting
  const splashOn = (c, at, t, dur, power = 1) => {
    const e = c.e, s = S(c, t), ty = T(c);
    e.emit({ n: 30 * power, at, tex: "streak", ramp: ty, speed: [s * 2, s * 5], face: true, drag: 3, size: [3, 1], aspect: [5, 10], life: [200, 340], over: dur });
    e.emit({ n: 8, at, r: s * .2, tex: "glow", ramp: `${ty}.h`, size: [s * .3, s * .8], life: 300, over: dur, alpha: .35, grow: true });
  };

  /* ---------- the marks a blow of the body leaves, at the instant it lands ---------- */
  const thrust = (c, t, tex, { w = .5, h = w, from = .5, face = 0, ramp = "white.h", dur = 260, angle = null, alpha = 1 } = {}) => {
    const [bx, by] = BJ(c, t), s = S(c, t), a = angle ?? dirTo(A(c), [bx, by]), st = [bx - Math.cos(a) * s * from, by - Math.sin(a) * s * from], sec = dur * .4 / 1000;
    // the blow's own shape, solid and lit in its type's colour, as 포켓몬 챔피언스 throws a fist of fire or ice at the target
    // (2026-11-07 round 4: held colours, not the pale hearts: fire.c and fighting.h at emis .8 struck the target as a white disc. The
    // blow is matter of its type, lit and shaded, with little light of its own)
    const solid = ramp === "white.h" ? ({ fire: "fire.s", ice: "ice.c", electric: "electric.d", water: "water.l", grass: "leaf.c", poison: "toxic.c", psychic: "psychic.m", ghost: "ghost.m", dragon: "dragon.m", fairy: "fairy.m", fighting: "fighting.m", steel: "steel.c", rock: "stone", ground: "earth", dark: "dark.m", bug: "bug.m", flying: "flying.m", normal: "gold.c" }[T(c)] || ramp) : ramp;
    c.e.emit({ at: st, vel: [(bx - st[0]) / sec, (by - st[1]) / sec], drag: 9, tex, ramp: solid, size: [s * h * 1.25, s * h * 1.8], aspect: w / h, rot: a + face, life: dur + 80, emis: .3, occ: .92, lit: true, alpha });
    // the blow's own light: its type round the fist, streaks of its speed behind it
    c.e.emit({ n: 8, at: st, r: s * h * .5, vel: [(bx - st[0]) / sec * .3, (by - st[1]) / sec * .3], tex: "streak", ramp: T(c), face: true, rot: a, size: [3, 2], aspect: [10, 18], life: 200, alpha: .8 });
    if (T(c) === "fire") c.e.at(dur * .35, () => fire(c.e, [bx, by], s, 6, { r: .42, size: [.2, .46] }));
    // (round 3: no glow for the pale types, whose glow is a white sheet over the target)
    if (!["steel", "normal", "flying", "ice"].includes(T(c))) c.e.emit({ at: [bx, by], tex: "glow", ramp: `${T(c)}.m`, size: [s * .3, s * 1.1], life: dur, delay: dur * .35, alpha: .16, grow: true });
    if (tex !== "needle") impact(c, t, .8);
  };
  // the instant a body meets a body: lines of force converge on the point, a star of the type bursts from it, the air rings out
  const impact = (c, t, p = 1) => {
    const e = c.e, at = BJ(c, t), s = S(c, t), ty = T(c);
    for (let i = 0; i < 14; i++) { const ang = around(14, i, .15), r = s * rand(.9, 1.3), st = [at[0] + Math.cos(ang) * r, at[1] + Math.sin(ang) * r * .85]; e.emit({ at: st, vel: [(at[0] - st[0]) / .12, (at[1] - st[1]) / .12], tex: "streak", ramp: ["flying", "steel", "ice", "rock"].includes(ty) ? `${ty}.d` : `${ty}.m`, face: true, size: [3.4, 2], aspect: [14, 22], life: 120, alpha: .9 }); }
    // (2026-11-07 round 3: the star and the debris are the landing's own, burst() in stageFx; drawn here too they stacked two stars and
    // two sprays on one point into a white blob. The contact keeps its converging lines, crescents of force and the bent air)
    // (round 4: no crescent of force; a big C of the type's colour stood round the body after every blow, a sign, not a blow)
    e.at(90, () => shock(e, at, s * 2.8 * p, { dur: 460 }));
  };
  const MARKS = {
    body: (c, t) => impact(c, t, 1),
    // Cross Chop (Scarlet and Violet): two great orange blades come in from either side and cross on it
    cross: (c, t) => { const at = B(c, t), s = S(c, t), [b0, b1] = bladeOf(T(c)); for (const [a, d] of [[.75, 0], [Math.PI - .75, 60]]) { slashStrip(c.e, at, a, s * 2.3, { color: b0, width: 40, dur: 340, curve: .08, delay: d, mode: 0 }); slashStrip(c.e, at, a, s * 2.1, { color: b1, width: 10, dur: 320, curve: .08, delay: d + 20 }); } },
    axe: (c, t) => { const [b0, b1] = bladeOf(T(c)); slashStrip(c.e, B(c, t), Math.PI / 2 - .2, S(c, t) * 1.8, { color: b0, width: 26, dur: 280, curve: .1, mode: 0 }); slashStrip(c.e, B(c, t), Math.PI / 2 - .2, S(c, t) * 1.7, { color: b1, width: 9, dur: 260, curve: .1 }); pillars(c, t, { n: 4, h: .7, ramp: "chip" }); },
    chop: (c, t) => {
      const at = B(c, t), s = S(c, t), [b0, b1] = bladeOf(T(c));
      slashStrip(c.e, at, Math.PI / 2 + .25, s * 1.6, { color: b0, width: 26, dur: 260, curve: .05, mode: 0 }); slashStrip(c.e, at, Math.PI / 2 + .25, s * 1.5, { color: b1, width: 8, dur: 240, curve: .05 });
      // Brick Break (Scarlet and Violet): the chop breaks something unseen, pale blue panes of glass fly apart round it
      if (c.id === "brickbreak") c.e.at(120, () => { c.e.emit({ n: 16, at, r: s * .25, tex: "shard", lit: true, ramp: "ice.c", speed: [s * 1.6, s * 3.2], drag: 2.4, acc: [0, s * 2], rot: "rand", spin: [-7, 7], size: [[s * .08, s * .16], s * .05], aspect: .55, life: [500, 800], occ: .7, emis: .5 }); glints(c.e, at, s, 6, "ice.h", { r: .5 }); });
    },
    fist: (c, t) => thrust(c, t, "fist", { w: .42, h: .37, face: 0, from: .7 }),
    hammer: (c, t) => { thrust(c, t, "fist", { w: .5, h: .42, from: 1, angle: Math.PI / 2, dur: 300 }); c.e.shake(.4); },
    palm: (c, t) => thrust(c, t, "hand", { w: .4, h: .44, from: .5 }),
    kick: (c, t) => thrust(c, t, "foot", { w: .46, h: .4, from: .75 }),
    knee: (c, t) => thrust(c, t, "foot", { w: .4, h: .36, from: .6, face: -.6 }),
    horn: (c, t) => thrust(c, t, "needle", { w: .9, h: .2, from: .9, dur: 260 }),
    sting: (c, t) => thrust(c, t, "needle", { w: .7, h: .12, from: .8, dur: 220, ramp: `${T(c)}.h` }),
    beak: (c, t) => { thrust(c, t, "needle", { w: .55, h: .18, from: .6, dur: 240 }); if (c.id === "beakblast") { const at = B(c, t), s = S(c, t); fire(c.e, at, s * 1.2, 14, { r: .4, size: [.2, .46] }); DEBRIS.fire(c.e, at, s, 1); } },
    drill: (c, t) => {
      // Drill Peck, Drill Run (Scarlet and Violet): a cone of spiralling stripes, silver (earth for Ground), turning into the target
      const at = B(c, t), s = S(c, t), a0 = dirTo(A(c), at), st = [at[0] - Math.cos(a0) * s * 1.1, at[1] - Math.sin(a0) * s * 1.1], nx = -Math.sin(a0), ny = Math.cos(a0);
      const [lite, deep] = T(c) === "ground" ? ["#D9B27A", "#8A6A3E"] : ["#EEF2F8", "#7E889C"];
      for (const [k, col] of [[0, lite], [Math.PI, deep]]) pathStrip(c.e, u => { const r = s * .34 * (1 - u * .9), w = Math.cos(u * Math.PI * 7 + k) * r; return [lerp(st[0], at[0], u) + nx * w, lerp(st[1], at[1], u) + ny * w]; }, { color: col, width: 8, dur: 300, mode: 4, head: .7, tailLag: 1, n: 48, occ: .8, emis: .4 });
      thrust(c, t, "needle", { w: .9, h: .26, from: .9, dur: 300 }); orbit(c, at, s, { n: 8, r0: .5, r1: .2, turns: 1.4, flat: .9, dur: 300, tex: "streak", ramp: T(c), sz: 4, aspect: 6 }); sparks(c.e, at, 14, T(c), { speed: [s * 3, s * 6], len: [10, 20] }); },
    head: (c, t) => { const at = B(c, t, .6), s = S(c, t); c.e.emit({ at, tex: "spark", ramp: T(c), size: [s * .3, s * 1.4], life: 280, rot: "rand", grow: true }); c.e.emit({ n: 5, at, r: s * .3, tex: "star", lit: true, ramp: `${T(c)}.h`, speed: [s, s * 2.2], drag: 3, size: [s * .1, s * .04], rot: "rand", spin: [-6, 6], life: 600, occ: .5, emis: .8 }); },
    slam: (c, t) => { c.e.emit({ at: B(c, t), tex: "star", ramp: "white", size: [S(c, t) * .3, S(c, t) * 1.3], life: 300, rot: "rand", grow: true }); c.e.shake(.4); },
    tail: (c, t) => { const at = B(c, t), s = S(c, t), [b0, b1] = bladeOf(T(c)); slashStrip(c.e, at, -.3, s * 1.9, { color: b0, width: 32, dur: 340, curve: .35, mode: 0 }); slashStrip(c.e, [at[0], at[1] + s * .1], -.2, s * 1.6, { color: b1, width: 10, dur: 320, curve: .35, delay: 40 }); sparks(c.e, at, 10, T(c), { speed: [s * 3, s * 6], len: [10, 18] }); },
    whip: (c, t) => { const at = B(c, t), s = S(c, t), a0 = A(c), path = u => [lerp(a0[0], at[0], u), lerp(a0[1], at[1], u) - Math.sin(Math.PI * u) * s * .5 + Math.sin(u * 9) * s * .06]; pathStrip(c.e, path, { color: T(c) === "grass" ? "#3F8A2A" : COL(c), width: 16, dur: 380, mode: 4, head: .4, tailLag: .3, occ: .8, emis: .5 }); pathStrip(c.e, path, { color: T(c) === "fire" ? "#FFD24A" : "#B8F07A", width: 5, dur: 380, mode: 1, head: .4, tailLag: .3 }); if (T(c) === "fire") c.e.at(300, () => fire(c.e, at, s, 12, { r: .35, size: [.2, .5] })); },
    wing: (c, t) => { const at = BJ(c, t), s = S(c, t), [b0, b1] = bladeOf(T(c) === "steel" ? "steel" : "flying"); for (const sg of [-1, 1]) { slashStrip(c.e, at, sg * .5, s * 1.6, { color: b0, width: 24, dur: 300, curve: .3, delay: sg > 0 ? 60 : 0, mode: 0 }); slashStrip(c.e, at, sg * .5, s * 1.5, { color: b1, width: 7, dur: 280, curve: .3, delay: sg > 0 ? 60 : 0 }); } DEBRIS.flying(c.e, at, s, .6); },
    pincer: (c, t) => { const at = B(c, t), s = S(c, t); for (const sg of [-1, 1]) c.e.emit({ at: [at[0], at[1] + sg * s * .55], vel: [0, -sg * s * 3.4], drag: 9, tex: "crescent", lit: true, ramp: T(c) === "water" ? "water.m" : `${T(c)}.m`, size: [s * .45, s * .45], aspect: 2.2, rot: sg > 0 ? Math.PI : 0, life: 380, occ: .9, emis: .3 }); if (T(c) === "water") c.e.at(150, () => splash(c.e, at, s, 1.2)); },
    arms: (c, t) => { const at = B(c, t), s = S(c, t); slashStrip(c.e, at, 0, s * 2, { color: COL(c), width: 30, dur: 340, curve: .45, mode: 0 }); slashStrip(c.e, at, Math.PI, s * 2, { color: COL(c), width: 30, dur: 340, curve: .45, delay: 90, mode: 0 }); DEBRIS[T(c)]?.(c.e, at, s, .8); },
    bone: (c, t) => { const at = B(c, t), s = S(c, t); c.e.emit({ at: [at[0] - s, at[1] - s * .3], vel: [s * 5, s * 1.5], tex: "bone", lit: true, ramp: "chip", size: [s * .42, s * .42], aspect: 1.7, spin: 22, life: 200, occ: 1, emis: .25 }); },
    brawl: (c, t) => { const at = B(c, t), s = S(c, t); c.e.emit({ n: 12, at, r: s * .35, tex: "billow", lit: true, ramp: "fairy.m", vel: () => [rand(-30, 30), rand(-20, 10)], size: [[s * .28, s * .38], [s * .44, s * .6]], life: [700, 1000], erode: .45, rot: "rand", occ: .85, emis: .12, alpha: .8, grow: true }); ["star", "heart", "fist", "star", "heart", "fist", "star", "heart"].forEach((tex, i) => c.e.emit({ at: [at[0] + rand(-.45, .45) * s, at[1] + rand(-.4, .25) * s], tex, lit: true, ramp: tex === "heart" ? "fairy.m" : tex === "star" ? "gold.c" : "white.h", size: [s * .12, s * .3], life: 360, delay: i * 70, rot: rand(-.3, .3), occ: .5, emis: .8, grow: true })); glints(c.e, at, s, 10, "fairy.h", { r: .6, over: 500 }); },
    throw: (c, t) => { const s = S(c, t); move(c, t, { y: [0, -s * .6, 0, 0], rot: [0, -.5, .1, 0], sy: [1, 1, .9, 1] }, { dur: 720, at: [0, .4, .62, 1], eases: ["out", "in2", "out"] }); c.e.at(450, () => { stamp(c.e, B(c, t, 0), s, 1); c.e.shake(.5); }); },
  };
  const OWN_MARK = { fang: "fang", claw: "claw", slash: "slash", cross: null, axe: null, wing: null };

  /* ---------- verbs: a blow in person ---------- */
  // over it from above (Fly, Bounce, Flying Press): it rises out of the picture and comes down on the target
  async function dropOnto(c, t) {
    const e = c.e, s = S(c), [ax, ay] = A(c), [bx, by] = B(c, t), H = e.H;
    if (reduced()) return lunge(c.stage, c.from, t, c.type);
    move(c, c.from, { y: [0, -H * 1.2, -H * 1.2, by - ay - H * .4, by - ay, 0, 0], x: [0, 0, bx - ax, bx - ax, bx - ax, 0, 0], alpha: [1, 1, 0, 1, 1, 0, 1] }, { dur: 1100, at: [0, .28, .3, .44, .58, .6, 1], eases: ["in2", "linear", "linear", "in2", "linear", "linear"] });
    camUser(c, 1.1, .2);
    e.at(320, () => camOn(c, t, 1.12, .3));
    await after(c, 640);
    stamp(e, B(c, t, 0), S(c, t), 1.3); e.shake(.6); (DEBRIS[T(c)] || DEBRIS.normal)(e, B(c, t, .2), S(c, t), .8);
  }
  // under the ground or a shadow (Dig, Dive, Phantom Force, Sucker Punch): it sinks and comes up at the target
  async function underneath(c, t, shadow) {
    const e = c.e, s = S(c), [ax, ay] = A(c), [bx, by] = B(c, t), kind = shadow ? "shadow" : T(c) === "water" ? "spray" : "dust";
    if (reduced()) return lunge(c.stage, c.from, t, c.type);
    smoke(e, A(c, 0), s, 6, { ramp: kind, rise: 20 });
    const dx = (bx - ax) * .82, dy = (by - ay) * .82;
    move(c, c.from, { sy: [1, .1, .1, 1, 1, 1, 1], alpha: [1, 0, 0, 1, 1, 0, 1], x: [0, 0, dx, dx, dx, 0, 0], y: [0, 0, dy, dy, dy, 0, 0] }, { dur: 980, at: [0, .2, .28, .42, .7, .8, 1], eases: ["in2", "linear", "out", "linear", "in2", "linear"] });
    await after(c, 300);
    camOn(c, t, 1.16, .2);
    smoke(e, B(c, t, 0), S(c, t), 6, { ramp: kind, rise: 40 });
    await after(c, 160);
  }
  D.hit = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    const mark = a.noun || "body", n = Math.max(1, a.opts.multi || 1), e = c.e;
    // Beak Blast (Scarlet and Violet): the beak heats red-hot first, and the blow goes off in a burst of flame
    if (a.has("gather")) { camUser(c, 1.16); await (c.id === "beakblast" ? Promise.all([charge(c.stage, c.from, "fire", 520), move(c, c.from, { rimR: [1, 1], rimG: [.45, .45], rimB: [.15, .15], rimA: [0, .9, .7] }, { dur: 520 })]) : gatherUp(c)); }
    if (a.has("bow")) await move(c, c.from, { y: [0, S(c) * .06, 0], sy: [1, .88, 1] }, { dur: 420, ease: "inout" });
    if (a.has("flex")) await D.flex(c, a, true);
    if (a.has("rage")) { const [x, y] = A(c, .85), s = S(c); e.emit({ at: [x + s * .22, y], tex: "cross", ramp: "fire.h", size: [s * .1, s * .3], life: 520, grow: true }); move(c, c.from, { rimR: [1, 1], rimG: [.2, .2], rimB: [.15, .15], rimA: [0, .95, .6] }, { dur: 500 }); e.emit({ n: 12, at: A(c, .05), r: [s * .4, s * .05], tex: "streak", ramp: "recall", vel: () => [rand(-6, 6), -rand(s * 1.4, s * 2.2)], face: true, size: [3, 2], aspect: [10, 18], life: [260, 380], over: 300 }); await after(c, 220); }
    if (a.has("leaves")) { const [x, y] = A(c), s = S(c); e.emit({ n: 14, at: [x, y], tex: "leaf", ramp: "grass.m", speed: [s * 1.2, s * 2], drag: 2, rot: "rand", spin: [-8, 8], size: [s * .14, s * .14], aspect: 1.9, life: 700, occ: .8 }); }
    if (a.has("wrap") || a.has("zap")) cloak(c, a.has("fast") ? 440 : 680);
    if (a.has("dance")) await D.dance(c, a, true);
    if (a.has("above")) await dropOnto(c, t);
    else if (a.has("burrow") || a.has("shadow")) await underneath(c, t, a.has("shadow"));
    else {
      if (a.has("jump") || a.has("stomp")) hop(c, a.has("stomp") ? .2 : .34, 640);
      if (a.has("spin") || a.has("roll")) move(c, c.from, { rot: [0, Math.PI * 2 * (actorOf(c.stage, c.from)?.own ? -2 : 2)] }, { dur: 600, ease: "inout" });
      if (a.has("glide")) { const [x, y] = A(c, 0); e.emit({ n: 10, at: [x, y], r: S(c) * .3, tex: "leaf", ramp: "grass.m", vel: () => [rand(-20, 20), -rand(10, 40)], spin: [-6, 6], size: [10, 10], aspect: 1.9, life: 600, over: 300, occ: .8 }); }
      await lunge(c.stage, c.from, t, c.type, { quick: a.has("fast") || c.event.priority > 0, short: c.blocked(t) });
    }
    const hits = live(c, t);
    for (let i = 0; i < n; i++) {
      if (i) await after(c, 120);
      const sj = S(c, t); c.jit = n > 1 ? [rand(-.32, .32) * sj, rand(-.38, .22) * sj] : null;
      if (hits && MARKS[mark]) MARKS[mark](c, t);
      if (n > 1) (e.burstAt ||= new Map()).set(t, performance.now());
      c.jit = null;
      if (i < n - 1 && hits) { const at = B(c, t), s = S(c, t); e.emit({ at: [at[0] + rand(-.3, .3) * s, at[1] + rand(-.3, .2) * s], tex: "spark", ramp: `${T(c)}.m`, size: [s * .15, s * .6], life: 220, rot: "rand", grow: true }); k.hit(c.stage, t, { share: .15 }); e.shake(.12); }
    }
    landAll(c, { mark: OWN_MARK[mark] === undefined ? undefined : OWN_MARK[mark], power: a.has("wrap") || a.has("above") || mark === "hammer" ? 1.15 : 1 });
    if (!hits) return;
    const s = S(c, t);
    if (a.has("stomp") || a.has("jump") || mark === "hammer") { stamp(e, B(c, t, 0), s, a.has("stomp") || mark === "hammer" ? 1.2 : .9); e.shake(a.has("stomp") ? .5 : .35); }
    if (a.has("item")) { const [x, y] = B(c, t), sg = actorOf(c.stage, t)?.own ? -1 : 1; e.emit({ at: [x, y], vel: [sg * s * 2, -s * 2.4], acc: [0, s * 7], tex: "ball", lit: true, ramp: "white.h", size: [s * .2, s * .2], life: 700, spin: 10, occ: .9, emis: .3 }); glints(e, [x, y], s, 4, "glint", { r: .3 }); }
    if (a.has("drain")) flowBack(c, t, 10);
    if (a.has("low")) { const [x, y] = B(c, t, 0); sparks(e, [x, y], 10, T(c), { dir: 0, arc: .3, speed: [s * 4, s * 6], len: [12, 20] }); }
    if (a.has("back")) { const a0 = A(c), b0 = B(c, t); orbs(e, b0, a0, c.type, { n: 10, dur: 300, over: 160, wave: .05, size: 6 }); }
  };
  const flowBack = (c, t, n = 14) => orbs(c.e, B(c, t), A(c), "grass", { n: n + 8, dur: 560, over: 340, wave: .16, size: 10 * U(c) });
  // two hands clap at the target (Fake Out, Encore, Helping Hand)
  D.clap = async c => {
    const t = aim(c) || c.from, e = c.e;
    const [x, y] = B(c, t, .55), s = Math.max(S(c, t), 60);
    // two palms close in from either side of its face and clap together; the user does not run in (a lunge read as a tackle)
    for (const sg of [-1, 1]) e.emit({ at: [x + sg * s * .55, y], vel: [-sg * s * 4.2, 0], drag: 8, tex: "hand", lit: true, ramp: "gold.c", size: [s * .5, s * .5], aspect: .9, rot: sg * .3, life: 520, emis: .5, occ: .8 });
    await after(c, 200);
    if (c.event.category === "Physical") {
      // Fake Out as Scarlet and Violet draw it: at the clap, a startle of yellow jags bursting out of the point between the palms
      for (let i = 0; i < 9; i++) { const a0 = around(9, i, .2), r0 = s * .12, r1 = s * rand(.55, .8); boltStrip(e, [x + Math.cos(a0) * r0, y + Math.sin(a0) * r0], [x + Math.cos(a0) * r1, y + Math.sin(a0) * r1], { color: "#FFE14A", width: 5, dur: 300, flicker: 2, depth: .28, forks: 0, steps: 4, delay: i * 6 }); }
      e.emit({ at: [x, y], tex: "spark", ramp: "gold", size: [s * .2, s * .9], rot: rand(0, 3), life: 240, grow: true });
      sparks(e, [x, y], 12, "electric", { ramp: "gold", speed: [s * 3, s * 5], len: [8, 14] });
    } else sparks(e, [x, y], 12, "normal", { ramp: "gold", speed: [s * 3, s * 5], len: [8, 14] });
    shock(e, [x, y], s * 1.4);
    e.shake(.25);
    if (c.targets.length) landAll(c, { shards: c.event.category !== "Status" });
  };
  // a body coiled round the target squeezes it (Bind, Wrap, Octolock)
  D.squeeze = async c => {
    const t = aim(c);
    if (!t) return false;
    await lunge(c.stage, c.from, t, c.type, { short: true });
    const [x, y] = B(c, t), s = S(c, t), col = T(c) === "normal" ? "#D9B98A" : COL(c);
    for (const [shade, w, emis, mode, occ] of [["#3A2A1E", 18, .1, 4, .9], [col, 13, .6, 4, .85], ["#FFFFFF", 3, 1, 1, 0]]) c.e.strip({ dur: 760, color: shade, mode, emis, occ, points: kk => times(61, j => { const th = j / 60 * Math.PI * 6, r = s * lerp(.8, .52, Math.min(1, kk * 2)), yy = y - s * .4 + j / 60 * s * .8; return [x + Math.cos(th) * r, yy + Math.sin(th) * r * .28, w * (Math.sin(th) > 0 ? 1 : .55), kk > .82 ? (1 - kk) / .18 : 1]; }) });
    move(c, t, { sx: [1, .86, .9, 1], sy: [1, 1.06, 1.04, 1] }, { dur: 700 });
    c.e.at(300, () => { sparks(c.e, [x, y], 10, T(c), { speed: [s * 2, s * 4], len: [8, 14] }); c.e.shake(.2); });
    await after(c, 380);
    landAll(c, { shards: c.event.category !== "Status" });
  };
  // jaws shut on the target's feet (Snap Trap, Grass Knot)
  D.trap = async c => {
    // Grass Knot: thick vines lash up out of the floor round its feet; Snap Trap: steel jaws snap shut on them
    const t = aim(c);
    if (!t) return false;
    const [x, y] = B(c, t, .05), s = S(c, t), grass = T(c) === "grass", e = c.e;
    if (grass) { for (let i = 0; i < 5; i++) { const path = u => [x + (i - 2) * s * .18 + Math.sin(u * 7 + i) * s * .12, y - u * s * .8]; pathStrip(e, path, { color: "#2F7D2A", width: 12, dur: 600, mode: 4, occ: .9, emis: .35, head: .5, tailLag: .75, delay: i * 50 }); pathStrip(e, path, { color: "#7BDB4A", width: 5, dur: 600, mode: 1, head: .5, tailLag: .75, delay: i * 50 }); } e.emit({ n: 10, at: [x, y], r: s * .3, tex: "leaf", lit: true, ramp: "leaf.c", speed: [s, s * 2], drag: 2, size: [s * .1, s * .1], aspect: 1.9, rot: "rand", spin: [-6, 6], life: 700, occ: 1, emis: .2 }); }
    else for (const sg of [-1, 1]) e.emit({ at: [x + sg * s * .6, y - s * .15], vel: [-sg * s * 4, 0], drag: 8, tex: "fang", lit: true, ramp: "steel.c", size: [s * .45, s * .45], aspect: 2.6, rot: sg * Math.PI / 2, life: 480, occ: .8, emis: .3 });
    await after(c, 240);
    stamp(e, [x, y], s, .6);
    move(c, t, { rot: [0, -.15, 0], y: [0, s * .04, 0] }, { dur: 520 });
    landAll(c);
  };
  // the target's own item rises, glows and strikes it (Poltergeist)
  D.possess = async c => {
    // Poltergeist: a shadow takes the target's own thing; it rises, glowing violet, and strikes it
    const t = aim(c);
    if (!t) return false;
    const [x, y] = B(c, t), s = S(c, t), e = c.e;
    darken(c.stage, .45, 900);
    smoke(e, [x, y], s * 1.2, 8, { ramp: "shadow", rise: 40, alpha: .8 });
    e.emit({ at: [x + s * .5, y - s * .4], vel: [0, -s * .6], tex: "orb", lit: true, ramp: "ghost.h", size: [s * .14, s * .24], life: 420, emis: 1, occ: .3 });
    e.emit({ at: [x + s * .5, y - s * .4], vel: [0, -s * .6], tex: "glow", ramp: "ghost.h", size: [s * .4, s * .6], life: 420, alpha: .6 });
    e.emit({ at: [x + s * .5, y - s * .65], vel: [-s * 3.5, s * 1.6], tex: "orb", lit: true, ramp: "ghost.m", size: [s * .34, s * .34], life: 200, delay: 420, emis: .6, spin: 14, occ: .7 });
    e.emit({ n: 12, at: [x + s * .5, y - s * .5], r: s * .15, tex: "flame", ramp: "ghost", vel: () => [rand(-10, 10), -rand(40, 90)], size: [[s * .1, s * .18], s * .04], life: [380, 560], over: 400, erode: .55, emis: .8 });
    e.at(620, () => { e.emit({ at: [x, y], tex: "splat", ramp: "ink", size: [s * .3, s * 1.1], rot: rand(0, 6), life: 320, occ: .9, emis: 0, alpha: .85, grow: true }); e.shake(.2); });
    await after(c, 620);
    landAll(c);
  };

  /* ---------- verbs: from afar ---------- */
  // a projectile's look: its picture, its type when it is not the move's, its scale and how it flies
  /* 2026-11-06 remake: matter is lit (a stone has its faces, a drop its gloss), an energy is a lit sphere with its halo */
  const M = { lit: true, glowK: 0, core: false };
  const SHOT = {
    seed: ["seed", "grass", 1.4, { ...M, ramp: "leaf.c", occ: 1, emis: .2, trail: false }], rock: ["rock", "rock", 1.3, { ...M, occ: 1, spin: 8, trail: false, ramp: "stone" }], boulder: ["rock", "rock", 2.8, { ...M, occ: 1, spin: 5, arc: .2, trail: false, ramp: "stone" }],
    ice: ["crystal", "ice", 1.9, { ...M, ramp: "ice.c", occ: .85, emis: .4, spin: 6, trailRamp: "ice.h" }], shard: ["shard", "ice", 1.2, { ...M, ramp: "ice.c", occ: .85, emis: .4, face: true, rot: Math.PI / 2, aspect: .45, trailRamp: "ice.h" }], icicle: ["shard", "ice", 1.8, { ...M, ramp: "ice.c", occ: .85, emis: .4, face: true, rot: Math.PI / 2, aspect: .4, trailRamp: "ice.h" }],
    needle: ["needle", null, 2, { face: true, aspect: 4, lit: true, occ: .5, emis: .8, glowK: 1.4, core: false }], dart: ["needle", "dragon", 1.8, { face: true, aspect: 4, lit: true, occ: .6, emis: .5, glowK: 1.2, core: false, ramp: "dragon.m" }], arrow: ["needle", null, 2, { face: true, aspect: 5, lit: true, occ: .7, emis: .4, glowK: 1, core: false }],
    scale: ["scale", null, 1.7, { ...M, spin: 14, ramp: "dragon.m", occ: 1, emis: .35, glowK: .9, trailRamp: "dragon.h" }], orb: ["orb", null, 1.5, { lit: true, occ: .3, glowK: 2 }], fireball: ["billow", "fire", 2.2, { lit: true, glowK: 1.6, core: false, trailTex: "billow", trailLit: true, trailRamp: "fire.b", ramp: "fire.c", erode: .15, occ: .4, emis: 1 }],
    item: ["ball", "normal", 2, { ...M, arc: .3, spin: 10, ramp: "white.h", occ: 1, emis: .2, trail: false }], bouquet: ["flower", "grass", 1.6, { ...M, spin: 6, ramp: "fairy.m", occ: 1, emis: .3 }], garbage: ["billow", "poison", 2.2, { ...M, occ: 1, arc: .2, ramp: "toxic.c", emis: .2, trail: false }],
    salt: ["crystal", "rock", 1.9, { ...M, ramp: "white.h", occ: 1, emis: .2, spin: 5, trail: false }], apple: ["orb", "grass", 2.4, { ...M, occ: 1, emis: .1, ramp: "fire.m", trail: false }], star: ["star", null, 1.4, { lit: true, spin: 10, occ: .4, glowK: 1.4, core: false }],
    leaf: ["leaf", "grass", 1.4, { ...M, spin: 10, aspect: 1.9, occ: 1, emis: .2, ramp: "leaf.c", trailRamp: "grass.h" }], feather: ["feather", "flying", 1.3, { ...M, spin: 4, aspect: 2.2, occ: 1, emis: .2, ramp: "white.h", trail: false }], bubble: ["bubble", "water", 1.4, { ...M, ramp: "water.l", occ: .9, emis: .4, trail: false }],
    mud: ["billow", "ground", 2.2, { ...M, occ: 1, emis: .05, ramp: "earth", trail: false }], shell: ["orb", "poison", 2.2, { lit: true, occ: .45, emis: .9, glowK: 1.3, core: false, ramp: "toxic.c", trailRamp: "toxic.h", trailTex: "billow", trailLit: true }], coin: ["coin", "steel", 1, { ...M, ramp: "gold.c", spin: 12, occ: 1, emis: .4, trail: false }],
    comet: ["orb", "dragon", 2.4, { lit: true, occ: .3, glowK: 2.4, core: false, trailTex: "billow", trailLit: true, trailRamp: "dragon.m" }], water: ["drop", "water", 1.6, { ...M, face: true, rot: -Math.PI / 2, aspect: .72, ramp: "water.l", occ: .9, emis: .4, trailRamp: "foam" }],
  };
  D.shoot = async (c, a) => {
    const t = aim(c), e0 = c.e;
    if (!t) return false;
    // Infernal Parade (Scarlet and Violet): its fireballs are ghost-fire, violet and blue, not orange
    const ghostFire = c.id === "infernalparade" ? { ramp: "ghost.h", trailRamp: "ghost" } : null;
    const [tex, type, scale, o0] = (a.noun === "star" && T(c) === "water" ? ["star", "water", 2.2, { ...M, ramp: "water.l", spin: 14, occ: .85, emis: .5, trailRamp: "water" }] : c.id === "clearsmog" ? ["billow", "poison", 2.4, { ...M, arc: .2, ramp: e0.light ? "smoke.l" : "steam", occ: .9, emis: .15, erode: .3, trail: false }] : SHOT[a.noun]) || SHOT.orb, o = ghostFire ? { ...o0, ...ghostFire } : o0, n = Math.max(1, a.count || 1), e = c.e, ty = ghostFire ? "ghost" : type || T(c);
    const size = 19 * U(c) * scale * (a.has("big") ? 1.5 : 1), dur = a.has("fast") ? 240 : 400 + (a.has("big") ? 120 : 0);
    camUser(c, 1.12, .25);
    muzzle(c, mouth(c), size * 3, 260, `${ty}.h`);
    await after(c, 160);
    camFor(c, .32);
    let first = null;
    for (let i = 0; i < n; i++) {
      const tt = c.targets.length > 1 ? c.targets[i % c.targets.length] : t, b = endOf(c, tt), s = S(c, tt), j = n > 1 ? [rand(-.25, .25) * s, rand(-.2, .2) * s] : [0, 0];
      const p = fly(c, mouth(c), [b[0] + j[0], b[1] + j[1]], { tex, size, dur, arc: (o.arc || 0) + (a.has("arc") ? .25 : 0), ramp: o.ramp || (["steel", "ice", "flying", "rock"].includes(ty) ? `${ty}.d` : `${ty}.h`), trailRamp: o.trailRamp || `${ty}.m`, trailTex: o.trailTex, trailLit: o.trailLit, spin: o.spin || 0, face: o.face, rot: o.rot || 0, aspect: o.aspect || 1, occ: o.occ || 0, emis: o.emis ?? (o.occ ? .2 : 1), delay: i * 90, trail: o.trail !== false, erode: o.erode || 0, lit: o.lit, glowK: o.glowK ?? 2.4, core: o.core ?? true });
      // Shell Side Arm (Sword and Shield): the shot bursts into a spatter of violet poison over the target
      e.at(dur + i * 90, () => { if (live(c, tt)) { (e.burstAt ||= new Map()).set(tt, performance.now()); if (a.noun === "shell") { e.emit({ at: B(c, tt), tex: "splat", ramp: "toxic.c", size: [s * .4, s * 1.5], rot: rand(0, 6), life: 520, occ: .9, emis: .25, lit: true, grow: true }); smoke(e, B(c, tt, .1), s * 1.2, 6, { ramp: "toxic", alpha: .6, rise: 24, spread: .5 }); } if (c.id === "clearsmog") smoke(e, B(c, tt, .2), s * 1.5, 10, { ramp: e.light ? "smoke.l" : "steam", alpha: .75, rise: 20, spread: .6 }); DEBRIS[ty]?.(e, B(c, tt), s, .6); e.emit({ at: B(c, tt), tex: "spark", ramp: ty === "normal" ? "gold" : `${ty}.m`, size: [s * .2, s * 1.1], rot: rand(0, 3), life: 200, grow: true }); if (n > 1) k.hit(c.stage, tt, { share: .1 }); e.shake(.1); } });
      first ??= p;
    }
    await after(c, dur + (n - 1) * 90);
    // Spirit Shackle pins its shadow: the arrow stands in the floor at its feet, violet shadow-flame licking up round it (no sigil
    // on the floor, a flat circle reads as a sign)
    if (a.has("pin")) { const b = B(c, t, 0), s = S(c, t), sg = actorOf(c.stage, t)?.own ? -1 : 1; e.emit({ at: [b[0] + sg * s * .25, b[1] - s * .12], tex: "needle", lit: true, ramp: "ghost.h", size: [s * .12, s * .12], aspect: 4, rot: Math.PI / 2 + sg * .3, face: true, life: 800, occ: .5, emis: .8 }); smoke(e, b, s, 5, { ramp: "shadow", rise: 16, alpha: .7, spread: .4 }); e.emit({ n: 8, at: b, r: [s * .3, s * .04], tex: "flame", ramp: "ghost", vel: () => [rand(-10, 10), -rand(40, 90)], size: [[s * .08, s * .14], s * .03], life: [400, 600], erode: .6, emis: .8 }); }
    landAll(c, { type: ty });
  };
  D.rain = async (c, a) => {
    const t = aim(c), e = c.e;
    if (!t && !c.targets.length) return false;
    const shape = a.noun, n = Math.max(1, a.count || 3), U0 = U(c);
    if (shape === "comet") {
      // Draco Meteor: the user fires a light into the sky, the sky darkens and comets streak down in flames
      camUser(c, 1.1, .25);
      e.emit({ at: A(c, .8), vel: [0, -e.H * 3.2], tex: "orb", ramp: "dragon.h", size: [22, 22], life: 400, emis: 1 });
      e.emit({ at: A(c, .8), vel: [0, -e.H * 3.2], tex: "glow", ramp: "dragon.h", size: [60, 60], life: 400, alpha: .6 });
      darken(c.stage, .4, 1500, 400);
      await after(c, 420);
      camWide(c, .5);
      flashStage(c.stage, .2, 300, "#8A90FF");
    } else if (shape === "coin") {
      // Make It Rain: a storm of gold coins pours over the foes
      e.emit({ n: 26, at: A(c, .9), r: 20, vel: () => [rand(-120, 120), -rand(400, 700)], acc: [0, 900], tex: "coin", ramp: "gold", size: [10 * U0, 10 * U0], spin: [-12, 12], life: 900, over: 300, emis: .9 });
      camWide(c, .45);
      await after(c, 300);
    } else { camUser(c, 1.08, .3); await after(c, 200); camFor(c, .35); }
    const list = c.targets.length ? c.targets : [t];
    const look = {
      boulder: { tex: "rock", ramp: "chip", size: 54 * U0, type: "rock", emis: .2 }, ice: { tex: "crystal", ramp: "ice.c", size: 84 * U0, type: "ice", occ: .85, emis: .45, aspect: .7, trail: ["billow", "steam"] },
      icicle: { tex: "shard", ramp: "ice.c", size: 78 * U0, type: "ice", occ: .85, emis: .5, face: true, rot: Math.PI / 2, aspect: .4, slant: .05 }, seed: { tex: "seed", ramp: "leaf.c", size: 26 * U0, type: "grass", occ: 1, emis: .3 },
      apple: { tex: "orb", ramp: "fire.m", size: 70 * U0, type: "grass", n: 1, slant: 0, emis: .2 }, coin: { tex: "coin", ramp: "gold.c", size: 34 * U0, type: "steel", occ: 1, emis: .6, gap: 22, n: n * 5, spread: .8 },
      comet: { tex: "orb", ramp: "dragon.h", size: 26 * U0, type: "dragon", occ: .3, emis: 1, trail: ["billow", "dragon.m"], glowK: 3, slant: .45, dur: 360, gap: 150 },
    }[shape] || { tex: "rock", ramp: "stone", size: 26 * U0, type: "rock" };
    await Promise.all(list.map((tt, i) => fallOn(c, B(c, tt, .2), { n: look.n || n, ...look, lit: shape !== "comet", land: shape === "comet" ? p => { DEBRIS.fire(e, p, S(c, tt), .6); DEBRIS.dragon(e, p, S(c, tt), .8); shock(e, p, S(c, tt) * 2); e.shake(.35); } : null, gap: (look.gap || 110) + i * 20 })));
    if (a.has("ring")) for (let i = 0; i < 4; i++) { const [x, y] = B(c, t, 0), s = S(c, t), ang = i / 4 * Math.PI * 2; e.emit({ at: [x + Math.cos(ang) * s * .55, y + Math.sin(ang) * s * .2], tex: "rock", ramp: "stone", lit: true, size: [s * .3, s * .3], life: 900, occ: 1, emis: .05, layer: 0 }); }
    landAll(c, { type: look.type });
  };
  // pieces jut out of the floor under each target (Stone Edge, Frenzy Plant, Drum Beating)
  D.spikes = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    camOn(c, t, 1.12, .3);
    charge(c.stage, c.from, c.type, 260);
    await after(c, 200);
    const root = a.noun === "root";
    await Promise.all(c.targets.map(tt => (root
      ? (() => { const [x, y] = B(c, tt, 0), s = S(c, tt); for (let i = 0; i < 5; i++) pathStrip(c.e, u => [x + (i - 2) * s * .22 + Math.sin(u * 6 + i) * s * .12, y - u * s * 1.1], { color: "#3F7A24", width: 16, dur: 600, mode: 4, occ: .9, emis: .35, head: .45, tailLag: .75, delay: i * 50 }); for (let i = 0; i < 5; i++) pathStrip(c.e, u => [x + (i - 2) * s * .22 + Math.sin(u * 6 + i) * s * .12, y - u * s * 1.1], { color: "#9BE35A", width: 5, dur: 600, mode: 1, head: .45, tailLag: .75, delay: i * 50 }); stamp(c.e, [x, y], s, .8); c.e.shake(.3); return after(c, 260); })()
      // (round 3: Stone Edge's spears are tall dark stone, standing out of the floor round it; pale chips read as dust)
      : pillars(c, tt, { n: 6, tex: "shard", ramp: "stone", occ: 1, w: .3, h: 1.25 }))));
    landAll(c);
  };
  // the ground under the target glows and bursts upward (Earth Power, Rising Voltage)
  D.erupt = async c => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, ty = T(c);
    camFor(c, .35);
    await Promise.all(c.targets.map(async tt => {
      const [x, y] = B(c, tt, 0), s = S(c, tt), f = .3;
      // (round 3: the crack burns orange, not its pale type light, and what bursts up is lit fire and thrown earth; forty
      // emissive flames over a cream glow read as a white column)
      const hot = ty === "electric" ? "electric.h" : "fire.s";
      e.emit({ at: [x, y], tex: "crack", ramp: hot, size: [s * 1.6 * f, s * 1.8 * f], aspect: 1 / f, life: 900, layer: 0, grow: true });
      e.emit({ at: [x, y], tex: "glow", ramp: ty === "electric" ? "electric.h" : "fire.m", size: [s * 2 * f, s * 2 * f], aspect: 1 / f, life: 900, alpha: .35, layer: 0 });
      await after(c, 320);
      if (ty === "electric") e.emit({ n: 30, at: [x, y], r: [s * .3, 4], vel: () => [rand(-30, 30), -rand(s * 5, s * 8)], drag: 2.5, tex: "spark", ramp: "electric", size: [[s * .2, s * .32], s * .05], life: [400, 600], over: 260 });
      else { fire(e, [x, y], s, 12, { r: [.45, .06], up: 2.2, size: [.24, .5], life: [500, 800] }); e.emit({ n: 12, at: [x, y], tex: "chip", lit: true, ramp: "earth", speed: [s * 2, s * 4], dir: -Math.PI / 2, arc: 1.2, acc: [0, s * 6], size: [[s * .06, s * .12], "same"], rot: "rand", spin: [-8, 8], life: [600, 900], occ: 1, emis: .1 }); }
      if (ty === "electric") for (let i = 0; i < 3; i++) boltStrip(e, [x + rand(-.2, .2) * s, y], [x + rand(-.3, .3) * s, y - s * 1.6], { width: 6, dur: 320, delay: i * 70 });
      dust(e, [x, y], s * 1.2, 6);
      e.shake(.45);
    }));
    landAll(c);
  };
  // a beam: gathered light let go in one burning line (Hyper Beam, Ice Beam, Solar Beam, Flash Cannon)
  D.beam = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    if (c.id === "triattack") return triAttack(c, t);
    const e = c.e, ty = T(c), wide = a.has("wide"), id = c.id, s0 = S(c);
    camUser(c, 1.16, .3);
    if (a.has("gather")) { await gatherUp(c, id === "solarbeam" ? 620 : 460); if (id === "solarbeam") { e.emit({ at: [A(c)[0], -10], vel: [0, e.H * 2], tex: "streak", ramp: "gold", size: [s0 * .8, s0 * .8], aspect: .25, rot: Math.PI / 2, life: 400, alpha: .6 }); } }
    else await charge(c.stage, c.from, c.type, 300);
    if (wide) darken(c.stage, .45, 1100);
    camFor(c, .38);
    const look = { hyperbeam: ["#FFB060", 38], gigaimpact: ["#FFB060", 38], icebeam: ["#9FF0FF", 18], solarbeam: ["#FFF2A0", 40], flashcannon: ["#E8F6FF", 24], chargebeam: ["#FFE45A", 16], ficklebeam: ["#FF9AE0", 20], electroshot: ["#FFE45A", 32], lightofruin: ["#FFB0F0", 40], meteorbeam: ["#FFE0A0", 34], aurorabeam: ["#B0FFE0", 20], psybeam: ["#FF8AD0", 16], bubblebeam: ["#9FD0FF", 16], signalbeam: ["#D0FF8A", 16] }[id] || [colorOf(ty), wide ? 34 : 20];
    const dur = wide ? 900 : 700, list = c.targets.length > 1 && a.has("tri") ? c.targets : [t];
    let reach = 0;
    for (const [i, tt] of list.entries()) {
      const a0 = mouth(c), b = endOf(c, tt), w = look[1] * U(c);
      const twin = a.has("twin") ? [-1, 1] : [0];
      for (const off of twin) { const nx = -(b[1] - a0[1]), ny = b[0] - a0[0], L = Math.hypot(nx, ny) || 1, o = off * w * .7, p0 = [a0[0] + nx / L * o, a0[1] + ny / L * o], p1 = [b[0] + nx / L * o, b[1] + ny / L * o]; beamStrip(e, p0, p1, { color: colorOf(ty), width: w * 1.5, dur, grow: .14, delay: i * 80, mode: 1 }); beamStrip(e, p0, p1, { color: look[0], width: w, dur, grow: .14, delay: i * 80 }); }
      beamStrip(e, a0, b, { color: "#FFFFFF", width: w * .32, dur, grow: .14, delay: i * 80, mode: 1 });
      // light shed along its length, the air shimmering round it
      e.emit({ n: 14, at: () => { const u = rand(.05, 1); return [lerp(a0[0], b[0], u), lerp(a0[1], b[1], u)]; }, tex: "glow", ramp: `${ty}.h`, size: [w * 2, w * 3], life: dur * .6, over: dur * .5, delay: dur * .1 + i * 80, alpha: .25 });
      muzzle(c, a0, w * 2.4, dur);
      const sec = dur / 1000, ang = dirTo(a0, b), len = Math.hypot(b[0] - a0[0], b[1] - a0[1]);
      // what rides the beam: shards of ice, motes of the sun, sparks
      const rider = { icebeam: ["shard", "ice.h", .45], solarbeam: ["glow", "gold", 1], hyperbeam: ["streak", "fire", 6], gigaimpact: ["streak", "fire", 6] }[id] || ["streak", ty, 6];
      e.emit({ n: 50, at: a0, dir: ang, arc: .12, speed: [len * 2.2, len * 3], tex: rider[0], ramp: rider[1], size: [w * .3, w * .1], aspect: rider[2], face: rider[0] !== "glow", rot: rider[0] === "shard" ? Math.PI / 2 : 0, life: [200, 340], over: dur * .8, delay: dur * .1 + i * 80 });
      if (id === "icebeam") e.emit({ n: 26, at: a0, dir: ang, arc: .4, speed: [len * .6, len * 1.4], tex: "flake", ramp: "snow", size: [w * .25, w * .1], spin: [-3, 3], life: [500, 800], over: dur * .8 });
      e.at(dur * .14 + i * 80, () => { if (live(c, tt)) splashOn(c, b, tt, dur * .7, wide ? 1.4 : 1); e.shake(wide ? .5 : .25); shock(e, b, S(c, tt) * 2.4, { dur: dur * .7 }); });
      reach = Math.max(reach, sec * .14 * 1000 + i * 80);
    }
    await after(c, reach);
    landAll(c, { power: wide ? 1.2 : 1 });
    await after(c, dur * .4);
  };
  // Tri Attack: a triangle of fire, ice and lightning spins out at it and each corner bursts in its own matter
  async function triAttack(c, t) {
    const e = c.e, s0 = S(c);
    camUser(c, 1.14, .3);
    const a0 = mouth(c), b = endOf(c, t), sT = S(c, t), r = s0 * .32, looks = [["fire.c", "fire"], ["ice.c", "ice"], ["electric.h", "electric"]], dur = 520;
    // the triangle forms in front of it, its corners lit spheres joined by lines of light
    for (let i = 0; i < 3; i++) { const ang = -Math.PI / 2 + i * Math.PI * 2 / 3, p = [a0[0] + Math.cos(ang) * r, a0[1] + Math.sin(ang) * r]; e.emit({ at: p, tex: "orb", lit: true, ramp: looks[i][0], size: [4, s0 * .2], life: 380, occ: .25, emis: 1, grow: true }); e.emit({ at: p, tex: "glow", ramp: `${looks[i][1]}.h`, size: [4, s0 * .5], life: 380, alpha: .5, grow: true }); }
    await after(c, 360);
    camFor(c, .34);
    for (let i = 0; i < 3; i++) {
      const path = u => { const ang = -Math.PI / 2 + i * Math.PI * 2 / 3 + u * Math.PI * 3, rr = r * (1 - u * .7); return [lerp(a0[0], b[0], u) + Math.cos(ang) * rr, lerp(a0[1], b[1], u) + Math.sin(ang) * rr]; };
      for (let j = 0; j < 12; j++) { const u0 = j / 12, u1 = (j + 1) / 12, p0 = path(u0), p1 = path(u1), seg = dur / 12; e.emit({ at: p0, vel: [(p1[0] - p0[0]) / seg * 1000, (p1[1] - p0[1]) / seg * 1000], tex: "orb", lit: true, ramp: looks[i][0], size: [s0 * .2, s0 * .2], life: seg + 8, delay: j * seg, occ: .25, emis: 1 }); e.emit({ at: p0, tex: "glow", ramp: looks[i][1], size: [s0 * .3, 0], life: 260, delay: j * seg, alpha: .6 }); }
    }
    e.at(dur, () => { if (live(c, t)) { DEBRIS.fire(e, b, sT, .7); DEBRIS.ice(e, b, sT, .7); DEBRIS.electric(e, b, sT, .7); shock(e, b, sT * 2.4); e.shake(.3); } });
    await after(c, dur);
    landAll(c);
  }
  // a stream from the mouth (Flamethrower, Hydro Pump, Scald, Frost Breath, Torch Song)
  D.stream = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, ty = T(c), id = c.id, big = a.has("big"), s0 = S(c);
    camUser(c, 1.12, .28);
    if (a.has("dance")) move(c, c.from, { rot: [0, Math.PI * 2] }, { dur: 600, ease: "inout" });
    await charge(c.stage, c.from, c.type, 240);
    camFor(c, .36);
    const list = c.targets.length > 1 ? c.targets : [t];
    const over = big ? 760 : 620, travel = big ? 260 : 300;
    for (const tt of list) {
      const a0 = mouth(c), b = endOf(c, tt), sT = S(c, tt), U0 = U(c), dist = Math.hypot(b[0] - a0[0], b[1] - a0[1]);
      if (ty === "fire" || id === "torchsong" || id === "burningjealousy") {
        // 포켓몬 챔피언스's flamethrower: a huge billowing column, lobes of fire white-hot at its heart, orange and red outside, browning
        // at the edges as they cool, swelling as they go and engulfing the target, embers and smoke shed off it
        stream(c, a0, b, { n: 140, over, travel, spread: .15, tex: "billow", lit: true, ramp: "fire.s", size: [12 * U0, sT * .95], erode: .36, life: 1.2, alpha: .95, occ: .75, emis: .65 });
        stream(c, a0, b, { n: 30, over, travel: travel * .85, spread: .035, tex: "billow", lit: true, ramp: "fire.c", size: [6 * U0, sT * .28], erode: .3, life: .95, alpha: .7, occ: .3, emis: .8 });
        e.emit({ n: 46, at: a0, dir: dirTo(a0, b), arc: .5, speed: [dist * 1.5, dist * 3], tex: "dot", ramp: "fire.c", size: [3, 1], acc: [0, 120], drag: 1.5, life: [500, 800], over });
        e.at(travel, () => { if (live(c, tt)) fire(e, b, sT, 12, { r: .35, size: [.25, .6], over: over * .8 }); });
        smoke(e, [b[0], b[1] - sT * .2], sT, 6, { delay: travel + over * .4, rise: 50, alpha: .55 });
        e.emit({ n: 8, at: [lerp(a0[0], b[0], .5), lerp(a0[1], b[1], .5)], r: dist * .3, tex: "glow", ramp: "white.h", size: [sT * .6, sT * 1.2], life: 500, over, alpha: .25, distort: true });
        e.distUntil = Math.max(e.distUntil, e.T + over + travel);
      } else if (ty === "water" || id === "chillingwater" || id === "matchagotcha") {
        // a jet of water: a ribbon of white water with spray thrown off it and a splash where it lands
        // a jet of white water and light cyan: a ribbon of it, glossy drops and foam thrown off it, an explosive white splash where it lands
        const col = id === "matchagotcha" ? "#8FD05A" : e.light ? "#3F9CEB" : "#5DB4FF", ramp = id === "matchagotcha" ? "leaf.c" : "water.l";
        pathStrip(e, u => [lerp(a0[0], b[0], u), lerp(a0[1], b[1], u) + Math.sin(u * 8 + e.T * .02) * 2], { color: col, width: (big ? 40 : 24) * U0, dur: over + travel, mode: 3, head: travel / (over + travel), tailLag: over / (over + travel), taper: false, occ: .7, emis: .45 });
        pathStrip(e, u => [lerp(a0[0], b[0], u), lerp(a0[1], b[1], u) + Math.sin(u * 11 + e.T * .03) * 2], { color: "#E8F6FF", width: (big ? 12 : 7) * U0, dur: over + travel, mode: 1, head: travel / (over + travel), tailLag: over / (over + travel), taper: false });
        stream(c, a0, b, { n: 110, over, travel, spread: .08, tex: "drop", lit: true, ramp, size: [5 * U0, 11 * U0], face: true, rot: -Math.PI / 2, aspect: .72, erode: 0, emis: .45, occ: .85 });
        stream(c, a0, b, { n: 50, over, travel, spread: .16, tex: "billow", lit: true, ramp: id === "matchagotcha" ? "leaf.c" : e.light ? "water.l" : "foam", size: [6 * U0, sT * .32], life: 1.1, erode: .5, emis: .5, occ: .8, alpha: .85 });
        e.at(travel, () => { if (live(c, tt)) { splash(e, b, sT, big ? 1.8 : 1.2); e.emit({ n: 10, at: b, r: sT * .25, tex: "billow", lit: true, ramp: "foam", speed: [sT * .8, sT * 2], drag: 3, size: [sT * .2, sT * .55], life: [400, 600], over: over * .7, erode: .5, emis: .5, occ: .85, grow: true }); } });
      } else if (ty === "ice") {
        stream(c, a0, b, { n: 100, over, travel, spread: .14, tex: "billow", lit: true, ramp: "steam", size: [8 * U0, sT * .5], erode: .5, emis: .5, occ: .5, life: 1.3 });
        stream(c, a0, b, { n: 50, over, travel, spread: .1, tex: "crystal", lit: true, ramp: "ice.c", size: [6 * U0, 4], aspect: .6, emis: .4, occ: .85, spin: [-6, 6] });
        stream(c, a0, b, { n: 30, over, travel, spread: .2, tex: "flake", ramp: "snow", size: [3, 10 * U0], spin: [-4, 4] });
      } else {
        // anything else breathed out: a stream of its type's light (Belch, Fiery Dance's kin)
        stream(c, a0, b, { n: 110, over, travel, spread: .12, tex: "billow", lit: true, ramp: ty, size: [8 * U0, sT * .5], erode: .5, emis: .8, occ: .4, life: 1.3 });
        stream(c, a0, b, { n: 40, over, travel, spread: .05, tex: "glow", ramp: ty, size: [6 * U0, sT * .3] });
      }
      muzzle(c, a0, s0 * .6, over);
      e.at(travel, () => { if (live(c, tt)) splashOn(c, b, tt, over, 1); e.shake(.2); });
    }
    await after(c, travel);
    landAll(c);
    await after(c, over * .5);
  };
  // lightning from the user to its target (Thunderbolt, Volt Switch)
  D.bolt = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, s0 = S(c);
    camUser(c, 1.12, .28);
    await charge(c.stage, c.from, "electric", 300);
    const [x, y] = A(c);
    for (let i = 0; i < 4; i++) { const ang = around(4, i); boltStrip(e, [x, y], [x + Math.cos(ang) * s0 * .7, y + Math.sin(ang) * s0 * .7], { width: 4, dur: 200, flicker: 3, forks: 0, steps: 5 }); }
    camFor(c, .3);
    for (const tt of c.targets) {
      const b = endOf(c, tt);
      boltStrip(e, [x, y], b, { width: 13 * U(c), dur: 460, flicker: 9, depth: .12, forks: 4 });
      boltStrip(e, [x, y - s0 * .2], b, { width: 7 * U(c), dur: 420, flicker: 7, depth: .2, forks: 2, delay: 50 });
      boltStrip(e, [x, y + s0 * .1], b, { width: 5 * U(c), dur: 380, flicker: 6, depth: .24, forks: 1, delay: 110 });
      glow(e, b, S(c, tt) * 1.2, "electric", { dur: 360, alpha: .5 });
    }
    flashStage(c.stage, .14, 260, "#FFF6A0");
    e.shake(.35);
    await after(c, 120);
    landAll(c);
    if (a.has("back")) { await after(c, 200); orbs(e, B(c, t), A(c), "electric", { n: 8, dur: 260, over: 100, size: 7 }); }
  };
  // a bolt from the sky (Thunder): the stage darkens under a cloud, a pillar of lightning drops onto it
  D.sky = async c => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, [x, y] = B(c, t), s = S(c, t);
    darken(c.stage, .35, 900);
    e.emit({ n: 5, at: [x, -e.H * .05], r: [s, s * .2], tex: "cloud", ramp: e.light ? "smoke.l" : "smoke", size: [s * 1.5, s * 2], aspect: 1.8, life: 1200, occ: .8, emis: 0 });
    camOn(c, t, 1.08, .4);
    await after(c, 380);
    for (let i = 0; i < 3; i++) boltStrip(e, [x + rand(-.3, .3) * s, -e.H * .05], [x, y], { width: (16 - i * 4) * U(c), dur: 520, flicker: 9, depth: .09, forks: 4, delay: i * 50, steps: 16 });
    flashStage(c.stage, .5, 360, "#FFF6C0");
    glow(e, [x, y], s * 1.6, "electric", { dur: 480, alpha: .5 });
    stamp(e, B(c, t, 0), s, 1.2); DEBRIS.electric(e, B(c, t, 0), s, 1.2);
    shock(e, [x, y], s * 3);
    e.shake(.7);
    landAll(c, { power: 1.2 });
  };
  // a wall of water sweeps the field (Surf, Muddy Water, Sludge Wave): it rises behind the user and rolls across to the far side,
  // a crest of foam along its top, spray thrown off its face
  D.wave = async c => {
    const e = c.e, { W, H } = e, id = c.id, own = actorOf(c.stage, c.from)?.own;
    const look = id === "muddywater" ? { body: "earth", foam: "dust", crest: "#D8B27A" } : id === "sludgewave" ? { body: "toxic.c", foam: "toxic.c", crest: "#D9A0FF" } : { body: "water.m", foam: "foam", crest: "#EAF8FF" };
    camUser(c, 1.06, .35);
    await charge(c.stage, c.from, c.type, 260);
    camWide(c, .45);
    const from = own ? [W * .05, H * 1.15] : [W * .95, H * .2], to = own ? [W * 1.05, H * .05] : [-W * .05, H * 1.2];
    const L = Math.hypot(to[0] - from[0], to[1] - from[1]), dx = (to[0] - from[0]) / L, dy = (to[1] - from[1]) / L, px = -dy, py = dx, dur = 1000, sp = L / (dur / 1000);
    const steps = 26;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1), cx = lerp(from[0], to[0], t), cy = lerp(from[1], to[1], t), delay = t * dur;
      // a point on the wall: anywhere across the field, and up to a fifth of the stage deep behind its front
      const along = (deep = .22) => () => { const u = rand(-1, 1) * W * .75, d = -rand(0, deep) * H; return [cx + px * u + dx * d, cy + py * u + dy * d]; };
      // the body of the wave: big masses of deep water moving with it, dark under its foam
      e.emit({ n: 14, at: along(), vel: () => [dx * sp * rand(.85, 1.05), dy * sp * rand(.85, 1.05) - H * .3], acc: [0, H * 1], tex: "billow", lit: true, ramp: look.body, size: [[H * .14, H * .2], [H * .3, H * .38]], rot: "rand", spin: [-1, 1], life: [440, 620], delay, alpha: .85, occ: .8, emis: .3, erode: .3, grow: true });
      // white foam boiling along its crest, glossy spray thrown up off it
      e.emit({ n: 6, at: along(.04), vel: () => [dx * sp, dy * sp - H * .2], acc: [0, H * .6], tex: "billow", lit: true, ramp: look.foam, size: [[H * .08, H * .12], [H * .18, H * .24]], rot: "rand", life: [360, 520], delay, alpha: .95, occ: .85, emis: .45, erode: .45, grow: true });
      e.emit({ n: 8, at: along(.05), vel: () => [dx * sp * .9 + rand(-60, 60), dy * sp * .9 - rand(H * .5, H * 1.1)], acc: [0, H * 2.4], tex: "drop", lit: true, ramp: look.foam === "foam" ? "water.l" : look.foam, face: true, rot: -Math.PI / 2, aspect: .72, size: [[5, 9], 3], life: [400, 600], delay, emis: .4, occ: .85 });
    }
    // the crest: a line of white water riding the front
    for (const lift of [0, .05]) e.strip({ dur, color: look.crest, mode: 3, emis: .55, occ: .35, uLen: 30, tile: 1.2, points: kk => {
      const cx = lerp(from[0], to[0], kk), cy = lerp(from[1], to[1], kk) - H * lift;
      return times(21, j => { const u = (j / 20 - .5) * 1.5 * W; return [cx + px * u, cy + py * u - Math.sin(Math.PI * j / 20) * H * .05, H * (.07 - lift * .6) * Math.sin(Math.PI * j / 20), kk > .85 ? (1 - kk) / .15 : 1]; });
    } });
    e.shake(.3);
    await after(c, dur * .5);
    landAll(c, { type: id === "muddywater" ? "ground" : undefined });
    await after(c, dur * .35);
  };
  // gusts across the field (Heat Wave, Blizzard, Icy Wind, Petal Blizzard, Scorching Sands)
  D.wind = async (c, a) => {
    const e = c.e, { W, H } = e, ty = T(c), id = c.id, own = actorOf(c.stage, c.from)?.own, dir = own ? -.55 : 2.6;
    camUser(c, 1.06, .35);
    await charge(c.stage, c.from, c.type, 240);
    camWide(c, .5);
    const a0 = A(c), dur = 900, sp = W * 1.6;
    const look = a.has("petal") ? ["petal", "fairy.m", [8, 12], 1, true] : ty === "ice" ? ["flake", "snow", [6, 12], .3, false] : ty === "fire" ? ["billow", "fire.s", [30, 64], .7, true] : ty === "ground" ? ["grain", "sand", [3, 5], .8, true] : ty === "bug" ? ["chip", "bug.m", [5, 8], 1, true] : ["leaf", ty === "grass" ? "leaf.c" : `${ty}.m`, [8, 12], 1, true];
    e.emit({ n: 90, at: () => [a0[0] + rand(-.2, .2) * W, a0[1] + rand(-.25, .1) * H], dir, arc: .5, speed: [sp * .7, sp], tex: "streak", ramp: ty === "fire" ? "fire" : "white", face: true, size: [3, 3], aspect: [20, 40], life: [500, 800], over: dur * .8, alpha: .55 });
    e.emit({ n: 110, at: () => [a0[0] + rand(-.2, .2) * W, a0[1] + rand(-.25, .1) * H], dir, arc: .7, speed: [sp * .45, sp * .8], tex: look[0], ramp: look[1], lit: look[4], size: [look[2][0] * U(c), look[2][1] * U(c)], spin: [-8, 8], rot: "rand", aspect: look[0] === "petal" ? .7 : 1, life: [700, 1100], over: dur * .8, occ: look[3], emis: ty === "fire" ? .45 : 1 - look[3] * .7, erode: ty === "fire" ? .55 : 0, alpha: ty === "fire" ? .55 : 1, grow: ty === "fire" });
    if (ty === "fire") { e.emit({ n: 16, at: () => [rand(0, 1) * W, rand(.2, 1) * H], tex: "glow", ramp: "white.h", size: [W * .2, W * .3], life: 800, over: dur, alpha: .5, distort: true }); flashStage(c.stage, .1, 600, "#FF8A40"); }
    if (ty === "ice") flashStage(c.stage, .12, 600, "#C0F0FF");
    e.shake(.25);
    await after(c, dur * .5);
    landAll(c);
    await after(c, dur * .3);
  };
  // a whirl round the target (Fire Spin, Hurricane, Leaf Storm, Sand Tomb, Whirlpool)
  D.vortex = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, ty = T(c), id = c.id;
    camUser(c, 1.1, .3);
    await charge(c.stage, c.from, c.type, 280);
    camFor(c, .35);
    const look = a.has("sand") ? ["billow", "dust", .8] : ty === "fire" ? ["billow", "fire.b", .5] : ty === "grass" ? ["leaf", "leaf.c", 1] : ty === "water" ? ["drop", "water.l", .85] : ty === "bug" ? ["chip", "bug.m", 1] : ["streak", "white", 0];
    for (const tt of c.targets) {
      const [x, y] = B(c, tt, .1), s = S(c, tt) * (a.has("big") ? 1.3 : 1);
      if (id === "hurricane") { e.emit({ at: [x, y - s * .5], tex: "tornado", ramp: "white.h", size: [s * 1.6, s * 1.9], aspect: .8, life: 1000, alpha: .7, grow: true }); darken(c.stage, .6, 900); }
      orbit(c, [x, y], s, { n: 16, r0: .3, r1: .75, turns: 1.6, flat: .3, dur: 900, tex: look[0], ramp: look[1], sz: s * (look[0] === "billow" ? .3 : .16), rise: 1.3, steps: 12, occ: look[2], emis: a.has("sand") ? .1 : look[0] === "billow" ? .9 : 1 - look[2] * .6, lit: look[0] !== "streak" });
      if (a.has("sand")) e.emit({ n: 60, at: [x, y], r: [s * .7, s * .25], tex: "grain", lit: true, ramp: "sand", vel: () => [rand(-1, 1) * s * 2, -rand(s * .5, s * 1.5)], size: [3, 5], life: [500, 800], over: 600, occ: .8, emis: .2 });
      if (ty === "fire") fire(e, [x, y + s * .3], s, 14, { r: [.7, .12], up: 1.2, size: [.2, .45], over: 700 });
      orbit(c, [x, y], s, { n: 10, r0: .7, r1: .4, turns: 1.2, flat: .3, dur: 900, tex: "streak", ramp: ty === "fire" ? "fire" : "white", sz: 6, rise: 1, steps: 10, delay: 100, aspect: 5 });
    }
    e.shake(.2);
    await after(c, 520);
    landAll(c);
  };
  // waves of sound rolling out (Bug Buzz, Hyper Voice, Boomburst)
  D.rings = async (c, a) => {
    const e = c.e, big = a.has("big"), ty = T(c);
    sfx("sound", { at: 120, pan: panAt(c, A(c)) });
    camUser(c, 1.12, .25);
    move(c, c.from, { sx: [1, 1.08, 1], sy: [1, .94, 1] }, { dur: 600 });
    await after(c, 120);
    camFor(c, .4);
    const a0 = mouth(c);
    for (const tt of c.targets.length ? c.targets : []) {
      const b = endOf(c, tt), d = Math.hypot(b[0] - a0[0], b[1] - a0[1]), ang = dirTo(a0, b), n = big ? 8 : 6;
      for (let i = 0; i < n; i++) {
        const sec = .34;
        e.emit({ at: a0, vel: [Math.cos(ang) * d / sec, Math.sin(ang) * d / sec], tex: "arc", ramp: `${ty}.h`, size: [20, S(c, tt) * 1.3], aspect: 1, rot: ang + Math.PI / 2, life: sec * 1000, delay: i * 70, alpha: .9, grow: true });
        e.emit({ at: a0, vel: [Math.cos(ang) * d / sec, Math.sin(ang) * d / sec], tex: "wave", ramp: "white", size: [10, S(c, tt) * 1.2], life: sec * 1000, delay: i * 70, distort: true, grow: true });
      }
      e.at(340, () => { if (live(c, tt)) { move(c, tt, { x: [0, 3, -3, 3, -3, 0] }, { dur: 420, ease: "linear" }); } });
    }
    if (big) { shock(e, a0, e.W * 1.2, { dur: 800 }); e.shake(.6); }
    else e.shake(.25);
    await after(c, 360);
    landAll(c);
  };
  // energy pulsing out from the user (Dark Pulse, Dragon Pulse, Water Pulse, Psyshock, Heal Pulse)
  D.pulse = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, ty = T(c), id = c.id;
    camUser(c, 1.12, .28);
    await charge(c.stage, c.from, c.type, a.has("fast") ? 160 : 300);
    camFor(c, .36);
    const a0 = mouth(c);
    for (const tt of c.targets) {
      const b = endOf(c, tt), sT = S(c, tt);
      if (id === "dragonpulse") {
        // a beam that writhes like a dragon, its head a blaze of blue and violet
        const d = Math.hypot(b[0] - a0[0], b[1] - a0[1]), ang = dirTo(a0, b), nx = -Math.sin(ang), ny = Math.cos(ang);
        pathStrip(e, u => [lerp(a0[0], b[0], u) + nx * Math.sin(u * 9 - e.T * .02) * d * .05, lerp(a0[1], b[1], u) + ny * Math.sin(u * 9 - e.T * .02) * d * .05], { color: "#7A80FF", width: 26 * U(c), dur: 700, mode: 0, head: .4, tailLag: .5 });
        fly(c, a0, b, { tex: "flame", ramp: "dragon", size: 30 * U(c), dur: 280, trailTex: "flame", trailRamp: "dragon", erode: .3 });
      } else if ((ty === "dark" && id !== "nightdaze") || id === "bittermalice") {
        // rings of darkness rolling out, the light round them dimming
        // Dark Pulse: waves of darkness roll out, black lobes edged violet, the air bending behind them
        for (let i = 0; i < 6; i++) { const v = [(b[0] - a0[0]) / .42, (b[1] - a0[1]) / .42], ang = dirTo(a0, b) + Math.PI / 2; e.emit({ at: a0, vel: v, tex: "arc", ramp: "ink", size: [sT * .3, sT * 1.3], rot: ang, life: 420, delay: i * 70, occ: .9, emis: 0, alpha: .9, grow: true }); e.emit({ at: a0, vel: v, tex: "arc", ramp: "ghost.h", size: [sT * .25, sT * 1.15], rot: ang, life: 420, delay: i * 70 + 25, alpha: .7, grow: true }); e.emit({ at: a0, vel: v, tex: "wave", ramp: "white", size: [sT * .1, sT], life: 420, delay: i * 70, distort: true, grow: true }); }
        e.emit({ n: 14, at: a0, dir: dirTo(a0, b), arc: .5, speed: [Math.hypot(b[0] - a0[0], b[1] - a0[1]) * 1.5, Math.hypot(b[0] - a0[0], b[1] - a0[1]) * 2.6], tex: "billow", lit: true, ramp: "ink", size: [sT * .12, sT * .35], life: 420, over: 300, erode: .5, rot: "rand", occ: .9, emis: 0, alpha: .8, grow: true });
        darken(c.stage, .6, 700);
      } else if (id === "nightdaze") {
        // Night Daze (Scarlet and Violet): a crimson-black shockwave bursts out of the user and rolls over the target on a darkened stage
        const d = Math.hypot(b[0] - a0[0], b[1] - a0[1]), ang = dirTo(a0, b);
        darken(c.stage, .5, 900);
        e.emit({ n: 26, at: a0, dir: ang, arc: 1.1, speed: [d * 1.6, d * 2.6], tex: "billow", lit: true, ramp: "ink", size: [sT * .15, sT * .45], life: 520, over: 220, erode: .5, rot: "rand", occ: .9, emis: 0, alpha: .9, grow: true });
        e.emit({ n: 16, at: a0, dir: ang, arc: 1, speed: [d * 1.8, d * 2.8], tex: "billow", lit: true, ramp: "recall.h", size: [sT * .1, sT * .3], life: 480, over: 220, erode: .55, rot: "rand", occ: .7, emis: .4, alpha: .8, grow: true });
        for (let i = 0; i < 3; i++) shock(e, a0, sT * (1.8 + i * .6), { dur: 520, delay: i * 90 });
      } else {
        const vac = id === "vacuumwave", lite = vac ? "flying.d" : `${ty}.h`;
        // Vacuum Wave: a whirl of pale blue air spirals to the target
        if (vac) { const d = Math.hypot(b[0] - a0[0], b[1] - a0[1]), ang = dirTo(a0, b), nx = -Math.sin(ang), ny = Math.cos(ang); for (const k2 of [0, Math.PI]) pathStrip(e, u => [lerp(a0[0], b[0], u) + nx * Math.sin(u * 14 + k2) * sT * .18, lerp(a0[1], b[1], u) + ny * Math.sin(u * 14 + k2) * sT * .18], { color: "#8FC2FF", width: 5, dur: 420, mode: 2, head: .6, tailLag: .5, emis: .6, occ: .3 }); }
        for (let i = 0; i < 5; i++) { e.emit({ at: a0, vel: [(b[0] - a0[0]) / .38, (b[1] - a0[1]) / .38], tex: "arc", ramp: lite, size: [sT * .3, sT * 1.2], rot: dirTo(a0, b) + Math.PI / 2, life: 380, delay: i * 60, alpha: .9, grow: true }); e.emit({ at: a0, vel: [(b[0] - a0[0]) / .38, (b[1] - a0[1]) / .38], tex: "wave", ramp: "white", size: [sT * .1, sT], life: 380, delay: i * 60, distort: true, grow: true }); }
        e.emit({ n: 20, at: a0, dir: dirTo(a0, b), arc: .3, speed: [Math.hypot(b[0] - a0[0], b[1] - a0[1]) * 2, Math.hypot(b[0] - a0[0], b[1] - a0[1]) * 3], tex: "glint", ramp: lite, size: [sT * .05, sT * .12], life: 350, over: 300, emis: 1 });
        fly(c, a0, b, { tex: "orb", size: 14 * U(c), dur: 380, trail: true });
      }
      e.at(380, () => { if (live(c, tt)) shock(e, b, sT * 2); });
    }
    await after(c, a.has("big") ? 460 : 400);
    landAll(c, { power: a.has("big") ? 1.15 : 1 });
  };
  // Fire Blast: a ball of fire flies and bursts into the five-armed flame of the character 大; Overheat and Blast Burn are a blaze
  D.blast = async c => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, id = c.id;
    camUser(c, 1.14, .28);
    await gatherUp(c, 380);
    camFor(c, .34);
    const a0 = mouth(c);
    for (const tt of c.targets) {
      const b = endOf(c, tt), sT = S(c, tt);
      if (id === "fireblast") {
        await fly(c, a0, b, { tex: "billow", lit: true, ramp: "fire.c", size: 30 * U(c), dur: 300, trailTex: "billow", trailLit: true, trailRamp: "fire.b", erode: .15, occ: .4, emis: 1, core: false, glowK: 1.6 });
        if (!live(c, tt)) continue;
        // the arms of 大: up, left, right, and two legs down, each a line of billowing fire thrown out from a white-hot heart
        for (const ang of [-Math.PI / 2, Math.PI, 0, Math.PI * .72, Math.PI * .28]) {
          const reach = sT * (ang === Math.PI || ang === 0 ? 1.15 : 1);
          for (let j = 0; j < 9; j++) { const r = reach * (j + 1) / 9; e.emit({ at: b, vel: [Math.cos(ang) * r * 4, Math.sin(ang) * r * 4], drag: 4, tex: "billow", lit: true, ramp: "fire.b", size: [sT * .2, sT * .4], life: 680, delay: j * 14, erode: .4, rot: "rand", spin: [-1, 1], emis: .9, occ: .55 }); }
        }
        glow(e, b, sT * 1.8, "fire", { dur: 600, ramp: "fire.c" }); shock(e, b, sT * 3, { dur: 600 }); e.shake(.6); DEBRIS.fire(e, b, sT, 1.2);
        flashStage(c.stage, .16, 360, "#FFB060");
      } else {
        // a blaze that swallows it (Overheat, Blast Burn, Burn Up)
        darken(c.stage, .5, 1000);
        stream(c, a0, b, { n: 170, over: 700, travel: 260, spread: .2, tex: "billow", lit: true, ramp: "fire.b", size: [16 * U(c), sT * 1.05], erode: .4, life: 1.4, emis: .9, occ: .55 });
        e.at(260, () => { if (live(c, tt)) { fire(e, b, sT, 26, { r: .45, up: 1.4, size: [.3, .7], over: 600 }); DEBRIS.fire(e, b, sT, 1.4); shock(e, b, sT * 3); e.shake(.7); } });
        await after(c, 260);
      }
    }
    landAll(c, { power: 1.2 });
  };
  // the user bursts with everything it has (Explosion, Self-Destruct, Discharge, Lava Plume, Misty Explosion)
  D.burst = async (c, a) => {
    const e = c.e, ty = T(c), at = A(c), s = S(c), id = c.id, big = a.has("big");
    camUser(c, 1.08, .3);
    await Promise.all([charge(c.stage, c.from, c.type, big ? 520 : 320), move(c, c.from, { sx: [1, 1.12, .96], sy: [1, 1.12, .96], flash: [0, .1, .12] }, { dur: big ? 520 : 320 })]);
    camWide(c, .5);
    sfx("boom", { p: big ? 1.2 : .9, pan: panAt(c, at) });
    if (ty === "electric") {
      // Discharge: lightning thrown out on every side, a crackling sphere of it round the user, sparks raining
      for (let i = 0; i < 12; i++) { const ang = around(12, i); boltStrip(e, at, [at[0] + Math.cos(ang) * e.W * .5, at[1] + Math.sin(ang) * e.H * .5], { width: 8, dur: 460, flicker: 7, delay: i * 25, forks: 2 }); }
      for (let i = 0; i < 8; i++) { const a0 = around(8, i), a1 = a0 + rand(1, 1.8); boltStrip(e, [at[0] + Math.cos(a0) * s * .7, at[1] + Math.sin(a0) * s * .7], [at[0] + Math.cos(a1) * s * .7, at[1] + Math.sin(a1) * s * .7], { width: 5, dur: 400, flicker: 6, forks: 0, steps: 7, delay: i * 30 }); }
      DEBRIS.electric(e, at, s * 1.6, 1.4);
    }
    else {
      const ramp = id === "mistyexplosion" ? "fairy.m" : ty === "fire" || /explosion|selfdestruct/.test(id) ? "fire.s" : `${ty}.m`;
      // a fireball of lit lobes, white-hot only at its heart, browning into smoke at its rim (a page of white read as a raw flash)
      e.emit({ n: 46, at, r: s * .3, tex: "billow", lit: true, ramp, speed: [s * 2, s * 5], drag: 3, size: [[s * .26, s * .4], [s * .6, s * .9]], life: [600, 950], erode: .46, rot: "rand", spin: [-1, 1], emis: .7, occ: .65, alpha: .9, grow: true });
      e.emit({ n: 10, at, r: s * .15, tex: "billow", lit: true, ramp: ramp === "fire.b" ? "fire.c" : ramp, speed: [s, s * 2], drag: 3, size: [[s * .2, s * .3], [s * .4, s * .55]], life: [300, 450], erode: .4, rot: "rand", emis: .9, occ: .3, grow: true });
      smoke(e, at, s * 2.4, 14, { ramp: id === "mistyexplosion" ? "mist" : undefined, rise: 60, alpha: .8, spread: .6, delay: 150, life: [1100, 1600] });
    }
    glow(e, at, s * 2.4 * (big ? 1.3 : 1), ty, { dur: 500, alpha: .25 });
    e.emit({ at, tex: "spark", ramp: big ? "fire" : ty, size: [s * .5, s * 3.4 * (big ? 1.3 : 1)], rot: rand(0, Math.PI), life: 320, alpha: .9, grow: true });
    sparks(e, at, 30, big ? "fire" : ty, { speed: [s * 5, s * 11], len: [16, 34], size: 3.4 });
    shock(e, at, e.W * 1.4, { dur: 800 });
    if (big) flashStage(c.stage, .3, 420, "#FFD8A0");
    e.shake(big ? 1 : .6);
    e.kick(.05);
    await after(c, 160);
    landAll(c, { power: big ? 1.3 : 1.1 });
  };
  // the mind seizes the target: it is lifted and wrung in a bending of the air (Psychic, Extrasensory, Night Shade, Expanding Force)
  D.mind = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, ty = T(c), big = a.has("big");
    camUser(c, 1.14, .28);
    await Promise.all([charge(c.stage, c.from, c.type, 300), move(c, c.from, { rimA: [0, 1, 0] }, { dur: 400 })]);
    if (c.id === "nightshade") darken(c.stage, .5, 900);
    camFor(c, .36);
    // 포켓몬 챔피언스's Psychic: the picture washes magenta, rings of light close and open round the target, streaks run out of it,
    // the colours part at the edges
    if (ty === "psychic") { flashStage(c.stage, .3, 900, "#FF5ADC"); e.anim(e.grade, { ca: [0, .014, 0] }, { dur: 900 }); }
    for (const tt of c.targets) {
      const b = B(c, tt), sT = S(c, tt), rr = ty === "psychic" ? "magenta" : null;
      for (let i = 0; i < 3; i++) ring(e, b, sT * (2.4 - i * .5), ty, { dur: 640, delay: i * 90, s0: 1, alpha: .4, ramp: rr });
      e.emit({ at: b, tex: "glow", ramp: rr || `${ty}.h`, size: [sT * .6, sT * 1.9], life: 760, alpha: .4, grow: true });
      orbit(c, b, sT, { n: 10, r0: .9, r1: .5, turns: 1.2, flat: .5, dur: 760, tex: "glint", ramp: rr || `${ty}.h`, sz: sT * .14, steps: 10, delay: 120 });
      for (let i = 0; i < 6; i++) e.emit({ at: b, tex: "wave", ramp: "white", size: [sT * .2, sT * 2.2], life: 500, delay: i * 90, distort: true, grow: true });
      e.emit({ n: 24, at: b, r: sT * .2, tex: "streak", ramp: rr || `${ty}.h`, speed: [sT * 3, sT * 6], face: true, size: [3, 2], aspect: [10, 20], life: [300, 500], over: 400, delay: 200 });
      glints(e, b, sT, 8, rr || `${ty}.h`, { r: .6, delay: 250 });
      if (live(c, tt)) move(c, tt, { y: [0, -sT * .18, -sT * .14, 0], x: [0, 4, -4, 0], rot: [0, .08, -.08, 0], tintR: [1, 1], tintG: [.4, .4], tintB: [.8, .8], tintA: [0, .35, .35, 0] }, { dur: 760, ease: "inout" });
    }
    if (big) { shock(e, [e.W / 2, e.H * .6], e.W, { flat: .35, dur: 700 }); e.shake(.4); }
    await after(c, 460);
    landAll(c);
  };
  // a sphere gathered and thrown (Shadow Ball, Energy Ball, Aura Sphere, Focus Blast, Sludge Bomb)
  D.orb = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, ty = T(c), big = a.has("big"), id = c.id, s0 = S(c);
    camUser(c, 1.16, .28);
    // the games' spheres are big, about a third of the user (2026-11-06: a 24 dot read as a spark)
    const at = A(c, .55), size = Math.max((big ? 34 : 24) * U(c), s0 * (big ? .5 : .4));
    if (a.has("gather")) await gatherUp(c, 420);
    /* it grows in front of the user, a lit sphere with a halo of its type (Shadow Ball: nearly black with a violet rim and purple
       sparkles round it, as 포켓몬 챔피언스 draws it; Sludge Bomb a glossy ball of sludge; Energy Ball a green sphere) */
    const look = id === "shadowball" ? { ramp: "shadowball", halo: "ghost.h", trailRamp: "ghost", occ: .9, emis: .5 } : id === "sludgebomb" ? { ramp: "toxic.c", halo: "poison.h", trailRamp: "toxic", occ: .9, emis: .4 }
      : id === "aurasphere" ? { ramp: "water.h", halo: "water.h", trailRamp: "water", occ: .2, emis: 1 } : id === "focusblast" ? { ramp: "fighting.h", halo: "fighting.h", trailRamp: "fighting", occ: .2, emis: 1 } : { ramp: `${ty}.h`, halo: `${ty}.h`, trailRamp: ty, occ: .25, emis: 1 };
    e.emit({ at, tex: "glow", ramp: look.halo, size: [4, size * 2.4], life: 360, alpha: .6, grow: true });
    e.emit({ at, tex: "orb", lit: true, ramp: look.ramp, size: [4, size], life: 360, occ: look.occ, emis: look.emis, grow: true });
    e.emit({ n: 16, at, r: size, tex: "glint", ramp: look.halo, vel: () => [rand(-30, 30), rand(-30, 30)], size: [size * .1, size * .3], life: 380 });
    await charge(c.stage, c.from, c.type, 340);
    camFor(c, .34);
    for (const tt of c.targets) {
      const b = endOf(c, tt);
      // the halo first, so the sphere stands in it rather than under it
      fly(c, at, b, { tex: "glow", ramp: look.halo, size: size * 1.7, dur: big ? 460 : 380, trail: false, core: false, glowK: 0, alpha: look.occ > .5 ? .45 : .7 });
      fly(c, at, b, { tex: "orb", lit: true, size, dur: big ? 460 : 380, ramp: look.ramp, trailRamp: look.trailRamp, occ: look.occ, emis: look.emis, core: false, glowK: 0, trailN: look.occ > .5 ? 10 : 24 });
      for (let i = 0; i < 10; i++) { const t = i / 10; e.emit({ at: [lerp(at[0], b[0], t), lerp(at[1], b[1], t)], r: size * .6, tex: "glint", ramp: look.halo, size: [size * .15, size * .3], life: 260, delay: t * (big ? 460 : 380) }); }
      e.at(big ? 460 : 380, () => { if (live(c, tt)) { glow(e, b, S(c, tt) * 1.6, ty, { dur: 420 }); shock(e, b, S(c, tt) * 2.4); if (id === "shadowball") DEBRIS.ghost(e, b, S(c, tt), 1.2); } });
    }
    await after(c, big ? 460 : 380);
    landAll(c, { power: big ? 1.15 : 1 });
    void s0;
  };
  // blades of air or light thrown (Air Slash, Air Cutter, Psycho Cut, Aqua Cutter)
  D.cut = async c => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, ty = T(c), id = c.id;
    camUser(c, 1.12, .26);
    move(c, c.from, { rot: [0, -.15, .1, 0] }, { dur: 420 });
    await after(c, 160);
    camFor(c, .32);
    const n = id === "aircutter" ? 3 : 2, a0 = A(c);
    for (const tt of c.targets) {
      const b = endOf(c, tt), ang = dirTo(a0, b);
      for (let i = 0; i < n; i++) fly(c, a0, [b[0] + rand(-10, 10), b[1] + rand(-10, 10)], { tex: "crescent", ramp: id === "aquacutter" ? "spray" : `${ty}.h`, size: S(c, tt) * .55, aspect: 2, rot: ang + Math.PI / 2, dur: 300, delay: i * 80, trail: true, trailRamp: ty, glowK: 1.6 });
      e.at(300, () => { if (live(c, tt)) for (let i = 0; i < n; i++) slashStrip(e, b, rand(-.6, .6) + Math.PI / 4, S(c, tt) * 1.4, { color: id === "aquacutter" ? "#9FD8FF" : "#FFFFFF", width: 10, dur: 240, delay: i * 80 }); });
    }
    await after(c, 300 + (n - 1) * 80);
    landAll(c);
  };
  // the target's strength is drawn out in green motes back to the user (Giga Drain, Draining Kiss, Strength Sap, Pain Split)
  D.drain = async (c, a) => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e;
    camFor(c, .36);
    if (a.has("kiss")) { const b = B(c, t, .6), s = S(c, t); orbs(e, mouth(c), b, "fairy", { n: 3, dur: 360, over: 120, wave: .1, size: s * .14, tex: "heart", ramp: "fairy.m", trail: false }); await after(c, 380); e.emit({ at: b, tex: "heart", lit: true, ramp: "fairy.m", size: [s * .12, s * .5], life: 520, occ: .8, emis: .4, grow: true }); glints(e, b, s, 6, "fairy.h", { r: .45 }); await after(c, 260); }
    else { const b = B(c, t), s = S(c, t); e.emit({ at: b, tex: "glow", ramp: "grass.h", size: [s * .3, s * 1.4], life: 600, alpha: .45, grow: true }); e.emit({ n: 26, at: () => [b[0] + rand(-.5, .5) * s, b[1] + rand(-.3, .5) * s], vel: () => [rand(-10, 10), -rand(s * .5, s * 1)], tex: "glow", ramp: "grass.h", size: [s * .07, s * .03], life: [400, 600], over: 300, emis: 1 }); glints(e, b, s, 8, "grass.h", { r: .5, over: 300 }); await after(c, 300); }
    landAll(c);
    if (live(c, t)) { if (a.has("kiss")) orbs(e, B(c, t), A(c), "fairy", { n: 20, dur: 560, over: 340, wave: .16, size: 9 * U(c), ramp: "fairy.m" }); else flowBack(c, t, 16); }
    await after(c, 420);
  };
  // a net is shot and wraps the target (Electroweb, String Shot, Toxic Thread)
  D.web = async c => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, ty = T(c);
    camFor(c, .32);
    for (const tt of c.targets) {
      const b = endOf(c, tt), sT = S(c, tt);
      fly(c, mouth(c), b, { tex: "web", ramp: ty === "bug" ? "white.h" : `${ty}.h`, size: sT * .5, dur: 360, spin: 3, glowK: 1.4, trail: false });
      e.at(360, () => {
        e.emit({ at: b, tex: "web", ramp: ty === "bug" ? "white.h" : ty === "electric" ? "electric.d" : `${ty}.m`, size: [sT * .6, sT * 1.4], life: 700, alpha: .8, occ: .6, emis: .45, lit: true, grow: true });
        if (ty === "electric") { for (let i = 0; i < 6; i++) { const ang = around(6, i, .2); boltStrip(e, b, [b[0] + Math.cos(ang) * sT * .65, b[1] + Math.sin(ang) * sT * .65], { width: 4, dur: 520, flicker: 6, depth: .2, forks: 1, steps: 7, delay: i * 30 }); } DEBRIS.electric(e, b, sT, .5); }
      });
    }
    await after(c, 380);
    landAll(c, { shards: false });
  };
  // a column shot into the sky comes down on every foe (Eruption, Water Spout)
  D.volcano = async c => {
    const e = c.e, ty = T(c), at = A(c, .8), s = S(c), water = ty === "water";
    camUser(c, 1.08, .3);
    await charge(c.stage, c.from, c.type, 300);
    e.emit({ n: 80, at, r: [s * .2, 4], vel: () => [rand(-40, 40), -rand(e.H * 1.8, e.H * 2.6)], tex: water ? "drop" : "billow", lit: true, ramp: water ? "water.l" : "fire.b", size: [[s * .2, s * .3], s * .5], face: water, rot: water ? -Math.PI / 2 : "rand", aspect: water ? .72 : 1, life: [500, 700], over: 500, erode: water ? 0 : .4, emis: water ? .4 : .9, occ: water ? .85 : .55 });
    if (!water) smoke(e, at, s * 1.4, 8, { rise: 120, alpha: .7 });
    e.shake(.4);
    await after(c, 500);
    camWide(c, .5);
    await Promise.all(c.targets.map(tt => fallOn(c, B(c, tt, .2), { n: 4, tex: water ? "drop" : "billow", ramp: water ? "water.l" : "fire.c", size: 34 * U(c), dur: 360, gap: 90, slant: 0, occ: water ? .85 : .4, emis: water ? .4 : 1, type: ty, glowK: water ? 0 : 1.6, face: water, rot: -Math.PI / 2, aspect: water ? .72 : 1 })));
    landAll(c, { power: 1.15 });
  };
  // the court quakes (Earthquake, Bulldoze)
  D.quake = async (c, a) => {
    const e = c.e;
    camUser(c, 1.06, .3);
    await hop(c, a.has("stomp") ? .16 : .26, 520);
    camWide(c, .3);
    quake(c.stage, c.from, { big: !a.has("stomp") });
    for (const tt of c.targets) move(c, tt, { y: [0, -S(c, tt) * .08, 0, -S(c, tt) * .04, 0] }, { dur: 600, ease: "out2" });
    await after(c, 200);
    landAll(c, { type: "ground" });
    await after(c, 300);
    void e;
  };
  // the ground splits under the target (Fissure)
  D.crack = async c => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, [x, y] = B(c, t, 0), s = S(c, t);
    // Fissure as Scarlet and Violet play it: the floor under the target splits, a great slab of earth heaves up carrying it, gold light
    // breaks out of the crack beneath, and the slab falls apart
    camOn(c, t, 1.08, .3);
    e.emit({ at: [x, y], tex: "crack", ramp: "scorch", size: [s * .6, s * 1.2], aspect: 3, life: 1600, occ: 1, emis: 0, layer: 0, grow: true });
    dust(e, [x, y], s * 1.4, 8);
    e.shake(.5);
    e.emit({ at: [x, y + s * .55], vel: [0, -s * 3.2], drag: 7, tex: "rock", lit: true, ramp: "earth", size: [s * 1.35, s * 1.4], aspect: 1.9, life: 1100, occ: 1, emis: .08, layer: 0 });
    if (live(c, t)) move(c, t, { y: [0, -s * .3, -s * .3, s * .1, 0] }, { dur: 1100, at: [0, .2, .62, .8, 1], eases: ["out", "linear", "in2", "out"] });
    e.at(420, () => {
      e.emit({ at: [x, y + s * .1], tex: "glow", ramp: "gold", size: [s * .5, s * 1.6], aspect: 3.2, life: 520, alpha: .5, layer: 0, grow: true });
      e.emit({ n: 18, at: [x, y + s * .15], r: [s * .6, s * .05], tex: "streak", ramp: "gold", vel: () => [rand(-10, 10), -rand(s * 2.5, s * 4)], face: true, size: [4, 2], aspect: [14, 26], life: [260, 420], over: 220 });
      e.shake(.6);
    });
    e.at(700, () => { DEBRIS.ground(e, [x, y], s * 1.3, 1.4); DEBRIS.rock(e, [x, y - s * .1], s * 1.2, 1); e.shake(.8); });
    await after(c, 700);
    landAll(c);
  };

  /* ---------- verbs: on itself ---------- */
  const selfAt = c => A(c, .45);
  D.blades = async c => {
    // Swords Dance: solid lit blades of steel turn round the user, rise, and cross over its head in a flash
    const e = c.e, at = selfAt(c), s = S(c);
    camUser(c, 1.16, .3);
    orbit(c, at, s, { n: 6, r0: .8, r1: .6, turns: 1.2, flat: .35, dur: 900, tex: "sword", ramp: "steel.c", sz: s * .34, rise: .3, steps: 14, aspect: 2.6, face: true, lit: true, occ: .7, emis: .5 });
    orbit(c, at, s, { n: 6, r0: .8, r1: .6, turns: 1.2, flat: .35, dur: 900, tex: "glow", ramp: "steel.h", sz: s * .3, rise: .3, steps: 14 });
    e.at(900, () => {
      for (const sg of [-1, 1]) e.emit({ at: [at[0] + sg * s * .12, at[1] - s * .75], tex: "sword", lit: true, ramp: "steel.c", size: [s * .3, s * .5], aspect: 2.6, rot: -Math.PI / 2 + sg * .5, life: 600, occ: .7, emis: .6, grow: true });
      e.emit({ at: [at[0], at[1] - s * .8], tex: "spark", ramp: "white", size: [s * .2, s * 1.2], life: 260, grow: true });
      glints(e, [at[0], at[1] - s * .8], s, 8, "glint", { r: .4 });
      sparks(e, [at[0], at[1] - s * .8], 14, "steel", { ramp: "gold" });
    });
    await Promise.all([after(c, 1050), aura(c.stage, c.from, "fighting", 1, 900)]);
    await boost(c.stage, c.from, 2);
  };
  D.dance = async (c, a, inner = false) => {
    // Dragon Dance: a blue-violet blaze climbs round the user as it moves; Quiver Dance: shining scales of light lift off it
    const e = c.e, at = selfAt(c), s = S(c), ty = T(c), id = c.id;
    if (!inner) camUser(c, 1.14, .3);
    move(c, c.from, { rot: [0, .12, -.12, .08, 0], y: [0, -s * .05, 0, -s * .04, 0] }, { dur: 900, ease: "sine" });
    if (id === "dragondance" || ty === "dragon") {
      const [x, y] = A(c, .05);
      // 2026-11-07 round 3, from Scarlet and Violet: a magenta dome of dragon power closes round it, streams of pink and violet
      // swirling over its face (no white blaze; forty emissive lobes summed to white)
      e.emit({ at, tex: "bubble", ramp: "magenta.h", size: [s * .9, s * 1.35], aspect: 1.05, life: 1000, alpha: .42, emis: 1, grow: true });
      for (let i = 0; i < 5; i++) {
        const tilt = (i - 2) * .32, ph = i * 1.3;
        pathStrip(e, u => { const th = u * Math.PI * 2.6 + ph, r = s * .62; return [at[0] + Math.cos(th) * r, at[1] + Math.sin(th) * r * .55 + Math.cos(th) * r * tilt - s * .05]; }, { color: i % 2 ? "#8A5CFF" : "#E23CCF", width: 7, dur: 900, delay: i * 60, mode: 2, head: .3, tailLag: .35, n: 48, occ: .3, emis: .8 });
      }
      e.emit({ n: 20, at, r: s * .55, tex: "dot", ramp: "magenta", vel: () => [rand(-15, 15), -rand(20, 60)], size: [s * .03, s * .01], life: [500, 800], over: 700 });
      move(c, c.from, { rimR: [.88, .88], rimG: [.24, .24], rimB: [.8, .8], rimA: [0, .8, 0] }, { dur: 900 });
    } else {
      orbit(c, at, s, { n: 14, r0: .75, r1: .55, turns: 1.5, flat: .3, dur: 900, tex: "glint", ramp: `${ty}.h`, sz: s * .16, rise: .9, steps: 12 });
      e.emit({ n: 24, at, r: s * .5, tex: "petal", lit: true, ramp: `${ty}.m`, vel: () => [rand(-30, 30), -rand(40, 100)], spin: [-4, 4], rot: "rand", size: [s * .08, s * .05], aspect: .7, life: [700, 1000], over: 600, occ: .5, emis: .6 });
      aura(c.stage, c.from, c.type, 1, 900);
    }
    await after(c, 920);
    if (!inner) await boost(c.stage, c.from, 1);
  };
  D.flex = async (c, a, inner = false) => {
    // Bulk Up: it tenses, red-orange power swells off it in rising streaks and a heat of light
    const e = c.e, at = selfAt(c), s = S(c), grow = c.id === "growth", ty = grow ? "grass" : "fighting";
    if (!inner) camUser(c, 1.16, .3);
    e.emit({ n: 20, at: A(c, .1), r: [s * .45, s * .1], tex: "streak", ramp: grow ? "grass" : "fire", vel: () => [0, -rand(s * 1.6, s * 2.6)], face: true, size: [3, 2], aspect: [10, 18], life: [300, 450], over: 520, alpha: .9 });
    if (grow) e.emit({ n: 14, at: A(c, .1), r: [s * .45, s * .1], tex: "leaf", lit: true, ramp: "leaf.c", vel: () => [rand(-30, 30), -rand(s * .8, s * 1.4)], spin: [-6, 6], rot: "rand", size: [s * .1, s * .1], aspect: 1.9, life: 800, over: 500, occ: 1, emis: .2 });
    else fire(e, A(c, .05), s, 12, { r: [.42, .06], up: 1.4, size: [.12, .26], over: 480, embers: false });
    await Promise.all([move(c, c.from, { sx: [1, 1.1, 1.1, 1], sy: [1, .94, 1.05, 1] }, { dur: 620 }), aura(c.stage, c.from, ty, 1, 620)]);
    glints(e, at, s, 4, `${ty}.h`, { r: .5 });
    if (!inner) await boost(c.stage, c.from, 1);
  };
  D.gears = async c => {
    // Shift Gear: two lit steel gears mesh and turn against each other, sparks thrown off their teeth
    const e = c.e, at = selfAt(c), s = S(c);
    camUser(c, 1.16, .3);
    for (const [ox, oy, sg, k2] of [[-.3, -.05, 1, .5], [.28, .15, -1, .36]]) e.emit({ at: [at[0] + ox * s, at[1] + oy * s], tex: "gear", lit: true, ramp: k2 > .4 ? "iron" : "steel.c", size: [s * .2, s * k2 * 1.1], spin: sg * 7, life: 1000, occ: 1, emis: .12, grow: true });
    for (let i = 0; i < 4; i++) e.at(200 + i * 160, () => sparks(e, [at[0], at[1] + s * .05], 8, "steel", { ramp: "gold", speed: [s * 2, s * 4], len: [6, 12] }));
    await after(c, 900);
    await boost(c.stage, c.from, 2);
  };
  D.shell = async c => {
    // Shell Smash: it cracks its own shell, lit fragments burst off, a flash of power
    const e = c.e, at = selfAt(c), s = S(c);
    camUser(c, 1.16, .3);
    await move(c, c.from, { sx: [1, .9, 1.1], sy: [1, 1.1, .92] }, { dur: 400 });
    e.emit({ n: 18, at, r: s * .35, tex: "chip", lit: true, ramp: "chip", speed: [s * 1.6, s * 3.4], acc: [0, s * 5], rot: "rand", spin: [-8, 8], size: [[s * .08, s * .15], "same"], life: [600, 900], occ: 1, emis: .2 });
    // (round 3: no flames over its body; the shell bursts, a gold star of the crack, and its power shows as a red-orange rim)
    e.emit({ at, tex: "spark", ramp: "gold", size: [s * .3, s * 1.3], rot: rand(0, 3), life: 240, grow: true });
    shock(e, at, s * 2.6); e.shake(.35);
    move(c, c.from, { rimR: [1, 1], rimG: [.42, .42], rimB: [.15, .15], rimA: [0, .9, 0] }, { dur: 700 });
    await boost(c.stage, c.from, 2);
  };
  D.drum = async c => {
    // Belly Drum: it beats its belly, each beat a puff of force off it, then red power blazes up
    const e = c.e, at = selfAt(c), s = S(c);
    camUser(c, 1.18, .3);
    for (let i = 0; i < 4; i++) e.at(i * 160, () => { move(c, c.from, { sx: [1, 1.08, 1], sy: [1, .92, 1] }, { dur: 150 }); e.emit({ at: [at[0], at[1] + s * .1], tex: "spark", ramp: "fire", size: [s * .2, s * .9], rot: rand(0, 3), life: 160, grow: true }); shock(e, at, s * 1.8, { dur: 260 }); e.shake(.14); });
    await after(c, 680);
    fire(e, A(c, .05), s, 22, { r: [.45, .08], up: 1.6, size: [.16, .34], over: 600 });
    await Promise.all([aura(c.stage, c.from, "fire", 2, 700), boost(c.stage, c.from, 6)]);
  };
  D.sigil = async c => {
    // Calm Mind, Nasty Plot: its mind gathers: the air about its head bends, light of its type circles in and settles into it
    const e = c.e, s = S(c), ty = T(c), head = A(c, .82), dark = c.id === "nastyplot";
    camUser(c, 1.16, .3);
    if (dark) darken(c.stage, .35, 1000);
    for (let i = 0; i < 3; i++) e.emit({ at: head, tex: "wave", ramp: "white", size: [s * 1.6, s * .2], life: 600, delay: i * 200, distort: true, grow: true });
    orbit(c, head, s * .7, { n: 10, r0: 1.1, r1: .2, turns: 1.4, flat: .45, dur: 900, tex: "glint", ramp: `${ty}.h`, sz: s * .12, steps: 12 });
    e.emit({ at: head, tex: "glow", ramp: `${ty}.h`, size: [s * .1, s * .9], life: 900, alpha: .5, grow: true });
    if (dark) e.emit({ at: head, tex: "eye", ramp: "dark.h", size: [s * .1, s * .32], aspect: 1.7, life: 800, emis: .8, grow: true });
    await Promise.all([aura(c.stage, c.from, c.type, 1, 900), after(c, 920)]);
    glints(e, head, s, 6, `${ty}.h`, { r: .3 });
    await boost(c.stage, c.from, dark ? 2 : 1);
  };
  D.focus = async c => {
    // Focus Energy: a wind of power spirals up round it, orange-white, and it braces
    const e = c.e, at = selfAt(c), s = S(c);
    camUser(c, 1.18, .3);
    orbit(c, [at[0], at[1] + s * .35], s, { n: 12, r0: .8, r1: .45, turns: 1.4, flat: .3, dur: 800, tex: "streak", ramp: "fire", sz: 5, rise: 1.2, aspect: 7 });
    orbit(c, [at[0], at[1] + s * .35], s, { n: 8, r0: .7, r1: .4, turns: 1.2, flat: .3, dur: 800, tex: "flame", ramp: "fire.h", sz: s * .14, rise: 1.1, delay: 80 });
    await Promise.all([move(c, c.from, { sy: [1, .95, 1.03, 1] }, { dur: 800 }), aura(c.stage, c.from, "fire", 1, 800), after(c, 820)]);
    glints(e, A(c, .8), s, 4, "fire.h", { r: .3 });
  };
  D.harden = async c => {
    // a sheen runs down it: Iron Defense a mirror shine of steel, Acid Armor a gloss of liquid, Cosmic Power stars, Cotton Guard cotton
    const e = c.e, at = selfAt(c), s = S(c), id = c.id;
    camUser(c, 1.16, .3);
    if (id === "minimize") await move(c, c.from, { sx: [1, .5, 1], sy: [1, .5, 1] }, { dur: 600 });
    if (id === "cottonguard") e.emit({ n: 20, at, r: s * .55, tex: "billow", lit: true, ramp: "white.h", size: [s * .14, s * .32], life: 900, occ: .6, emis: .4, erode: .3, rot: "rand", grow: true });
    else if (id === "acidarmor") { e.emit({ n: 16, at: () => [at[0] + rand(-.4, .4) * s, at[1] - s * .5], vel: [0, s * 1.2], acc: [0, s], tex: "drop", lit: true, ramp: "toxic.c", face: true, rot: -Math.PI / 2, aspect: .72, size: [s * .08, s * .1], life: 700, over: 400, occ: .9, emis: .4 }); }
    else if (id === "cosmicpower") { orbit(c, at, s, { n: 10, r0: .9, r1: .5, turns: 1, flat: .4, dur: 800, tex: "star", ramp: "gold.c", sz: s * .1, lit: true, emis: .8, occ: .4 }); }
    else if (id === "stockpile") { for (let i = 0; i < 3; i++) e.emit({ at, tex: "orb", lit: true, ramp: "white.h", size: [s * .1, s * .4], life: 300, delay: i * 200, emis: .8, occ: .3, grow: true }); }
    // the shine: a band of light sweeping down over it, glints catching at its edges
    for (let i = 0; i < 2; i++) e.emit({ at: [at[0] - s * .6, at[1] - s * .6], vel: [s * 2.4, s * 2.4], tex: "streak", ramp: "white", size: [s * .5, s * .5], aspect: 5, rot: -Math.PI / 4, life: 480, delay: i * 200, alpha: .9 });
    glints(e, at, s, 6, "glint", { r: .45, delay: 250, over: 350 });
    const steel = id === "irondefense" || id === "shelter";
    await Promise.all([move(c, c.from, { tintR: [1, steel ? .82 : 1], tintG: [1, steel ? .88 : 1], tintB: [1, 1], tintA: [0, steel ? .35 : .15, 0], rimR: [.85, .85], rimG: [.92, .92], rimB: [1, 1], rimA: [0, 1, 0] }, { dur: 700 }), after(c, 600)]);
    await boost(c.stage, c.from, 2);
  };
  D.speed = async c => {
    // Agility: it darts side to side faster than the eye, copies of it left behind, lines of speed streaming off it
    const e = c.e, a = actorOf(c.stage, c.from), s = S(c);
    camUser(c, 1.14, .3);
    if (a) { a.trail = true; a.hist = []; }
    for (let i = 0; i < 6; i++) e.at(i * 100, () => { const [x, y] = A(c); e.emit({ n: 6, at: [x + (a?.st.x || 0), y], r: [s * .5, s * .45], vel: [rand(-1, 1) > 0 ? s * 6 : -s * 6, 0], tex: "streak", ramp: "white", face: true, size: [3, 2], aspect: [14, 24], life: 220, alpha: .8 }); });
    for (let i = 0; i < 6; i++) e.at(60 + i * 100, () => { const [x, y] = A(c), yy = y + rand(-.4, .3) * s; pathStrip(e, u => [x - s * .95 + u * s * 1.9, yy], { color: "#8FC2FF", width: 4, dur: 240, mode: 2, head: .5, tailLag: .5, emis: .6, occ: .3 }); });
    await move(c, c.from, { x: [0, -s * .3, s * .3, -s * .2, s * .15, 0], ghost: [0, 1, 1, 1, 1, 0], rimR: [.45, .45], rimG: [.72, .72], rimB: [1, 1], rimA: [0, .8, 0] }, { dur: 700, ease: "inout" });
    if (a) a.trail = false;
    await boost(c.stage, c.from, 2);
  };
  D.charge = async c => { camUser(c, 1.16, .3); await Promise.all([charge(c.stage, c.from, "electric", 600), aura(c.stage, c.from, "electric", 1, 600)]); for (let i = 0; i < 4; i++) { const [x, y] = selfAt(c), s = S(c), a0 = around(4, i); boltStrip(c.e, [x, y], [x + Math.cos(a0) * s * .6, y + Math.sin(a0) * s * .6], { width: 4, dur: 240, flicker: 3, forks: 0, steps: 5, delay: i * 50 }); } await after(c, 300); };
  D.heal = async c => { camUser(c, 1.12, .3); await heal(c.stage, c.from); };
  D.roost = async c => { const e = c.e, at = selfAt(c), s = S(c); camUser(c, 1.12, .3); e.emit({ n: 10, at: [at[0], at[1] - s * .6], r: s * .5, tex: "feather", ramp: "white.h", vel: () => [rand(-20, 20), rand(30, 60)], spin: [-3, 3], size: [s * .14, s * .14], aspect: 2.2, life: 1000, occ: .6, over: 300 }); await heal(c.stage, c.from); };
  D.sunheal = async c => {
    // Synthesis, Morning Sun, Moonlight: a shaft of light comes down on it, motes of it fall and soak in
    const e = c.e, [x, y] = A(c, 0), s = S(c), moon = c.id === "moonlight";
    camUser(c, 1.1, .3);
    if (moon) darken(c.stage, .35, 1100);
    e.emit({ at: [x, y - e.H * .45], tex: "glow", ramp: moon ? "fairy.h" : "gold", size: [s * 1.6, s * 1.9], aspect: s * 1.9 / (e.H * 1.1), life: 1100, alpha: .18, grow: true });
    e.emit({ at: [x, y - s * .3], tex: "glow", ramp: moon ? "fairy.h" : "gold", size: [s * .6, s * 1.4], life: 1000, alpha: .16, grow: true });
    e.emit({ n: 40, at: () => [x + rand(-.55, .55) * s, y - e.H * .6], vel: () => [0, e.H * rand(.9, 1.3)], tex: "glint", ramp: moon ? "fairy.h" : "gold", size: [s * .06, s * .12], life: 600, over: 700, emis: 1 });
    glints(e, [x, y - s * .9], s, 6, moon ? "fairy.h" : "gold", { r: .5, delay: 300 });
    await heal(c.stage, c.from);
  };
  D.rest = async c => {
    const e = c.e, s = S(c), [x, y] = A(c, .85);
    camUser(c, 1.12, .3);
    move(c, c.from, { sy: [1, .94, 1], y: [0, s * .03, 0] }, { dur: 1200, ease: "sine" });
    e.emit({ n: 4, at: [x + s * .15, y], each: i => ({ delay: i * 260, size: [s * (.12 + i * .04), s * (.2 + i * .05)] }), tex: "z", lit: true, ramp: "white.h", vel: [s * .3, -s * .45], life: 1200, emis: .8, occ: .4, rot: -.2 });
    await after(c, 500);
    await heal(c.stage, c.from);
  };
  D.wish = async c => {
    // a star falls from the sky onto it (Wish, Healing Wish)
    const e = c.e, [x, y] = A(c, .6), s = S(c);
    camUser(c, 1.1, .35);
    e.emit({ at: [x - e.W * .3, -20], vel: [e.W * .3 / .6, (y + 20) / .6], tex: "star", ramp: "gold", size: [s * .3, s * .3], spin: 6, life: 600, emis: 1 });
    for (let i = 0; i < 16; i++) { const t2 = i / 16; e.emit({ at: [lerp(x - e.W * .3, x, t2), lerp(-20, y, t2)], tex: "spark", ramp: "gold", size: [s * .2, 0], life: 400, delay: t2 * 600 }); }
    await after(c, 600);
    glow(e, [x, y], s * 1.4, "electric", { dur: 600, ramp: "gold", alpha: .2 });
    glints(e, [x, y], s, 10, "gold", { r: .6, over: 300 });
    await heal(c.stage, c.from);
  };
  D.protect = async c => {
    // it braces and a light of its guard gathers round it (the guard itself closes when the line says it holds)
    const e = c.e, at = selfAt(c), s = S(c), t = { kingsshield: "steel", banefulbunker: "poison", spikyshield: "grass", detect: "fighting", obstruct: "dark", silktrap: "bug", burningbulwark: "fire" }[c.id] || "grass";
    camUser(c, 1.14, .3);
    // 2026-11-07: Scarlet and Violet close the ball at once; no rim light on the body (it read as the body turning white), the panes'
    // own pale blue gathers as motes drawn in to it
    const ramp = c.id === "protect" ? "guard" : `${t}.h`;
    for (let i = 0; i < 14; i++) { const a0 = around(14, i), r = s * rand(.9, 1.2), st = [at[0] + Math.cos(a0) * r, at[1] + Math.sin(a0) * r * .85]; e.emit({ at: st, vel: [(at[0] - st[0]) * 3, (at[1] - st[1]) * 3], drag: 2, tex: "dot", ramp, size: [s * .05, s * .02], life: 260, delay: i * 8, emis: 1 }); }
    await Promise.all([move(c, c.from, { sy: [1, .95, 1] }, { dur: 300 }), after(c, 240)]);
  };
  D.endure = async c => {
    // Endure: it clenches, a red heat of will blazes up round it
    const e = c.e, s = S(c);
    camUser(c, 1.16, .3);
    // (2026-11-07 round 3, Scarlet and Violet: no flames; its outline burns red and red strokes of will rise off it, twice)
    const [x, y] = A(c, .05);
    for (let k = 0; k < 2; k++) e.emit({ n: 14, at: [x, y], r: [s * .4, s * .05], tex: "streak", ramp: "recall", vel: () => [rand(-8, 8), -rand(s * 1.6, s * 2.4)], face: true, size: [4, 2], aspect: [10, 18], life: [260, 380], over: 200, delay: k * 280 });
    await Promise.all([move(c, c.from, { sy: [1, .92, 1, .94, 1], rimR: [1, 1], rimG: [.25, .25], rimB: [.22, .22], rimA: [0, .9, .3, .9, 0] }, { dur: 640 }), after(c, 640)]);
  };
  D.guard = async c => {
    // Wide Guard, Quick Guard: a wall of lit panels rises in front of the whole side, a glint running along it
    const e = c.e, [x, y] = A(c, .4), s = S(c), ty = T(c), own = actorOf(c.stage, c.from)?.own, fx = x + (own ? s * .8 : -s * .8);
    camUser(c, 1.06, .35);
    for (let i = 0; i < 7; i++) { const u = i / 6 - .5; e.emit({ at: [fx + u * s * .5, y + u * s * 1.2], tex: "glow", ramp: `${ty}.h`, size: [s * .1, s * .5], aspect: .45, life: 900, delay: Math.abs(u) * 240, alpha: .55, grow: true }); e.emit({ at: [fx + u * s * .5, y + u * s * 1.2], tex: "hex", ramp: `${ty}.h`, size: [s * .1, s * .34], life: 900, delay: Math.abs(u) * 240, alpha: .8, grow: true }); }
    glints(e, [fx, y], s, 8, "glint", { r: .7, over: 500 });
    await after(c, 760);
  };
  D.spotlight = async c => {
    // Follow Me, Rage Powder: a light comes down on it and draws every eye
    const e = c.e, [x, y] = A(c, 0), s = S(c), rage = c.id === "ragepowder";
    camUser(c, 1.12, .3);
    darken(c.stage, .5, 1000);
    e.emit({ at: [x, y - e.H * .45], tex: "glow", ramp: rage ? "fire.h" : "white.h", size: [s * 1.6, s * 1.8], aspect: s * 1.8 / (e.H * 1.1), life: 1000, alpha: .2, layer: 0, grow: true });
    e.emit({ at: [x, y], tex: "glow", ramp: rage ? "fire.h" : "white.h", size: [s * .6, s * 1.6], aspect: 3, life: 1000, alpha: .14, layer: 0, grow: true });
    e.emit({ n: 30, at: () => [x + rand(-.5, .5) * s, y - s * rand(.3, 1.4)], vel: () => [rand(-8, 8), rand(10, 30)], tex: rage ? "dot" : "glint", ramp: rage ? "fire.h" : "white.h", size: [s * .03, s * .06], life: 900, over: 500, emis: 1 });
    move(c, c.from, { y: [0, -s * .05, 0] }, { dur: 900 });
    await after(c, 900);
  };
  D.sub = async c => {
    const e = c.e, s = S(c);
    camUser(c, 1.12, .3);
    move(c, c.from, { x: [0, (actorOf(c.stage, c.from)?.own ? -1 : 1) * s * .18, 0], sy: [1, .9, 1], rot: [0, -.08, 0] }, { dur: 520 });
    smoke(e, A(c, .2), s * 1.4, 10, { ramp: e.light ? "smoke.l" : "steam", rise: 50, alpha: .85, spread: .5 });
    glints(e, A(c, .4), s, 6, "white.h", { r: .5, delay: 200 });
    await after(c, 400);
  };
  D.morph = async c => { await morph(c.stage, c.from); };
  D.aura = async c => {
    // the user wraps itself in its type: Aqua Ring a veil of water rings and bubbles, Ingrain roots, Magnet Rise a hum of current
    const e = c.e, s = S(c), at = selfAt(c), ty = T(c), id = c.id;
    camUser(c, 1.14, .3);
    if (id === "aquaring") {
      // 2026-11-07: three ribbons of running water wind round it at three heights, each only an arc of a ring at a time (never a
      // closed circle), bubbles rising inside them
      const col = e.light ? "#3F9CEB" : "#5DB4FF";
      for (let i = 0; i < 3; i++) {
        const hy = at[1] + s * (.38 - i * .3), rx = s * (.66 - Math.abs(i - 1) * .08), sg = i % 2 ? -1 : 1;
        const path = u => { const th = sg * u * Math.PI * 3.4 + i * 2; return [at[0] + Math.cos(th) * rx, hy + Math.sin(th) * rx * .26 - u * s * .06]; };
        pathStrip(e, path, { color: col, width: 12, dur: 1000, delay: i * 110, mode: 4, head: .28, tailLag: .28, n: 56, occ: .8, emis: .35 });
        pathStrip(e, path, { color: "#CFEBFF", width: 3, dur: 1000, delay: i * 110 + 30, mode: 1, head: .28, tailLag: .22, n: 56 });
      }
      e.emit({ n: 18, at: [at[0], at[1] + s * .4], r: [s * .5, s * .1], tex: "bubble", lit: true, ramp: "water.l", vel: () => [rand(-8, 8), -rand(s * .5, s)], size: [[s * .05, s * .1], s * .03], life: [600, 900], over: 700, occ: .9, emis: .4 });
    }
    else if (id === "ingrain") { const [x, y] = A(c, 0); for (let i = 0; i < 6; i++) pathStrip(e, u => [x + (i - 2.5) * s * .14 + Math.sin(u * 5 + i) * s * .08, y + u * s * .25], { color: "#7A5A34", width: 8, dur: 800, mode: 4, occ: .9, emis: .3, head: .5, tailLag: .9, delay: i * 40 }); }
    else if (id === "magnetrise") { for (let i = 0; i < 5; i++) { const a0 = rand(0, 6.28); boltStrip(e, [at[0] + Math.cos(a0) * s * .5, at[1] + s * .5], [at[0] + Math.cos(a0 + 1) * s * .5, at[1] + s * .55], { width: 4, dur: 300, delay: i * 120, forks: 0, steps: 6 }); } }
    else orbit(c, at, s, { n: 10, r0: .8, r1: .6, turns: 1, flat: .35, dur: 800, tex: "glint", ramp: `${ty}.h`, sz: s * .12, rise: .6, steps: 10 });
    await aura(c.stage, c.from, c.type, 1, 800);
  };

  /* ---------- verbs: at another ---------- */
  // will-o'-wisp: pale flames circle the user and float across to the target
  D.wisp = async c => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, at = A(c), s = S(c);
    camUser(c, 1.12, .3);
    // 포켓몬 챔피언스: small red-orange balls of flame turn round the user and float across, a violet light in the user
    aura(c.stage, c.from, "ghost", 1, 700);
    orbit(c, at, s, { n: 4, r0: .7, r1: .7, turns: .6, flat: .5, dur: 500, tex: "billow", ramp: "fire.c", sz: s * .3, steps: 6, lit: true, occ: .3, emis: 1 });
    await after(c, 480);
    camFor(c, .36);
    for (const tt of c.targets) orbs(e, at, B(c, tt), "fire", { n: 4, dur: 600, over: 200, wave: .2, size: S(c, tt) * .28, tex: "billow", ramp: "fire.c" });
    e.at(620, () => c.targets.forEach(tt => live(c, tt) && DEBRIS.fire(e, B(c, tt), S(c, tt), .6)));
    await after(c, 620);
    landAll(c, { shards: false });
  };
  D.zap = async c => {
    // Thunder Wave: a crackling wave of current runs at it and closes round it in a cage of sparks
    const t = aim(c);
    if (!t) return false;
    const e = c.e;
    camFor(c, .32);
    await charge(c.stage, c.from, "electric", 240);
    for (const tt of c.targets) {
      const b = B(c, tt), sT = S(c, tt), a0 = mouth(c);
      for (let i = 0; i < 3; i++) e.emit({ at: a0, vel: [(b[0] - a0[0]) / .32, (b[1] - a0[1]) / .32], tex: "arc", ramp: "electric.h", size: [sT * .3, sT * 1.1], rot: dirTo(a0, b) + Math.PI / 2, life: 320, delay: i * 70, alpha: .9, grow: true });
      boltStrip(e, a0, b, { width: 6, dur: 320, flicker: 6, forks: 2 });
      e.at(260, () => { for (let i = 0; i < 8; i++) { const a1 = around(8, i), a2 = a1 + .9; boltStrip(e, [b[0] + Math.cos(a1) * sT * .55, b[1] + Math.sin(a1) * sT * .6], [b[0] + Math.cos(a2) * sT * .55, b[1] + Math.sin(a2) * sT * .6], { width: 5, dur: 420, flicker: 6, forks: 0, steps: 6, delay: i * 20 }); } DEBRIS.electric(e, b, sT, .9); });
    }
    await after(c, 460);
    landAll(c, { shards: false });
  };
  D.splash = async c => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, ty = T(c);
    camFor(c, .32);
    move(c, c.from, { sy: [1, .92, 1.04, 1] }, { dur: 360 });
    for (const tt of c.targets) {
      const b = endOf(c, tt), sT = S(c, tt), a0 = mouth(c);
      const liquid = { water: "water.l", poison: "toxic.c", grass: "leaf.c", fire: "fire.c" }[ty] || `${ty}.m`;
      // a gout: one big glossy blob leading, a string of smaller ones behind it
      for (let i = 0; i < 6; i++) fly(c, a0, [b[0] + rand(-.1, .1) * sT, b[1] + rand(-.1, .1) * sT], { tex: i ? "bubble" : "drop", lit: true, ramp: liquid, size: sT * (i ? rand(.12, .2) : .32), dur: 380, delay: i * 30, arc: .25, face: !i, rot: -Math.PI / 2, aspect: i ? 1 : .72, trail: false, glowK: 0, core: false, occ: .9, emis: .45 });
      e.at(380, () => { if (live(c, tt)) {
        e.emit({ n: 26, at: b, tex: "drop", lit: true, ramp: liquid, speed: [sT * 1.2, sT * 2.8], dir: -Math.PI / 2, arc: 2.6, acc: [0, sT * 5], face: true, rot: -Math.PI / 2, aspect: .72, size: [[sT * .07, sT * .12], sT * .04], life: [500, 800], occ: .9, emis: .4 });
        e.emit({ n: 10, at: b, r: sT * .3, tex: "billow", lit: true, ramp: liquid, speed: [sT * .5, sT * 1.4], drag: 3, size: [[sT * .14, sT * .22], [sT * .3, sT * .45]], life: [400, 600], erode: .5, rot: "rand", occ: .8, emis: .45, grow: true });
        if (ty === "poison") DEBRIS.poison(e, b, sT, 1); if (ty === "water") splash(e, b, sT, 1.2);
      } });
    }
    await after(c, 400);
    landAll(c, { shards: false });
  };
  D.powder = async c => {
    // Sleep Powder, Spore, Stun Spore: a glittering cloud of spores puffs out and settles over it
    const t = aim(c);
    if (!t) return false;
    const e = c.e, id = c.id;
    const ramp = id === "stunspore" ? "electric.h" : id === "poisonpowder" ? "poison.h" : id === "cottonspore" ? "white.h" : id === "magicpowder" ? "psychic.h" : id === "spore" ? "fire.h" : "grass.h";
    camFor(c, .36);
    move(c, c.from, { y: [0, -S(c) * .06, 0] }, { dur: 400 });
    for (const tt of c.targets) {
      const [x, y] = B(c, tt, .5), sT = S(c, tt);
      orbs(e, mouth(c), [x, y - sT * .5], "grass", { n: 10, dur: 500, over: 200, wave: .12, size: sT * .06, ramp, trail: false });
      if (id === "cottonspore") e.emit({ n: 22, at: () => [x + rand(-.6, .6) * sT, y - sT * rand(.4, 1.1)], vel: () => [rand(-12, 12), rand(30, 70)], bob: [4, 8], period: [1, 2], tex: "tuft", lit: true, ramp: "white.h", size: [[sT * .08, sT * .14], sT * .06], rot: "rand", spin: [-1, 1], life: [900, 1300], delay: 450, over: 500, occ: 1, emis: .1 });
      else e.emit({ n: 60, at: () => [x + rand(-.6, .6) * sT, y - sT * rand(.4, 1.1)], vel: () => [rand(-12, 12), rand(30, 70)], bob: [4, 8], period: [1, 2], tex: "glow", ramp, size: [[sT * .04, sT * .08], sT * .02], life: [900, 1300], delay: 450, over: 500 });
      e.emit({ n: 26, at: () => [x + rand(-.6, .6) * sT, y - sT * rand(.4, 1.1)], vel: () => [rand(-12, 12), rand(30, 70)], tex: "glint", ramp, size: [sT * .03, sT * .08], life: [700, 1000], delay: 450, over: 500, emis: 1, grow: true });
      e.emit({ n: 6, at: [x, y - sT * .2], r: sT * .4, tex: "cloud", ramp: id === "poisonpowder" ? "toxic" : "mist", size: [sT * .4, sT * .9], life: 1100, delay: 450, alpha: .35, occ: .3, emis: .5, grow: true });
    }
    await after(c, 1100);
    landAll(c, { shards: false });
  };
  D.yawn = async c => {
    const t = aim(c);
    if (!t) return false;
    camFor(c, .36);
    await move(c, c.from, { sy: [1, 1.08, 1], sx: [1, .96, 1], rot: [0, -.06, 0] }, { dur: 420, ease: "inout" });
    for (const tt of c.targets) { const sT = S(c, tt); fly(c, mouth(c), B(c, tt, .7), { tex: "bubble", lit: true, ramp: "bar.pink", size: sT * .5, dur: 1000, arc: .2, glowK: .8, trail: false, core: false, emis: .35, occ: .7 }); c.e.at(1000, () => { c.e.emit({ n: 10, at: B(c, tt, .7), tex: "bubble", lit: true, ramp: "bar.pink", speed: [sT, sT * 2], drag: 3, size: [sT * .07, sT * .02], life: 560, occ: .7, emis: .4 }); glints(c.e, B(c, tt, .7), sT, 4, "fairy.h", { r: .4 }); }); }
    await after(c, 1020);
    for (const tt of c.targets) if (live(c, tt)) sway(c.stage, tt);
    landAll(c, { shards: false });
  };
  D.hypnosis = async c => {
    // Hypnosis: waves of pink light ripple from its eyes, the air bending, and close on the target's head
    const t = aim(c);
    if (!t) return false;
    const e = c.e;
    camFor(c, .36);
    const a0 = A(c, .78);
    for (const tt of c.targets) {
      const b = B(c, tt, .75), sT = S(c, tt), ang = dirTo(a0, b);
      for (let i = 0; i < 7; i++) {
        e.emit({ at: a0, vel: [(b[0] - a0[0]) / .7, (b[1] - a0[1]) / .7], tex: "arc", ramp: "psychic.h", size: [sT * .2, sT * .9], rot: ang + Math.PI / 2, life: 700, delay: i * 100, alpha: .8, grow: true });
        e.emit({ at: a0, vel: [(b[0] - a0[0]) / .7, (b[1] - a0[1]) / .7], tex: "wave", ramp: "white", size: [sT * .1, sT * .8], life: 700, delay: i * 100, distort: true, grow: true });
      }
      e.at(760, () => { orbit(c, b, sT * .6, { n: 8, r0: .9, r1: .5, turns: 1.2, flat: .4, dur: 600, tex: "glint", ramp: "psychic.h", sz: sT * .1 }); });
    }
    await after(c, 1000);
    landAll(c, { shards: false });
  };
  D.notes = async c => {
    // Sing, Perish Song, Heal Bell: big lit notes drift out and swim to their listeners, a soft light pulsing with the song
    const e = c.e, a0 = mouth(c), s = S(c), id = c.id;
    camWide(c, .5);
    const list = c.targets.length && !/healbell|perishsong/.test(id) ? c.targets : [];
    const ramp = id === "perishsong" ? "ghost.h" : id === "healbell" ? "gold" : "fairy.h";
    if (id === "perishsong") darken(c.stage, .45, 1100);
    if (list.length) for (const tt of list) orbs(e, a0, B(c, tt, .7), "fairy", { n: 7, dur: 900, over: 500, wave: .2, size: s * .2, tex: "note", ramp });
    else e.emit({ n: 18, at: a0, r: s * .3, tex: "note", lit: true, ramp: id === "healbell" ? "gold.c" : ramp, speed: [60, 160], bob: [6, 12], period: [1, 2], size: [s * .16, s * .22], life: [1000, 1400], over: 600, occ: .8, emis: .4 });
    for (let i = 0; i < 3; i++) e.emit({ at: a0, tex: "glow", ramp, size: [s * .3, s * 1.6], life: 500, delay: i * 260, alpha: .25, grow: true });
    glints(e, a0, s, 8, ramp, { r: .8, over: 700 });
    await after(c, 1000);
    landAll(c, { shards: false });
  };
  D.charm = async c => {
    // Charm, Attract: big lit hearts float over and circle the target, bursting pink
    const t = aim(c);
    if (!t) return false;
    const e = c.e;
    camFor(c, .36);
    move(c, c.from, { rot: [0, -.08, .08, 0] }, { dur: 500 });
    for (const tt of c.targets) orbs(e, mouth(c), B(c, tt, .6), "fairy", { n: 7, dur: 700, over: 400, wave: .18, size: S(c, tt) * .26, tex: "heart", ramp: "fairy.m" });
    await after(c, 760);
    for (const tt of c.targets) { const b = B(c, tt, .55), sT = S(c, tt); orbit(c, b, sT, { n: 6, r0: .7, r1: .55, turns: .7, flat: .4, dur: 700, tex: "heart", ramp: "fairy.m", sz: sT * .22, lit: true, occ: .75, emis: .4, rise: .3 }); glints(e, b, sT, 6, "fairy.h", { r: .6 }); if (live(c, tt)) move(c, tt, { tintR: [1, 1], tintG: [.55, .55], tintB: [.85, .85], tintA: [0, .35, 0] }, { dur: 800 }); }
    await after(c, 400);
    landAll(c, { shards: false });
  };
  D.tears = async c => {
    const t = aim(c);
    if (!t) return false;
    const e = c.e, [x, y] = A(c, .72), s = S(c);
    camUser(c, 1.16, .3);
    move(c, c.from, { y: [0, s * .03, 0, s * .03, 0], rot: [0, .04, -.04, .04, 0] }, { dur: 800 });
    for (const sg of [-1, 1]) e.emit({ n: 10, at: [x + sg * s * .14, y], vel: () => [sg * rand(60, 130), -rand(80, 150)], acc: [0, 500], tex: "drop", lit: true, ramp: "water.l", face: true, rot: -Math.PI / 2, aspect: .72, size: [s * .16, s * .12], life: 800, over: 700, occ: .9, emis: .5 });
    for (const sg of [-1, 1]) pathStrip(e, u => [x + sg * s * (.14 + u * .05), y + u * s * .5], { color: "#3F9CEB", width: 7, dur: 900, mode: 4, head: .5, tailLag: .8, occ: .7, emis: .4 });
    glints(e, [x, y], s, 6, "water.h", { r: .3, over: 600 });
    await after(c, 800);
    for (const tt of c.targets) if (live(c, tt)) move(c, tt, { tintR: [1, .7], tintG: [1, .8], tintB: [1, 1], tintA: [0, .3, 0] }, { dur: 500 });
    landAll(c, { shards: false });
  };
  D.confuse = async c => {
    // Confuse Ray, Swagger: a weaving lit orb floats to it and circles its head trailing light; it reels
    const t = aim(c);
    if (!t) return false;
    const e = c.e, swag = c.id === "swagger" || c.id === "flatter";
    camFor(c, .36);
    for (const tt of c.targets) {
      const sT = S(c, tt), h = B(c, tt, .85);
      fly(c, mouth(c), h, { tex: "orb", lit: true, ramp: swag ? "fire.m" : "ghost.m", size: sT * .32, dur: 760, arc: .18, glowK: 1.3, core: false, trailN: 24, emis: .7, occ: .5 });
      e.at(700, () => { orbit(c, h, sT * .5, { n: 3, r0: .8, r1: .8, turns: 1.5, flat: .4, dur: 700, tex: "orb", ramp: swag ? "fire.m" : "ghost.m", sz: sT * .16, lit: true, emis: .6, occ: .6 }); if (!swag && live(c, tt)) move(c, tt, { tintR: [.75, .75], tintG: [.55, .55], tintB: [1, 1], tintA: [0, .35, 0] }, { dur: 700 }); });
      e.at(700, () => orbit(c, h, sT * .5, { n: 6, r0: .8, r1: .8, turns: 1.5, flat: .4, dur: 700, tex: "glint", ramp: "white.h", sz: sT * .08, delay: 60 }));
    }
    await after(c, 760);
    for (const tt of c.targets) if (live(c, tt)) sway(c.stage, tt);
    await after(c, 300);
    landAll(c, { shards: false });
  };
  D.anger = async c => {
    // Taunt, Torment: the target flushes red, a big anger mark throbs over it, sparks of rage
    const t = aim(c);
    if (!t) return false;
    const e = c.e;
    camFor(c, .36);
    move(c, c.from, { rot: [0, .1, -.1, 0] }, { dur: 400 });
    for (const tt of c.targets) { const [x, y] = B(c, tt, .85), sT = S(c, tt); for (let i = 0; i < 3; i++) e.emit({ at: [x + sT * .22, y], tex: "cross", lit: true, ramp: "recall.h", size: [sT * .14, sT * .42], life: 300, delay: 200 + i * 200, emis: .5, occ: .8, grow: true }); sparks(e, [x + sT * .22, y], 10, "fire", { delay: 220, speed: [sT, sT * 2], len: [5, 9] }); fire(e, B(c, tt, .1), sT, 10, { r: [.4, .06], up: 1.2, size: [.12, .24], over: 500, embers: false }); move(c, tt, { rimR: [1, 1], rimG: [.3, .3], rimB: [.2, .2], rimA: [0, 1, 0], x: [0, 3, -3, 3, 0] }, { dur: 700, ease: "linear" }); }
    await after(c, 800);
    landAll(c, { shards: false });
  };
  D.chain = async c => {
    // Block, Disable: a barrier of dark bars crosses in front of it, lit at the edges, and snaps shut
    const t = aim(c);
    if (!t) return false;
    const e = c.e;
    camOn(c, t, 1.14, .3);
    for (const tt of c.targets) { const [x, y] = B(c, tt), sT = S(c, tt); for (const sg of [-1, 1]) { pathStrip(e, u => [x + (u - .5) * sT * 1.6, y + sg * (u - .5) * sT * 1.2], { color: "#4A2A78", width: 30, dur: 900, mode: 4, occ: .9, emis: .35, head: .3, tailLag: .9 }); pathStrip(e, u => [x + (u - .5) * sT * 1.6, y + sg * (u - .5) * sT * 1.2], { color: "#C77DFF", width: 7, dur: 900, mode: 1, head: .3, tailLag: .9 }); } move(c, tt, { x: [0, 0, 4, -3, 0], sy: [1, 1, .95, 1, 1] }, { dur: 600, at: [0, .38, .5, .7, 1] }); e.at(240, () => { e.emit({ at: [x, y], tex: "spark", ramp: "ghost", size: [sT * .2, sT * 1.1], life: 220, grow: true }); glints(e, [x, y], sT, 6, "ghost.h", { r: .5 }); e.shake(.2); }); }
    await after(c, 600);
    landAll(c, { shards: false });
  };
  D.glare = async c => {
    // Glare, Scary Face, Mean Look: the stage dims, its eyes flare and a beam of their light stabs at the target, which flinches
    const e = c.e, [x, y] = A(c, .8), s = S(c), col = c.id === "glare" ? "electric" : c.id === "meanlook" ? "dark" : "psychic";
    camUser(c, 1.18, .3);
    darken(c.stage, .5, 900);
    for (const sg of [-1, 1]) { e.emit({ at: [x + sg * s * .08, y], tex: "glint", ramp: `${col}.h`, size: [s * .1, s * .5], life: 600, delay: 150, grow: true }); e.emit({ at: [x + sg * s * .08, y], tex: "glow", ramp: `${col}.h`, size: [s * .1, s * .3], life: 700, alpha: .7 }); }
    await after(c, 420);
    for (const tt of c.targets) {
      const b = B(c, tt, .5), sT = S(c, tt);
      if (col === "electric") for (let i = 0; i < 5; i++) { const a0 = around(5, i, .3), a1 = a0 + rand(1, 1.8); boltStrip(e, [b[0] + Math.cos(a0) * sT * .45, b[1] + Math.sin(a0) * sT * .5], [b[0] + Math.cos(a1) * sT * .45, b[1] + Math.sin(a1) * sT * .5], { width: 4, dur: 420, flicker: 5, depth: .3, forks: 0, steps: 6, delay: i * 50 }); }
      else smoke(e, b, sT, 5, { ramp: "shadow", rise: 20, alpha: .6 });
      move(c, tt, { x: [0, 4, -4, 3, -2, 0], sy: [1, .95, 1], rimR: [1, 1], rimG: [col === "electric" ? .85 : .4, col === "electric" ? .85 : .4], rimB: [col === "electric" ? .2 : .9, col === "electric" ? .2 : .9], rimA: [0, .8, 0] }, { dur: 520 });
    }
    await after(c, 300);
    landAll(c, { shards: false });
  };
  D.seed = async c => {
    // Leech Seed: seeds are lobbed onto it, burst open and their vines wrap it
    const t = aim(c);
    if (!t) return false;
    const e = c.e;
    camFor(c, .34);
    for (const tt of c.targets) for (let i = 0; i < 3; i++) fly(c, mouth(c), [B(c, tt, .3)[0] + (i - 1) * S(c, tt) * .2, B(c, tt, .3)[1]], { tex: "seed", lit: true, ramp: "leaf.c", size: S(c, tt) * .3, dur: 460, arc: .35, delay: i * 80, trail: false, glowK: 0, core: false, occ: 1, emis: .3 });
    await after(c, 620);
    for (const tt of c.targets) if (live(c, tt)) { const [x, y] = B(c, tt, .2), sT = S(c, tt); for (let i = 0; i < 4; i++) { pathStrip(e, u => [x + (i - 1.5) * sT * .2 + Math.sin(u * 8 + i) * sT * .18, y - u * sT * .8], { color: "#3B9434", width: 13, dur: 900, mode: 4, occ: .9, emis: .4, head: .6, tailLag: .9, delay: i * 40 }); pathStrip(e, u => [x + (i - 1.5) * sT * .2 + Math.sin(u * 8 + i) * sT * .18, y - u * sT * .8], { color: "#9BE86A", width: 5, dur: 900, mode: 1, head: .6, tailLag: .9, delay: i * 40 }); } e.emit({ n: 8, at: [x, y - sT * .4], r: sT * .4, tex: "leaf", lit: true, ramp: "leaf.c", size: [sT * .1, sT * .1], aspect: 1.9, rot: "rand", life: 800, delay: 300, occ: 1, emis: .2, grow: true }); }
    landAll(c, { shards: false });
  };
  D.cloud = async c => {
    const e = c.e, ty = T(c);
    camWide(c, .5);
    for (const tt of c.targets.length ? c.targets : []) { const b = B(c, tt), sT = S(c, tt); e.emit({ n: 10, at: b, r: sT * .6, tex: "cloud", ramp: ty === "poison" ? "toxic" : "mist", size: [sT * .4, sT * 1], life: [900, 1200], over: 400, alpha: .6, occ: .4, emis: .4, grow: true }); }
    await after(c, 900);
    landAll(c, { shards: false });
  };
  D.curse = async c => {
    // Curse, Memento, Spite: a cold violet fire licks up round it under a shadow
    const t = aim(c) || c.from, e = c.e, [x, y] = B(c, t), s = S(c, t);
    camOn(c, t, 1.12, .3);
    darken(c.stage, .45, 1000);
    e.emit({ n: 20, at: [x, y + s * .3], r: [s * .45, s * .1], tex: "flame", ramp: "ghost.m", vel: () => [rand(-10, 10), -rand(80, 160)], acc: [0, -s * .6], size: [[s * .18, s * .3], s * .05], life: [600, 900], over: 600, erode: .5, emis: 1 });
    smoke(e, [x, y], s * 1.2, 8, { ramp: "shadow", alpha: .75 });
    glints(e, [x, y], s, 6, "ghost.h", { r: .5, delay: 300 });
    move(c, t, { tintR: [.6, .6], tintG: [.4, .4], tintB: [.9, .9], tintA: [0, .4, 0], rimR: [.65, .65], rimG: [.35, .35], rimB: [1, 1], rimA: [0, .9, 0], sy: [1, .96, 1] }, { dur: 900 });
    e.at(380, () => { e.emit({ at: [x, y], tex: "splat", ramp: "ink", size: [s * .3, s * 1.1], rot: rand(0, 6), life: 360, occ: .9, emis: 0, alpha: .85, grow: true }); e.shake(.15); });
    await after(c, 800);
    landAll(c, { shards: false });
  };
  D.link = async c => {
    const t = aim(c), e = c.e, a0 = A(c), s = S(c), [fx, fy] = A(c, 0);
    camUser(c, 1.12, .4);
    darken(c.stage, .55, 1100);
    smoke(e, [fx, fy - s * .2], s * 1.4, 12, { ramp: "shadow", rise: 30, alpha: .85, spread: .5 });
    e.emit({ n: 30, at: [fx, fy], r: [s * .5, s * .1], tex: "flame", ramp: "ghost", vel: () => [rand(-10, 10), -rand(90, 170)], acc: [0, -s * .6], size: [[s * .2, s * .32], s * .05], life: [600, 900], over: 700, erode: .5, emis: 1 });
    orbit(c, a0, s, { n: 6, r0: .9, r1: .5, turns: 1, flat: .4, dur: 900, tex: "flame", ramp: "ghost", sz: s * .22, rise: .4, steps: 10 });
    e.emit({ at: a0, tex: "eye", ramp: "ghost.h", size: [s * .1, s * .3], aspect: 1.7, life: 800, delay: 300, emis: .9, grow: true });
    move(c, c.from, { rimR: [.6, .6], rimG: [.3, .3], rimB: [1, 1], rimA: [0, 1, 0] }, { dur: 1000 });
    if (t && t !== c.from) pathStrip(e, u => [lerp(a0[0], B(c, t)[0], u), lerp(a0[1], B(c, t)[1], u) - Math.sin(Math.PI * u) * s * .5], { color: "#8F5BD6", width: 6, dur: 900, mode: 1, head: .5, tailLag: .8 });
    await after(c, 950);
  };
  D.swap = async c => {
    // Power Swap, Ally Switch, Court Change: two lights trade places in a twist of air
    const t = aim(c) || c.from, e = c.e, a0 = A(c), b0 = t === c.from ? [e.W - a0[0], a0[1] - S(c) * .6] : B(c, t), s = S(c);
    camFor(c, .45);
    for (const p of [a0, b0]) { e.emit({ at: p, tex: "glow", ramp: `${T(c)}.h`, size: [s * .2, s * 1.2], life: 700, alpha: .45, grow: true }); glints(e, p, s, 6, `${T(c)}.h`, { r: .5 }); }
    orbs(e, a0, b0, c.type, { n: 8, dur: 600, over: 200, wave: .25, size: s * .1, tex: "orb" });
    orbs(e, b0, a0, c.type, { n: 8, dur: 600, over: 200, wave: -.25, size: s * .1, tex: "orb" });
    move(c, c.from, { rot: [0, .2, -.2, 0], flash: [0, .2, 0] }, { dur: 600 });
    await after(c, 660);
    landAll(c, { shards: false });
  };
  D.gust = async c => {
    // Tailwind, Whirlwind, Defog: a strong wind sweeps across, lines of air, leaves and dust carried in it
    const e = c.e, own = actorOf(c.stage, c.from)?.own, a0 = A(c), { W, H } = e, dir = own ? -.4 : Math.PI + .4;
    camWide(c, .5);
    e.emit({ n: 110, at: () => [a0[0] + rand(-.25, .25) * W, a0[1] + rand(-.4, .1) * H], dir, arc: .4, speed: [W * 1.4, W * 2.1], tex: "streak", ramp: "white", face: true, size: [4, 3], aspect: [22, 44], life: [500, 800], over: 700, alpha: .85 });
    // (round 4: Tailwind is air alone, white gusts and their bending, as Scarlet and Violet draw it; leaves only in a Whirlwind or Defog)
    if (c.id !== "tailwind") e.emit({ n: 30, at: () => [a0[0] + rand(-.25, .25) * W, a0[1] + rand(-.4, .1) * H], dir, arc: .6, speed: [W * .8, W * 1.3], tex: "leaf", lit: true, ramp: "leaf.c", size: [12 * U(c), 12 * U(c)], aspect: 1.8, spin: [-9, 9], rot: "rand", life: [700, 1000], over: 700, occ: 1, emis: .25 });
    // (round 4: thin pale blue ribbons; thick ones with a white core laid a white sheet across the court)
    if (c.id === "tailwind") for (let i = 0; i < 4; i++) { const y0 = a0[1] - H * (.3 - i * .08), x0 = own ? W * 1.05 : -W * .05, x1 = own ? -W * .05 : W * 1.05; const path = u => [lerp(x0, x1, u), y0 + Math.sin(u * 5 + i) * H * .04]; pathStrip(e, path, { color: "#6FA8E8", width: 5 * U(c), dur: 700, mode: 2, head: .5, tailLag: .5, delay: i * 90, occ: .3, emis: .5 }); }
    for (let i = 0; i < 4; i++) e.emit({ at: [a0[0] + (own ? 1 : -1) * W * .2 * i, a0[1] - H * .1], vel: [Math.cos(dir) * W, Math.sin(dir) * W], tex: "wave", ramp: "white", size: [W * .1, W * .4], life: 600, delay: i * 120, distort: true, grow: true });
    e.shake(.15);
    await after(c, 760);
    landAll(c, { shards: false });
  };
  D.clear = async c => {
    // Haze: a black-violet mist rolls over the whole court and lifts
    const e = c.e, { W, H } = e;
    camWide(c, .5);
    // (round 3, from Scarlet and Violet: a dense dark grey-brown smoke boils out of the user in clustered puffs and rolls over the
    // court, then thins to a grey haze; no violet discs and no glints)
    const [ux, uy] = A(c, .3);
    e.emit({ n: 30, at: [ux, uy], r: S(c) * .3, vel: () => { const tx = rand(.05, .95) * W, ty = rand(.35, .95) * H; return [(tx - ux) * 1.1, (ty - uy) * 1.1]; }, drag: 1.4, tex: "billow", lit: true, ramp: e.light ? "smoke.l" : "smoke", size: [W * .06, [W * .18, W * .3]], life: [1200, 1600], over: 450, occ: .85, emis: 0, erode: .4, rot: "rand", spin: [-.4, .4], alpha: .9, grow: true });
    e.emit({ n: 10, at: () => [rand(0, 1) * W, rand(.4, .95) * H], tex: "billow", lit: true, ramp: e.light ? "smoke.l" : "smoke", size: [W * .2, W * .36], life: [900, 1200], delay: 700, occ: .5, emis: 0, erode: .55, rot: "rand", alpha: .45, grow: true });
    await after(c, 1100);
  };
  D.hazard = async c => {
    // the user throws its trap onto the foe's side (Stealth Rock, Spikes, Toxic Spikes, Sticky Web)
    const e = c.e, own = actorOf(c.stage, c.from)?.own, id = c.id, a0 = A(c, .6);
    camWide(c, .5);
    const side = [...c.stage.querySelectorAll(`.bs-side.${own ? "foe" : "own"} .bs-slot`)].map(s => s.getBoundingClientRect()), box = c.stage.getBoundingClientRect();
    const cx = side.length ? (Math.min(...side.map(r => r.left)) + Math.max(...side.map(r => r.right))) / 2 - box.left : e.W * (own ? .65 : .35), cy = side.length ? Math.max(...side.map(r => r.bottom)) - box.top : e.H * (own ? .5 : .9);
    const U0 = U(c), w = side.length ? Math.max(...side.map(r => r.right)) - Math.min(...side.map(r => r.left)) : e.W * .4;
    if (id === "stealthrock") {
      // 포켓몬 챔피언스: a spray of small pointed cream stones scattered low and wide over the foe's side, hanging there
      for (let i = 0; i < 28; i++) { const to = [cx + rand(-.65, .65) * w, cy - rand(10, 70) * U0]; fly(c, a0, to, { tex: "chip", lit: true, ramp: "chip", size: rand(10, 18) * U0, dur: 480, arc: .3, delay: rand(0, 220), occ: 1, emis: .05, spin: rand(-8, 8), trail: false, glowK: 0, core: false }); }
      await after(c, 760);
      return;
    }
    if (id === "spikes" || id === "toxicspikes") {
      // small four-pointed caltrops land all round the foe's feet, each throwing a yellow glint as it strikes the floor
      const ramp = id === "toxicspikes" ? "toxic.c" : "steel.c";
      for (let i = 0; i < 9; i++) { const to = [cx + rand(-.6, .6) * w, cy - rand(0, 14) * U0], d = rand(0, 260); fly(c, a0, to, { tex: "caltrop", lit: true, ramp, size: rand(12, 17) * U0, aspect: 1.6, dur: 480, arc: .35, delay: d, occ: 1, emis: .15, spin: 6, trail: false, glowK: 0, core: false }); e.at(480 + d, () => { glints(e, to, 40 * U0, 2, id === "toxicspikes" ? "poison.h" : "electric.h", { r: .3, over: 60 }); sparks(e, to, 5, "electric", { ramp: "gold", speed: [80, 180], len: [4, 8] }); }); }
      await after(c, 820);
      return;
    }
    // Sticky Web: a web flies over and spreads out flat on the foe's floor
    fly(c, a0, [cx, cy - 10 * U0], { tex: "web", ramp: "white.h", size: 30 * U0, dur: 520, arc: .35, spin: 2, trail: false, glowK: 0, core: false, alpha: .9 });
    e.at(520, () => e.emit({ at: [cx, cy], tex: "web", ramp: "white.h", size: [w * .2, w * .8], aspect: 3, life: 600, alpha: .8, layer: 0, grow: true }));
    await after(c, 760);
  };
  D.weather = async c => {
    // the user calls the weather and the sky answers: rain clouds roll in, the sun blazes out, sand whirls up, snow swirls down
    const e = c.e, a0 = A(c, .8), id = c.id, { W, H } = e, s = S(c);
    camUser(c, 1.06, .35);
    const ramp = { raindance: "water.h", sunnyday: "gold", sandstorm: "sand", snowscape: "snow", chillyreception: "snow" }[id] || "white.h";
    e.emit({ at: a0, vel: [0, -H * 2.4], tex: "orb", lit: true, ramp, size: [s * .2, s * .2], life: 420, emis: 1, occ: .2 });
    e.emit({ at: a0, vel: [0, -H * 2.4], tex: "glow", ramp, size: [s * .6, s * .6], life: 420, alpha: .6 });
    await after(c, 400);
    camWide(c, .6);
    if (id === "raindance") {
      darken(c.stage, .35, 1000);
      e.emit({ n: 10, at: () => [rand(0, 1) * W, rand(-.05, .12) * H], tex: "cloud", lit: true, ramp: e.light ? "smoke.l" : "smoke", size: [W * .2, W * .4], aspect: 1.8, life: 1100, occ: .8, emis: 0, alpha: .9, grow: true });
      e.emit({ n: 90, at: () => [rand(0, 1) * W, -10], vel: [-H * .15, H * 2.6], tex: "streak", ramp: "rain", face: true, size: [2, 2], aspect: [16, 26], life: 500, over: 700, delay: 300, alpha: .8 });
    } else if (id === "sunnyday") {
      e.emit({ at: [W * .8, -H * .05], tex: "glow", ramp: "gold", size: [W * .2, W * .9], life: 1000, alpha: .7, grow: true });
      for (let i = 0; i < 6; i++) e.emit({ at: [W * .8, -H * .05], tex: "streak", ramp: "sunray", size: [H * 1.4, H * 1.4], aspect: 8, rot: Math.PI * (.55 + i * .07), life: 1000, delay: i * 40, alpha: .7 });
      glints(e, [W * .8, H * .02], s, 8, "gold", { r: 1, over: 400 });
      flashStage(c.stage, .22, 700, "#FFE08A");
    } else if (id === "sandstorm") {
      e.emit({ n: 120, at: () => [-.1 * W, rand(.1, 1) * H], vel: () => [W * rand(1.2, 2), rand(-30, 30)], tex: "grain", lit: true, ramp: "sand", size: [4, 4], life: 900, over: 600, occ: .8, emis: .2 });
      e.emit({ n: 14, at: () => [rand(0, 1) * W, rand(.2, 1) * H], vel: [W * .6, 0], tex: "billow", lit: true, ramp: "dust", size: [W * .1, W * .3], life: 1100, over: 400, erode: .5, rot: "rand", occ: .7, emis: 0, alpha: .7, grow: true });
    } else {
      e.emit({ n: 90, at: () => [rand(0, 1) * W, rand(-.1, .4) * H], vel: () => [rand(-40, 40), H * rand(.4, .7)], bob: [10, 20], period: [1, 2], tex: "flake", ramp: "snow", size: [6, 10], spin: [-2, 2], life: 1200, over: 600 });
      flashStage(c.stage, .14, 600, "#C0F0FF");
    }
    await after(c, 700);
  };
  D.terrain = async c => {
    // each terrain comes in as 포켓몬 챔피언스 brings it (references: 2026-11-06 notes): a burst at the user's feet, then the floor
    // takes it from the user outward
    const e = c.e, [x, y] = A(c, 0), ty = T(c), s = S(c), id = c.id, { W } = e;
    camWide(c, .5);
    if (id === "psychicterrain") {
      // a great glowing ellipse opens on the floor, violet in its middle and white-lavender at its rim, light bursting out of its centre
      e.emit({ at: [x, y], tex: "glow", ramp: "psy.wave", size: [W * .1, W * 1.1], aspect: 3.2, life: 1000, alpha: .9, layer: 0, grow: true });
      for (let i = 0; i < 3; i++) e.emit({ at: [x, y], tex: "wave", ramp: "white", size: [W * .1, W * (.8 + i * .3)], aspect: 1 / .3, life: 900, delay: i * 150, distort: true, layer: 0, grow: true });
      e.emit({ n: 26, at: [x, y - s * .2], tex: "streak", ramp: "white", dir: -Math.PI / 2, arc: 2.2, speed: [s * 3, s * 6], face: true, size: [3, 2], aspect: [12, 24], life: [300, 500] });
      glints(e, [x, y - s * .3], s, 10, "psychic.h", { r: .7 });
    } else if (id === "electricterrain") {
      // four-rayed sparkles burst round the user, and a yellow-green shimmer sweeps out over the floor
      glints(e, A(c, .4), s, 22, "electric.h", { r: 1, size: .34, over: 400 });
      for (let i = 0; i < 10; i++) { const a0 = around(10, i), r = W * rand(.25, .5); boltStrip(e, [x, y], [x + Math.cos(a0) * r, y + Math.sin(a0) * r * .3], { width: 5, dur: 420, flicker: 5, forks: 1, delay: 300 + i * 40, depth: .2 }); }
      e.emit({ n: 40, at: () => [x + rand(-.6, .6) * W, y + rand(-.15, .2) * W * .3], tex: "spark", ramp: "electric", size: [0, 14], life: [300, 500], delay: 300, over: 600, rot: "rand", grow: true });
    } else if (id === "grassyterrain") {
      e.emit({ n: 30, at: [x, y], r: [s * .6, s * .2], tex: "leaf", lit: true, ramp: "leaf.c", vel: () => [rand(-60, 60), -rand(60, 160)], acc: [0, 60], spin: [-6, 6], rot: "rand", size: [s * .07, s * .07], aspect: 1.9, life: [900, 1300], over: 500, occ: 1, emis: .2 });
      e.emit({ n: 50, at: () => [x + rand(-.6, .6) * W, y + rand(-.12, .2) * W * .3], tex: "tuft", lit: true, ramp: "grass.l", size: [0, 26 * U(c)], life: 900, delay: 200, over: 600, occ: .9, emis: .3, layer: 0, grow: true });
      glints(e, A(c, .5), s, 10, "white.h", { r: 1 });
    } else {
      // misty: pink mist rolls out over the floor from the user, sparkling
      e.emit({ n: 14, at: [x, y], r: [s * .4, s * .1], tex: "wisp", ramp: "mist", vel: () => [rand(-1, 1) * W * .5, rand(-10, 10)], drag: 1.2, size: [s * .5, s * 1.6], aspect: 2.4, rot: "rand", life: [1100, 1500], alpha: .8, layer: 0, grow: true });
      glints(e, A(c, .4), s, 14, "fairy.h", { r: 1 });
    }
    flashStage(c.stage, .12, 700, colorOf(ty));
    await after(c, 800);
  };
  D.room = async c => {
    // the room goes up round the court (its walls of square tiles light one after another, arena.js) as the space turns
    const e = c.e, { W, H } = e;
    camWide(c, .5);
    await charge(c.stage, c.from, c.type, 360);
    // the space folds out from the user: panes of the room's light spread from its feet over the floor and rise into walls (Trick Room
    // pink-violet, Gravity deep blue, Wonder Room and Magic Room their own tint), then the room itself stands (arena.js)
    const [x, y] = A(c, 0), ramp = { trickroom: "psychic.h", gravity: "dragon.h", wonderroom: "fairy.h", magicroom: "ghost.h" }[c.id] || `${T(c)}.h`;
    for (let i = 0; i < 18; i++) { const ang = around(18, i, .1), r = W * rand(.12, .6); e.emit({ at: [x, y], vel: [Math.cos(ang) * r * 2.2, Math.sin(ang) * r * .7], drag: 3, tex: "tile", ramp, size: [W * .02, W * .05], aspect: 3, life: 700, delay: i * 18, alpha: .35, layer: 0, grow: true }); }
    for (let i = 0; i < 10; i++) e.emit({ at: [W * (.08 + i * .093), H * .95], vel: [0, -H * .9], drag: 2.5, tex: "tile", ramp, size: [W * .03, W * .07], aspect: .5, life: 700, delay: 200 + Math.abs(i - 4.5) * 40, alpha: .4, grow: true });
    glints(e, [W / 2, H * .4], W * .5, 20, "glint", { r: .9, over: 600, size: .06 });
    shock(e, [W / 2, H * .55], W * 1.2, { dur: 800 });
    if (c.id === "trickroom") await k.flashStage(c.stage, .1, 300, "#B08AFF");
    await after(c, 500);
  };
  D.screen = async c => {
    /* a wall goes up in front of the side as in 포켓몬 챔피언스: Reflect a gate of upright golden bars, Light Screen the same in pale pink
       and lavender, Aurora Veil curtains of aurora with gold dust, Safeguard a soft veil */
    const e = c.e, [x, y] = A(c, .45), s = S(c), id = c.id, own = actorOf(c.stage, c.from)?.own, fx = x + (own ? s * .55 : -s * .55);
    camUser(c, 1.06, .35);
    if (id === "reflect" || id === "lightscreen") {
      const ramp = id === "reflect" ? "bar.gold" : "bar.pink", h = s * 1.5, n = 11;
      for (let i = 0; i < n; i++) { const u = i / (n - 1) - .5; e.emit({ at: [fx + u * s * 1.1, y + Math.abs(u) * s * .1], tex: "glow", ramp, size: [h, h], aspect: .06, life: 900, delay: Math.abs(u) * 200, alpha: i % 3 ? .7 : 1, grow: true }); }
      for (const dy of [-h / 2, h / 2]) e.emit({ at: [fx, y + dy], tex: "streak", ramp, size: [s * 1.2, s * 1.2], aspect: 1, life: 900, alpha: .9, grow: true });
      glints(e, [fx, y], s, 12, "glint", { r: .7, over: 500 });
    } else if (id === "auroraveil") {
      // curtains of aurora, green through blue to violet and pink, swaying as they hang, gold dust falling through them
      for (let i = 0; i < 16; i++) e.emit({ at: [fx + rand(-.75, .75) * s, y - s * .15], vel: [rand(-1, 1) * s * .25, -s * .15], tex: "glow", ramp: ["grass.e", "ice.h", "toxic.h", "fairy.h"][i % 4], size: [s * 1.7, s * 2], aspect: rand(.07, .16), life: [900, 1300], delay: i * 30, alpha: .6, grow: true });
      e.emit({ n: 40, at: [fx, y], r: s * .8, tex: "dot", ramp: "gold", size: [2, 3], vel: () => [rand(-10, 10), rand(-20, 10)], life: [700, 1100], over: 400 });
      glints(e, [fx, y], s, 10, "glint", { r: .8, over: 600 });
    } else {
      const ramp = id === "safeguard" ? "fairy.h" : `${T(c)}.h`;
      e.emit({ at: [fx, y], tex: "hexgrid", ramp, size: [s * .3, s * 2], aspect: 1.5, life: 800, alpha: .9, grow: true });
    }
    await after(c, 700);
  };
  D.hex = async c => {
    // Hex: violet ghost-fire wells up round the target and bites into it
    const t = aim(c);
    if (!t) return false;
    const e = c.e, [x, y] = B(c, t, .1), s = S(c, t);
    camFor(c, .34);
    darken(c.stage, .55, 900);
    await after(c, 200);
    orbit(c, [x, y], s, { n: 10, r0: .75, r1: .4, turns: .9, flat: .3, dur: 640, tex: "flame", ramp: "ghost", sz: s * .34, rise: 1, steps: 10 });
    e.emit({ n: 24, at: [x, y + s * .2], r: [s * .5, s * .1], tex: "flame", ramp: "ghost", vel: () => [rand(-10, 10), -rand(80, 150)], size: [[s * .16, s * .26], s * .04], life: [500, 800], over: 500, erode: .5, emis: 1 });
    await after(c, 460);
    landAll(c);
  };
  D.lock = async c => {
    const e = c.e, { W, H } = e;
    camWide(c, .5);
    flashStage(c.stage, .14, 600, "#FFC8EE");
    const pts = times(6, i => [W * (.15 + i * .14), H * (.55 + (i % 2) * .2)]);
    for (const sg of [-1, 1]) {
      const st = [sg < 0 ? -W * .05 : W * 1.05, H * .62], mid = [W * .5, H * .66], path = u => [lerp(st[0], mid[0], u), lerp(st[1], mid[1], u) - Math.sin(Math.PI * u) * H * .08];
      pathStrip(e, path, { color: "#C02FA8", width: 16 * U(c), dur: 1000, mode: 4, occ: .85, emis: .35, head: .45, tailLag: .95 });
      for (let j = 0; j < 9; j++) e.emit({ at: path(j / 9), tex: "ring", lit: true, ramp: "fairy.m", size: [14 * U(c), 14 * U(c)], aspect: 1.6, rot: j % 2 ? 0 : Math.PI / 2, life: 900, delay: 60 + j * 40, occ: .8, emis: .4 });
    }
    e.at(480, () => { glints(e, [W * .5, H * .66], 90 * U(c), 8, "fairy.h", { r: .5 }); e.shake(.1); });
    e.emit({ n: 40, at: () => [rand(.05, .95) * W, rand(.4, .95) * H], tex: "glint", ramp: "fairy.h", size: [4, 12], life: [500, 800], over: 600, emis: 1, grow: true });
    await after(c, 950);
  };
  D.frost = async (c, a) => {
    // the air round the target freezes into ice (Freeze-Dry, Sheer Cold)
    const t = aim(c);
    if (!t) return false;
    const e = c.e;
    camFor(c, .34);
    await charge(c.stage, c.from, "ice", 300);
    for (const tt of c.targets) {
      const b = B(c, tt), sT = S(c, tt) * (a.has("big") ? 1.3 : 1);
      e.emit({ n: 40, at: b, r: sT * .7, vel: () => [0, 0], tex: "flake", ramp: "snow", size: [0, sT * .14], spin: [-2, 2], life: 700, over: 300 });
      for (let i = 0; i < 12; i++) { const ang = around(12, i, .1); e.emit({ at: [b[0] + Math.cos(ang) * sT * .5, b[1] + Math.sin(ang) * sT * .55], tex: "shard", ramp: "ice.h", size: [sT * .05, sT * .35], aspect: .4, rot: ang + Math.PI / 2, life: 800, delay: 200 + i * 20, emis: .9, occ: .3, grow: true }); }
      e.at(520, () => { if (live(c, tt)) { DEBRIS.ice(e, b, sT, 1.2); shock(e, b, sT * 2); } });
    }
    flashStage(c.stage, .14, 600, "#C0F0FF");
    await after(c, 540);
    landAll(c, { power: a.has("big") ? 1.2 : 1 });
  };
  D.moon = async c => {
    // Moonblast: the moon rises behind the user, its light gathers into a pink sphere and is fired
    const t = aim(c);
    if (!t) return false;
    const e = c.e, [x, y] = A(c, .9), s = S(c);
    camUser(c, 1.1, .35);
    darken(c.stage, .4, 1500, 300);
    // the full moon of the games, pale blue-white with its craters lit from the side, the night blue round it
    flashStage(c.stage, .22, 1400, "#3A5AD8");
    e.emit({ at: [x, y - s * .9], tex: "glow", ramp: "water.h", size: [s * 1.2, s * 3], life: 1000, alpha: .45, grow: true });
    e.emit({ at: [x, y - s * .9], vel: [0, -s * .3], tex: "moon", lit: true, ramp: "moon", size: [s * .3, s * 1.2], life: 1000, alpha: 1, occ: 1, emis: .6, grow: true });
    glints(e, [x, y - s * .9], s, 14, "fairy.h", { r: .9, over: 600, size: .2 });
    await after(c, 600);
    const at = A(c, .6);
    e.emit({ at, tex: "glow", ramp: "fairy.h", size: [4, 60 * U(c)], life: 260, alpha: .6, grow: true });
    e.emit({ at, tex: "orb", lit: true, ramp: "fairy.h", size: [4, 28 * U(c)], life: 260, occ: .25, grow: true });
    await after(c, 260);
    camFor(c, .34);
    for (const tt of c.targets) fly(c, at, endOf(c, tt), { tex: "orb", lit: true, occ: .25, core: false, glowK: 2.2, ramp: "fairy.h", trailRamp: "fairy", size: 28 * U(c), dur: 380, trailN: 24 });
    await after(c, 380);
    for (const tt of c.targets) if (live(c, tt)) { glow(e, B(c, tt), S(c, tt) * 1.8, "fairy", { dur: 500 }); shock(e, B(c, tt), S(c, tt) * 2.6); }
    landAll(c, { power: 1.1 });
  };
  D.flash = async c => {
    // a dazzling light bursts out of the user over every foe (Dazzling Gleam, Burning Jealousy)
    const e = c.e, at = A(c), s = S(c), ty = T(c);
    camUser(c, 1.1, .3);
    await charge(c.stage, c.from, c.type, 300);
    camWide(c, .45);
    glow(e, at, s * 4, ty, { dur: 600, alpha: .4 });
    e.emit({ n: 40, at, tex: "spark", ramp: ty, speed: [s * 3, s * 7], drag: 2.5, size: [s * .3, 0], life: [400, 700] });
    for (let i = 0; i < 12; i++) { const ang = i / 12 * Math.PI * 2; e.emit({ at, tex: "streak", ramp: ty === "fairy" ? "fairy.h" : `${ty}.h`, size: [e.W * .1, e.W * .1], aspect: 8, rot: ang, life: 500, alpha: .6 }); }
    flashStage(c.stage, .4, 400, ty === "fire" ? "#FF9A50" : "#FFE0F6");
    await after(c, 260);
    landAll(c);
  };
  D.shards = async c => {
    // stones or gems rise round the user and are hurled (Ancient Power, Power Gem)
    const t = aim(c);
    if (!t) return false;
    const e = c.e, [x, y] = A(c), s = S(c), gem = c.id === "powergem";
    camUser(c, 1.12, .3);
    // Ancient Power: stones rise round the user, each lit pink from inside; Power Gem: cut gems that flash
    for (let i = 0; i < 6; i++) { const ang = around(6, i, .2), p = [x + Math.cos(ang) * s * .65, y + s * .3]; e.emit({ at: p, vel: [0, -s * .9], drag: 2, tex: "glow", ramp: "psychic.h", size: [s * .35, s * .35], life: 500, alpha: .55 }); e.emit({ at: p, vel: [0, -s * .9], drag: 2, tex: gem ? "crystal" : "rock", lit: true, ramp: gem ? "fairy.h" : "chip", size: [s * .15, s * .15], aspect: gem ? .7 : 1, life: 500, occ: 1, emis: gem ? .6 : .15, spin: 2 }); }
    await after(c, 480);
    camFor(c, .34);
    for (let i = 0; i < 6; i++) fly(c, [x + Math.cos(around(6, i, 0)) * s * .65, y - s * .2], endOf(c, t), { tex: gem ? "crystal" : "rock", lit: true, ramp: gem ? "fairy.h" : "chip", size: s * .15, dur: 300, delay: i * 50, occ: 1, emis: gem ? .6 : .15, spin: 8, trail: gem, trailRamp: "fairy.h", glowK: 2, core: false });
    await after(c, 500);
    landAll(c, { type: gem ? "fairy" : "rock" });
  };
  D.feathers = async c => {
    // Feather Dance: a flurry of white feathers thrown over the target, drifting down on it
    const t = aim(c);
    if (!t) return false;
    camFor(c, .36);
    for (const tt of c.targets) { const [x, y] = B(c, tt, .5), sT = S(c, tt); orbs(c.e, mouth(c), [x, y - sT * .7], "flying", { n: 6, dur: 400, over: 200, wave: .1, size: sT * .12, tex: "feather", ramp: "white.h", trail: false }); c.e.emit({ n: 14, at: () => [x + rand(-.6, .6) * sT, y - sT * rand(.5, 1)], vel: () => [rand(-20, 20), rand(30, 70)], tex: "feather", ramp: "white.h", size: [sT * .22, sT * .22], aspect: 2.2, rot: "rand", spin: [-2, 2], life: 1100, delay: 400, over: 400, occ: .9, emis: .25 }); }
    await after(c, 1100);
    landAll(c, { shards: false });
  };

  // no recipe: the type's own flight to one target
  D.flight = (c, t) => fly(c, mouth(c), endOf(c, t), { tex: "orb", size: 16 * U(c), dur: 380 });
  return D;
}

/* plays a move's script: each phase in its turn. A phase that hands back false gives the move to stageFx.move's own drawing
   (only the first phase can: a later one has already drawn). Only the last phase lands the blow, so no target is hit twice. */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const centreX = c => (c.at ? c.at(c.from, .5)[0] : 0);
export async function playScript(D, c, script) {
  const phases = String(script || "").split(" then ").filter(Boolean);
  if (!phases.length) return false;
  for (let i = 0; i < phases.length; i++) {
    const a = parse(phases[i]);
    const draw = D[a.verb];
    if (!draw) return i > 0 ? undefined : false;
    verbSound(a.verb, { pan: c.e?.W ? clamp(centreX(c) / c.e.W * 2 - 1, -1, 1) * .55 : 0 });
    const out = await draw(i < phases.length - 1 ? { ...c, land: () => null } : c, a);
    if (out === false) return i > 0 ? undefined : false;
  }
  return undefined;
}
