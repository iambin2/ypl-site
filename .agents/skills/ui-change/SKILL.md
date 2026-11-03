---
name: ui-change
description: Pre- and post-flight for any visual or presentation change in the YPL site — styling, layout, copy, motion, page or component edits. Enforces the repo's binding rule that a visual change must never alter data behavior. Use when editing anything under src/styles, src/pages, src/components, src/admin, or any JSX that affects what the site looks like. Triggers "redesign", "레이아웃", "스타일", "디자인 수정", "UI 바꿔", "motion", "애니메이션", "폰트", "간격".
---

# YPL visual change procedure

`PRODUCT.md` principle 4 is the hard rule: **operators must never lose a working function to a visual change.** This repo has regression tests named after times that rule was broken (`recordsPresentationRegression`, `championsUxRegression`, `teamBuilderCanonicalIdentityAudit`). Follow the procedure.

## Before editing

1. Read `DESIGN.md`: its Philosophy chapter, then the section for what you are changing. It is the YPL Scoreboard law, with every value and the reason for it.
2. Build from the shared parts in `src/components/common/Board.jsx` and `src/styles/board.css`, and take every value from `src/styles/tokens.css`. Both themes live there under `<html data-theme>`; a hardcoded color breaks one theme silently. If a new value or pattern seems needed, propose a change to `DESIGN.md` first.
3. Confirm the change is presentation-only. If it touches anything in `src/services/`, it is a data change — stop and read `docs/ARCHITECTURE.md` first.

## Standing constraints

These come from the site owner and override generic design instincts:

- One hue, navy `#081C3D`; light is the only emphasis (lit, dim, muted, off, inverted). Amber is the one lamp, for live things, and never text. No status hue, no trophy gold.
- No radius, border, outline, shadow, gradient, glow or blur. Panels join by the 2px seam.
- Numbers the board announces are seven-segment displays, never under 32; everything read in a line is type.
- A Pokémon stands in a panel on its floor, placed by its ink; it never floats or gets a box.
- Things switch on, they do not fly: transform and opacity only, on the four verbs and their lengths in DESIGN.md "Motion". Respect `prefers-reduced-motion`.
- Korean copy in 합니다체: no exclamation marks, no em dashes, no middle-dot (·) separators.
- One visual language for public pages, admin editors and the bracket runtime. Phone-first: check the venue phone before the desktop.

## After editing

```bash
node scripts/class-coverage.mjs   # className tokens with no CSS rule
npm test                          # service tests and the design law
```

`class-coverage.mjs` also lists dynamic and composed class names. What matters is whether **your** change added new ones: a new unstyled class means a rule that never landed. A rule whose class nothing renders any more is deleted, not kept.

`npm test` must stay green. `tests/designLaw.test.mjs` fails on a value outside the law: fix the value, never widen its `EXCEPT` to silence it. A failure in a service test after a styling-only edit means the edit was not styling-only.

Then verify in the browser rather than asking the user to check: `npm run dev`, load the page, and confirm both themes at 390 and 1440. Measure distances on rendered ink (DESIGN.md "The eye"), not in the CSS.
