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
