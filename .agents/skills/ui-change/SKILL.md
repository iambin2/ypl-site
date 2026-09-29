---
name: ui-change
description: Pre- and post-flight for any visual or presentation change in the YPL site — styling, layout, copy, motion, page or component edits. Enforces the repo's binding rule that a visual change must never alter data behavior. Use when editing anything under src/styles, src/pages, src/components, src/admin, or any JSX that affects what the site looks like. Triggers "redesign", "레이아웃", "스타일", "디자인 수정", "UI 바꿔", "motion", "애니메이션", "폰트", "간격".
---

# YPL visual change procedure

`PRODUCT.md` principle 4 is the hard rule: **operators must never lose a working function to a visual change.** This repo has regression tests named after times that rule was broken (`recordsPresentationRegression`, `championsUxRegression`, `teamBuilderCanonicalIdentityAudit`). Follow the procedure.

## Before editing

1. Read the relevant section of `DESIGN.md` — it is a real design system with named rules, not a mood board. Colors, typography, elevation, and per-component specs are all specified.
2. Check `src/styles/tokens.css` for an existing token before writing any literal color, radius, shadow, duration, or easing. Both themes live there under `<html data-theme>`; a hardcoded color breaks dark mode silently.
3. Confirm the change is presentation-only. If it touches anything in `src/services/`, it is a data change — stop and read `docs/ARCHITECTURE.md` first.

## Standing constraints

These come from the site owner and override generic design instincts:

- Neutral only — black, white, grey. No brand hue, no trophy gold. Status colors only where they carry meaning.
- No accent stripes, no decorative outlines, no middle-dot (·) separators in Korean copy.
- Consistency across public pages, admin editors, and bracket runtime — one visual language, three surfaces.
- Motion is Apple-grade: precise, short, purposeful. Respect `prefers-reduced-motion`.
- Phone-first. Check the venue-phone case before the desktop case.
- Category standard played straight. No novelty concept worlds — that direction was already rejected.

## After editing

```bash
node scripts/class-coverage.mjs   # className tokens with no CSS rule
npm test                          # 249 service-layer regression tests
```

`class-coverage.mjs` reports a baseline of ~43 unmatched tokens (dynamic and composed class names). What matters is whether **your** change added new ones — a new unstyled class means a rule that never landed.

`npm test` must stay green. These tests cover services, not the DOM, so a failure after a styling-only edit means the edit was not styling-only.

Then verify in the browser rather than asking the user to check: `npm run dev`, load the page, and confirm both themes and a mobile viewport.
