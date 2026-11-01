---
name: YPL — Yonsei Pokémon League (Navy)
description: "The league site of record for Pokémon Center Yonsei, as simple as psacard.com: a white page and one navy in solid fills; what matters stands bold; everything that moves moves on the compositor; iOS springs; light first, dark equal."
source: "docs/redesign-glass/DECISIONS.md (authority, 24th round for the material) and docs/redesign-navy/prototype.html (reference build); recorded from the shipped src/"
colors:
  always:
    navy: "#081C3D"
    bar: "#081C3D"
    on-bar: "#FFFFFF"
    on-bar-2: "#B3BED1"
    bar-up: "#1D3156"
    band: "#9FB0CC"
    window: "#081C3D"
  light:
    stage: "#FFFFFF"
    surface: "#F3F5F8"
    surface-2: "#E6E9EE"
    fg: "#081C3D"
    fg-2: "#4A5264"
    fg-3: "#5B6375"
    soft: "#ECEEF2"
    accent: "#081C3D"
    on-accent: "#FFFFFF"
    rank: ["#081C3D", "#2F3F5C", "#4A5264", "#5B6375"]
  dark:
    stage: "#081C3D"
    surface: "#12284C"
    surface-2: "#1D3156"
    fg: "#FFFFFF"
    fg-2: "#B3BED1"
    fg-3: "#A2ABBC"
    soft: "#1D3156"
    accent: "#FFFFFF"
    on-accent: "#081C3D"
    rank: ["#FFFFFF", "#D5DCE8", "#B3BED1", "#A2ABBC"]
typography:
  family: "Freesentation for Korean (static weights 400 500 600 700, cut into core and rest slices by scripts/build-font-slices.py), Albert Sans for Latin and digits (one variable file). Both OFL. YPL Figures (public/fonts/ypl-figures.woff2) belongs to the brand only"
  scale: { hero: "48-96px / 700 (--hero), the home's opening sentence; --hero-2 36-72 its numbers; --hero-3 32-56 its close; --hero-4 32 a section name", display: "40-64px / 700 (--display)", title: "28-36px / 700", sizes: "12 13 15 16 17 20 24 28", weights: "400 text, 500 quiet labels and the menu, 600 rows labels and buttons, 700 titles, names and figures" }
  tracking: ".01em the body, 0 up to 18px where set, -.015em at 20, -.02em from 24, -.025em display"
  leading: [1, 1.06, 1.15, 1.25, 1.35, 1.45, 1.55, 1.8]
  figures: "700 with tabular digits on three steps: --fig-s 28, --fig-m 48, --fig-l 72"
  numbers: "tabular-nums everywhere a number can change, except a number inside a sentence"
spacing: [4, 8, 12, 16, 20, 24, 32, 40, 56, 80, 120]
radius: { hero: 36, card: 32, row: 24, field: 20, tile: 12, controls: pill }
motion:
  spring-snappy: "3.1% overshoot, 400ms natural length"
  spring-soft: "1.1% overshoot, 670ms natural length"
  ease-out: "cubic-bezier(.22,1,.36,1)"
  ease-in: "cubic-bezier(.5,0,.75,0)"
---

# YPL Navy

Tokens and recipes live in `src/styles/tokens.css`; motion helpers in `src/components/common/motion.js`.
`tests/designLaw.test.mjs` enforces the measurable part of this file (color literals and hue, the space, type and radius scales, alignment, blur, easing, middle dots, View Transitions) and the material law (no blur, no shadow in a transition, keyframes move transform and opacity only) on every CSS declaration, inline style and script animation. A deliberate exception is listed there under its reason.
Decision codes in brackets (C7, K3 ...) point to `docs/redesign-glass/DECISIONS.md`, which wins any disagreement with this file.

## Identity

Fluid, light, playful in the hand, serious on the page (seven parts serious to three parts play). People should be impressed simply by operating it: the press response first, then page transitions, then the first entrance (A1–A3). Never a generic AI landing page, never a game launcher, never a club homepage (A5). Since 2026-11-01 the plain confidence of psacard.com is the bar: a sentence, an object, a colour.

## Five rules (10th round)

Every screen is checked against these five and nothing else; the sections below are their detail.

1. Space shrinks with nearness: 4 label and value, 8 inside an element, 12 (16 desktop) one set of cards, 16 a control to the content it drives, 24 page title to content, 40 (56 desktop) between sections.
2. A list row has one shape: the title first (16px, 600), one grey line under it (13px), a trailing value on the right. Nothing small sits above a title.
3. Buttons are words. An icon only says what the words cannot: leaving the site (↗), creating (+), the next step in a flow (→).
4. Scoreboard numbers (days left, ranks, points, generations, counts) stand large, 700 at 28px and up with tabular digits and a small unit beside them (30점, 8팀, 6대); the wordmark's digits (YPL Figures) belong to the brand.
5. Bars and content keep the same distance top and bottom: 20px from a floating bar, plus the safe area.

## Color (24th round, replaces B1–B5)

- One colour: navy `#081C3D`, a darkened Yonsei blue, on white. Text is navy too, not black: black beside the navy bar and buttons read as two darks that nearly match.
- Solid fills only (user, 2026-11-01): no gradient, no sheen, no soft light, no metallic effect, no status hue. State reads through weight, tone and inversion.
- The primary button is the theme's inverse fill (navy on light, white on dark). Selection is a small lens one solid tone from what it stands on (`--lens`).
- First, second and third place differ by tone (`--rank-1..3`).
- Pokémon type colours stay: they are content, not chrome.
- Light is the default; a stored choice lives in `ypl-theme-2` (the old key held dark for everyone). Dark is equal: every token is redefined for it. The address bar is navy in both.

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

## Type (E1–E6)

Freesentation for Korean and Albert Sans for Latin and digits, the closest open pair to PSA's Area Normal; hierarchy by size and weight (sizes 12, 13, 15, 16, 17, 20, 24, 28, then title, display and the home's hero steps). Four weights, each with one job: 400 text; 500 quiet labels and the menu; 600 row titles, labels, buttons, chips and table values; 700 titles, names and figures. What matters stands bold, as on PSA (user, 2026-11-01). Tracking: .01em on the body, none where set up to 18px, -.015em at 20, -.02em from 24, -.025em display; headings inherit no tracking. Line heights come from one set: 1, 1.06, 1.15, 1.25, 1.35, 1.45, 1.55, 1.8 (the article body). Scoreboard figures (days left, ranks, points, generations, counts) are 700 with tabular digits on three steps, `--fig-s` 28, `--fig-m` 48, `--fig-l` 72; a number inside a sentence keeps its natural width (`Roll natural`). YPL Figures is reserved for the brand, never a page's numbers. Titles are large, space is the hero. English appears only in the brand. No small uppercase label sits above a title. The YPL wordmark is drawn, never typeset; on the top bar it is 18px tall beside a 28px Wing Y, 12px apart. Korean copy uses plain prose, no middle dots. Copy wraps only at its container's edge: no `ch` or `em` measure caps a line that fits. Page titles are the plain name (공지, 기록, 대진표) with a description only when it adds something. A notice or post body reads the few pieces of Markdown admins paste: a block opening with `#` is a headline over its text, `**bold**` is 600, `[text](url)` and bare addresses are underlined links; nothing else is parsed. Hangul outside Freesentation's 2,780 syllables falls back to the system face.

## Logo (F1–F3)

Wing Y (`public/brand/ypl-wing-y.svg`, the 2026-10-12 mark refined on 2026-10-27, candidate H): two raised wings, each a broad top feather over one shorter feather, meeting in a Y on a thick stem; a straight band across the neck and a wide three-feather fan tail, all straight edges, exactly symmetric, 1.51 wide to 1 tall. It keeps the 2026-10-12 drawing's rules (feather strata parallel to the top edge, every feather tip on one diagonal, the fan tail) with heavier strokes and slits just wide enough to show at 24px; the outlines touch but never overlap, so it fills the same under nonzero and evenodd. 28px tall (42 wide) beside the wordmark on the top bar. Solid, in the colour it stands on. It never animates: the top bar is a fixed landmark. The wordmark is the solid slanted YPL (candidate B, 2026-11-01): the band that used to cut the letters closed up at 14px, so the letters are one piece, 12 degrees slanted.

## Space and radius

4px grid on one scale (`--s1` to `--s14`), nearer means smaller: 4 label and value and a title and its meta line, 8 inside an element, between side-by-side controls and a hint under its field, 12 items of one set (`--grid-gap`, 16 desktop) and a "show all" under its list, 16 blocks inside a card, section title to content and a control (tabs, a segmented switch) to the content it drives, 20 card padding at every width (hero 24; list surfaces 8 so their rows keep radius 24) and between a form's fields, 24 page title to first content and a sheet's title to its body, 40 between sections (56 desktop), 80 between chapters (120 desktop). Gutters 16 phone, 32 desktop; bars share the content width. Inner radius equals outer radius minus padding: hero 36, card 32 (padding 20) holding 12px tiles; controls are pills. Every corner is named (`--r-hero` 36, `--r-card` 32, `--r-row` 24, `--r-field` 20, `--r-tile` 12, `--r-pill`): a row in a list takes the row radius, a tile in a card the tile radius, nothing in between. Every label sits at the exact centre of its control.

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
- **Press (K1):** scale .97 in 90ms, back on the snappy spring. Desktop hover: a soft light comes up inside the element (`.hl`).
- **Selection (K3):** a liquid lens. The leading edge springs toward the target first, the trailing edge follows a beat later, the lens thins up to 10% while stretched and settles with under 5% overshoot. It is two round caps and a body in one solid tone, moved by transforms only, so it keeps its frames while the next page renders.
- **Tab switch (K3, 2026-10-16):** every page tab (a Segmented on the page's `tab` or `step`) slides its lens and the new view rises with `.swap`, including tabs that render a whole separate view and remount the bar (board 샘플/파티, 사설 대진표): the bar hands its lens position across the remount. `tests/designLaw.test.mjs` enforces it.
- **Numbers (K4)** roll digit by digit. **Ranking rows (K5)** slide to their new place (FLIP) and rows that rose glow briefly.
- **Sheets (K10, M5):** one rule at 860px, the width where every layout turns desktop. Under it a sheet rises from the bottom at the full width of the screen, round on top, its lower edge the screen's own; it drags down to close and leaves at the finger's speed, and the page behind recedes to .965. From 860 the same content is a centred dialog, round on all four corners. Nothing is round on top and square below in mid-air: a sheet clips what it holds, so its pinned actions never paint over a corner. Every sheet and dialog has the X at its top right, titled or not.
- **Springs keep their natural length (2026-10-27):** snappy runs 400ms (`var(--dur-snappy)`, `DUR.snappy`), soft 670ms (`var(--dur-soft)`, `DUR.soft`). A spring curve stretched to another length is another spring.
- **The press answers first (2026-10-27):** a tap on the bars starts the selection lens in that frame (`leadPills`); copying the old page and drawing the new one wait until that frame is out (`afterPaint`). On a mid-range phone the new page took 300-600ms to draw and nothing moved meanwhile.
- **Home entrance (24th round):** each time the site is opened on the home, about a second: the sentence rises line by line, the event and buttons follow, the slabs stand from the middle out on the soft spring, and one solid slanted band crosses the current champion's window behind the Pokémon. On a return everything stands.
- **The belt:** tied to the scroll, never automatic; the slab that passes the centre gets the band.
- **Arena (24th round):** the first time it scrolls in, the lines are drawn from the middle, the ball lights, one sharp ring leaves it across the floor and a solid band crosses the YPL. Tapping an empty spot sends the ring again.
- **Reveal (J1):** a section rises once the first time it scrolls in; anything already on screen stays still.
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
- **Body copy runs to its container's edge.** No `text-wrap: pretty` and no measure caps; only headlines and the caption under a picture balance their lines.
- **Words and buttons stand clear of drawn lines.** On the home arena the line, the buttons and the empty-state sentence ("다음 대회 일정은 공지에 올라옵니다.") stand on open floor, never on a field line.
- **Copy says one thing.** The footer is a fan site run by the club and says it has no relation to Nintendo, Creatures, GAME FREAK or The Pokémon Company; it no longer pairs "공식" with "비공식". Quotation marks are typographic (‘ ’).

## Space and text law (2026-10-28)

What makes the screen feel calm is that the eye never has to find a new line to read from and never meets two sizes for one job. A survey of every window, sheet, menu and control found both broken, so these six hold for all of them; `tests/designLaw.test.mjs` checks what it can see.

1. **One text edge per surface.** On a page, a card, a sheet or a menu the words start on one line, the surface's padding. Whatever draws its own box (a field, a button, a tile, a chip, a grouped list) puts the box on that line and its words inside. A row with no box at rest (a menu row, an option, a picker row, a team to post) puts its words on the line and hangs its highlight 12 into the padding: on a phone sheet the highlight stands 8 from the edge, so its radius is the sheet's 32 less 8, the row radius 24. A popover and a dropdown menu (padding 6) start their words 18 in, both the same.
2. **Nearer is tighter, and a group's actions are a group.** Rule 1's distances stand; the buttons that end a sheet stand 40 under its body (the section distance) and the sheet's own padding over its edge (24 on a phone, 32 in a desktop dialog), at every height of sheet, and stay pinned while the body scrolls under them.
3. **Heights on one ladder.** 24 count, 28 chip, 36 a control inside a track, a field or a row (segment, clear, refresh), 40 small button and the sheet's X, 44 the touch floor and a floating menu's row, 48 button, field and dropdown, 52 a one-line choice in a sheet, 60 a list row (`--row-min`: notices, posts, trainers, pickers, tables). The touch floor only raises what is lower; it never lowers a 48 field or a 60 row.
4. **Five text roles, one look each.** A title; a row title (16, 600); its grey line (13, `--fg-3`, 4 under, line height 1.45); an explanatory sentence (15, 1.55, `--fg-2`: a page description, a sheet's hint, a note in a form, an empty list); a field label (13, 600, `--fg-2`).
5. **One state ladder for chosen rows.** Rest clear, hover `--tint-soft`, selected `--tint` with a check, keyboard focus `--tint-strong`. The label stays 600 in every state, so choosing never moves the words.
6. **An X is drawn at its circle's scale.** 18 in the sheet's 40, 14 in a 36 clear button, 12 in a chip.

## Don't

- Do not reintroduce View Transitions snapshots for pages or theme; they flickered on phones.
- Do not blur anything, behind or in front: no `backdrop-filter`, no `filter: blur`, no blurred entrance.
- Do not animate a shadow, a filter, a clip, a mask or a background. Give the moving thing a still picture and move that.
- Do not copy the page for a transition.
- Do not add a gradient, a sheen, soft light, a second hue, a status hue or visible grain. The only second face is YPL Figures, and it belongs to the brand: never set a page's numbers in it.
- Do not repeat what the screen already says: one fact once, no all-zero tiles, no default status ("종료") on every row, no decorative numerals.
- Do not put an eyebrow or kicker label above a title.
- Do not change data behavior from a visual change.
