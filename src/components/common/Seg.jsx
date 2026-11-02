import React from "react";
import { BARS, PHI, segCells } from "./seg.js";

/* A seven-segment display (DESIGN.md "Seven-segment displays"). Every cell holds all seven bars; the unlit ones stay at --off,
   so the cell reads as hardware, not as a font. A cell is h tall and h / phi wide, a bar .16 of the width thick, cells .32 apart.
   A display has a fixed number of cells: a smaller number leaves its leading cells dark. value holds digits, '-', ' ' and ':'
   (a narrow cell of two dots for a clock). Never under 32, whole numbers only. label is what assistive technology reads. */
export default function Seg({ value, h = 40, cells = 0, label, className = "" }) {
  const w = Math.round(h / PHI), t = Math.max(3, Math.round(w * .16)), r = t / 2, gap = Math.max(1, t * .18), sp = Math.round(w * .32);
  const x0 = r, x1 = w - r, y0 = r, ym = h / 2, y1 = h - r;
  const H = (xa, xb, y) => [[xa + gap, y], [xa + gap + r, y - r], [xb - gap - r, y - r], [xb - gap, y], [xb - gap - r, y + r], [xa + gap + r, y + r]];
  const V = (x, ya, yb) => [[x, ya + gap], [x + r, ya + gap + r], [x + r, yb - gap - r], [x, yb - gap], [x - r, yb - gap - r], [x - r, ya + gap + r]];
  const B = { a: H(x0, x1, y0), g: H(x0, x1, ym), d: H(x0, x1, y1), f: V(x0, y0, ym), b: V(x1, y0, ym), e: V(x0, ym, y1), c: V(x1, ym, y1) };
  const pts = (p, dx) => p.map(([x, y]) => `${(x + dx).toFixed(1)},${y.toFixed(1)}`).join(" ");
  const off = [], on = [];
  let x = 0;
  segCells(value, cells).forEach((c, i) => {
    if (c === ":") {
      const cx = x + t / 2;
      on.push(<rect key={i + "t"} x={cx} y={h * .3 - r} width={t} height={t} />, <rect key={i + "b"} x={cx} y={h * .7 - r} width={t} height={t} />);
      x += t * 2 + sp;
      return;
    }
    for (const k of "abcdefg") (BARS[c].includes(k) ? on : off).push(<polygon key={i + k} points={pts(B[k], x)} />);
    x += w + sp;
  });
  const W = Math.max(0, x - sp);
  return (
    <svg className={"seg" + (className ? " " + className : "")} width={Math.round(W)} height={h} viewBox={`0 0 ${W.toFixed(1)} ${h}`}
      fill="currentColor" role="img" aria-label={label ?? String(value).trim()}>
      <g className="off">{off}</g><g className="on">{on}</g>
    </svg>
  );
}
