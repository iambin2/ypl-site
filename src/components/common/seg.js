/* The cells of a seven-segment display (Seg.jsx), apart from the drawing so the law can test them under Node. */
export const BARS = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg", "-": "g", " ": "" };
export const PHI = 1.618;

/* a display has a fixed number of cells: a smaller number leaves its leading cells dark; ':' is a dot cell and does not count */
export function segCells(value, cells = 0) {
  const out = [...String(value)].filter(c => c === ":" || c in BARS);
  while (out.filter(c => c !== ":").length < cells) out.unshift(" ");
  return out;
}

/* the width of n digit cells h tall: each h / phi wide, .32 of that apart */
export function segWidth(h, n) {
  const w = Math.round(h / PHI), sp = Math.round(w * .32);
  return n * w + (n - 1) * sp;
}

/* the bars of a display h tall, apart from React, so a picture drawn outside it (the battle stage's floor plate, stageFx.js) is the same
   hardware: each cell's bars as polygons (a dot cell's as squares), every bar in off and the lit ones in on */
export function segShapes(value, h, cells = 0) {
  const w = Math.round(h / PHI), t = Math.max(3, Math.round(w * .16)), r = t / 2, gap = Math.max(1, t * .18), sp = Math.round(w * .32);
  const x0 = r, x1 = w - r, y0 = r, ym = h / 2, y1 = h - r;
  const H = (xa, xb, y) => [[xa + gap, y], [xa + gap + r, y - r], [xb - gap - r, y - r], [xb - gap, y], [xb - gap - r, y + r], [xa + gap + r, y + r]];
  const V = (x, ya, yb) => [[x, ya + gap], [x + r, ya + gap + r], [x + r, yb - gap - r], [x, yb - gap], [x - r, yb - gap - r], [x - r, ya + gap + r]];
  const B = { a: H(x0, x1, y0), g: H(x0, x1, ym), d: H(x0, x1, y1), f: V(x0, y0, ym), b: V(x1, y0, ym), e: V(x0, ym, y1), c: V(x1, ym, y1) };
  const pts = (p, dx) => p.map(([x, y]) => `${(x + dx).toFixed(1)},${y.toFixed(1)}`).join(" ");
  const chars = segCells(value, cells), out = [];
  let x = 0;
  for (const c of chars) {
    if (c === ":") {
      const cx = x + t / 2;
      const dots = [h * .3 - r, h * .7 - r].map(y => ({ rect: [cx, y, t, t] }));
      out.push({ c, off: dots, on: dots });
      x += t * 2 + sp;
    } else {
      const bars = [..."abcdefg"].map(k => ({ k, points: pts(B[k], x) }));
      out.push({ c, off: bars, on: bars.filter(b => BARS[c].includes(b.k)) });
      x += w + sp;
    }
  }
  return { W: Math.max(0, x - sp), h, cells: out };
}
// the same display as SVG markup, for a picture the stage draws itself
export function segMarkup(value, h, cells = 0) {
  const { W, cells: cs } = segShapes(value, h, cells);
  const shape = s => (s.rect ? `<rect x="${s.rect[0]}" y="${s.rect[1]}" width="${s.rect[2]}" height="${s.rect[3]}"/>` : `<polygon points="${s.points}"/>`);
  return `<svg class="seg" width="${Math.round(W)}" height="${h}" viewBox="0 0 ${W.toFixed(1)} ${h}" fill="currentColor" aria-hidden="true">`
    + `<g class="off">${cs.flatMap(c => c.off).map(shape).join("")}</g><g class="on">${cs.map(c => `<g>${c.on.map(shape).join("")}</g>`).join("")}</g></svg>`;
}
