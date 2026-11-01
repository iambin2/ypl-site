---
name: YPL — Yonsei Pokémon League (Navy)
description: "A sealed official record book: white paper, one navy ink, facts set large and bold, champions alone held in a case. One signature, a 12 degree slant. Everything that moves moves on the compositor; light first, dark equal."
source: "tokens live in src/styles/tokens.css; tests/designLaw.test.mjs enforces this file; decisions in docs/redesign-glass/DECISIONS.md (24th round on)"
scale:
  base: 4
  space: [4, 8, 12, 16, 24, 32, 40, 56, 80, 120]
  type: [13, 16, 20, 24, 32, 48, 72, 96]
  weights: [400, 600, 700]
  radius: { sm: 12, lg: 24, pill: full }
  breakpoints: [640, 860, 1100]
  content: { full: 1200, read: 720, sheet: 560 }
  z: { base: 0, raised: 1, sticky: 10, header: 20, overlay: 30, modal: 40, popover: 50, toast: 60, tooltip: 70, skip: 80, veil: 90 }
  motion: { step: 60, instant: 90, fast: 180, base: 260, slow: 480, snappy: 400, soft: 670, sweep: 900, loop: 1600 }
---

# YPL Navy

**봉인된 공식 기록부: 흰 종이에 네이비 잉크 한 색으로 사실을 굵게 적고, 챔피언만 케이스에 담아 세운다.**

The signature is one thing, the 12 degree slant of the wordmark: the band across a slab, the loader and the letters all lean the same way. Nothing else decorates.

## Principles

| Principle | Why | So we do not |
|---|---|---|
| Facts replace decoration | Records are why the site exists | Add illustrations, empty badges or typed numbers; every figure is read from data |
| Hierarchy is size and weight | There is one colour | Colour text to stress it |
| One solid tone divides surfaces | The user chose PSA-style solid colour | Stack border, shadow and tone; use gradients |
| Motion is a response or an event | Springs are the identity, habit is what reads as AI | Rise every section on scroll or lift every card on hover |
| The venue phone is the measure | It is the main scene | Hide function behind hover, or go under 44px to touch |

Motion allowed: the press, the selection lens, sheets, page changes, the home entrance, the slab belt, rolling numbers, the arena. Nothing else moves.

Tokens and recipes live in `src/styles/tokens.css`; motion helpers in `src/components/common/motion.js`.
`tests/designLaw.test.mjs` enforces the measurable part of this file (color literals and hue, the space, type and radius scales, alignment, blur, easing, middle dots, View Transitions) and the material law (no blur, no shadow in a transition, keyframes move transform and opacity only) on every CSS declaration, inline style and script animation. A deliberate exception is listed there under its reason.
Decision codes in brackets (C7, K3 ...) point to `docs/redesign-glass/DECISIONS.md`, which wins any disagreement with this file.

## Identity

Fluid, light, playful in the hand, serious on the page (seven parts serious to three parts play). People should be impressed simply by operating it: the press response first, then page transitions, then the first entrance (A1–A3). Never a generic AI landing page, never a game launcher, never a club homepage (A5). Since 2026-11-01 the plain confidence of psacard.com is the bar: a sentence, an object, a colour.

## Five rules (10th round)

Every screen is checked against these five and nothing else; the sections below are their detail.

1. Space shrinks with nearness: 4 label and value, 8 inside an element, 12 (16 desktop) one set of cards, 16 a control to the content it drives, 24 page title to content, 40 (56 desktop) between sections.
2. A list row has one shape: the title first (label), one grey line under it (caption), a trailing value on the right. Nothing small sits above a title.
3. Buttons are words. An icon only says what the words cannot: leaving the site (↗), creating (+), the next step in a flow (→).
4. Scoreboard numbers (days left, ranks, points, generations, counts) stand large, 700 at 32px and up with tabular digits and a small unit beside them (30점, 8팀, 6대); the wordmark's digits (YPL Figures) belong to the brand.
5. Bars and content keep the same distance top and bottom, plus the safe area.

## Color

Two layers in `tokens.css`: primitives (`--navy-*`, `--gray-*`, `--white`) and semantic tokens. Components read semantic tokens only; `designLaw` fails a component that reads a primitive.

- One colour: navy `#081C3D`, a darkened Yonsei blue. It is a brand surface, not an accent: the bar, the footer, the arena and the slab windows are large navy fields on purpose. Text is navy too, not black: black beside the navy bar read as two darks that nearly match.
- The greys carry the navy's hue (oklch 260) at chroma .004 to .02, so nothing is a framework grey.
- The page is pure white. It is what gives the PSA impression; pure black is never used.
- Solid fills only (user, 2026-11-01): no gradient, sheen, soft light or metallic effect. Colour never comes from opacity. Two exceptions: the overlay behind a sheet, and disabled. `--opacity-muted` and `--opacity-ghost` serve text on inverted fills and drawn pictures.
- Status has no hue. `--success-*`, `--warning-*`, `--danger-*`, `--info-*` exist so a status has one name, and resolve to the same tones; it reads through words, icons and weight, never colour alone.
- First, second and third place differ by tone (`--rank-1..3`). Pokémon type colours stay: they are content, not chrome.
- Light is the default; a stored choice lives in `ypl-theme-2`. Dark is equal, redefined token by token. The address bar is navy in both.

Contrast, computed from the tokens (AA is 4.5):

| Text | On | Light | Dark |
|---|---|---|---|
| text-primary | bg | 16.9 | 16.9 |
| text-primary | surface | 15.7 | 14.6 |
| text-primary | surface-raised | 13.4 | 12.9 |
| text-secondary | bg | 8.5 | 11.0 |
| text-secondary | surface | 7.9 | 9.5 |
| text-tertiary | bg | 6.0 | 7.3 |
| text-tertiary | surface | 5.6 | 6.3 |
| text-tertiary | surface-raised | 4.7 | 5.6 |
| text-tertiary | surface-sunken | 5.2 | 6.9 |
| text-on-accent | accent | 16.9 | 16.9 |
| on-bar-2 | bar | 9.0 | 9.0 |
| on-bar-2 | tabs | 9.0 | 6.9 |

## Stage and surfaces (24th round, replaces D1–D4)

**Whatever moves moves by transform and opacity, on a picture that is already drawn. Nothing blurs anything, and no shadow, filter, clip or mask changes while something moves** (23rd round, still the law).

- **Stage:** one solid colour, painted on the page itself. Nothing fixed or composited lies behind the page.
- **Bars:** the top bar runs the full width in navy, its content on the page's width; the phone's tab bar is a navy pill with a white lens, on one solid band of the page's colour (`.edge-b`) that the footer and the arena cover.
- **Footer:** one navy block in both themes.
- **Cards (`.card`, `--surface`):** one solid tone, no shadow, no outline.
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

Base unit 4px. Nearer means smaller: 4 a label and its value, 8 inside an element, 12 items of one set, 16 a control to the content it drives, 24 card padding and a page title to its content, 40 (56 desktop) between sections, 80 (120 desktop) between chapters. Gutters 16 phone, 32 desktop. The grid is 4 columns with a gap of 24 on desktop, 2 with a gap of 16 on a phone. Content is 1200 wide, reading 720, a sheet 560.

Radius comes from the slab: **outer 24 = inner 12 + padding 12**. 24 for cards, slabs, sheets and popovers; 12 for inner surfaces, tiles, textareas and rows; pill for buttons, one-line fields, chips and tabs; 0 for what runs the full width. A list surface is 24 with padding 12 over rows of 12. The one exception is a bracket's match card, 16 around slots of 12.

Depth: 0 for everything on the page, separated by tone; 1 for popovers and plates; 2 for sheets. One light from above, in a navy shadow.

## Alignment (2026-10-16)

One edge: text starts on the content's left edge. Two exceptions, and only these:

- **Right:** a value at the end of a row and a number column (points, counts, a trailing date or status), so digits line up.
- **Centre:** (a) a label inside its control: buttons, chips, tabs, segments, the pager, number fields; (b) a short mark in a narrow fixed cell: rank, seed, game number, vs, an empty slot's number; (c) a caption under its picture: a Pokémon's name under its sprite, the versus tiles on a phone; (d) a symmetric stage: words on the screen's axis over a symmetric picture, i.e. the home arena over the field and the hall of fame stage (and its sheet) over the party.

Everything else is left: page and section heads, sheet and dialog titles, rows, cards, forms, articles, empty states, success states. A column header shares its column's alignment and stands on the first letter of its cells (bracket rounds over the names in the cards, team names over the dropdowns). The test: if what sits under or beside the text starts on the left, so does the text. A block may be centred on the page (the home chapters' 720px column) while its text stays left.

## Layout and navigation (G1–G7)

- Phone: full-width navy top bar (logo, theme, event action) and a bottom navy tab bar of five: 홈, 공지, 대진표, 기록, 더보기. 더보기 holds 칭호, 명예의 전당, 게시판, 팀 빌더, 계산기, 소개, Discord and admin login.
- Desktop (860px+): the same navy bar with the five after the logo; 더보기 opens a popover. Wide desktop (1100px+): every page has its own link and there is no 더보기; Discord stays in the footer, and admin login is a sign-in icon button left of the theme button (hidden in admin mode, where the bottom admin bar logs out). The event action stands at the end of the bar when an event is ahead and room allows (hidden 1100-1279px).
- Bars follow the finger: they slide away as far as the page is scrolled down (80px of scroll puts them fully away, never more than the distance from the top) and come back as far as it is scrolled up; when the scroll stops they finish the move in its last direction with a spring that takes over the scroll's speed (response 0.4s, damping 0.68: about 5% past and back), run as Web Animations on the compositor and picked up where it stands if the page is scrolled again. While following they change `transform` only, with no CSS transition.
- Content maximum width 1200px. Admin mode shows as a floating plate dock at the bottom (O2).

## Motion (H1–H5, I1–I4, J1–J4, K1–K10)

- **One curve law (10th round):** content that appears decelerates on the page rise's ease-out (sections, swaps, sheet tiles, the champion cell, the success check); floating layers that present (sheets, menus, dropdowns, toasts) and things already on screen that move or react (press, the lens, shared flights, reordering rows, rolling digits, the selected tab icon) use the springs. User-caused reactions mostly under 200ms, big changes longer. Reduced motion keeps opacity and drops travel and growth, in one rule at the end of `tokens.css`.
- **Page transitions (23rd round):** no snapshots and no copy of the old page: copying it doubled the document in the one frame that already had to draw the next page. The old page goes at once and the new page rises 16px on the snappy spring. Back goes the other way and returns to the scroll position it left. A shared element's landing spot is measured before the page starts rising, so it lands once.
- **Shared elements (I2):** notice and board post title to article title; bracket card title to the board head; the tab pill never breaks between pages. Trainer, Pokémon and champion sheets do not fly the row: the row stays put and the sheet title settles 6px as it fades in (460ms, 90ms after the sheet starts).
- **Theme change (B6, 23rd round):** nothing moves. The page turns at once under one still sheet of the old stage's colour (`.veil`) and the sheet fades over 280ms, one opacity on the compositor. Fading the colour tokens themselves restyled the whole document every frame. The home's pointer sheet redraws in the new colour.
- **Press (K1):** scale .97 in 90ms, back on the snappy spring. Hover moves a control one tone (`--control-hover`, `--state-hover`). Only the slab lifts.
- **Selection (K3):** a liquid lens. The leading edge springs toward the target first, the trailing edge follows a beat later, the lens thins up to 10% while stretched and settles with under 5% overshoot. It is two round caps and a body in one solid tone, moved by transforms only, so it keeps its frames while the next page renders.
- **Tab switch (K3, 2026-10-16):** every page tab (a Segmented on the page's `tab` or `step`) slides its lens and the new view rises with `.swap`, including tabs that render a whole separate view and remount the bar (board 샘플/파티, 사설 대진표): the bar hands its lens position across the remount. `tests/designLaw.test.mjs` enforces it.
- **Numbers (K4)** roll digit by digit. **Ranking rows (K5)** slide to their new place (FLIP) and rows that rose glow briefly.
- **Sheets (K10, M5):** one rule at 860px, the width where every layout turns desktop. Under it a sheet rises from the bottom at the full width of the screen, round on top, its lower edge the screen's own; it drags down to close and leaves at the finger's speed, and the page behind recedes to .965. From 860 the same content is a centred dialog, round on all four corners. Nothing is round on top and square below in mid-air: a sheet clips what it holds, so its pinned actions never paint over a corner. Every sheet and dialog has the X at its top right, titled or not.
- **Springs keep their natural length (2026-10-27):** snappy runs 400ms (`var(--dur-snappy)`, `DUR.snappy`), soft 670ms (`var(--dur-soft)`, `DUR.soft`). A spring curve stretched to another length is another spring.
- **The press answers first (2026-10-27):** a tap on the bars starts the selection lens in that frame (`leadPills`); copying the old page and drawing the new one wait until that frame is out (`afterPaint`). On a mid-range phone the new page took 300-600ms to draw and nothing moved meanwhile.
- **Home entrance (24th round):** each time the site is opened on the home, about a second: the sentence rises line by line, the event and buttons follow, the slabs stand from the middle out on the soft spring, and one solid slanted band crosses the current champion's window behind the Pokémon. On a return everything stands.
- **The belt:** tied to the scroll, never automatic; the slab that passes the centre gets the band.
- **Arena (24th round):** the first time it scrolls in, the lines are drawn from the middle, the ball lights, one sharp ring leaves it across the floor and a solid band crosses the YPL. Tapping an empty spot sends the ring again.
- **No scroll reveals (24th round):** sections stand where they are; nothing rises as it scrolls in. The home keeps its entrance, its numbers and its arena because each is an event.
- **Celebration (L5):** one flat disc and a ring spread from the moment (application accepted, team submitted, final decided); Android gets a short buzz (P2).
- **Loading (L1, 2026-10-12):** one shared loader (`Loader.jsx`), no words: the Wing Y sits dim (14%) where the screen will be and one solid band crosses it every 1.6s. It appears after 240ms so a quick load never flashes; `small` for spots inside a card or list. Reduced motion pulses instead of sweeping.

## Components

- Buttons (M11): primary inverse fill, secondary soft, tertiary text; 48px (40px small). Words only; an icon only for leaving the site, creating, or the next step in a flow (rule 3).
- Chips (M10): one 28px soft pill (13px, 600) for every label, tag and status; inverted only for a decided winner and an applied search filter; the dot appears only while something is live. A count is a 24px flat pill (`.fold-badge`, `.tb-count-badge`), never a pill inside a pill.
- Segmented (K3): groove track, raised lens; scrolls sideways without a bar when the labels do not fit, the groove stays put.
- Fields (M7): groove pills; textareas round at 20px. Focus is a 2px solid ring, keyboard only (K7).
- Dropdowns and menus (M6): desktop popover that grows from its trigger; phone sheet.
- Tables (M1, M2): no row rules, 60px rows, header labels share their column's alignment (see Alignment).
- Toasts (K6): from below (phone: just above the tab bar), stacked like Sonner, 3.8s.
- Icons (M8, M9): Phosphor Regular, Fill only for the selected tab; copied as paths into `Icon.jsx`.
- Empty states are sentences only (L3), on the left edge where the content would stand; errors are a calm sentence and a retry button (L4).
- Dates (one formatter, `src/services/dateFormat.js`): "10월 4일 (일)" this year, "2025년 10월 4일 (토)" otherwise, "2026년 8월" when only the month is known, "오후 4:00" appended for times. A missing date hides its field; never a dash.
- Public status words: 진행 중, 종료, 신청 중. Operator states (기록 반영됨, 기록 반영 전, party submission counts after the end) show only in admin mode.
- Event names are assembled, never typed (`src/services/eventName.js`, DB check `events_name_clean`): "37회 파이컵 팀전 리전 워즈".

## Pages (N1–N7)

- Home (24th round, 2026-11-01): a white page. A sentence (모든 승부가 기록이 됩니다), one line of the next event, two buttons; then the slab belt: each champion sealed in a case, the label on top (name, season, generation) and the first Pokémon of the winning entry in a navy window, the current champion's case inverted, pressing one opens the whole entry in a sheet; then the league's real numbers as a sentence (read from the same records snapshot and hall of fame as their own pages, never typed), rolling as they come in; four places to go; the three latest notices on the same four columns; and the arena as the close: the battle field of arenaField in thin lines on navy, its centre a Poké Ball, the YPL standing on it, one sentence and one button, meeting the navy footer. Things in the arena stand still and only the light moves: the lit lines lie under one navy sheet with a sharp round hole (a huge still box-shadow), the pointer slides the hole by transform, and it rests on the ball. Reduced motion stands everything at once.
- Notices and board: list card with the same row (rule 2): the title first, a pinned or admin-only label in front of it, then one line of date and excerpt (notices) or name and time (posts); a notice or post opens on its own screen at the full content width, its body in one opaque reading card (17px phone, 18px desktop). A run of three or more short lists in the body (team sheets) lays out as tiles side by side. A post's comments sit in a second card below. The notice list's head carries one small soft button after its search, 알림 받기 or 알림 끄기, its words alone; where push cannot work it stays and explains why when pressed (on iOS outside the home-screen app, how to add the site; in an in-app browser, to open Chrome or Safari).
- Records: trainers and Pokémon are lists that open a sheet (trainer results stand in three equal columns; on desktop the two columns read down, then across); the tournament archive is filtered by a row of small buttons (the applied one inverted, never a second tab bar) and each round reads like a row: its assembled event name, then one grey line of date, season, mode and rule; rankings open on the current season with one control (season, cumulative, past records), then a hero card, two rank cards and the table.
- Brackets: opaque match cards on the stage, lines lit as winners are decided and drawn once, the champion's road brightest, the champion cell inverted.
- Hall of fame: the champion's name is the hall's one inscription at `--display-l`, then one line of generation and season; the party stands in a V on a dais of three thin rings drawn on the floor, its names in one quiet line below the outer ring. The first visit in each visit to the site plays an entrance once: the rings spread, the party stands from the middle out, the name appears, a solid band crosses it. Earlier champions hang as plaques in one, two or three columns; a plaque opens a sheet with the same inscription and dais.
- Team builder: three steps on a phone (규정, 포켓몬 선택, 팀 구성), one screen on desktop; same state either way. The team saves as one PNG sheet in the current theme (every field of the editor) and posts straight to the board.
- Board tabs 자유, 샘플, 파티: a party is a tile with its sprites on the pod; a post shows the team sheet as opaque cards and opens in the builder. Brackets tabs 공식, 사설: a private bracket uses the official board with an inverted "사설" chip and a sentence that it never reaches records; its images say so too.
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
2. **Nearer is tighter, and a group's actions are a group.** Rule 1's distances stand; the buttons that end a sheet stand 40 under its body (the section distance) and the sheet's own padding over its edge (24 on a phone, 32 in a desktop dialog), at every height of sheet, and stay pinned while the body scrolls under them.
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
