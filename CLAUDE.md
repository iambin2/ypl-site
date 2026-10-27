# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server (http://localhost:5173)
npm run build    # production build → dist/
npm run preview  # serve the built dist/
npm test         # full suite: node --test "tests/*.test.mjs"  (351 tests, including the design law)
npm run data:champions  # rebuild the committed src/data/champions-data.json from Showdown + PokeAPI
                        # (refresh-champions-data.yml does this weekly and opens a PR when it changed)
npm run font:slices     # re-cut SUIT Variable into unicode-range slices (needs pip install -r scripts/requirements-fonts.txt)
                        # (deploy.yml runs it before every build; the result ships but is not committed back)
```

Run one test file directly — each is a standalone `node:test` module with no runner config:

```bash
node tests/championsCore.test.mjs
```

There is no linter and no TypeScript. `.jsx`/`.mjs` only.

## Deployment

GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`.

- `vite.config.js` hardcodes `base: "/ypl-site/"` — it must match the repository name. Renaming the repo means changing this.
- A build-only Vite plugin (`productionVersionPlugin`) emits `version.json` and injects a head script that polls it and force-reloads the page when the deployed build id changes. Anything touching `index.html` head order or `base` interacts with this.
- Env vars (`.env` locally, repo secrets in CI): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_YPL_DATA_SCHEMA` (production uses `ypl_schema_validation`).

## Architecture

React 18 + Vite SPA, no router library and no state library.

- **Routing** is `?view=` query-string only, resolved in `src/services/appRouting.js`. `src/App.jsx` is the single shell that owns view state, site data, and admin mode.
- **`src/services/`** holds all domain logic as pure ES modules — bracket lifecycle, projections, records, champions, team builder, submission. This is where the real complexity lives and what the test suite covers. Components consume it through the `src/services/index.js` barrel.
- **`src/pages/`** are view components, **`src/components/`** shared UI, **`src/admin/`** the client-side admin mode (editors, modal host, mode bar).
- **Visitor space** (board 샘플/파티 tabs, 사설 대진표 tab) lives in separate `site_data` keys through `src/services/communityStore.js`; it never touches official data or records. Team sheets (`buildTeamSheet`) feed both the board and the PNG export (`src/components/teamSheetImage.js`).
- **`src/storage.js`** is a three-tier data adapter — `window.storage` (Claude artifact) → Supabase → `localStorage` — exposed as `STORAGE_MODE`. It serves the key/value `site_data` table only, not the normalized schema.
- **`src/styles/`** is plain CSS, loaded as 8 files with `tokens.css` as the foundation (glass tokens and recipes, both themes via `<html data-theme>`, base elements, motion). Older page styles reach the glass values through alias names (`--ink`, `--fill`, `--primary` ...) defined there. Theme is a required product feature; never hardcode a color that exists as a token.
- **Shell** (`src/components/layout/`): floating top bar, phone tab bar, stage, `history.js` (history index for back direction and scroll restore). `src/components/common/Modal.jsx` is the one sheet/dialog; pages portal into `.ypl`.

### Data source boundary (read `docs/ARCHITECTURE.md` before touching data code)

Two sources coexist and must not be mixed:

- **Normalized schema** (`ypl_schema_validation`) is canonical for every active Event-linked runtime: Season → Event → Registration → Submission → TeamSnapshot, Entry/EntryParticipant, BracketRuntime → Match → Result/RankingAward. Active runtime must have **zero** legacy dependency.
- **Legacy `public.site_data` / `ypl_data_v4.brackets`** is read-only historical compatibility for pre-normalized, Event-unlinked completed brackets. Never write a new bracket there and never use it as a fallback for an active runtime.

Invariants that are easy to violate and expensive to fix — `docs/ARCHITECTURE.md` is the authority on all of them:

- Bracket graph, BYE, advancement edges, and future matches are **pure projection**, not persisted. Only formed matches and winner facts are stored.
- Official parties are an **immutable revision chain**; resubmission creates a new Submission/Snapshot, never an update.
- `Result` (placement) and `RankingAward` (points ledger) are different facts. Champions Qualifier and Final produce no RankingAward.
- Champions Qualifier X and Final Y share Player identity only — never copy submissions or `final_submission_id` between them.
- Malformed ownership, slot sets, or match topology must **fail closed**, not fall back to legacy.
- Announcement deletion is a read-only preflight that blocks on any downstream fact; it never deletes-then-restores.

Client-side checks are UX guards only. The RPC/DB layer is the integrity boundary.

## Product and design constraints

`PRODUCT.md` and `DESIGN.md` are binding, not background reading, and a frontend change must not alter data behavior.

The visual system is **YPL Glass** (rebuilt 2026-10-07 to 2026-10-11). Its authority is `docs/redesign-glass/DECISIONS.md`; the reference build is `docs/redesign-glass/lab/glass-lab.html`; `DESIGN.md` is the portable summary recorded from the shipped site and must be kept in step. Earlier design systems (silver, WDL, the `docs/design-system/` rulebook) were removed and live only in git history.

- Achromatic only (graphite, white, grey). No brand hue, no metallic gradient, no status hue; state reads through weight, brightness and inversion.
- Glass is for whatever floats (bars, sheets, menus, toasts); reading surfaces are opaque. At most four real blurs on one screen.
- One text face, SUIT Variable, served as unicode-range slices (`scripts/build-suit-slices.py` writes `public/fonts/suit/`, the tokens.css block and the index.html preload; the deploy reruns it, so production always has new copy in slice 0, and committing a local rerun only keeps dev in step); big figures use YPL Figures (`public/fonts/ypl-figures.woff2`, built by `scripts/build-figures.py`). The Wing Y logo (`public/brand/ypl-wing-y.svg`) and the drawn wordmark (`public/brand/ypl-wordmark.svg`) are used as they are, never redrawn.
- Motion is CSS plus Web Animations, zero dependencies (`src/components/common/motion.js`). Page and theme transitions animate live copies; never View Transitions snapshots.
- Korean copy uses plain prose with **no middle-dot (·) separators**.
- `tests/designLaw.test.mjs` enforces the measurable rules on all CSS and inline styles. When it fails, fix the value; add to its `EXCEPT` only with a real reason from DESIGN.md, never to silence it.
- Phone-first: the venue phone is the primary screen; dark first, light equal.
