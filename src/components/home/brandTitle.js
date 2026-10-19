/* YONSEI POKEMON LEAGUE, drawn in the wordmark's construction (DECISIONS 10차). It is drawn, never typeset.
   Grid as public/brand/ypl-wordmark.svg and scripts/build-figures.py: cap 100, y down, stems 28, outer bars 24,
   middle bars 14 ending at 56, the band cut 56-64, outer corners 18, letters 8 apart, slanted 12 degrees.
   Y, P and L are the wordmark's own letters (tests/brandTitle.test.mjs checks it). K and M take the Y's arms
   (the same angle and weight), N's diagonal is a stem's weight. */
export const GLYPHS = {
  Y: [110, "M0 0 H34.7 L55 27.7 L75.3 0 H110 L69 56 H41 Z M41 64 H69 V100 H41 Z"],
  P: [88, "M0 0 H70 A18 18 0 0 1 88 18 V46 A18 18 0 0 1 84.9666 56 H0 Z M28 24 H60 V42 H28 Z M0 64 H28 V100 H0 Z"],
  L: [72, "M0 0 H28 V56 H0 Z M0 64 H28 V76 H72 V100 H0 Z"],
  O: [88, "M0 18 A18 18 0 0 1 18 0 H70 A18 18 0 0 1 88 18 V56 H60 V24 H28 V56 H0 Z M0 64 H28 V76 H60 V64 H88 V82 A18 18 0 0 1 70 100 H18 A18 18 0 0 1 0 82 Z"],
  I: [28, "M0 0 H28 V56 H0 Z M0 64 H28 V100 H0 Z"],
  E: [72, "M0 0 H72 V24 H28 V42 H64 V56 H0 Z M0 64 H28 V76 H72 V100 H0 Z"],
  S: [88, "M0 18 A18 18 0 0 1 18 0 H88 V24 H28 V42 H88 V56 H0 Z M60 64 H88 V82 A18 18 0 0 1 70 100 H0 V76 H60 Z"],
  U: [88, "M0 0 H28 V56 H0 Z M60 0 H88 V56 H60 Z M0 64 H28 V76 H60 V64 H88 V82 A18 18 0 0 1 70 100 H18 A18 18 0 0 1 0 82 Z"],
  A: [88, "M0 18 A18 18 0 0 1 18 0 H70 A18 18 0 0 1 88 18 V56 H0 Z M28 24 V42 H60 V24 Z M0 64 H28 V100 H0 Z M60 64 H88 V100 H60 Z"],
  G: [88, "M0 18 A18 18 0 0 1 18 0 H70 A18 18 0 0 1 88 18 V24 H28 V56 H0 Z M44 42 H88 V56 H44 Z M0 64 H28 V76 H60 V64 H88 V82 A18 18 0 0 1 70 100 H18 A18 18 0 0 1 0 82 Z"],
  N: [88, "M0 0 H32 L60 50 V0 H88 V56 H31.36 L28 50 V56 H0 Z M0 64 H28 V100 H0 Z M35.84 64 H88 V100 H56 Z"],
  K: [88, "M0 0 H28 V34.56 L53.3 0 H88 L47 56 H0 Z M0 64 H61.64 L88 100 H53.3 L28 65.45 V100 H0 Z"],
  M: [110, "M0 0 H34.7 L55 27.7 L75.3 0 H110 V56 H82 V38.25 L69 56 H41 L28 38.25 V56 H0 Z M0 64 H28 V100 H0 Z M82 64 H110 V100 H82 Z"],
};
export const TITLE = ["YONSEI", "POKEMON", "LEAGUE"];
export const SLANT = Math.tan(12 * Math.PI / 180);
const GAP = 8, LEAD = 24;   // letters as in the wordmark; lines one outer bar apart (100 / φ³ ≈ 24)

/* The name on one line (under the glass YPL on the home cover): words four letter gaps apart, slanted as one.
   Returns each letter's x and the slanted ink bounds (left, right) in cap units, the line 100 tall. */
export function lineBlock(words = TITLE) {
  const glyphs = [];
  let x = 0;
  for (const word of words) { for (const ch of word) { glyphs.push({ x, y: 0, d: GLYPHS[ch][1] }); x += GLYPHS[ch][0] + GAP; } x += GAP * 4; }
  return { glyphs, left: -SLANT * 100, right: x - GAP * 5, h: 100 };
}

/* The lines stacked upright and left aligned; the one shared slant then lines their left edges up on the 12-degree axis.
   Returns each letter's place and the slanted ink bounds (left, right) and height, in cap units. */
export function titleBlock(lines = TITLE) {
  const glyphs = [];
  let y = 0, left = 0, right = 0;
  for (const word of lines) {
    let x = 0;
    for (const ch of word) { glyphs.push({ x, y, d: GLYPHS[ch][1] }); x += GLYPHS[ch][0] + GAP; }
    right = Math.max(right, x - GAP - SLANT * y);
    left = Math.min(left, -SLANT * (y + 100));
    y += 100 + LEAD;
  }
  return { glyphs, left, right, h: y - LEAD };
}
