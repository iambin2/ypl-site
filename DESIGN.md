---
name: YPL — Yonsei Pokémon League (Glass)
description: "The league site of record for Pokémon Center Yonsei: achromatic glass floating over a graphite stage lit from directly above; opaque reading surfaces; iOS springs; dark first, light equal."
source: "docs/redesign-glass/DECISIONS.md (authority) and docs/redesign-glass/lab/glass-lab.html (reference build); recorded from the shipped src/ on 2026-10-11"
colors:
  dark:
    stage: "#0A0A0A"
    surface: "#161616"
    surface-2: "#1F1F1F"
    surface-3: "#2B2B2B"
    fg: "#F5F5F5"
    fg-2: "#B0B0B0"
    fg-3: "#8C8C8C"
    accent: "#F5F5F5"
    on-accent: "#0A0A0A"
    rank: ["#FFFFFF", "#CFCFCF", "#A6A6A6", "#8C8C8C"]
  light:
    stage: "#E7E7E7"
    surface: "#FFFFFF"
    surface-2: "#F3F3F3"
    surface-3: "#E6E6E6"
    fg: "#0A0A0A"
    fg-2: "#525252"
    fg-3: "#6B6B6B"
    accent: "#0A0A0A"
    on-accent: "#FFFFFF"
    rank: ["#000000", "#3D3D3D", "#5E5E5E", "#6B6B6B"]
typography:
  family: "SUIT Variable (source public/fonts/SUIT-Variable.woff2, served as unicode-range slices in public/fonts/suit/ by scripts/build-suit-slices.py) for all text and every number; YPL Figures (public/fonts/ypl-figures.woff2) belongs to the brand only"
  scale: { display: "40-64px / 800 (--display), home steps one golden ratio apart: the drawn name at display x1.618, figures display x2.618", title: "28-36px / 800", sizes: "12 13 15 16 17 20 24 28", weights: "400 text, 600 rows labels buttons chips, 700 headlines 20px and up, 800 titles names and figures" }
  tracking: "0 up to 18px, -.015em at 20, -.02em at 24-28, -.03em title, -.04em display; big figures follow the same curve"
  leading: [1, 1.06, 1.15, 1.25, 1.35, 1.45, 1.55, 1.8]
  figures: "SUIT 800 with tabular digits on three steps: --fig-s 28, --fig-m 48, --fig-l 72"
  numbers: "tabular-nums everywhere a number can change"
spacing: [4, 8, 12, 16, 20, 24, 40, 56, 80, 120]
radius: { hero: 36, card: 32, row: 24, field: 20, tile: 12, controls: pill }
motion:
  spring-snappy: "3.1% overshoot, 400ms natural length"
  spring-soft: "1.1% overshoot, 670ms natural length"
  ease-out: "cubic-bezier(.22,1,.36,1)"
  ease-in: "cubic-bezier(.5,0,.75,0)"
---

# YPL Glass

Tokens and recipes live in `src/styles/tokens.css`; motion helpers in `src/components/common/motion.js`.
`tests/designLaw.test.mjs` enforces the measurable part of this file (color literals and hue, the space, type and radius scales, alignment, blur, easing, middle dots, View Transitions) on every CSS declaration and inline style. A deliberate exception is listed there under its reason.
Decision codes in brackets (C7, K3 ...) point to `docs/redesign-glass/DECISIONS.md`, which wins any disagreement with this file.

## Identity

Fluid, light, playful in the hand, serious on the page (seven parts serious to three parts play). People should be impressed simply by operating it: the press response first, then page transitions, then the first entrance (A1–A3). Never a generic AI landing page, never a game launcher, never a club homepage (A5).

## Five rules (10th round)

Every screen is checked against these five and nothing else; the sections below are their detail.

1. Space shrinks with nearness: 4 label and value, 8 inside an element, 12 (16 desktop) one set of cards, 16 a control to the content it drives, 24 page title to content, 40 (56 desktop) between sections.
2. A list row has one shape: the title first (16px, 600), one grey line under it (13px), a trailing value on the right. Nothing small sits above a title.
3. Buttons are words. An icon only says what the words cannot: leaving the site (↗), creating (+), the next step in a flow (→).
4. Scoreboard numbers (days left, ranks, points, generations, counts) stand large, SUIT 800 at 28px and up with tabular digits and a small unit beside them (30점, 8팀, 6대). Every number on the site is SUIT; the wordmark's digits (YPL Figures) belong to the brand.
5. Bars and content keep the same distance top and bottom: 20px from a floating bar, plus the safe area.

## Color (B1–B5)

- Achromatic only. No accent hue, no metallic gradient, no status hue. State reads through weight, brightness and inversion.
- The primary button is the theme's inverse fill (white on dark, black on light). Selection is a small lens of the same glass (`--ind-fill`).
- First, second and third place differ by brightness (`--rank-1..3`).
- Pokémon type colours stay: they are content, not chrome.
- Light is not an afterthought: every token is redefined under `[data-theme="light"]`, and the color tokens are registered with `@property` so a theme change can fade them.

## Stage and material (C1–C7, D1–D4)

- **Stage (L0):** graphite with one soft light from directly above, drifting on a 52s and a 68s cycle. It moves a little when the page changes, brightens with the event state (open, live, done) and follows scroll very slightly. A 1/255 dither stops banding; there is no visible grain.
- **Refraction (C2):** in Chromium every floating piece bends what is behind it at its rim, like a thick convex lens: a displacement map drawn for the piece's own rounded shape (a 24px band, at most 40% of the short side, bend 110% of the band) runs as `backdrop-filter: url()` under a light frost (bars 4px, sheets and menus 16px), followed by a 0.6px blur so the nearest-pixel sampling of the bend never streaks (2026-10-19). Safari, Firefox and reduced transparency keep the frosted glass below. `src/components/common/refraction.js`, reference `docs/redesign-glass/lab/refraction-lab.html`.
- **Glass (L2, `.glass`):** frosted where refraction is unavailable, lit from directly above so it reads as a thick curved object. A body that brightens what is behind it (`brightness`), a specular pool at the top with a sheen falling from it, light gathering again at the bottom, soft inner edges (no hard 1px outline), and a rim brightest at the top that fades toward the ends and returns faintly at the bottom. Layered shadow straight down.
- **One ceiling light (16th round):** the stage light and the glass are lit by the same light. The pool, the light under it and the brightest stretch of the rim stand where the stage light stands across the screen (`--gx` from the stage's `--lx`, set per page on `<html>`), so when the page changes the light on the bars and sheets glides with the stage light (1.8s ease-out). Menus at their trigger keep their light at their own centre.
- **Glint (16th round, `glint.js`):** glass lights up where it is touched. On the bars and secondary buttons a bloom of light rises inside the glass under the finger and the rim catches it nearest the finger, held while the finger stays and let go after it lifts (200ms in, 560ms out). It sits over the body and under the words and the lens. Reduced motion keeps the press without it. In light the bloom is quiet by nature (white on clear white glass); the rim carries it.
- **Light glass:** clear and a little grey, not white, so the white pool and rim read against it, with a faint dark contour at the ends that keeps a bar standing on a white card.
- **Sheet glass (L3, `.glass-l3`):** sheets, dialogs, popovers, toasts. Stronger blur and body.
- **Lite glass:** the same raised look without blur for controls on flat surfaces: secondary buttons, chips, form choices (one selector list at the top of `components.css`).
- **Groove (`.groove`):** a track pressed into the surface, shaded from the top edge: segmented tracks, the top bar's link track, fields. The selection lens sits raised in it.
- **Reading surfaces are opaque (`.card`, `--surface`):** lists, tables, match cards, hero cards. Glass is for whatever floats.
- Budget: at most four real blurs on screen at once. Segmented controls therefore use lite glass.
- The party sits in a display case that follows the theme (`--pod` tokens): dark in dark, the light surface in light. The shown sprites are transparent PNGs; `lighten` in dark still melts the black ground of the old embedded fallback sprites.

## Type (E1–E6)

SUIT for every word, hierarchy by size and weight (sizes 12, 13, 15, 16, 17, 20, 24, 28, then title and display). Four weights, each with one job (15th round): 400 text; 600 row titles, labels, buttons, chips and table values; 700 only for headlines of 20px and up; 800 titles, names and figures. Tracking follows size on one curve: none up to 18px (small Korean is cleanest at 0), -.015em at 20, -.02em at 24-28, -.03em the title step, -.04em display; headings inherit no tracking. Line heights come from one set: 1, 1.06, 1.15, 1.25, 1.35, 1.45, 1.55, 1.8 (the article body). Scoreboard figures (days left, ranks, points, generations, counts) are SUIT 800 with tabular digits on three steps, `--fig-s` 28, `--fig-m` 48, `--fig-l` 72, tracked like any type of their size; a list's step numbers are not figures and stand in the title's own type. YPL Figures is reserved for the brand, the wordmark and text that belongs to it, never a page's numbers (2026-10-27: the user found them unattractive as numbers): digits drawn in the wordmark's construction (stems 28, bars 24, radius 18, slanted 12 degrees, cut by the band at 56-64), a real 772-byte web font built by `scripts/build-figures.py`. The 1 is a stem with a short flag and no foot (narrow, so it never reads as a 7; the old foot made it a J at 28px), and the 8 is two rounded loops whose waist corners round like their outer corners (the old square waist read as a B or a 日; a narrowed waist read as 요). Redrawn 2026-10-27. Small numbers in tables and dates stay SUIT. Titles are large, space is the hero. English appears only in the brand. No small uppercase label sits above a title. The YPL wordmark is drawn (wordmark B "띠"), never typeset; on the top bar it is 14px tall beside a 24px Wing Y, 8px apart. The league's full name can be drawn the same way (`src/components/home/brandTitle.js`, no longer on the home): the wordmark's own Y, P and L and ten more letters in its construction, the diagonals of K and M taking the Y's arms; letters 8 apart, lines one outer bar (24) apart. Korean copy uses plain prose, no middle dots. Copy wraps only at its container's edge (2026-10-16): no `ch` or `em` measure caps a line that fits, so a short caption never breaks early in a wide card; only a one-line name cut with an ellipsis may cap its width. Page titles are the plain name (공지, 기록, 대진표) with a description only when it adds something.

## Logo (F1–F3)

Wing Y (`public/brand/ypl-wing-y.svg`, the 2026-10-12 mark refined on 2026-10-27, candidate H): two raised wings, each a broad top feather over one shorter feather, meeting in a Y on a thick stem; a straight band across the neck and a wide three-feather fan tail, all straight edges, exactly symmetric, 1.51 wide to 1 tall. It keeps the 2026-10-12 drawing's rules (feather strata parallel to the top edge, every feather tip on one diagonal, the fan tail) with heavier strokes and slits just wide enough to show at 24px; the outlines touch but never overlap, so it fills the same under nonzero and evenodd. 24px tall (36 wide) beside the wordmark on the top bar. Solid, white on dark and black on light. It never animates: the top bar is a fixed landmark (the entrance rise and the loading band were removed on 2026-10-12).

## Space and radius

4px grid on one scale (`--s1` to `--s14`), nearer means smaller: 4 label and value and a title and its meta line, 8 inside an element, between side-by-side controls and a hint under its field, 12 items of one set (`--grid-gap`, 16 desktop) and a "show all" under its list, 16 blocks inside a card, section title to content and a control (tabs, a segmented switch) to the content it drives, 20 card padding at every width (hero 24; list surfaces 8 so their rows keep radius 24) and between a form's fields, 24 page title to first content and a sheet's title to its body, 40 between sections (56 desktop), 80 between chapters (120 desktop). Gutters 16 phone, 32 desktop; bars share the content width. Inner radius equals outer radius minus padding: hero 36, card 32 (padding 20) holding 12px tiles; controls are pills. Every corner is named (`--r-hero` 36, `--r-card` 32, `--r-row` 24, `--r-field` 20, `--r-tile` 12, `--r-pill`): a row in a list takes the row radius, a tile in a card the tile radius, nothing in between. Every label sits at the exact centre of its control.

## Alignment (2026-10-16)

One edge: text starts on the content's left edge. Two exceptions, and only these:

- **Right:** a value at the end of a row and a number column (points, counts, a trailing date or status), so digits line up.
- **Centre:** (a) a label inside its control: buttons, chips, tabs, segments, the pager, number fields; (b) a short mark in a narrow fixed cell: rank, seed, game number, vs, an empty slot's number; (c) a caption under its picture: a Pokémon's name under its sprite, the versus tiles on a phone; (d) a symmetric stage: words on the screen's axis over a symmetric picture, i.e. the home arena over the field and the hall of fame stage (and its sheet) over the party.

Everything else is left: page and section heads, sheet and dialog titles, rows, cards, forms, articles, empty states, success states. A column header shares its column's alignment and stands on the first letter of its cells (bracket rounds over the names in the cards, team names over the dropdowns). The test: if what sits under or beside the text starts on the left, so does the text. A block may be centred on the page (the home chapters' 720px column) while its text stays left.

## Layout and navigation (G1–G7)

- Phone: floating glass top bar (logo, theme) and a bottom glass tab bar of five: 홈, 공지, 대진표, 기록, 더보기. 더보기 holds 칭호, 명예의 전당, 게시판, 팀 빌더, 계산기, 소개, Discord and admin login.
- Desktop (860px+): one floating pill bar with the same five in the middle; 더보기 opens a glass popover. Wide desktop (1100px+): every page has its own link (홈, 공지, 대진표, 기록, 칭호, 명예의 전당, 게시판, 팀 빌더, 계산기, 소개, in the same order as 더보기) and there is no 더보기; Discord stays in the footer, and admin login is a sign-in icon button (an arrow into a door; a padlock read as a shopping bag at 22px) left of the theme button (hidden in admin mode, where the bottom admin bar logs out).
- Bars hide on scroll down and return on scroll up; the top bar floats with a small shadow and gains its full shadow once content passes under it.
- Content maximum width 1200px. Admin mode shows as a floating glass dock at the bottom (O2).

## Motion (H1–H5, I1–I4, J1–J4, K1–K10)

- **One curve law (10th round):** content that appears decelerates on the page rise's ease-out (sections, swaps, sheet tiles, the champion cell, the success check); floating layers that present (sheets, menus, dropdowns, toasts) and things already on screen that move or react (press, the lens, shared flights, reordering rows, rolling digits, the selected tab icon) use the springs. User-caused reactions mostly under 200ms, big changes longer. Reduced motion keeps opacity and drops travel and growth, in one rule at the end of `tokens.css`.
- **Page transitions:** no snapshots. The old page leaves as a live copy (200ms, ease-in, a quarter of the travel upward), the new page rises 16px in (480ms ease-out, 60ms later). Back goes the other way and returns to the scroll position it left. A shared element's landing spot is measured before the page starts rising, so it lands once.
- **Shared elements (I2):** notice and board post title to article title; bracket card title to the board head; the tab pill never breaks between pages. Trainer, Pokémon and champion sheets do not fly the row: the row stays put and the sheet title settles 6px with a lifting blur (460ms, 90ms after the sheet starts).
- **Theme change (B6, 2026-10-12):** nothing moves, only the colors change. The typed color tokens fade on `<html>` over `--dur-slow` (`.theme-fade`), so every element, gradient and glass follows them in place; shadows switch at once and ease on the element. Nothing is copied. The home stage canvas fades from a still copy of itself in the old theme. The theme icon crossfades without turning.
- **Press (K1):** scale .97 in 90ms, back on the snappy spring. Desktop hover: a soft light follows the pointer inside the element (`.hl`).
- **Selection (K3):** a liquid lens. The leading edge springs toward the target first, the trailing edge follows a beat later, the lens thins up to 10% while stretched and settles with under 5% overshoot. It is two round caps and a body, opaque inside one faded group, moved by transforms only, so it keeps its frames while the next page renders.
- **Tab switch (K3, 2026-10-16):** every page tab (a Segmented on the page's `tab` or `step`) slides its lens and the new view rises with `.swap`, including tabs that render a whole separate view and remount the bar (board 샘플/파티, 사설 대진표): the bar hands its lens position across the remount. `tests/designLaw.test.mjs` enforces it.
- **Numbers (K4)** roll digit by digit. **Ranking rows (K5)** slide to their new place (FLIP) and rows that rose glow briefly.
- **Sheets (K10, M5):** phone sheets rise from the bottom, drag down to close, and leave at the finger's speed; the page behind recedes to .965. Desktop shows the same content as a centred dialog. Every sheet and dialog has the X at its top right, titled or not.
- **Springs keep their natural length (2026-10-27):** snappy runs 400ms (`var(--dur-snappy)`, `DUR.snappy`), soft 670ms (`var(--dur-soft)`, `DUR.soft`). A spring curve stretched to another length is another spring.
- **The press answers first (2026-10-27):** a tap on the bars starts the selection lens in that frame (`leadPills`); copying the old page and drawing the new one wait until that frame is out (`afterPaint`). On a mid-range phone the new page took 300-600ms to draw and nothing moved meanwhile.
- **Arena entrance (18th round, 2026-10-27):** each time the site is opened on the home: the beam from above comes on (1.6s), the floor's pool follows, the centre line and the field's edge are drawn from the middle, the circle and the button fade in and one wave of light crosses the floor from the button, then the YPL comes out of the dark and a blur (2s) and one band of light crosses its letters; the event text comes last (3.2s). Nothing bounces, pops or slides; the arena is heavy and slow. On a return everything stands lit and the text follows the page transition.
- **Reveal (J1):** a section rises once with a lifting blur the first time it scrolls in; anything already on screen stays still.
- **Celebration (L5):** one white light and a ring spread from the moment (application accepted, team submitted, final decided); Android gets a short buzz (P2).
- **Loading (L1, 2026-10-12):** one shared loader (`Loader.jsx`), no words: the Wing Y sits dim (14%) where the screen will be and a band of light crosses it every 1.6s. It appears after 240ms so a quick load never flashes; `small` for spots inside a card or list. Reduced motion pulses instead of sweeping.

## Components

- Buttons (M11): primary inverse fill, secondary lite glass, tertiary text; 48px (40px small). Words only; an icon only for leaving the site, creating, or the next step in a flow (rule 3).
- Chips (M10): one 28px lite glass pill (13px, 600) for every label, tag and status; inverted only for a decided winner and an applied search filter; the dot appears only while something is live. A count is a 24px flat pill (`.fold-badge`, `.tb-count-badge`), never glass inside glass.
- Segmented (K3): groove track, raised lens; scrolls sideways without a bar when the labels do not fit, the groove stays put.
- Fields (M7): groove pills; textareas round at 20px. Focus is a 2px achromatic ring, keyboard only (K7).
- Dropdowns and menus (M6): desktop popover that grows from its trigger; phone sheet.
- Tables (M1, M2): no row rules, 60px rows, header labels share their column's alignment (see Alignment).
- Toasts (K6): from below (phone: just above the tab bar), stacked like Sonner, 3.8s.
- Icons (M8, M9): Phosphor Regular, Fill only for the selected tab; copied as paths into `Icon.jsx`.
- Empty states are sentences only (L3), on the left edge where the content would stand; errors are a calm sentence and a retry button (L4).
- Dates (one formatter, `src/services/dateFormat.js`): "10월 4일 (일)" this year, "2025년 10월 4일 (토)" otherwise, "2026년 8월" when only the month is known, "오후 4:00" appended for times. A missing date hides its field; never a dash.
- Public status words: 진행 중, 종료, 신청 중. Operator states (기록 반영됨, 기록 반영 전, party submission counts after the end) show only in admin mode.
- Event names are assembled, never typed (`src/services/eventName.js`, DB check `events_name_clean`): "37회 파이컵 팀전 리전 워즈".

## Pages (N1–N7)

- Home: one screen, the arena (DECISIONS 18th round, 2026-10-27; the 14th round's hall was replaced because it repeated the hall of fame). A battle field lies in perspective across the whole screen behind the bars: the edge, a trainer box at each end, and the centre line, circle and button drawn together as one Poké Ball, faded toward the far and near ends, under a beam from directly above. The YPL wordmark stands on the ball, lit from above, and is reflected in the floor. Under it, in the page: the days left and the next event, then two buttons. Movement rule (user, 14th round): things stand still and only light moves. The field is drawn twice, dim lines and lit glowing lines, and the lit copy shows only inside one soft circle of light; the pointer carries that light over the field and a second light over the YPL's letters, and both return to rest on the ball and the top of the letters when the pointer leaves (on a phone they stay at rest). Tapping an empty spot sends one wave of light across the floor from the button. No parallax, no particles, no auto-repeating motion. Below the arena is the footer. The Wing Y logo is never used on the home. Reduced motion shows the lit arena at once and keeps the lights still.
- Notices and board: list card with the same row (rule 2): the title first, a pinned or admin-only label in front of it, then one line of date and excerpt (notices) or name and time (posts); a notice or post opens on its own screen at the full content width, its body in one opaque reading card (17px phone, 18px desktop). A run of three or more short lists in the body (team sheets) lays out as tiles side by side. A post's comments sit in a second card below.
- Records: trainers and Pokémon are lists that open a sheet (trainer results stand in three equal columns; on desktop the two columns read down, then across); the tournament archive is filtered by a row of small buttons (the applied one inverted, never a second tab bar) and each round reads like a row: its assembled event name, then one grey line of date, season, mode and rule; rankings open on the current season with one control (season, cumulative, past records), then a hero card, two rank cards and the table.
- Brackets: opaque match cards on the stage, lines lit as winners are decided and drawn once, the champion's road brightest, the champion cell inverted.
- Hall of fame (19th round, 2026-10-27): the champion's hall, built from the home arena's vocabulary. One shaft of light falls from above the page head (which stays above it) onto a dais drawn on the floor as three rings, thinner on the short axis like a floor seen at an angle (`PartyStage dais`). The party stands on it in a V at every width; the name is the hall's one inscription at the home's next step (`--display-l`), lit from above like the YPL with a soft glow, then one line of generation and season, then the party's names in one quiet line below the outer ring, like a museum label. The first visit to the hall in each visit to the site plays an entrance once (like the arena): the shaft comes on, the rings spread from the centre, the party stands from the middle out, the name comes out of the dark and a blur and one band of light crosses it, then the line and the button. On a return it stands lit; reduced motion stands lit at once. Still otherwise: only the light answers the pointer. Earlier champions hang as plaques on a wall (one, two or three columns), each lit faintly from above at its top edge with its party on a small floor of contact shadows; a plaque opens a sheet with the same inscription and the same dais. The hall's air is an ellipse that touches its box on every side, so it never shows an edge. The floor does not mirror the party: a reflection stood away from the feet and read as ghosts.
- Team builder: three steps on a phone (규정, 포켓몬 선택, 팀 구성), one screen on desktop; same state either way. The team saves as one PNG sheet in the current theme (every field of the editor) and posts straight to the board.
- Board tabs 자유, 샘플, 파티: a party is a tile with its sprites on the pod; a post shows the team sheet as opaque cards and opens in the builder. Brackets tabs 공식, 사설: a private bracket uses the official board with an inverted "사설" chip and a sentence that it never reaches records; its images say so too.
- About: an ordinary document whose sections rise once.

## Consistency (2026-10-27)

A first-visit review found the rules above broken in many small places. Each line below names what was broken and the rule that now holds; `tests/designLaw.test.mjs` checks the ones a test can see.

- **A title comes first.** No date, status chip, side label or small number above a title: an article's date, a bracket head's chip, a round's date, a timeline's year, a picker's "내 포켓몬" all sit on the grey line under the name. A big figure stands above its label (8팀, then 참가), never under it.
- **Rows have one rhythm.** A title and its grey line are 4 apart everywhere. Nothing may grow a title's line box (a tap target on an inline name gets its 44px from a box laid around the word, not from its height). A caption never stands beside a headline ("대회 이력 최근 순으로 25건"): the headline stands alone.
- **One name for one thing.** Events use the assembled name everywhere (`37회 파이컵 팀전 리전 워즈`, never `마스터 리그 37회`); a champion's generation is a number (`1대`, never `초대`, through `generationText`); a champion is described one way: "6대 챔피언, YPL 시즌 2 우승". A preview line never repeats its title. Facts already in the title are not repeated as a field (the mode when the name says 팀전).
- **One place for a count.** A list's count stands right of its search field in the quiet 13px grey (71명, 110종, 59건). A count of zero is not shown (no "댓글 0", no "내 팀 0"); a comment count is words ("댓글 3"), not an icon.
- **Same rank for the same score.** Any ranked list (rankings, Pokémon usage) gives equal values the same rank.
- **Dates only through `formatDate`.** Including periods ("9월 9일 (수) – 12월 2일 (수)") and history ("2023년 5월", "2023년 – 2025년"). A date typed as "2026.09.09" in data is formatted before it is shown.
- **Icons only for leaving, creating, the next step** (rule 3), and navigation. No decorative icon in a heading, a chip, a list title or a result line; the Discord button is the words and ↗.
- **Inverted means decided or applied.** A winner, the current champion, an applied filter. A category label ("학기 최강전") is a plain chip; the dot means live and nothing else.
- **Same content, same shape.** Kinds of competition and kinds of league share one card of rows (name, chip, line). Empty slots are recessed tiles, never outlined boxes. Picking a Pokémon has one control per screen.
- **Body copy runs to its container's edge.** No `text-wrap: pretty` and no measure caps; only headlines and the caption under a picture balance their lines.
- **Nothing ends at a cut.** A drawn stage that fills the screen (the home arena) fades into the stage at its lower edge, so scrolling past it never shows its box.
- **Words and buttons stand clear of drawn lines.** On the home arena the line, the buttons and the empty-state sentence ("다음 대회 일정은 공지에 올라옵니다.") stand on open floor, never on a field line.
- **Copy says one thing.** The footer is a fan site run by the club and says it has no relation to Nintendo, Creatures, GAME FREAK or The Pokémon Company; it no longer pairs "공식" with "비공식". Quotation marks are typographic (‘ ’).

## Don't

- Do not reintroduce View Transitions snapshots for pages or theme; they flickered on phones.
- Do not put blur on reading surfaces or exceed four blurs on one screen.
- Do not add hue for status, a metallic gradient or visible grain. The only second face is YPL Figures, and it belongs to the brand: never set a page's numbers in it.
- Do not repeat what the screen already says: one fact once, no all-zero tiles, no default status ("종료") on every row, no decorative numerals.
- Do not put an eyebrow or kicker label above a title.
- Do not change data behavior from a visual change.
