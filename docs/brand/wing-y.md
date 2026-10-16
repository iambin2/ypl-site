# YPL Wing Y

Replaced 2026-10-12 with the mark the user supplied (`ypl-wing-y-2026-10-12-reference.webp`): two raised wings, each a long top feather and two shorter ones, meeting in a Y; a straight band cut across the neck; a fan tail of three feathers split by two slits.

- Production vector: `public/brand/ypl-wing-y.svg` (transparent, currentColor, viewBox 0 0 1399 841.5).
- The same geometry is used in `SiteHeader.jsx` (`MARK_PATH`) for the header and footer, and in `public/favicon-ypl.svg`.
- Share image: `public/og-ypl-2026-10-12.png`, rendered at 1200 x 630 from `docs/brand/og-ypl.html` (headless Chrome with `--disable-lcd-text`, so it stays achromatic). Messengers and browsers cache these, so a new picture gets a new file name.
- Preserve the proportions, the straight edges and the symmetry.

## Provenance

The reference raster was traced with OpenCV (contours, then a 2.5px polygon approximation): six polygons, every edge straight. Left and right were then averaged around the axis (x = 766 in the reference) so the mark is exactly symmetric; one traced vertex on the left inner wing edge, a slight bend absent on the right, was dropped. Overlaid on the reference the vector matches within about 3px at 1536px wide.

The 2026-10-07 Wing Y (curved Beziers, concept C) and `newlogo.*` remain historical in git and the lab files under `docs/redesign-glass/lab/`.
