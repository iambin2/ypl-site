/* 경기장과 필드 (DESIGN.md "Battle", The stage). 경기장은 한 번 그려 두는 그림이다(크기나 테마가 바뀌면 다시): 홈페이지의 색으로
   칠한 단정한 경기장, 다크는 남색, 라이트는 종이색과 남색 선. 움직이는 장식은 없다.
   필드에 남는 것은 GPU의 반복 파티클과 선(리본)이고, 묶음마다 천천히 켜지고 꺼진다. 원칙은 하나다: 포켓몬의 형체가 늘 먼저다.
   날씨와 필드는 대부분 포켓몬 뒤(바닥과 배경)에 그리고, 앞에 오는 것은 가늘고 옅다. 룸은 코트와 같은 원근의 상자다. */
import { onEngine, rand, lerp, clamp } from "./gl.js";

/* ---------- the court's perspective: one camera for the floor, the walls and a room ---------- */
/* 2026-11-07: a low camera, the court lying flat as before (the user: the laid-down, flat view is steadier), now with the court run
   out under the near pair so all four stand on it: the far line just behind the far side's feet, the centre line between the sides,
   the side lines framing everyone. The truly consistent camera (the near slots are 1.54 times the far ones) looks down far more and
   was tried the same day; the flat one was kept.
   Units: Y is the camera's height (1), Z the distance from it in the same unit, X across with the side lines at ±1 (ACROSS of the
   camera's height each side). The horizontal scale follows the stage's height, so the court keeps its shape on a phone and a desktop. */
const VP = .16, F = 1.41, ACROSS = 1.6;
// a point in the court's space: X across (the side lines at ±1), Y up from the floor, Z away from the camera; on the stage in pixels
export const P3 = (W, H, X, Y, Z) => [W * .5 + F * H * ACROSS * X / Z, H * (VP + F * (1 - Y) / Z)];
const Z_FAR = 5.2, Z_MID = 2.9;
const depth = t => lerp(Z_FAR, 1.44, t);
// a point on the floor: across (-1 the left side line, 1 the right) and depth (0 the far line, 1 the stage's bottom edge)
export const floorAt = (W, H, u, t) => P3(W, H, u, 0, depth(t));
// how much a flat round thing on the floor is squashed at a height y of the stage, as this camera sees it (far things flatter)
export const flatAt = (H, y) => clamp((y / H - VP) / (F * ACROSS), .16, .7);

/* ---------------------------------------------------------------- the arena ---------------------------------------------------------------- */
/* the site's own tones (tokens.css), one to a theme. Every mark is solid paint: one filled outline per line in the tone it is, never
   a translucent stroke laid piece by piece (2026-11-07: the pieces' round ends overlapped at every joint and showed as dots) */
const PALETTE = {
  dark: { ground: "#081C3D", court: "#12294F", line: "#8196B9" },
  light: { ground: "#DDE2EA", court: "#FFFFFF", line: "#8196B9" },
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
  const at = (X, Z) => P3(W, H, X, 0, Z);
  // the court's own floor, a little wider than its lines, running past the stage's bottom edge
  {
    const ZA = Z_FAR + .2, XA = 1.1, ZN = 1.2;
    g.fillStyle = P.court; g.beginPath();
    [at(-XA, ZA), at(XA, ZA), at(XA, ZN), at(-XA, ZN)].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath(); g.fill();
  }
  /* a painted line through floor points [X, Z]: the outline of paint HW of the camera's height wide, as the camera sees it, so a line
     running away is wide and one lying across is narrow, never under 1.2 px. Straight lines get square ends half their width long */
  const HW = .006, MIN = .6;
  const paintLine = (pts, closed = false) => {
    const sp = pts.map(([X, Z]) => at(X, Z)), n = sp.length, left = [], right = [];
    for (let i = 0; i < n; i++) {
      const a = closed ? sp[(i - 1 + n) % n] : sp[Math.max(0, i - 1)], b = closed ? sp[(i + 1) % n] : sp[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      // the paint's width on the floor, measured across the line as it lies on the screen
      const [X, Z] = pts[i], ia = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)], ib = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)];
      let wx = ib[0] * ACROSS - ia[0] * ACROSS, wz = ib[1] - ia[1]; const wl = Math.hypot(wx, wz) || 1;
      const o = at(X + (-wz / wl) * HW / ACROSS, Z + (wx / wl) * HW);
      const hw = Math.max(MIN, Math.abs((o[0] - sp[i][0]) * nx + (o[1] - sp[i][1]) * ny));
      let [x, y] = sp[i];
      if (!closed && (i === 0 || i === n - 1)) { const k = i === 0 ? -1 : 1; x += tx * hw * k; y += ty * hw * k; }
      left.push([x + nx * hw, y + ny * hw]); right.push([x - nx * hw, y - ny * hw]);
    }
    g.beginPath();
    if (closed) { left.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); right.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill("evenodd"); }
    else { [...left, ...right.reverse()].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
  };
  const run = (x0, z0, x1, z1, k = 24) => Array.from({ length: k + 1 }, (_, i) => [lerp(x0, x1, i / k), lerp(z0, z1, i / k)]);
  // a circle on the floor of radius r (in the camera's height), round as it lies, around the court's centre
  const ring = r => Array.from({ length: 128 }, (_, i) => { const th = i / 128 * Math.PI * 2; return [Math.cos(th) * r / ACROSS, Z_MID + Math.sin(th) * r]; });
  /* the court as a Pokémon battle court is marked, and nothing more: the side lines and the far line, the centre line through a
     Poké Ball (its circle, the band broken at the button, the button's ring) */
  g.fillStyle = P.line;
  for (const sx of [-1, 1]) paintLine(run(sx, Z_FAR, sx, 1.2));
  paintLine(run(-1, Z_FAR, 1, Z_FAR, 2));
  const RB = .26, RBTN = .08;
  paintLine(run(-1, Z_MID, -RBTN / ACROSS, Z_MID, 8)); paintLine(run(RBTN / ACROSS, Z_MID, 1, Z_MID, 8));
  paintLine(ring(RB), true); paintLine(ring(RBTN), true);

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
// a weather's air laid over the whole arena, behind the Pokémon: one even colour (emis adds it as light, for the sun)
const wash = (e, color, alpha, emis = 0) => {
  const { W, H } = e;
  e.extra.push(e.strip({ dur: Infinity, quad: () => [[-W * .2, -H * .2], [W * 1.2, -H * .2], [W * 1.2, H * 1.2], [-W * .2, H * 1.2]], color, emis, occ: 1, alpha, layer: 0, dims: true, under: true }));
};

const BUILD = {
  /* ---------- weather: behind the Pokémon, and only fine and faint where it passes in front ---------- */
  /* 2026-11-06 remake, from 포켓몬 챔피언스 (each checked against its frames): rain is thin and straight, the sun is shafts of light
     with no disc in the sky, a sandstorm is a pale haze full of fine grains, snow is a gentle fall of white.
     2026-11-06 second pass (the user: "강렬함이 너무 없어, 무슨 날씨인지도 모르겠어"): each weather now takes the whole arena into its own
     air, as the games light a weather, so it is named at a glance: rain an overcast slate with a dense slanting fall, harsh sun a warm
     gold glare from the upper left, a sandstorm an ochre storm blowing across, snow a pale cold air with a thick fall and a white floor.
     The Pokémon keep their colours (the washes lie behind them; only the grade touches them, and gently) */
  rain(e, E, heavy) {
    // the sky closes over: an overcast slate over the arena; long lines of rain slanting down on the wind, crowns of splash on the floor
    const { W, H } = e, U = unit(e), ramp = e.light ? "rain.l" : "rain";
    wash(e, e.light ? "#6F84A3" : "#26364F", e.light ? .26 : .5);
    for (const [n, far] of [[heavy ? 420 : 300, true], [heavy ? 150 : 110, false]]) {
      const v = far ? 1700 : 2200, life = H * 1.35 / v * 1000, w = (far ? 2.6 : 3.6) * U * (e.light ? 1.3 : 1);
      E({ n, at: () => [rand(-.05, 1.25) * W, -H * .15], vel: () => [-v * .16, v * rand(.95, 1.05)], tex: "streak", ramp, size: [w, w], aspect: far ? 30 : 42, face: true, life, loop: true, over: life, alpha: far ? .95 : .8, emis: e.light ? .15 : .8, occ: e.light ? .6 : .15, layer: far ? 0 : 1 });
    }
    E({ n: 120, at: () => floorAt(W, H, rand(-1.5, 1.5), rand(.02, 1.05)), tex: "ring", ramp: "white", size: [2 * U, 16 * U], aspect: 2.8, life: [280, 420], loop: true, over: 600, alpha: e.light ? .7 : .6, emis: e.light ? 0 : .7, occ: e.light ? .4 : 0, layer: 0, grow: true });
    E({ n: 90, at: () => floorAt(W, H, rand(-1.4, 1.4), rand(.05, 1)), tex: "drop", lit: true, ramp: e.light ? "rain.l" : "water.l", vel: () => [rand(-30, 30), -rand(80, 140)], acc: [0, 700], face: true, rot: -Math.PI / 2, aspect: .72, size: [4 * U, 2.5 * U], life: [240, 360], loop: true, over: 400, alpha: .85, emis: .45, occ: .6, layer: 0 });
    E({ n: 24, at: () => floorAt(W, H, rand(-1.3, 1.3), rand(.05, 1)), tex: "glint", ramp: "glint", size: [2, 11 * U], life: [400, 700], loop: true, over: 900, alpha: .6, layer: 0, grow: true });
    E({ n: 7, at: () => [rand(0, 1) * W, rand(-.1, .3) * H], tex: "cloud", ramp: e.light ? "smoke.l" : "smoke", size: [W * .6, W * .6], aspect: 2.6, vel: () => [rand(-30, -14), 0], wrap: true, life: [14000, 18000], loop: true, over: 18000, alpha: .45, occ: .7, emis: 0, layer: 0 });
  },
  sun(e, E, harsh) {
    // harsh sunlight: the air turns gold, a white glare burns at the upper left, broad shafts fan out from it across the field with
    // motes turning in them; no sun is drawn in the sky
    const { W, H } = e, U = unit(e), k = harsh ? 1.2 : 1;
    wash(e, e.light ? "#FFC56A" : "#B86A1E", e.light ? .28 : .3, e.light ? .2 : .35);
    for (let i = 0; i < 9; i++) {
      const ang = .62 + i * .07, len = H * 2.4, x0 = -W * .04, y0 = -H * .12, wide = W * rand(.05, .1);
      E({ at: [x0 + Math.cos(ang) * len / 2, y0 + Math.sin(ang) * len / 2], tex: "glow", ramp: e.light ? "gold" : "sunlit", size: [wide, wide], aspect: len / wide, rot: ang, life: 5200 + i * 900, loop: true, over: 6000, alpha: .3 * k * (i % 2 ? .6 : 1), emis: e.light ? .5 : 1, occ: e.light ? .2 : 0, layer: 0 });
    }
    E({ at: [W * .02, -H * .12], tex: "glow", ramp: e.light ? "gold" : "sunray", size: [W * 1.5, W * 1.5], hold: true, life: 1e7, loop: true, alpha: .75 * k, emis: e.light ? .6 : 1, occ: e.light ? .25 : 0, layer: 0 });
    E({ at: [W * .01, -H * .1], tex: "glow", ramp: "white.h", size: [W * .4, W * .4], hold: true, life: 1e7, loop: true, alpha: .8, emis: 1, occ: e.light ? .2 : 0, layer: 0 });
    E({ n: 60, at: () => [rand(0, .85) * W, rand(.05, .9) * H], tex: "glow", ramp: "gold", size: [4 * U, 1], vel: () => [rand(-6, 6), rand(-24, -10)], bob: [4, 10], period: [3, 6], life: [3000, 5000], loop: true, over: 5000, alpha: .7, layer: 0 });
  },
  sand(e, E) {
    // a storm of sand blows across the arena: the air goes ochre, long gusts and thick grains race across it, dust rolls through
    const { W, H } = e, U = unit(e);
    wash(e, e.light ? "#D49A4E" : "#9A6428", e.light ? .3 : .5);
    for (const [n, layer, a] of [[260, 0, .95], [110, 1, .8]]) E({ n, at: () => [rand(-.1, 1.1) * W, rand(-.05, 1.05) * H], vel: () => [rand(260, 420), rand(-20, 30)], tex: "dot", ramp: "sand", size: [[2 * U, 4 * U], "same"], bob: [6, 14], period: [1.5, 3], life: [5000, 8000], loop: true, over: 8000, wrap: true, alpha: a, occ: e.light ? .7 : .3, emis: .6, layer });
    E({ n: 90, at: () => [rand(-.1, 1.1) * W, rand(0, 1) * H], vel: () => [rand(900, 1300), rand(-40, 60)], tex: "streak", ramp: "sand", size: [2.2 * U, 2.2 * U], aspect: [24, 44], face: true, life: [600, 900], loop: true, over: 900, wrap: true, alpha: .7, occ: e.light ? .6 : .2, emis: .5, layer: 0 });
    E({ n: 12, at: () => [rand(0, 1) * W, rand(.1, .85) * H], tex: "cloud", ramp: "dust.c", size: [W * .6, W * .6], aspect: 2.2, vel: () => [rand(160, 260), 0], wrap: true, life: [9000, 12000], loop: true, over: 12000, alpha: .42, occ: .6, emis: .05, layer: 0 });
  },
  snow(e, E, hail) {
    // the air goes pale and cold and the floor white; snow falls thick and swaying, big soft flakes near, fine ones far;
    // hail is pellets of ice driven down fast, bouncing off the floor
    // on paper white snow is lost: it falls in the navy of the light theme
    const { W, H } = e, U = unit(e), ramp = e.light ? "rain.l" : "snow";
    wash(e, e.light ? "#7FA8D6" : "#6E8FB8", e.light ? .42 : .32, e.light ? 0 : .15);
    const y0 = P3(W, H, 0, 0, Z_FAR + .2)[1];
    e.extra.push(e.strip({ dur: Infinity, quad: () => [[-W * .2, y0], [W * 1.2, y0], [W * 1.2, H * 1.2], [-W * .2, H * 1.2]], color: e.light ? "#D8ECFA" : "#EAF4FF", emis: e.light ? 0 : .3, occ: 1, alpha: e.light ? .4 : .16, layer: 0, dims: true, under: true }));
    if (hail) {
      E({ n: 170, at: () => [rand(-.1, 1.3) * W, -H * .1], vel: () => [-160, rand(760, 900)], tex: "crystal", lit: true, ramp: "ice.c", size: [6 * U, 6 * U], aspect: .8, face: true, rot: Math.PI / 2, life: H * 1.25 / 830 * 1000, loop: true, over: 1800, alpha: .95, emis: .5, occ: .8, layer: 1 });
      E({ n: 60, at: () => floorAt(W, H, rand(-1.4, 1.4), rand(.05, 1)), tex: "crystal", lit: true, ramp: "ice.c", vel: () => [rand(-60, 60), -rand(90, 160)], acc: [0, 900], size: [3 * U, 3 * U], rot: "rand", spin: [-8, 8], life: [260, 380], loop: true, over: 400, alpha: .9, emis: .4, occ: .7, layer: 0 });
    }
    E({ n: hail ? 60 : 150, at: () => [rand(-.1, 1.1) * W, -H * .08], vel: () => [rand(-24, 10), rand(70, 120)], tex: "dot", ramp, size: [[3.6 * U, 6.5 * U], "same"], bob: [10, 22], period: [2.4, 4], life: [7000, 10000], loop: true, over: 10000, alpha: 1, emis: .6, occ: .45, layer: 1 });
    E({ n: hail ? 80 : 260, at: () => [rand(-.1, 1.1) * W, -H * .08], vel: () => [rand(-16, 8), rand(44, 70)], tex: "dot", ramp, size: [[2 * U, 3 * U], "same"], bob: [6, 12], period: [3, 5], life: [15000, 22000], loop: true, over: 22000, alpha: .85, emis: .55, occ: .35, layer: 0 });
    E({ n: 8, at: () => [rand(0, 1) * W, rand(.36, .55) * H], tex: "cloud", ramp: "steam", size: [W * .55, W * .55], aspect: 3, vel: () => [rand(14, 30), 0], wrap: true, life: 20000, loop: true, over: 20000, alpha: .36, occ: .4, emis: .3, layer: 0 });
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
    // (2026-11-07) a fine diamond lattice lies painted in the floor, running away with the court, as a charged plate would
    { const sh = floorSheet(e); paintLattice(sh.g, e); lay(e, sh); }
    e.extra.push(...[.2, .45, .7, .95].map((t0, i) => e.strip({ dur: Infinity, mode: 1, color: i % 2 ? "#E8FF6A" : "#FFE24A", emis: e.light ? .4 : .9, occ: e.light ? .7 : 0, alpha: .32, layer: 0, points: () => {
      const n = 36, t = (t0 + e.T * .00008) % 1, d = depth(t);
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
    // (2026-11-07) the grain is fine blades painted crisp in the floor's perspective, small far off and longer near, in three greens;
    // the stamped patches it replaces blurred into a muddy wash
    { const sh = floorSheet(e); paintBlades(sh.g, e); lay(e, sh); }
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
    // (2026-11-07) ripples run out across the floor from four points, each a true circle lying in the court's perspective
    const rr = seeded(53), ripples = [];
    for (let i = 0; i < 4; i++) {
      const X0 = (rr() * 2 - 1) * 1.1 * ACROSS, Z0 = lerp(Z_FAR - .3, 1.9, rr()), per = 3400 + rr() * 900;
      for (const off of [0, .5]) ripples.push(e.strip({ dur: Infinity, mode: 1, color: (i + off * 2) % 2 ? "#C77DFF" : "#FF7AC8", emis: e.light ? .4 : .9, occ: e.light ? .8 : 0, alpha: .5, layer: 0, points: () => {
        const ph = ((e.T / per) + off + i * .23) % 1, r = lerp(.06, 1.1, ph), n = 56;
        return Array.from({ length: n + 1 }, (_, j) => { const a = j / n * Math.PI * 2, [x, y] = P3(W, H, (X0 + Math.cos(a) * r) / ACROSS, 0, Math.max(1.2, Z0 + Math.sin(a) * r * .9)); return [x, y, (1.2 + ph * 1.8) * U, Math.sin(Math.PI * ph) * (1 - ph * .5)]; });
      } }));
    }
    E({ n: 20, at: () => floorAt(W, H, rand(-1.2, 1.2), rand(.05, 1)), tex: "glow", ramp: "psychic.h", size: [4 * U, 2 * U], vel: () => [rand(-6, 6), rand(-18, -8)], bob: [5, 10], period: [3, 5], life: [2600, 4200], loop: true, over: 4200, alpha: .55, layer: 0 });
    // the waves: lines lying on the floor across the court, each bending in a slow wave that runs along it
    return [...ripples, ...[.16, .34, .55, .78, 1].map((t, i) => e.strip({ dur: Infinity, mode: 1, color: i % 2 ? "#C77DFF" : "#FF7AC8", emis: e.light ? .4 : 1, occ: e.light ? .8 : 0, alpha: .45, layer: 0, points: () => {
      const n = 40, d = depth(t);
      return Array.from({ length: n + 1 }, (_, j) => { const u = -1.8 + j / n * 3.6, zz = d + Math.sin(u * 3.2 + e.T * .0012 + i) * .12 * d / 4, [x, y] = P3(W, H, u, 0, zz); return [x, y, (1.4 + t * 2.2) * U, .35 + .65 * Math.sin(Math.PI * j / n)]; });
    } }))];
  },
  /* ---------- a room: a box of light standing on the court in the court's own perspective ---------- */
  room(e, E, id) {
    const { W, H } = e, U = unit(e);
    const look = (e.light ? { trickroom: ["#D6338A", "#1393C4"], magicroom: ["#7F4FD9", "#C2389E"], wonderroom: ["#1F6FD1", "#14A383"] } : { trickroom: ["#FF6FB0", "#6FE3FF"], magicroom: ["#C79BFF", "#FF9BE6"], wonderroom: ["#6FB8FF", "#9BFFE0"] })[id] || ["#FFFFFF", "#FFFFFF"];
    const X = 1.32, Y = 2.05, ZF = Z_FAR + .5, ZN = 1.3;
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
      for (const z of [4.6, 3.6, 2.8, 2.2]) edge(p(sx * X, 0, z), p(sx * X, Y, z), look[1], 1.6 * U, .45, { delay: 300 });
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
    const zs = [ZF, 4.6, 3.7, 3.0, 2.4, 2.0, 1.6, ZN];
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
  /* 2026-11-07 remake (the user: the field's lasting things did not belong with the court, Sticky Web plainly a vector stamp). Each is
     now drawn in the court's own perspective and painted crisp, as the court's lines are: the stones and caltrops are faceted solids
     lit from the upper left like the HOME renders, each with its shadow on the floor; the web is real silk lying on the floor; a wall is
     a curved pane standing round the side's back, told apart by its pattern (Reflect hexagons in gold, Light Screen a diamond lattice in
     pink, Aurora Veil hanging curtains, Safeguard a dome), never by a bare line over the side. The games hide hazards once set; the stage
     keeps them in view so a player sees what waits on each side */
  stealthrock(e, E, own) {
    // pointed stones hanging round the side's back and flanks, each bobbing slowly over its own shadow
    const pieces = rockPieces(e, own);
    const sh = sheetFor(e, pieces.map(p => p.shadow).flatMap(s => [[s.x - s.rx, s.y - s.ry], [s.x + s.rx, s.y + s.ry]]), 4);
    pieces.forEach(p => paintShadow(sh.g, p.shadow, e.light));
    lay(e, sh);
    for (const p of pieces) {
      const one = pieceSheet(e, p), [x, y, w, h] = one.rect, amp = h * .05, per = p.period, ph = p.phase;
      lay(e, one, T => { const s = Math.sin(T / per + ph); return [x, y + s * amp, w, h, Math.sin(T / per * .7 + ph) * .045]; });
    }
  },
  /* spikes and toxic spikes are counted by their rows (2026-11-06, the user: how many layers are down must read at a glance, as
     Showdown adds a caltrop per layer): each layer is one row of three caltrops at the side's feet, the first in front and each
     next a step behind it, so one, two or three rows are one, two or three layers. With both on a side, spikes keep the left half
     and toxic spikes the right, so neither hides in the other */
  spikes(e, E, own, layers = 1, both = false, toxic = false) {
    const pieces = spikePieces(e, own, layers, both, toxic);
    const sh = sheetFor(e, pieces.flatMap(p => [...p.polys.flatMap(q => q.pts), [p.shadow.x - p.shadow.rx, p.shadow.y + p.shadow.ry]]), 4);
    pieces.forEach(p => paintShadow(sh.g, p.shadow, e.light));
    pieces.forEach(p => paintPolys(sh.g, p.polys));
    lay(e, sh);
    // the up-turned points catch the light now and then
    for (const p of pieces) E({ at: p.tip, tex: "glint", ramp: toxic ? "poison.h" : "glint", size: [1, p.size * .5], life: rand(2200, 4200), loop: true, over: 4200, alpha: .85, layer: 0, grow: true });
  },
  stickyweb(e, E, own) {
    const web = webThreads(e, own);
    const sh = sheetFor(e, web.threads.flatMap(t => t.pts), 4);
    paintWeb(sh.g, web, e.light);
    lay(e, sh);
    // a dew drop on the silk glints now and then
    for (const [x, y, r] of web.drops.filter((_, i) => i % 3 === 0)) E({ at: [x, y], tex: "glint", ramp: e.light ? "ice.h" : "glint", size: [1, r * 9], life: rand(2400, 5200), loop: true, over: 5200, alpha: .9, layer: 0, grow: true });
  },
  screen(e, E, own, id) {
    if (id === "mist") {
      // a low white mist lying over the side's floor, drifting
      const s = sideSpace(e, own), { W, H } = e, U = unit(e);
      for (let i = 0; i < 14; i++) {
        const t = -.6 + i / 13 * (Math.PI + 1.2), rr = rand(.5, 1.1), [x, y] = P3(W, H, (s.X * ACROSS + Math.cos(t) * (s.hw * 1.2 + .1) * rr) / ACROSS, 0, s.Z + Math.sin(t) * (s.hw * .6 + .05) * rr), f = flatAt(H, y) * 1.5, sz = Math.min(s.hw * 1.7 + .2, .9) * F * H / s.Z * rand(.7, 1);
        E({ at: [x, y - sz * f * .15], tex: "cloud", ramp: e.light ? "smoke.l" : "steam", size: [sz * f, sz * f], aspect: 1 / f, bob: [3, 6], period: [5, 8], hold: true, life: 1e7, loop: true, alpha: e.light ? .45 : .58, occ: .55, emis: .3, layer: 0 });
      }
      E({ n: 10, at: () => { const [x, y] = P3(W, H, (s.X * ACROSS + rand(-1.2, 1.2) * s.hw) / ACROSS, 0, s.Z * rand(.95, 1.1)); return [x, y - rand(4, 30) * U]; }, tex: "dot", ramp: e.light ? "rain.l" : "snow", size: [2 * U, 1], vel: () => [rand(-4, 4), rand(-8, -3)], life: [2600, 4200], loop: true, over: 4200, alpha: .7, layer: 0 });
      return;
    }
    const wall = wallShape(e, own, id);
    if (!wall) return;
    const sh = sheetFor(e, wall.outline(), 6);
    paintWall(sh.g, wall, id, e.light);
    lay(e, sh, sh.rect, wall.front);
    // a slow sheen runs along the pane now and then, as light along glass
    const look = WALL_LOOK[id][e.light ? 1 : 0], per = 5200 + wall.i * 900;
    return [e.strip({ dur: Infinity, mode: 1, color: look.line, emis: e.light ? .3 : wall.front ? .2 : .55, occ: e.light ? .6 : wall.front ? .35 : .1, alpha: e.light ? .5 : .4, layer: 0, front: wall.front, points: () => {
      const ph = ((e.T + wall.i * 1700) % per) / per, u = ph / .55;
      if (u > 1) return null;
      const t = lerp(wall.t0, wall.t1, own ? u : 1 - u), env = Math.sin(Math.PI * u), n = 8;
      return Array.from({ length: n + 1 }, (_, j) => { const [x, y] = wall.up(t, j / n); return [x, y, 14 * unit(e) * wall.k, env * (.4 + .6 * Math.sin(Math.PI * j / n))]; });
    } })];
  },
  tailwind(e, E, own) {
    // ribbons of air streaming over the side the way it faces, each a light line that runs across and is gone
    const s = sideSpace(e, own), { W, H } = e, dir = own ? 1 : -1, U = unit(e), color = e.light ? "#3D6FB0" : "#BFE3FF";
    return Array.from({ length: 8 }, (_, i) => {
      const y0 = s.top * (.12 + i * .1), dz = (i % 3 - 1) * s.hw * .35, per = 1500 + i * 210, off = i * 530;
      return e.strip({ dur: Infinity, mode: 1, color, emis: e.light ? .3 : .7, occ: e.light ? .7 : .15, alpha: e.light ? .85 : .8, layer: 0, points: () => {
        const ph = ((e.T + off) % per) / per, n = 22;
        return Array.from({ length: n + 1 }, (_, j) => {
          const u = ph * 1.8 - .4 + j / n * .45, X = s.X * ACROSS + dir * (u - .5) * s.hw * 3.4, wave = Math.sin(u * 7 + i) * .05;
          const [x, y] = P3(W, H, X / ACROSS, y0 + wave, s.Z + dz + Math.cos(u * 4 + i) * s.hw * .2);
          return [x, y, 3 * U, Math.sin(Math.PI * j / n) * clamp(1.3 - Math.abs(u - .5) * 1.8)];
        });
      } });
    });
  },
};
BUILD.toxicspikes = (e, E, own, layers, both) => BUILD.spikes(e, E, own, layers, both, true);

/* ---------------------------------------------------------------- painting a side's things ---------------------------------------------------------------- */
/* All of it in the court's space (arena's P3): X across in the camera's height ("true" units, side lines at ±ACROSS), Y up, Z away.
   Painted once into a canvas finer than the screen and laid on the stage as a decal (gl.js), so a thread or an edge is as crisp as a
   court line; only what moves (a bob, a glint, a sheen) is drawn per frame */
const zAt = (H, y) => F / Math.max(.03, y / H - VP);
// a side in the court's space: X its centre across (side-line units), Z the depth its feet stand at, hw its half width and top its
// tallest Pokémon's height (both in the camera's height)
export function sideSpace(e, own) {
  const { W, H } = e, b = SIDE_OF(e, own), Z = zAt(H, b.bot), k = Z / (F * H);
  return { X: ((b.l + b.r) / 2 - W / 2) * k / ACROSS, Z, hw: (b.r - b.l) / 2 * k, top: Math.max(.2, 1 - (b.top / H - VP) * Z / F), own };
}
// a seeded random, so a side's pieces lie the same way each time they are drawn
const seeded = n => { let s = n; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const mean = ps => ps.reduce((s, p) => add(s, p), [0, 0, 0]).map(v => v / ps.length);
// the light comes from the upper left, a little toward the camera, as on the HOME renders; the camera stands at height 1
const LIGHT = nrm([-.5, .85, -.6]), CAM = [0, 1, 0];

// a canvas over the part of the stage the points cover; g draws in the stage's own pixels
function sheetFor(e, pts, pad = 2) {
  const { W, H } = e;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.max(-W * .2, x0 - pad); y0 = Math.max(-H * .2, y0 - pad); x1 = Math.min(W * 1.2, x1 + pad); y1 = Math.min(H * 1.2, y1 + pad);
  const w = Math.max(2, x1 - x0), h = Math.max(2, y1 - y0), s = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 1.6), Math.sqrt(6e6 / (w * h)));
  const c = document.createElement("canvas"); c.width = Math.ceil(w * s); c.height = Math.ceil(h * s);
  const g = c.getContext("2d"); g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s); g.lineJoin = "round"; g.lineCap = "round";
  return { c, g, rect: [x0, y0, c.width / s, c.height / s] };
}
// lay a painted sheet on the stage as this field's decal: its group fades it in and out with the rest of the field
function lay(e, sh, rect = sh.rect, front = false) { const d = e.decal({ tex: e.texture(sh.c), rect, group: e.fieldGroup, front, alpha: front ? .78 : 1 }); (e.newDecals ||= []).push(d); return d; }
export function pieceSheet(e, p) { const sh = sheetFor(e, p.polys.flatMap(q => q.pts), 3); paintPolys(sh.g, p.polys); return sh; }

// a solid's faces as the camera sees them: the ones turned away dropped, the rest far to near, each shaded flat by the light
function solid(e, verts, faces, rgb, { amb = .4, spec = .35, shine = 28 } = {}) {
  const { W, H } = e, c0 = mean(verts), out = [];
  for (const f of faces) {
    const p = f.map(i => verts[i]), ct = mean(p);
    let n = nrm(cross(sub(p[1], p[0]), sub(p[2], p[0])));
    if (dot(n, sub(ct, c0)) < 0) n = n.map(v => -v);
    const view = sub(CAM, ct);
    if (dot(n, view) <= 0) continue;
    const d = Math.max(0, dot(n, LIGHT)), hl = Math.pow(Math.max(0, dot(n, nrm(add(LIGHT, nrm(view))))), shine) * spec, k = amb + (1 - amb) * d;
    out.push({ pts: p.map(([x, y, z]) => P3(W, H, x / ACROSS, y, z)), fill: `rgb(${rgb.map(c => Math.round(clamp(c * k + 255 * hl, 0, 255)))})`, d: Math.hypot(...view) });
  }
  return out;
}
const farFirst = polys => polys.sort((a, b) => b.d - a.d);
function paintPolys(g, polys) {
  for (const { pts, fill } of polys) {
    g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    // the same colour stroked a hair round each face, so no seam of the floor shows between two faces
    g.fillStyle = fill; g.fill(); g.strokeStyle = fill; g.lineWidth = .6; g.stroke();
  }
}
// a soft shadow lying on the floor under a thing (the light is overhead enough that it falls straight under)
function paintShadow(g, s, light) {
  const c = light ? "8,28,61" : "2,8,22", a = (light ? .2 : .5) * (s.a ?? 1);
  g.save(); g.translate(s.x, s.y); g.scale(1, s.ry / s.rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, s.rx);
  gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(.55, `rgba(${c},${a * .55})`); gr.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = gr; g.fillRect(-s.rx, -s.rx, s.rx * 2, s.rx * 2); g.restore();
}
const shadowAt = (e, x, z, r) => { const [sx, sy] = P3(e.W, e.H, x / ACROSS, 0, z), rx = r * F * e.H / z; return { x: sx, y: sy, rx, ry: rx * flatAt(e.H, sy) * 1.6 }; };

/* Stealth Rock: nine pointed stones round the side's back and flanks (never in front of it, where the Pokémon would hide them),
   each a faceted solid of two tips and a ring of five, tilted its own way, hanging at its own height */
export function rockPieces(e, own) {
  const s = sideSpace(e, own), r = seeded(own ? 5 : 9), n = 9, rx = s.hw * 1.45 + .12, rz = rx * .5, out = [];
  const rgb = e.light ? [168, 140, 100] : [204, 176, 132];
  for (let i = 0; i < n; i++) {
    const t = lerp(-.32, Math.PI + .32, (i + .5) / n) + (r() - .5) * .18, L = .075 + r() * .055;
    const x = s.X * ACROSS + Math.cos(t) * rx * (.88 + r() * .24), z = s.Z + Math.sin(t) * rz * (.88 + r() * .24), y = Math.max(L * 1.3, s.top * (.07 + r() * .18));
    const v0 = [[0, L * (1 + r() * .5), 0], [0, -L * (.6 + r() * .4), 0]];
    for (let m = 0; m < 5; m++) { const a = m / 5 * Math.PI * 2 + r() * .5, rad = L * (.45 + r() * .25); v0.push([Math.cos(a) * rad, (r() - .5) * L * .3, Math.sin(a) * rad]); }
    const tz = (r() - .5) * 1.2, tx = (r() - .5) * .8, yaw = r() * 6;
    const rot = ([a, b, c]) => {
      [a, b] = [a * Math.cos(tz) - b * Math.sin(tz), a * Math.sin(tz) + b * Math.cos(tz)];
      [b, c] = [b * Math.cos(tx) - c * Math.sin(tx), b * Math.sin(tx) + c * Math.cos(tx)];
      [a, c] = [a * Math.cos(yaw) - c * Math.sin(yaw), a * Math.sin(yaw) + c * Math.cos(yaw)];
      return [a + x, b + y, c + z];
    };
    const faces = [];
    for (let m = 0; m < 5; m++) faces.push([2 + m, 2 + (m + 1) % 5, 0], [2 + (m + 1) % 5, 2 + m, 1]);
    out.push({ polys: farFirst(solid(e, v0.map(rot), faces, rgb, { amb: .42, spec: .22, shine: 18 })), shadow: { ...shadowAt(e, x, z, L * (.7 + y * 1.2)), a: clamp(.9 - y * 1.6, .35, .8) }, z, period: (2400 + r() * 1600) / (Math.PI * 2), phase: r() * 6 });
  }
  return out.sort((a, b) => b.z - a.z);
}

/* a caltrop: four points along a tetrahedron's corners, three resting on the floor and one standing up, each point a four-sided
   pyramid of polished iron (toxic ones violet) */
export function spikePieces(e, own, layers = 1, both = false, toxic = false, onlyRow = -1) {
  const s = sideSpace(e, own), rows = Math.min(toxic ? 2 : 3, layers), r = seeded((own ? 11 : 17) + (toxic ? 6 : 0)), cx = s.X * ACROSS;
  const span = both ? s.hw * 1.2 : s.hw * 2.4, x0 = both ? (toxic ? cx + s.hw * .05 : cx - s.hw * 1.25) : cx - s.hw * 1.2;
  const rgb = toxic ? (e.light ? [140, 62, 200] : [178, 104, 236]) : (e.light ? [112, 124, 146] : [156, 168, 190]), out = [];
  for (let row = 0; row < rows; row++) for (let i = 0; i < 3; i++) {
    const yaw = r() * 7, L = .14 * (1 - row * .07);
    if (onlyRow >= 0 && row !== onlyRow) continue;
    const x = x0 + span * (i + .5 + (row % 2) * .25) / 3, z = s.Z * (.93 + row * .065), c = [x, L / 3, z];
    const dirs = [[0, 1, 0], ...[0, 1, 2].map(j => [.943 * Math.cos(yaw + j * 2.094), -1 / 3, .943 * Math.sin(yaw + j * 2.094)])];
    let polys = [];
    for (const d of dirs) {
      const a = nrm(cross(d, Math.abs(d[1]) > .9 ? [1, 0, 0] : [0, 1, 0])), b = cross(d, a), base = sub(c, d.map(v => v * L * .08));
      const verts = [0, 1, 2, 3].map(m => { const q = m / 4 * Math.PI * 2 + .785; return add(base, add(a.map(v => v * Math.cos(q) * L * .17), b.map(v => v * Math.sin(q) * L * .17))); });
      verts.push(add(c, d.map(v => v * L)));
      polys = polys.concat(solid(e, verts, [0, 1, 2, 3].map(m => [m, (m + 1) % 4, 4]), rgb, toxic ? { amb: .42, spec: .3, shine: 24 } : { amb: .36, spec: .55, shine: 34 }));
    }
    const [tx, ty] = P3(e.W, e.H, x / ACROSS, L / 3 + L, z);
    out.push({ polys: farFirst(polys), shadow: shadowAt(e, x, z, L * 1.15), tip: [tx, ty], size: L * F * e.H / z, z, row });
  }
  return out.sort((a, b) => b.z - a.z);
}

/* Sticky Web: an orb web lying on the side's floor in the court's perspective: fifteen spokes, a frame between their ends, a capture
   spiral sagging a little between spokes as silk does, a dense hub, a few anchor lines run out over the floor, dew on some crossings.
   The threads come in the order a spider lays them (anchors, frame, spokes, spiral, hub), so the cast can spin it in that order */
export function webThreads(e, own) {
  const { W, H } = e, s = sideSpace(e, own), r = seeded(own ? 23 : 29);
  const cx = s.X * ACROSS, cz = s.Z + s.hw * .1, R = clamp(s.hw * 1.3 + .1, .3, .95), Rz = Math.max(.2, Math.min(R * .95, Z_FAR + .15 - cz));
  const fl = (a, f) => [cx + Math.cos(a) * f * R, cz + Math.sin(a) * f * Rz], proj = ([x, z]) => P3(W, H, x / ACROSS, 0, z);
  const wAt = z => clamp(.0026 * F * H / z, .6, 1.7);
  const N = 15, ang = [], end = [], threads = [], drops = [];
  for (let i = 0; i < N; i++) { ang.push(i / N * Math.PI * 2 + (r() - .5) * .16); end.push(.9 + r() * .1); }
  const bend = (A, B, sag, k = 6) => {
    const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], c = [m[0] + (cx - m[0]) * sag, m[1] + (cz - m[1]) * sag];
    return Array.from({ length: k + 1 }, (_, j) => { const t = j / k, u = 1 - t; return [u * u * A[0] + 2 * u * t * c[0] + t * t * B[0], u * u * A[1] + 2 * u * t * c[1] + t * t * B[1]]; });
  };
  const push = (fp, a, kind) => { const z = fp.reduce((q, p) => q + p[1], 0) / fp.length, A = fp[0], B = fp.at(-1); threads.push({ pts: fp.map(proj), w: wAt(z), a, ang: Math.atan2(B[1] - A[1], B[0] - A[0]), kind }); };
  for (const i of [1, 5, 9, 12]) push([fl(ang[i], end[i]), fl(ang[i] + (r() - .5) * .2, 1.22)], .45, "anchor");
  for (let i = 0; i < N; i++) push(bend(fl(ang[i], end[i]), fl(ang[(i + 1) % N], end[(i + 1) % N]), .06), .9, "frame");
  for (let i = 0; i < N; i++) push([fl(ang[i], .03), fl(ang[i], end[i])], 1, "spoke");
  const K = 10, f0 = .2, f1 = .86;
  for (let k = 0; k < K; k++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, A = fl(ang[i], (f0 + (f1 - f0) * (k + i / N) / K) * end[i]), B = fl(ang[j], (f0 + (f1 - f0) * (k + (i + 1) / N) / K) * end[j]);
    push(bend(A, B, .05, 4), .85, "spiral");
    if (r() < .3) { const [x, y] = proj(A); drops.push([x, y, wAt(A[1]) * 1.3]); }
  }
  for (const f of [.06, .1, .14]) for (let i = 0; i < N; i++) push([fl(ang[i], f * (.9 + r() * .2)), fl(ang[(i + 1) % N], f * (.9 + r() * .2))], .9, "hub");
  return { threads, drops, center: proj([cx, cz]) };
}
const hemOf = t => .08 + .03 * Math.sin(t * 9);
const LIGHT_ACROSS = Math.atan2(-.6, -.5);
function paintWeb(g, web, light) {
  // silk shines where it lies across the light and goes quiet where it runs along it
  for (const pass of [0, 1]) for (const t of web.threads) {
    const a = t.a * (.45 + .55 * Math.pow(Math.abs(Math.sin(t.ang - LIGHT_ACROSS)), 3));
    g.beginPath(); t.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    if (pass === 0) { g.strokeStyle = light ? `rgba(8,28,61,${.05 * a})` : `rgba(190,215,255,${.12 * a})`; g.lineWidth = t.w * 3.4; }
    else { g.strokeStyle = light ? `rgba(36,58,96,${.78 * a})` : `rgba(238,244,255,${.82 * a})`; g.lineWidth = t.w; }
    g.stroke();
  }
  for (const [x, y, rr] of web.drops) {
    g.fillStyle = light ? "rgba(52,84,132,.9)" : "rgba(236,244,255,.95)"; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.arc(x - rr * .35, y - rr * .35, rr * .4, 0, Math.PI * 2); g.fill();
  }
}

/* a wall round a side: a pane standing on an arc of the floor behind the side and round its flanks (the back half of an ellipse
   about its feet), as high as most of its tallest Pokémon. Several stand one outside another */
export const WALL_LOOK = {
  reflect: [{ line: "#FFD45A" }, { line: "#A87400" }],
  lightscreen: [{ line: "#FF9BE0" }, { line: "#C2389E" }],
  auroraveil: [{ line: "#8FFFD8", curtain: [[125, 255, 178], [111, 227, 255], [199, 155, 255]] }, { line: "#14A383", curtain: [[20, 163, 131], [19, 147, 196], [127, 79, 217]] }],
  safeguard: [{ line: "#E6B8FF" }, { line: "#8A4FD0" }],
};
export function wallShape(e, own, id) {
  const i = ["reflect", "lightscreen", "auroraveil", "safeguard"].indexOf(id);
  if (i < 0) return null;
  const { W, H } = e, s = sideSpace(e, own), grow = 1 + i * .1;
  /* the pane stands between the side and its opponent (2026-11-07, the user: the foe's wall faced the same way as ours, guarding
     Charizard's back instead of Tyranitar's front): our side's on the far half of the ellipse, toward the centre, behind our Pokémon;
     the foe's on the near half, toward us, so it is drawn in front of their Pokémon, glass between them and us */
  const fz = own ? 1 : -1;
  const rx = (s.hw * 1.12 + .1) * grow, rz = rx * .5, cx = s.X * ACROSS, cz = s.Z + fz * rz * .1, h = clamp(s.top * (id === "safeguard" ? .62 : .44 + i * .05), .2, 1.1);
  const dome = id === "safeguard", t0 = dome ? 0 : -.2, t1 = dome ? Math.PI : Math.PI + .2;
  const at = (t, y) => P3(W, H, (cx + Math.cos(t) * rx) / ACROSS, y, cz + fz * Math.sin(t) * rz);
  const atD = (t, p) => P3(W, H, (cx + Math.cos(t) * rx * Math.cos(p)) / ACROSS, h * Math.sin(p), cz + fz * Math.sin(t) * rz * Math.cos(p));
  // Aurora Veil's hem waves; the others stand level
  const top = t => (id === "auroraveil" ? h * (.86 + .1 * Math.sin(t * 3.1 + .6)) : h);
  // a point a share u up the wall at t: up the pane, or up the dome's meridian
  const up = (t, u) => (dome ? atD(t, u * Math.PI / 2) : at(t, top(t) * u));
  const outline = () => Array.from({ length: 33 }, (_, j) => { const t = lerp(t0, t1, j / 32); return [at(t, 0), up(t, 1), up(t, .5)]; }).flat().concat(dome ? [atD(0, Math.PI / 2)] : []);
  const px = F * H / (cz + rz * .5);
  // the arc's true length along the floor, and the angle a length along it reaches (so a pattern on the pane keeps its shape)
  const lens = [0], NS = 160;
  for (let j = 1; j <= NS; j++) { const a = lerp(t0, t1, (j - 1) / NS), b = lerp(t0, t1, j / NS); lens.push(lens[j - 1] + Math.hypot((Math.cos(b) - Math.cos(a)) * rx, (Math.sin(b) - Math.sin(a)) * rz)); }
  const arcLen = lens[NS];
  const tOf = sa => { const v = clamp(sa, -arcLen, arcLen * 2); if (v <= 0) return t0 + v / arcLen * (t1 - t0); if (v >= arcLen) return t1 + (v - arcLen) / arcLen * (t1 - t0); let j = 1; while (lens[j] < v) j++; return lerp(t0, t1, (j - 1 + (v - lens[j - 1]) / (lens[j] - lens[j - 1])) / NS); };
  return { i, id, at, atD, up, top, t0, t1, h, dome, outline, px, k: clamp(px / 150, .6, 2.2), own, front: !own, arcLen, tOf };
}
// a sheet over the whole floor, from the court's far edge to past the stage's bottom
function floorSheet(e) { const { W, H } = e, y0 = P3(W, H, 0, 0, Z_FAR + .2)[1]; return sheetFor(e, [[-W * .2, y0], [W * 1.2, H * 1.2]], 0); }
// fine blades of grass standing in the floor: an even scatter over the picture, each blade as long as the floor is near
function paintBlades(g, e) {
  const { W, H } = e, y0 = P3(W, H, 0, 0, Z_FAR + .2)[1], r = seeded(61), step = 4.6;
  const cols = e.light ? ["rgba(30,140,80,.3)", "rgba(18,108,62,.34)", "rgba(86,184,112,.26)"] : ["rgba(64,200,120,.3)", "rgba(36,156,92,.36)", "rgba(132,232,156,.22)"];
  const paths = cols.map(() => new Path2D());
  for (let y = y0 + 1; y < H * 1.05; y += step * .6) for (let x = -W * .1; x < W * 1.1; x += step) {
    const px = x + (r() - .5) * step, py = y + (r() - .5) * step * .6, Z = zAt(H, py), len = .02 * F * H / Z * (.6 + r() * .7), lean = (r() - .5) * len * .7, p = paths[Math.floor(r() * 3)];
    p.moveTo(px, py); p.quadraticCurveTo(px + lean * .2, py - len * .6, px + lean, py - len);
  }
  g.lineWidth = clamp(H / 900, .55, 1.1);
  paths.forEach((p, i) => { g.strokeStyle = cols[i]; g.stroke(p); });
}
// a diamond lattice painted in the floor in the court's perspective (straight on the floor, so straight on the screen too)
function paintLattice(g, e) {
  const { W, H } = e, d = .24, Z0 = 1.2, Z1 = Z_FAR + .2;
  g.strokeStyle = e.light ? "rgba(120,140,0,.22)" : "rgba(232,255,106,.15)"; g.lineWidth = clamp(H / 700, .6, 1.2);
  g.beginPath();
  for (let c0 = -4; c0 < 4 + Z1; c0 += d) for (const m of [1, -1]) {
    const [ax, ay] = P3(W, H, (c0 - m * Z0) / ACROSS, 0, Z0), [bx, by] = P3(W, H, (c0 - m * Z1) / ACROSS, 0, Z1);
    g.moveTo(ax, ay); g.lineTo(bx, by);
  }
  g.stroke();
}
// the wall painted on its own, for the cast to raise before the field keeps it
export function wallSheet(e, own, id) {
  const wall = wallShape(e, own, id);
  if (!wall) return null;
  const sh = sheetFor(e, wall.outline(), 6);
  paintWall(sh.g, wall, id, e.light);
  return { sh, wall, color: WALL_LOOK[id][e.light ? 1 : 0].line };
}
function paintWall(g, wall, id, light) {
  const look = WALL_LOOK[id][light ? 1 : 0], [R, G, B] = rgbOf(look.line), c = a => `rgba(${R},${G},${B},${a})`;
  const { at, up, t0, t1 } = wall, lw = clamp(.0032 * wall.px, .7, 2), n = 48, ts = Array.from({ length: n + 1 }, (_, j) => lerp(t0, t1, j / n));
  const path = pts => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
  // a lit edge: a soft breadth of light round a fine line, as the edge of glass catches it
  const edge = (pts, a, w = lw) => { path(pts); g.strokeStyle = c(a * .14); g.lineWidth = w * 4.5; g.stroke(); path(pts); g.strokeStyle = c(a); g.lineWidth = w; g.stroke(); };
  const fill = light ? .06 : .07, graze = light ? .07 : .09;
  if (wall.dome) {
    // Safeguard: a dome of fine meridians and two rings, its glass faint
    const M = 8;
    for (let m = 0; m < M; m++) {
      const ta = lerp(t0, t1, m / M), tb = lerp(t0, t1, (m + 1) / M);
      const side = Array.from({ length: 13 }, (_, j) => wall.atD(ta, j / 12 * Math.PI / 2)), back = Array.from({ length: 13 }, (_, j) => wall.atD(tb, (12 - j) / 12 * Math.PI / 2));
      path([...side, ...back]); g.closePath(); g.fillStyle = c(fill + graze * Math.pow(Math.abs(Math.cos((ta + tb) / 2)), 2)); g.fill();
    }
    for (let m = 0; m <= M; m++) edge(Array.from({ length: 17 }, (_, j) => wall.atD(lerp(t0, t1, m / M), j / 16 * Math.PI / 2)), m === 0 || m === M ? .8 : .45);
    for (const p of [Math.PI / 6, Math.PI / 3]) edge(ts.map(t => wall.atD(t, p)), .45);
    edge(ts.map(t => at(t, 0)), .75, lw * 1.2);
    return;
  }
  // the pane: faint glass, a little more of it seen toward its ends, where it turns away from the camera
  path([...ts.map(t => at(t, 0)), ...ts.slice().reverse().map(t => up(t, 1))]); g.closePath(); g.fillStyle = c(fill); g.fill();
  for (let j = 0; j < n; j++) {
    const a = Math.pow(Math.abs(Math.cos((ts[j] + ts[j + 1]) / 2)), 3) * graze;
    if (a < .004) continue;
    path([at(ts[j], 0), at(ts[j + 1], 0), up(ts[j + 1], 1), up(ts[j], 1)]); g.closePath(); g.fillStyle = c(a); g.fill();
  }
  g.save();
  path([...ts.map(t => at(t, 0)), ...ts.slice().reverse().map(t => up(t, 1))]); g.closePath(); g.clip();
  // the pattern is laid along the arc as if printed on the glass: s along the floor's arc (0..1 of it), y up in the camera's height
  const L = wall.arcLen, toPt = (sa, y) => at(wall.tOf(sa), y), h = wall.h;
  // where the pane turns away toward its ends the pattern crowds, so it fades there and the glass alone shows
  const face = sa => .25 + .75 * Math.pow(Math.abs(Math.sin(wall.tOf(sa))), 1.5);
  g.lineWidth = lw;
  if (id === "reflect") {
    // hexagons, the shield's own pattern
    const rh = h / 3.4, hw = Math.sqrt(3) * rh;
    g.strokeStyle = c(.38);
    for (let row = -1; row * rh * 1.5 < h + rh; row++) for (let col = -1; col * hw < L + hw; col++) {
      const x0 = col * hw + (row & 1 ? hw / 2 : 0), y0 = row * rh * 1.5;
      const vs = Array.from({ length: 7 }, (_, k2) => { const a = Math.PI / 3 * k2 + Math.PI / 6; return [x0 + Math.cos(a) * rh * .92, y0 + Math.sin(a) * rh * .92]; });
      g.strokeStyle = c(.4 * face(x0));
      g.beginPath();
      for (let k2 = 0; k2 < 6; k2++) for (let q = 0; q <= 3; q++) { const [px, py] = toPt(lerp(vs[k2][0], vs[k2 + 1][0], q / 3), lerp(vs[k2][1], vs[k2 + 1][1], q / 3)); if (!k2 && !q) g.moveTo(px, py); else g.lineTo(px, py); }
      g.closePath(); g.stroke();
    }
  } else if (id === "lightscreen") {
    // a diamond lattice
    const d = h / 1.7;
    g.strokeStyle = c(.38);
    for (let c0 = -h; c0 < L + h; c0 += d) for (const m of [1, -1]) for (let j = 0; j < 8; j++) {
      const ya = h * j / 8, yb = h * (j + 1) / 8;
      path([toPt(c0 + m * ya, ya), toPt(c0 + m * yb, yb)]); g.strokeStyle = c(.4 * face(c0 + m * (ya + yb) / 2)); g.stroke();
    }
  } else if (id === "auroraveil") {
    // curtains of aurora: a dense fall of soft rays from a bright hem, green through blue to violet along the arc, all fading by the
    // same share of the curtain's smooth top so they merge into one folded veil (rays of their own heights read as a sound meter)
    const C3 = look.curtain, M = 420, rr = seeded(41 + wall.i);
    for (let j = 0; j < M; j++) {
      const t = lerp(t0, t1, (j + rr()) / M), q0 = (t - t0) / (t1 - t0), u = (Math.sin(q0 * 9.4 + 1.3) + 1) / 2, v = (Math.sin(q0 * 4.1) + 1) / 2;
      const col = C3[0].map((_, q) => Math.round(lerp(lerp(C3[0][q], C3[1][q], u), C3[2][q], v * .8)));
      const fold = .55 + .45 * Math.pow((Math.sin(q0 * 31 + Math.sin(q0 * 13) * 2) + 1) / 2, 2);
      const hem = wall.top(t) * hemOf(t), [hx, hy] = at(t, hem), [tx, ty] = up(t, 1), a = (light ? .24 : .22) * face(wall.arcLen * q0) * fold * (.8 + .2 * rr());
      const gr = g.createLinearGradient(hx, hy, tx, ty); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.18, `rgba(${col},${a * .55})`); gr.addColorStop(.7, `rgba(${col},${a * .12})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.strokeStyle = gr; g.lineWidth = lw * 3; g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
    }
  }
  g.restore();
  // the pane's frame: its foot on the floor, its two ends, its top
  edge(ts.map(t => at(t, 0)), .7, lw * 1.2);
  if (id !== "auroraveil") { edge(ts.map(t => up(t, 1)), .8); for (const t of [t0, t1]) edge([at(t, 0), up(t, 1)], .75); }
  else edge(ts.map(t => at(t, wall.top(t) * hemOf(t))), .45);
}
// a terrain's colour laid over the floor: one even, flat tint of the whole floor (never soft blobs, which read as stains)
const TINT = { "electric.h": "#D8F03A", "grass.d": "#22B47A", "grass.h": "#3A9A32", "fairy.h": "#FF8AE8", "psychic.h": "#FF4F93" };
function floorTint(e, E, ramp, k = 1) {
  const { W, H } = e, y0 = P3(W, H, 0, 0, Z_FAR + .2)[1], L = -W * .2, R = W * 1.2, B = H * 1.2;
  e.extra.push(e.strip({ dur: Infinity, quad: () => [[L, y0], [R, y0], [R, B], [L, B]], color: TINT[ramp] || "#FFFFFF", emis: e.light ? .2 : .5, occ: e.light ? .5 : .15, alpha: Math.min(.32, (e.light ? .07 : .06) * k), layer: 0 }));
}

const WEATHER = { raindance: ["rain"], primordialsea: ["rain", true], sunnyday: ["sun"], desolateland: ["sun", true], sandstorm: ["sand"], snowscape: ["snow"], snow: ["snow"], hail: ["snow", true], deltastream: ["wind"] };
const GRADE = {
  rain: { mR: .82, mG: .87, mB: .98, sat: .88 }, sun: { mR: 1.14, mG: 1.05, mB: .84, aR: .04, aG: .02, sat: 1.08 }, sand: { mR: 1.06, mG: .96, mB: .8, aR: .02, aG: .01, sat: .92 },
  snow: { mR: .95, mG: 1, mB: 1.08, aR: .02, aG: .03, aB: .05, sat: .88 }, wind: { mR: .98, mG: .99, mB: 1.01 }, gravity: { mR: .94, mG: .93, mB: .98 },
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
    if (it) { it.strips?.forEach(s => { s.dead = true; }); it.decals?.forEach(d => e.dropDecal(d)); }
    const g = it?.g || free(), fresh = !it;
    it = { key, g, args, to: 1, leaving: false, data: null, strips: null, decals: null };
    if (fresh) e.groups[g] = 0;
    const start = e.fieldCount;
    // on paper a light that only adds is invisible: every field piece also covers what is under it there, and stands a little stronger
    const onPaper = spec => (e.light ? { occ: Math.max(spec.occ || 0, .7), alpha: typeof spec.alpha === "number" ? Math.min(1, spec.alpha * 1.35) : spec.alpha } : {});
    // a field that stays always lies behind the Pokémon: whatever stands in front of them is a move's, never the field's (2026-11-06, the user)
    const E = spec => e.emit({ ...spec, ...onPaper(spec), layer: 0, field: true, group: g });
    e.extra = []; e.newDecals = []; e.fieldGroup = g;
    it.strips = [...(BUILD[args[0]]?.(e, E, ...args.slice(1)) || []), ...e.extra];
    it.decals = e.newDecals; e.newDecals = null;
    // only the foe's wall stands in front of its Pokémon (it guards them from us); everything else stays behind
    for (const s of it.strips) s.layer = s.front ? 1 : 0;
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
      if (it.leaving && e.groups[it.g] < .01) { e.groups[it.g] = 0; it.strips?.forEach(s => { s.dead = true; }); it.decals?.forEach(d => e.dropDecal(d)); e.fieldItems.delete(key); gone = true; }
    }
    if (gone) compose(e);
    if (e.gradeTo) for (const key in e.gradeTo) e.gradeBase[key] += (e.gradeTo[key] - e.gradeBase[key]) * k;
  };
  e.paint();
});
