import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { GLYPHS, TITLE, titleBlock } from "../src/components/home/brandTitle.js";

/* moves an absolute path (M L H V A Z, as the wordmark is written) dx to the right */
const shift = (d, dx) => d.replace(/([MLHVAZ])([^MLHVAZ]*)/g, (_, c, args) => {
  const n = args.trim().split(/\s+/).filter(Boolean).map(Number);
  if (c === "M" || c === "L" || c === "H") n[0] += dx;
  if (c === "A") n[5] += dx;
  return c + n.map(v => +v.toFixed(4)).join(" ");
});

test("the title's Y, P and L are the wordmark's own letters", () => {
  const svg = readFileSync(new URL("../public/brand/ypl-wordmark.svg", import.meta.url), "utf8");
  const wordmark = svg.match(/ d="([^"]+)"/)[1];
  const ypl = [shift(GLYPHS.Y[1], 0), shift(GLYPHS.P[1], 118), shift(GLYPHS.L[1], 214)].join("");
  assert.equal(ypl, shift(wordmark, 0));
});

test("the title lays out every letter on three lines", () => {
  const block = titleBlock(TITLE);
  assert.equal(block.glyphs.length, TITLE.join("").length);
  assert.equal(block.h, 348);
  assert.ok(block.left < 0 && block.right > 600);
});
