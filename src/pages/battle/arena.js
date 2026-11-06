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
  dark: { ground: "#081C3D", line: "rgba(214,226,245,.55)" },
  light: { ground: "#F3F5F8", line: "rgba(8,28,61,.42)" },
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
  // the court: its side lines, far line and middle line, and one centre circle
  const fp = (u, t) => floorAt(W, H, u, t);
  const path = (fn, n = 48) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
  g.lineCap = "round"; g.lineJoin = "round";
  const line = (pts, w) => { g.strokeStyle = P.line; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  const lw = Math.max(1.5, W / 520);
  line(path(t => fp(-1, t * 1.1)), lw); line(path(t => fp(1, t * 1.1)), lw); line([fp(-1, 0), fp(1, 0)], lw);
  line(path(u => fp(-1 + u * 2, .5)), lw * .9);
  const circle = R0 => path(a => { const th = a * Math.PI * 2; return P3(W, H, Math.cos(th) * R0, 0, 4.1 + Math.sin(th) * R0); }, 96);
  line(circle(.34), lw * .9);

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
  rain(e, E, heavy) {
    // a real downpour: dense slanted rain behind the Pokémon, a thinner veil in front, splashes all over the floor, a low grey sky
    const { W, H } = e, U = unit(e), ramp = e.light ? "rain.l" : "rain";
    for (const [n, far] of [[heavy ? 320 : 240, true], [heavy ? 140 : 100, false]]) {
      const v = far ? 1150 : 1600, life = H * 1.35 / v * 1000;
      E({ n, at: () => [rand(-.15, 1.2) * W, -H * .15], vel: () => [-v * .16, v * rand(.92, 1.08)], tex: "streak", ramp, size: [(far ? 1.5 : 1.9) * U * (e.light ? 1.3 : 1), (far ? 1.5 : 1.9) * U * (e.light ? 1.3 : 1)], aspect: far ? 16 : 24, face: true, life, loop: true, over: life, alpha: far ? .55 : .38, emis: e.light ? .15 : .55, occ: e.light ? .6 : .15, layer: far ? 0 : 1 });
    }
    E({ n: 110, at: () => floorAt(W, H, rand(-1.5, 1.5), rand(.02, 1.05)), tex: "ring", ramp: "white", size: [2 * U, 16 * U], aspect: 2.8, life: [320, 520], loop: true, over: 600, alpha: e.light ? .7 : .45, emis: e.light ? 0 : .7, occ: e.light ? .4 : 0, layer: 0, grow: true });
    E({ n: 60, at: () => floorAt(W, H, rand(-1.4, 1.4), rand(.05, 1)), tex: "drop", ramp: e.light ? "rain.l" : "spray", vel: () => [rand(-30, 30), -rand(60, 120)], acc: [0, 600], face: true, rot: -Math.PI / 2, aspect: .72, size: [3 * U, 2 * U], life: [260, 380], loop: true, over: 400, alpha: .6, emis: .5, occ: .3, layer: 0 });
    E({ n: 9, at: () => [rand(0, 1) * W, rand(-.1, .08) * H], tex: "cloud", ramp: e.light ? "smoke.l" : "smoke", size: [W * .5, W * .5], aspect: 2.6, life: 18000, loop: true, over: 18000, vel: () => [rand(10, 20), 0], wrap: true, alpha: .7, occ: .8, emis: 0, layer: 0 });
  },
  sun(e, E, harsh) {
    // harsh sunlight: a blazing sun in the top corner with its flare and turning rays, long shafts of warm light falling across the
    // field behind the Pokémon, the air thick with drifting glints, and the whole picture warmed
    const { W, H } = e, U = unit(e), sx = W * .1, sy = -H * .02;
    E({ at: [sx, sy], tex: "glow", ramp: e.light ? "gold" : "sunray", size: [W * 1.1, W * 1.1], hold: true, life: 1e7, loop: true, alpha: harsh ? .95 : .8, emis: e.light ? .6 : 1, occ: e.light ? .3 : 0, layer: 0 });
    E({ at: [sx, sy], tex: "glow", ramp: "gold", size: [W * .32, W * .32], hold: true, life: 1e7, loop: true, alpha: .9, emis: 1, occ: e.light ? .3 : 0, layer: 1 });
    E({ at: [sx, sy], tex: "dot", ramp: "white.h", size: [W * .09, W * .09], hold: true, life: 1e7, loop: true, alpha: 1, emis: 1, layer: 1 });
    // its rays: two crowns turning slowly against each other, breathing
    for (const [n, len, spin, a] of [[12, .34, .05, .5], [8, .5, -.03, .3]]) E({ n, at: [sx, sy], tex: "streak", ramp: "sunlit", size: [W * len / 7, W * len / 7], aspect: 7, each: i => ({ rot: i / n * Math.PI * 2 }), spin, life: [5200, 7000], loop: true, over: 7000, alpha: a, emis: e.light ? .5 : 1, occ: e.light ? .25 : 0, layer: 1 });
    // shafts of light falling across the field from it, behind the Pokémon
    for (let i = 0; i < 6; i++) { const ang = .55 + i * .11, len = H * 1.6; E({ at: [sx + Math.cos(ang) * len / 2, sy + Math.sin(ang) * len / 2], tex: "streak", ramp: "sunlit", size: [len / 9, len / 9], aspect: 9, rot: ang, life: 6000 + i * 700, loop: true, over: 6000, alpha: .16, emis: e.light ? .4 : .9, occ: e.light ? .2 : 0, layer: 0 }); }
    // a flare: ghosts of the sun strung along the line from it through the middle of the picture, small and faint
    for (const [t, sz, tex] of [[.35, .05, "hex"], [.55, .028, "dot"], [.75, .07, "hex"], [1.05, .04, "ring"]]) E({ at: [lerp(sx, W * .55, t * 1.6), lerp(sy, H * .6, t * 1.6)], tex, ramp: "gold", size: [W * sz, W * sz], hold: true, life: 1e7, loop: true, alpha: .18, emis: 1, layer: 1 });
    E({ n: 40, at: () => [rand(0, 1) * W, rand(.1, 1) * H], tex: "glow", ramp: "gold", size: [3 * U, 1], vel: () => [rand(-6, 6), rand(-26, -10)], bob: [4, 10], period: [3, 6], life: [3000, 5000], loop: true, over: 5000, alpha: .55, layer: 0 });
  },
  sand(e, E) {
    const { W, H } = e, U = unit(e);
    for (const [n, layer, a] of [[100, 0, .55], [40, 1, .3]]) E({ n, at: () => [rand(-.1, 1.1) * W, rand(-.05, 1.05) * H], vel: () => { const v = rand(900, 1400); return [v, v * .08]; }, tex: "streak", ramp: "sand", size: [1.6 * U, 1.6 * U], aspect: [5, 12], face: true, life: [1200, 1800], loop: true, over: 1800, wrap: true, alpha: a, occ: .5, emis: .2, layer });
    E({ n: 7, at: () => [rand(0, 1) * W, rand(.15, .45) * H], tex: "cloud", ramp: "dust", size: [W * .45, W * .45], aspect: 1.8, vel: () => [rand(200, 320), 0], wrap: true, life: [5000, 8000], loop: true, over: 8000, alpha: .28, occ: .5, emis: .05, layer: 0 });
  },
  snow(e, E, hail) {
    const { W, H } = e, U = unit(e), ramp = e.light ? "ice.h" : "snow";
    if (hail) E({ n: 110, at: () => [rand(-.1, 1.2) * W, -H * .1], vel: () => [-110, rand(620, 760)], tex: "shard", ramp: "ice.h", size: [4 * U, 4 * U], aspect: .55, face: true, rot: Math.PI / 2, life: H * 1.25 / 690 * 1000, loop: true, over: 1800, alpha: .5, emis: .5, occ: .35, layer: 1 });
    else {
      E({ n: 60, at: () => [rand(-.1, 1.1) * W, -H * .08], vel: () => [rand(-30, 20), rand(70, 120)], tex: "flake", ramp, size: [[4 * U, 7 * U], "same"], spin: [-1, 1], bob: [8, 18], period: [2.4, 4], life: [9000, 13000], loop: true, over: 13000, alpha: .7, emis: .5, occ: .35, layer: 1 });
      E({ n: 110, at: () => [rand(-.1, 1.1) * W, -H * .08], vel: () => [rand(-20, 10), rand(40, 70)], tex: "dot", ramp, size: [2.2 * U, 2.2 * U], bob: [5, 10], period: [3, 5], life: [16000, 24000], loop: true, over: 24000, alpha: .6, emis: .5, occ: .3, layer: 0 });
    }
    E({ n: 6, at: () => [rand(0, 1) * W, rand(.4, .5) * H], tex: "cloud", ramp: "steam", size: [W * .5, W * .5], aspect: 3, vel: () => [rand(10, 22), 0], wrap: true, life: 20000, loop: true, over: 20000, alpha: .22, occ: .3, emis: .2, layer: 0 });
  },
  wind(e, E) {
    const { W, H } = e;
    E({ n: 40, at: () => [rand(-.1, 1.1) * W, rand(0, 1) * H], vel: () => [rand(1400, 1900), rand(-60, 60)], tex: "streak", ramp: e.light ? "flying.h" : "white", size: [1.4, 1.4], aspect: [20, 40], face: true, life: [700, 1100], loop: true, over: 1100, wrap: true, alpha: .2, layer: 0 });
  },
  /* ---------- terrain: the floor takes the colour and a quiet life of its own, all of it under the Pokémon ---------- */
  electricterrain(e, E) {
    // the floor charged: a yellow cast over it, yellow bolts snapping across it here and there, yellow sparks rising off it
    const { W, H } = e, U = unit(e);
    floorTint(e, E, "electric.h", 1.4);
    E({ n: 26, at: () => floorAt(W, H, rand(-1.4, 1.4), rand(.04, 1.02)), tex: "bolt", ramp: e.light ? "electric.d" : "electric.h", each: () => ({ size: [rand(10, 20) * U, "same"], rot: rand(-1.2, 1.2) }), life: [900, 1800], loop: true, over: 1800, alpha: .85, emis: e.light ? .5 : 1, occ: e.light ? .5 : 0, layer: 0 });
    E({ n: 30, at: () => floorAt(W, H, rand(-1.3, 1.3), rand(.05, 1)), tex: "spark", ramp: e.light ? "electric.d" : "electric.h", size: [7 * U, 1], vel: () => [rand(-8, 8), rand(-50, -24)], life: [800, 1500], loop: true, over: 1500, alpha: .75, emis: 1, occ: e.light ? .4 : 0, layer: 0 });
    E({ n: 18, at: () => floorAt(W, H, rand(-1.3, 1.3), rand(.05, 1)), tex: "glow", ramp: "electric.h", size: [14 * U, 2], life: [500, 1100], loop: true, over: 1100, alpha: .5, emis: 1, occ: e.light ? .3 : 0, layer: 0 });
  },
  grassyterrain(e, E) {
    // a lawn grown over the court: dense fine tufts in two greens, each swaying on its own, larger toward the camera, a few small
    // flowers in it, and pollen drifting up off it
    const { W, H } = e, U = unit(e);
    floorTint(e, E, "grass.d", e.light ? 2.2 : 3.4);
    const spots = [];
    for (let i = 0; i < 520; i++) spots.push([rand(-1.6, 1.6), Math.pow(rand(0, 1), .8) * 1.05 + .02]);
    spots.sort((a, b) => a[1] - b[1]); // far first, so nearer tufts lie over farther ones
    for (const [u, t] of spots) {
      const [x, y] = floorAt(W, H, u, t), sz = lerp(5, 24, t) * U * rand(.8, 1.25);
      E({ at: [x, y - sz * .42], tex: "tuft", ramp: Math.random() < .6 ? "grass.d" : "grass.l", size: [sz, sz], aspect: rand(1, 1.5), hold: true, life: 1e7, loop: true, alpha: rand(.7, .95), occ: .95, emis: .12, bob: sz * .05, period: rand(2.6, 4.2), layer: 0 });
    }
    for (let i = 0; i < 26; i++) { const t = rand(.15, 1), [x, y] = floorAt(W, H, rand(-1.3, 1.3), t), sz = lerp(4, 11, t) * U; E({ at: [x, y - sz * 1.4], tex: "flower", ramp: ["white.h", "electric.h", "fairy.h"][i % 3], size: [sz, sz], hold: true, life: 1e7, loop: true, alpha: .9, occ: .9, emis: .3, bob: sz * .15, period: rand(2.8, 4), layer: 0 }); }
    E({ n: 24, at: () => floorAt(W, H, rand(-1.2, 1.2), rand(.1, 1)), tex: "glow", ramp: "grass.l", size: [3 * U, 2 * U], vel: () => [rand(-6, 6), rand(-22, -10)], bob: [6, 12], period: [3, 5], life: [3500, 6000], loop: true, over: 6000, alpha: .7, emis: .8, layer: 0 });
  },
  mistyterrain(e, E) {
    const { W, H } = e;
    floorTint(e, E, "fairy.h");
    E({ n: 8, at: () => [rand(0, 1) * W, rand(.46, .62) * H], tex: "cloud", ramp: "mist", size: [W * .32, W * .32], aspect: 3.4, vel: () => [rand(8, 18), 0], wrap: true, life: 16000, loop: true, over: 16000, alpha: .18, occ: .25, emis: .12, layer: 0 });
    E({ n: 18, at: () => floorAt(W, H, rand(-1.3, 1.3), rand(.05, 1)), tex: "spark", ramp: "fairy.h", size: [6 * unit(e), 1], life: [1500, 3000], loop: true, over: 3000, alpha: .45, layer: 0 });
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
    // its panes: the floor everyone stands on, the side walls, the ceiling, each a faint sheet of the room's colour
    const pane = (corners, color, alpha) => strips.push(e.strip({ dur: Infinity, quad: (k, age) => (age < 200 ? null : corners), color, emis: e.light ? .3 : .6, occ: e.light ? .3 : 0, alpha, layer: 0 }));
    pane([p(-X, 0, ZF), p(X, 0, ZF), p(X, 0, ZN), p(-X, 0, ZN)], look[0], .06);
    for (const sx of [-1, 1]) pane([p(sx * X, 0, ZF), p(sx * X, Y, ZF), p(sx * X, Y, ZN), p(sx * X, 0, ZN)], look[1], .07);
    pane([p(-X, Y, ZF), p(X, Y, ZF), p(X, Y, ZN), p(-X, Y, ZN)], look[0], .05);
    // the floor's lines: running to the camera and across, under every Pokémon, so each stands inside the room
    for (const x of [-X * .66, -X * .33, 0, X * .33, X * .66]) edge(p(x, 0, ZF), p(x, 0, ZN), look[1], 1.2 * U, .28, { delay: 250 });
    for (const z of [6.2, 4.6, 3.4, 2.5, 1.8, 1.3]) edge(p(-X, 0, z), p(X, 0, z), look[0], 1.2 * U, .28, { delay: 250 });
    // a few glints drifting in the room's air, behind the Pokémon
    E({ n: 12, at: () => [rand(.15, .85) * W, rand(.08, .4) * H], tex: "spark", ramp: id === "wonderroom" ? "water.h" : id === "magicroom" ? "poison.h" : "psychic.h", size: [6 * U, 1], life: [1600, 2800], loop: true, over: 2800, alpha: .35, layer: 0 });
    return strips;
  },
  gravity(e, E) {
    const { W, H } = e;
    E({ n: 26, at: () => [rand(-.05, 1.05) * W, -H * .1], vel: () => [0, rand(220, 320)], tex: "chevron", ramp: "psychic.h", size: [8 * unit(e), 8 * unit(e)], rot: Math.PI, life: H * 1.2 / 270 * 1000, loop: true, over: 4400, alpha: .14, emis: .8, layer: 0 });
  },
  /* ---------- a side's own things ---------- */
  // stealth rock: pointed stones floating round the side at knee height, outside the bodies, each turning slowly
  stealthrock(e, E, own) {
    const b = SIDE_OF(e, own), w = b.r - b.l, h = b.bot - b.top, n = 6;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, x = b.l - w * .12 + t * w * 1.24, y = b.bot - h * (.14 + .14 * Math.sin(Math.PI * t)) - h * .06 * (i % 2), sz = h * (own ? .11 : .15) * rand(.85, 1.15);
      E({ at: [x, y + sz * .9], tex: "glow", ramp: "shadow", size: [sz * .42, sz * .42], aspect: 3.3, hold: true, life: 1e7, loop: true, alpha: .35, occ: .6, emis: 0, layer: 0 });
      E({ at: [x, y], tex: "rock", ramp: e.light ? "stone" : "stone.l", size: [sz, sz], aspect: .78, rot: rand(-.5, .5), spin: rand(-.12, .12), bob: sz * .12, period: rand(2.6, 3.8), hold: true, life: 1e7, loop: true, alpha: 1, occ: 1, emis: .15, layer: 1 });
    }
  },
  // spikes and toxic spikes: caltrops lying in a row on the side's floor at its feet, each with its shadow
  spikes(e, E, own, layers = 1, toxic = false) {
    const b = SIDE_OF(e, own), w = b.r - b.l, U = unit(e), n = Math.min(toxic ? 2 : 3, layers) * 3;
    // big enough to read at a glance: a caltrop is about a tenth of the side's height, laid in a staggered row at its feet
    const h = b.bot - b.top, sz = clamp(h * (own ? .17 : .2), 30 * U, 70 * U), y = b.bot - h * (own ? .07 : .02);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? .5 : i / (n - 1), x = b.l - w * .06 + t * w * 1.12 + (toxic ? sz * .55 : 0), yy = y - (i % 2 ? sz * .28 : 0) - (toxic ? sz * .3 : 0);
      E({ at: [x, yy + sz * .16], tex: "glow", ramp: "shadow", size: [sz * .4, sz * .4], aspect: 2.8, hold: true, life: 1e7, loop: true, alpha: .55, occ: .7, emis: 0, layer: 1 });
      E({ at: [x, yy], tex: "caltrop", ramp: toxic ? "toxic.h" : e.light ? "iron" : "caltrop", size: [sz * .55, sz * .55], aspect: 1.85, hold: true, life: 1e7, loop: true, alpha: 1, occ: 1, emis: toxic ? .45 : .2, layer: 1 });
      if (toxic) E({ at: [x, yy - sz * .3], tex: "bubble", ramp: "toxic", size: [2, sz * .22], vel: [0, -14], life: [1400, 2200], loop: true, over: 2200, alpha: .6, layer: 1 });
    }
  },
  stickyweb(e, E, own) {
    const b = SIDE_OF(e, own), y = b.bot - (b.bot - b.top) * .02, w = (b.r - b.l) * .7, f = flatAt(e.H, y) * 1.3;
    E({ at: [(b.l + b.r) / 2, y], tex: "web", ramp: e.light ? "ink" : "white.h", size: [w * f, w * f], aspect: 1 / f, hold: true, life: 1e7, loop: true, alpha: e.light ? .45 : .4, occ: .5, emis: .3, layer: 0 });
  },
  // a screen: a pane standing over the side, barely there, its top edge lit in its colour; several stand at their own heights
  screen(e, E, own, id) {
    const b = SIDE_OF(e, own), cx = (b.l + b.r) / 2, w = (b.r - b.l) * 1.06, h = (b.bot - b.top) * .92;
    const look = { reflect: ["water.h", "#7FD0FF"], lightscreen: ["electric.h", "#FFD54A"], auroraveil: ["aurora", "#8FFFD8"], safeguard: ["fairy.h", "#E8B8FF"], mist: ["white.h", "#FFFFFF"] }[id];
    if (!look) return;
    if (id === "mist" || id === "safeguard") {
      E({ n: 5, at: () => [cx + rand(-.4, .4) * w, b.bot - rand(0, .15) * h], tex: "cloud", ramp: id === "mist" ? "steam" : "mist", size: [w * .4, w * .4], aspect: 2.4, vel: () => [rand(-6, 6), 0], bob: [3, 6], period: [5, 8], hold: true, life: 1e7, loop: true, alpha: .25, occ: .25, emis: .4, layer: 0 });
      return;
    }
    const i = ["reflect", "lightscreen", "auroraveil"].indexOf(id), top = b.bot - h - i * h * .07, U = unit(e);
    E({ at: [cx, (top + b.bot) / 2], tex: "hexgrid", ramp: look[0], size: [b.bot - top, b.bot - top], aspect: w / (b.bot - top), hold: true, life: 1e7, loop: true, alpha: .07, emis: e.light ? .4 : .9, occ: e.light ? .2 : 0, layer: 1 });
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
BUILD.toxicspikes = (e, E, own, layers) => BUILD.spikes(e, E, own, layers, true);
// a terrain's colour laid over the floor: one even, flat tint of the whole floor (never soft blobs, which read as stains)
const TINT = { "electric.h": "#FFD21A", "grass.d": "#3A9A32", "grass.h": "#3A9A32", "fairy.h": "#FF8AE8", "psychic.h": "#FF4F93" };
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
      else if (c === "spikes" || c === "toxicspikes") want.set(`${side}:${c}:${s.layers?.[c] || 1}`, [c, own, s.layers?.[c] || 1]);
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
    const E = spec => e.emit({ ...spec, ...onPaper(spec), field: true, group: g });
    e.extra = [];
    it.strips = [...(BUILD[args[0]]?.(e, E, ...args.slice(1)) || []), ...e.extra];
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
