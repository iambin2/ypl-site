/* 도전의 탑's tower modelled in 3D (DESIGN.md "Battle", The tower, the eighth pass; 2026-11-11, the user: the SVG tower still read as
   "파워포인트 기본 도형을 마구 덧붙여서 만든 미완성품", and asked for a tower out of a finished game). One WebGL2 context, shared and
   never on the page: each draw renders the tower into it and copies the picture into the scene's own 2D canvas, so a scene costs no
   context of its own and a removed one leaves nothing behind.

   The model is a turned solid, so it is smooth at every size and in true perspective:
   - floors are upright drums, each the one under it scaled R about the point A on the axis the tower would close on, so each floor's
     roof is the next one's terrace (its parapet at the roof's edge);
   - the five games are arched doorways cut into the drum with real depth (jambs, soffit, the room behind), each in a stone frame
     standing out of the wall; the gatekeeper's is the wide one in the middle, its two leaves shut until it is beaten;
   - a cornice with dentils under each roof, courses of stone drawn in the shader, a stepped base under the first floor;
   - one light from the moon's side, the board's tones as the lit and the shaded colour of each surface, the floors up fading into
     the night by the floor's own light (lightOf), a rim of moonlight on the lit edge.
   The camera is level with lens shift, so the drums stand upright and every ring curves as the eye sees it: down under the eye,
   up over it. Climbing a floor is a real move: the whole tower scaled by R^-t about A, which at t = 1 is the picture one floor up. */

export const R = 0.854;
const H = 0.8;                         // a floor's height to its radius
export const YA = H / (1 - R);         // the point the tower closes on
const EYE = 0.42;                      // the eye over the floor stood on
const FOCAL = 3.2;                     // 1 / tan(half the vertical field)
const RAD = Math.PI / 180;

/* the games' doors across the front, degrees (the fifth the gatekeeper's gate, the floor's middle), their half widths, and the height
   of each arch's spring over the floor, as a share of the floor's height */
export const DOORS = [-52, -29, 29, 52, 0];
const HALF = [7.4, 7.4, 7.4, 7.4, 13.5];
const SPRING = [.36, .36, .36, .36, .42];
const DEPTH = .085, PROUD = .02, CORNICE = 1.05;
const PARAPET = CORNICE / R;           // a floor's parapet stands at the edge of the roof under it, in its own units

/* ---------- the camera ---------- */
/* m: the scene's box (W, H, r0 the floor stood on's radius on screen, base its foot's height, ax the axis across). The camera stands
   at (0, EYE, D) looking down -z; lens shift (sx, sy) puts the axis at ax and the foot at base */
export function cameraOf(m) {
  const D = FOCAL * (m.H / 2) / m.r0, asp = m.W / m.H;
  const sx = 2 * m.ax / m.W - 1, sy = 1 - 2 * m.base / m.H + FOCAL * EYE / D;
  const near = .05, far = 600, A = (far + near) / (far - near), B = -2 * far * near / (far - near);
  const f = FOCAL;
  const vp = new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, -sx, -sy, -A, -1, sx * D, sy * D - f * EYE, A * D + B, D]);
  const project = ([x, y, z]) => {
    const w = D - z;
    return [(f / asp * x / w + sx + 1) / 2 * m.W, (1 - (f * (y - EYE) / w + sy)) / 2 * m.H];
  };
  return { D, vp, project, horizon: (1 - sy) / 2 * m.H, pos: [0, EYE, D] };
}
// floor k's local point (radius 1, foot 0) in the world
const scaleOf = k => R ** k;
const footOf = k => YA * (1 - R ** k);
export const worldOf = (k, [x, y, z]) => { const s = scaleOf(k); return [x * s, footOf(k) + y * s, z * s]; };
// a point on floor k's surface: angle th (degrees, 0 the front), height y (local), radius r (local)
export const onFloor = (k, th, y, r = 1) => worldOf(k, [r * Math.sin(th * RAD), y, r * Math.cos(th * RAD)]);
// a door's local outline (its arch at the wall's face): points round it, foot to foot over the crown
export function doorOutline(g, n = 20) {
  const thc = DOORS[g - 1], hw = HALF[g - 1], a = Math.sin(hw * RAD), sp = SPRING[g - 1] * H, out = [[thc - hw, 0]];
  for (let i = 0; i <= n; i++) {
    const t = -1 + 2 * i / n, th = thc + Math.asin(a * t) / RAD;
    out.push([th, sp + a * Math.sqrt(1 - t * t)]);
  }
  out.push([thc + hw, 0]);
  return out;
}
export const doorCrown = g => SPRING[g - 1] * H + Math.sin(HALF[g - 1] * RAD);

/* ---------- colour ---------- */
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
let probe = null;
// the scene's tones as the board sets them on el (custom properties of .tw), read as rgb 0..1 through a 1px canvas
export function paletteOf(el) {
  probe ||= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const style = getComputedStyle(el), i = document.createElement("i");
  i.style.display = "none"; el.appendChild(i);
  const read = expr => {
    i.style.color = expr;
    probe.fillStyle = "#000"; probe.fillStyle = getComputedStyle(i).color;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  };
  const v = name => read(`var(${name})`);
  const p = {
    stone: v("--tw-stone"), wallLit: v("--tw-b"), wallMid: v("--tw-a"), wallShade: v("--tw-e"), tread: v("--tw-tread"),
    pane: v("--tw-pane"), warm: v("--tw-warm"),
    // a lamp is the amber itself in both themes (the day's --signal is the deeper amber words are set in)
    signal: v(style.getPropertyValue("--tw-day").trim() === "1" ? "--amber" : "--signal"), sky: v("--tw-sky-top"), g0: v("--tw-g0"), g1: v("--tw-g1"),
    shadow: v("--tw-shadow"), ground: v("--ground"),
    // light itself: the board's lit tone at night; in the day the words are navy, so the light is white
    lit: style.getPropertyValue("--tw-day").trim() === "1" ? [1, 1, 1] : v("--lit"),
    light: style.getPropertyValue("--tw-day").trim() === "1",
  };
  i.remove();
  return p;
}

/* ---------- the mesh ---------- */
/* a vertex: position 3, normal 3, lit colour 4 (alpha), shade colour 3, x: ao, courses, floor, flat; uv 2 (local arc length, height) */
const STRIDE = 19;
function mesh() {
  const a = [];
  const v = (p, n, s, uv = [0, 0]) => a.push(...p, ...n, ...s.lit, s.alpha ?? 1, ...s.shade, s.ao ?? 0, s.course ? 1 : 0, s.k, s.flat ? 1 : 0, ...uv);
  // a quad p0 p1 p2 p3 (any winding), each with its normal and surface (surface may differ per corner)
  const quad = (ps, ns, ss, uvs = []) => { [0, 1, 2, 0, 2, 3].forEach(i => v(ps[i], ns[i] || ns[0], ss[i] || ss[0], uvs[i])); };
  return { a, v, quad };
}
const radial = th => [Math.sin(th * RAD), 0, Math.cos(th * RAD)];
const tangent = th => [Math.cos(th * RAD), 0, -Math.sin(th * RAD)];
const UP = [0, 1, 0], DOWN = [0, -1, 0];

/* floor k of the model: f its number in the run, doors: each game's state ("", "won", "now", "next"), first: the floor the run begins on
   (it stands on its stepped base), stood: the floor stood on (its terrace is the ground's) */
function floorMesh(M, S, k, { doors, base, terrace }, pal) {
  const W = (p) => worldOf(k, p), P = (r, th, y) => W([r * Math.sin(th * RAD), y, r * Math.cos(th * RAD)]);
  const surf = (lit, shade, o = {}) => ({ lit, shade, k, ...o });
  const wall = surf(pal.wallLit, pal.wallShade, { course: true });
  const stone = surf(pal.stone, mix(pal.stone, pal.wallShade, .55));
  const tread = surf(pal.tread, mix(pal.tread, pal.wallShade, .4));
  const top = H - .1;                         // the cornice's foot
  const span = [-104, 104];

  // the columns of the drum: one every 1.5 degrees, plus every door's and frame's edge, so each edge is exact
  const frames = DOORS.map((thc, i) => {
    const hw = HALF[i], a = Math.sin(hw * RAD), fw = i === 4 ? .07 : .05, ao = a + fw;
    return { thc, hw, a, ao, fa: Math.asin(ao) / RAD, sp: SPRING[i] * H, gate: i === 4, state: doors[i] };
  });
  const cuts = new Set();
  for (let t = span[0]; t <= span[1] + 1e-6; t += 1.5) cuts.add(+t.toFixed(4));
  for (const d of frames) for (const s of [-1, 1]) { cuts.add(+(d.thc + s * d.hw).toFixed(4)); cuts.add(+(d.thc + s * d.fa).toFixed(4)); if (d.gate) cuts.add(d.thc); }
  const T = [...cuts].sort((x, y) => x - y);
  const dx = (d, th) => Math.sin((th - d.thc) * RAD);
  const inner = (d, th) => d.sp + Math.sqrt(Math.max(0, d.a * d.a - dx(d, th) ** 2));
  const outer = (d, th) => d.sp + Math.sqrt(Math.max(0, d.ao * d.ao - dx(d, th) ** 2));
  const uvAt = (th, y, r = 1) => [th * RAD * r, y];
  const wallQuad = (t0, t1, y0a, y0b, y1, r = 1, s = wall) => M.quad(
    [P(r, t0, y0a), P(r, t1, y0b), P(r, t1, y1), P(r, t0, y1)],
    [radial(t0), radial(t1), radial(t1), radial(t0)], [s], [uvAt(t0, y0a), uvAt(t1, y0b), uvAt(t1, y1), uvAt(t0, y1)]);

  for (let i = 0; i < T.length - 1; i++) {
    const t0 = T[i], t1 = T[i + 1], tm = (t0 + t1) / 2;
    const d = frames.find(x => Math.abs(tm - x.thc) < x.fa);
    if (!d) { wallQuad(t0, t1, 0, 0, top); continue; }
    const inDoor = Math.abs(tm - d.thc) < d.hw;
    const o0 = outer(d, t0), o1 = outer(d, t1);
    // the wall over the frame
    wallQuad(t0, t1, o0, o1, top);
    // the frame's face, standing PROUD out of the wall, and its outer lip
    const lo0 = inDoor ? inner(d, t0) : 0, lo1 = inDoor ? inner(d, t1) : 0;
    const fr = 1 + PROUD;
    M.quad([P(fr, t0, lo0), P(fr, t1, lo1), P(fr, t1, o1), P(fr, t0, o0)], [radial(t0), radial(t1), radial(t1), radial(t0)], [stone]);
    const lipN = th => { const n = radial(th); return [n[0] * .3, .95, n[2] * .3]; };
    M.quad([P(1, t0, o0), P(1, t1, o1), P(fr, t1, o1), P(fr, t0, o0)], [lipN(t0), lipN(t1)], [stone]);
    if (!inDoor) continue;
    // the doorway: the frame's inner lip, the soffit under the arch, the room behind
    const i0 = inner(d, t0), i1 = inner(d, t1), back = 1 - DEPTH;
    const lit = d.state === "won" || d.state === "now" || (d.gate && d.state === "won");
    const glow = d.state === "now" ? mix(pal.signal, pal.lit, .3) : pal.warm;
    const inside = lit ? surf(mix(mix(pal.pane, pal.wallShade, .5), glow, .45), mix(pal.pane, glow, .25)) : surf(mix(pal.wallShade, pal.pane, .4), mix(pal.pane, pal.wallShade, .3));
    M.quad([P(1, t0, i0), P(1, t1, i1), P(fr, t1, i1), P(fr, t0, i0)], [DOWN], [stone]);
    M.quad([P(back, t0, i0), P(back, t1, i1), P(1, t1, i1), P(1, t0, i0)], [DOWN], [inside]);
    if (d.gate && !lit) {
      /* the gate's two leaves to the spring, a deep tone of the stone, each turned a little so the light tells them apart, and the
         dark lunette over them, each leaf in two panels on its rails. Played or beaten, the gate stands open on its lit hall. No type colour: the floor's type
         is said by the doors that offer the game (2026-11-11, the user: "꼭 타입을 표시해야 하나? ... 지금은 너무 조잡해보여") */
      const leaf = 1 - DEPTH * .4, side = tm < d.thc ? -1 : 1, tc = mix(pal.stone, pal.pane, .62);
      const lt = surf(mix(tc, pal.lit, .06), mix(tc, pal.ground, pal.light ? .2 : .45));
      const n = th => { const r = radial(th), t = tangent(th); return [r[0] + t[0] * .25 * side, 0, r[2] + t[2] * .25 * side]; };
      const sp = d.sp;
      M.quad([P(leaf, t0, 0), P(leaf, t1, 0), P(leaf, t1, sp), P(leaf, t0, sp)], [n(t0), n(t1)], [lt]);
      // the rails across each leaf, standing a little out of it, with their shade under them
      const rail = surf(mix(tc, pal.stone, .35), mix(tc, pal.ground, .3)), dark = surf(mix(tc, pal.ground, .5), mix(tc, pal.ground, .6), { flat: true });
      for (const y of [.06, .5, .94]) {
        M.quad([P(leaf + .006, t0, sp * y - .008), P(leaf + .006, t1, sp * y - .008), P(leaf + .006, t1, sp * y + .008), P(leaf + .006, t0, sp * y + .008)], [n(t0), n(t1)], [rail]);
        M.quad([P(leaf + .002, t0, sp * y - .016), P(leaf + .002, t1, sp * y - .016), P(leaf + .002, t1, sp * y - .008), P(leaf + .002, t0, sp * y - .008)], [n(t0)], [dark]);
      }
      const glass = surf(mix(pal.pane, pal.ground, .3), pal.pane, { flat: true });
      M.quad([P(leaf, t0, sp), P(leaf, t1, sp), P(leaf, t1, i1), P(leaf, t0, i0)], [radial(t0), radial(t1)], [glass]);
      M.quad([P(leaf, t0, sp - .012), P(leaf + .004, t1, sp - .012), P(leaf + .004, t1, sp + .006), P(leaf, t0, sp + .006)], [radial(t0)], [stone]);
    } else {
      // the room behind: dark, or lit from within, brightest at the floor
      const room = lit
        ? [surf(mix(glow, pal.lit, d.state === "now" ? .1 : .25), glow, { flat: true }), surf(mix(glow, pal.pane, .62), glow, { flat: true })]
        : [surf(mix(pal.pane, pal.wallShade, .25), pal.pane, { flat: true }), surf(mix(pal.pane, pal.ground, .5), pal.pane, { flat: true })];
      M.quad([P(back, t0, 0), P(back, t1, 0), P(back, t1, i1), P(back, t0, i0)], [radial(t0)], [room[0], room[0], room[1], room[1]]);
    }
  }
  // the seam where the gate's leaves meet
  for (const d of frames) if (d.gate && !(d.state === "won" || d.state === "now")) {
    const leaf = 1 - DEPTH * .4 + .008, a = d.thc - .35, b = d.thc + .35, dark = surf(pal.pane, pal.pane, { flat: true });
    M.quad([P(leaf, a, 0), P(leaf, b, 0), P(leaf, b, d.sp), P(leaf, a, d.sp)], [radial(d.thc)], [dark]);
  }
  // the jambs and the frame's sides: upright faces at each door's and frame's edges
  for (const d of frames) for (const s of [-1, 1]) {
    const th = d.thc + s * d.hw, n = tangent(th).map(v => v * -s);
    const lit = d.state === "won" || d.state === "now";
    const glow = d.state === "now" ? pal.signal : pal.warm;
    // the jamb in the doorway's own shade; a lit room's light falls on it, brightest at the floor as the room's is
    const jamb = lit
      ? [surf(mix(glow, pal.pane, .3), glow, { flat: true }), surf(mix(pal.pane, glow, .25), pal.pane, { flat: true })]
      : [surf(mix(pal.wallShade, pal.pane, .35), mix(pal.pane, pal.wallShade, .2))];
    M.quad([P(1 - DEPTH, th, 0), P(1 + PROUD, th, 0), P(1 + PROUD, th, d.sp), P(1 - DEPTH, th, d.sp)], [n], lit ? [jamb[0], jamb[0], jamb[1], jamb[1]] : jamb);
    const th2 = d.thc + s * d.fa, n2 = tangent(th2).map(v => v * s);
    M.quad([P(1, th2, 0), P(1 + PROUD, th2, 0), P(1 + PROUD, th2, d.sp), P(1, th2, d.sp)], [n2], [stone]);
    // a light falls out on the floor in front of a lit door (seen only where the eye is over the floor: the floor stood on)
    if (lit && k === 0) {
      const g = surf(mix(glow, pal.lit, .2), glow, { flat: true, alpha: .18 }), g0 = { ...g, alpha: 0 };
      const y = .004, a = d.thc - d.hw, b = d.thc + d.hw;
      if (s === 1) S.quad([P(1, a, y), P(1, b, y), P(1.3, d.thc + d.hw * 1.6, y), P(1.3, d.thc - d.hw * 1.6, y)], [UP], [g, g, g0, g0]);
    }
  }

  // the cornice under the roof: a band, its moulding standing out, the dentils under it, the roof's edge
  const ring = (r0, y0, r1, y1, s, n0, n1, a = span[0], b = span[1], step = 1.5) => {
    for (let t = a; t < b - 1e-6; t += step) {
      const u = Math.min(b, t + step);
      M.quad([P(r0, t, y0), P(r0, u, y0), P(r1, u, y1), P(r1, t, y1)], [n0(t), n0(u), n1(u), n1(t)], [s]);
    }
  };
  const tilt = (dy) => th => { const r = radial(th); return [r[0], dy, r[2]]; };
  ring(1, top, 1, top + .03, stone, radial, radial);
  ring(1, top + .03, 1.03, top + .045, stone, tilt(-1.4), tilt(-1.4));      // the moulding's underside, facing down
  ring(1.03, top + .045, CORNICE, top + .07, stone, tilt(-.6), tilt(-.6));
  ring(CORNICE, top + .07, CORNICE, H, stone, radial, radial);
  ring(CORNICE, H, R * .98, H, tread, () => UP, () => UP);                    // the roof, the next floor's terrace (to under its wall)
  for (let t = span[0] + 2; t <= span[1] - 2; t += 4) {
    const a = t - .9, b = t + .9, y0 = top + .012, y1 = top + .03, r1 = 1.022;
    M.quad([P(r1, a, y0), P(r1, b, y0), P(r1, b, y1), P(r1, a, y1)], [radial(t)], [stone]);
    M.quad([P(1, a, y0), P(1, b, y0), P(r1, b, y0), P(r1, a, y0)], [DOWN], [stone]);
    M.quad([P(1, a, y0), P(r1, a, y0), P(r1, a, y1), P(1, a, y1)], [tangent(a).map(x => -x)], [stone]);
    M.quad([P(1, b, y0), P(r1, b, y0), P(r1, b, y1), P(1, b, y1)], [tangent(b)], [stone]);
  }

  if (!terrace) {
    // the parapet at the edge of the roof under this floor: its face and its coping
    const rp = PARAPET, h = .085;
    ring(rp, 0, rp, h, stone, radial, radial);
    ring(rp + .012, h, rp + .012, h + .02, stone, radial, radial);
    ring(rp - .02, h + .02, rp + .012, h + .02, tread, () => UP, () => UP);
    ring(rp, h, rp + .012, h, stone, () => DOWN, () => DOWN);
  }
  if (base) {
    // the stepped base the first floor stands on: three rings of stone, each wider and lower
    for (let j = 0; j < 3; j++) {
      const r = 1.1 + .085 * j, y1 = -.045 * j, y0 = y1 - .045;
      ring(r, y0, r, y1, stone, radial, radial, -180, 180, 3);
      ring(r - .085, y1, r, y1, tread, () => UP, () => UP, -180, 180, 3);
    }
  }
}

/* the ground. On the first floor the plaza is the night's own (tower.js), and the model only lays the tower's shade on it, deepest at
   its foot; above it the terrace of the floor stood on is the model's, out to the sea of cloud on the horizon (a parapet at its edge
   was tried and met the horizon as a wedge) */
function groundMesh(M, S, first, pal) {
  const P = (r, th, y) => [r * Math.sin(th * RAD), y, r * Math.cos(th * RAD)];
  const deep = pal.light ? .22 : .5;
  if (first) {
    const rings = [1.2, 1.45, 1.8, 2.3, 3];
    const s = r => ({ lit: pal.shadow, shade: pal.shadow, k: 0, flat: true, alpha: deep * (1 - (r - 1.2) / 1.8) ** 2 });
    for (let i = 0; i < rings.length - 1; i++) for (let t = -180; t < 180; t += 3) {
      const a = rings[i], b = rings[i + 1], y = -.133;
      S.quad([P(a, t, y), P(a, t + 3, y), P(b, t + 3, y), P(b, t, y)], [UP], [s(a), s(a), s(b), s(b)]);
    }
    return;
  }
  const rings = [0, 1, 1.25, 1.6, 2.2, 3.2, 5, 9, 18, 40, 120, 400];
  const s = r => ({ lit: pal.g0, shade: pal.g0, k: 0, flat: true, ao: deep * .8 * Math.exp(-Math.max(0, r - 1) * 1.8) });
  for (let i = 0; i < rings.length - 1; i++) for (let t = -180; t < 180; t += 2) {
    const a = rings[i], b = rings[i + 1];
    M.quad([P(a, t, 0), P(a, t + 2, 0), P(b, t + 2, 0), P(b, t, 0)], [UP], [s(a), s(a), s(b), s(b)]);
  }
}

/* ---------- the shaders ---------- */
const VS = `#version 300 es
in vec3 aP; in vec3 aN; in vec4 aL; in vec3 aS; in vec4 aX; in vec2 aU;
uniform mat4 uVP; uniform float uS, uYA;
out vec3 vN, vS, vW; out vec4 vL, vX; out vec2 vU;
void main() {
  vec3 p = vec3(aP.x * uS, uYA + (aP.y - uYA) * uS, aP.z * uS);
  vW = p; vN = aN; vL = aL; vS = aS; vX = aX; vU = aU;
  gl_Position = uVP * vec4(p, 1.);
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vN, vS, vW; in vec4 vL, vX; in vec2 vU;
uniform vec3 uLight, uEye, uSky, uRim; uniform float uClimb, uR, uDay;
out vec4 o;
float lightOf(float k) { return k <= 0. ? 1. : max(.16, pow(uR, 1.7 * k)); }
void main() {
  vec3 c;
  if (vX.w > .5) c = vL.rgb;
  else {
    vec3 n = normalize(vN);
    float d = dot(n, uLight);
    // the light turning round the drum, its terminator kept a little firm, as a painted stone is
    float t = smoothstep(-.35, .75, d);
    t = mix(t, smoothstep(.2, .8, t), .35);
    c = mix(vS, vL.rgb, t);
    if (vX.y > .5) {
      // courses of dressed stone: joints in the shader, faded out where they would be thinner than a pixel
      vec2 g = vU / vec2(.15, .066);
      float row = floor(g.y);
      vec2 f = vec2(fract(g.x + .5 * mod(row, 2.)), fract(g.y));
      vec2 w = fwidth(g);
      float jy = 1. - smoothstep(0., w.y * 1.4, min(f.y, 1. - f.y));
      float jx = 1. - smoothstep(0., w.x * 1.4, min(f.x, 1. - f.x));
      float fade = clamp(1.6 - max(w.x, w.y) * 7., 0., 1.);
      c *= 1. - (.1 + .06 * uDay) * max(jx, jy) * fade;
    }
    // a rim of moonlight on the lit edge, where the drum turns away
    vec3 v = normalize(uEye - vW);
    float rim = pow(1. - max(0., dot(n, v)), 4.) * smoothstep(0., .5, dot(n, uLight));
    c = mix(c, uRim, rim * .35);
  }
  c *= 1. - vX.x;
  c = mix(c, uSky, 1. - lightOf(vX.z - uClimb));
  o = vec4(c * vL.a, vL.a);
}`;

let ctx = null;
function context() {
  if (ctx && !ctx.gl.isContextLost()) return ctx;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return null; }
  const vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  [["aP", 3, 0], ["aN", 3, 3], ["aL", 4, 6], ["aS", 3, 10], ["aX", 4, 13], ["aU", 2, 17]].forEach(([n, size, off]) => {
    const l = gl.getAttribLocation(p, n);
    if (l < 0) return;
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, STRIDE * 4, off * 4);
  });
  const u = Object.fromEntries(["uVP", "uS", "uYA", "uLight", "uEye", "uSky", "uRim", "uClimb", "uR", "uDay"].map(n => [n, gl.getUniformLocation(p, n)]));
  ctx = { canvas, gl, p, vao, buf, u, key: null, solid: 0, soft: 0 };
  return ctx;
}

/* the model for a state: floors 0 up to where the tower leaves the window (and one more, for the climb), each with its doors' states */
export function buildModel(st, ks, pal) {
  const M = mesh(), S = mesh();
  groundMesh(M, S, st.floor === 1, pal);
  for (const k of ks) {
    const f = st.floor + k;
    if (f < 1) continue;
    const doors = [1, 2, 3, 4, 5].map(g => (st.hold && f === st.floor && g === st.at) ? ""
      : f < st.floor || (f === st.floor && g < st.at) ? "won" : f === st.floor && g === st.at ? (st.live ? "now" : "next") : "");
    floorMesh(M, S, k, { doors, base: f === 1, terrace: k === 0 }, pal);
  }
  return { solid: new Float32Array(M.a), soft: new Float32Array(S.a) };
}

/* render the model into out (a 2D canvas the scene shows) with the camera cam, the tower climbed by t (0 to 1) */
export function render(out, model, cam, pal, t = 0) {
  const c = context();
  if (!c) return false;
  const { gl, canvas, u } = c;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(out.clientWidth * dpr) || out.width, h = Math.round(out.clientHeight * dpr) || out.height;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
  if (c.key !== model) {
    const all = new Float32Array(model.solid.length + model.soft.length);
    all.set(model.solid); all.set(model.soft, model.solid.length);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.buf); gl.bufferData(gl.ARRAY_BUFFER, all, gl.STATIC_DRAW);
    c.key = model; c.solid = model.solid.length / STRIDE; c.soft = model.soft.length / STRIDE;
  }
  gl.viewport(0, 0, w, h);
  gl.depthMask(true); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(c.p); gl.bindVertexArray(c.vao);
  gl.uniformMatrix4fv(u.uVP, false, cam.vp);
  gl.uniform1f(u.uS, R ** -t); gl.uniform1f(u.uYA, YA); gl.uniform1f(u.uClimb, t); gl.uniform1f(u.uR, R);
  const L = [.62, .42, .66], n = Math.hypot(...L);
  gl.uniform3f(u.uLight, L[0] / n, L[1] / n, L[2] / n);
  gl.uniform3fv(u.uEye, cam.pos); gl.uniform3fv(u.uSky, pal.sky); gl.uniform3fv(u.uRim, pal.lit); gl.uniform1f(u.uDay, pal.light ? 1 : 0);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND); gl.depthMask(true);
  gl.drawArrays(gl.TRIANGLES, 0, c.solid);
  if (c.soft) {
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, c.solid, c.soft);
  }
  const g = out.getContext("2d");
  g.clearRect(0, 0, w, h); g.drawImage(canvas, 0, 0);
  return true;
}
