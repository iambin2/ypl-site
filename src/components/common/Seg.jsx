import React, { useLayoutEffect, useRef } from "react";
import { tone } from "./motion.js";
import { segShapes } from "./seg.js";

/* A seven-segment display (DESIGN.md "Seven-segment displays"). Every cell holds all seven bars; the unlit ones stay at --off,
   so the cell reads as hardware, not as a font. A cell is h tall and h / phi wide, a bar .16 of the width thick, cells .32 apart.
   A display has a fixed number of cells: a smaller number leaves its leading cells dark. value holds digits, '-', ' ' and ':'
   (a narrow cell of two dots for a clock). Never under 32, whole numbers only. label is what assistive technology reads.
   The off layer holds every bar of every cell, so a bar that lights goes from dim to lit, never from nothing. When the value
   changes, the bars switch at once and only the changed cells brighten once (tone), as hardware does. */
export default function Seg({ value, h = 40, cells = 0, label, className = "" }) {
  const { W, cells: shapes } = segShapes(value, h, cells);
  const chars = shapes.map(s => s.c);
  const svg = useRef(null), last = useRef(null);
  useLayoutEffect(() => {
    const was = last.current;
    last.current = chars;
    if (!was || was.length !== chars.length) return;
    tone([...svg.current.querySelectorAll(".on > g")].filter((_, i) => was[i] !== chars[i] && chars[i] !== " "));
  }, [chars.join("")]);
  const shape = (s, key) => (s.rect ? <rect key={key} x={s.rect[0]} y={s.rect[1]} width={s.rect[2]} height={s.rect[3]} /> : <polygon key={key} points={s.points} />);
  return (
    <svg ref={svg} className={"seg" + (className ? " " + className : "")} width={Math.round(W)} height={h} viewBox={`0 0 ${W.toFixed(1)} ${h}`}
      fill="currentColor" role="img" aria-label={label ?? String(value).trim()}>
      <g className="off">{shapes.flatMap((s, i) => s.off.map((b, j) => shape(b, `${i}-${j}`)))}</g>
      <g className="on">{shapes.map((s, i) => <g key={i}>{s.on.map((b, j) => shape(b, j))}</g>)}</g>
    </svg>
  );
}
