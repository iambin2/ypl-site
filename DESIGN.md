---
name: YPL — Yonsei Pokémon League (Navy)
description: "A sealed official record book: white paper, black type set large and bold, navy for the surfaces, champions alone held in a case. One signature, a 12 degree slant. Everything that moves moves on the compositor; light first, dark equal."
source: "tokens live in src/styles/tokens.css; tests/designLaw.test.mjs enforces this file; decisions in docs/redesign-glass/DECISIONS.md (24th round on)"
scale:
  base: 4
  space: [4, 8, 12, 20, 32, 52, 84, 136]
  type: [13, 16, 20, 24, 32, 48, 72, 96]
  weights: [400, 600, 700]
  radius: { sm: 12, lg: 24, pill: full }
  breakpoints: [640, 860, 1100]
  content: { full: 1200, read: 40em, sheet: 560 }
  z: { base: 0, raised: 1, sticky: 10, header: 20, overlay: 30, modal: 40, popover: 50, toast: 60, tooltip: 70, skip: 80, veil: 90 }
  motion: { press: 100, tone: 160, leave: 260, place: 420, lift: 680, seal: 1100, wait: 1780 }
---

# YPL Navy

**봉인된 공식 기록부: 흰 종이에 검은 글자로 사실을 굵게 적고, 네이비 면과 케이스로 챔피언을 세운다.**

The signature is two things that belong together. The case: every record stands sealed in one card, a grey frame holding a white label and a navy window. And the 12 degree slant of the wordmark: the band across a case, the loader and the letters all lean the same way. Controls stay pills. Nothing else decorates.

## Principles

| Principle | Why | So we do not |
|---|---|---|
| Facts replace decoration | Records are why the site exists | Add illustrations, empty badges or typed numbers; every figure is read from data |
| Hierarchy is size and weight | There is one colour | Colour text to stress it |
| One solid tone divides surfaces | The user chose PSA-style solid colour | Stack border, shadow and tone; use gradients |
| Motion is a response or an event | Springs are the identity, habit is what reads as AI | Rise every section on scroll or lift every card on hover |
| The venue phone is the measure | It is the main scene | Hide function behind hover, or go under 44px to touch |

Every movement on the site is one of the verbs in the Motion chapter. Nothing else moves.

Tokens and recipes live in `src/styles/tokens.css`; motion helpers in `src/components/common/motion.js`.
`tests/designLaw.test.mjs` enforces the measurable part of this file (color literals and hue, the space, type and radius scales, alignment, blur, easing, middle dots, View Transitions) and the material law (no blur, no shadow in a transition, keyframes move transform and opacity only) on every CSS declaration, inline style and script animation. A deliberate exception is listed there under its reason.
Decision codes in brackets (C7, K3 ...) point to `docs/redesign-glass/DECISIONS.md`, which wins any disagreement with this file.

## Identity

Fluid, light, playful in the hand, serious on the page (seven parts serious to three parts play). People should be impressed simply by operating it: the press response first, then page transitions, then the first entrance (A1–A3). Never a generic AI landing page, never a game launcher, never a club homepage (A5). Since 2026-11-01 the plain confidence of psacard.com is the bar: a sentence, an object, a colour.

## Five rules (10th round)

Every screen is checked against these five and nothing else; the sections below are their detail.

1. Space follows the golden law: 4 label and value, 8 inside an element, 12 the frame of a case and a set of small things, 20 inside a card and a control to the content it drives, 32 a title to its content and cards on desktop, 52 (84 desktop) between sections.
2. A list row has one shape: the title first (label), one grey line under it (caption), a trailing value on the right. Nothing small sits above a title.
3. Buttons are words. An icon only says what the words cannot: leaving the site (↗), creating (+), the next step in a flow (→).
4. Scoreboard numbers (days left, ranks, points, generations, counts) stand large, 700 at 32px and up with tabular digits and a small unit beside them (30점, 8팀, 6대); the wordmark's digits (YPL Figures) belong to the brand.
5. Bars and content keep the same distance top and bottom, plus the safe area.

## Color

Two layers in `tokens.css`: primitives (`--navy-*`, `--gray-*`, `--white`, `--black`) and semantic tokens. Components read semantic tokens only; `designLaw` fails a component that reads a primitive.

- One colour: navy `#081C3D`, a darkened Yonsei blue. It is for surfaces, not text: the bar, the footer, the arena, the slab windows and the primary button are large navy fields on purpose. Text is black `#111111` (user, 2026-11-02): it reads cleaner, and a soft black is kinder than `#000` on a white page.
- The greys carry the navy's hue (oklch 260) at chroma .004 to .02, so nothing is a framework grey.
- The page is pure white. It is what gives the PSA impression; pure `#000` is never used.
- Solid fills only (user, 2026-11-01): no gradient, sheen, soft light or metallic effect. Colour never comes from opacity. Two exceptions: the overlay behind a sheet, and disabled. `--opacity-muted` and `--opacity-ghost` serve text on inverted fills and drawn pictures.
- Status has no hue. `--success-*`, `--warning-*`, `--danger-*`, `--info-*` exist so a status has one name, and resolve to the same tones; it reads through words, icons and weight, never colour alone.
- First, second and third place differ by tone (`--rank-1..3`). Pokémon type colours stay: they are content, not chrome.
- Light is the default; a stored choice lives in `ypl-theme-2`. Dark is equal, redefined token by token. The address bar is navy in both.

Contrast, computed from the tokens (AA is 4.5):

| Text | On | Light | Dark |
|---|---|---|---|
| text-primary | bg | 18.9 | 16.9 |
| text-primary | surface | 17.6 | 14.6 |
| text-primary | surface-raised | 14.9 | 12.9 |
| text-secondary | bg | 8.5 | 11.0 |
| text-secondary | surface | 7.9 | 9.5 |
| text-tertiary | bg | 6.0 | 7.3 |
| text-tertiary | surface | 5.6 | 6.3 |
| text-tertiary | surface-raised | 4.7 | 5.6 |
| text-tertiary | surface-sunken | 5.2 | 6.9 |
| text-on-accent | accent | 16.9 | 18.9 |
| on-bar-2 | bar | 9.0 | 9.0 |
| on-bar-2 | tabs | 9.0 | 6.9 |

## Stage and surfaces (24th round, replaces D1–D4)

**Whatever moves moves by transform and opacity, on a picture that is already drawn. Nothing blurs anything, and no shadow, filter, clip or mask changes while something moves** (23rd round, still the law).

- **Stage:** one solid colour, painted on the page itself. Nothing fixed or composited lies behind the page.
- **Bars:** both bars are the frame of the page and stand still. The top bar runs the full width, 60 tall on a phone and 72 from 860, its content on the page's width; the links keep 12 inside and 4 between them, 32 clear of the logo, so nothing in it touches. The phone's tab bar runs the full width against the bottom edge, its five cells over the safe area. Both are one solid tone, `--tabs`: navy on the white page, one step up from the navy page in dark, so they never need a line, a shadow or a blur to divide them from what scrolls under them. The selection in them is the same pill as everywhere else, a white lens.
- **Footer:** one navy block in both themes.
- **The case (`Case.jsx`):** the site's card and its core form, see Components. Records, parties, Pokémon, champions, titles and rankings all stand in it.
- **Cards (`.card`, `--surface`):** one solid tone, no shadow, no outline, for what is not a record: forms, notices, reading.
- **Sheet plate (`.plate-l3`):** sheets, dialogs, popovers, toasts: one solid tone and one deep still shadow, because they can land on a surface of their own tone.
- **Soft:** one solid tone for secondary buttons, chips and form choices.
- **Groove (`.groove`):** a track in one solid tone: segmented tracks, fields. The selection lens sits in it.
- The party sits in a display case (`--pod`). Sprites are transparent PNGs.

## Type

Freesentation for Korean (static, cut into core and rest slices), Albert Sans for Latin and digits, the closest open pair to PSA's Area Normal. The body scale is 16 by 1.2 on the 4px grid, taking every second step above 24, because a table-heavy phone cannot afford wider steps.

| Style | Size | Leading | Tracking | Weight | For |
|---|---|---|---|---|---|
| caption | 13 | 1.5 | .01em | 400, 600 | dates, grey lines, tab labels, units |
| body | 16 | 1.65 | .01em | 400 | reading, explanations |
| label | 16 | 1.35 | .01em | 600 | row titles, buttons, the menu, fields |
| lead | 20 | 1.45 | -.01em | 600 | small headings |
| h3 | 24 | 1.35 | -.015em | 700 | card and sheet titles |
| h2 | 32 | 1.25 | -.02em | 700 | section titles, small figures |
| h1 | 48 | 1.25 | -.02em | 700 | page titles, figures |
| display | 72 | 1.25 | -.025em | 700 | large figures, the home's numbers |
| hero | 96 | 1.25 | -.025em | 700 | the home's first line, a champion's name |

Sizes are tokens, never numbers. A fluid size is a `clamp()` whose ends are steps of this scale (`--title`, `--display`, `--hero`). What matters stands bold: 700 for titles, names and figures. Scoreboard figures use tabular digits on `--fig-s`, `--fig-m`, `--fig-l`; a number inside a sentence keeps its natural width (`Roll natural`). Reading text is capped at 40em, about 40 Hangul, and paragraphs use `text-wrap: pretty`; headlines balance. YPL Figures belongs to the brand. No small uppercase label sits above a title. The wordmark is drawn, never typeset; on the top bar it is 18px tall beside a 28px Wing Y, 12px apart. Korean copy uses plain prose, no middle dots. Page titles are the plain name. A notice or post body reads the few pieces of Markdown admins paste: a block opening with `#` is a headline over its text, `**bold**` is 600, `[text](url)` and bare addresses are underlined links. Hangul outside Freesentation's 2,780 syllables falls back to the system face.

## Logo (F1–F3)

Wing Y (`public/brand/ypl-wing-y.svg`, the 2026-10-12 mark refined on 2026-10-27, candidate H): two raised wings, each a broad top feather over one shorter feather, meeting in a Y on a thick stem; a straight band across the neck and a wide three-feather fan tail, all straight edges, exactly symmetric, 1.51 wide to 1 tall. It keeps the 2026-10-12 drawing's rules (feather strata parallel to the top edge, every feather tip on one diagonal, the fan tail) with heavier strokes and slits just wide enough to show at 24px; the outlines touch but never overlap, so it fills the same under nonzero and evenodd. 28px tall (42 wide) beside the wordmark on the top bar. Solid, in the colour it stands on. It never animates: the top bar is a fixed landmark. The wordmark is the solid slanted YPL (candidate B, 2026-11-01): the band that used to cut the letters closed up at 14px, so the letters are one piece, 12 degrees slanted.

## Space and radius

**The golden law (2026-11-02).** Crowding is what made the site feel closed in, and the cure is one ratio applied everywhere: every step of space is about 1.618 times the one before it. Space is 4px times a Fibonacci number, so it stays on the grid, and a token is named for its number: `--s1` 4, `--s2` 8, `--s3` 12, `--s5` 20, `--s8` 32, `--s13` 52, `--s21` 84, `--s34` 136. There is no other space. `tests/designLaw.test.mjs` fails anything off this scale and fails the scale itself if it stops stepping by 1.618.

| Space | For |
|---|---|
| 4 | a label and its value, a title and its grey line |
| 8 | inside an element, the faces of a case |
| 12 | the frame of a case, a set of small things (chips, buttons) |
| 20 | inside a card, a control to the content it drives, cards on a phone, the phone's gutter |
| 32 | a title to its content, cards on desktop |
| 52 | between sections on a phone, the desktop gutter, a page's top under the bar on desktop |
| 84 | between sections on desktop, between chapters on a phone |
| 136 | between chapters on desktop |

Four rules decide which step to take:

1. **Outside beats inside by one step.** The gap around a group is at least one step larger than the gap inside it. If two gaps look alike, the grouping cannot be read.
2. **A container's padding is never smaller than the gap between its children.**
3. **A split is 1.618 to 1.** Two columns of different weight divide the width in the golden ratio (the hall's cover, the home's notices and routes). Equal things stay equal.
4. **A picture keeps its air.** A sprite never touches its window or its neighbour: a window pads 20, a party has 12 between its six, and a single sprite on a sheet takes 61.8% of the width. A single-picture case is itself a golden card, 1 wide to 1.618 tall.

Tokens that change with the screen: `--gutter` 20 to 52, `--section` 52 to 84, `--chapter` 84 to 136, `--grid-gap` 20 to 32. Reading is capped at 40em, a sheet at 560, content at 1200.

Radius comes from the case: **outer 24 = inner 12 + padding 12**. 24 for cards, cases, sheets and popovers; 12 for inner surfaces, tiles, textareas and rows; pill for buttons, one-line fields, chips, tabs and the selection lens; 0 for what runs the full width. A list surface is 24 with padding 12 over rows of 12. The one exception is a bracket's match card, 16 around slots of 12.

Depth: 0 for everything on the page, separated by tone; 1 for popovers and plates; 2 for sheets. One light from above, in a navy shadow.

## Alignment (2026-10-16)

One edge: text starts on the content's left edge. Two exceptions, and only these:

- **Right:** a value at the end of a row and a number column (points, counts, a trailing date or status), so digits line up.
- **Centre:** (a) a label inside its control: buttons, chips, tabs, segments, the pager, number fields; (b) a short mark in a narrow fixed cell: rank, seed, game number, vs, an empty slot's number; (c) a caption under its picture: a Pokémon's name under its sprite (the champion sheet, the hall's case), the versus tiles on a phone; (d) a symmetric stage: words on the screen's axis over a symmetric picture, i.e. the home arena over the field.

Everything else is left: page and section heads, sheet and dialog titles, rows, cards, forms, articles, empty states, success states. A column header shares its column's alignment and stands on the first letter of its cells (bracket rounds over the names in the cards, team names over the dropdowns). The test: if what sits under or beside the text starts on the left, so does the text. A block may be centred on the page (the home chapters' 720px column) while its text stays left.

## Layout and navigation (G1–G7)

- Phone: full-width navy top bar (logo, theme, event action) and a navy tab bar of five against the bottom edge: 홈, 공지, 대진표, 기록, 더보기. 더보기 holds 칭호, 명예의 전당, 게시판, 팀 빌더, 계산기, 소개, Discord and admin login.
- Desktop (860px+): the same navy bar, 64 tall, with the five after the logo; 더보기 opens a popover. Wide desktop (1100px+): every page has its own link and there is no 더보기; Discord stays in the footer, and admin login is a sign-in icon button left of the theme button (hidden in admin mode, where the bottom admin bar logs out). The event action stands at the end of the bar when an event is ahead and room allows (hidden 1100-1279px). It stands on every page, the home included, so it never appears or disappears as pages change.
- **Nothing is tied to the scroll (25th round).** A bar that follows the page runs on the main thread while the page scrolls on the compositor, so it trails the finger, stops half away and has to finish on its own. So the bars do not move at all and the page scrolls between them, and a sideways picture is the browser's own scroll. No scroll listener moves anything on the site. The one bar move left is an event: a phone sheet puts the top bar away.
- Content maximum width 1200px. Admin mode shows as a floating plate dock at the bottom (O2).

## Motion (2026-11-02, replaces everything before it)

**The case is a heavy card in the hand.** Things on this site are pressed, placed, slid and lifted, and a seal is the one ceremony. That is the whole language. Time steps by the same 1.618 as space, each verb has one length and one curve, and a new element picks a verb; it never gets a motion of its own.

| Verb | When | Length | Curve | In CSS | In script |
|---|---|---|---|---|---|
| press | a finger comes down: scale .97 | 100 | ease-place | `--move-down` | CSS, on every button |
| release | the finger comes up | 420 | spring | `--move-press` | CSS |
| tone | a state changes colour or opacity on one control | 160 | ease-place | `--move-tone` | CSS |
| place | content arrives: it rises 16 into its place, or 8 inside a control | 420 | ease-place | `--move-place`, `.swap` | `place()` |
| slide | something already on screen changes place: the lens, a rank, a digit, a chevron | 420 | spring | `--move-slide` | `placePill`, FLIP |
| lift | something floats up: a sheet, a menu, a toast, a case standing | 680 | spring-lift | `--move-lift` | `stand()`, `Modal` |
| leave | anything goes: it takes the step below its entrance | 260 | ease-leave | `--move-leave` | sheets, menus |
| seal | one solid slanted band crosses a case's window behind what it holds | 1100 | ease-seal | `--move-seal` | `seal()` |
| wait | a loop that says something is under way: loader, live dot | 1780 | ease-seal | `--move-wait` | CSS |

The laws, each enforced by `tests/designLaw.test.mjs`:

1. **A CSS transition or animation reads a `--move-*` token and nothing else.** No duration, no curve, no `ease`.
2. **Pages never call `.animate()`.** They call `place`, `stand` and `seal` from `motion.js`. Only the files that need the finger or a measurement hold their own (`Modal`, `Menu`, `Dropdown`, `Toaster`, `StandTable`), and the arena, which is one event of its own.
3. **Script durations come from `DUR`.** A spring runs at its natural length: `DUR.place` with `springs().spring`, `DUR.lift` with `springs().lift`.
4. **Keyframes are a closed list.** A new one means a new row in the table above, first.
5. **Transform and opacity only, on a picture already drawn.** No shadow, filter, clip, mask or background in motion.
6. **Nothing is tied to the scroll.** A thing that follows the page runs on the main thread while the page scrolls on the compositor, so it trails the finger. The bars stand still, and a sideways picture is the browser's own scroll.

Three rules a test cannot see:

- **Press answers first.** A tap starts the lens in that frame (`leadPills`); drawing the next page waits until that frame is out (`afterPaint`).
- **A seal is an event, never a habit.** It plays when the site opens on the home, on the hall's first visit, in the arena, and for a winner. It never plays on a hover or a list.
- **Things that arrive together arrive 60 apart (rows 40), and the last has landed within 420 of the first.** Only a case lifts on hover, 8px; hover moves everything else one tone.

Where the verbs meet:

- **Page change:** the old page goes at once, the new page is placed. Back places it the other way and returns to the scroll position it left. A shared element's landing spot is measured before the page rises, so it lands once. No snapshots and no copy of the old page.
- **Sheets:** under 860 a sheet lifts from the bottom at the full width, drags down to close and leaves at the finger's speed, and the page behind recedes to .965. From 860 the same content is a centred dialog. Every sheet has the X at its top right.
- **Selection:** a liquid lens slides: the leading edge goes first, the trailing edge follows a beat later, it thins up to 10% while stretched. Two round caps and a body in one solid tone, moved by transforms only.
- **Tab switch:** every page tab slides its lens and the new view is placed with `.swap`, including tabs that remount the bar.
- **Numbers** roll digit by digit. **Ranking rows** slide to their new place (FLIP).
- **Theme change:** nothing moves. The page turns at once under one still sheet of the old stage's colour and the sheet fades, one tone.
- **Home entrance:** each time the site is opened on the home, about a second: the sentence is placed, the event and buttons follow, the cases stand from the first one along, and a seal crosses the current champion's window. On a return everything stands.
- **Arena:** the first time it scrolls in, the lines are drawn from the middle, the ball lights, one sharp ring leaves it across the floor and a band crosses the YPL. Tapping an empty spot sends the ring again.
- **Celebration:** one flat disc and a ring spread from the moment; Android gets a short buzz.
- **Loading:** one shared `Loader`, no words: the Wing Y dim where the screen will be, one solid band crossing it. It appears after a beat so a quick load never flashes. Reduced motion pulses instead of sweeping.
- **Reduced motion** keeps opacity and drops travel and growth, in one rule at the end of `tokens.css`; `place`, `stand` and `seal` do nothing.

## States

Every control follows one rule, set once in `tokens.css`: hover moves it one tone and only under `@media (hover: hover)`; active is scale .97 on every `<button>` and `.press`; `:focus-visible` is one ring (`--focus-width`, `--focus-offset`, `--focus-ring`) for controls and fields alike; disabled is `--opacity-disabled` with a not-allowed cursor; selected is inversion or the lens; loading is the button's spinner.

## Browser surfaces

What the browser draws is designed too, once, in `tokens.css`.

- Selection and accent read the brand: `--selection-bg` and `accent-color` follow `--accent`, so checkboxes and ranges need no rule of their own. The text cursor is the text colour.
- Scrollbars are thin in `--scrollbar`, the same on the page and in inner scrollers. `scrollbar-gutter: stable` holds their place, so a sheet that locks the page moves nothing. `scroll-padding-top` clears the bar. Sideways overscroll is off; pull to refresh stays, because a venue phone uses it.
- Number fields lose the browser's spin arrows and fields lose its autofill yellow; `color-scheme` sets the rest.
- Controls are not selectable text. `pointer` means clickable, `not-allowed` means disabled. Tap highlight is off because every control answers with its own press.
- Images drag as the browser's default, except sprites, which are set to stay put.
- Smooth scrolling stops under reduced motion.
- Print is the record in ink: no bars, footer, buttons or home stage, always light, links print their address.

## Responsive

- **Three breakpoints, where the content breaks, not for devices.** 640: under it a row of facts or fields stacks into one column. 860: under it the five tabs are a thumb's bottom bar and a sheet rises from the edge; from it the tabs join the top bar and a sheet is a dialog. 1100: there is room for every page's link in the bar, so 더보기 goes.
- **Fluid type** only as the `clamp()` tokens in `tokens.css`, whose ends are steps of the type scale. The arena's wordmark is a picture, so its `clamp()` is a width.
- **Space changes in one place.** `--gutter`, `--section`, `--chapter` and `--grid-gap` change at 860 and nothing else does. Inside a component, space stays the same on every screen.
- **No container queries.** A component's width follows the viewport everywhere but a sheet, and a sheet is a fixed 560 from 860 up, so a media query never lies. Add one when a component really sits at two widths on one screen.

## Dark

- Dark is its own set of token values, never an inversion, and only semantic tokens change.
- **Up is lighter.** bg `navy-950`, card and sheet `navy-900`, raised and popover `navy-800`. A sheet is lifted by the dimmed page behind it. A dropdown, menu or toast opens with nothing dimmed, so it stands a tone above the card it covers (`--surface-pop`). Shadows are still there and do nothing on navy; depth here is tone alone.
- **The accent loses its hue.** On navy the accent is white, the fullest step down in chroma, and the primary button inverts to white with black text.
- **Pictures stay as drawn.** Sprites and artwork get no brightness correction: they are content, and every plate under them is solid. The slab's white label stays white in both themes.
- **First visit is light, not the system's choice.** The user decided this in the 24th round. A chosen theme is stored in `ypl-theme-2` and set by the head script before the first paint, so it never flashes.

## Head and share surfaces

- **Icons:** the Wing Y as drawn, never simplified: at tab size its feathers are its identity, so legibility comes from size. On a tab it sits 58 wide in a 64 tile with radius 12; `favicon-*.svg` inverts to a white tile on a dark browser. `favicon-32.png` and `favicon.ico` (16 and 32) are the fallbacks. `apple-touch-icon.png`, `icon-192.png` and `icon-512.png` are full-bleed navy with the mark inside the maskable safe zone, from `docs/brand/app-icon.html`. A changed picture takes a new file name, because browsers keep icons.
- **theme-color:** navy for light and dark, because the bar it joins is navy in both.
- **Manifest:** full name Yonsei Pokémon League, short name YPL, navy, and the same description as the page.
- **Share image:** one template, `docs/brand/og-ypl.html`, 1200 x 630: solid navy, white Wing Y and wordmark, nothing else. Static hosting means crawlers read one `index.html`, so there is one image, and a page never gets its own design.
- **Description:** one line of fact, 80 characters or fewer: what YPL is and what is here. `description`, `og:description` and the manifest carry the same sentence. No claims, no invitation.
- **Language:** `<html lang="ko">`.
- **404 and 500:** `StatusPage`, standing outside the app with the bar and the page head: what happened in the site's voice, then where to go (home, 공지, 대진표, 기록). The build copies `index.html` to `404.html`, so GitHub Pages opens the app on an unknown address. 500 is what `AppBoundary` shows when the shell itself fails, with 새로고침 first.

## Loading, empty, error

- **Nothing moves when it arrives.** Each page holds the footer below the fold until its content lands; the home holds the slabs with empty cases of the same size and the numbers with their lines. Keep cumulative layout shift under .02.
- **Loading:** the one `Loader`, after 240ms so a quick load never flashes. No shimmer: the site has one solid colour and nothing to sweep. The button's own spinner covers an action.
- **Empty:** `Empty`, sentences only: what is empty, then what to do.
- **Errors, three sizes, one voice:** `FormError` for one field or one form, `ErrorNote` for a section or a whole page (what went wrong, one way to try again), a toast for something that passed. Colour never carries it alone.

## Voice and tone

Words are under the law too. Korean, plain and factual: what happens, then what to do. These rules cover the words the site itself writes, never what people write in it.

**Register.** Polite formal 합니다체, one voice everywhere.

| Where | Form | Example |
|---|---|---|
| Explanation, guidance | ~합니다 | 대진표에서 확정된 결과가 기록에 반영됩니다. |
| Asking someone to act | ~해 주세요 | 제목을 입력해 주세요. |
| Confirming an action | ~할까요? | 이 공지를 삭제할까요? |
| Something finished | ~했습니다 | 저장했습니다. |
| Errors | ~하지 못했습니다, then a request | 글을 올리지 못했습니다. 잠시 뒤 다시 시도해 주세요. |
| Buttons, links, tabs | Noun form | 저장, 대진표 보기 |
| Status labels | Short noun phrase | 임시저장됨, 데이터 연결 안 됨 |
| Field hints | 예: and a real value | 예: 37회 파이컵 |
| Legal notice | ~합니다, nothing shortened | The footer sentence |

**Labels.** One form: a noun. Sino-Korean verbs lose 하기 (저장, 신청, 등록, 수정); native verbs keep 기 (보기, 만들기, 올리기, 내려받기). Where there is an object, object first (대진표 만들기). One action has one name on every screen. Single actions are fixed words: 취소, 저장, 삭제, 닫기, 등록, 수정. No `+` before a label, no 하세요 on a button.

**Punctuation.**

- Exclamation marks: none.
- One rule: a sentence ends with a period wherever it stands, a headline, a sheet title, an empty state, an error or a toast included, and a question with a question mark. What is not a sentence (a noun label, a button, a name, a status) takes none. `tests/designLaw.test.mjs` enforces it.
- Ellipsis is the one character `…`, never `...`, and only on visible progress text (저장 중…) and a field prompt. A screen reader's label has none.
- Quotes are curly. `‘ ’` for a name on the screen or a term, `“ ”` for quoted speech. Straight quotes are never shown.
- No middle dot. A list takes commas.
- No em dash in a sentence. Split the sentence or use brackets. A lone `—` is allowed as the mark for an empty value.
- No tilde. A range takes an en dash, spaced between words (2023년 – 2025년), tight between bare digits (2024–2026).
- Arrows are not punctuation. ↑ ↓ are allowed only beside a stat, for a nature's effect.
- A Latin word sits in Korean like any word: normal spacing, particle attached (YPL의).

**Numbers, dates, time.**

| What | Rule | Example |
|---|---|---|
| Date, reading | `formatDate`, always | 11월 1일 (일); another year 2025년 11월 1일 (토) |
| Date, tight table | Digits and dots | 2026. 11. 1. |
| Date, machine | ISO, for files and `datetime` | 2026-11-01 |
| Time | 12-hour with 오전/오후, no leading zero | 오후 3:05 |
| Thousands | Comma | 1,240 |
| Large numbers | Full digits. The league's numbers are small; 만 and 억 are not used | 12,500 |
| Money | Digits then 원, no ₩ | 1,000원 |
| Number and unit | No space | 32명, 37회, 6세대, 48% |

**English.** Headings are Korean; English appears for names. Sentence case when it does. Fixed spellings: YPL, Yonsei Pokémon League, Pokémon with its accent, 파이컵 Lite. Discord is written 디스코드 in running Korean. No all-caps labels.

**Emoji.** None in the interface, in any position.

**Errors.** Two parts: what did not happen, then what to do. Say what the site could not do, so nothing sounds like the person's fault: 입력해 주세요, not 비어 있습니다. When a retry button stands beside it, the button is the second part. Never a bare noun such as 저장 실패, and 알 수 없는 오류 is not an answer.

- A visitor never sees an error code, a stack, or words such as ID, RPC, 스키마, 로컬 저장소.
- An operator may see the cause after the sentence. Integrity errors that name IDs and identity data stay as they are: they appear only when data is broken, and the exact term is the operator's lead.

**Page titles.** `페이지명 | YPL`, one separator. The home is `YPL | Yonsei Pokémon League`.

**Don't.** Claims with no fact behind them (새로운 기준, 혁신적인, 완벽한), pushing (지금 바로), invitations to a feeling (경험해 보세요), sentences about a mood rather than what happens, and 당신.

## Accessibility

- **AA at least,** in both themes; the contrast table above is computed from the tokens.
- **Keyboard:** everything works by key, in reading order, and every stop shows the one ring. Inside a menu the ring sits inset, because the list clips. Sheets lock what is behind them with `inert`. The first stop is 본문으로 건너뛰기.
- **Semantics:** one `h1` a page and no skipped level; a sheet's title starts its own outline. Buttons are `button`, links are `a`. Two clicks on non-controls are deliberate and have another way: the scrim (Esc, the close button) and the arena's wave (decoration).
- **Fields:** a control gets a visible `Field` label. Where a row of inputs shares its heading, each input carries `aria-label`. A caption over a group is `.field-label`, not `<label>`; `tests/labelLaw.test.mjs` keeps `<label>` tied to a control. An error on one field goes through `Field`, which sets `aria-describedby` and `aria-invalid`.
- **Never colour alone:** a winner reads by weight and tone, an error by its icon and words, a type chip by its name.
- **Touch:** 44 by 44 on a phone or any coarse pointer. Under a fine pointer a 40 control is fine. A 36 segment and a 40 bar link keep their size and reach 44 with an invisible `::after`.
- **Reduced motion:** nothing travels; see Motion.

## Components

- **The case (`Case.jsx`), the site's core form.** A grey frame (`--case`, padding 12, radius 24) holds a white label and one navy window, three solid faces with no line and no shadow. The label is a title, one grey line and at most one figure on the right. The window holds one thing: a sprite (`sprite`, then the case is a golden card), a party of six (`party`), or a figure or a name (`children`). Without any of these it is a label alone. It is the same object at every size and it means one thing: **this is a record**. So a champion, a Pokémon, a party, a title, a rank, a tournament's lead, a saved team and a sample all stand in it, and anything that holds a record uses it before it invents a surface. `off` empties the window for what nobody holds yet. A case with `onClick` is a button and lifts 8 on hover. A wall of cases is `.case-grid` (one to three across, `.sm` two to five). A team sheet is a case with a fourth face, the spec. What is not a record stays out: forms, notices, reading, tables, a bracket's match cards.
- Buttons: one component, `Button.jsx`. `variant` is primary (one per area), secondary, tertiary, destructive or inverse (on navy); `size` is sm 40, md 48, lg 56. Labels are words; an icon only for leaving the site, creating or the next step. `loading` keeps the width: the words clear under one spinner. `className` only places the button.
- Chips (M10): one 28px soft pill (13px, 600) for every label, tag and status; inverted only for a decided winner and an applied search filter; the dot appears only while something is live. A count is a 24px flat pill (`.fold-badge`, `.tb-count-badge`), never a pill inside a pill.
- Segmented (K3): groove track, raised lens; scrolls sideways without a bar when the labels do not fit, the groove stays put.
- Fields: `Field.jsx` keeps the label visible and linked, and sets the hint or error under the control with `aria-describedby`. One-line fields are pills, textareas round at 12, and the placeholder never replaces a label. A form-level error is `FormError`: an icon and weight, never colour alone, shown on submit.
- Dropdowns and menus (M6): desktop popover that grows from its trigger; phone sheet.
- Tables (M1, M2): no row rules, 60px rows, header labels share their column's alignment (see Alignment).
- Toasts (K6): from below (phone: just above the tab bar), stacked like Sonner, 3.8s.
- Icons (M8, M9): Phosphor Regular, Fill only for the selected tab; copied as paths into `Icon.jsx`.
- Empty states are sentences only (L3), on the left edge where the content would stand; errors are a calm sentence and a retry button (L4).
- Dates (one formatter, `src/services/dateFormat.js`): "10월 4일 (일)" this year, "2025년 10월 4일 (토)" otherwise, "2026년 8월" when only the month is known, "오후 4:00" appended for times. A missing date hides its field; never a dash.
- Public status words: 진행 중, 종료, 신청 중. Operator states (기록 반영됨, 기록 반영 전, party submission counts after the end) show only in admin mode.
- Event names are assembled, never typed (`src/services/eventName.js`, DB check `events_name_clean`): "37회 파이컵 팀전 리전 워즈".

## Pages (N1–N7)

- Home (2026-11-02): one record book. The front cover is a navy field that continues the top bar: the sentence (모든 승부가 기록이 됩니다.) on the left edge, one line across the desktop, the next event with its D-day as a figure, two buttons, then the rail of champion cases running off the screen, newest first; pressing one opens the whole entry in a sheet. The white pages hold the league's real numbers as three cases (read from the same records snapshot and hall of fame as their own pages, never typed), rolling as they come in; the three latest notices in one list surface, and four places to go as label cases beside them, split 1.618 to 1 on desktop. The arena is the back cover: the battle field of arenaField in thin lines on navy, its centre a Poké Ball, the YPL standing on it, one sentence and one button, meeting the navy footer. Things in the arena stand still and only the light moves. Reduced motion stands everything at once.
- Notices and board: list card with the same row (rule 2): the title first, a pinned or admin-only label in front of it, then one line of date and excerpt (notices) or name and time (posts); a notice or post opens on its own screen at the full content width, its body in one opaque reading card (17px phone, 18px desktop). A run of three or more short lists in the body (team sheets) lays out as tiles side by side. A post's comments sit in a second card below. The notice list's head carries one small soft button after its search, 알림 받기 or 알림 끄기, its words alone; where push cannot work it stays and explains why when pressed (on iOS outside the home-screen app, how to add the site; in an in-app browser, to open Chrome or Safari).
- Records (2026-11-02): the tab stays in the address (`?tab=`). 트레이너: a list that opens a sheet with the figures, the event history (a row with a party opens it), every party they brought as cases, and their Pokémon with pictures. 대회: filtered by a row of small buttons; any number of rounds stay open at once so they can be compared, each opening its participants as party cases, and the search also finds a Pokémon. 포켓몬: a wall of golden cases in order of use; a case opens the Pokémon's sheet with what is used most (items, abilities, natures, moves with their rate), who used which sample in which event, the trainers and the partners. Any party or sample opens as a team sheet, read from the official snapshot. It shows what was revealed with the party and nothing sooner: the same `team_revealed_at` gate. An old roster holds names only and says so. 랭킹: the current season with one control, the podium as cases (rank in the label, points in the window), then the table.
- Brackets: opaque match cards on the stage, lines lit as winners are decided and drawn once, the champion's road brightest, the champion cell inverted.
- Hall of fame (2026-11-02): every champion is the same case with the whole winning entry in its window. The page opens on the home's navy cover, the title and record button on the left and the reigning champion's case on the right, split 1 to 1.618. The past champions hang on the white page, newest first. Pressing any case opens the same sheet as the home's slabs, where the Pokémon are named. The first visit in each visit to the site plays an entrance once: the words are placed, the case stands, a seal crosses the window.
- Team builder: three steps on a phone (규정, 포켓몬 선택, 팀 구성), one screen on desktop; same state either way. The team saves as one PNG sheet in the current theme (every field of the editor) and posts straight to the board.
- Board tabs 자유, 샘플, 파티: a sample is a golden case, a party a party case; a post shows the team sheet, one case for each Pokémon, and opens in the builder. Titles are cases with the holder in the window, and an unclaimed title has an empty window. Brackets tabs 공식, 사설: a private bracket uses the official board with an inverted "사설" chip and a sentence that it never reaches records; its images say so too.
- About: an ordinary document whose sections rise once.

## Consistency (2026-10-27)

A first-visit review found the rules above broken in many small places. Each line below names what was broken and the rule that now holds; `tests/designLaw.test.mjs` checks the ones a test can see.

- **A title comes first.** No date, status chip, side label or small number above a title: an article's date, a bracket head's chip, a round's date, a timeline's year, a picker's "내 포켓몬" all sit on the grey line under the name. A big figure stands above its label (8팀, then 참가), never under it.
- **Rows have one rhythm.** A title and its grey line are 4 apart everywhere. Nothing may grow a title's line box (a tap target on an inline name gets its 44px from a box laid around the word, not from its height). A caption never stands beside a headline ("대회 이력 최근 순으로 25건"): the headline stands alone.
- **One name for one thing.** Events use the assembled name everywhere (`37회 파이컵 팀전 리전 워즈`, never `마스터 리그 37회`); a champion's generation is a number (`1대`, never `초대`, through `generationText`); a champion is described one way: "6대 챔피언, YPL 시즌 2 우승". A preview line never repeats its title. Facts already in the title are not repeated as a field (the mode when the name says 팀전).
- **Words go on the grey line, counts stand large.** What describes an event (its format, mode, date) is words: it joins the grey line under the title, as on the bracket head and the list rows, never a box of label and value rows floating beside a figure. A hero card keeps its big figure (8팀, 참가) and its button.
- **One place for a count.** A list's count stands right of its search field in the quiet 13px grey (71명, 110종, 59건). A count of zero is not shown (no "댓글 0", no "내 팀 0"); a comment count is words ("댓글 3"), not an icon.
- **Same rank for the same score.** Any ranked list (rankings, Pokémon usage) gives equal values the same rank.
- **Dates only through `formatDate`.** Including periods ("9월 9일 (수) – 12월 2일 (수)") and history ("2023년 5월", "2023년 – 2025년"). A date typed as "2026.09.09" in data is formatted before it is shown.
- **Icons only for leaving, creating, the next step** (rule 3), and navigation. No decorative icon in a heading, a chip, a list title or a result line; the Discord button is the words and ↗.
- **Inverted means decided or applied.** A winner, the current champion, an applied filter. A category label ("학기 최강전") is a plain chip; the dot means live and nothing else.
- **Same content, same shape.** Kinds of competition and kinds of league share one card of rows (name, chip, line). Empty slots are recessed tiles, never outlined boxes. Picking a Pokémon has one control per screen.
- **Reading text is capped at 40em** and paragraphs are pretty; only headlines and the caption under a picture balance their lines.
- **Words and buttons stand clear of drawn lines.** On the home arena the line, the buttons and the empty-state sentence ("다음 대회 일정은 공지에 올라옵니다.") stand on open floor, never on a field line.
- **Copy says one thing.** The footer is a fan site run by the club and says it has no relation to Nintendo, Creatures, GAME FREAK or The Pokémon Company; it no longer pairs "공식" with "비공식". Quotation marks are typographic (‘ ’).

## Space and text law (2026-10-28)

What makes the screen feel calm is that the eye never has to find a new line to read from and never meets two sizes for one job. A survey of every window, sheet, menu and control found both broken, so these six hold for all of them; `tests/designLaw.test.mjs` checks what it can see.

1. **One text edge per surface.** On a page, a card, a sheet or a menu the words start on one line, the surface's padding. Whatever draws its own box (a field, a button, a tile, a chip, a grouped list) puts the box on that line and its words inside. A row with no box at rest puts its words on the line and hangs its highlight 12 into the padding.
2. **Nearer is tighter, and a group's actions are a group.** Rule 1's distances stand; the buttons that end a sheet stand one section under its body and the sheet's own padding over its edge (32 on a phone and in a desktop dialog), at every height of sheet, and stay pinned while the body scrolls under them.
3. **Heights on one ladder.** 24 count, 28 chip, 36 a control inside a track, a field or a row (segment, clear, refresh), 40 small button and the sheet's X, 44 the touch floor and a floating menu's row, 48 button, field and dropdown, 52 a one-line choice in a sheet, 60 a list row (`--row-min`: notices, posts, trainers, pickers, tables). The touch floor only raises what is lower; it never lowers a 48 field or a 60 row.
4. **Five text roles, one look each.** A title; a row title (16, 600); its grey line (caption, `--text-tertiary`, 4 under); an explanatory sentence (body, `--text-secondary`: a page description, a sheet's hint, a note in a form, an empty list); a field label (caption, 600, `--text-secondary`).
5. **One state ladder for chosen rows.** Rest clear, hover `--state-hover`, selected `--state-selected` with a check, keyboard focus `--state-pressed`. The label stays 600 in every state, so choosing never moves the words.
6. **Icons stand on three sizes.** 16, 20 and 24, from Phosphor, in `currentColor`. An X is 20 in a sheet's 40, 16 in a chip or a field.

## Don't

- Do not reintroduce View Transitions snapshots for pages or theme; they flickered on phones.
- Do not blur anything, behind or in front: no `backdrop-filter`, no `filter: blur`, no blurred entrance.
- Do not animate a shadow, a filter, a clip, a mask or a background. Give the moving thing a still picture and move that.
- Do not copy the page for a transition.
- Do not add a gradient, a sheen, soft light, a second hue, a status hue or visible grain. The only second face is YPL Figures, and it belongs to the brand: never set a page's numbers in it.
- Do not repeat what the screen already says: one fact once, no all-zero tiles, no default status ("종료") on every row, no decorative numerals.
- Do not put an eyebrow or kicker label above a title.
- Do not change data behavior from a visual change.
