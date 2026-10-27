# YPL Wing Y

Replaced 2026-10-12 with the mark the user supplied (`ypl-wing-y-2026-10-12-reference.webp`): two raised wings, each a long top feather and two shorter ones, meeting in a Y; a straight band cut across the neck; a fan tail of three feathers split by two slits.

- Production vector: `public/brand/ypl-wing-y.svg` (transparent, currentColor, viewBox 0 0 1315.1 870.6), refined 2026-10-27 (below).
- The same geometry is used in `SiteHeader.jsx` (`MARK_PATH`) for the header and footer, and in `public/favicon-ypl.svg`.
- Share image: `public/og-ypl-2026-10-27b.png`, rendered at 1200 x 630 from `docs/brand/og-ypl.html` (headless Chrome with `--disable-lcd-text`, so it stays achromatic). Messengers and browsers cache these, so a new picture gets a new file name.
- Preserve the proportions, the straight edges and the symmetry.

## Refinement (2026-10-27, candidate F, then H)

The user found the mark too busy and too big on the top bar, and chose F of the second round of candidates (the first round, A to C, redrawn in the wordmark's construction, lost the Braviary detail and was rejected). F is the 2026-10-12 drawing rebuilt from its own rules: feather strata parallel to the top edge (0,0)-(455,118), every stratum's tip on one diagonal through (0,0), feather ends set off the arm's outer edge, the band, a base and three tail feathers. Changes: one feather under each wing instead of two; gaps between strata 26 to 56, each feather running into the arm's outer edge and stopping there (the outlines touch, never overlap, so the mark fills the same under nonzero and evenodd), band 23 to 44, tail cuts widened (so the slits are 1px or more at 20-24px instead of 0.3-0.9px); the whole drawing narrowed to 0.84 of its width about the axis (1.66 to 1.36 wide to 1 tall); 24px tall on the top bar instead of 28. Each side's wing and Y are one outline, the tail one outline.

Shipped F read as too thin ("멸치"): the 0.84 squeeze had thinned the diagonal arm and the stem, and the 56 gaps left more air than ink. It was replaced the same day by H, F's layout with flesh on it: stem 138 to 208 wide, wing stratum 80 to 128, feather 64 to 108, gaps 38, band 38, the V lowered to 430, the tail widened with the stem and 5% taller, the drawing narrowed only to 0.94 (1.51 wide to 1 tall). 24px tall on the top bar, 36 wide.

## Provenance

The reference raster was traced with OpenCV (contours, then a 2.5px polygon approximation): six polygons, every edge straight. Left and right were then averaged around the axis (x = 766 in the reference) so the mark is exactly symmetric; one traced vertex on the left inner wing edge, a slight bend absent on the right, was dropped. Overlaid on the reference the vector matches within about 3px at 1536px wide.

The 2026-10-07 Wing Y (curved Beziers, concept C) and `newlogo.*` remain historical in git and the lab files under `docs/redesign-glass/lab/`.
