# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server (http://localhost:5173)
npm run build    # production build → dist/
npm run preview  # serve the built dist/
npm test         # full suite: node --test "tests/*.test.mjs"  (249 tests)
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
- **`src/storage.js`** is a three-tier data adapter — `window.storage` (Claude artifact) → Supabase → `localStorage` — exposed as `STORAGE_MODE`. It serves the key/value `site_data` table only, not the normalized schema.
- **`src/styles/`** is plain CSS, loaded as 8 files with `tokens.css` as the foundation (design tokens, both themes via `<html data-theme>`, base elements, motion). Theme is a required product feature; never hardcode a color that exists as a token.

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

- Neutral-only palette (black / white / grey). No brand hue, no trophy gold; status colors only where they carry meaning.
- The Braviary logo (`docs/brand/newlogo.png`) is used as an exact potrace vector — never redrawn.
- Korean copy uses plain prose with **no middle-dot (·) separators**.
- Phone-first: the venue phone is the primary screen.
- Direction is the category standard (professional league site) played straight at an Apple/Nike craft bar — no novelty concept worlds.

## Note

`README.md` is a stale onboarding doc: it describes Netlify deployment (the project moved to GitHub Pages) and an `App.jsx` monolith (the code was split into `pages/`, `services/`, `components/`, `styles/`). Trust `docs/ARCHITECTURE.md`, `PRODUCT.md`, and `DESIGN.md` over it.
