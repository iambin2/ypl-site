const S = n => `../../public/sprites/pokemon/${n}.webp`;
const I = {
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4z"/>',
  news: '<path d="M5.5 3.5h13v17h-13zM9 8.5h6M9 12h6M9 15.5h3.5"/>',
  bracket: '<path d="M3.5 6h5.5v12H3.5M9 12h5.5M14.5 8.5h6v7h-6z"/>',
  rec: '<path d="M4 12h4v8H4zM10 5h4v15h-4zM16 9h4v11h-4z"/>',
  more: '<path d="M4.5 10.5h3v3h-3zM10.5 10.5h3v3h-3zM16.5 10.5h3v3h-3z" fill="currentColor"/>',
  moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>',
  sun: '<path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  arrow: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>', search: '<path d="M10.5 4.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM15 15l5 5"/>',
};
const ic = (n, s = 22, w = 1.5) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="square" stroke-linejoin="miter" style="display:block;flex:none">${I[n]}</svg>`;
const brand = (h = 20) => `<span class="brand"><svg width="${h * 1.51}" height="${h}"><use href="#wing"/></svg><svg width="${h * 2.6}" height="${h * .84}"><use href="#word"/></svg></span>`;
const bar = light => `<header class="bar">${brand(20)}${ic(light ? 'moon' : 'sun', 22)}</header>`;
const tabs = on => `<nav class="tabs">${[['home','홈'],['news','공지'],['bracket','대진표'],['rec','기록'],['more','더보기']].map(([k, l]) => `<a class="${k === on ? 'on' : ''}">${ic(k)}<span>${l}</span></a>`).join('')}</nav>`;

/* ---------- a seven segment display. Every digit cell holds all seven bars; the unlit ones stay faintly visible, as on a real board.
   A cell is h tall and h / phi wide. A display has a fixed number of cells: a smaller number leaves the leading cells dark. ---------- */
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ' ': '' };
function seg(v, h, n) {
  /* cells are digits, '-' or ' '; a '.' lights the decimal point of the cell before it; ':' is a narrow cell of two dots */
  const cells = [];
  for (const c of String(v)) { if (c === '.' && cells.length) cells[cells.length - 1].dp = true; else cells.push({ c }); }
  while (n && cells.filter(x => x.c !== ':').length < n) cells.unshift({ c: ' ' });
  const w = Math.round(h / 1.618), t = Math.max(3, Math.round(w * .16)), r = t / 2, gap = Math.max(1, t * .18), sp = Math.round(w * .32);
  const x0 = r, x1 = w - r, y0 = r, ym = h / 2, y1 = h - r;
  const H = (xa, xb, y) => [[xa + gap, y], [xa + gap + r, y - r], [xb - gap - r, y - r], [xb - gap, y], [xb - gap - r, y + r], [xa + gap + r, y + r]];
  const V = (x, ya, yb) => [[x, ya + gap], [x + r, ya + gap + r], [x + r, yb - gap - r], [x, yb - gap], [x - r, yb - gap - r], [x - r, ya + gap + r]];
  const B = { a: H(x0, x1, y0), g: H(x0, x1, ym), d: H(x0, x1, y1), f: V(x0, y0, ym), b: V(x1, y0, ym), e: V(x0, ym, y1), c: V(x1, ym, y1) };
  const poly = (pts, dx) => `<polygon points="${pts.map(([x, y]) => `${(x + dx).toFixed(1)},${y.toFixed(1)}`).join(' ')}"/>`;
  const sq = (x, y) => `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${t}" height="${t}"/>`;
  let off = '', on = '', x = 0;
  cells.forEach((cell, i) => {
    if (cell.c === ':') { const cx = x + (t * 2 - t) / 2; on += sq(cx, h * .3 - r) + sq(cx, h * .7 - r); x += t * 2 + sp; return; }
    for (const k of 'abcdefg') (SEG[cell.c].includes(k) ? (on += poly(B[k], x)) : (off += poly(B[k], x)));
    const dpx = x + w + (sp - t) / 2;
    if (cell.dp) on += sq(dpx, h - t); else if (i < cells.length - 1 && cells.some(q => q.dp)) off += sq(dpx, h - t);
    x += w + sp;
  });
  const W = x - sp;
  return `<svg class="seg" width="${W.toFixed(0)}" height="${h}" viewBox="0 0 ${W.toFixed(1)} ${h}" fill="currentColor"><g class="off">${off}</g><g class="on">${on}</g></svg>`;
}

