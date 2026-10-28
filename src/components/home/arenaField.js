/* The home arena's battle field, flat (2026-10-28, structural). The field lies back in perspective, but it never moves in
   3D: only light moves over it. It used to be two CSS 3D planes (perspective 900px from 50% 30% of the stage,
   rotateX(68deg)), which a phone kept as two huge 3D layers plus the layers they forced around them. Here the same plane is
   projected once, in the stage's own pixels, into flat outlines an SVG draws as one painted picture.

   Plane coordinates: u across, v down the field, from its centre, in CSS px before the tilt. Every line is a ring between an
   outer and an inner outline (evenodd), so a line is thicker where the field comes nearer, as the 3D border was. */
const BANDS = 24, D = 900, TILT = 68 * Math.PI / 180, ORIGIN_Y = .3, ASPECT = .64, LINE = 3, R_FIELD = 36, R_BOX = 32;

/* the field's width at a stage width: clamp(730px, 190vw, 1500px), the same as pages.css --fw */
export const fieldWidth = w => Math.min(1500, Math.max(730, w * 1.9));

export function projector(w, h, floorY) {
  const cos = Math.cos(TILT), sin = Math.sin(TILT), ox = w / 2, oy = h * ORIGIN_Y;
  return (u, v) => { const s = D / (D - v * sin); return [ox + u * s, oy + (floorY + v * cos - oy) * s]; };
}

/* outlines as point lists in plane coordinates */
const arc = (cx, cy, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const H = Math.PI / 2;
/* a rectangle with its corners rounded as [top-left, top-right, bottom-right, bottom-left] */
export function roundRect(x0, y0, x1, y1, [tl, tr, br, bl]) {
  const c = (cx, cy, r, a) => r > 0 ? arc(cx, cy, r, a, a + H) : [[cx + r * Math.cos(a), cy + r * Math.sin(a)]];
  return [...c(x1 - tr, y0 + tr, tr, -H), ...c(x1 - br, y1 - br, br, 0), ...c(x0 + bl, y1 - bl, bl, H), ...c(x0 + tl, y0 + tl, tl, Math.PI)];
}
export const circle = (r, n = 96) => arc(0, 0, r, 0, 2 * Math.PI, n).slice(0, -1);

export function arenaField(w, h, floorY) {
  const W = fieldWidth(w), Hf = W / ASPECT, P = projector(w, h, floorY), L = LINE;
  const path = (...rings) => rings.map(pts => "M" + pts.map(([u, v]) => P(u, v).map(n => n.toFixed(1)).join(" ")).join("L") + "Z").join("");
  const ellipse = (rx, ry, n = 96) => circle(1, n).map(([x, y]) => [x * rx, y * ry]);
  // a gradient solid to `from` and clear at `to` (shares of the radii): a solid core and BANDS rings fading out
  const bands = (rx, ry, from, to) => {
    const at = t => ellipse(rx * t, ry * t), out = from > 0 ? [{ d: path(at(from)), o: 1 }] : [];
    for (let i = 0; i < BANDS; i++) {
      const t0 = from + (to - from) * i / BANDS, t1 = from + (to - from) * (i + 1) / BANDS;
      out.push({ d: t0 > 0 ? path(at(t1), at(t0)) : path(at(t1)), o: +(1 - (i + .5) / BANDS).toFixed(3) });
    }
    return out;
  };

  const fx = W * .44, fy = Hf * .42;                       // the edge: inset 8% 6%
  const ringR = W * .23, knobR = W * .045;                 // the circle (46%) and the button (9%)
  const bx = W * .2, by0 = -Hf * .42, by1 = by0 + Hf * .12; // a trainer box: 40% wide, 12% deep, at the edge
  return {
    rect: path(roundRect(-fx, -fy, fx, fy, [R_FIELD, R_FIELD, R_FIELD, R_FIELD]), roundRect(-fx + L, -fy + L, fx - L, fy - L, Array(4).fill(R_FIELD - L))),
    line: path([[-fx, -L / 2], [fx, -L / 2], [fx, L / 2], [-fx, L / 2]]),
    ring: path(circle(ringR), circle(ringR - L)),
    knob: path(circle(knobR, 48), circle(knobR - L, 48)),
    // the button's face: radial-gradient(closest-side, line 40%, transparent 46%) of the 3D button, a solid disc here
    face: path(circle((knobR - L) * .43, 48)),
    boxT: path(roundRect(-bx, by0, bx, by1, [0, 0, R_BOX, R_BOX]), roundRect(-bx + L, by0, bx - L, by1 - L, [0, 0, R_BOX - L, R_BOX - L])),
    boxB: path(roundRect(-bx, -by1, bx, -by0, [R_BOX, R_BOX, 0, 0]), roundRect(-bx + L, -by1 + L, bx - L, -by0, [R_BOX - L, R_BOX - L, 0, 0])),
    // radial gradients on the plane, drawn in perspective as bands of its own ellipse, each at its own opacity:
    // the plane's fade (closest-side, solid to 40%, gone at the edge) and the floor's pool (inset 10% -10%, gone at 75%)
    fade: bands(W / 2, Hf / 2, .4, 1),
    pool: bands(W * .6, Hf * .4, 0, .75),
  };
}
