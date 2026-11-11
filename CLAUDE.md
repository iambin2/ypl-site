# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server (http://localhost:5173)
npm run build    # production build → dist/
npm run preview  # serve the built dist/
npm test         # full suite: node --test "tests/*.test.mjs"  (including the design law)
npm run data:champions  # rebuild the committed src/data/champions-data.json from Showdown + PokeAPI
                        # (refresh-champions-data.yml does this weekly and opens a PR when it changed)
npm run font:slices     # re-cut Freesentation into unicode-range slices (needs pip install -r scripts/requirements-fonts.txt)
                        # (deploy.yml runs it before every build; the result ships but is not committed back)
npm run build:battle    # bundle the engine into supabase/functions/battle before deploying that function
npm run bench:cpu -- --games 300  # measure the battle computer (docs/BATTLE_COMPUTER.md)
```

Run one test file directly — each is a standalone `node:test` module with no runner config:

```bash
node tests/championsCore.test.mjs
```

There is no linter and no TypeScript. `.jsx`/`.mjs` only, except the Edge Functions' `index.ts` (Deno).

## Deployment

GitHub Pages via `.github/workflows/deploy.yml` on every push to `main`. Work happens on `design/scoreboard` (local `main` lags behind); a deploy pushes that branch to both `origin/design/scoreboard` and `origin/main`.

- When a change spans the database, the battle function and the site, it goes out in that order: the owner runs the new `docs/db/*.sql` (the Supabase MCP here is read-only; check the result read-only afterwards), then the function, then the site. Until its SQL has run, the client hides a feature rather than failing.
- The `battle` Edge Function (rooms, official matches, 도전의 탑, the computer on the server) does not deploy with the site: `npm run build:battle`, then `npx supabase functions deploy battle --use-api --no-verify-jwt --project-ref rqffrogcverfjqzjasax`.

- The site is served at the root of the custom domain `league.pokeyonsei.com` (Cloudflare CNAME `league` → `iambin2.github.io`, DNS only; GitHub Pages custom domain set in repo settings), so `vite.config.js` has `base: "/"`. Dropping the domain means going back to `"/ypl-site/"`.
- A build-only Vite plugin (`productionVersionPlugin`) emits `version.json` and injects a head script that checks it once at page load (reloading onto a newer build) and sets `window.__YPL_BUILD__`. After that `checkBuild` in `src/components/layout/history.js` asks again on returning to the tab and every five minutes; once a newer build is out, the next in-site move (`pushHistory`) loads its address afresh, and the battle room reloads itself when that is safe. A screen file a deploy deleted makes `LazyContent` reload once. Anything touching `index.html` head order or `base` interacts with this.
- The same plugin copies `index.html` to `404.html`, so an unknown path boots the app and `src/main.jsx` shows `StatusPage`.
- The `notify-announcement` Edge Function does not deploy with the site; deploy it separately (`npx supabase functions deploy notify-announcement --use-api --project-ref rqffrogcverfjqzjasax`) with the `VAPID_KEYS` secret set in Supabase. Its public half is `VAPID_PUBLIC_KEY` in `src/services/announcementPush.js`; replacing the pair orphans every subscription.
- Env vars (`.env` locally, repo secrets in CI): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_YPL_DATA_SCHEMA` (production uses `ypl_schema_validation`).

## Architecture

React 18 + Vite SPA, no router library and no state library.

- **Routing** is `?view=` query-string only, resolved in `src/services/appRouting.js`. `src/App.jsx` is the single shell that owns view state, site data, and admin mode.
- **`src/services/`** holds all domain logic as pure ES modules — bracket lifecycle, projections, records, champions, team builder, submission. This is where the real complexity lives and what the test suite covers. Components consume it through the `src/services/index.js` barrel.
- **`src/pages/`** are view components, **`src/components/`** shared UI, **`src/admin/`** the client-side admin mode (editors, modal host, mode bar).
- **Visitor space** (board 자유/샘플/파티 tabs, 사설 대진표 tab) lives in `public.community_items` through `src/services/communityStore.js`, written only by the `community_write` RPC with server-checked pins (`docs/db/visitor_gates.sql`); it never touches official data or records. Team sheets (`buildTeamSheet`) feed both the board and the PNG export (`src/components/teamSheetImage.js`).
- **Notice alerts** are Web Push: `public/sw.js` only shows notifications (no fetch handler, no cache), `src/services/announcementPush.js` subscribes through the RPCs in `docs/db/announcement_push.sql`, and saving a new notice calls the `notify-announcement` Edge Function (`supabase/functions/`), which holds `VAPID_KEYS`. iOS only offers push inside the home-screen app, hence `public/manifest.webmanifest`.
- **`src/storage.js`** is a three-tier data adapter — `window.storage` (Claude artifact) → Supabase → `localStorage` — exposed as `STORAGE_MODE`. It serves the key/value `site_data` table only, not the normalized schema.
- **`src/styles/`** is plain CSS, 21 files imported in order by `src/main.jsx`: `tokens.css` is the foundation (the scoreboard tokens, both themes via `<html data-theme>`, base elements, panels, lamps, motion), `board.css` the shared parts, then one file per screen. Theme is a required product feature; never hardcode a color that exists as a token.
- **Shell** (`src/components/layout/`): top bar, phone tab bar, `history.js` (history index for back direction and scroll restore). The bars stand still; nothing is tied to the scroll. `src/components/common/Modal.jsx` is the one sheet/dialog; pages portal into `.ypl`.
- **Battle** (`src/pages/BattlePage.jsx`, `src/pages/battle/`): Showdown's engine (`@pkmn/sim`) in the browser and in `supabase/functions/battle`; the stage is one WebGL2 canvas (`gl.js`, `arena.js`), and 도전의 탑 is its own scene (`Streak.jsx`, `tower.js`, `towerGL.js`). 도전의 탑's rules are `docs/BATTLE_STREAK.md`; its code and data keep the old name, streak (`kind` streak, `streak_runs`).
- **Battle computer** (`src/services/battleCpu.js`, run in `src/pages/battle/cpu.worker.js`): read `docs/BATTLE_COMPUTER.md` before changing it. It is binding: every change to how the computer chooses is measured with `npm run bench:cpu -- --games 300` against the last commit, kept only by that chapter's rules, and logged in its experiment table, failures included. The weekly `learn-cpu-sets.yml` blends players' parties into `src/data/random-sets.json` through a pull request.

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

When changing or adding UI, read `DESIGN.md` first and use only its tokens and the existing components. Its "Composing a screen" chapter (and "Judging the stage", "Judging the play screen" and "Judging a game" in Battle) is the owner's eye written down: every screen is checked against it at 390 and 1440 in both themes before it is shown. If a new value or pattern seems needed, propose updating `DESIGN.md` first; never invent one in place.

`PRODUCT.md` and `DESIGN.md` are binding, not background reading, and a frontend change must not alter data behavior.

The visual system is **YPL Scoreboard**, live in production since 2026-11-03: a navy board switched off, facts lit on square panels joined by a 2px seam, real seven-segment numbers, one amber lamp for what is live. `DESIGN.md` is its only authority; its Philosophy chapter says why the site is a board (it reports and never decorates, what is happening now comes first, emphasis is light, hardware not graphics, it switches on and does not fly, one ratio decides). The built site is the reference; there are no drafts. `tests/designLaw.test.mjs` holds every file to the strict rules (only scoreboard tokens, lengths on the series). Screens are built from the shared parts in `src/components/common/Board.jsx` and `src/styles/board.css` (rows, counters, a Pokémon on its floor, fields, choices, tabs, chips, the dock, toasts); a new screen uses those, not new values. Every screen, the admin included, is on the scoreboard, except the battle screen: DESIGN.md "Battle" makes it a game, so `battle.css`, `battle-stage.css` and `src/pages/battle/` are left out of `tests/designLaw.test.mjs` and keep only the site's colours (the tokens, both themes) and taste, judged by its "Judging the stage", "Judging the play screen" and "Judging a game". The sheets, dialogs and toasts over a battle, and `streak.css` (도전의 탑's page parts), stay under every rule. Result entry's game scores and 불참 switch on once `docs/db/match_outcome.sql` is run (score columns, a trigger that clears them when a winner changes, `set_normalized_match_outcome`, and the single winner RPC accepting `forfeit`); until then the client hides them.

- One ratio, phi, sets every measure ("The golden law" in `DESIGN.md`): space is 4 times a Fibonacci number plus the 2px seam, four type sizes, segment cells 1 to phi, golden splits, time on the same ratio.
- Light is the only emphasis: lit, dim, muted, off, and inverted for the one decided, current or chosen thing. One hue, navy; words are navy in light. Amber is a lamp for live things and never text. No gradient, glow, blur, shadow or radius.
- The board announces in seven-segment displays (days left, scores, counters, never under 32, whole numbers only); everything read in a line is type.
- A Pokémon always stands in a panel with its feet on its floor, placed by its ink through `inkCentre.js`; nothing is painted under it (no floor band since 2026-11-03), it never floats and never gets a box of its own.
- Dark first, light equal: in light the words are navy, never black. Nothing blurs anything: no `backdrop-filter`, no `filter: blur`.
- Things switch on, they do not fly: what arrives rises 12 as it lights, a pointer nudges 4, a busy segment cell turns while anything loads; transform and opacity on a picture already drawn; never animate a shadow, filter, clip, mask or background, never copy the page, never View Transitions snapshots. Motion stays CSS plus Web Animations with zero dependencies (`src/components/common/motion.js`).
- One font stack: Freesentation for Korean, served as unicode-range slices (`scripts/build-font-slices.py` writes `public/fonts/freesentation/slices/`, the tokens.css block and the index.html preloads; the deploy reruns it, so production always has new copy in the core slice, and committing a local rerun only keeps dev in step), Albert Sans for Latin and digits (`public/fonts/albert-sans-latin-wght.woff2`). Both are OFL. The Wing Y logo (`public/brand/ypl-wing-y.svg`) and the drawn solid wordmark (`public/brand/ypl-wordmark.svg`) are used as they are, never redrawn.
- Korean copy follows the Voice and tone chapter of `DESIGN.md`: 합니다체, noun labels, no exclamation marks, no em dashes, **no middle-dot (·) separators**.
- `tests/designLaw.test.mjs` enforces the measurable rules on all CSS and inline styles. When it fails, fix the value; add to its `EXCEPT` only with a real reason from DESIGN.md, never to silence it.
- Phone-first: the venue phone is the primary screen.

## Working with the owner

Read from the commits' `프롬프트 (사용자 지시):` sections. Design judgement lives in `DESIGN.md`; this is how the work is done and reported.

- **Korean, always.** Every reply, progress line, wrap-up recap and button label is Korean, after long technical work and after an English button too; code and identifiers stay as they are. The game is 포켓몬 챔피언스, never 포챔스.
- **Their words for the steps.** 커밋 is a commit only. 배포, 커밋하고 배포 commit and deploy (Deployment), and 전부 배포 includes what was committed earlier but not deployed. 진행해줘, 이대로 진행 mean do all of it without asking again; 남은 것도, 작게 남은 것도 mean the small leftovers too. A reported bug with 즉시 is fixed, tested and deployed in the same turn.
- **Drafts before a new look.** A new screen or a redesign starts with 시안 the owner can see (screenshots, a contact sheet), options lettered with a recommendation; they answer with a letter ("b로 진행"). Small fixes go straight in.
- **Scoring.** Asked to score out of 100 ("객관적인 관점에서"), judge as an expert seeing it for the first time, with no memory of earlier rounds, across the whole system (the transitions, the way in, a whole run), and list the deductions with their points. "100점이 되도록" then means rebuilding what the deductions name, not polishing around them.
- **Use it before calling it done.** Play the battle, run 도전의 탑 through a trade and a loss, submit the form. When real play is slow, build a test environment instead (PGlite with the real SQL, a harness that always wins, fake-admin routes with writes blocked) rather than waiting ("테스트 환경을 따로 만들어서 하면 더 빠르지 않을까?"). Judge motion and stutter by recorded frames and layout by measured ink, never by a still or by reading CSS. The owner asks "완벽하게 개선했다고 확신할 수 있어?"; answer with what was measured and what was not.
- **Fix the family.** A reported fault is fixed everywhere its kind appears, in both themes, and in both 일반 배틀 and 도전의 탑 when they share the part (DESIGN.md "Composing a screen" 11).
- **Originals are looked at, not remembered.** Anything meant to match 포켓몬 챔피언스 (a move, a field, a sound, a battle message) is compared with real footage or recordings found by search; sound is measured as spectrograms and numbers. A download asks first with its name, source and size and stays in the scratchpad. Words only Showdown prints never reach a player.
- **Speed and cleanup change nothing visible.** Optimisation and refactoring keep every function and every scene exactly as it was ("지금의 기능과 연출은 100% 똑같이 작동해야"). A build warning is read as a failure, and code, styles and screenshots a change leaves unused go with it.

## Commit messages

Every commit message carries four sections, each a line-start heading with at least one line under it, written in Korean like the rest of the record:

- `문제 인식:` what was wrong or missing, as seen before the change.
- `사고 과정:` how it was diagnosed and why this way over the others (measurements, what was tried and dropped).
- `기획 방향성:` where the change points the product, the rule it sets for later work.
- `프롬프트 (사용자 지시):` the user's own words that asked for it, quoted, across the turns that led to the commit.

Results, what is left, and notes may follow as more sections. `.githooks/commit-msg` runs `scripts/check-commit-msg.mjs` and refuses a message without them (`npm install` sets `core.hooksPath`; run `git config core.hooksPath .githooks` in a checkout made before that). `tests/commitMessage.test.mjs` holds every non-merge commit since `9f28607` to the same law, workflow bot commits excepted. Never pass `--no-verify` to get around it; amend the message instead.
