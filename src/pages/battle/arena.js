/* 경기장과 필드 (DESIGN.md "Battle", The stage). 경기장은 한 번 그려 두는 그림이다(크기나 테마가 바뀌면 다시): 홈페이지의 색으로
   칠한 단정한 경기장, 다크는 남색, 라이트는 종이색과 남색 선. 움직이는 장식은 없다.
   필드에 남는 것은 GPU의 반복 파티클과 선(리본)이고, 묶음마다 천천히 켜지고 꺼진다. 원칙은 하나다: 포켓몬의 형체가 늘 먼저다.
   날씨와 필드는 대부분 포켓몬 뒤(바닥과 배경)에 그리고, 앞에 오는 것은 가늘고 옅다. 룸은 코트와 같은 원근의 상자다. */
import { onEngine, rand, lerp, clamp } from "./gl.js";

/* ---------- the court's perspective: one camera for the floor, the walls and a room ---------- */
const VP = .282; // where the court's lines meet (a share of the stage's height)
// a point in the court's space: X across (the side lines at ±1), Y up from the floor, Z away from the camera; on the stage in pixels
export const P3 = (W, H, X, Y, Z) => [W * (.5 + 1.623 * X / Z), H * (VP + (1 - Y) / Z)];
const depth = t => lerp(7.25, .95, t);
// a point on the floor: across (-1 the left side line, 1 the right) and depth (0 the far line, 1 under the camera)
export const floorAt = (W, H, u, t) => P3(W, H, u, 0, depth(t));
// how much a flat thing on the floor is squashed at a height y of the stage (far things flatter)
export const flatAt = (H, y) => clamp(.18 + (y / H - .42) * .55, .16, .5);

/* ---------------------------------------------------------------- the arena ---------------------------------------------------------------- */
/* the site's own tones (tokens.css), one to a theme: the arena is a single solid ground with the court's lines on it, nothing else
   (2026-11-06, the user: the club's wing on the floor and the near-alike bands of sky, wall, floor and court read as smudges) */
const PALETTE = {
  dark: { ground: "#081C3D", line: "rgba(214,226,245,.55)", soft: "rgba(214,226,245,.26)" },
  light: { ground: "#F3F5F8", line: "rgba(8,28,61,.42)", soft: "rgba(8,28,61,.2)" },
};

function paint(e) {
  const { W, H } = e, P = e.light ? PALETTE.light : PALETTE.dark;
  /* painted past the stage on every side by more than the camera ever shows (its pan stops a tenth past the edge, and a shake goes
     a little further: at a tenth the edge of the picture showed as a dark strip). Drawn finer than the screen, so the lines stay
     crisp when the camera pushes in */
  const MX = W * .2, MY = H * .2;
  const s = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 1.6), Math.sqrt(6e6 / (W * H * 1.96)));
  const c = document.createElement("canvas");
  c.width = Math.round((W + MX * 2) * s); c.height = Math.round((H + MY * 2) * s);
  const g = c.getContext("2d");
  g.setTransform(s, 0, 0, s, MX * s, MY * s);
  const L = -MX, R = W + MX, T = -MY, B = H + MY;
  g.fillStyle = P.ground; g.fillRect(L, T, R - L, B - T);
  /* the court (remade 2026-11-06, the user: keep the plain board and its lines, only less bare, and never stands or crowds): still one
     solid ground with nothing but lines on it, now drawn as a Pokémon battle court is marked. A double side line, a double far line,
     the centre line through a Poké Ball (its circle, the band, the button), the far side's box where its Pokémon stand, quarter ticks,
     and the far edge of the floor as one line across the whole width. Every line thins with distance, as a painted line on a floor
     does, and the secondary marks are a step dimmer than the court's own */
  g.lineCap = "round"; g.lineJoin = "round";
  const lw = Math.max(1.5, W / 520), ZF = 7.25, ZN = .8;
  // a line on the floor through court points [X, Z], each piece as wide as its distance allows
  const floorLine = (pts, w, color = P.line) => {
    g.strokeStyle = color;
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], z = (z0 + z1) / 2, [ax, ay] = P3(W, H, x0, 0, z0), [bx, by] = P3(W, H, x1, 0, z1);
      g.lineWidth = w * clamp(Math.pow(2.6 / z, .55), .55, 1.5); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
  };
  const run = (x0, z0, x1, z1, n = 32) => Array.from({ length: n + 1 }, (_, i) => [lerp(x0, x1, i / n), lerp(z0, z1, i / n)]);
  const ring = (R0, cz = 4.1, a0 = 0, a1 = Math.PI * 2, n = 96) => Array.from({ length: n + 1 }, (_, i) => { const th = lerp(a0, a1, i / n); return [Math.cos(th) * R0, cz + Math.sin(th) * R0]; });
  const soft = P.soft;
  // the floor's far edge, across the whole picture
  floorLine(run(-9, 10.5, 9, 10.5, 8), lw * .8, soft);
  // the side lines and their outer partners, the far line and its partner joining them
  for (const sx of [-1, 1]) { floorLine(run(sx, ZF, sx, ZN), lw); floorLine(run(sx * 1.1, ZF + .55, sx * 1.1, ZN), lw * .75, soft); }
  floorLine(run(-1, ZF, 1, ZF, 8), lw); floorLine(run(-1.1, ZF + .55, 1.1, ZF + .55, 8), lw * .75, soft);
  // the centre line through the Poké Ball: its circle, the band broken at the button, the button's two rings
  const C0 = 4.1, RB = .34, RBTN = .12;
  floorLine(run(-1, C0, -RBTN, C0, 16), lw * .9); floorLine(run(RBTN, C0, 1, C0, 16), lw * .9);
  floorLine(ring(RB), lw * .9); floorLine(ring(RBTN), lw * .8); floorLine(ring(RBTN * .5, C0, 0, Math.PI * 2, 48), lw * .6, soft);
  // the far side's box where its Pokémon stand, on the far line (the near one would run out of the picture as a band)
  floorLine([[-.62, ZF], [-.62, 5.55], [.62, 5.55], [.62, ZF]].flatMap((p, i, a) => (i ? run(...a[i - 1], ...p, 12).slice(1) : [p])), lw * .7, soft);
  // quarter ticks on the side lines, turned in
  for (const z of [5.55, 2.65]) for (const sx of [-1, 1]) floorLine(run(sx, z, sx * .9, z, 2), lw * .8);

  const gl = e.gl;
  if (e.arena?.tex) gl.deleteTexture(e.arena.tex);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  e.arena = { tex, rect: [L, T, R - L, B - T] };
  rebuild(e, true);
}

/* ---------------------------------------------------------------- what lives on the stage ---------------------------------------------------------------- */
// a side's place on the stage, from its slots: left, right, the top of its tallest picture, its floor
const SIDE_OF = (e, own) => {
  const box = e.stage.getBoundingClientRect(), rs = [...e.stage.querySelectorAll(`.bs-side.${own ? "own" : "foe"} .bs-slot`)].map(s => s.getBoundingClientRect());
  if (!rs.length) return own ? { l: e.W * .1, r: e.W * .6, top: e.H * .35, bot: e.H * .95 } : { l: e.W * .45, r: e.W * .85, top: e.H * .12, bot: e.H * .5 };
  return { l: Math.min(...rs.map(r => r.left)) - box.left, r: Math.max(...rs.map(r => r.right)) - box.left, top: Math.min(...rs.map(r => r.top)) - box.top, bot: Math.max(...rs.map(r => r.bottom)) - box.top };
};
// the size a thing is drawn at on this stage (shapes are tuned on an 800-wide stage)
const unit = e => clamp(e.W / 800, .55, 1.6);

const BUILD = {
  /* ---------- weather: behind the Pokémon, and only fine and faint where it passes in front ---------- */
  /* 2026-11-06 remake, from 포켓몬 챔피언스 (each checked against its frames): rain is thin and straight, the sun is shafts of light
     with no disc in the sky, a sandstorm is a pale haze full of fine grains, snow is a gentle fall of white */
  rain(e, E, heavy) {
    // thin straight lines of rain falling plumb, sparse, mostly behind the Pokémon; small crowns of splash and glints on the floor
    const { W, H } = e, U = unit(e), ramp = e.light ? "rain.l" : "rain";
    for (const [n, far] of [[heavy ? 200 : 130, true], [heavy ? 70 : 45, false]]) {
      const v = far ? 1500 : 1900, life = H * 1.3 / v * 1000;
      E({ n, at: () => [rand(-.05, 1.05) * W, -H * .15], vel: () => [-v * .03, v * rand(.95, 1.05)], tex: "streak", ramp, size: [(far ? 1.6 : 2) * U * (e.light ? 1.3 : 1), (far ? 1.6 : 2) * U * (e.light ? 1.3 : 1)], aspect: far ? 26 : 34, face: true, life, loop: true, over: life, alpha: far ? .8 : .55, emis: e.light ? .15 : .6, occ: e.light ? .6 : .15, layer: far ? 0 : 1 });
    }
    E({ n: 70, at: () => floorAt(W, H, rand(-1.5, 1.5), rand(.02, 1.05)), tex: "ring", ramp: "white", size: [2 * U, 12 * U], aspect: 2.8, life: [280, 420], loop: true, over: 600, alpha: e.light ? .6 : .4, emis: e.light ? 0 : .6, occ: e.light ? .4 : 0, layer: 0, grow: true });
    E({ n: 50, at: () => floorAt(W, H, rand(-1.4, 1.4), rand(.05, 1)), tex: "drop", lit: true, ramp: e.light ? "rain.l" : "water.l", vel: () => [rand(-25, 25), -rand(60, 110)], acc: [0, 600], face: true, rot: -Math.PI / 2, aspect: .72, size: [3 * U, 2 * U], life: [240, 360], loop: true, over: 400, alpha: .7, emis: .4, occ: .6, layer: 0 });
    E({ n: 16, at: () => floorAt(W, H, rand(-1.3, 1.3), rand(.05, 1)), tex: "glint", ramp: "glint", size: [2, 9 * U], life: [400, 700], loop: true, over: 900, alpha: .5, layer: 0, grow: true });
  },
  sun(e, E, harsh) {
    // harsh sunlight: broad soft shafts of warm light slanting down from the upper left across the field, motes turning in them,
    // and the whole picture warmed; no sun is drawn in the sky
    const { W, H } = e, U = unit(e);
    for (let i = 0; i < 7; i++) {
      const ang = .72 + (i - 3) * .07, len = H * 1.9, x0 = -W * .1 + i * W * .07, y0 = -H * .15, wide = W * rand(.05, .11);
      E({ at: [x0 + Math.cos(ang) * len / 2, y0 + Math.sin(ang) * len / 2], tex: "glow", ramp: "sunlit", size: [wide, wide], aspect: len / wide, rot: ang, life: 5200 + i * 900, loop: true, over: 6000, alpha: (harsh ? .3 : .24) * (i % 2 ? .7 : 1), emis: e.light ? .4 : .85, occ: e.light ? .2 : 0, layer: 0 });
    }
    E({ at: [W * .05, -H * .1], tex: "glow", ramp: e.light ? "gold" : "sunray", size: [W * .9, W * .9], hold: true, life: 1e7, loop: true, alpha: harsh ? .55 : .42, emis: e.light ? .5 : .9, occ: e.light ? .25 : 0, layer: 0 });
    E({ n: 36, at: () => [rand(0, .8) * W, rand(.05, .9) * H], tex: "glow", ramp: "gold", size: [3 * U, 1], vel: () => [rand(-6, 6), rand(-20, -8)], bob: [4, 10], period: [3, 6], life: [3000, 5000], loop: true, over: 5000, alpha: .5, layer: 0 });
  },
  sand(e, E) {
    // the stadium seen through a pale haze of sand, fine bright grains drifting through it on the wind
    const { W, H } = e, U = unit(e);
    e.extra.push(e.strip({ dur: Infinity, quad: () => [[-W * .2, -H * .2], [W * 1.2, -H * .2], [W * 1.2, H * 1.2], [-W * .2, H * 1.2]], color: e.light ? "#E2C68A" : "#D9B878", emis: 0, occ: 1, alpha: e.light ? .16 : .22, layer: 1 }));
    for (const [n, layer, a] of [[170, 0, .85], [70, 1, .65]]) E({ n, at: () => [rand(-.1, 1.1) * W, rand(-.05, 1.05) * H], vel: () => [rand(90, 170), rand(-14, 14)], tex: "dot", ramp: e.light ? "sand" : "glint", size: [[1.6 * U, 3 * U], "same"], bob: [6, 14], period: [2, 4], life: [5000, 8000], loop: true, over: 8000, wrap: true, alpha: a, occ: e.light ? .6 : 0, emis: .7, layer });
    E({ n: 6, at: () => [rand(0, 1) * W, rand(.15, .6) * H], tex: "cloud", ramp: "dust.c", size: [W * .5, W * .5], aspect: 2, vel: () => [rand(60, 110), 0], wrap: true, life: [9000, 12000], loop: true, over: 12000, alpha: .2, occ: .4, emis: .05, layer: 0 });
  },
  snow(e, E, hail) {
    // white snow falling gently and sparsely in the cool air; hail is small pellets of ice falling fast
    const { W, H } = e, U = unit(e), ramp = e.light ? "ice.h" : "snow";
    if (hail) E({ n: 90, at: () => [rand(-.1, 1.2) * W, -H * .1], vel: () => [-60, rand(620, 760)], tex: "crystal", lit: true, ramp: "ice.c", size: [4 * U, 4 * U], aspect: .8, face: true, rot: Math.PI / 2, life: H * 1.25 / 690 * 1000, loop: true, over: 1800, alpha: .7, emis: .4, occ: .7, layer: 1 });
    else {
      E({ n: 70, at: () => [rand(-.1, 1.1) * W, -H * .08], vel: () => [rand(-14, 8), rand(60, 100)], tex: "dot", ramp, size: [[2.6 * U, 4 * U], "same"], bob: [6, 14], period: [2.4, 4], life: [9000, 13000], loop: true, over: 13000, alpha: .85, emis: .5, occ: .35, layer: 1 });
      E({ n: 120, at: () => [rand(-.1, 1.1) * W, -H * .08], vel: () => [rand(-12, 6), rand(40, 64)], tex: "dot", ramp, size: [1.8 * U, 1.8 * U], bob: [5, 10], period: [3, 5], life: [16000, 24000], loop: true, over: 24000, alpha: .65, emis: .5, occ: .3, layer: 0 });
    }
    E({ n: 6, at: () => [rand(0, 1) * W, rand(.4, .5) * H], tex: "cloud", ramp: "steam", size: [W * .5, W * .5], aspect: 3, vel: () => [rand(10, 22), 0], wrap: true, life: 20000, loop: true, over: 20000, alpha: .18, occ: .3, emis: .2, layer: 0 });
  },
  wind(e, E) {
    const { W, H } = e;
    E({ n: 40, at: () => [rand(-.1, 1.1) * W, rand(0, 1) * H], vel: () => [rand(1400, 1900), rand(-60, 60)], tex: "streak", ramp: e.light ? "flying.h" : "white", size: [1.4, 1.4], aspect: [20, 40], face: true, life: [700, 1100], loop: true, over: 1100, wrap: true, alpha: .2, layer: 0 });
  },
  /* ---------- terrain: the floor takes the colour and a quiet life of its own, all of it under the Pokémon ---------- */
  electricterrain(e, E) {
    // the floor charged as in 포켓몬 챔피언스: a yellow-green cast, bands of shimmer sweeping slowly across it, little zigzags of
    // lightning snapping just over it, four-rayed glints
    const { W, H } = e, U = unit(e);
    floorTint(e, E, "electric.h", 1.6);
    e.extra.push(...[.2, .45, .7, .95].map((t0, i) => e.strip({ dur: Infinity, mode: 1, color: i % 2 ? "#E8FF6A" : "#FFE24A", emis: e.light ? .4 : .9, occ: e.light ? .7 : 0, alpha: .32, layer: 0, points: () => {
      const n = 36, t = (t0 + e.T * .00008) % 1, d = lerp(7.25, .95, t);
      return Array.from({ length: n + 1 }, (_, j) => { const u = -1.8 + j / n * 3.6, [x, y] = P3(W, H, u, 0, d + Math.sin(u * 4 + e.T * .002 + i) * .06 * d); return [x, y, (2 + t * 6) * U, Math.sin(Math.PI * j / n) * Math.sin(Math.PI * t)]; });
    } })));
    E({ n: 18, at: () => { const [x, y] = floorAt(W, H, rand(-1.4, 1.4), rand(.04, 1.02)); return [x, y - rand(4, 18) * U]; }, tex: "bolt", ramp: e.light ? "electric.d" : "electric.h", each: () => ({ size: [rand(8, 15) * U, "same"], rot: rand(-1.2, 1.2) }), life: [500, 1300], loop: true, over: 2200, alpha: .8, emis: e.light ? .5 : 1, occ: e.light ? .5 : 0, layer: 0 });
    E({ n: 22, at: () => floorAt(W, H, rand(-1.3, 1.3), rand(.05, 1)), tex: "glint", ramp: e.light ? "electric.d" : "electric.h", size: [1, 10 * U], vel: () => [0, rand(-24, -10)], life: [700, 1400], loop: true, over: 1600, alpha: .75, emis: 1, occ: e.light ? .4 : 0, layer: 0, grow: true });
  },
  grassyterrain(e, E) {
    // as in 포켓몬 챔피언스: the floor takes an emerald wash with a fine grain of blades laid in it, white glints float over it, a few
    // small leaves drift (2026-11-06: it is a wash, not the lawn of tufts the first round grew)
    const { W, H } = e, U = unit(e);
    floorTint(e, E, "grass.d", e.light ? 3 : 4.6);
    for (let i = 0; i < 46; i++) {
      const t = Math.pow((i + rand(0, 1)) / 46, .85) * 1.05, [x, y] = floorAt(W, H, rand(-1.5, 1.5), t), f = flatAt(H, y), sz = lerp(60, 220, t) * U;
      E({ at: [x, y], tex: "blades", ramp: "grass.e", size: [sz * f, sz * f], aspect: 1 / f, hold: true, life: 1e7, loop: true, alpha: e.light ? .45 : .34, occ: e.light ? .6 : .2, emis: .4, layer: 0 });
    }
    E({ n: 26, at: () => [rand(0, 1) * W, rand(.35, .95) * H], tex: "glint", ramp: "white.h", size: [1, 9 * U], vel: () => [rand(-6, 6), rand(-14, -4)], life: [1400, 2600], loop: true, over: 3000, alpha: .7, layer: 0, grow: true });
    E({ n: 12, at: () => floorAt(W, H, rand(-1.2, 1.2), rand(.1, 1)), tex: "leaf", lit: true, ramp: "leaf.c", size: [6 * U, 6 * U], aspect: 1.9, vel: () => [rand(-14, 14), rand(-22, -8)], spin: [-2, 2], rot: "rand", bob: [6, 12], period: [3, 5], life: [3500, 6000], loop: true, over: 6000, alpha: .9, occ: 1, emis: .15, layer: 0 });
  },
  mistyterrain(e, E) {
    // as in 포켓몬 챔피언스: a lavender-pink mist swirling over the floor in slow curls, sparkles in it
    const { W, H } = e, U = unit(e);
    floorTint(e, E, "fairy.h", 1.8);
    for (let i = 0; i < 22; i++) { const t = (i + rand(0, 1)) / 22, [x, y] = floorAt(W, H, rand(-1.4, 1.4), t), f = flatAt(H, y), sz = lerp(160, 520, t) * U; E({ at: [x, y], tex: "cloud", ramp: "mist", size: [sz * f, sz * f], aspect: 1 / f, vel: [rand(4, 10), 0], wrap: true, life: 30000, loop: true, over: 30000, alpha: .5, occ: .3, emis: .4, layer: 0 }); }
    E({ n: 24, at: () => [rand(0, 1) * W, rand(.4, .95) * H], tex: "glint", ramp: "fairy.h", size: [1, 9 * U], life: [1500, 3000], loop: true, over: 3000, alpha: .6, layer: 0, grow: true });
  },
  psychicterrain(e, E) {
    // the field turned strange: the floor takes a pink and violet cast, ripples of light run slowly out across it, and waves of it
    // roll over the floor, bending as they go; nothing stands up out of it
    const { W, H } = e, U = unit(e);
    floorTint(e, E, "psychic.h", 1.4);
    for (let i = 0; i < 9; i++) {
      const [x, y] = floorAt(W, H, rand(-1.1, 1.1), rand(.1, .95)), f = flatAt(H, y), sz = W * rand(.5, .9) * f;
      E({ at: [x, y], tex: "ring", ramp: "psy.wave", size: [sz * .1, sz], aspect: 1 / f, life: rand(2800, 3800), loop: true, over: 3800, alpha: .6, emis: e.light ? .5 : 1, occ: e.light ? .35 : 0, layer: 0, grow: true });
    }
    E({ n: 20, at: () => floorAt(W, H, rand(-1.2, 1.2), rand(.05, 1)), tex: "glow", ramp: "psychic.h", size: [4 * U, 2 * U], vel: () => [rand(-6, 6), rand(-18, -8)], bob: [5, 10], period: [3, 5], life: [2600, 4200], loop: true, over: 4200, alpha: .55, layer: 0 });
    // the waves: lines lying on the floor across the court, each bending in a slow wave that runs along it
    return [.16, .34, .55, .78, 1].map((t, i) => e.strip({ dur: Infinity, mode: 1, color: i % 2 ? "#C77DFF" : "#FF7AC8", emis: e.light ? .4 : 1, occ: e.light ? .8 : 0, alpha: .45, layer: 0, points: () => {
      const n = 40, d = lerp(7.25, .95, t);
      return Array.from({ length: n + 1 }, (_, j) => { const u = -1.8 + j / n * 3.6, zz = d + Math.sin(u * 3.2 + e.T * .0012 + i) * .12 * d / 4, [x, y] = P3(W, H, u, 0, zz); return [x, y, (1.4 + t * 2.2) * U, .35 + .65 * Math.sin(Math.PI * j / n)]; });
    } }));
  },
  /* ---------- a room: a box of light standing on the court in the court's own perspective ---------- */
  room(e, E, id) {
    const { W, H } = e, U = unit(e);
    const look = (e.light ? { trickroom: ["#D6338A", "#1393C4"], magicroom: ["#7F4FD9", "#C2389E"], wonderroom: ["#1F6FD1", "#14A383"] } : { trickroom: ["#FF6FB0", "#6FE3FF"], magicroom: ["#C79BFF", "#FF9BE6"], wonderroom: ["#6FB8FF", "#9BFFE0"] })[id] || ["#FFFFFF", "#FFFFFF"];
    const X = 1.32, Y = 2.05, ZF = 8.4, ZN = .9;
    const p = (x, y, z) => P3(W, H, x, y, z);
    const strips = [];
    // a line of the box: drawn on from its far end as the room goes up, a slow light running along it
    const edge = (a, b, color, width, alpha, { delay = 0, layer = 0, shimmer = true } = {}) => strips.push(e.strip({ dur: Infinity, mode: 1, color, emis: e.light ? .4 : 1, occ: e.light ? .85 : 0, alpha, layer, points: (k, age) => {
      const grow = clamp((age - delay) / 700), n = 16;
      if (grow <= 0) return null;
      return Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n * grow, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t);
        return [x, y, width, shimmer ? .75 + .25 * Math.sin(t * 6 - e.T * .0018) : 1];
      });
    } }));
    // the far wall: its frame, a fine grid in the two colours of the room, a faint pane of its light
    const [bl, br, tl, tr] = [p(-X, 0, ZF), p(X, 0, ZF), p(-X, Y, ZF), p(X, Y, ZF)];
    strips.push(e.strip({ dur: Infinity, mode: 4, color: look[0], emis: e.light ? .3 : .6, occ: e.light ? .3 : 0, alpha: e.light ? .16 : .13, layer: 0, points: (k, age) => { const g = clamp(age / 700); return [[bl[0], (tl[1] + bl[1]) / 2, (bl[1] - tl[1]) * g], [br[0], (tr[1] + br[1]) / 2, (br[1] - tr[1]) * g]]; } }));
    for (let i = 1; i < 8; i++) { const x = -X + i * X / 4; edge(p(x, 0, ZF), p(x, Y, ZF), look[i % 2], 1.6 * U, .6, { delay: i * 40 }); }
    for (let i = 1; i < 6; i++) { const y = i * Y / 6; edge(p(-X, y, ZF), p(X, y, ZF), look[(i + 1) % 2], 1.6 * U, .6, { delay: i * 40 }); }
    // the side walls and the ceiling: lines running from the far wall to the camera, as the court's side lines do
    for (const sx of [-1, 1]) {
      for (let i = 1; i < 4; i++) { const y = i * Y / 4; edge(p(sx * X, y, ZF), p(sx * X, y, ZN), look[i % 2], 1.6 * U, .5, { delay: 200 + i * 50 }); }
      for (const z of [6.2, 4.6, 3.4, 2.5]) edge(p(sx * X, 0, z), p(sx * X, Y, z), look[1], 1.6 * U, .45, { delay: 300 });
    }
    for (const x of [-X / 2, 0, X / 2]) edge(p(x, Y, ZF), p(x, Y, ZN), look[0], 1.6 * U, .4, { delay: 300 });
    // the box's own edges, brighter: the far frame, and the four running to the camera
    edge(bl, br, look[0], 3.2 * U, 1); edge(tl, tr, look[0], 3.2 * U, 1); edge(bl, tl, look[0], 3.2 * U, 1); edge(br, tr, look[0], 3.2 * U, 1);
    for (const [x, y] of [[-X, 0], [X, 0], [-X, Y], [X, Y]]) edge(p(x, y, ZF), p(x, y, ZN), look[0], 3.2 * U, .95, { delay: 150 });
    /* its walls, ceiling and floor are made of square tiles, as 포켓몬 챔피언스's Trick Room is: each tile a translucent pane of one of
       the room's tones, lighter and darker in turn, the floor a checker of them, a white glint where tiles meet */
    const tones = (e.light ? { trickroom: ["#6A4FD9", "#3F6FD9", "#9A7BE8", "#2E2A8A"], magicroom: ["#B04FC9", "#D06AA8", "#8A4FD0", "#6A2A8A"], wonderroom: ["#2F7FD0", "#2AA38A", "#5A9AE8", "#1F5A8A"] }
      : { trickroom: ["#8A6BFF", "#5A86FF", "#C2A6FF", "#3A3AA8"], magicroom: ["#D08AFF", "#FF8AD8", "#A06BFF", "#7A2A9A"], wonderroom: ["#6AB0FF", "#5AE0C0", "#9AC8FF", "#2A6AA8"] })[id] || look;
    let seed = 3; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const tile = (corners, k) => { const g = .82; const c = corners.map(q => q); const m = [(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2], inset = c.map(([x, y]) => [lerp(m[0], x, g + .12), lerp(m[1], y, g + .12)]); strips.push(e.strip({ dur: Infinity, quad: (kk, age) => (age < 150 + k * 4 ? null : inset), color: tones[Math.floor(r() * tones.length)], emis: e.light ? .3 : .55, occ: e.light ? .4 : .1, alpha: (e.light ? .2 : .2) + r() * .2, layer: 0 })); };
    let k = 0;
    const cols = n => Array.from({ length: n + 1 }, (_, i) => -X + i * 2 * X / n);
    const zs = [ZF, 6.2, 4.6, 3.4, 2.5, 1.8, 1.3, ZN];
    // the far wall: 8 across, 6 up
    { const xs = cols(8); for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) tile([p(xs[i], j * Y / 6, ZF), p(xs[i + 1], j * Y / 6, ZF), p(xs[i + 1], (j + 1) * Y / 6, ZF), p(xs[i], (j + 1) * Y / 6, ZF)], k++); }
    // the side walls: 4 up, running to the camera
    for (const sx of [-1, 1]) for (let j = 0; j < 4; j++) for (let i = 0; i < zs.length - 1; i++) tile([p(sx * X, j * Y / 4, zs[i]), p(sx * X, j * Y / 4, zs[i + 1]), p(sx * X, (j + 1) * Y / 4, zs[i + 1]), p(sx * X, (j + 1) * Y / 4, zs[i])], k++);
    // the ceiling and the floor: 6 across
    { const xs = cols(6); for (const yy of [Y, 0]) for (let i = 0; i < 6; i++) for (let j = 0; j < zs.length - 1; j++) tile([p(xs[i], yy, zs[j]), p(xs[i + 1], yy, zs[j]), p(xs[i + 1], yy, zs[j + 1]), p(xs[i], yy, zs[j + 1])], k++); }
    // the floor's lines: running to the camera and across, under every Pokémon, so each stands inside the room
    for (const x of cols(6).slice(1, -1)) edge(p(x, 0, ZF), p(x, 0, ZN), look[1], 1.2 * U, .3, { delay: 250 });
    for (const z of zs.slice(1, -1)) edge(p(-X, 0, z), p(X, 0, z), look[0], 1.2 * U, .3, { delay: 250 });
    // white glints where the far wall's tiles meet, each lighting in its turn
    { const xs = cols(8); for (let j = 1; j < 6; j++) for (let i = 1; i < 8; i++) if (r() < .45) E({ at: p(xs[i], j * Y / 6, ZF), tex: "glint", ramp: "glint", size: [1, 14 * U], life: rand(1600, 3200), loop: true, over: 3200, alpha: .8, layer: 0, grow: true }); }
    for (const sx of [-1, 1]) for (let j = 1; j < 4; j++) for (const z of zs.slice(1, -2)) if (r() < .5) E({ at: p(sx * X, j * Y / 4, z), tex: "glint", ramp: "glint", size: [1, 20 * U], life: rand(1600, 3200), loop: true, over: 3200, alpha: .8, layer: 0, grow: true });
    return strips;
  },
  gravity(e, E) {
    const { W, H } = e;
    E({ n: 26, at: () => [rand(-.05, 1.05) * W, -H * .1], vel: () => [0, rand(220, 320)], tex: "chevron", ramp: "psychic.h", size: [8 * unit(e), 8 * unit(e)], rot: Math.PI, life: H * 1.2 / 270 * 1000, loop: true, over: 4400, alpha: .14, emis: .8, layer: 0 });
  },
  /* ---------- a side's own things ---------- */
  /* hazards as 포켓몬 챔피언스 sets them: Stealth Rock a spray of small pointed cream stones hanging low and wide over the side, Spikes
     small silver caltrops scattered round its feet (toxic ones violet). The games hide them once set; the stage keeps them in view,
     small and lit, so a player sees what waits on each side */
  stealthrock(e, E, own) {
    const b = SIDE_OF(e, own), w = b.r - b.l, h = b.bot - b.top, U = unit(e), n = own ? 14 : 18;
    let seed = own ? 5 : 9; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < n; i++) {
      const t = (i + r()) / n, x = b.l - w * .15 + t * w * 1.3, y = b.bot - h * (.16 + .3 * r()), sz = (own ? 12 : 15) * U * (.7 + r() * .6);
      E({ at: [x, y], tex: "chip", lit: true, ramp: "chip", size: [sz, sz], aspect: .8, rot: r() * 6, spin: (r() - .5) * .3, bob: sz * .3, period: 2.4 + r() * 1.6, hold: true, life: 1e7, loop: true, alpha: 1, occ: 1, emis: .05, layer: r() < .5 ? 0 : 1 });
    }
  },
  /* spikes and toxic spikes are counted by their rows (2026-11-06, the user: how many layers are down must read at a glance, as
     Showdown adds a caltrop per layer): each layer is one row of three caltrops at the side's feet, the first in front and each
     next a step behind it, so one, two or three rows are one, two or three layers. With both on a side, spikes keep the left half
     and toxic spikes the right, so neither hides in the other */
  spikes(e, E, own, layers = 1, both = false, toxic = false) {
    const b = SIDE_OF(e, own), w = b.r - b.l, U = unit(e), h = b.bot - b.top, rows = Math.min(toxic ? 2 : 3, layers);
    const l0 = both ? (toxic ? b.l + w * .52 : b.l - w * .08) : b.l - w * .08, span = both ? w * .56 : w * 1.16, sz = clamp(h * (own ? .24 : .3), 36 * U, 76 * U);
    for (let row = 0; row < rows; row++) for (let i = 0; i < 3; i++) {
      // each row a step deeper and a little smaller, shifted by a quarter place so the rows read apart
      const k = 1 - row * .12, x = l0 + span * (i + .5 + (row % 2) * .25) / 3, y = b.bot + h * (own ? .02 : .03) - row * h * .11, s0 = sz * k;
      E({ at: [x, y + s0 * .16], tex: "glow", ramp: "shadow", size: [s0 * .55, s0 * .55], aspect: 2.4, hold: true, life: 1e7, loop: true, alpha: .45, occ: .7, emis: 0, layer: 1 });
      E({ at: [x, y], tex: "caltrop", lit: true, ramp: toxic ? "toxic.c" : "steel.c", size: [s0, s0], aspect: 1.15, hold: true, life: 1e7, loop: true, alpha: 1, occ: 1, emis: toxic ? .3 : .12, layer: 1 });
    }
  },
  stickyweb(e, E, own) {
    const b = SIDE_OF(e, own), y = b.bot - (b.bot - b.top) * .02, w = (b.r - b.l) * .7, f = flatAt(e.H, y) * 1.3;
    E({ at: [(b.l + b.r) / 2, y], tex: "web", ramp: e.light ? "ink" : "white.h", size: [w * f, w * f], aspect: 1 / f, hold: true, life: 1e7, loop: true, alpha: e.light ? .45 : .4, occ: .5, emis: .3, layer: 0 });
  },
  // a screen: a pane standing over the side, barely there, its top edge lit in its colour; several stand at their own heights
  screen(e, E, own, id) {
    const b = SIDE_OF(e, own), cx = (b.l + b.r) / 2, w = (b.r - b.l) * 1.06, h = (b.bot - b.top) * .92;
    const look = { reflect: ["bar.gold", "#FFD45A"], lightscreen: ["bar.pink", "#FFB8F0"], auroraveil: ["aurora", "#8FFFD8"], safeguard: ["fairy.h", "#E8B8FF"], mist: ["white.h", "#FFFFFF"] }[id];
    if (!look) return;
    if (id === "mist" || id === "safeguard") {
      E({ n: 5, at: () => [cx + rand(-.4, .4) * w, b.bot - rand(0, .15) * h], tex: "cloud", ramp: id === "mist" ? "steam" : "mist", size: [w * .4, w * .4], aspect: 2.4, vel: () => [rand(-6, 6), 0], bob: [3, 6], period: [5, 8], hold: true, life: 1e7, loop: true, alpha: .25, occ: .25, emis: .4, layer: 0 });
      return;
    }
    const i = ["reflect", "lightscreen", "auroraveil"].indexOf(id), top = b.bot - h - i * h * .07, U = unit(e);
    // the wall stays as the games raise it, only faint: Reflect and Light Screen upright bars of their light, Aurora Veil its curtains
    const bars = id === "auroraveil" ? 16 : 13, ramp = id === "reflect" ? "bar.gold" : id === "lightscreen" ? "bar.pink" : "aurora.v";
    for (let j = 0; j < bars; j++) { const u = (j + .5) / bars, x = cx - w / 2 + u * w, hh = (b.bot - top) * (id === "auroraveil" ? .7 + .3 * Math.sin(j * 1.7) : 1); E({ at: [x, b.bot - hh / 2], tex: "glow", ramp, size: [hh, hh], aspect: id === "auroraveil" ? .1 : .045, vel: [0, -2], bob: 2, period: 3 + j % 3, life: [3000, 5000], loop: true, over: 5000, alpha: id === "auroraveil" ? .2 : .16, emis: e.light ? .4 : .8, occ: e.light ? .3 : 0, layer: 1 }); }
    return [e.strip({ dur: Infinity, mode: 1, color: look[1], emis: e.light ? .5 : 1, occ: e.light ? .4 : 0, alpha: .75, layer: 1, points: (k, age) => {
      const grow = clamp(age / 500), n = 20;
      return Array.from({ length: n + 1 }, (_, j) => { const t = j / n, x = lerp(cx - w / 2 * grow, cx + w / 2 * grow, t); return [x, top, 2.2 * U, .55 + .45 * Math.sin(Math.PI * t) * (.8 + .2 * Math.sin(t * 8 - e.T * .002))]; });
    } })];
  },
  tailwind(e, E, own) {
    const b = SIDE_OF(e, own), dir = own ? 1 : -1, w = b.r - b.l, h = b.bot - b.top;
    E({ n: 26, at: () => [b.l + rand(-.3, 1.1) * w, b.top + rand(.3, 1) * h], vel: () => [dir * rand(500, 700), rand(-30, 0)], tex: "streak", ramp: "flying.h", size: [2, 2], aspect: [14, 26], face: true, life: [600, 900], loop: true, over: 900, alpha: .55, layer: 0 });
    E({ n: 6, at: () => [b.l + rand(0, 1) * w, b.top + rand(.6, 1) * h], vel: () => [dir * rand(260, 360), rand(-20, 10)], tex: "leaf", ramp: "flying.h", size: [8, 6], spin: [-6, 6], life: [900, 1400], loop: true, over: 1400, alpha: .5, occ: .4, layer: 0 });
  },
};
BUILD.toxicspikes = (e, E, own, layers, both) => BUILD.spikes(e, E, own, layers, both, true);
// a terrain's colour laid over the floor: one even, flat tint of the whole floor (never soft blobs, which read as stains)
const TINT = { "electric.h": "#D8F03A", "grass.d": "#22B47A", "grass.h": "#3A9A32", "fairy.h": "#FF8AE8", "psychic.h": "#FF4F93" };
function floorTint(e, E, ramp, k = 1) {
  const { W, H } = e, y0 = H * .42, L = -W * .2, R = W * 1.2, B = H * 1.2;
  e.extra.push(e.strip({ dur: Infinity, quad: () => [[L, y0], [R, y0], [R, B], [L, B]], color: TINT[ramp] || "#FFFFFF", emis: e.light ? .2 : .5, occ: e.light ? .5 : .15, alpha: Math.min(.32, (e.light ? .07 : .06) * k), layer: 0 }));
}

const WEATHER = { raindance: ["rain"], primordialsea: ["rain", true], sunnyday: ["sun"], desolateland: ["sun", true], sandstorm: ["sand"], snowscape: ["snow"], snow: ["snow"], hail: ["snow", true], deltastream: ["wind"] };
const GRADE = {
  rain: { mR: .84, mG: .88, mB: .97 }, sun: { mR: 1.1, mG: 1.03, mB: .88, aR: .025, aG: .012 }, sand: { mR: 1.03, mG: .97, mB: .88 },
  snow: { mR: .96, mG: .99, mB: 1.04 }, wind: { mR: .98, mG: .99, mB: 1.01 }, gravity: { mR: .94, mG: .93, mB: .98 },
};

// the field as Stage.jsx sees it: { weather, fields, foe: { conditions, layers }, own: { ... } }
export function setField(e, f) {
  const want = new Map();
  const w = WEATHER[f.weather];
  if (w) want.set(`w:${w[0]}${w[1] ? "+" : ""}`, [w[0], w[1]]);
  for (const id of f.fields || []) {
    if (/terrain$/.test(id) && BUILD[id]) want.set(`t:${id}`, [id]);
    else if (/room$/.test(id)) want.set(`r:${id}`, ["room", id]);
    else if (id === "gravity") want.set("gravity", ["gravity"]);
  }
  for (const [side, own] of [["foe", false], ["own", true]]) {
    const s = f[side] || { conditions: [], layers: {} };
    for (const c of s.conditions || []) {
      if (c === "stealthrock" || c === "stickyweb" || c === "tailwind") want.set(`${side}:${c}`, [c, own]);
      else if (c === "spikes" || c === "toxicspikes") { const both = s.conditions.includes("spikes") && s.conditions.includes("toxicspikes"); want.set(`${side}:${c}:${s.layers?.[c] || 1}:${both ? 2 : 1}`, [c, own, s.layers?.[c] || 1, both]); }
      else if (["reflect", "lightscreen", "auroraveil", "safeguard", "mist"].includes(c)) want.set(`${side}:${c}`, ["screen", own, c]);
    }
  }
  e.fieldWant = want;
  rebuild(e);
}

function rebuild(e, all = false) {
  if (!e.arena) return;
  const items = e.fieldItems || (e.fieldItems = new Map());
  const want = e.fieldWant || new Map();
  let changed = all;
  for (const [key, it] of items) if (!want.has(key) && !it.leaving) { it.leaving = true; it.to = 0; changed = true; }
  const free = () => { for (let g = 1; g < 32; g++) if (![...items.values()].some(it => it.g === g)) return g; return 31; };
  for (const [key, args] of want) {
    let it = items.get(key);
    if (it && !all && !it.leaving) continue;
    if (it) it.strips?.forEach(s => { s.dead = true; });
    const g = it?.g || free(), fresh = !it;
    it = { key, g, args, to: 1, leaving: false, data: null, strips: null };
    if (fresh) e.groups[g] = 0;
    const start = e.fieldCount;
    // on paper a light that only adds is invisible: every field piece also covers what is under it there, and stands a little stronger
    const onPaper = spec => (e.light ? { occ: Math.max(spec.occ || 0, .7), alpha: typeof spec.alpha === "number" ? Math.min(1, spec.alpha * 1.35) : spec.alpha } : {});
    // a field that stays always lies behind the Pokémon: whatever stands in front of them is a move's, never the field's (2026-11-06, the user)
    const E = spec => e.emit({ ...spec, ...onPaper(spec), layer: 0, field: true, group: g });
    e.extra = [];
    it.strips = [...(BUILD[args[0]]?.(e, E, ...args.slice(1)) || []), ...e.extra];
    for (const s of it.strips) s.layer = 0;
    it.data = e.fieldData.slice(start * 24, e.fieldCount * 24);
    e.fieldCount = start;
    items.set(key, it);
    changed = true;
  }
  if (changed) compose(e);
  // weather and gravity tint the picture a little; terrains and rooms leave it alone
  const grade = { mR: 1, mG: 1, mB: 1, aR: 0, aG: 0, aB: 0, sat: 1 };
  for (const [key, it] of items) {
    if (it.leaving) continue;
    const gr = GRADE[key.startsWith("w:") ? it.args[0] : key];
    // on paper a tint of the whole picture reads as a stain, so the light theme takes only a third of it
    const share = e.light ? .3 : 1;
    if (gr) for (const k in gr) grade[k] = k[0] === "m" || k === "sat" ? grade[k] * (1 + (gr[k] - 1) * share) : grade[k] + gr[k] * share;
  }
  e.gradeTo = grade;
}
function compose(e) {
  let n = 0;
  for (const it of e.fieldItems.values()) { if (!it.data) continue; e.fieldData.set(it.data, n * 24); n += it.data.length / 24; }
  e.fieldCount = n; e.fieldDirty = true;
  e.fieldDistort = false;
}

onEngine(e => {
  e.paint = () => paint(e);
  // groups fade toward where they are going; the grade eases to the field's
  e.fieldTick = dt => {
    if (!e.fieldItems) return;
    const k = Math.min(1, dt / 520);
    let gone = false;
    for (const [key, it] of e.fieldItems) {
      e.groups[it.g] += (it.to - e.groups[it.g]) * k;
      it.strips?.forEach(s => { s.alpha = (s.alpha0 ??= s.alpha ?? 1) * e.groups[it.g]; });
      if (it.leaving && e.groups[it.g] < .01) { e.groups[it.g] = 0; it.strips?.forEach(s => { s.dead = true; }); e.fieldItems.delete(key); gone = true; }
    }
    if (gone) compose(e);
    if (e.gradeTo) for (const key in e.gradeTo) e.gradeBase[key] += (e.gradeTo[key] - e.gradeBase[key]) * k;
  };
  e.paint();
});
