/* 배틀 무대의 그래픽 엔진 (DESIGN.md "Battle"). 경기장, 포켓몬, 기술, 날씨와 필드, 카메라를 WebGL2 캔버스 한 장에 한 시계로 그린다.
   - 파티클은 GPU에서 산다: 태어날 때 위치, 속도, 가속, 수명, 크기, 색의 길(ramp)을 한 번 적어 두면 셰이더가 매 프레임 자리를 계산한다.
     그래서 수천 개가 날아도 자바스크립트는 아무것도 하지 않고, 히트 스톱과 슬로 모션은 시계 하나를 늦추는 것으로 끝난다.
   - 리본(빔, 번개, 베기의 궤적, 물줄기)은 매 프레임 몇백 개의 꼭짓점으로 다시 짓는다.
   - 포켓몬은 텍스처 한 장의 사각형이다: 번쩍임, 물들임, 흑백, 윤곽의 빛, 바닥 아래로 가라앉기, 바닥의 반사, 잔상.
   - 빛나는 것만 따로 모아 블룸을 얹고, 충격파와 열기는 장면을 굴절시킨다. 라이트 테마에서는 빛이 물감처럼 덮인다.
   - 카메라는 임계 감쇠 스프링이다: 목표가 바뀌어도 속도가 끊기지 않아 꺾임이 없다. 흔들림은 부드러운 잡음(trauma)이다.
   좌표는 무대의 CSS 픽셀(넓은 화면일 때의 자리)이다. DOM의 자리(.bs-slot)는 배치와 누르기만 맡는다. */
import { reduced } from "../../components/common/motion.js";

export const TYPE_COLOR = {
  normal: "#E8ECF4", fire: "#FF6A1F", water: "#2F8CFF", electric: "#FFD21A", grass: "#56D23A", ice: "#7FEBFF", fighting: "#FF7A2A",
  poison: "#B455F0", ground: "#D89A4A", flying: "#9CCBFF", psychic: "#FF4F93", bug: "#B5C824", rock: "#C9B98A", ghost: "#A35CF0",
  dragon: "#6A72FF", dark: "#8A6BB8", steel: "#B8DDEE", fairy: "#FF8AE8",
};
export const DEEP = {
  normal: "#8FA3C8", fire: "#C4160A", water: "#0B47B8", electric: "#E07A00", grass: "#1E7A18", ice: "#1E8FD6", fighting: "#B83A00",
  poison: "#5E1E9C", ground: "#7A4310", flying: "#3A6FC0", psychic: "#A8104E", bug: "#5E7A0A", rock: "#6A5A2A", ghost: "#3E1478",
  dragon: "#2A2FB0", dark: "#24163E", steel: "#3E7F9C", fairy: "#C02FA8",
};
export const TYPES = Object.keys(TYPE_COLOR);
export const typeId = t => String(t || "normal").toLowerCase();

export const rand = (a, b) => a + Math.random() * (b - a);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const pick = v => (Array.isArray(v) ? rand(v[0], v[1]) : v);
export const EASE = {
  linear: t => t,
  in: t => t * t * t,
  in2: t => t * t,
  out: t => 1 - (1 - t) ** 3,
  out2: t => 1 - (1 - t) ** 2,
  out5: t => 1 - (1 - t) ** 5,
  inout: t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  sine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  back: t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  expo: t => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
};
const hex = (c, a = 1) => { const n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, a]; };
export const colorOf = t => TYPE_COLOR[typeId(t)] || (String(t).startsWith("#") ? t : TYPE_COLOR.normal);

/* ---------------------------------------------------------------- the atlas ---------------------------------------------------------------- */
// 8 x 8 cells of 128 px. R: the shape, G: a tiling noise the shape erodes through (flames lick, smoke tears), B: a highlight (a drop's glint)
const C = 128, GRID = 8;
const PATHS = {
  fist: "M3 9C3 5 6 3 9 3H25C28 3 30 5 30 8V19C30 24 26 27 21 27H10C6 27 3 24 3 20ZM3 15H15C17 15 18 17 17 19L14.5 22H3Z|32|28",
  foot: "M4 2H15L17 15H28C31 15 32 18 31 21L30 26H5C2 26 1 24 2 21Z|32|28",
  hand: "M4 22V9C4 7 7 7 7 9V3.5C7 1.5 10 1.5 10 3.5V2.5C10 0.5 13 0.5 13 2.5V3.5C13 1.5 16 1.5 16 3.5V11L18 8C19.5 6 22 7.5 21 9.5L16.5 20C15.5 22.5 13.5 24 11 24H6C5 24 4 23 4 22Z|22|24",
  heart: "M12 21C5 15 1 11 1 7A5.5 5.5 0 0 1 12 4A5.5 5.5 0 0 1 23 7C23 11 19 15 12 21Z|24|22",
  note: "M8 2H18V6H11V17A4 4 0 1 1 8 13.5Z|20|22",
  z: "M1 1H15V4L6 12H15V15H1V12L10 4H1Z|16|16",
  fang: "M0 0H40V3L36 14L32 3L28 11L24 3L20 13L16 3L12 11L8 3L4 14L0 3Z|40|14",
  crescent: "M0 18C8 2 32 2 40 18C30 8 10 8 0 18Z|40|20",
  eye: "M0 8C6 0 22 0 28 8C22 16 6 16 0 8ZM14 3.5A4.5 4.5 0 1 0 14 12.5A4.5 4.5 0 1 0 14 3.5Z|28|16",
  shell: "M0 12C2 4 8 0 14 0C20 0 26 4 28 12L22 9L18 12L14 8L10 12L6 9Z|28|12",
  bone: "M4 2A3 3 0 0 1 9 4L19 4A3 3 0 0 1 24 2A3 3 0 0 1 24 8A3 3 0 0 1 24 14A3 3 0 0 1 19 12L9 12A3 3 0 0 1 4 14A3 3 0 0 1 4 8A3 3 0 0 1 4 2Z|28|16",
  sword: "M2 7L30 5.5L38 8L30 10.5L2 9ZM0 3H3V13H0ZM-6 7H0V9H-6Z|44|16",
  caltrop: "M12 0 14.4 4.6 24 6 14.4 7.4 12 12 9.6 7.4 0 6 9.6 4.6Z|24|12",
  star5: "M12 0L14.9 8.2H23.4L16.5 13.3L19.1 21.6L12 16.5L4.9 21.6L7.5 13.3L.6 8.2H9.1Z|24|22",
};
function noiseTile(N = C) {
  // tileable value noise, four octaves
  const h = (x, y, p) => { const s = Math.sin(((x % p) + p) % p * 127.1 + ((y % p) + p) % p * 311.7) * 43758.5453; return s - Math.floor(s); };
  const sm = t => t * t * (3 - 2 * t);
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, amp = .5;
    for (let o = 0; o < 4; o++) {
      const p = 4 << o, fx = x / N * p, fy = y / N * p, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
      const a = h(ix, iy, p), b = h(ix + 1, iy, p), c = h(ix, iy + 1, p), d = h(ix + 1, iy + 1, p);
      v += amp * lerp(lerp(a, b, tx), lerp(c, d, tx), ty); amp *= .5;
    }
    out[y * N + x] = v / .9375;
  }
  return out;
}
// each cell is painted white on two canvases: the shape (R) and its highlight (B)
const CELLS = [];
const cell = (name, draw) => { CELLS.push([name, draw]); };
const rg = (g, x, y, r, stops) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); stops.forEach(([o, a]) => gr.addColorStop(o, `rgba(255,255,255,${a})`)); return gr; };
const disc = (g, x, y, r, stops) => { g.fillStyle = rg(g, x, y, r, stops); g.fillRect(x - r, y - r, r * 2, r * 2); };
const pathIn = (g, name, box = .78, turn = 0) => {
  const [d, vw, vh] = PATHS[name].split("|"), w = +vw, h = +vh, k = C * box / Math.max(w, h);
  g.save(); g.translate(C / 2, C / 2); g.rotate(turn); g.scale(k, k); g.translate(-w / 2, -h / 2); g.fill(new Path2D(d), "evenodd"); g.restore();
};
const S = C / 2;
cell("glow", g => disc(g, S, S, S, [[0, 1], [.2, .62], [.45, .22], [.75, .05], [1, 0]]));
cell("dot", g => disc(g, S, S, S, [[0, 1], [.32, .95], [.55, .35], [1, 0]]));
cell("spark", g => {
  disc(g, S, S, S * .2, [[0, 1], [.5, .45], [1, 0]]);
  for (const [sx, sy] of [[1, .07], [.07, 1], [.6, .04], [.04, .6]]) { g.save(); g.translate(S, S); if (sx === .6 || sx === .04) g.rotate(Math.PI / 4); g.scale(sx, sy); disc(g, 0, 0, S, [[0, 1], [.5, .5], [1, 0]]); g.restore(); }
});
cell("streak", g => { g.save(); g.translate(S, S); g.scale(1, .1); disc(g, 0, 0, S, [[0, 1], [.5, .55], [1, 0]]); g.restore(); });
cell("flame", (g, b) => {
  // a tongue of fire, broad and hot at its root, licking up to a point
  g.save(); g.translate(S, S * 1.2); g.scale(.7, 1); disc(g, 0, 0, S * .9, [[0, 1], [.35, .85], [.7, .3], [1, 0]]); g.restore();
  g.save(); g.translate(S, S * .6); g.scale(.35, .8); disc(g, 0, 0, S * .9, [[0, .9], [.5, .45], [1, 0]]); g.restore();
  b.save(); b.translate(S, S * 1.25); b.scale(.4, .55); disc(b, 0, 0, S * .9, [[0, 1], [.5, .5], [1, 0]]); b.restore();
});
cell("smoke", g => { [[.5, .52, .42], [.34, .58, .3], [.66, .6, .3], [.48, .36, .3], [.6, .44, .26]].forEach(([x, y, r]) => disc(g, x * C, y * C, r * C, [[0, .8], [.55, .5], [1, 0]])); });
cell("ring", g => { g.strokeStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 8; g.lineWidth = 5; g.beginPath(); g.arc(S, S, S * .86, 0, Math.PI * 2); g.stroke(); });
cell("wave", g => { g.fillStyle = rg(g, S, S, S, [[0, 0], [.6, 0], [.8, 1], [.92, .5], [1, 0]]); g.fillRect(0, 0, C, C); });
cell("drop", (g, b) => {
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(S, 8); g.bezierCurveTo(S + 14, 40, S + 34, 62, S + 34, 84); g.arc(S, 84, 34, 0, Math.PI); g.bezierCurveTo(S - 34, 62, S - 14, 40, S, 8); g.fill();
  b.fillStyle = "#fff"; b.beginPath(); b.ellipse(S - 12, 80, 7, 13, -.4, 0, Math.PI * 2); b.fill();
});
cell("bubble", (g, b) => {
  g.fillStyle = rg(g, S, S, S * .9, [[0, .12], [.75, .25], [.9, 1], [1, 0]]); g.fillRect(0, 0, C, C);
  b.fillStyle = "#fff"; b.beginPath(); b.ellipse(S - 22, S - 22, 12, 7, -.7, 0, Math.PI * 2); b.fill();
});
cell("leaf", (g, b) => {
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(6, S); g.bezierCurveTo(30, 18, 98, 18, 122, S); g.bezierCurveTo(98, 110, 30, 110, 6, S); g.fill();
  b.strokeStyle = "#fff"; b.lineWidth = 4; b.beginPath(); b.moveTo(10, S); b.lineTo(116, S); for (let i = 0; i < 4; i++) { b.moveTo(30 + i * 22, S); b.lineTo(42 + i * 22, S - 18); b.moveTo(30 + i * 22, S); b.lineTo(42 + i * 22, S + 18); } b.stroke();
});
cell("petal", (g, b) => {
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(S, 120); g.bezierCurveTo(10, 80, 14, 20, S - 10, 10); g.quadraticCurveTo(S, 22, S + 10, 10); g.bezierCurveTo(114, 20, 118, 80, S, 120); g.fill();
  b.fillStyle = rg(b, S, 100, 40, [[0, .8], [1, 0]]); b.fillRect(0, 0, C, C);
});
cell("shard", (g, b) => {
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(S, 4); g.lineTo(S + 22, 40); g.lineTo(S + 8, 124); g.lineTo(S - 8, 124); g.lineTo(S - 22, 40); g.closePath(); g.fill();
  b.fillStyle = "#fff"; b.globalAlpha = .9; b.beginPath(); b.moveTo(S, 4); b.lineTo(S + 22, 40); b.lineTo(S, 60); b.closePath(); b.fill(); b.globalAlpha = .45; b.beginPath(); b.moveTo(S, 60); b.lineTo(S + 22, 40); b.lineTo(S + 8, 124); b.closePath(); b.fill();
});
cell("rock", (g, b) => {
  const pts = [[20, 40], [52, 12], [96, 22], [118, 62], [100, 108], [48, 118], [12, 84]];
  g.fillStyle = "#fff"; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill();
  b.fillStyle = "#fff"; b.globalAlpha = .85; b.beginPath(); b.moveTo(20, 40); b.lineTo(52, 12); b.lineTo(96, 22); b.lineTo(62, 56); b.closePath(); b.fill(); b.globalAlpha = .35; b.beginPath(); b.moveTo(96, 22); b.lineTo(118, 62); b.lineTo(62, 56); b.fill();
});
cell("flake", g => {
  g.strokeStyle = "#fff"; g.lineWidth = 7; g.lineCap = "round"; g.translate(S, S);
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -52); g.moveTo(0, -30); g.lineTo(-14, -42); g.moveTo(0, -30); g.lineTo(14, -42); g.stroke(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
});
cell("feather", (g, b) => {
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(6, S + 6); g.bezierCurveTo(30, 26, 90, 22, 124, S - 6); g.bezierCurveTo(92, 96, 34, 100, 6, S + 6); g.fill();
  b.strokeStyle = "#fff"; b.lineWidth = 4; b.beginPath(); b.moveTo(2, S + 8); b.quadraticCurveTo(60, S + 2, 124, S - 6); b.stroke();
});
cell("star", g => pathIn(g, "star5", .86));
cell("heart", g => pathIn(g, "heart", .8));
cell("note", g => pathIn(g, "note", .8));
cell("z", g => pathIn(g, "z", .72));
cell("fist", g => pathIn(g, "fist", .8));
cell("foot", g => pathIn(g, "foot", .8));
cell("hand", g => pathIn(g, "hand", .8));
cell("crescent", (g, b) => { pathIn(g, "crescent", .92); b.globalAlpha = .6; pathIn(b, "crescent", .7); });
cell("fang", g => pathIn(g, "fang", .86));
cell("hex", g => {
  g.translate(S, S); const hx = r => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; g[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); };
  g.fillStyle = "rgba(255,255,255,.22)"; hx(56); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 6; g.shadowColor = "#fff"; g.shadowBlur = 6; hx(56); g.stroke();
  g.setTransform(1, 0, 0, 1, 0, 0);
});
cell("hexgrid", g => {
  // a wall of hexagonal panels: the guards and screens are built of them
  g.strokeStyle = "#fff"; g.lineWidth = 2.5; g.shadowColor = "#fff"; g.shadowBlur = 4; const r = 14, w = Math.sqrt(3) * r;
  for (let row = -1; row < 7; row++) for (let col = -1; col < 6; col++) {
    const x = col * w + (row % 2 ? w / 2 : 0), y = row * r * 1.5;
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; g[i ? "lineTo" : "moveTo"](x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.stroke();
  }
  g.globalCompositeOperation = "destination-in"; disc(g, S, S, S, [[0, 1], [.7, 1], [1, 0]]); g.globalCompositeOperation = "source-over";
});
cell("hexball", (g, b) => {
  // 2026-11-07, from Scarlet and Violet's Protect: a ball of hexagonal panes, each a pale pane in a bright frame, the panes squeezed
  // toward the ball's edge the way a sphere turns away, its rim a little deeper and a gloss up on the left
  const R = S * .95, r = .25, w = Math.sqrt(3) * r, E = 1.45;
  const warp = (x, y) => { const d = Math.hypot(x, y), k = d ? Math.sin(Math.min(d, E) / E * Math.PI / 2) / d : 1; return [S + x * k * R, S + y * k * R]; };
  for (let row = -9; row <= 9; row++) for (let col = -6; col <= 6; col++) {
    const cx = col * w + (row & 1 ? w / 2 : 0), cy = row * r * 1.5, d = Math.hypot(cx, cy);
    if (d > E + r) continue;
    const pts = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 3 * i + Math.PI / 6; return warp(cx + Math.cos(a) * r * .9, cy + Math.sin(a) * r * .9); });
    g.beginPath(); pts.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](x, y)); g.closePath();
    g.fillStyle = `rgba(255,255,255,${.05 + .13 * Math.min(1, d / E) ** 2})`; g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 2 * (1 - .5 * Math.min(1, d / E)); g.stroke();
  }
  g.globalCompositeOperation = "destination-in"; disc(g, S, S, R, [[0, 1], [.94, 1], [1, 0]]); g.globalCompositeOperation = "source-over";
  b.fillStyle = "#fff"; b.beginPath(); b.ellipse(S - 24, S - 26, 16, 8, -.75, 0, Math.PI * 2); b.fill();
});
cell("crack", g => {
  g.strokeStyle = "#fff"; g.lineCap = "round"; g.lineJoin = "round"; let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const branch = (x, y, a, len, w) => { if (len < 6 || w < .6) return; let px = x, py = y; g.lineWidth = w; g.beginPath(); g.moveTo(px, py); const n = 4; for (let i = 0; i < n; i++) { a += (r() - .5) * .9; px += Math.cos(a) * len / n; py += Math.sin(a) * len / n; g.lineTo(px, py); } g.stroke(); branch(px, py, a + (r() - .5) * 1.2, len * .62, w * .7); if (r() > .4) branch(px, py, a + (r() > .5 ? .9 : -.9), len * .5, w * .6); };
  for (let i = 0; i < 7; i++) branch(S, S, i / 7 * Math.PI * 2 + r() * .4, 34 + r() * 18, 5);
});
cell("scorch", g => { [[.5, .5, .48], [.36, .56, .3], [.66, .44, .32]].forEach(([x, y, rr]) => disc(g, x * C, y * C, rr * C, [[0, .9], [.6, .6], [1, 0]])); });
cell("web", g => {
  g.strokeStyle = "#fff"; g.lineWidth = 2.5; g.translate(S, S);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 62, Math.sin(a) * 62); g.stroke(); }
  for (const rr of [14, 26, 38, 50, 60]) { g.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2, s = rr * (i % 2 ? .93 : 1); g[i ? "lineTo" : "moveTo"](Math.cos(a) * s, Math.sin(a) * s); } g.stroke(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
});
cell("caltrop", (g, b) => { pathIn(g, "caltrop", .9); b.globalAlpha = .7; b.fillStyle = "#fff"; b.beginPath(); b.moveTo(S, S - 26); b.lineTo(S + 12, S - 4); b.lineTo(S, S); b.lineTo(S - 12, S - 4); b.fill(); });
cell("spiral", g => {
  g.strokeStyle = "#fff"; g.lineCap = "round"; g.translate(S, S);
  for (let arm = 0; arm < 3; arm++) { g.beginPath(); for (let i = 0; i <= 60; i++) { const t = i / 60, a = arm * Math.PI * 2 / 3 + t * Math.PI * 2.2, rr = 6 + t * 54; g.lineWidth = 2 + t * 7; g[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
});
cell("moon", (g, b) => {
  disc(g, S, S, S * .95, [[0, 1], [.82, 1], [.9, .6], [1, 0]]);
  b.fillStyle = "#fff"; [[44, 50, 9], [78, 74, 12], [60, 88, 6], [86, 42, 7]].forEach(([x, y, r]) => { b.globalAlpha = .55; b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fill(); });
});
cell("sun", g => { disc(g, S, S, S * .5, [[0, 1], [.7, 1], [1, 0]]); g.translate(S, S); for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.save(); g.scale(.06, 1); disc(g, 0, -S * .6, S * .45, [[0, .9], [1, 0]]); g.restore(); } g.setTransform(1, 0, 0, 1, 0, 0); });
// every puff stays inside its cell: one past the edge was cut off straight, and the cut drifted across the stage with the cloud
cell("cloud", g => { [[.5, .55, .4], [.3, .6, .26], [.7, .6, .26], [.42, .4, .3], [.6, .42, .28], [.22, .66, .18], [.78, .66, .18]].forEach(([x, y, r]) => disc(g, x * C, y * C, r * C, [[0, .9], [.6, .7], [1, 0]])); });
cell("grain", g => disc(g, S, S, S * .5, [[0, 1], [.6, 1], [1, 0]]));
cell("bolt", g => { g.fillStyle = "#fff"; g.beginPath(); [[70, 4], [30, 66], [58, 66], [44, 124], [100, 50], [70, 50], [92, 4]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill(); });
cell("bone", g => pathIn(g, "bone", .9));
cell("sword", (g, b) => { pathIn(g, "sword", .94); b.globalAlpha = .8; b.fillStyle = "#fff"; b.fillRect(36, 60, 74, 4); });
cell("shell", g => pathIn(g, "shell", .86));
cell("chevron", g => { g.fillStyle = "#fff"; g.beginPath(); g.moveTo(S, 14); g.lineTo(118, 74); g.lineTo(96, 96); g.lineTo(S, 54); g.lineTo(32, 96); g.lineTo(10, 74); g.closePath(); g.fill(); });
cell("plus", g => { g.fillStyle = "#fff"; g.fillRect(S - 14, 16, 28, 96); g.fillRect(16, S - 14, 96, 28); });
cell("eye", g => pathIn(g, "eye", .86));
cell("coin", (g, b) => { g.fillStyle = "#fff"; g.beginPath(); g.arc(S, S, 54, 0, Math.PI * 2); g.fill(); b.strokeStyle = "#fff"; b.lineWidth = 6; b.beginPath(); b.arc(S, S, 40, 0, Math.PI * 2); b.stroke(); b.globalAlpha = .7; b.beginPath(); b.ellipse(S - 18, S - 20, 12, 7, -.7, 0, Math.PI * 2); b.fill(); });
cell("orb", (g, b) => { disc(g, S, S, S, [[0, 1], [.55, .95], [.7, 1], [.8, .55], [1, 0]]); b.fillStyle = rg(b, S - 16, S - 18, 34, [[0, .9], [1, 0]]); b.fillRect(0, 0, C, C); });
cell("claws", g => {
  g.strokeStyle = "#fff"; g.lineCap = "round";
  for (let i = -1; i <= 1; i++) { g.beginPath(); for (let j = 0; j <= 20; j++) { const t = j / 20, x = 14 + t * 100, y = 24 + i * 30 + t * 70 + Math.sin(t * Math.PI) * -10; g.lineWidth = 1 + Math.sin(t * Math.PI) * 9; g[j ? "lineTo" : "moveTo"](x, y); } g.stroke(); }
});
cell("cross", g => { g.strokeStyle = "#fff"; g.lineCap = "round"; for (const s of [1, -1]) { for (let j = 0; j < 20; j++) { const t = j / 20, t2 = (j + 1) / 20; g.lineWidth = 1 + Math.sin(t * Math.PI) * 12; g.beginPath(); g.moveTo(14 + t * 100, s > 0 ? 14 + t * 100 : 114 - t * 100); g.lineTo(14 + t2 * 100, s > 0 ? 14 + t2 * 100 : 114 - t2 * 100); g.stroke(); } } });
cell("sigil", g => {
  g.strokeStyle = "#fff"; g.lineWidth = 3; g.shadowColor = "#fff"; g.shadowBlur = 5; g.translate(S, S);
  for (const r of [60, 50]) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  for (const s of [0, Math.PI]) { g.beginPath(); for (let i = 0; i <= 3; i++) { const a = s + i * Math.PI * 2 / 3 - Math.PI / 2; g[i ? "lineTo" : "moveTo"](Math.cos(a) * 48, Math.sin(a) * 48); } g.stroke(); }
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 50, Math.sin(a) * 50); g.lineTo(Math.cos(a) * 56, Math.sin(a) * 56); g.stroke(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
});
cell("gear", g => { g.fillStyle = "#fff"; g.translate(S, S); g.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 46 : 58; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.moveTo(22, 0); g.arc(0, 0, 22, 0, Math.PI * 2, true); g.fill("evenodd"); g.setTransform(1, 0, 0, 1, 0, 0); });
cell("needle", g => { g.fillStyle = "#fff"; g.beginPath(); g.moveTo(4, S); g.lineTo(124, S - 5); g.lineTo(124, S + 5); g.closePath(); g.fill(); });
cell("scale", (g, b) => { g.fillStyle = "#fff"; g.beginPath(); g.moveTo(S, 10); g.quadraticCurveTo(112, 40, S, 120); g.quadraticCurveTo(16, 40, S, 10); g.fill(); b.globalAlpha = .7; b.fillStyle = "#fff"; b.beginPath(); b.moveTo(S, 10); b.quadraticCurveTo(112, 40, S, 120); b.lineTo(S, 10); b.fill(); });
cell("grass", g => { g.fillStyle = "#fff"; for (let i = 0; i < 5; i++) { const x = 20 + i * 22, lean = (i - 2) * 10; g.beginPath(); g.moveTo(x - 7, 124); g.quadraticCurveTo(x - 4, 60, x + lean, 10 + (i % 2) * 22); g.quadraticCurveTo(x + 2, 64, x + 7, 124); g.fill(); } });
cell("seed", (g, b) => { g.fillStyle = "#fff"; g.beginPath(); g.ellipse(S, S, 30, 44, 0, 0, Math.PI * 2); g.fill(); b.globalAlpha = .8; b.fillStyle = "#fff"; b.beginPath(); b.ellipse(S - 10, S - 14, 8, 14, -.3, 0, Math.PI * 2); b.fill(); });
cell("slashfx", g => { g.save(); g.translate(S, S); g.rotate(-.5); g.scale(1, .16); disc(g, 0, 0, S, [[0, 1], [.35, .9], [.6, .4], [1, 0]]); g.restore(); });
cell("tornado", g => { g.strokeStyle = "#fff"; g.lineCap = "round"; for (let i = 0; i < 9; i++) { const y = 10 + i * 13, rx = 8 + i * 6.5; g.lineWidth = 3 + i * .4; g.beginPath(); g.ellipse(S + Math.sin(i) * 6, 124 - y, rx, rx * .22, 0, 0, Math.PI * 2); g.stroke(); } });
cell("ball", (g, b) => { g.fillStyle = "#fff"; g.beginPath(); g.arc(S, S, 56, 0, Math.PI * 2); g.fill(); b.fillStyle = "#fff"; b.fillRect(0, S - 6, C, 12); b.beginPath(); b.arc(S, S, 16, 0, Math.PI * 2); b.fill(); });
cell("grid", g => { g.strokeStyle = "#fff"; g.lineWidth = 2; g.shadowColor = "#fff"; g.shadowBlur = 3; for (let i = 0; i <= 8; i++) { const v = 2 + i * 15.5; g.beginPath(); g.moveTo(v, 0); g.lineTo(v, C); g.moveTo(0, v); g.lineTo(C, v); g.stroke(); } });
cell("tuft", (g, b) => {
  let seed = 3; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 14; i++) {
    const x = 18 + r() * 92, h = 50 + r() * 70, lean = (r() - .5) * 46, w = 3 + r() * 3.5, base = 126;
    const tip = [x + lean, base - h], ctrl = [x + lean * .2, base - h * .55];
    g.beginPath(); g.moveTo(x - w, base); g.quadraticCurveTo(ctrl[0] - w * .4, ctrl[1], tip[0], tip[1]); g.quadraticCurveTo(ctrl[0] + w * .4, ctrl[1], x + w, base); g.closePath(); g.fill();
    b.beginPath(); b.moveTo(ctrl[0], ctrl[1]); b.quadraticCurveTo(lerp(ctrl[0], tip[0], .5) + 1, lerp(ctrl[1], tip[1], .5), tip[0], tip[1]); b.lineWidth = 1.6; b.strokeStyle = "#fff"; b.globalAlpha = .7; b.stroke(); b.globalAlpha = 1;
  }
});
cell("flower", (g, b) => { g.translate(S, S); for (let i = 0; i < 5; i++) { g.rotate(Math.PI * 2 / 5); g.beginPath(); g.ellipse(0, -26, 15, 26, 0, 0, Math.PI * 2); g.fill(); } g.setTransform(1, 0, 0, 1, 0, 0); b.beginPath(); b.arc(S, S, 14, 0, Math.PI * 2); b.fill(); });
cell("arc", g => { g.strokeStyle = "#fff"; g.lineCap = "round"; for (let j = 0; j < 24; j++) { const t = j / 24, a0 = Math.PI * (1.1 + t * .8), a1 = Math.PI * (1.1 + (t + 1 / 24) * .8); g.lineWidth = 1 + Math.sin(t * Math.PI) * 14; g.beginPath(); g.arc(S, S + 30, 70, a0, a1); g.stroke(); } });
/* 2026-11-06 remake (the games' own look, checked against 포켓몬 챔피언스): what a move throws is a lit thing, not a flat sign */
// a billow of fire or smoke: a cauliflower of round lobes, each its own dome once lit
const BILLOW = [[.5, .56, .3], [.3, .6, .2], [.7, .6, .2], [.4, .38, .21], [.62, .4, .19], [.5, .26, .15], [.24, .44, .14], [.77, .45, .13], [.38, .76, .17], [.63, .76, .17]];
cell("billow", g => { g.fillStyle = "#fff"; for (const [x, y, r] of BILLOW) { g.beginPath(); g.arc(x * C, y * C, r * C, 0, Math.PI * 2); g.fill(); } });
// a chip of stone: a small pointed shard of rock (Stealth Rock, debris)
cell("chip", g => { g.fillStyle = "#fff"; g.beginPath(); [[64, 6], [92, 46], [104, 96], [70, 122], [30, 104], [22, 58]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); });
// a chunk of ice: a hexagonal crystal standing on end
cell("crystal", g => { g.fillStyle = "#fff"; g.beginPath(); [[64, 2], [100, 30], [100, 98], [64, 126], [28, 98], [28, 30]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); });
// the splash of a blow: a jagged star, flat as the games draw it (Shadow Ball's black corona, a punch's white burst)
cell("splat", g => { g.fillStyle = "#fff"; g.beginPath(); let seed = 11; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; const n = 22; for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * Math.PI * 2, rr = i % 2 ? 26 + r() * 10 : 44 + r() * 20; g.lineTo(S + Math.cos(a) * rr, S + Math.sin(a) * rr); } g.closePath(); g.fill(); });
// the games' glint: four long thin rays from a bright point
cell("glint", g => { disc(g, S, S, S * .16, [[0, 1], [.5, .6], [1, 0]]); for (const [sx, sy] of [[1, .045], [.045, 1]]) { g.save(); g.translate(S, S); g.scale(sx, sy); disc(g, 0, 0, S, [[0, 1], [.35, .6], [1, 0]]); g.restore(); } });
// a tile of a room's wall: a square pane, its border lit, its face faint
cell("tile", g => { g.fillStyle = "rgba(255,255,255,.34)"; g.fillRect(8, 8, 112, 112); g.strokeStyle = "#fff"; g.lineWidth = 5; g.strokeRect(8, 8, 112, 112); });
// a wisp of mist: a soft curl lying along the floor
cell("wisp", g => { g.strokeStyle = "#fff"; g.lineCap = "round"; for (let j = 0; j < 30; j++) { const t = j / 30, t2 = (j + 1) / 30, p = u => [10 + u * 108, S + Math.sin(u * Math.PI * 1.6) * 22 - u * 10]; const [x0, y0] = p(t), [x1, y1] = p(t2); g.globalAlpha = Math.sin(Math.PI * t) * .5; g.lineWidth = 10 + Math.sin(Math.PI * t) * 34; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); } g.globalAlpha = 1; });
// fine blades of grass as a texture laid on the floor (grassy terrain is a wash with a fine grain, not a lawn of tufts)
cell("blades", g => { let seed = 5; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; g.strokeStyle = "#fff"; g.lineCap = "round"; for (let i = 0; i < 70; i++) { const x = r() * C, y = 10 + r() * (C - 14), h = 8 + r() * 14, l = (r() - .5) * 6; g.globalAlpha = .4 + r() * .6; g.lineWidth = 1.4 + r() * 1.4; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l * .3, y - h * .6, x + l, y - h); g.stroke(); } g.globalAlpha = 1; g.globalCompositeOperation = "destination-in"; disc(g, S, S, S, [[0, 1], [.6, 1], [1, 0]]); g.globalCompositeOperation = "source-over"; });

export const TEX = Object.fromEntries(CELLS.map(([n], i) => [n, i]));
const ROWS = Math.ceil(CELLS.length / GRID);

/* ---------------------------------------------------------------- lit things ---------------------------------------------------------------- */
/* A thing a move throws is lit as the Pokémon's renders are (the Poké Ball's way, DESIGN.md "One style for everything drawn"): each cell
   of the atlas also has a surface, its normal baked once from its shape. A round thing is a dome over its shape (a drop, an orb, a
   lobe of fire), a stone or a crystal is cut into flat faces, a sign (a fist, a fang, a star) is a soft bevelled solid. The particle
   shader turns that normal with the particle and lights it from the upper left in front, as the ball is lit, so a tumbling rock keeps
   its light where the light is. kind: dome (the whole shape rounds), bevel (only its edge rounds), facet (cut faces), flat (a light). */
const SURF = {
  orb: ["dome"], drop: ["dome"], bubble: ["dome"], seed: ["dome"], moon: ["dome", 0, "moon"], ball: ["dome"], dot: ["dome"], grain: ["dome"], billow: ["dome"], cloud: ["dome"], smoke: ["dome"],
  rock: ["facet", 8], chip: ["facet", 6], shard: ["facet", 3], crystal: ["facet", 7], caltrop: ["facet", 4],
  fist: ["bevel", 18], foot: ["bevel", 16], hand: ["bevel", 12], heart: ["bevel", 20], star: ["bevel", 14], note: ["bevel", 8], fang: ["bevel", 7], crescent: ["bevel", 8],
  bone: ["bevel", 12], sword: ["bevel", 5], shell: ["bevel", 10], scale: ["dome"], coin: ["bevel", 6], leaf: ["bevel", 14], petal: ["dome"], feather: ["bevel", 10], gear: ["bevel", 6],
  needle: ["bevel", 5], flower: ["bevel", 10], flame: ["dome"], z: ["bevel", 6], chevron: ["bevel", 8], plus: ["bevel", 8], eye: ["bevel", 6], web: ["bevel", 2], bolt: ["bevel", 6],
};
// how a cell's surface takes the light: [gloss, sharpness of the highlight, see-through middle, rim]
const MATERIAL = {
  drop: [1, 70, .55, .75], bubble: [1, 90, .88, 1], orb: [.55, 30, 0, .85], seed: [.5, 30, 0, .3], moon: [.05, 12, 0, .35], ball: [.8, 50, 0, .3],
  rock: [.1, 10, 0, .18], chip: [.12, 12, 0, .2], shard: [.95, 55, .4, .6], crystal: [.95, 55, .45, .7], caltrop: [1, 40, 0, .35], coin: [1, 36, 0, .3], sword: [1, 48, 0, .4], gear: [1, 36, 0, .3],
  billow: [0, 8, 0, .12], cloud: [0, 8, 0, .1], smoke: [0, 8, 0, .1], flame: [0, 8, 0, .1],
  leaf: [.25, 18, 0, .25], petal: [.2, 16, .15, .35], feather: [.1, 12, 0, .3], bone: [.3, 20, 0, .2], shell: [.6, 30, 0, .3], scale: [.8, 36, 0, .4],
};
const MAT_DEFAULT = [.35, 24, 0, .3];
function chamfer(inside, n) {
  // distance to the outside in pixels (two passes of a 3-4 chamfer)
  const d = new Float32Array(n * n), BIG = 1e6;
  for (let i = 0; i < n * n; i++) d[i] = inside[i] ? BIG : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n ? 0 : d[y * n + x]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y * n + x; if (!d[i]) continue; d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414); }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) { const i = y * n + x; if (!d[i]) continue; d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414); }
  return d;
}
function surface(name, alpha, n) {
  const [kind, param = 0, extra] = SURF[name] || ["flat"], out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) { out[i * 4] = 128; out[i * 4 + 1] = 128; out[i * 4 + 2] = 255; out[i * 4 + 3] = 255; }
  if (kind === "flat") return out;
  const inside = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) inside[i] = alpha[i] > 90 ? 1 : 0;
  const dt = chamfer(inside, n);
  let maxd = 0; for (let i = 0; i < n * n; i++) maxd = Math.max(maxd, dt[i]);
  if (!maxd) return out;
  const D = kind === "bevel" ? Math.min(maxd, param) : maxd;
  const h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { const t = Math.min(dt[i] / D, 1); h[i] = dt[i] ? D * Math.sqrt(1 - (1 - t) * (1 - t)) : 0; }
  if (extra === "moon") { let seed = 9; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; for (let k = 0; k < 9; k++) { const cx = 30 + r() * 68, cy = 30 + r() * 68, cr = 5 + r() * 11; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const q = Math.hypot(x - cx, y - cy) / cr; if (q < 1.15) h[y * n + x] -= (q < 1 ? (1 - q * q) * cr * .35 : 0) - (q > .9 ? (1.15 - q) * cr * .5 : 0); } } }
  // smooth the field once, so its ridges turn rather than crease
  const s = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let v = 0, w = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; v += h[yy * n + xx]; w++; } s[y * n + x] = v / w; }
  // a cut thing: its pixels belong to the nearest of a few points scattered in it, and each such face leans away from the middle
  let faces = null;
  if (kind === "facet") {
    let seed = 7 + name.length * 13; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let cx = 0, cy = 0, cnt = 0; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (inside[y * n + x]) { cx += x; cy += y; cnt++; }
    cx /= cnt; cy /= cnt;
    const pts = [];
    while (pts.length < param) { const x = r() * n, y = r() * n; if (inside[Math.floor(y) * n + Math.floor(x)]) pts.push([x, y]); }
    pts.push([cx, cy]);
    const rad = Math.sqrt(cnt / Math.PI);
    faces = pts.map(([x, y], k) => { const ox = (x - cx) / rad, oy = (y - cy) / rad, v = [ox * 1.25 + (r() - .5) * .35, oy * 1.25 + (r() - .5) * .35, k === pts.length - 1 ? 1.6 : 1]; const l = Math.hypot(...v); return { x, y, nrm: v.map(c => c / l) }; });
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    if (!inside[i]) continue;
    const g = (xx, yy) => s[Math.min(n - 1, Math.max(0, yy)) * n + Math.min(n - 1, Math.max(0, xx))];
    let nx = -(g(x + 1, y) - g(x - 1, y)) / 2, ny = -(g(x, y + 1) - g(x, y - 1)) / 2, nzz = 1;
    let l = Math.hypot(nx, ny, nzz); nx /= l; ny /= l; nzz /= l;
    if (faces) {
      let best = faces[0], bd = Infinity; for (const f of faces) { const d = (f.x - x) ** 2 + (f.y - y) ** 2; if (d < bd) { bd = d; best = f; } }
      // the silhouette still rounds a little where the faces meet the edge
      const edge = Math.min(1, dt[i] / 6);
      nx = lerp(nx, best.nrm[0], edge); ny = lerp(ny, best.nrm[1], edge); nzz = lerp(nzz, best.nrm[2], edge);
      l = Math.hypot(nx, ny, nzz); nx /= l; ny /= l; nzz /= l;
    }
    out[i * 4] = (nx * .5 + .5) * 255; out[i * 4 + 1] = (ny * .5 + .5) * 255; out[i * 4 + 2] = Math.min(1, s[i] / Math.max(1, D)) * 255;
  }
  return out;
}
export const MATERIALS = CELLS.map(([n]) => MATERIAL[n] || MAT_DEFAULT);

let atlasData = null;
function buildAtlas() {
  if (atlasData) return atlasData;
  const N = C * GRID, NH = C * ROWS, mk = () => { const c = document.createElement("canvas"); c.width = N; c.height = NH; return c; };
  const shape = mk(), high = mk(), gs = shape.getContext("2d", { willReadFrequently: true }), gb = high.getContext("2d");
  CELLS.forEach(([, draw], i) => {
    const x = (i % GRID) * C, y = Math.floor(i / GRID) * C;
    for (const g of [gs, gb]) { g.save(); g.beginPath(); g.rect(x, y, C, C); g.clip(); g.translate(x, y); g.fillStyle = "#fff"; g.strokeStyle = "#fff"; }
    draw(gs, gb);
    gs.restore(); gb.restore();
  });
  const a = gs.getImageData(0, 0, N, NH).data, b = gb.getImageData(0, 0, N, NH).data, nz = noiseTile();
  const out = new Uint8Array(N * NH * 4), nrm = new Uint8Array(N * NH * 4);
  for (let y = 0; y < NH; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4, cellI = Math.floor(y / C) * GRID + Math.floor(x / C);
    out[i] = a[i + 3]; out[i + 1] = nz[((y + cellI * 37) % C) * C + ((x + cellI * 53) % C)] * 255; out[i + 2] = b[i + 3]; out[i + 3] = 255;
  }
  CELLS.forEach(([name], ci) => {
    const x0 = (ci % GRID) * C, y0 = Math.floor(ci / GRID) * C, al = new Uint8Array(C * C);
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) al[y * C + x] = a[((y0 + y) * N + x0 + x) * 4 + 3];
    const sf = surface(name, al, C);
    for (let y = 0; y < C; y++) nrm.set(sf.subarray(y * C * 4, (y + 1) * C * 4), ((y0 + y) * N + x0) * 4);
  });
  atlasData = { N, NH, out, nrm, noise: nz };
  return atlasData;
}

/* ---------------------------------------------------------------- colour over a life ---------------------------------------------------------------- */
// a ramp is the colour and alpha a particle passes through from birth (0) to death (1)
const RAMPS = [];
export const RAMP = {};
const ramp = (name, stops) => { RAMP[name] = RAMPS.length; RAMPS.push(stops); };
// light: a white heart, the colour, its deep tone, gone. matter: its colour held, fading at the end
for (const t of TYPES) {
  ramp(t, [[0, "#FFFFFF", 0], [.06, "#FFFFFF", 1], [.22, TYPE_COLOR[t], 1], [.7, DEEP[t], .6], [1, DEEP[t], 0]]);
  ramp(`${t}.m`, [[0, TYPE_COLOR[t], 0], [.08, TYPE_COLOR[t], 1], [.7, TYPE_COLOR[t], .9], [1, DEEP[t], 0]]);
  ramp(`${t}.h`, [[0, TYPE_COLOR[t], 0], [.15, TYPE_COLOR[t], 1], [.85, TYPE_COLOR[t], 1], [1, TYPE_COLOR[t], 0]]);
}
// the pale types' light held at a deeper tone, halfway to their deep colour (2026-11-07 round 4: Flying's, Steel's and Ice's own colours
// are almost white, and a blow's star and streaks of them over a pale body summed to a white body)
const mid = (a, b) => "#" + [1, 3, 5].map(i => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, "0")).join("");
for (const t of ["flying", "steel", "ice", "rock"]) { const m = mid(TYPE_COLOR[t], DEEP[t]); ramp(`${t}.d`, [[0, m, 0], [.08, m, 1], [.75, m, .9], [1, DEEP[t], 0]]); }
// a blow of no type is lit warm, the games' pale gold (its type colour is almost white, and stacked light of it read as a white-out)
ramp("normal.m", [[0, "#F5C85A", 0], [.08, "#F5C85A", 1], [.7, "#F0BC48", .9], [1, "#C88A10", 0]]);
ramp("normal.h", [[0, "#FFD978", 0], [.15, "#FFD978", 1], [.85, "#FFD06A", 1], [1, "#FFD06A", 0]]);
ramp("fire", [[0, "#FFF0B0", 0], [.04, "#FFE070", 1], [.14, "#FFA030", 1], [.36, "#FF6A1A", .95], [.6, "#D8300E", .7], [.85, "#5A1E14", .35], [1, "#2A1410", 0]]);
ramp("blue", [[0, "#FFFFFF", 0], [.05, "#E6F4FF", 1], [.25, "#7FD0FF", 1], [.6, "#2F6BFF", .7], [1, "#1A2A8A", 0]]);
ramp("smoke", [[0, "#9AA3B4", 0], [.15, "#7C8597", .6], [.6, "#4E5566", .4], [1, "#2E3340", 0]]);
ramp("smoke.l", [[0, "#F2F4F8", 0], [.15, "#E2E6EE", .7], [.6, "#C8CFDB", .45], [1, "#AEB6C4", 0]]);
ramp("dust", [[0, "#F2E2C2", 0], [.12, "#E4CDA4", .8], [.6, "#CBB085", .5], [1, "#A88C64", 0]]);
// a sandstorm's drifting dust: it ends where it starts, so its loop has no seam
ramp("dust.c", [[0, "#C9A06A", .6], [.5, "#A8804E", .42], [1, "#C9A06A", .6]]);
ramp("steam", [[0, "#FFFFFF", 0], [.15, "#EAF4FF", .55], [1, "#BFD6EE", 0]]);
ramp("spray", [[0, "#FFFFFF", 0], [.05, "#F4FBFF", 1], [.4, "#9ED4FF", .85], [1, "#2F7BE0", 0]]);
ramp("white", [[0, "#FFFFFF", 0], [.05, "#FFFFFF", 1], [.6, "#FFFFFF", .7], [1, "#FFFFFF", 0]]);
ramp("white.h", [[0, "#FFFFFF", 0], [.1, "#FFFFFF", 1], [.9, "#FFFFFF", 1], [1, "#FFFFFF", 0]]);
ramp("flash", [[0, "#FFFFFF", 0], [.02, "#FFFFFF", 1], [.12, "#FFF6D8", .3], [.3, "#FFFFFF", 0], [1, "#FFFFFF", 0]]);
// a Pokémon called back: the red light of its ball, white at its heart
ramp("recall", [[0, "#FFFFFF", 0], [.05, "#FFE4E4", 1], [.22, "#FF5A5A", 1], [.65, "#D81E2A", .7], [1, "#5A0A12", 0]]);
ramp("recall.h", [[0, "#FF4A4A", 0], [.12, "#FF4A4A", 1], [.85, "#FF2A36", 1], [1, "#C41422", 0]]);
ramp("shadow", [[0, "#1A0E2E", 0], [.1, "#120A22", .85], [.7, "#0A0614", .6], [1, "#000000", 0]]);
ramp("scorch", [[0, "#2A1A12", 0], [.1, "#1E140E", .7], [.7, "#1E140E", .55], [1, "#1E140E", 0]]);
ramp("rainbow", [[0, "#FF3B3B", 0], [.1, "#FF3B3B", 1], [.27, "#FFC21A", 1], [.44, "#4FD836", 1], [.61, "#3FD8FF", 1], [.78, "#7060FF", 1], [.92, "#FF70F0", .8], [1, "#FF70F0", 0]]);
ramp("gold", [[0, "#FFFFFF", 0], [.06, "#FFF6C8", 1], [.3, "#FFD24A", 1], [.75, "#C88A10", .7], [1, "#6A4A08", 0]]);
ramp("aurora", [[0, "#7FFFD4", 0], [.15, "#7FFFD4", .8], [.4, "#7FD0FF", .9], [.65, "#C08AFF", .8], [.85, "#FF8AE8", .5], [1, "#FF8AE8", 0]]);
ramp("lamp", [[0, "#FFF4D6", 0], [.5, "#FFF4D6", 1], [1, "#FFF4D6", 0]]);
ramp("crowdflash", [[0, "#FFFFFF", 0], [.9, "#FFFFFF", 0], [.91, "#FFFFFF", 1], [.94, "#FFFFFF", .3], [.96, "#FFFFFF", 0], [1, "#FFFFFF", 0]]);
ramp("pulse", [[0, "#FFFFFF", .5], [.5, "#FFFFFF", 1], [1, "#FFFFFF", .5]]);
ramp("rain", [[0, "#CFE6FF", 0], [.1, "#CFE6FF", .9], [.9, "#9CC8FF", .9], [1, "#9CC8FF", 0]]);
ramp("rain.l", [[0, "#4F7FC8", 0], [.1, "#4F7FC8", .9], [.9, "#3A68B0", .9], [1, "#3A68B0", 0]]);
ramp("grass.d", [[0, "#2F7D2A", 0], [.08, "#2F7D2A", 1], [.9, "#3B9434", 1], [1, "#3B9434", 0]]);
ramp("grass.e", [[0, "#6CEBB0", 0], [.08, "#6CEBB0", 1], [.9, "#4FD89A", 1], [1, "#4FD89A", 0]]);
ramp("grass.l", [[0, "#5FAE45", 0], [.08, "#5FAE45", 1], [.9, "#74C255", 1], [1, "#74C255", 0]]);
ramp("sunlit", [[0, "#FFF4C8", 0], [.25, "#FFE9A0", .8], [.5, "#FFF4C8", 1], [.75, "#FFE9A0", .8], [1, "#FFF4C8", 0]]);
ramp("psy.wave", [[0, "#FF7AC8", 0], [.2, "#FF7AC8", .9], [.6, "#C77DFF", .7], [1, "#8F6BFF", 0]]);
ramp("electric.d", [[0, "#E0A100", 0], [.08, "#E0A100", 1], [.9, "#C98F00", 1], [1, "#C98F00", 0]]);
ramp("caltrop", [[0, "#E6ECF5", 0], [.08, "#E6ECF5", 1], [.9, "#C9D3E2", 1], [1, "#C9D3E2", 0]]);
ramp("toxic.h", [[0, "#C77DFF", 0], [.08, "#C77DFF", 1], [.9, "#A64FEA", 1], [1, "#A64FEA", 0]]);
ramp("stone.l", [[0, "#C8B58C", 0], [.08, "#C8B58C", 1], [.85, "#A8946A", 1], [1, "#A8946A", 0]]);
ramp("stone", [[0, "#9A8866", 0], [.08, "#9A8866", 1], [.85, "#7A6A4A", 1], [1, "#6A5A3A", 0]]);
ramp("iron", [[0, "#6A7488", 0], [.08, "#6A7488", 1], [.9, "#4E586C", 1], [1, "#4E586C", 0]]);
ramp("iron.l", [[0, "#AEB8CC", 0], [.08, "#AEB8CC", 1], [.9, "#98A4BA", 1], [1, "#98A4BA", 0]]);
ramp("snow", [[0, "#FFFFFF", 0], [.1, "#FFFFFF", 1], [.9, "#EAF6FF", 1], [1, "#EAF6FF", 0]]);
// Protect's panes: a pale sky blue that holds, and the deep blue violet its ball sinks into at the rim
ramp("guard", [[0, "#B4DCFF", 0], [.12, "#B4DCFF", 1], [.8, "#A6D2FF", 1], [1, "#A6D2FF", 0]]);
ramp("guard.rim", [[0, "#5A5CE8", 0], [.12, "#5A5CE8", .9], [.8, "#3F3FC0", .8], [1, "#3F3FC0", 0]]);
ramp("sand", [[0, "#E8C890", 0], [.1, "#D8B070", .9], [.9, "#B88A4A", .8], [1, "#B88A4A", 0]]);
ramp("sunray", [[0, "#FFF2C0", 0], [.5, "#FFE08A", .55], [1, "#FFF2C0", 0]]);
ramp("toxic", [[0, "#E8B0FF", 0], [.1, "#C070F0", 1], [.6, "#8A2EC8", .8], [1, "#4A1070", 0]]);
ramp("mist", [[0, "#FFE0FA", 0], [.3, "#FFD0F6", .5], [.7, "#F0B0F0", .45], [1, "#F0B0F0", 0]]);
ramp("ink", [[0, "#2A1A4A", 0], [.1, "#1A0E30", .9], [.7, "#120A22", .7], [1, "#000000", 0]]);
/* lit matter (2026-11-06 remake, from 포켓몬 챔피언스): the colour a lit thing is made of, its light coming from its surface */
// a billow of fire: white-hot as it bursts, yellow, orange, red, and a brown smoke as it cools
ramp("fire.b", [[0, "#FFFBE0", 0], [.04, "#FFF6C0", 1], [.16, "#FFD24A", 1], [.36, "#FF8A1E", .95], [.6, "#E0400E", .8], [.82, "#6A2A16", .5], [1, "#2A1A14", 0]]);
// a flamethrower's body: orange from the start with a yellow heart, reddening and browning at its edge (white only in its core)
ramp("fire.s", [[0, "#FFD860", 0], [.05, "#FFC23A", 1], [.24, "#FF9426", 1], [.5, "#F2621A", .95], [.76, "#B8360E", .75], [1, "#4A1E14", 0]]);
// the hot heart of a flame that stays bright (a stream's core)
ramp("fire.c", [[0, "#FFFFFF", 0], [.06, "#FFFBE6", 1], [.3, "#FFE27A", 1], [.7, "#FFA531", .8], [1, "#E8541A", 0]]);
ramp("foam", [[0, "#FFFFFF", 0], [.06, "#FFFFFF", 1], [.5, "#E6F6FF", .9], [1, "#BFE4FF", 0]]);
ramp("water.l", [[0, "#D8F0FF", 0], [.06, "#BCE6FF", 1], [.8, "#7CC8FF", .95], [1, "#4AA6F0", 0]]);
ramp("ice.c", [[0, "#F2FCFF", 0], [.06, "#DDF6FF", 1], [.85, "#B4E8FA", 1], [1, "#8FD6F2", 0]]);
ramp("chip", [[0, "#EADFC6", 0], [.06, "#E2D4B4", 1], [.88, "#D6C6A0", 1], [1, "#C2B088", 0]]);
ramp("earth", [[0, "#B88A58", 0], [.06, "#A87C4E", 1], [.88, "#946A40", 1], [1, "#7A5634", 0]]);
ramp("steel.c", [[0, "#F0F4FA", 0], [.06, "#DCE4EE", 1], [.9, "#C4CEDC", 1], [1, "#AEB9C9", 0]]);
ramp("gold.c", [[0, "#FFE9A0", 0], [.06, "#FFD45A", 1], [.9, "#F0B830", 1], [1, "#D89A18", 0]]);
// a shadow ball: nearly black, deep violet, its rim lit violet by the shader
ramp("shadowball", [[0, "#3A1A5A", 0], [.08, "#2A1240", 1], [.85, "#22103A", 1], [1, "#22103A", 0]]);
ramp("magenta", [[0, "#FFFFFF", 0], [.06, "#FFE0F6", 1], [.25, "#FF5ADC", 1], [.7, "#B020C0", .6], [1, "#5A0A70", 0]]);
ramp("magenta.h", [[0, "#E23CCF", 0], [.12, "#E23CCF", 1], [.85, "#B43AE0", 1], [1, "#8A5CFF", 0]]);
ramp("moon", [[0, "#EAF4FF", 0], [.1, "#E2EEFF", 1], [.9, "#D2E2FF", 1], [1, "#D2E2FF", 0]]);
ramp("leaf.c", [[0, "#7ED957", 0], [.06, "#6CCB45", 1], [.88, "#4FAE34", 1], [1, "#3C8A28", 0]]);
ramp("toxic.c", [[0, "#C98AF0", 0], [.06, "#B46BE6", 1], [.88, "#9248CC", 1], [1, "#6E2AA8", 0]]);
ramp("glint", [[0, "#FFFFFF", 0], [.08, "#FFFFFF", 1], [.4, "#FFF6D8", .8], [1, "#FFFFFF", 0]]);
ramp("aurora.v", [[0, "#7FFFE0", 0], [.2, "#7FFFE0", .7], [.45, "#7FD8FF", .8], [.7, "#C8A0FF", .7], [.9, "#FFA8E8", .4], [1, "#FFA8E8", 0]]);
ramp("bar.gold", [[0, "#FFF6D0", 0], [.15, "#FFE89A", 1], [.85, "#FFD45A", 1], [1, "#FFD45A", 0]]);
ramp("bar.pink", [[0, "#FFF0FA", 0], [.15, "#FFD8F2", 1], [.85, "#F0B8FF", 1], [1, "#F0B8FF", 0]]);
const RAMP_ROWS = 128;
function buildRamps() {
  const W = 256, out = new Uint8Array(W * RAMP_ROWS * 4);
  RAMPS.forEach((stops, row) => {
    for (let x = 0; x < W; x++) {
      const t = x / (W - 1);
      let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
      const [t0, c0, a0] = stops[i], [t1, c1, a1] = stops[Math.min(i + 1, stops.length - 1)];
      const k = t1 > t0 ? clamp((t - t0) / (t1 - t0)) : 0, A = hex(c0), B = hex(c1), o = (row * W + x) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = lerp(A[c], B[c], k) * 255;
      out[o + 3] = lerp(a0, a1, k) * 255;
    }
  });
  return out;
}

/* ---------------------------------------------------------------- shaders ---------------------------------------------------------------- */
const PARTICLE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQ;
layout(location=1) in vec4 iA; layout(location=2) in vec4 iB; layout(location=3) in vec4 iC;
layout(location=4) in vec4 iD; layout(location=5) in vec4 iE; layout(location=6) in vec4 iF;
uniform mat3 uView; uniform float uTime, uLayer, uPass; uniform float uGroups[32]; uniform vec4 uWrap;
out vec2 vUv; out vec2 vQ; out float vK; flat out float vRamp; out float vAlpha; flat out vec4 vM; flat out float vField; flat out vec3 vLit;
void main(){
  int f = int(iE.w + .5);
  bool wrap = (f & 32) != 0;
  // a looping particle's colour starts over each life; a wrapping one keeps travelling (it never jumps back to where it began)
  float age = uTime - iB.w, life = iC.x, run = age;
  if ((f & 1) != 0 && age >= 0.) { age = mod(age, life); if (!wrap) run = age; }
  float layer = float((f >> 1) & 1); float dist = float((f >> 4) & 1);
  if (age < 0. || age > life || abs(layer - uLayer) > .5 || abs(dist - uPass) > .5) { gl_Position = vec4(3., 3., 3., 1.); return; }
  float t = run / 1000., k = age / life, d = iB.z;
  vec2 vel = iA.zw, acc = iB.xy, pos;
  if (d > 0. && (f & 128) == 0) { float e = exp(-d * t); pos = iA.xy + vel * (1. - e) / d + .5 * acc * t * t; vel = vel * e + acc * t; }
  else { pos = iA.xy + vel * t + .5 * acc * t * t; vel += acc * t; }
  // round the stage on both axes, turning over only once the whole of it is out of sight (a cloud is most of the stage wide)
  if (wrap) { float r = .5 * max(iC.y, iC.z) * max(iE.z, 1.); vec2 lo = uWrap.xz - r; pos = lo + mod(pos - lo, uWrap.yw + 2. * r); }
  if ((f & 128) != 0) { float ph = uTime / 1000. * 6.2832 / max(.1, iD.y) + iF.z * 6.2832; pos += vec2(cos(ph * .7) * .45, sin(ph)) * iB.z; }
  float kk = (f & 64) != 0 ? 1. - (1. - k) * (1. - k) : k;
  float size = mix(iC.y, iC.z, kk);
  float ang = iC.w + iD.x * t;
  vec2 q = aQ * vec2(size * iE.z, size) * .5;
  if ((f & 8) != 0) { ang = atan(vel.y, vel.x) + iC.w; q.x *= 1. + iD.y * length(vel) / 1000.; }
  float c = cos(ang), s = sin(ang);
  vec2 w = pos + vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = vec4((uView * vec3(w, 1.)).xy, 0., 1.);
  float tex = iD.z; vec2 cell = vec2(mod(tex, 8.), floor(tex / 8.));
  vUv = (cell + mix(vec2(.006), vec2(.994), aQ * .5 + .5)) / vec2(8., ${ROWS}.);
  vQ = vec2(c * aQ.x - s * aQ.y, s * aQ.x + c * aQ.y); vK = k; vRamp = (iD.w + .5) / ${RAMP_ROWS}.;
  vAlpha = iF.x * uGroups[int(iF.w + .5)];
  vM = vec4(iE.x, iE.y, iF.y, float((f >> 2) & 1));
  vField = iF.w > .5 ? 1. : 0.;
  // a lit thing: its turn (to turn its surface with it), which cell it is (its material), and whether it is lit at all
  vLit = vec3(ang, tex, float((f >> 8) & 1));
}`;
const PARTICLE_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vQ; in float vK; flat in float vRamp; in float vAlpha; flat in vec4 vM; flat in float vField; flat in vec3 vLit;
uniform sampler2D uAtlas, uRamp, uNormal; uniform float uLight, uPass; uniform vec4 uMat[${ROWS * GRID}];
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
void main(){
  vec4 a = texture(uAtlas, vUv); vec4 r = texture(uRamp, vec2(vK, vRamp));
  float m = a.r;
  if (vM.z > 0.) { float th = vM.z * pow(vK, 1.3); m *= smoothstep(th, th + .22, a.g * .8 + a.r * .2); }
  float al = m * r.a * vAlpha;
  if (uPass > .5) { vec2 dir = normalize(vQ + 1e-4); o0 = vec4(max(dir.x, 0.), max(-dir.x, 0.), max(dir.y, 0.), max(-dir.y, 0.)) * al; o1 = vec4(0.); return; }
  vec3 col = r.rgb + a.b * .3;
  if (vLit.z > .5) {
    // lit as the ball is: the light from the upper left in front, a soft fall-off, a highlight, a cool rim; the surface turns with the piece
    vec4 nn = texture(uNormal, vUv); vec4 mt = uMat[int(vLit.y + .5)];
    vec2 q = nn.xy * 2. - 1.; float cs = cos(vLit.x), sn = sin(vLit.x);
    vec3 n = normalize(vec3(cs * q.x - sn * q.y, sn * q.x + cs * q.y, sqrt(max(0., 1. - dot(q, q)))));
    vec3 L = normalize(vec3(-.55, -.62, .56)), H = normalize(L + vec3(0., 0., 1.));
    float diff = max(dot(n, L), 0.), spec = pow(max(dot(n, H), 0.), mt.y) * mt.x, rim = pow(1. - n.z, 2.6) * mt.w;
    // a soft thing (smoke, a billow of fire, mist; its highlight under 10) scatters light through itself and never goes dark
    float shade = mt.y < 9.5 ? .64 + .48 * diff : .36 + .8 * diff;
    col = r.rgb * shade * mix(.82, 1., nn.b) + spec + rim * mix(r.rgb, vec3(.78, .88, 1.), .55);
    // a see-through thing (a drop, a bubble, ice) is clear in its middle and solid at its edge; its highlight stays solid
    al *= mix(1., .3 + .7 * pow(1. - n.z, 1.4), mt.z);
    al = min(1., al + spec * m * r.a * vAlpha * mt.z);
  }
  float emis = vM.x, occ = mix(vM.y, max(vM.y, vM.w > .5 ? .25 : .6), uLight);
  col = mix(col, col * mix(1., .78, 1. - vM.y), uLight);
  o0 = vec4(col * al * max(emis, occ), al * occ);
  o1 = vec4(col * al * emis * (1. - .55 * uLight) * (1. - .85 * vField), al * occ * .6 * (1. - vField));
}`;
const STRIP_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aP; layout(location=1) in vec2 aUv; layout(location=2) in vec4 aC; layout(location=3) in vec4 aM;
uniform mat3 uView;
out vec2 vUv; out vec4 vC; flat out vec4 vM;
void main(){ gl_Position = vec4((uView * vec3(aP, 1.)).xy, 0., 1.); vUv = aUv; vC = aC; vM = aM; }`;
const STRIP_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vC; flat in vec4 vM;
uniform sampler2D uNoise; uniform float uTime, uLight;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
void main(){
  float v = vUv.y, mode = vM.x, core, prof;
  float n = texture(uNoise, vec2(vUv.x * vM.w - uTime * .0016, v * .5 + .5 + uTime * .0003)).r;
  if (mode < .5) { prof = exp(-v * v * 2.6) * (.55 + .9 * n); core = exp(-v * v * 26.) ; }
  else if (mode < 1.5) { prof = exp(-v * v * 5.) * .7; core = exp(-v * v * 60.); }
  else if (mode < 2.5) { prof = (1. - v * v) * (.75 + .5 * n); core = exp(-v * v * 9.) * .9; }
  else if (mode < 3.5) { float e = smoothstep(1., .55 - .35 * n, abs(v)); prof = e; core = e * smoothstep(.55, 1., n) * .8 + exp(-v * v * 12.) * .35; }
  else { prof = smoothstep(1., .9, abs(v)); core = 0.; }
  float al = clamp(prof + core, 0., 1.) * vC.a;
  // a white heart only on the dark stage: on paper it would vanish, so the line keeps its colour through
  // (2026-11-07 round 3: the heart is whitened to sixty percent, so a blade or a beam keeps its type's colour through its middle)
  vec3 col = mix(vC.rgb, vec3(1.), clamp(core, 0., 1.) * .6 * (1. - uLight));
  float emis = vM.y, occ = mix(vM.z, max(vM.z, .5), uLight);
  col = mix(col, col * .8, uLight * (1. - vM.z));
  o0 = vec4(col * al * max(emis, occ), al * occ);
  // a flat pane (a room's wall, a terrain's floor) is a surface, not a light: it never blooms over the Pokémon
  float bloom = mode > 3.5 ? 0. : 1.;
  o1 = vec4(col * al * emis * (1. - .55 * uLight) * bloom, al * occ * .6 * bloom);
}`;
const SPRITE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQ;
uniform mat3 uView, uModel;
out vec2 vUv; out vec2 vW;
void main(){ vec2 q = aQ * .5 + .5; vec3 w = uModel * vec3(q, 1.); vW = w.xy; gl_Position = vec4((uView * w).xy, 0., 1.); vUv = vec2(q.x, q.y); }`;
const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec2 vW;
uniform sampler2D uTex; uniform vec2 uTexel; uniform vec4 uUv;
uniform float uAlpha, uFlash, uGray, uBright, uClip, uFloor, uReflect, uDissolve;
uniform vec4 uTint, uRim; uniform sampler2D uNoise;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
float A(vec2 p){ return texture(uTex, p).a; }
void main(){
  if (vW.y > uClip || vW.y < uFloor) discard;
  vec2 uv = uUv.xy + vUv * uUv.zw;
  vec4 c = texture(uTex, uv);
  float rim = 0.;
  if (uRim.a > 0.) {
    float m = 0.; for (int i = 0; i < 8; i++) { float a = float(i) * .785398; m = max(m, A(uv + vec2(cos(a), sin(a)) * uTexel * 5.)); }
    rim = clamp(m - c.a, 0., 1.);
  }
  float l = dot(c.rgb, vec3(.3, .59, .11));
  c.rgb = mix(c.rgb, vec3(l), uGray) * uBright;
  c.rgb = mix(c.rgb, uTint.rgb * c.a, uTint.a);
  c.rgb += uFlash * c.a;
  if (uDissolve > 0.) { float n = texture(uNoise, vUv * 2.).r; float e = smoothstep(uDissolve, uDissolve + .08, n); c *= e; c.rgb += uRim.rgb * (1. - e) * step(n, uDissolve + .08) * c.a; }
  vec4 r = vec4(uRim.rgb, 1.) * rim * uRim.a;
  vec4 col = (c + r * (1. - c.a)) * uAlpha;
  if (uReflect > 0.) col *= uReflect * smoothstep(.35, 1., vUv.y);
  // the Pokémon covers the glow of what lies behind it, so no field's light blooms through its body
  // the rim lights its outline; its bloom stays a halo at the edge and never washes the body white (2026-11-07)
  o0 = col; o1 = vec4(r.rgb * uAlpha * .3 + c.rgb * min(uFlash, 1.) * .12 * uAlpha, col.a);
}`;
const FULL_VS = `#version 300 es
layout(location=0) in vec2 aQ; out vec2 vUv; void main(){ vUv = aQ * .5 + .5; gl_Position = vec4(aQ, 0., 1.); }`;
const DOWN_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; out vec4 o;
void main(){ vec2 h = uTexel * .5; vec4 s = texture(uTex, vUv) * 4.; s += texture(uTex, vUv - h); s += texture(uTex, vUv + h); s += texture(uTex, vUv + vec2(h.x, -h.y)); s += texture(uTex, vUv - vec2(h.x, -h.y)); o = s / 8.; }`;
const UP_FS = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; out vec4 o;
void main(){ vec2 h = uTexel; vec4 s = texture(uTex, vUv + vec2(-h.x * 2., 0.)); s += texture(uTex, vUv + vec2(-h.x, h.y)) * 2.; s += texture(uTex, vUv + vec2(0., h.y * 2.)); s += texture(uTex, vUv + vec2(h.x, h.y)) * 2.;
  s += texture(uTex, vUv + vec2(h.x * 2., 0.)); s += texture(uTex, vUv + vec2(h.x, -h.y)) * 2.; s += texture(uTex, vUv + vec2(0., -h.y * 2.)); s += texture(uTex, vUv + vec2(-h.x, -h.y)) * 2.; o = s / 12.; }`;
const COMP_FS = `#version 300 es
precision highp float; in vec2 vUv;
uniform sampler2D uScene, uBloom, uDist; uniform float uBloomK, uDistK, uCA, uVig, uSat, uFlashA, uHasDist; uniform vec3 uMul, uAdd, uFlash; uniform vec2 uAspect, uStep;
out vec4 o;
// the scene is finer than the screen: four bilinear taps across a screen pixel's footprint average it down (a box filter), so a line's
// edge is its true coverage, not a sample that steps
vec4 scene(vec2 p){ return (texture(uScene, p + vec2(-uStep.x, -uStep.y)) + texture(uScene, p + vec2(uStep.x, -uStep.y)) + texture(uScene, p + vec2(-uStep.x, uStep.y)) + texture(uScene, p + uStep)) * .25; }
void main(){
  vec2 uv = vUv;
  if (uHasDist > .5) { vec4 d = texture(uDist, vUv); uv += vec2(d.r - d.g, -(d.b - d.a)) * uDistK; }
  vec3 col;
  if (uCA > 0.) { vec2 dir = (uv - .5) * uCA; col = vec3(scene(uv + dir).r, scene(uv).g, scene(uv - dir).b); }
  else col = scene(uv).rgb;
  col += texture(uBloom, vUv).rgb * uBloomK;
  col = col * uMul + uAdd;
  float l = dot(col, vec3(.299, .587, .114)); col = mix(vec3(l), col, uSat);
  col = mix(col, uFlash, uFlashA);
  float v = length((vUv - .5) * uAspect); col *= 1. - uVig * smoothstep(.42, 1.05, v);
  o = vec4(col, 1.);
}`;

function compile(gl, vs, fs) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ""); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
function texture(gl, w, h, data = null, { filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE, format = gl.RGBA, internal = gl.RGBA8 } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return t;
}
function target(gl, w, h, n = 1) {
  const fb = gl.createFramebuffer(), tex = [];
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  for (let i = 0; i < n; i++) { tex.push(texture(gl, w, h)); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex[i], 0); }
  gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  return { fb, tex, w, h };
}

/* ---------------------------------------------------------------- the engine ---------------------------------------------------------------- */
const FLOATS = 24, CAP = 32768, FIELD_CAP = 8192;
// the camera holds the wide shot (2026-11-06: its pushes and pans read as dizzy); the lab can turn them back on to compare
export const CAMERA_MOVES = false;
const F = { loop: 1, front: 2, matter: 4, face: 8, distort: 16, wrap: 32, grow: 64, bob: 128, lit: 256 };
const ACTOR_KEYS = ["x", "y", "rot", "sx", "sy", "alpha", "flash", "gray", "bright", "tintR", "tintG", "tintB", "tintA", "rimR", "rimG", "rimB", "rimA", "clip", "ghost", "dissolve"];
const ACTOR_BASE = { x: 0, y: 0, rot: 0, sx: 1, sy: 1, alpha: 1, flash: 0, gray: 0, bright: 1, tintR: 1, tintG: 1, tintB: 1, tintA: 0, rimR: 1, rimG: 1, rimB: 1, rimA: 0, clip: 0, ghost: 0, dissolve: 0 };
const MULT = new Set(["alpha", "bright"]);
// a colour is set, not added (2026-11-07 round 3): added to the base (1, 1, 1) every rim and tint came out above one, white, which is
// why "tint makes the body white" and the rims read as white outlines; the amount of each stays in tintA and rimA
const ASSIGN = new Set(["clip", "fR", "fG", "fB", "tintR", "tintG", "tintB", "rimR", "rimG", "rimB"]);
const GRADE_BASE = { flashA: 0, fR: 1, fG: 1, fB: 1, mR: 1, mG: 1, mB: 1, aR: 0, aG: 0, aB: 0, sat: 1, ca: 0, vig: .55, dim: 1, bloom: 1, dist: 1 };

class Engine {
  constructor(stage) {
    this.stage = stage;
    const canvas = document.createElement("canvas");
    canvas.className = "bs-gl";
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("webgl2");
    stage.prepend(canvas);
    this.canvas = canvas; this.gl = gl;
    this.T = 0; this.R = 0; this.rate = 1; this.holdUntil = 0; this.slowRate = 1; this.slowUntil = 0;
    // the lab's controls: a slow-motion scale, a pause (the camera holds too), one step of game time while paused, a camera that stays wide
    this.scale = 1; this.paused = false; this.stepMs = 0; this.camFixed = !CAMERA_MOVES;
    this.light = document.documentElement.dataset.theme === "light" ? 1 : 0;
    this.lightK = this.light;
    this.actors = new Map();
    this.tweens = []; this.timers = []; this.strips = []; this.sprites = []; this.decals = [];
    this.grade = { ...GRADE_BASE }; this.gradeBase = { ...GRADE_BASE };
    this.groups = new Float32Array(32); this.groups[0] = 1;
    this.fxData = new Float32Array(CAP * FLOATS); this.head = 0; this.dirty = []; this.liveUntil = -1; this.distUntil = -1;
    this.fieldData = new Float32Array(FIELD_CAP * FLOATS); this.fieldCount = 0; this.fieldDirty = false;
    this.cam = { x: 0, y: 0, z: 1, r: 0, vx: 0, vy: 0, vz: 0, vr: 0, tx: 0, ty: 0, tz: 1, tr: 0, smooth: .35, trauma: 0, follow: null };
    this.setup();
    this.measure(true);
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(stage);
    this.mo = new MutationObserver(() => { const l = document.documentElement.dataset.theme === "light" ? 1 : 0; if (l !== this.light) { this.light = l; this.paint?.(); } });
    this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.last = performance.now();
    this.frame = requestAnimationFrame(t => this.tick(t));
  }

  setup() {
    const gl = this.gl;
    this.prog = {
      particle: compile(gl, PARTICLE_VS, PARTICLE_FS), strip: compile(gl, STRIP_VS, STRIP_FS), sprite: compile(gl, SPRITE_VS, SPRITE_FS),
      down: compile(gl, FULL_VS, DOWN_FS), up: compile(gl, FULL_VS, UP_FS), comp: compile(gl, FULL_VS, COMP_FS),
    };
    const atlas = buildAtlas();
    this.atlas = texture(gl, atlas.N, atlas.NH, atlas.out);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.normals = texture(gl, atlas.N, atlas.NH, atlas.nrm);
    gl.bindTexture(gl.TEXTURE_2D, this.normals); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.mats = new Float32Array(ROWS * GRID * 4); MATERIALS.forEach((m, i) => this.mats.set(m, i * 4));
    const nz = new Uint8Array(C * C); atlas.noise.forEach((v, i) => { nz[i] = v * 255; });
    this.noise = texture(gl, C, C, nz, { wrap: gl.REPEAT, format: gl.RED, internal: gl.R8 });
    this.ramps = texture(gl, 256, RAMP_ROWS, buildRamps());
    // the unit quad every sprite and particle is drawn on
    this.quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const instanced = cap => {
      const vao = gl.createVertexArray(), buf = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, cap * FLOATS * 4, gl.DYNAMIC_DRAW);
      for (let i = 0; i < 6; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, FLOATS * 4, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
      gl.bindVertexArray(null);
      return { vao, buf };
    };
    this.fxBuf = instanced(CAP); this.fieldBuf = instanced(FIELD_CAP);
    this.quadVao = gl.createVertexArray(); gl.bindVertexArray(this.quadVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    this.stripVao = gl.createVertexArray(); this.stripBuf = gl.createBuffer();
    gl.bindVertexArray(this.stripVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.stripBuf);
    [[0, 2, 0], [1, 2, 8], [2, 4, 16], [3, 4, 32]].forEach(([l, n, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 48, o); });
    gl.bindVertexArray(null);
    this.stripData = new Float32Array(12 * 6000);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  measure(first = false) {
    const st = this.stage, W = st.clientWidth || 1, H = st.clientHeight || 1;
    const changed = W !== this.W || H !== this.H;
    this.W = W; this.H = H;
    /* supersampled (2026-11-06: the court's lines looked jagged): the canvas matches the screen's own pixels one to one, and the scene
       is drawn finer than that (at least twice the CSS size, up to 3 on a phone, within 4 million pixels) and filtered down to it in
       the last pass. Before, the scene was drawn at 2 and the browser shrank the canvas to the screen (1.6 times at 125%), which
       sampled lines without filtering them and left their edges stepped */
    const device = Math.max(1, window.devicePixelRatio || 1);
    let dpr = Math.min(3, Math.max(2, device * 1.5));
    if (W * H * dpr * dpr > 4e6) dpr = Math.max(device, Math.sqrt(4e6 / (W * H)));
    this.dpr = dpr;
    const ow = Math.max(2, Math.round(W * device)), oh = Math.max(2, Math.round(H * device));
    const pw = Math.max(2, Math.round(W * dpr)), ph = Math.max(2, Math.round(H * dpr));
    if (pw !== this.sw || ph !== this.sh || ow !== this.canvas.width || oh !== this.canvas.height || first) {
      this.canvas.width = ow; this.canvas.height = oh;
      this.sw = pw; this.sh = ph;
      const gl = this.gl;
      [this.sceneRT, this.distRT, ...(this.mips || [])].forEach(rt => { if (rt) { gl.deleteFramebuffer(rt.fb); rt.tex.forEach(t => gl.deleteTexture(t)); } });
      this.sceneRT = target(gl, pw, ph, 2);
      this.distRT = target(gl, Math.max(2, pw >> 1), Math.max(2, ph >> 1));
      this.mips = [1, 2, 3, 4].map(i => target(gl, Math.max(2, pw >> i), Math.max(2, ph >> i)));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    if (changed || first) {
      if (first) { this.cam.x = this.cam.tx = W / 2; this.cam.y = this.cam.ty = H / 2; }
      else { this.cam.tx = this.cam.x = W / 2; this.cam.ty = this.cam.y = H / 2; this.cam.z = this.cam.tz = 1; }
      this.sync();
      this.paint?.();
    }
  }

  /* ---------- the clock ---------- */
  hold(ms) { if (reduced()) return; this.holdUntil = Math.max(this.holdUntil, this.R + ms); }
  slow(ms, rate = .5) { if (reduced()) return; this.slowRate = rate; this.slowUntil = this.R + ms; }
  // a callback on the game clock (it waits through a hit-stop and stretches in slow motion)
  at(ms, fn) { this.timers.push({ at: this.T + ms, fn }); }
  after(ms) { return new Promise(resolve => { let done = false; const end = () => { if (!done) { done = true; resolve(); } }; this.at(ms, end); this.untilGone(end, () => done); }); }
  // a promise on the game clock gives up only if the stage goes (a slow or paused clock is waited for); the check stops once it is done
  untilGone(fn, isDone) { const check = () => { if (isDone()) return; if (!this.stage.isConnected || this.disposed) fn(); else setTimeout(check, 500); }; setTimeout(check, 500); }

  tick(now) {
    if (!this.stage.isConnected) { this.dispose(); return; }
    this.frame = requestAnimationFrame(t => this.tick(t));
    const dt = Math.min(50, now - this.last);
    this.last = now;
    const paused = this.paused && !this.stepMs;
    if (!paused) this.R += dt;
    const held = this.R < this.holdUntil;
    const slow = this.R < this.slowUntil ? this.slowRate : 1;
    let gdt = paused || held ? 0 : dt * this.rate * slow * this.scale;
    if (this.paused && this.stepMs) { gdt = this.stepMs; this.stepMs = 0; }
    this.T += gdt;
    if (this.timers.length) { const due = this.timers.filter(t => t.at <= this.T); if (due.length) { this.timers = this.timers.filter(t => t.at > this.T); due.forEach(t => t.fn()); } }
    this.update(gdt, paused ? 0 : dt);
    this.render();
  }

  /* ---------- tweens: channels on an actor or the grade, keyframed, played on the game clock ---------- */
  // anim(target, { x: [0, 20, 0], flash: [0, 1, 0] }, { dur, ease, at: offsets, delay, fill })
  anim(target, chans, { dur = 400, ease = "out", at = null, delay = 0, fill = false, eases = null } = {}) {
    if (!target) return Promise.resolve();
    return new Promise(resolve => {
      const tw = { target, chans, dur: Math.max(1, dur), at, start: this.T + delay, ease: EASE[ease] || ease, eases, fill, resolve, done: false };
      this.tweens.push(tw);
      this.untilGone(() => { if (!tw.done) { tw.done = true; resolve(); } }, () => tw.done);
    });
  }
  cancel(target, keep = null) { this.tweens = this.tweens.filter(t => { const go = t.target === target && (!keep || !keep(t)); if (go && !t.done) { t.done = true; t.resolve(); } return !go; }); }
  sample(tw, key, p) {
    const vals = tw.chans[key], n = vals.length;
    if (n === 1) return vals[0];
    const at = tw.at || vals.map((_, i) => i / (n - 1));
    let i = 0; while (i < n - 2 && p > at[i + 1]) i++;
    const span = at[i + 1] - at[i] || 1, ease = tw.eases?.[i] ? EASE[tw.eases[i]] : tw.ease;
    return lerp(vals[i], vals[i + 1], ease(clamp((p - at[i]) / span)));
  }
  update(gdt, dt) {
    for (const a of this.actors.values()) { Object.assign(a.st, a.base); }
    Object.assign(this.grade, this.gradeBase);
    const keep = [];
    for (const tw of this.tweens) {
      const p = clamp((this.T - tw.start) / tw.dur);
      if (this.T < tw.start) { if (tw.fill === "both") this.apply(tw, 0); keep.push(tw); continue; }
      this.apply(tw, p);
      if (p >= 1) { if (!tw.done) { tw.done = true; tw.resolve(); } if (tw.fill) keep.push(tw); }
      else keep.push(tw);
    }
    this.tweens = keep;
    // the idle: each Pokémon breathes from its feet, never lifting off them
    for (const a of this.actors.values()) {
      const ph = (this.T / (a.own ? 3400 : 3800) + a.phase) * Math.PI * 2;
      a.breath = Math.sin(ph) * .5 + .5;
      if (a.trail) { a.hist.unshift([a.st.x, a.st.y, a.st.sx, a.st.sy, a.st.rot]); a.hist.length = Math.min(a.hist.length, 14); }
    }
    this.camera(dt / 1000);
    this.fieldTick?.(dt);
    this.lightK += (this.light - this.lightK) * Math.min(1, dt / 160);
  }
  apply(tw, p) {
    const o = tw.target.st || tw.target;
    for (const k in tw.chans) {
      const v = this.sample(tw, k, p);
      if (MULT.has(k)) o[k] *= v;
      else if (k === "sx" || k === "sy") o[k] *= v;
      else if (k in GRADE_BASE && (k[0] === "m" || k === "sat" || k === "dim" || k === "bloom")) o[k] *= v;
      else if (ASSIGN.has(k)) o[k] = v;
      else o[k] += v;
    }
  }

  /* ---------- the camera: a critically damped spring after its shot, a smooth shake over it ---------- */
  shot(x, y, z = 1, { smooth = .38, roll = 0 } = {}) {
    if (reduced() || this.camFixed && (z !== 1 || x !== this.W / 2)) return;
    Object.assign(this.cam, { tx: x, ty: y, tz: z, tr: roll, smooth, follow: null });
  }
  wide(smooth = .5) { this.shot(this.W / 2, this.H / 2, 1, { smooth }); }
  follow(fn, z, smooth = .16) { if (reduced() || this.camFixed) return; Object.assign(this.cam, { follow: fn, tz: z, smooth }); }
  shake(amount = .4) { if (reduced()) return; this.cam.trauma = Math.min(1, this.cam.trauma + amount); }
  kick(amount = .04) { if (reduced() || this.camFixed) return; this.cam.vz += amount * 6; }
  camera(dt) {
    const c = this.cam;
    if (c.follow) { const [x, y] = c.follow(); c.tx = x; c.ty = y; }
    const damp = (cur, vel, to, smooth) => { const w = 2 / Math.max(.02, smooth), x = w * dt, e = 1 / (1 + x + .48 * x * x + .235 * x * x * x), ch = cur - to, tmp = (vel + w * ch) * dt; return [to + (ch + tmp) * e, (vel - w * tmp) * e]; };
    [c.x, c.vx] = damp(c.x, c.vx, c.tx, c.smooth);
    [c.y, c.vy] = damp(c.y, c.vy, c.ty, c.smooth);
    [c.z, c.vz] = damp(c.z, c.vz, c.tz, c.smooth * .9);
    [c.r, c.vr] = damp(c.r, c.vr, c.tr, c.smooth);
    c.trauma = Math.max(0, c.trauma - dt * 1.5);
  }
  view() {
    const c = this.cam, W = this.W, H = this.H, R = this.R / 1000;
    const z = Math.max(1, c.z);
    // the view never shows past the arena's margin
    const M = .1, hw = W / 2 / z, hh = H / 2 / z;
    let x = clamp(c.x, hw - W * M, W * (1 + M) - hw), y = clamp(c.y, hh - H * M, H * (1 + M) - hh);
    const s = c.trauma * c.trauma * (this.camFixed ? .55 : 1), n = (a, b) => Math.sin(R * a) * .6 + Math.sin(R * b + 1.3) * .4;
    x += s * W * .022 * n(47, 61); y += s * H * .026 * n(53, 71);
    const roll = c.r + s * .02 * n(37, 43);
    const cs = Math.cos(roll) * z, sn = Math.sin(roll) * z;
    // world → clip: translate to the camera, roll and push, scale to clip, flip y
    const sx = 2 / W, sy = -2 / H;
    return new Float32Array([cs * sx, sn * sy, 0, -sn * sx, cs * sy, 0, (-x * cs + y * sn) * sx, (-x * sn - y * cs) * sy, 1]);
  }

  /* ---------- particles ---------- */
  // one particle per call of spec.make(i), or n of the spec's own randomised kind
  emit(spec) {
    const n = Math.max(0, Math.round(spec.n ?? 1));
    const field = spec.field;
    for (let i = 0; i < n; i++) {
      const s = spec.each ? { ...spec, ...spec.each(i, n) } : spec;
      let [x, y] = typeof s.at === "function" ? s.at(i, n) : s.at || [0, 0];
      if (s.r) { const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()); const [rx, ry] = Array.isArray(s.r) ? s.r : [s.r, s.r]; x += Math.cos(a) * rx * rr; y += Math.sin(a) * ry * rr; }
      let vx = 0, vy = 0;
      if (s.vel) [vx, vy] = typeof s.vel === "function" ? s.vel(i, n, x, y) : s.vel;
      else if (s.speed) { const a = (s.dir ?? 0) + (s.arc == null ? Math.random() * Math.PI * 2 : (Math.random() - .5) * s.arc), sp = pick(s.speed); vx = Math.cos(a) * sp; vy = Math.sin(a) * sp; }
      if (s.vj) { vx += rand(-s.vj, s.vj); vy += rand(-s.vj, s.vj); }
      const size = Array.isArray(s.size) ? s.size : [s.size ?? 20, s.size ?? 20];
      const s0 = pick(size[0]), s1 = size[1] === "same" ? s0 : pick(size[1]) * (s.keep ? s0 / pick(size[0]) : 1);
      const flags = (s.loop ? F.loop : 0) | (s.layer === 0 ? 0 : F.front) | (s.occ ? F.matter : 0) | (s.face ? F.face : 0) | (s.distort ? F.distort : 0) | (s.wrap ? F.wrap : 0) | (s.grow ? F.grow : 0) | (s.bob ? F.bob : 0) | (s.lit ? F.lit : 0);
      const life = pick(s.life ?? 600);
      // a looping particle is already part way through its life when it comes, so a field is full from its first frame
      const off = (s.over ? (s.even ? i / Math.max(1, n - 1) : Math.random()) * s.over : 0) + (s.stagger ? i * s.stagger : 0);
      const T = this.T + (s.delay || 0);
      const t0 = s.hold ? T - life * .5 : s.loop ? T - off : T + off;
      const rot = s.rot === "rand" ? Math.random() * Math.PI * 2 : s.rot ?? 0;
      const rec = [x, y, vx, vy, s.acc?.[0] || 0, s.acc?.[1] || 0, s.bob ? pick(s.bob) : s.drag || 0, t0, life, s0, s1, rot + (s.rj ? rand(-s.rj, s.rj) : 0),
        pick(s.spin ?? 0), s.bob ? pick(s.period ?? 3) : s.stretch || 0, TEX[s.tex || "glow"] ?? 0, RAMP[s.tint || s.ramp || "white"] ?? 0, s.emis ?? (s.occ ? 0 : 1), s.occ || 0, pick(s.aspect ?? 1), flags,
        pick(s.alpha ?? 1), s.erode || 0, Math.random(), s.group || 0];
      if (field) {
        if (this.fieldCount >= FIELD_CAP) break;
        this.fieldData.set(rec, this.fieldCount * FLOATS); this.fieldCount++; this.fieldDirty = true;
      } else {
        const at = this.head;
        this.fxData.set(rec, at * FLOATS);
        this.dirty.push(at);
        this.head = (this.head + 1) % CAP;
        const end = s.loop ? Infinity : t0 + life;
        if (end > this.liveUntil) this.liveUntil = end;
        if (s.distort && end > this.distUntil) this.distUntil = end;
      }
    }
  }
  clearField() { this.fieldCount = 0; this.fieldDirty = true; }
  strip(s) { s.born = this.T; this.strips.push(s); return s; }
  // a painted canvas as a texture (premultiplied, mipmapped): the field's decals and a move's thrown pieces share it
  texture(canvas) {
    const gl = this.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }
  // a decal: { tex, rect: [x, y, w, h] or T => [x, y, w, h, rot], group, alpha }, drawn on the floor behind the Pokémon
  decal(d) { this.decals.push(d); return d; }
  dropDecal(d) { const i = this.decals.indexOf(d); if (i >= 0) this.decals.splice(i, 1); if (!d.shared) this.gl.deleteTexture(d.tex); }

  /* ---------- the Pokémon ---------- */
  // what stands in each slot is read from the stage's DOM (Stage.jsx keeps it as layout and pick targets)
  sync() {
    const st = this.stage, box = st.getBoundingClientRect(), seen = new Set();
    for (const slot of st.querySelectorAll(".bs-slot[data-mon]")) {
      const key = slot.dataset.mon, mon = slot.querySelector(".bs-mon"), r = slot.getBoundingClientRect();
      const rect = { left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height };
      if (!mon) continue;
      seen.add(key);
      const img = mon.querySelector("img"), sub = mon.querySelector(".bs-sub");
      const src = sub ? subUrl(sub) : img?.getAttribute("src") || "";
      const name = mon.dataset.name || "";
      let a = this.actors.get(key);
      if (!a || a.name !== name) { if (a) this.drop(a); a = this.actor(key, name, slot.closest(".bs-side")?.classList.contains("own")); }
      a.rect = rect;
      if (src && src !== a.src) this.load(a, src);
    }
    for (const [key, a] of this.actors) if (!seen.has(key)) { this.drop(a); this.actors.delete(key); }
  }
  actor(key, name, own) {
    const a = { key, name, own, base: { ...ACTOR_BASE }, st: { ...ACTOR_BASE }, phase: Math.random(), hist: [], trail: false, tex: null, prev: null, rect: null, src: "" };
    this.actors.set(key, a);
    return a;
  }
  drop(a) { this.cancel(a); if (a.tex) this.gl.deleteTexture(a.tex); if (a.prev) this.gl.deleteTexture(a.prev); }
  load(a, src) {
    a.src = src;
    const img = new Image();
    img.decoding = "async";
    a.ready = new Promise(resolve => {
      img.onload = () => {
        if (a.src !== src) return resolve();
        const gl = this.gl;
        if (a.tex) gl.deleteTexture(a.tex);
        a.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        // an SVG (the doll) is drawn to a canvas at a size of its own first: it has no pixels until it is given some
        let pic = img;
        if (src.startsWith("data:") || !img.naturalWidth) { pic = document.createElement("canvas"); pic.width = 480; pic.height = 500; pic.getContext("2d").drawImage(img, 0, 0, 480, 500); }
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pic); } catch { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); return resolve(); }
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        a.iw = pic.width || img.naturalWidth; a.ih = pic.height || img.naturalHeight;
        a.ink = inkBox(pic);
        resolve();
      };
      img.onerror = () => resolve();
      setTimeout(resolve, 1500);
    });
    img.src = src;
  }
  // where a Pokémon is drawn in the world: its picture fitted in its slot, standing on the slot's floor
  placed(a) {
    const r = a.rect;
    if (!r || !a.iw) return null;
    const k = Math.min(r.width / a.iw, r.height / a.ih), w = a.iw * k, h = a.ih * k;
    return { x: r.left + (r.width - w) / 2, y: r.top + r.height - h, w, h, fx: r.left + r.width / 2, fy: r.top + r.height * .985 };
  }

  /* ---------- drawing ---------- */
  render() {
    const gl = this.gl, P = this.prog, view = this.view(), W = this.sw, H = this.sh;
    const g = this.grade, L = this.lightK;
    if (this.dirty.length) {
      // upload what changed since the last frame, in runs
      this.dirty.sort((a, b) => a - b);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fxBuf.buf);
      let s = this.dirty[0], p = s;
      const flush = (a, b) => gl.bufferSubData(gl.ARRAY_BUFFER, a * FLOATS * 4, this.fxData, a * FLOATS, (b - a + 1) * FLOATS);
      for (let i = 1; i < this.dirty.length; i++) { const v = this.dirty[i]; if (v === p || v === p + 1) { p = v; continue; } flush(s, p); s = p = v; }
      flush(s, p);
      this.dirty = [];
    }
    if (this.fieldDirty) { gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldBuf.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.fieldData, 0, Math.max(1, this.fieldCount) * FLOATS); this.fieldDirty = false; }
    const fxLive = this.T <= this.liveUntil;

    // 1. the scene: the arena, the floor, the Pokémon and every effect, with what glows written to a second target
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneRT.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.arena) this.drawQuad(this.arena.tex, this.arena.rect, view, { bright: g.dim });
    const sp = P.sprite;
    // reflections on the floor
    for (const a of this.ordered()) this.drawActor(a, view, true);
    // the field's painted pieces (a web on the floor, caltrops, a wall round a side), crisp at any size, behind the Pokémon;
    // a decal marked front (the foe's wall, glass between them and us) is drawn over them
    const decals = front => { for (const d of this.decals.slice()) {
      if (Boolean(d.front) !== front) continue;
      // a move's own decal (a stone in flight, a wall going up) ends at its time
      if (d.until && this.T > d.until) { this.dropDecal(d); continue; }
      const al = (typeof d.alpha === "function" ? d.alpha(this.T) : d.alpha ?? 1) * (d.group ? this.groups[d.group] : 1);
      if (al < .003) continue;
      const r = typeof d.rect === "function" ? d.rect(this.T) : d.rect;
      this.drawQuad(d.tex, r, view, { alpha: al, bright: g.dim, rot: r[4] || 0 });
    } };
    decals(false);
    const particles = (layer, pass = 0) => {
      const pp = P.particle;
      gl.useProgram(pp.p);
      gl.uniformMatrix3fv(pp.u.uView, false, view); gl.uniform1f(pp.u.uTime, this.T); gl.uniform1f(pp.u.uLayer, layer); gl.uniform1f(pp.u.uPass, pass);
      gl.uniform1fv(pp.u.uGroups, this.groups); gl.uniform4f(pp.u.uWrap, -this.W * .1, this.W * 1.2, -this.H * .1, this.H * 1.2); gl.uniform1f(pp.u.uLight, L);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas); gl.uniform1i(pp.u.uAtlas, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.ramps); gl.uniform1i(pp.u.uRamp, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.normals); gl.uniform1i(pp.u.uNormal, 2);
      if (pp.u.uMat) gl.uniform4fv(pp.u.uMat, this.mats);
      if (this.fieldCount) { gl.bindVertexArray(this.fieldBuf.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.fieldCount); }
      if (fxLive || pass) { gl.bindVertexArray(this.fxBuf.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, CAP); }
      gl.bindVertexArray(null);
    };
    this.drawStrips(view, 0, true);
    particles(0);
    this.drawStrips(view, 0);
    for (const a of this.ordered()) this.drawActor(a, view, false);
    decals(true);
    particles(1);
    this.drawStrips(view, 1);
    if (this.sprites.length) this.sprites = this.sprites.filter(sp2 => { const o = sp2.at(this.T); if (!o) return false; this.drawQuad(o.tex || sp2.tex, [o.x - o.w / 2, o.y - o.h / 2, o.w, o.h], view, { alpha: o.alpha ?? 1, rot: o.rot || 0, flash: o.flash || 0 }); return true; });
    void sp;

    // 2. distortion: shockwaves and heat bend the picture
    const hasDist = this.T <= this.distUntil || this.fieldDistort;
    if (hasDist) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.distRT.fb); gl.viewport(0, 0, this.distRT.w, this.distRT.h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.blendFunc(gl.ONE, gl.ONE);
      particles(0, 1); particles(1, 1);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    // 3. bloom from the glow target: halved four times and added back up
    gl.disable(gl.BLEND);
    let src = this.sceneRT.tex[1], sw = W, sh = H;
    for (const m of this.mips) { this.pass(P.down, m, src, [1 / sw, 1 / sh]); src = m.tex[0]; sw = m.w; sh = m.h; }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.mips.length - 1; i > 0; i--) this.pass(P.up, this.mips[i - 1], this.mips[i].tex[0], [1 / this.mips[i].w, 1 / this.mips[i].h]);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.BLEND);

    // 4. the picture: the scene bent by the distortion, the bloom over it, the grade and the vignette
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const c = P.comp; gl.useProgram(c.p);
    // the filter's reach: a screen pixel covers this many scene pixels, sampled across that whole footprint
    gl.uniform2f(c.u.uStep, .25 / this.canvas.width, .25 / this.canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneRT.tex[0]); gl.uniform1i(c.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.mips[0].tex[0]); gl.uniform1i(c.u.uBloom, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.distRT.tex[0]); gl.uniform1i(c.u.uDist, 2);
    gl.uniform1f(c.u.uBloomK, g.bloom * lerp(.62, .4, L)); gl.uniform1f(c.u.uDistK, .045 * g.dist); gl.uniform1f(c.u.uHasDist, hasDist ? 1 : 0);
    gl.uniform1f(c.u.uCA, g.ca); gl.uniform1f(c.u.uVig, 0); gl.uniform1f(c.u.uSat, g.sat);
    gl.uniform3f(c.u.uMul, g.mR, g.mG, g.mB); gl.uniform3f(c.u.uAdd, g.aR, g.aG, g.aB); gl.uniform3f(c.u.uFlash, g.fR, g.fG, g.fB); gl.uniform1f(c.u.uFlashA, clamp(g.flashA));
    gl.uniform2f(c.u.uAspect, 1, this.H / this.W);
    gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    if (this.onRender) { const f = this.onRender; this.onRender = null; f(this.canvas); }
  }
  pass(prog, dst, src, texel) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h);
    if (!gl.isEnabled(gl.BLEND)) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.useProgram(prog.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(prog.u.uTex, 0); gl.uniform2f(prog.u.uTexel, texel[0], texel[1]);
    gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
  }
  ordered() { return [...this.actors.values()].filter(a => a.tex && a.rect).sort((a, b) => a.rect.top + a.rect.height - (b.rect.top + b.rect.height)); }
  spriteUniforms(o) {
    const gl = this.gl, u = this.prog.sprite.u;
    gl.uniform1f(u.uAlpha, o.alpha ?? 1); gl.uniform1f(u.uFlash, o.flash ?? 0); gl.uniform1f(u.uGray, o.gray ?? 0); gl.uniform1f(u.uBright, o.bright ?? 1);
    gl.uniform1f(u.uClip, o.clip ?? 1e9); gl.uniform1f(u.uFloor, o.floor ?? -1e9); gl.uniform1f(u.uReflect, o.reflect ?? 0); gl.uniform1f(u.uDissolve, o.dissolve ?? 0);
    gl.uniform4fv(u.uTint, o.tint || [1, 1, 1, 0]); gl.uniform4fv(u.uRim, o.rim || [1, 1, 1, 0]);
    gl.uniform4fv(u.uUv, o.uv || [0, 0, 1, 1]); gl.uniform2f(u.uTexel, o.texel?.[0] || .002, o.texel?.[1] || .002);
  }
  drawQuad(tex, [x, y, w, h], view, o = {}) {
    const gl = this.gl, sp = this.prog.sprite;
    gl.useProgram(sp.p); gl.uniformMatrix3fv(sp.u.uView, false, view);
    const r = o.rot || 0, c = Math.cos(r), n = Math.sin(r), cx = x + w / 2, cy = y + h / 2;
    gl.uniformMatrix3fv(sp.u.uModel, false, new Float32Array([c * w, n * w, 0, -n * h, c * h, 0, cx - (c * w - n * h) / 2, cy - (n * w + c * h) / 2, 1]));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(sp.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.noise); gl.uniform1i(sp.u.uNoise, 1);
    this.spriteUniforms(o);
    gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
  }
  drawActor(a, view, reflect) {
    const p = this.placed(a);
    if (!p) return;
    const s = a.st, gl = this.gl, sp = this.prog.sprite;
    if (s.alpha <= .002) return;
    const breathe = a.breath * .014, flip = a.own ? -1 : 1;
    const model = (st, mirror) => {
      // about the feet: push, turn, then scale; the picture's own box is the unit quad
      const sx = st.sx * (1 - breathe * .35) * flip, sy = st.sy * (1 + breathe) * (mirror ? -1 : 1), c = Math.cos(st.rot), n = Math.sin(st.rot);
      const ox = p.x - p.fx, oy = p.y - p.fy;
      const ax = p.w * sx, by = p.h * sy;
      // columns: x axis, y axis, origin
      return new Float32Array([c * ax, n * ax, 0, -n * by, c * by, 0, p.fx + st.x + (c * ox * sx - n * oy * sy), p.fy + st.y * (mirror ? -1 : 1) + (n * ox * sx + c * oy * sy), 1]);
    };
    gl.useProgram(sp.p); gl.uniformMatrix3fv(sp.u.uView, false, view);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex); gl.uniform1i(sp.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.noise); gl.uniform1i(sp.u.uNoise, 1);
    const texel = [1 / (a.iw || 256), 1 / (a.ih || 256)];
    const tint = [s.tintR, s.tintG, s.tintB, s.tintA], rim = [s.rimR, s.rimG, s.rimB, s.rimA];
    const clip = s.clip ? p.fy + 1 : 1e9;
    gl.bindVertexArray(this.quadVao);
    if (reflect) {
      if (s.y < -p.h * .5) return;
      gl.uniformMatrix3fv(sp.u.uModel, false, model(s, true));
      this.spriteUniforms({ alpha: s.alpha * (1 - s.dissolve), flash: s.flash * .5, gray: s.gray, bright: s.bright * this.grade.dim, tint, texel, floor: p.fy - 1, reflect: lerp(.3, .16, this.lightK) * Math.max(0, 1 + s.y / (p.h * .5)) });
    } else {
      if (s.ghost > 0 && a.hist.length > 4) {
        // (round 3: two copies, fainter; three heavy copies read as a smudge behind every dash)
        for (const [i, k] of [[4, .2], [9, .08]]) {
          const h = a.hist[Math.min(i, a.hist.length - 1)];
          gl.uniformMatrix3fv(sp.u.uModel, false, model({ ...s, x: h[0], y: h[1], sx: h[2], sy: h[3], rot: h[4] }, false));
          // the copies a dash leaves are coloured by the move's type and stay dim (pale white copies read as a raw blur, 2026-11-07)
          this.spriteUniforms({ alpha: s.alpha * k * s.ghost * .85, flash: .08, bright: 1, tint: [...hex(a.ghostColor || "#BFD8FF").slice(0, 3), .7], texel, clip });
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }
      gl.uniformMatrix3fv(sp.u.uModel, false, model(s, false));
      this.spriteUniforms({ alpha: s.alpha, flash: s.flash, gray: s.gray, bright: s.bright * (a.lit ? 1 : this.grade.dim), tint, rim, texel, clip, dissolve: s.dissolve });
    }
    gl.bindVertexArray(this.quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
  }
  // layer 0: behind the Pokémon (a room's walls, a floor's lines), 1: over them (a beam, a slash)
  // under: the strips drawn before the layer's particles (a weather's air), so its rain and snow fall in front of it
  drawStrips(view, layer = 1, under = false) {
    if (!this.strips.length) return;
    const out = this.stripData; let n = 0;
    const keep = [];
    for (const s of this.strips) {
      const age = this.T - s.born - (s.delay || 0);
      if (age < 0) { keep.push(s); continue; }
      const k = s.dur === Infinity ? 0 : age / s.dur;
      if (k > 1 || s.dead) { s.end?.(); continue; }
      keep.push(s);
      if ((s.layer ?? 1) !== layer || Boolean(s.under) !== under) continue;
      if (s.quad) {
        const q = s.quad(k, age);
        if (!q) continue;
        // a weather's air (s.dims) dims with the arena's lamps, as the ground under it does
        const d = s.dims ? this.grade.dim : 1, [r, g, b] = hex(s.color || "#FFFFFF").map(c => c * d), al = s.alpha ?? 1, v = [q[0], q[1], q[3], q[2]];
        if (n) { out.set(out.subarray((n - 1) * 12, n * 12), n * 12); n++; out.set([v[0][0], v[0][1], 0, 0, r, g, b, al, 4, s.emis ?? 1, s.occ || 0, 1], n * 12); n++; }
        for (const [x, y] of v) { out.set([x, y, 0, 0, r, g, b, al, 4, s.emis ?? 1, s.occ || 0, 1], n * 12); n++; }
        out.set(out.subarray((n - 1) * 12, n * 12), n * 12); n++;
        continue;
      }
      const pts = s.points(k, age);
      if (!pts || pts.length < 2) continue;
      const [r, g, b] = hex(s.color || "#FFFFFF"), mode = s.mode || 0, emis = s.emis ?? 1, occ = s.occ || 0, tile = s.tile || 1;
      let len = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x, y, w, al = 1] = pts[i], [px, py] = pts[Math.max(0, i - 1)], [qx, qy] = pts[Math.min(pts.length - 1, i + 1)];
        if (i) len += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
        let dx = qx - px, dy = qy - py; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const nx = -dy * w / 2, ny = dx * w / 2, u = s.uLen ? len / s.uLen : i / (pts.length - 1);
        const alpha = al * (s.alpha ?? 1);
        if (i === 0 && n > 0) { out.set(out.subarray((n - 1) * 12, n * 12), n * 12); n++; out.set([x + nx, y + ny, u, -1, r, g, b, alpha, mode, emis, occ, tile], n * 12); n++; }
        out.set([x + nx, y + ny, u, -1, r, g, b, alpha, mode, emis, occ, tile], n * 12); n++;
        out.set([x - nx, y - ny, u, 1, r, g, b, alpha, mode, emis, occ, tile], n * 12); n++;
        if (n > 5900) break;
      }
      // a degenerate join to the next strip
      if (n) { out.set(out.subarray((n - 1) * 12, n * 12), n * 12); n++; }
    }
    this.strips = keep;
    if (n < 4) return;
    const gl = this.gl, P = this.prog.strip;
    gl.useProgram(P.p); gl.uniformMatrix3fv(P.u.uView, false, view); gl.uniform1f(P.u.uTime, this.T); gl.uniform1f(P.u.uLight, this.lightK);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.noise); gl.uniform1i(P.u.uNoise, 0);
    gl.bindVertexArray(this.stripVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.stripBuf); gl.bufferData(gl.ARRAY_BUFFER, out.subarray(0, n * 12), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, n); gl.bindVertexArray(null);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.disposed = true;
    this.ro?.disconnect(); this.mo?.disconnect();
    this.tweens.forEach(t => { if (!t.done) { t.done = true; t.resolve(); } });
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    if (this.stage.__gl === this) this.stage.__gl = null;
  }
}

// the substitute doll is a CSS background (battle-stage.css); its data URL is drawn as the picture
function subUrl(el) { const m = getComputedStyle(el).backgroundImage.match(/url\("?(.+?)"?\)$/); return m ? m[1].replace(/\\"/g, "\"") : ""; }
// the box of a picture's ink (its non-transparent pixels), as shares of the picture: effects aim at the body, not the empty frame
function inkBox(img) {
  try {
    const n = 64, c = document.createElement("canvas"); c.width = n; c.height = n;
    const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data; let x0 = n, y0 = n, x1 = 0, y1 = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[(y * n + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return x1 > x0 ? [x0 / n, y0 / n, (x1 + 1) / n, (y1 + 1) / n] : [0, 0, 1, 1];
  } catch { return [0, 0, 1, 1]; }
}

export function glOf(stage) {
  if (!stage) return null;
  if (stage.__gl === false) return null;
  if (!stage.__gl || !stage.contains(stage.__gl.canvas)) {
    try { stage.__gl = new Engine(stage); stage.classList.add("bs-on-gl"); stage.__gl.onReady?.(); for (const fn of ON_CREATE) fn(stage.__gl); }
    catch (err) { console.warn("battle stage: WebGL2 unavailable", err); stage.__gl = false; stage.classList.add("bs-nogl"); return null; }
  }
  return stage.__gl;
}
const ON_CREATE = [];
export const onEngine = fn => { ON_CREATE.push(fn); };
export { F as FLAGS };
