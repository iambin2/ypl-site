/* 도전의 탑's tower modelled in 3D (DESIGN.md "Battle", The tower, the ninth pass; 2026-11-11, the user: "62점이 100점이 될 수 있도록
   모든 것을 뜯어서 재설계해줘", choosing the view from the air, the games from the outside in, and floors that rise in rank). One WebGL2
   context, shared and never on the page: each draw renders into it and copies the picture into the scene's own 2D canvas, so a scene
   costs no context of its own and a removed one leaves nothing behind.

   One world: the tower is self-similar, so a mesh is built in the units of its lowest floor (that floor's radius 1, its foot at 0)
   and every floor above is the one under it scaled R about the axis. Every floor is modelled by the same rule, so the picture is a
   function of the camera alone: the climb is the camera rising, and its last frame is the next floor's picture by construction.
   The mesh holds the stone only; which doors are lit is a uniform per door (uDoor), so a lamp changing is a value going from one
   to the other, never a new mesh. */

export const R = 0.92;
export const H = 1.0;                  // a floor's height to its radius
export const YA = H / (1 - R);         // the point the tower would close on
const EYE = 0.62;                      // the eye over the foot of the floor stood on, in its units
const FOCAL = 3.2;                     // 1 / tan(half the vertical field)
const RAD = Math.PI / 180;
export const SPAN = 16;                // floors a mesh holds (uDoor holds five a floor)

/* the five games' doors, by game: from the outside in, closing on the gatekeeper's gate in the middle (2026-11-11, the user chose
   "바깥에서 안으로": 1 far left, 2 far right, 3 inner left, 4 inner right, 5 the gate) */
export const DOORS = [-57, 57, -33, 33, 0];
const SMALL = 7.4, SPRING = 0.4;

/* a floor's rank: floor by floor to the eighth, the last whose gatekeeper is set, the building grows (DESIGN.md, Floors that rise in
   rank): each floor adds one thing the one under it has not, while its frames, doorways and gate grow a little. From the ninth up
   every floor is the eighth's. No number, word or colour says the floor */
export function orderOf(n) {
  const t = Math.min(1, Math.max(0, (n - 1) / 7));
  return {
    fw: 0.042 + 0.02 * t,              // a small door's frame
    gfw: 0.06 + 0.022 * t,             // the gate's frame
    proud: 0.012 + 0.02 * t,           // how far a frame stands out of the wall
    depth: 0.07 + 0.06 * t,            // the doorways' depth
    course: n >= 2,                    // 2: a string course across the wall at the doors' spring
    frieze: n >= 3,                    // 3: a frieze band under the cornice
    key: n >= 4,                       // 4: keystones at the arches' crowns
    tiers: n <= 4 ? 1 : n <= 6 ? 2 : 3, // 5 and 7: the cornice in two, then three mouldings
    arch2: n >= 6,                     // 6: the gate in two arches
    crenel: n >= 8,                    // 8: the parapet at its foot crenellated
    gHalf: 12.5 + 2.5 * t, gSpring: 0.42 + 0.07 * t,
  };
}

/* ---------- the camera ---------- */
const mul4 = (a, b) => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
const lerp = (a, b, t) => a + (b - a) * t;
const scaleOf = j => R ** j;
const footOf = j => YA * (1 - R ** j);
// a point of floor j (in the mesh's floors, 0 its lowest; any real number) at angle th (degrees, 0 the front), height y, radius r
export const onFloor = (j, th, y, r = 1) => { const s = scaleOf(j); return [r * s * Math.sin(th * RAD), footOf(j) + y * s, r * s * Math.cos(th * RAD)]; };

/* m: the scene's box (W, H, r0 the floor stood on's radius on screen, base its foot's height, ax the axis across). j: the floor stood
   on, in the mesh's floors (a real number while climbing). The camera floats level, out from that floor and a little over its foot;
   lens shift puts the axis at ax and the foot at base, so every wall stands upright. orbit (optional): { phi, k, lift } the camera swung
   round the axis by phi, drawn back by k and raised by lift floors. dive (optional): { g, t, depth, yc } the camera
   on its way into door g's arch, t from 0 to 1 */
export function cameraOf(m, j, dive = null, orbit = null) {
  const s = scaleOf(j), foot = footOf(j), asp = m.W / m.H;
  const D = FOCAL * (m.H / 2) / m.r0 * s;
  let P = [0, foot + EYE * s, D], yaw = 0;
  let sx = 2 * m.ax / m.W - 1, sy = 1 - 2 * m.base / m.H + FOCAL * EYE * s / D;
  let near = 0.02 * s;
  const horizon = (1 - sy) / 2 * m.H;
  if (orbit) {
    // the camera swung round the tower by phi and drawn back by k, still looking at the axis (the entrance, the arrival over a stage)
    const d = D * orbit.k;
    P = [d * Math.sin(orbit.phi), P[1] + (orbit.lift || 0) * s, d * Math.cos(orbit.phi)];
    yaw = orbit.phi;
  }
  if (dive) {
    /* going in, in two beats: first the camera comes round the tower to stand before the door, level with it (a turn and a dolly
       about the axis, so the door is met face on); then it walks in along the door's axis through the arch into the room */
    const th = DOORS[dive.g - 1] * RAD, y1 = foot + dive.yc * s, before = 2.3 * s, inside = (1 - dive.depth * 0.45) * s;
    const a = smooth(0, .52, dive.t), b = smooth(.46, 1, dive.t);
    const dist = lerp(lerp(D, before, a), inside, b * b);
    P = [dist * Math.sin(th * a), lerp(P[1], y1, a), dist * Math.cos(th * a)];
    yaw = th * a;
    // the camera stays level and keeps its vertical shift, so the horizon holds still under the night drawn behind the model
    sx *= 1 - a;
    near = lerp(near, 0.002 * s, b);
  }
  const far = 4000 * s, A = (far + near) / (far - near), B = -2 * far * near / (far - near), f = FOCAL;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const view = [c, 0, sn, 0, 0, 1, 0, 0, -sn, 0, c, 0, -(c * P[0] - sn * P[2]), -P[1], -(sn * P[0] + c * P[2]), 1];
  const proj = [f / asp, 0, 0, 0, 0, f, 0, 0, -sx, -sy, -A, -1, 0, 0, B, 0];
  const vp = mul4(proj, view);
  const project = ([x, y, z]) => {
    const X = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], Y = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], W = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    return [(X / W + 1) / 2 * m.W, (1 - Y / W) / 2 * m.H];
  };
  return { vp, project, pos: P, horizon, s, foot, j };
}

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
  const day = style.getPropertyValue("--tw-day").trim() === "1";
  // a lamp is the amber itself in both themes (the day's --signal is the deeper amber words are set in)
  const amber = v(day ? "--amber" : "--signal");
  const p = {
    stone: v("--tw-stone"), wallLit: v("--tw-b"), wallShade: v("--tw-e"), tread: v("--tw-tread"),
    pane: v("--tw-pane"), amber, sky: v("--tw-sky-top"), fog: v("--tw-sky-low"), g0: v("--tw-g0"), g1: v("--tw-g1"),
    shadow: v("--tw-shadow"), ground: v("--ground"),
    // a won room's light: warm; in the day deepened toward the amber so a won door still reads on white stone
    warm: mix(v("--tw-warm"), amber, day ? 0.38 : 0),
    // light itself: the board's lit tone at night; in the day the words are navy, so the light is white
    lit: day ? [1, 1, 1] : v("--lit"),
    // what a door's room becomes as the camera walks in: the stage's own ground, which the next screen comes up out of
    lift: v("--ground"),
    light: day,
  };
  i.remove();
  return p;
}

/* ---------- the mesh ---------- */
/* a vertex: position 3, normal 3, lit colour 4 (alpha), shade colour 3, x 4 (ao, courses, floor, flat), uv 2 (arc length, height:
   in a doorway its share of the door's height), door 4 (its id or -1, its role, the hinge x z of a gate's leaf).
   Roles: 1 a room's back, 2 a jamb or soffit (lit by its room), 3 and 4 the gate's left and right leaf (they swing open as the
   gate is reached), 5 the lunette's glass (lit as the room), 6 the seam between the leaves (gone once they open) */
const STRIDE = 23;
// the vertices written straight into a typed array that grows as it fills
function mesh() {
  const M = { a: new Float32Array(STRIDE * 6 * 4096), n: 0 };
  const put = (x) => { M.a[M.n++] = x; };
  const v = (p, nn, s, uv = ZERO, d = NO) => {
    if (M.n + STRIDE > M.a.length) { const b = new Float32Array(M.a.length * 2); b.set(M.a); M.a = b; }
    put(p[0]); put(p[1]); put(p[2]); put(nn[0]); put(nn[1]); put(nn[2]);
    put(s.lit[0]); put(s.lit[1]); put(s.lit[2]); put(s.alpha ?? 1); put(s.shade[0]); put(s.shade[1]); put(s.shade[2]);
    put(s.ao ?? 0); put(s.course ? 1 : 0); put(s.k); put(s.flat ? 1 : 0); put(uv[0]); put(uv[1]); put(d[0]); put(d[1]); put(d[2]); put(d[3]);
  };
  // a quad p0 p1 p2 p3 (any winding), with a normal and surface per corner (or one for all)
  M.quad = (ps, ns, ss, uvs = [], d = NO) => { for (const i of TRI) v(ps[i], ns[i] || ns[0], ss[i] || ss[0], uvs[i] || ZERO, d); };
  M.done = () => M.a.slice(0, M.n);
  return M;
}
const TRI = [0, 1, 2, 0, 2, 3], ZERO = [0, 0];
// a leaf's straps carry no boards' joints (the shader draws them where the height is not negative)
const NOGRAIN = [[0, -1], [0, -1], [0, -1], [0, -1]];
// the columns the drum is cut into: every 3 degrees bends a radius-1 drum by under a tenth of a pixel at the sizes it is drawn
const STEP = 3;
const NO = [-1, 0, 0, 0];
const radial = th => [Math.sin(th * RAD), 0, Math.cos(th * RAD)];
const tangent = th => [Math.cos(th * RAD), 0, -Math.sin(th * RAD)];
const UP = [0, 1, 0], DOWN = [0, -1, 0];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* floor j of the mesh (n its number in the tower): its wall, its doors, its cornice and roof, its parapet (at the edge of the roof
   under it, so every floor but the first has one), and under the first floor the stepped base */
function floorMesh(M, j, n, pal) {
  const o = orderOf(n), s = scaleOf(j), foot = footOf(j);
  const P = (r, th, y) => [r * s * Math.sin(th * RAD), foot + y * s, r * s * Math.cos(th * RAD)];
  const surf = (lit, shade, x = {}) => ({ lit, shade, k: j, ...x });
  const wall = (ao = 0) => surf(pal.wallLit, pal.wallShade, { course: true, ao });
  const stone = surf(pal.stone, mix(pal.stone, pal.wallShade, 0.55));
  const stoneDeep = surf(mix(pal.stone, pal.wallShade, 0.25), mix(pal.stone, pal.wallShade, 0.75));
  const tread = (ao = 0) => surf(pal.tread, mix(pal.tread, pal.wallShade, 0.4), { ao });
  const dark = surf(mix(pal.pane, pal.wallShade, 0.25), pal.pane);
  const top = H - 0.1;                         // the cornice's foot
  const span = [-130, 130];
  const id = g => j * 5 + g - 1;

  /* the wall's shade, baked where stone meets stone: at its foot on the terrace and under the cornice */
  const aoAt = y => Math.max(0.26 * (1 - y / 0.07), 0.3 * smooth(top - 0.13, top, y));
  const wallQuad = (t0, t1, y0a, y0b, y1, r = 1) => {
    const cuts = [0.07, top - 0.13].filter(y => y > Math.max(y0a, y0b) + 1e-4 && y < y1 - 1e-4);
    let a0 = y0a, b0 = y0b;
    for (const y of [...cuts, y1]) {
      M.quad([P(r, t0, a0), P(r, t1, b0), P(r, t1, y), P(r, t0, y)], [radial(t0), radial(t1), radial(t1), radial(t0)],
        [wall(aoAt(a0)), wall(aoAt(b0)), wall(aoAt(y)), wall(aoAt(y))], [[t0 * RAD, a0], [t1 * RAD, b0], [t1 * RAD, y], [t0 * RAD, y]]);
      a0 = y; b0 = y;
    }
  };

  /* the doors. A small door is an arch cut into the wall in a stone frame standing out of it. The gatekeeper's gate is a portal: a
     wide arch in orders stepping back into the wall (two, three from the sixth floor), each with its impost and its plinth, a
     keystone over all, steps up to it, and two arched leaves on iron straps that swing in as the gate is reached */
  const frames = DOORS.map((thc, i) => {
    const gate = i === 4, hw = gate ? o.gHalf : SMALL, a = Math.sin(hw * RAD);
    const K = gate ? (o.arch2 ? 3 : 2) : 1, w = gate ? 0.04 : o.fw;
    const rings = Array.from({ length: K + 1 }, (_, k) => a + k * w);     // rings[0] the opening, rings[K] the portal's edge
    const out = 1 + o.proud + (gate ? 0.012 : 0);
    const faces = Array.from({ length: K }, (_, k) => out - (K - 1 - k) * 0.024); // each order's face, the inner ones deeper
    const outer = rings[K];
    return { g: i + 1, thc, hw, a, rings, faces, K, outer, fa: Math.asin(outer) / RAD, sp: (gate ? o.gSpring : SPRING) * H, gate, depth: o.depth * (gate ? 1.8 : 1) };
  });
  // the columns: every STEP degrees on the wall, and round every arch evenly by its own angle, so a curve is as smooth at its springs
  // as at its crown (cut by the wall's angle, the steep ends of an arch were long straight pieces)
  const cuts = new Set();
  for (let t = span[0]; t <= span[1] + 1e-6; t += STEP) cuts.add(+t.toFixed(4));
  const dPsi = j >= 7 ? 15 : 6;
  for (const d of frames) for (const a of d.rings) for (let psi = 0; psi <= 180 + 1e-6; psi += dPsi) cuts.add(+(d.thc + Math.asin(a * Math.cos(psi * RAD)) / RAD).toFixed(4));
  const T = [...cuts].sort((x, y) => x - y);
  const dx = (d, th) => Math.sin((th - d.thc) * RAD);
  const arc = (d, a, th) => d.sp + Math.sqrt(Math.max(0, a * a - dx(d, th) ** 2));
  const crown = d => d.sp + d.a;
  const courseY = SPRING * H * 0.98;
  // the face of an arch at angle th and height y, turned toward the opening's middle
  const inward = (d, a, th, y) => {
    const u = dx(d, th) / a, v = Math.max(0, y - d.sp) / a, tg = tangent(th), L = Math.hypot(u, v) || 1;
    return [-(tg[0] * u) / L, -v / L, -(tg[2] * u) / L];
  };
  const lipN = th => { const r = radial(th); return [r[0] * 0.3, 0.95, r[2] * 0.3]; };
  const orderTone = (d, k) => (k === d.K - 1 ? stone : k === 0 && d.K > 1 ? stoneDeep : surf(mix(pal.stone, pal.wallShade, 0.12), mix(pal.stone, pal.wallShade, 0.65)));
  const iron = surf(mix(pal.pane, pal.stone, 0.4), mix(pal.pane, pal.ground, 0.2));

  for (let i = 0; i < T.length - 1; i++) {
    const t0 = T[i], t1 = T[i + 1], tm = (t0 + t1) / 2;
    const d = frames.find(f => Math.abs(dx(f, tm)) < f.outer);
    if (!d) {
      wallQuad(t0, t1, 0, 0, top);
      if (o.course) {
        // the string course: a band standing out of the wall at the doors' spring, its top lit
        const y0 = courseY, y1 = courseY + 0.03, rc = 1.014;
        M.quad([P(rc, t0, y0), P(rc, t1, y0), P(rc, t1, y1), P(rc, t0, y1)], [radial(t0), radial(t1)], [stone]);
        M.quad([P(1, t0, y1), P(1, t1, y1), P(rc, t1, y1), P(rc, t0, y1)], [UP], [stone]);
        M.quad([P(1, t0, y0), P(1, t1, y0), P(rc, t1, y0), P(rc, t0, y0)], [DOWN], [stoneDeep]);
      }
      continue;
    }
    const x = Math.abs(dx(d, tm)), inDoor = x < d.a;
    wallQuad(t0, t1, arc(d, d.outer, t0), arc(d, d.outer, t1), top);
    // the orders this column crosses, from the one it stands in (or the opening's arch) out to the edge, each a face and its step
    let k0 = 0;
    while (k0 < d.K - 1 && x >= d.rings[k0 + 1]) k0++;
    let ya = inDoor ? arc(d, d.a, t0) : 0, yb = inDoor ? arc(d, d.a, t1) : 0;
    for (let k = k0; k < d.K; k++) {
      const r = d.faces[k], a1 = d.rings[k + 1], y1a = arc(d, a1, t0), y1b = arc(d, a1, t1);
      M.quad([P(r, t0, ya), P(r, t1, yb), P(r, t1, y1b), P(r, t0, y1a)], [radial(t0), radial(t1)], [orderTone(d, k)]);
      if (k + 1 < d.K) {
        const rn = d.faces[k + 1];
        M.quad([P(r, t0, y1a), P(r, t1, y1b), P(rn, t1, y1b), P(rn, t0, y1a)], [inward(d, a1, t0, y1a), inward(d, a1, t1, y1b), inward(d, a1, t1, y1b), inward(d, a1, t0, y1a)], [stone]);
      } else {
        M.quad([P(1, t0, y1a), P(1, t1, y1b), P(r, t1, y1b), P(r, t0, y1a)], [lipN(t0), lipN(t1)], [stone]);
      }
      ya = y1a; yb = y1b;
    }
    if (d.gate && !inDoor) {
      // the order's impost at the spring and its plinth at the foot, standing out of its face
      const r = d.faces[k0], ri = r + 0.012, sp = d.sp;
      for (const [y0, y1] of [[sp - 0.032, sp], [0, 0.05]]) {
        M.quad([P(ri, t0, y0), P(ri, t1, y0), P(ri, t1, y1), P(ri, t0, y1)], [radial(t0), radial(t1)], [stone]);
        M.quad([P(r, t0, y1), P(r, t1, y1), P(ri, t1, y1), P(ri, t0, y1)], [UP], [stone]);
        if (y0 > 0) M.quad([P(r, t0, y0), P(r, t1, y0), P(ri, t1, y0), P(ri, t0, y0)], [DOWN], [stoneDeep]);
      }
    }
    if (!inDoor) continue;
    // the doorway: the soffit under the arch (lit by the room) and the room behind (or the gate's leaves before its hall)
    const i0 = arc(d, d.a, t0), i1 = arc(d, d.a, t1), r0 = d.faces[0], bk = r0 - d.depth, hD = crown(d);
    const door = role => [id(d.g), role, 0, 0];
    M.quad([P(bk, t0, i0), P(bk, t1, i1), P(r0, t1, i1), P(r0, t0, i0)], [inward(d, d.a, t0, i0), inward(d, d.a, t1, i1), inward(d, d.a, t1, i1), inward(d, d.a, t0, i0)], [dark],
      [[0, i0 / hD], [0, i1 / hD], [0, i1 / hD], [0, i0 / hD]], door(2));
    M.quad([P(bk, t0, 0), P(bk, t1, 0), P(bk, t1, i1), P(bk, t0, i0)], [radial(tm)], [surf(mix(pal.pane, pal.wallShade, 0.2), pal.pane, { flat: true })],
      [[0, 0], [0, 0], [0, i1 / hD], [0, i0 / hD]], door(1));
    if (d.gate) {
      /* the gate's two leaves, arched as the opening is, a deep tone of the stone on three iron straps, hung on the jambs: they swing
         in as the gate is reached (its light passing .55), so a gate played or beaten stands open on its hall */
      const leaf = r0 - 0.03, side = tm < d.thc ? -1 : 1, tc = mix(pal.stone, pal.pane, 0.72);
      const hinge = P(leaf, d.thc + side * d.hw, 0);
      const lr = [id(d.g), side < 0 ? 3 : 4, hinge[0], hinge[2]];
      const lt = surf(mix(tc, pal.lit, 0.06), mix(tc, pal.ground, pal.light ? 0.2 : 0.45));
      const nn = th => { const r = radial(th), t = tangent(th); return [r[0] + t[0] * 0.25 * side, 0, r[2] + t[2] * 0.25 * side]; };
      M.quad([P(leaf, t0, 0), P(leaf, t1, 0), P(leaf, t1, i1), P(leaf, t0, i0)], [nn(t0), nn(t1)], [lt], [[t0 * RAD, 0], [t1 * RAD, 0], [t1 * RAD, i1], [t0 * RAD, i0]], lr);
      for (const f of [0.1, 0.4, 0.7]) {
        const y0 = hD * f - 0.011, y1 = hD * f + 0.011;
        if (y1 > Math.min(i0, i1) - 0.01) continue;
        M.quad([P(leaf + 0.006, t0, y0), P(leaf + 0.006, t1, y0), P(leaf + 0.006, t1, y1), P(leaf + 0.006, t0, y1)], [nn(t0), nn(t1)], [iron], NOGRAIN, lr);
        M.quad([P(leaf, t0, y1), P(leaf, t1, y1), P(leaf + 0.006, t1, y1), P(leaf + 0.006, t0, y1)], [UP], [iron], NOGRAIN, lr);
      }
    }
  }
  for (const d of frames) {
    const bk = d.faces[0] - d.depth, hD = crown(d);
    // the seam where the gate's leaves meet, lit at .382 by the hall behind while the gate is the next game
    if (d.gate) {
      const r = d.faces[0] - 0.03 + 0.008, a = d.thc - 0.3, b = d.thc + 0.3;
      M.quad([P(r, a, 0), P(r, b, 0), P(r, b, hD - 0.004), P(r, a, hD - 0.004)], [radial(d.thc)], [surf(pal.pane, pal.pane, { flat: true })], [[0, 0.3], [0, 0.3], [0, 0.3], [0, 0.3]], [id(d.g), 6, 0, 0]);
    }
    // the keystone at the crown, over every order of the gate
    if (o.key || d.gate) {
      const hk = d.gate ? 3 : 1.7, c0 = hD - 0.012, c1 = Math.min(top - 0.006, d.sp + d.outer + (d.gate ? 0.03 : 0.018)), r0 = d.faces[d.K - 1], rk = r0 + 0.01;
      const a = d.thc - hk, b = d.thc + hk, a1 = a - hk * 0.3, b1 = b + hk * 0.3;
      M.quad([P(rk, a, c0), P(rk, b, c0), P(rk, b1, c1), P(rk, a1, c1)], [radial(d.thc)], [stone]);
      M.quad([P(r0, a1, c1), P(r0, b1, c1), P(rk, b1, c1), P(rk, a1, c1)], [UP], [stone]);
      M.quad([P(d.faces[0], a, c0), P(rk, a, c0), P(rk, a1, c1), P(d.faces[0], a1, c1)], [tangent(a).map(v => -v)], [stoneDeep]);
      M.quad([P(d.faces[0], b, c0), P(rk, b, c0), P(rk, b1, c1), P(d.faces[0], b1, c1)], [tangent(b)], [stoneDeep]);
      M.quad([P(d.faces[0], a, c0), P(d.faces[0], b, c0), P(rk, b, c0), P(rk, a, c0)], [DOWN], [stoneDeep]);
    }
    for (const sg of [-1, 1]) {
      // the jamb (lit by the room), each order's step facing the opening, and the portal's outer side
      const th = d.thc + sg * d.hw, nj = tangent(th).map(v => v * -sg);
      M.quad([P(bk, th, 0), P(d.faces[0], th, 0), P(d.faces[0], th, d.sp), P(bk, th, d.sp)], [nj], [dark], [[0, 0], [0, 0], [0, d.sp / hD], [0, d.sp / hD]], [id(d.g), 2, 0, 0]);
      for (let k = 1; k < d.K; k++) {
        const tk = d.thc + sg * Math.asin(d.rings[k]) / RAD, nk = tangent(tk).map(v => v * -sg);
        M.quad([P(d.faces[k - 1], tk, 0), P(d.faces[k], tk, 0), P(d.faces[k], tk, d.sp), P(d.faces[k - 1], tk, d.sp)], [nk], [stone]);
      }
      const tK = d.thc + sg * d.fa, nK = tangent(tK).map(v => v * sg);
      M.quad([P(1, tK, 0), P(d.faces[d.K - 1], tK, 0), P(d.faces[d.K - 1], tK, d.sp), P(1, tK, d.sp)], [nK], [stoneDeep]);
    }
  }
  /* the cornice: a profile turned round the axis, its mouldings by the floor's rank, out to the roof's edge; then the roof, the
     next floor's terrace, its shade deepening to the next wall's foot */
  const lathe = (pts, a = span[0], b = span[1], step = STEP, sf = () => stone) => {
    for (let q = 0; q < pts.length - 1; q++) {
      const [r0, y0, ao0 = 0] = pts[q], [r1, y1, ao1 = 0] = pts[q + 1];
      const dr = r1 - r0, dy = y1 - y0, L = Math.hypot(dr, dy) || 1, nr = dy / L, ny = -dr / L;
      const s0 = { ...sf(q), ao: ao0 }, s1 = { ...sf(q), ao: ao1 };
      for (let t = a; t < b - 1e-6; t += step) {
        const u = Math.min(b, t + step), N = th => { const r = radial(th); return [r[0] * nr, ny, r[2] * nr]; };
        M.quad([P(r0, t, y0), P(r0, u, y0), P(r1, u, y1), P(r1, t, y1)], [N(t), N(u), N(u), N(t)], [s0, s0, s1, s1]);
      }
    }
  };
  const C = 1.06;
  /* the dentils sit in the shade under a corona that stands out past them, so from above only the corona is seen (2026-11-11, the
     user: "이상한 하얀색 선이 깨져 보이네": standing past a sloped moulding, their lit tops read as a broken white line) */
  const prof = o.tiers === 1
    ? [[1, top], [1, top + 0.03], [1.03, top + 0.045], [C, top + 0.07], [C, H]]
    : o.tiers === 2
      ? [[1, top], [1.012, top], [1.012, top + 0.03], [1.042, top + 0.03], [1.042, top + 0.05], [C, top + 0.07], [C, H]]
      : [[1, top - 0.02], [1.01, top - 0.02], [1.01, top], [1.02, top], [1.02, top + 0.03], [1.05, top + 0.03], [1.05, top + 0.05], [C + 0.01, top + 0.068], [C + 0.01, H]];
  lathe(prof);
  {
    // the steps up to the gatekeeper's gate, on the terrace before it
    const g = frames[4], out = g.faces[g.K - 1], a = g.thc - g.fa - 2, b = g.thc + g.fa + 2;
    lathe([[out + 0.1, 0], [out + 0.1, 0.012], [out + 0.05, 0.012], [out + 0.05, 0.024], [out - 0.01, 0.024]], a, b, 1, () => tread());
    for (const [th, sg] of [[a, -1], [b, 1]]) {
      const nt = tangent(th).map(v => v * sg);
      M.quad([P(out - 0.01, th, 0), P(out + 0.05, th, 0), P(out + 0.05, th, 0.024), P(out - 0.01, th, 0.024)], [nt], [stoneDeep]);
      M.quad([P(out + 0.05, th, 0), P(out + 0.1, th, 0), P(out + 0.1, th, 0.012), P(out + 0.05, th, 0.012)], [nt], [stoneDeep]);
    }
  }
  const edge = prof[prof.length - 1][0];
  lathe([[edge, H, 0], [R + 0.06, H, 0], [R, H, 0.34]], span[0], span[1], STEP, () => tread());
  if (o.frieze) {
    /* the frieze: a plain band standing out of the wall under the cornice, broken only by the gate's portal (it replaced dentils,
       2026-11-11: at the tower's size a row of dentils read as a broken line) */
    const y1 = o.tiers === 3 ? top - 0.03 : top - 0.01, y0 = y1 - 0.035, g = frames[4];
    const band = [[1, y0], [1.01, y0], [1.01, y1], [1, y1]];
    lathe(band, span[0], g.thc - g.fa - 1);
    lathe(band, g.thc + g.fa + 1, span[1]);
  }

  if (n > 1) {
    // the parapet at the edge of the roof under this floor (that roof's edge, in this floor's units): its faces and coping
    const below = orderOf(n - 1), e = (below.tiers === 3 ? C + 0.01 : C) / R, h = 0.08;
    lathe([[e - 0.026, 0], [e - 0.026, h], [e - 0.03, h + 0.016], [e + 0.012, h + 0.016], [e + 0.012, h], [e, h], [e, 0]]);
    if (o.crenel) {
      // the merlons on the coping: a block every six degrees, its face, its top and its sides
      const y0 = h + 0.016, y1 = y0 + 0.034, ri = e - 0.026, ro = e + 0.012;
      for (let t = span[0] + 3; t <= span[1] - 3; t += 6) {
        const a = t - 1.6, b = t + 1.6;
        M.quad([P(ro, a, y0), P(ro, b, y0), P(ro, b, y1), P(ro, a, y1)], [radial(t)], [stone]);
        M.quad([P(ri, a, y1), P(ri, b, y1), P(ro, b, y1), P(ro, a, y1)], [UP], [tread()]);
        M.quad([P(ri, a, y0), P(ro, a, y0), P(ro, a, y1), P(ri, a, y1)], [tangent(a).map(x => -x)], [stoneDeep]);
        M.quad([P(ri, b, y0), P(ro, b, y0), P(ro, b, y1), P(ri, b, y1)], [tangent(b)], [stoneDeep]);
        M.quad([P(ri, a, y0), P(ri, b, y0), P(ri, b, y1), P(ri, a, y1)], [radial(t).map(x => -x)], [stoneDeep]);
      }
    }
  } else {
    // the stepped base the first floor stands on: three rings of stone, each wider and lower
    for (let q = 0; q < 3; q++) {
      const r = 1.1 + 0.085 * q, y1 = -0.045 * q, y0 = y1 - 0.045;
      lathe([[r, y0], [r, y1]], -180, 180, 3);
      lathe([[r - 0.085, y1, q === 0 ? 0.3 : 0.12], [r - 0.06, y1, 0], [r, y1, 0]], -180, 180, 3, () => tread());
    }
  }
}

/* the ground, under the first floor: the plaza round the base, its shade deepest at the tower's foot, out to fields that close
   into the night's own colour (the fog does that, so the ground needs no edge) */
function groundMesh(M, S, lo, pal) {
  const s = scaleOf(1 - lo), y = footOf(1 - lo) - 0.133 * s;
  const P = (r, th) => [r * s * Math.sin(th * RAD), y, r * s * Math.cos(th * RAD)];
  const rings = [0, 1.36, 1.8, 2.6, 4, 7, 14, 30, 70, 160, 400, 1000, 3000];
  const sf = r => ({ lit: r < 3 ? pal.g0 : pal.g1, shade: r < 3 ? pal.g0 : pal.g1, k: -99, flat: true });
  for (let i = 0; i < rings.length - 1; i++) for (let t = -180; t < 180; t += 6) {
    const a = rings[i], b = rings[i + 1];
    M.quad([P(a, t), P(a, t + 6), P(b, t + 6), P(b, t)], [UP], [sf(a), sf(a), sf(b), sf(b)]);
  }
  // the tower's shade on the plaza
  const deep = pal.light ? 0.22 : 0.5, shade = [1.36, 1.46, 1.58, 1.72, 1.88, 2.06, 2.26, 2.5, 2.78, 3.08, 3.4];
  const sh = r => ({ lit: pal.shadow, shade: pal.shadow, k: -99, flat: true, alpha: deep * (1 - (r - 1.36) / 2.04) ** 2 });
  const P2 = (r, th) => { const p = P(r, th); p[1] += 0.002 * s; return p; };
  for (let i = 0; i < shade.length - 1; i++) for (let t = -180; t < 180; t += 6) {
    const a = shade[i], b = shade[i + 1];
    S.quad([P2(a, t), P2(a, t + 6), P2(b, t + 6), P2(b, t)], [UP], [sh(a), sh(a), sh(b), sh(b)]);
  }
}

/* the mesh for floors lo to hi (numbers in the tower), lo the mesh's unit. It holds no state (doors are lit by uniforms) and no size
   (the camera makes it any size), so one is kept for each range and palette and a redraw or a resize builds nothing */
const built = new Map();
export function buildModel(lo, hi, pal) {
  const key = `${lo}:${hi}:${JSON.stringify(pal)}`;
  if (built.has(key)) return built.get(key);
  const M = mesh(), S = mesh();
  for (let n = lo; n <= hi; n++) floorMesh(M, n - lo, n, pal);
  groundMesh(M, S, lo, pal);
  const model = { lo, hi, solid: M.done(), soft: S.done() };
  if (built.size >= 4) built.delete(built.keys().next().value);
  built.set(key, model);
  return model;
}

/* ---------- the shaders ---------- */
const VS = `#version 300 es
in vec3 aP; in vec3 aN; in vec4 aL; in vec3 aS; in vec4 aX; in vec2 aU; in vec4 aD;
uniform mat4 uVP; uniform float uDoor[${SPAN * 5}];
out vec3 vN, vS, vW; out vec4 vL, vX, vD; out vec2 vU; out float vV;
void main() {
  vec3 p = aP, n = aN;
  float v = aD.x >= 0. ? uDoor[int(aD.x + .5)] : 0.;
  if (aD.y > 2.5 && aD.y < 4.5) {
    // a leaf of the gate swings in about its hinge as the gate is reached
    float a = smoothstep(.55, 1., v) * 1.7 * (aD.y < 3.5 ? 1. : -1.), c = cos(a), s = sin(a);
    vec2 r = p.xz - aD.zw;
    p.xz = aD.zw + vec2(r.x * c + r.y * s, -r.x * s + r.y * c);
    n.xz = vec2(n.x * c + n.z * s, -n.x * s + n.z * c);
  }
  vW = p; vN = n; vL = aL; vS = aS; vX = aX; vU = aU; vD = aD; vV = v;
  gl_Position = uVP * vec4(p, 1.);
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vN, vS, vW; in vec4 vL, vX, vD; in vec2 vU; in float vV;
uniform vec3 uLight, uEye, uSky, uRim, uFog, uWarm, uAmber, uLift;
uniform float uCamK, uR, uDay, uFogN, uFogD, uLiftMix, uLiftDoor;
uniform vec4 uPL[12], uPC[12]; uniform int uNL;
uniform float uYA, uJN, uH;
out vec4 o;
float lightOf(float k) { return k <= 0. ? 1. : max(.16, pow(uR, 1.7 * k)); }
/* the drums' shadow along the moonlight: whether the way from p toward the light passes inside a drum above p (each floor j an
   upright drum of radius R^j from its foot to its roof), soft at its edge */
float drums(vec3 p) {
  vec2 v = uLight.xz / uLight.y;
  float sh = 0.;
  for (int k = 0; k < 18; k++) {
    float j = float(k);
    if (j > uJN) break;
    float s = pow(uR, j), f = uYA * (1. - s), ya = max(f, p.y + 1e-4), yb = f + uH * s;
    if (yb <= ya) continue;
    float tm = clamp(-dot(p.xz, v) / dot(v, v), ya - p.y, yb - p.y), r = s * 1.04;
    // the further the shadow falls from what casts it, the softer its edge and the fainter it lies
    float far = tm * length(v) / s, soft = .03 + .05 * far;
    sh = max(sh, (1. - smoothstep(r * (1. - soft), r * (1. + soft), length(p.xz + v * tm))) * (1. - smoothstep(.8, 4.5, far)));
  }
  return sh;
}
void main() {
  float role = vD.y, v = vV;
  if (role > 5.5 && v > .6) discard;
  vec3 n = normalize(vN), c;
  if (vX.w > .5) c = vL.rgb;
  else {
    float d = dot(n, uLight);
    // the light turning round the drum, its terminator kept a little firm, as a painted stone is
    float t = smoothstep(-.4, .8, d);
    t = mix(t, smoothstep(.2, .8, t), .4);
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
      // the cornice's shadow on the wall under it, longer where the light grazes the drum
      float facing = dot(normalize(n.xz + 1e-5), normalize(uLight.xz));
      float edge = uH - .1 - .066 * uLight.y / (length(uLight.xz) * max(facing, .04)), bw = fwidth(vU.y) * 1.5;
      c = mix(c, vS, (facing > 0. ? smoothstep(edge - bw, edge + bw, vU.y) : 0.) * .75);
    }
    if (role > 2.5 && role < 4.5 && vU.y >= 0.) {
      // the gate's leaves are boards: their joints, upright, faded where thinner than a pixel
      float g = vU.x / .03, w = fwidth(g), f = fract(g);
      c *= 1. - .28 * (1. - smoothstep(0., w * 1.4, min(f, 1. - f))) * clamp(1.6 - w * 7., 0., 1.);
    }
    // a rim of moonlight on the lit edge, where the drum turns away
    vec3 e = normalize(uEye - vW);
    float rim = pow(1. - max(0., dot(n, e)), 4.) * smoothstep(0., .5, d);
    c = mix(c, uRim, rim * .35);
  }
  c *= 1. - vX.x;
  // what faces up (the terraces, the plaza) lies in the drums' shadow away from the moon
  if (n.y > .5) c *= 1. - drums(vW) * (uDay > .5 ? .26 : .42);
  // a doorway's light: dark, .382 for the next game, warm won, amber gone into; brightest at the floor
  if ((role > .5 && role < 2.5) || role > 4.5) {
    float g = mix(1., .62, clamp(vU.y, 0., 1.)) * (role > 1.5 && role < 2.5 ? .78 : 1.);
    vec3 glow = v <= 1. ? uWarm : mix(uWarm, uAmber, v - 1.);
    c = mix(c, glow * g, clamp(v, 0., 1.) * (role > 1.5 && role < 2.5 ? .7 : 1.));
  }
  // the lit doors' light on the stone round them, and the run's light going along the terrace
  for (int i = 0; i < 12; i++) {
    if (i >= uNL) break;
    vec3 d = uPL[i].xyz - vW;
    float L = length(d), a = max(0., 1. - L / uPL[i].w);
    float lam = vX.w > .5 ? 1. : max(0., dot(n, d / max(L, 1e-5))) * .8 + .2;
    c = mix(c, uPC[i].rgb, clamp(a * a * lam * uPC[i].a, 0., 1.));
  }
  // distance closes into the night; the floors still to climb go up into it
  float dist = length(vW - uEye);
  c = mix(c, uFog, 1. - exp(-max(0., dist - uFogN) / uFogD));
  c = mix(c, uSky, 1. - lightOf(vX.z - uCamK));
  // going in: the room gone into becomes the lift's doors' own tone
  if (abs(vD.x - uLiftDoor) < .5 && role > .5 && role < 2.5) c = mix(c, uLift, uLiftMix);
  o = vec4(c * vL.a, vL.a);
}`;

let ctx = null;
function context() {
  if (ctx && !ctx.gl.isContextLost()) return ctx;
  ctx = null;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return null; }
  const vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  [["aP", 3, 0], ["aN", 3, 3], ["aL", 4, 6], ["aS", 3, 10], ["aX", 4, 13], ["aU", 2, 17], ["aD", 4, 19]].forEach(([n, size, off]) => {
    const l = gl.getAttribLocation(p, n);
    if (l < 0) return;
    gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, STRIDE * 4, off * 4);
  });
  const names = ["uVP", "uDoor", "uLight", "uEye", "uSky", "uRim", "uFog", "uWarm", "uAmber", "uLift", "uCamK", "uR", "uDay", "uFogN", "uFogD", "uLiftMix", "uLiftDoor", "uPL", "uPC", "uNL", "uYA", "uJN", "uH"];
  const u = Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
  ctx = { canvas, gl, p, vao, buf, u, key: null, solid: 0, soft: 0 };
  return ctx;
}
/* the context made and the program compiled and drawn once in an idle moment before any tower is asked for (the battle page loads
   this module), so the first tower drawn pays only for its mesh */
export function warmTower() {
  const c = context();
  if (!c) return;
  const { gl } = c;
  gl.useProgram(c.p); gl.bindVertexArray(c.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, c.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(STRIDE * 3), gl.STATIC_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  c.key = null;
}

/* the picture without WebGL2: each floor's drum and its doors, flat in their tones, from the same camera */
function flat(out, model, cam, pal, view) {
  const g = out.getContext("2d"), w = out.width, h = out.height, k = w / (out.clientWidth || w);
  const css = c => `rgb(${c.map(x => Math.round(x * 255)).join(",")})`;
  g.clearRect(0, 0, w, h);
  g.save(); g.scale(k, k);
  for (let j = 0; j <= model.hi - model.lo; j++) {
    const poly = [];
    for (let th = -90; th <= 90; th += 6) poly.push(cam.project(onFloor(j, th, 0)));
    for (let th = 90; th >= -90; th -= 6) poly.push(cam.project(onFloor(j, th, H)));
    g.fillStyle = css(mix(pal.wallLit, pal.sky, 1 - Math.max(0.16, R ** (1.7 * Math.max(0, j - view.camK)))));
    g.beginPath(); poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill();
    DOORS.forEach((th, i) => {
      const v = view.doors[j * 5 + i], [x0, y0] = cam.project(onFloor(j, th - SMALL, 0)), [x1, y1] = cam.project(onFloor(j, th + SMALL, SPRING * H + 0.13));
      g.fillStyle = css(v <= 0 ? pal.pane : v <= 1 ? mix(pal.pane, pal.warm, v) : mix(pal.warm, pal.amber, v - 1));
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    });
  }
  g.restore();
}

/* render the model into out (a 2D canvas the scene shows) with the camera cam. view: { doors (the lit value of each door, by
   j * 5 + game - 1), camK (the floor stood on, in the mesh's floors), lights ([x, y, z, radius, r, g, b, strength]), lift ({ door,
   mix, inv }) } */
export function render(out, model, cam, pal, view) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(out.clientWidth * dpr) || out.width, h = Math.round(out.clientHeight * dpr) || out.height;
  if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
  const c = context();
  if (!c) { flat(out, model, cam, pal, view); return false; }
  const { gl, canvas, u } = c;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
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
  gl.uniform1fv(u.uDoor, view.doors);
  const L = [0.62, 0.46, 0.64], n = Math.hypot(...L);
  gl.uniform3f(u.uLight, L[0] / n, L[1] / n, L[2] / n);
  gl.uniform3fv(u.uEye, cam.pos); gl.uniform3fv(u.uSky, pal.sky); gl.uniform3fv(u.uRim, pal.lit); gl.uniform3fv(u.uFog, pal.fog);
  gl.uniform3fv(u.uWarm, pal.warm); gl.uniform3fv(u.uAmber, pal.amber);
  gl.uniform1f(u.uYA, YA); gl.uniform1f(u.uJN, model.hi - model.lo); gl.uniform1f(u.uH, H);
  gl.uniform1f(u.uCamK, view.camK); gl.uniform1f(u.uR, R); gl.uniform1f(u.uDay, pal.light ? 1 : 0);
  gl.uniform1f(u.uFogN, cam.s * 6); gl.uniform1f(u.uFogD, cam.s * (pal.light ? 26 : 18));
  const lift = view.lift || { door: -9, mix: 0 };
  gl.uniform3fv(u.uLift, pal.lift); gl.uniform1f(u.uLiftMix, lift.mix); gl.uniform1f(u.uLiftDoor, lift.door);
  const lights = (view.lights || []).slice(0, 12), PL = new Float32Array(48), PC = new Float32Array(48);
  lights.forEach((l, i) => { PL.set(l.slice(0, 4), i * 4); PC.set(l.slice(4, 8), i * 4); });
  gl.uniform4fv(u.uPL, PL); gl.uniform4fv(u.uPC, PC); gl.uniform1i(u.uNL, lights.length);
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
