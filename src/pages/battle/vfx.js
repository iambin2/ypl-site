/* 배틀의 빛 (DESIGN.md "Battle"). 무대의 연출을 캔버스 한 장에 그린다: 겹칠수록 밝아지는 가산 합성, 미리 구운 빛 번짐,
   타입마다의 재질. stageFx.js의 부품은 여전히 "모양 하나에 키프레임"으로 말하고(도형, 위치, 회전, 크기, 투명도), 여기서
   그 모양을 캔버스의 스프라이트로 바꿔 그린다. 그래서 기술의 레시피(moveFx.js)는 그대로 두고 그림만 게임의 것이 된다.
   한 프레임에 한 번, 살아 있는 것이 있을 때만 그린다. 히트 스톱과 슬로 모션은 이 시계의 배율이다. */

export const TYPE_COLOR = {
  normal: "#E8ECF4", fire: "#FF5A1F", water: "#2F8CFF", electric: "#FFD21A", grass: "#4FC836", ice: "#5FE3FF", fighting: "#FF8A1A",
  poison: "#B455F0", ground: "#D08A3A", flying: "#9CCBFF", psychic: "#FF4F93", bug: "#B5C824", rock: "#C9B98A", ghost: "#8F5BD6",
  dragon: "#6A72FF", dark: "#7A5BA8", steel: "#9ED3E8", fairy: "#FF86F0",
};
// the deeper tone each light falls off into (the outer halo of a glow)
const DEEP = {
  normal: "#8FA3C8", fire: "#C4160A", water: "#0F4FC2", electric: "#E07A00", grass: "#1E7A18", ice: "#1E8FD6", fighting: "#C24A00",
  poison: "#5E1E9C", ground: "#7A4310", flying: "#4A7FD0", psychic: "#B0105A", bug: "#5E7A0A", rock: "#7A6A3A", ghost: "#3E1E7A",
  dragon: "#2A2FB0", dark: "#2A1A4A", steel: "#3E7F9C", fairy: "#C02FB0",
};
const WHITE = "#FFFFFF";
const SMOKE = { normal: "#C9D6EE", fire: "#4A3530", ground: "#B8925E", rock: "#A49A82", ghost: "#6A43A8", dark: "#2E2440", poison: "#7A3EA8", water: "#BFE3FF",
  ice: "#DDF6FF", grass: "#7FCB6A", electric: "#FFF1A8", psychic: "#FF9CC4", fairy: "#FFC4F6", dragon: "#7C84FF", steel: "#C8DDE8", bug: "#C9D46A", flying: "#E2EEFF", fighting: "#FFB27A" };
// a flame lives through its colours: a white-yellow heart, orange, red, and it goes out as smoke
const FLAME_LIFE = ["#FFF6C8", "#FFC21A", "#FF6A1A", "#E0280E", "#5A2A20"];

/* ---------- sprites: drawn once into small canvases, with their glow baked in, tinted per colour and cached ---------- */
const S = 96; // a sprite's own size; drawn scaled
const PATHS = {
  flame: "M10 0C13 7 20 11 20 19A10 9 0 0 1 0 19C0 13 5 10 6 4C8 8 9 10 10 11C11 8 11 4 10 0Z|20|28",
  drop: "M8 0C10 6 16 10 16 15A8 7 0 0 1 0 15C0 10 6 6 8 0Z|16|22",
  leaf: "M0 6C6 -1 18 -1 24 6C18 13 6 13 0 6Z|24|12",
  crystal: "M5 0L10 8L5 24L0 8Z|10|24",
  spark: "M10 0C11 7 13 9 20 10C13 11 11 13 10 20C9 13 7 11 0 10C7 9 9 7 10 0Z|20|20",
  crescent: "M0 18C8 2 32 2 40 18C30 8 10 8 0 18Z|40|20",
  claw: "M0 4C20 1 40 0 60 4C40 6.5 20 7 0 4Z|60|8",
  fang: "M0 0H40V3L36 14L32 3L28 11L24 3L20 13L16 3L12 11L8 3L4 14L0 3Z|40|14",
  z: "M1 1H15V4L6 12H15V15H1V12L10 4H1Z|16|16",
  star: "M20 0L22.1 12.3L26.2 9.3L25.6 14.4L35.6 11L27.7 17.9L32 20L27.7 22.1L37.3 30L25.6 25.6L26.6 31.4L22.1 27.7L20 36.8L17.9 27.7L14 30.4L14.4 25.6L2.7 30L12.3 22.1L7.6 20L12.3 17.9L4.1 10.8L14.4 14.4L14.2 10L17.9 12.3Z|40|40",
  fist: "M3 9C3 5 6 3 9 3H25C28 3 30 5 30 8V19C30 24 26 27 21 27H10C6 27 3 24 3 20ZM3 15H15C17 15 18 17 17 19L14.5 22H3Z|32|28",
  foot: "M4 2H15L17 15H28C31 15 32 18 31 21L30 26H5C2 26 1 24 2 21Z|32|28",
  wedge: "M0 0L40 6L0 12L6 6Z|40|12",
  feather: "M0 6C6 0 18 0 28 6C18 12 6 12 0 6Z|28|12",
  heart: "M12 21C5 15 1 11 1 7A5.5 5.5 0 0 1 12 4A5.5 5.5 0 0 1 23 7C23 11 19 15 12 21Z|24|22",
  note: "M8 2H18V6H11V17A4 4 0 1 1 8 13.5Z|20|22",
  blade: "M9 5L31 2.5L40 5L31 7.5ZM6 0H9V10H6ZM0 4H6V6H0Z|40|10",
  eye: "M0 8C6 0 22 0 28 8C22 16 6 16 0 8Z|28|16",
  shell: "M0 12C2 4 8 0 14 0C20 0 26 4 28 12L22 9L18 12L14 8L10 12L6 9Z|28|12",
  vein: "M1 9C5 9 9 5 9 1H11.5C11.5 7 7 11.5 1 11.5ZM23 9C19 9 15 5 15 1H12.5C12.5 7 17 11.5 23 11.5ZM1 15C5 15 9 19 9 23H11.5C11.5 17 7 12.5 1 12.5ZM23 15C19 15 15 19 15 23H12.5C12.5 17 17 12.5 23 12.5Z|24|24",
  hand: "M4 22V9C4 7 7 7 7 9V3.5C7 1.5 10 1.5 10 3.5V2.5C10 0.5 13 0.5 13 2.5V3.5C13 1.5 16 1.5 16 3.5V11L18 8C19.5 6 22 7.5 21 9.5L16.5 20C15.5 22.5 13.5 24 11 24H6C5 24 4 23 4 22Z|22|24",
  link: "M6 0H20A6 6 0 0 1 20 12H6A6 6 0 0 1 6 0ZM7 3.5H19A2.5 2.5 0 0 1 19 8.5H7A2.5 2.5 0 0 1 7 3.5Z|26|12",
};
const cache = new Map();
function canvasOf(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
// a soft light: white heart, the colour round it, the deep tone at its edge, nothing at the rim
function glowSprite(color, deep, hard = .18) {
  const c = canvasOf(S, S), g = c.getContext("2d"), r = S / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, WHITE); grd.addColorStop(hard, color); grd.addColorStop(.5, deep + "88"); grd.addColorStop(1, deep + "00");
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return c;
}
function smokeSprite(color) {
  const c = canvasOf(S, S), g = c.getContext("2d"), r = S / 2;
  for (let i = 0; i < 5; i++) {
    const x = r + (Math.random() - .5) * r * .6, y = r + (Math.random() - .5) * r * .6, rr = r * (.45 + Math.random() * .35);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, color + "70"); grd.addColorStop(1, color + "00");
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  return c;
}
// a drawn shape filled with its colour, a white sheen across it, and its glow baked round it
function shapeSprite(name, color, deep, white = false) {
  const [d, vw, vh] = PATHS[name].split("|");
  const w = +vw, h = +vh, k = (S * .62) / Math.max(w, h), pad = S * .19;
  const c = canvasOf(Math.ceil(w * k + pad * 2), Math.ceil(h * k + pad * 2)), g = c.getContext("2d");
  g.translate(pad, pad); g.scale(k, k);
  const path = new Path2D(d);
  g.shadowColor = deep; g.shadowBlur = pad * .9;
  g.fillStyle = white ? WHITE : color; g.fill(path, "evenodd");
  g.shadowBlur = 0;
  const sheen = g.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, "#FFFFFFAA"); sheen.addColorStop(.45, "#FFFFFF00");
  g.fillStyle = sheen; g.fill(path, "evenodd");
  c.inner = [w * k, h * k]; // the drawn shape's own box inside the sprite (the rest is its glow)
  return c;
}
function ringSprite(color, deep, thick = .08) {
  const c = canvasOf(S, S), g = c.getContext("2d"), r = S / 2;
  g.shadowColor = color; g.shadowBlur = S * .08;
  g.strokeStyle = color; g.lineWidth = S * thick; g.beginPath(); g.arc(r, r, r * .82, 0, Math.PI * 2); g.stroke();
  g.shadowBlur = 0; g.strokeStyle = WHITE + "CC"; g.lineWidth = S * thick * .35; g.stroke();
  return c;
}
function sprite(kind, type) {
  const key = `${kind}|${type}`;
  if (cache.has(key)) return cache.get(key);
  const color = TYPE_COLOR[type] || type, deep = DEEP[type] || color;
  let s;
  if (kind === "glow") s = glowSprite(color, deep);
  else if (kind === "core") s = glowSprite(color, deep, .45);
  else if (kind === "smoke") s = smokeSprite(SMOKE[type] || color);
  else if (kind.startsWith("flame:")) { const c2 = kind.slice(6); s = shapeSprite("flame", c2, c2); }
  else if (kind === "ring") s = ringSprite(color, deep);
  else if (kind === "ringthick") s = ringSprite(color, deep, .16);
  else if (PATHS[kind]) s = shapeSprite(kind, color, deep, kind === "fang" || kind === "z" || kind === "hand" || kind === "note");
  else s = glowSprite(color, deep);
  cache.set(key, s);
  return s;
}

/* ---------- what each of stageFx's shape classes is made of on the canvas ---------- */
// kind: the sprite; blend: add (light) or over (matter); halo: a glow drawn behind it, as a share of its size; size: the default box
function material(cls) {
  const type = (cls.match(/type-(\w+)/) || [])[1] || "normal";
  const has = n => new RegExp(`\\b${n}\\b`).test(cls);
  if (has("bs-flame")) return { kind: "flame", type: "fire", blend: "add", halo: 1.8, w: 13, h: 18 };
  if (has("bs-drop")) return { kind: "drop", type, blend: "add", halo: 1.2, w: 8, h: 11 };
  if (has("bs-leaf")) return { kind: "leaf", type, blend: "over", halo: .9, w: 18, h: 9 };
  if (has("bs-crystal")) return { kind: "crystal", type, blend: "add", halo: 1.4, w: 7, h: 18 };
  if (has("bs-spark")) return { kind: "spark", type, blend: "add", halo: 2, w: 14, h: 14 };
  if (has("bs-star")) return { kind: "star", type, blend: "add", halo: 2.2, w: 40, h: 40 };
  if (has("bs-crescent")) return { kind: "crescent", type, blend: "add", halo: 1.2, w: 34, h: 17 };
  if (has("bs-claw")) return { kind: "claw", type, blend: "add", halo: 1, w: 60, h: 8 };
  if (has("bs-fang")) return { kind: "fang", type: "normal", blend: "add", halo: 1, w: 40, h: 14 };
  if (has("bs-z")) return { kind: "z", type: "normal", blend: "over", halo: 0, w: 16, h: 16 };
  if (has("bs-orb")) return { kind: "core", type, blend: "add", halo: 2.4, w: 16, h: 16 };
  if (has("bs-puff")) return { kind: "smoke", type: cls.includes("smoke") ? "normal" : type, blend: "over", halo: 0, w: 24, h: 24, soft: true };
  if (has("bs-streak")) return { kind: "streak", type: cls.includes("typed") ? type : "normal", blend: "add", w: 30, h: 2, origin: "left" };
  if (has("bs-ring") || has("bs-aura")) return { kind: cls.includes("thick") ? "ringthick" : "ring", type, blend: "add", halo: 0, w: 26, h: 26 };
  if (has("bs-tint")) return { kind: "tint", type, blend: "add", full: true };
  if (has("bt-fx-flash")) return { kind: "tint", type: "normal", blend: "add", full: true };
  if (has("bs-flare")) return { kind: "glow", type: "normal", blend: "add", halo: 0, w: 60, h: 60 };
  if (has("bs-shield")) return { kind: "dome", type: cls.match(/type-(\w+)/) ? type : "grass", blend: "add", w: 60, h: 60 };
  if (has("bs-mega")) return { kind: "mega", type: "normal", blend: "add", w: 60, h: 60 };
  if (has("bs-plus")) return { kind: "spark", type: "grass", blend: "add", halo: 1.6, w: 12, h: 12 };
  if (has("bs-arrow")) return { kind: "wedge", type: cls.includes("down") ? "water" : "fighting", blend: "add", halo: 1.4, w: 14, h: 12, turn: cls.includes("down") ? 90 : -90 };
  if (has("bs-beam")) return { kind: "beam", type, blend: "add", w: 100, h: 6, origin: "left" };
  if (has("bs-cone")) return { kind: "cone", type, blend: "add", w: 40, h: 120, origin: "top" };
  if (has("bs-item")) return { kind: "core", type: "normal", blend: "add", halo: 1, w: 14, h: 14 };
  if (has("bs-net")) return { kind: "net", type, blend: "add", w: 40, h: 40 };
  if (has("bs-sigil")) return { kind: "sigil", type, blend: "add", w: 40, h: 40 };
  for (const k of ["fist", "foot", "wedge", "feather", "heart", "note", "blade", "eye", "shell", "link", "vein", "hand"]) if (has(`bs-${k}`)) {
    const fixed = { heart: "fairy", vein: "fire" }[k];
    return { kind: k, type: fixed || (cls.includes("core") ? "normal" : type), blend: "add", halo: 1.2, w: 24, h: 24 };
  }
  // bs-p: a mote of the type; a head is bigger and brighter
  return { kind: "glow", type, blend: "add", halo: 0, w: cls.includes("head") ? 22 : 15, h: cls.includes("head") ? 22 : 15 };
}

/* ---------- keyframes in the language stageFx speaks: CSS transforms, read as numbers and played on the canvas ---------- */
const EASE = new Map();
function bezier(x1, y1, x2, y2) {
  const f = (a, b, t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
  return x => { let lo = 0, hi = 1; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (f(x1, x2, m) < x) lo = m; else hi = m; } return f(y1, y2, (lo + hi) / 2); };
}
function easing(name) {
  if (!name || name === "linear") return t => t;
  if (EASE.has(name)) return EASE.get(name);
  const m = name.match(/cubic-bezier\(([^)]+)\)/);
  const fn = m ? bezier(...m[1].split(",").map(Number)) : name === "ease-out" ? bezier(0, 0, .58, 1) : name === "ease-in" ? bezier(.42, 0, 1, 1) : bezier(.25, .1, .25, 1);
  EASE.set(name, fn);
  return fn;
}
const NUM = /-?\d*\.?\d+(?:e-?\d+)?/g;
// a transform without its percentage centring (the canvas draws every shape about its own centre)
const clean = t => String(t || "none").replace(/translate[XY]?\([^)]*%[^)]*\)/g, "").trim() || "none";
function frameList(frames, base) {
  const n = frames.length;
  return frames.map((f, i) => {
    const tr = clean(f.transform);
    return { at: f.offset ?? (n === 1 ? 1 : i / (n - 1)), op: f.opacity ?? 1, tr, tpl: tr.replace(NUM, "#"), nums: (tr.match(NUM) || []).map(Number), ease: easing(f.easing || base) };
  });
}
function sample(list, p) {
  let i = 0;
  while (i < list.length - 2 && p > list[i + 1].at) i++;
  const a = list[i], b = list[Math.min(i + 1, list.length - 1)];
  const span = b.at - a.at || 1, t = Math.max(0, Math.min(1, a.ease((p - a.at) / span)));
  const op = a.op + (b.op - a.op) * t;
  if (a.tpl !== b.tpl) return { op, tr: t < .5 ? a.tr : b.tr };
  let k = 0;
  return { op, tr: a.tpl.replace(/#/g, () => { const v = a.nums[k] + (b.nums[k] - a.nums[k]) * t; k++; return String(v); }) };
}
const matrixCache = new Map();
function matrixOf(tr) {
  if (tr === "none") return null;
  let m = matrixCache.get(tr);
  if (!m) { try { m = new DOMMatrix(tr); } catch { m = new DOMMatrix(); } if (matrixCache.size > 4000) matrixCache.clear(); matrixCache.set(tr, m); }
  return m;
}

/* ---------- the engine: one canvas over the stage ---------- */
class Vfx {
  constructor(layer) {
    this.layer = layer;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "bs-vfx";
    layer.prepend(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.items = [];
    this.scale = 1; // the clock's rate: 0 holds (hit-stop), .5 slow motion
    this.now = 0;
    this.frame = null;
    this.size();
    this.ro = new ResizeObserver(() => this.size());
    this.ro.observe(layer);
  }
  size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = this.layer.clientWidth, h = this.layer.clientHeight;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
  }
  add(item) {
    item.born = this.now;
    this.items.push(item);
    if (!this.frame) { this.last = performance.now(); this.frame = requestAnimationFrame(t => this.tick(t)); }
    return item;
  }
  hold(ms) { this.scale = 0; clearTimeout(this.held); this.held = setTimeout(() => { this.scale = this.slowRate || 1; }, ms); }
  slow(ms, rate = .5) { this.slowRate = rate; this.scale = rate; clearTimeout(this.slowed); this.slowed = setTimeout(() => { this.slowRate = 0; this.scale = 1; }, ms); }
  tick(t) {
    const dt = Math.min(50, t - this.last);
    this.last = t;
    this.now += dt * this.scale;
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const keep = [];
    for (const it of this.items) {
      const age = this.now - it.born - (it.delay || 0);
      if (age < 0) { keep.push(it); continue; }
      const p = Math.min(1, age / it.duration);
      if (it.draw(ctx, p, dpr, this) !== false && p < 1) keep.push(it);
      else it.end?.();
    }
    this.items = keep;
    this.frame = keep.length ? requestAnimationFrame(n => this.tick(n)) : null;
    if (!this.frame) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
export function vfxOf(stage) {
  const layer = stage?.querySelector(".bs-fx");
  if (!layer) return null;
  if (!layer.__vfx || !layer.contains(layer.__vfx.canvas)) layer.__vfx = new Vfx(layer);
  return layer.__vfx;
}

/* a shape played by keyframes, standing in for a DOM element: el.animate(frames, timing) returns what done() waits on */
export function shape(stage, cls, at = [0, 0], w = 0, h = 0) {
  const v = vfxOf(stage);
  const mat = material(cls);
  const box = { w: w || mat.w || 16, h: h || mat.h || 16 };
  const el = {
    style: {}, classList: { add() {}, remove() {} }, remove() {}, getAnimations: () => [], querySelector: () => null,
    animate(frames, timing = {}) {
      const list = frameList(frames, timing.easing);
      let resolve;
      const finished = new Promise(r => { resolve = r; });
      if (!v) { resolve(); return { finished, effect: { getComputedTiming: () => ({ endTime: 0 }) }, cancel() {} }; }
      const width = parseFloat(el.style.width) || box.w, height = parseFloat(el.style.height) || box.h;
      const left = parseFloat(el.style.left ?? at[0]) || 0, top = parseFloat(el.style.top ?? at[1]) || 0;
      const trail = { x: null, y: null };
      v.add({ duration: Math.max(1, timing.duration || 300), delay: timing.delay || 0, end: resolve,
        draw: (ctx, p, dpr) => drawShape(ctx, dpr, mat, sample(list, p), left, top, width, height, v, p, trail) });
      return { finished, effect: { getComputedTiming: () => ({ endTime: (timing.duration || 300) + (timing.delay || 0) }) }, cancel: resolve };
    },
  };
  return el;
}

const TRAILS = new Set(["glow", "core", "spark", "flame", "drop", "crystal", "star", "crescent"]);
function drawShape(ctx, dpr, mat, { op, tr }, left, top, w, h, v, life = 0, trail = null) {
  if (op <= .004) return;
  // a fast light leaves a streak of itself behind it, from where it was a frame ago to where it is
  if (trail && TRAILS.has(mat.kind) && !mat.full) {
    const m0 = matrixOf(tr), x = left + (m0 ? m0.e : 0), y = top + (m0 ? m0.f : 0);
    if (trail.x != null) {
      const dx = x - trail.x, dy = y - trail.y, d = Math.hypot(dx, dy);
      if (d > 3 && d < 160) {
        const color = mat.kind === "flame" ? "#FF8A1A" : TYPE_COLOR[mat.type] || WHITE;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = "lighter";
        const g = ctx.createLinearGradient(trail.x - dx * 1.6, trail.y - dy * 1.6, x, y);
        g.addColorStop(0, color + "00"); g.addColorStop(1, color);
        ctx.globalAlpha = Math.min(1, op) * .55; ctx.strokeStyle = g; ctx.lineCap = "round";
        ctx.lineWidth = Math.max(1.5, Math.min(w, h) * .55);
        ctx.beginPath(); ctx.moveTo(trail.x - dx * 1.6, trail.y - dy * 1.6); ctx.lineTo(x, y); ctx.stroke();
      }
    }
    trail.x = x; trail.y = y;
  }
  const type = mat.type;
  ctx.globalCompositeOperation = mat.blend === "add" ? "lighter" : "source-over";
  ctx.globalAlpha = Math.min(1, op);
  if (mat.full) { // a wash over the whole stage
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = TYPE_COLOR[type] || WHITE;
    ctx.globalAlpha = Math.min(.6, op * 1.6);
    ctx.fillRect(0, 0, v.canvas.width, v.canvas.height);
    return;
  }
  const m = matrixOf(tr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(left, top);
  if (m) ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  if (mat.turn) ctx.rotate(mat.turn * Math.PI / 180);
  const color = TYPE_COLOR[type] || WHITE;
  switch (mat.kind) {
    case "streak": { // a line of light from its origin, white at its heart
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, color + "00"); g.addColorStop(.6, color); g.addColorStop(1, WHITE);
      ctx.fillStyle = g; ctx.fillRect(0, -Math.max(1.5, h), w, Math.max(3, h * 2));
      return;
    }
    case "beam": { // a beam: a wide breath of the colour round a burning white core
      const g = ctx.createLinearGradient(0, -h * 2.6, 0, h * 2.6);
      g.addColorStop(0, color + "00"); g.addColorStop(.3, color + "AA"); g.addColorStop(.5, WHITE); g.addColorStop(.7, color + "AA"); g.addColorStop(1, color + "00");
      ctx.fillStyle = g; ctx.fillRect(0, -h * 2.6, w, h * 5.2);
      return;
    }
    case "cone": { // a column of light from above, fading as it falls
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, color + "00"); g.addColorStop(.25, color + "66"); g.addColorStop(1, color + "18");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w * .18, 0); ctx.lineTo(w * .18, 0); ctx.lineTo(w * .5, h); ctx.lineTo(-w * .5, h); ctx.closePath(); ctx.fill();
      return;
    }
    case "dome": { // a guard: a bubble of light, bright at its rim
      const r = w / 2, g = ctx.createRadialGradient(0, 0, r * .55, 0, 0, r);
      g.addColorStop(0, color + "10"); g.addColorStop(.85, color + "55"); g.addColorStop(1, WHITE + "DD");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      return;
    }
    case "mega": { // the rainbow ring of Mega Evolution
      const r = w / 2;
      const g = ctx.createConicGradient ? ctx.createConicGradient(0, 0, 0) : null;
      if (g) ["#FF3B3B", "#FFC21A", "#4FD836", "#3FD8FF", "#5060FF", "#FF70F0", "#FF3B3B"].forEach((c, i) => g.addColorStop(i / 6, c));
      ctx.strokeStyle = g || WHITE; ctx.lineWidth = r * .16; ctx.beginPath(); ctx.arc(0, 0, r * .8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = WHITE; ctx.lineWidth = r * .04; ctx.stroke();
      return;
    }
    case "net": case "sigil": { // drawn lines of light
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, w * .05); ctx.shadowColor = color; ctx.shadowBlur = 8;
      ctx.beginPath();
      if (mat.kind === "net") { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.moveTo(Math.cos(a) * w / 2, Math.sin(a) * w / 2); ctx.lineTo(-Math.cos(a) * w / 2, -Math.sin(a) * w / 2); } [.18, .32, .48].forEach(r => { ctx.moveTo(w * r, 0); ctx.arc(0, 0, w * r, 0, Math.PI * 2); }); }
      else { ctx.arc(0, 0, w * .46, 0, Math.PI * 2); ctx.moveTo(w * .33, 0); ctx.arc(0, 0, w * .33, 0, Math.PI * 2); for (const s of [1, -1]) { const p = [0, 1, 2].map(i => -Math.PI / 2 * s + i * Math.PI * 2 / 3); ctx.moveTo(Math.cos(p[0]) * w * .4, Math.sin(p[0]) * w * .4 * s); p.slice(1).concat(p[0]).forEach(a => ctx.lineTo(Math.cos(a) * w * .4, Math.sin(a) * w * .4 * s)); } }
      ctx.stroke(); ctx.shadowBlur = 0;
      return;
    }
  }
  // a sprite, with a halo of its colour behind it when it is a light
  if (mat.halo) {
    // the halo follows the shape's area, so a long one (a stone pillar, a claw) keeps its outline inside its light
    const hs = Math.sqrt(w * h) * mat.halo * .8, glow = sprite("glow", type);
    const a = ctx.globalAlpha; ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a * .4;
    ctx.drawImage(glow, -hs, -hs, hs * 2, hs * 2);
    ctx.globalAlpha = a; ctx.globalCompositeOperation = mat.blend === "add" ? "lighter" : "source-over";
  }
  const img = mat.kind === "flame" ? sprite(`flame:${FLAME_LIFE[Math.min(FLAME_LIFE.length - 1, Math.floor(life * FLAME_LIFE.length))]}`, "fire") : sprite(mat.kind, type);
  // a drawn shape fills the box it was given; its baked glow spills round it
  if (img.inner) { const fx = w / img.inner[0], fy = h / img.inner[1]; ctx.drawImage(img, -img.width * fx / 2, -img.height * fy / 2, img.width * fx, img.height * fy); }
  else ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

/* ---------- effects drawn whole, not as one shape ---------- */
// a bolt of lightning between two points, struck again with a new path each flicker: a wide breath, the colour, a white core
export function lightning(stage, a, b, type = "electric", { flicker = 3, depth = .09, duration = 340, delay = 0, fork = true, thin = false } = {}) {
  const v = vfxOf(stage);
  if (!v) return Promise.resolve();
  const color = TYPE_COLOR[type] || TYPE_COLOR.electric;
  const jag = (p, q, d, steps) => { const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len; return Array.from({ length: steps + 1 }, (_, i) => { const t = i / steps, o = i === 0 || i === steps ? 0 : (Math.random() * 2 - 1) * d * len; return [p[0] + dx * t + nx * o, p[1] + dy * t + ny * o]; }); };
  let shape = null, last = -1;
  return new Promise(resolve => v.add({ duration, delay, end: resolve, draw(ctx, p, dpr) {
    const f = Math.floor(p * flicker);
    if (f !== last) { last = f; const main = jag(a, b, depth, 10); shape = [main]; if (fork) { const at = main[3 + (f % 4)], turn = Math.atan2(b[1] - a[1], b[0] - a[0]) + (f % 2 ? .7 : -.7), len = Math.hypot(b[0] - a[0], b[1] - a[1]) * .35; shape.push(jag(at, [at[0] + Math.cos(turn) * len, at[1] + Math.sin(turn) * len], depth * 1.6, 5)); } }
    const local = (p * flicker) % 1, alpha = local < .7 ? 1 : 1 - (local - .7) / .3;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "lighter"; ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const [width, col, al] of [[thin ? 9 : 16, color, .18], [thin ? 4 : 7, color, .8], [thin ? 1.4 : 2.4, WHITE, 1]]) {
      ctx.globalAlpha = al * alpha; ctx.strokeStyle = col; ctx.lineWidth = width;
      shape.forEach((line, i) => { ctx.lineWidth = i ? width * .6 : width; ctx.beginPath(); line.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); });
    }
  } }));
}
// a flash of light over the whole stage
export function flash(stage, type = "normal", peak = .35, duration = 360) {
  const v = vfxOf(stage);
  if (!v) return Promise.resolve();
  const color = TYPE_COLOR[type] || WHITE;
  return new Promise(resolve => v.add({ duration, end: resolve, draw(ctx, p) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = peak * (p < .15 ? p / .15 : 1 - (p - .15) / .85); ctx.fillStyle = color; ctx.fillRect(0, 0, v.canvas.width, v.canvas.height);
  } }));
}
// a shockwave: a ring of light that runs out from a point and thins as it goes, a bright disc at its start
export function shockwave(stage, [x, y], radius, type = "normal", { duration = 520, delay = 0, flat = 1, width = 10 } = {}) {
  const v = vfxOf(stage);
  if (!v) return Promise.resolve();
  const color = TYPE_COLOR[type] || WHITE;
  return new Promise(resolve => v.add({ duration, delay, end: resolve, draw(ctx, p, dpr) {
    const e = 1 - (1 - p) ** 3, r = radius * e;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(x, y); ctx.scale(1, flat);
    ctx.globalCompositeOperation = "lighter";
    if (p < .3) { const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * .5); g.addColorStop(0, WHITE); g.addColorStop(.4, color + "AA"); g.addColorStop(1, color + "00"); ctx.globalAlpha = 1 - p / .3; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, radius * .5, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = (1 - p) * .9; ctx.strokeStyle = color; ctx.lineWidth = width * (1 - p) + 1; ctx.beginPath(); ctx.arc(0, 0, Math.max(1, r), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - p); ctx.strokeStyle = WHITE; ctx.lineWidth = Math.max(.8, width * .25 * (1 - p)); ctx.stroke();
  } }));
}
