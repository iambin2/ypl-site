---
name: YPL — Yonsei Pokémon League (Scoreboard)
description: "A stadium scoreboard in navy. The ground is a board switched off; facts light up on square panels joined by a 2px seam; numbers are real seven-segment displays; one amber lamp means live. Every measure comes from one ratio, phi. Dark first, light equal."
source: "this file; the values in src/styles/tokens.css, the shared parts in src/components/common/Board.jsx and src/styles/board.css, the measurable rules in tests/designLaw.test.mjs"
status: "Live in production since 2026-11-03. The site as built is the reference; there are no drafts to follow."
scale:
  base: 4
  seam: 2
  space: [4, 8, 12, 20, 32, 52, 84]
  type: [12, 15, 20, 32]
  segment: [32, 40, 84, 120, 240]
  weights: [400, 600, 700]
  radius: 0
  line: { hair: 1, rule: 2 }
  height: { strip: 32, control: 44, row: 52, row2: 64, counter: 84 }
  breakpoints: [640, 860, 1100]
  content: { full: 1200, columns: [709, 439], sheet: 576 }
  motion: { press: 100, tone: 160, leave: 260, light: 420 }
  stagger: { row: 38, display: 62 }
---

# YPL Scoreboard

**경기장의 전광판: 꺼진 남색 판 위에 사실이 직각 패널로 켜진다. 숫자는 7세그먼트로, 지금 살아 있는 것은 호박색 램프 하나로 알린다.**

The site is one scoreboard. The navy ground is the board switched off. Everything the site says stands on a square panel that lifts one tone off the ground, and panels join with a 2px seam like the modules of a real board. Light is the only emphasis: a thing is lit, dim, muted or off, and the one decided or current thing in a group is inverted. Numbers the board announces are drawn as real seven-segment displays, with their unlit bars still faintly there. Nothing flies across the screen; things switch on.

Two things never change: the golden ratio behind every measure, and the navy `#081C3D`.

## Philosophy

YPL is the league's official record, read on a phone at the venue between matches. So the site behaves like the board in a stadium, not like a club homepage.

- **It reports, it does not decorate.** Every figure on a screen is read from data: the days to the next event, the reigning champion, the counts, the season's top three, the past champions. Where there is no fact the board stays dark; it never fills the space with an illustration or a claim.
- **What is happening now comes first.** The home opens on the next event as a countdown, then the champion, then the league in numbers, then time runs down the page: the season, the notices, the past champions. On event day the same place shows the start time and the live match.
- **Emphasis is light, not colour.** One hue, navy. A thing is lit, dim, muted or off, the one decided or current thing inverts, and the only other colour is an amber lamp that means live. A visitor learns the board in one visit because it never says one thing two ways.
- **Hardware, not graphics.** Square panels joined by a seam, numbers in real seven-segment cells with their dark bars showing, a lamp housing that stays even when it is off. Nothing is rounded, shadowed, blurred or glowing, because a board is none of those.
- **It switches on; it does not fly.** Things arrive by lighting and rising the last 12 into place, and nothing that is lit moves again. Motion is there so the site feels finished, never to perform.
- **One ratio decides.** Space, type, heights, splits and time all come from phi, so no value is chosen by eye and every screen, the admin included, is the same board.

## Where the law lives

This file is the law. `src/styles/tokens.css` holds its numbers, `src/components/common/Board.jsx` and `src/styles/board.css` its shared parts (rows, counters, a Pokémon on its floor, fields, choices, tabs, chips, the dock, toasts), and `tests/designLaw.test.mjs` checks every measurable rule on every stylesheet and inline style. A new screen is built from those parts. A change to the law goes here first, then into the code; history is in git, not here.

## Principles

| Principle | Why | So we do not |
|---|---|---|
| Light is the only emphasis | A scoreboard has one colour and says everything with light | Colour text to stress it, or add a second hue for status |
| Facts replace decoration | Records are why the site exists | Add illustrations, empty badges or typed numbers; every figure is read from data |
| One panel, one seam | Real boards are modules | Frame, round, shadow or float a surface |
| Numbers the board announces are segments | It is what makes it a board | Draw a reading number (a table cell, a date in a line) in segments, or draw segments under 32 |
| Things switch on, they do not fly | A board lights; it never moves its lamps | Slide pages, bounce cards or move what is already lit |
| The venue phone is the measure | It is the main scene | Hide function behind hover, or go under 44 to touch |

## How the law is written

A law is one of three kinds, and each kind lives in one place.

| Kind | When | Where it lives | Checked by |
|---|---|---|---|
| **A number** | a value the eye compares across the site | a token in `tokens.css`, written once in The golden law | `tests/designLaw.test.mjs` |
| **A measure on the screen** | ink to ink, ink to edge, a Pokémon's feet on its floor | The eye, as a distance and a tolerance | the browser at 390 and 1440, never the CSS alone |
| **A principle** | a choice of meaning: what lights, what inverts, which lamp, the voice | words with examples, no figure of its own | review against this file |

A number is written once; other chapters name the token and its job. History goes in git, not here.

## The golden law

**One ratio, phi (1.618).** No measure is picked by eye.

| Measure | Law | Values |
|---|---|---|
| Seam | the one gap between panels | 2 |
| Space | 4 times a Fibonacci number | 4, 8, 12, 20, 32, 52, 84 |
| Type | four sizes, each line on the 4 grid | 12/16, 15/20, 20/28, 32/40; reading paragraphs 15/24 |
| Segment display | the height of a digit cell | 32, 40, 84 (a four-cell clock), 120 (phone hero), 240 (desktop hero) |
| Segment cell | width is height over phi | 1 to 1.618 |
| Height | a strip, the touch floor, a row, a two-line row, a counter | 32, 44, 52, 64, 84 |
| Split | 1.618 to 1 | the champion panel's text and picture (132 to 216), the desktop columns (709 and 439 in 1200), a counter to a row (84 to 52) |
| Time | each verb about 1.618 times the last | 100, 160, 260, 420 |
| Stagger | 100 by 1/phi and 1/phi squared | 62 between displays, 38 between rows |
| Press | 1 minus 1/phi to the 8th | .976 |
| Unlit bar | a faint step of light | 8% in dark, 6% in light |
| Floor | a quarter of a picture cell, or the line of words under it | 24% |

Outside the law on purpose: the 44 a finger needs; the 2px seam and the 1 and 2px lines; the icon grid of 16, 20 and 24; the Wing Y's own proportion; navy `#081C3D`; the content width and breakpoints, which sit where content breaks.

## Hierarchy

**Everything on a screen stands on one of six tiers, and a tier is one look.** The tiers are the board's order of importance; the golden law gives their numbers. A thing takes the look of its tier and nothing else, so the eye ranks a screen without reading it.

| Tier | What stands there | Look | Tag |
|---|---|---|---|
| 0 Announcement | what the board announces: the countdown, a clock, a score, a counter, a lead panel's date, a seal's generation, 404 | a seven-segment display (120 or 240 hero, 84, 40, 32), never type | none: a picture with its value as text |
| 1 Page | the page's title | 32/40, 700, lit | `h1`, one a page |
| 2 Section | a section's or a sheet's title; the one name a panel exists for (a lead notice, the current champion, a placing's winner) | 20/28, 700, lit | `h2` for a section, `h3` for a sheet, none for a name in a panel |
| 3 Row | a row's title, a name in a list, a button's word, a field's value, a tab | 15/20, 700 (titles, buttons) or 600 (fields, tabs) | `h4` only for a panel's own title |
| 4 Reading | a body, an explanation | 15/24, 400 | `p` |
| 5 Label | a label, a grey line, a unit, a hint | 12/16 (15/20 on desktop), 600 a label, 400 a grey line, dim | never a heading: a label over a control is its label |

- **One tier, one look.** No fifth size, no colour, no weight outside the tier's. A tier's size is never borrowed to lift something: emphasis inside a tier is light (lit, then dim, then muted) and, for the one decided, current or chosen thing of a group, inversion.
- **Two exceptions, both named.** A page led by a display (the home, 404) has its display as tier 0 and its `h1` as the display's caption, 20 on a phone and 32 on desktop. The decided record's one name, the reigning champion on the hall's seal and a bracket's winner in its 우승 panel, stands at 32: the record exists for it.
- **When two things of one tier meet,** the page's order ranks them (what is happening now first, then the record, then the archive), and then their light; never a size between the tiers.
- **Actions have three tiers** and only three: the main action (an inverted 52 panel, → when it goes on, ✓ when it commits; one a screen and one a sheet), the second action (a panel, 52, or 44 in a row of small actions), the link (an underlined word). A sheet's or dialog's confirm is its main action; a destructive confirm is the main action too, its sentence says what it destroys. Beside a back action the main action stands last and larger, 1.618 to 1.
- **Surfaces have four tiers:** the ground, a panel, the panel's next step (`--panel-2`, and `--rule` for a step on a sheet or a panel), and the inverted panel. A surface is never more than one step above what holds it.
- `tests/designLaw.test.mjs` holds the tags and the actions to their tiers: an `h1` is 32, an `h2` and an `h3` are 20 (the named exceptions excepted), and a button is main, second or link.

## Space

| Space | For |
|---|---|
| 2 | between panels, always |
| 4 | a label and its value; a title and its grey line |
| 8 | a field label to its field; inside a control |
| 12 | a section title to its content; a panel's padding; a counter's label to its digits |
| 20 | the phone's gutter; between blocks in one section; a field to the next |
| 32 | between groups; a page title under the bar; the desktop panel padding |
| 52 | between sections; the desktop column gap |
| 84 | between chapters on desktop |

Outside beats inside by one step, and a container's padding is never smaller than the gap between its children. Desktop content is 1200 wide. A page with two kinds of thing splits it in two columns, 709 and 439, with 52 between them (the home; the team builder's list 439 and editor 709, with its rules on the same lines); both columns share their heading lines and their last line. A page of one list or one kind of panel (공지, 기록, 칭호, 명예의 전당, 게시판, 소개) uses the whole 1200, so its head's right end and every row end on the bar's right edge, a short bracket tree included. No page leaves a column empty; a form that is a whole page (making a bracket) uses the 1200 like a list page, its actions in the 439 at the right end.

Between a phone and the desktop (640 to 859: a tablet, a phone on its side) the phone's board stands as one 576 column on the ground, and the bars' contents, the docked action, its toast and the sheets stand on the same two lines; the tab bar still spans the window.

## Colour and light

Two layers in `tokens.css`: primitives and semantic tokens. Components read semantic tokens only.

| Token | Job | Dark (default) | Light |
|---|---|---|---|
| `--ground` | the board, switched off | `#081C3D` | `#FFFFFF` |
| `--panel` | every surface that holds something | `#0E2449` | `#E8ECF2` |
| `--panel-2` | one step up: a hover, a track, a tag, a field inside a panel | `#12294F` | `#DDE2EA` |
| `--rule` | a hairline, and the step up on a sheet or on `--panel-2` | `#1D365F` | `#CED5E0` |
| `--lit` | lit: titles, names, figures, the main action's fill | `#FFFFFF` | `#081C3D` |
| `--dim` | dim: labels, grey lines, units | `#A8B8D3` | `#46536C` |
| `--mute` | muted: a loser, a waiting slot, a placeholder, rank numbers | `#8196B9` | `#56637A` |
| `--signal` | the amber lamp: live, and nothing else | `#FFB21A` | `#B36F00` |
| `--off` | the opacity of an unlit segment bar | .08 | .06 |

- **One hue, navy.** In light the words are navy, not black: the whole site is one colour on one ground. Pokémon type colours are content and stay as drawn.
- **A type is one tag everywhere**, a Pokémon's or a move's alike, on the page and in the saved image: a square tag 24 tall on `--panel-2` (the ground where it stands on a surface already one tone up), an 8 square in the type's colour, then the name at 12/600. Square and on whole pixels, never slanted, so every tag draws alike.
- **Solid only.** No gradient, sheen, glow, soft light, blur or grain. Colour never comes from opacity, with three exceptions: an unlit segment bar, a disabled control, and the veil behind a sheet.
- **Amber is a lamp, never a word.** It marks what is happening now: today's event, a live match, a private bracket in progress. The words beside it are lit.
- **Status has no hue.** Done, waiting, error and success read through words, the lamp, inversion and the `!` square, never through a colour.
- **Dark is the first visit.** A chosen theme is stored and set before the first paint. The theme button shows the other mode: a sun in dark, a moon in light.

Contrast, computed from the tokens (AA text is 4.5, a lamp 3):

| | On ground | On panel | On panel-2 |
|---|---|---|---|
| lit, dark | 16.9 | 15.4 | 14.4 |
| dim, dark | 8.4 | 7.7 | 7.2 |
| mute, dark | 5.6 | 5.1 | 4.8 |
| lamp, dark | 9.4 | 8.5 | 8.0 |
| lit, light | 16.9 | 14.2 | 13.0 |
| dim, light | 7.7 | 6.5 | 5.9 |
| mute, light | 6.1 | 5.1 | 4.7 |
| lamp, light | 4.0 | 3.4 | 3.1 |

## Light: the five states of anything

| State | How it looks | Examples |
|---|---|---|
| Lit | `--lit` on a panel | a title, a name, a score |
| Dim | `--dim` | a label, a date, a unit |
| Muted | `--mute` | the loser of a match, a waiting slot, a placeholder |
| Off | the panel alone, or unlit segment bars | a counter while loading, an unplayed score |
| Inverted | the panel turns `--lit`, its words turn `--ground` | the winner's row, the record holder, the current champion, the chosen option, the main action, a toast |

**Inverted means decided, current or chosen.** One thing inverts in a group. Nothing inverts for decoration.

## Seven-segment displays

**The board announces, the type reads.** Days left, a start time, a match score, the counters (대회, 트레이너, 시즌, 신청, 파티 제출), the calculator's damage range and base speed, the points of a ranking's top three, the date of a lead panel (10 월 28 일, two displays with their units in type), the first event on 소개 (2023 년 05 월, the same way), a season's number of events in the records, and 404 are seven-segment displays. Everything read in a line (a date, a rank in a table, a number in a sentence, points in a list) is Albert Sans with tabular digits.

- **A cell is real.** Seven bars, each a hexagon mitred at 45 degrees, standing a hair apart. Width is height over phi, a bar is .16 of the width thick, cells stand .32 of the width apart. Unlit bars stay at `--off`, so the cell reads as hardware, not as a font.
- **A display has a fixed number of cells.** A total leaves its unused leading cells dark (71 in a two-cell counter, 6 shows a dark cell before it). A countdown lights its leading zero, like a stadium clock (05). A clock is four cells and two dot cells (13:00). An unplayed score is one dark cell.
- **Never under 32.** Below that the bars close up; use type.
- **Whole numbers only.** A decimal point lit in segments reads as a digit. The calculator shows 68 ~ 81 on the board and 68.4% ~ 81.0% in type under it.
- **Its unit is type,** 20 or 15, on the display's baseline: 05 일, 23 / 32.
- **The unit's colour is lit or dim**, never amber.

## Lamps

An 8px square. Two kinds and no others.

| Lamp | Means | Where |
|---|---|---|
| Lit (`--lit`) | new, or next | a new notice at the end of its row beside 새 글, 다음 대회까지, 파티 제출까지, a submitted party, the current submission |
| Amber (`--signal`) | live now | 신청 접수 중 (an event taking applications), a deadline on its last day (파티 제출 마감까지), 오늘 대회 진행 중 and the bar's fixture on event day, the live match (beside its score), a running private bracket |
| Unlit (`--panel-2`) | the lamp's housing | the bar's fixture when nothing is live |

**The lamp is a fixture of the board.** The top bar keeps an 8px housing just left of the theme button: dark while nothing is live, so a first visitor learns where the board lights. On event day it lights amber with 진행 중 beside it and opens the bracket; the bracket tab (and the desktop word 대진표) carries the same lamp, and every page but the home and the bracket opens with an inverted 44 strip: the lamp, the event's name with 진행 중, and 대진표 → at the right.

A lamp never blinks and never moves. It is a word's companion, not a replacement: it always stands beside a word that says the same thing.

## Panels

1. **Every surface is a square panel.** No radius anywhere, no border, no outline, no shadow.
2. **Panels join by the seam.** Two panels side by side or stacked stand 2 apart, and a list is a stack of rows with that seam, each row one step above what holds it. The seam is the ground showing through. No line is drawn between rows or inside a panel: a hairline edges only the bars, the docked strip, a row of tabs, a sheet's top and the footer.
3. **A panel holds one thing and is a door.** Pressing it goes where its fact lives.
4. **A section is a title and a stack.** The title (20) and its link stand 12 above the stack; the link is a 12px underlined word on the right.
5. **Rows have fixed heights.** 52 for one line, 64 for a title and a grey line, 44 for a key and value inside a spec, 32 for a match's head strip.
6. **The record holder inverts.** The first row of a ranking, the current champion's row, a winner's row.
7. **Golden splits.** A panel divided in two divides 1.618 to 1, never in half unless the two are equal (two players, two choices).

## Where a Pokémon stands

**A Pokémon always stands in a panel with its feet on a floor.** It never floats on the ground and never gets a box of its own colour.

- The floor is a place, not a paint: nothing is drawn under a Pokémon. Where a name stands under the picture, that line of words is the floor; where none does, the floor shrinks to 4 and the picture takes the cell. Only a chosen member's name band lights (inverted).
- The picture's feet touch the floor's top edge, measured on the picture's ink (`inkCentre.js` reads each sprite's alpha once), not on its box. Transparent margins differ by sprite, so a box alignment leaves some floating.
- On the home, the current champion and the text that names it share one panel, read like a counter: 현 챔피언 at the top left, and standing on the floor beside the Pokémon the generation lit in segments at 40 with 대 (as the line score lights it), the name and the season, "파티 보기" in the floor (52, 64 on desktop), the Pokémon standing on that floor at the right.
- A party of six is six cells, each with its floor; a chosen member's name band inverts. A list of parties shows the six as pictures, not as a line of names.
- Sprites are transparent; no plate, glow, outline or shadow is added behind them.

## Type

Albert Sans for Latin and digits, Freesentation for Korean, as before (unicode-range slices for Freesentation).

| Role | Size / line | Weight | For |
|---|---|---|---|
| Page title | 32/40, tracking -.02em | 700 | 기록, 공지, every detail page's title (a notice, a post, a bracket), 대진표 만들기 |
| Section and sheet title | 20/28, tracking -.01em | 700 | YPL 시즌 3 순위, 역대 챔피언, an event's name |
| Row title, button, field | 15/20 | 700 titles and buttons, 600 fields and tabs | a notice row, a name, 이번 대회 신청 |
| Reading | 15/24 | 400 | a notice body, an explanation |
| Label and grey line | 12/16 on a phone, 15/20 on desktop | 600 labels, 400 grey lines | 다음 대회까지, 6대, YPL 시즌 2 우승, units |
| Figure in a list | 15 or 20, tabular | 700 | points, ranks, base stat totals |

Desktop is read from further away, so at 860 and up the label and grey line step up to 15/20 (one change to `--t12` and `--l12`); there they part from row titles by weight and light alone, which is the board's one emphasis anyway. What matters stands bold: 700 for titles, names and figures. A title stands first; nothing small sits above a title except a page's back link and a notice's date line. A long title holds two lines and ends in an ellipsis.

**A line runs to its column.** A line of words breaks where its column ends or where its sentence ends, never earlier: no measure narrower than the column (the desktop columns, 709 and 1200, are the measure), and no hand-placed break in the site's own copy. The one exception is the home's no-event sentence, set in two lines on a phone. `tests/designLaw.test.mjs` holds both.

## Controls

| Control | Form |
|---|---|
| Main action | One per screen or sheet: an inverted panel, 52 tall, the word on the left and its mark on the right, full width on a phone: → when it goes on (opens, steps forward), ✓ when it commits (저장, 대결 확정, 기록에 반영). On a scrolling screen it docks above the tab bar on a ground strip with a hairline, so it never scrolls away. Beside a back action (취소, 이전, 나중에) the back stands first and the main action last, 1 to 1.618, in a dock as in a sheet; two forward actions keep the main action first |
| Second action | A panel button, 52 tall (44 in a row of small actions), the word centred, lit |
| Link | A 12px word, underlined 4px under, in `--dim`; 15 when it stands alone |
| Field | A 52 panel; its label 12px dim, 8 above. Focus draws a 2px `--lit` line along the bottom. The placeholder is muted and never replaces the label; where a form is too tight for labels above (a comment), each field is a cell, its label 12 over what is typed |
| Error on a field | The 2px line stays; under it an inverted 20 square with `!` and the sentence in 12px |
| Choice (a few options) | Panels in a row, 44 tall, the chosen one inverted |
| Chip (filters, counts) | 32 tall panels, 12px, the applied one inverted, the count in its word (전체 59). The target is a finger's 44: it runs 6 past the chip above and below, inside room the row keeps for it |
| Page tabs | Words 15 on a 44 line with a hairline under the row; the chosen word is 700, lit, with a 2px line under it. The line is the word's own (its `::before`, exactly the word's width), so it can never stand off the word; a change of word only slides it in from where the old line stood |
| Check | A 20 square: off is `--panel-2` (`--rule` on a panel or a sheet, one step up as everything there is), on is inverted with a check |
| Switch | 52 by 32: off is a muted square in `--panel-2`, on is inverted with the square at the right |
| Steps of a flow | A row of three panels, 44: done dim with a check, current inverted, next muted |
| Pager | Three panels joined by the seam at their own width (52, 84, 52), centred: back, the page as `1 / 2`, next. A dead end keeps its panel and mutes its chevron |

Every control has the five states: rest, press (scale .976, 100), chosen (inverted), disabled (muted, the main action drops to a panel), keyboard focus (a 2px `--lit` inset ring; on the main action, a ground ring inside a lit ring). Desktop hover lifts a panel to `--panel-2`. Nothing grows on hover.

## Icons

Drawn for this site on a 24 grid: 1.5 stroke, square caps, mitred corners, no curves where a corner will do. Sizes 16, 20, 24. The tab bar: 홈 (a house), 공지 (a page with lines), 대진표 (a bracket's arm into a box), 기록 (three bars), 더보기 (three filled 3px squares, like lamps). The theme button: a sun with eight rays, a crescent moon. Others: back, chevrons, up, down, plus, minus, close (×), check, search, bell, download, image, external, link, info, alert, lock, edit, trash, refresh, login, logout, form. An icon only says what words cannot: going back or on (← →), creating (+), leaving the site (external), closing (×). `Icon.jsx` holds them all; an unknown name draws nothing.

## Bars and navigation

- **Phone top bar:** 56, the ground tone with a hairline under it. The Wing Y (20 tall) and the wordmark, the lamp's fixture and the theme button at the right. It stands still.
- **Phone tab bar:** 64, the ground tone with a hairline on top: 홈, 공지, 대진표, 기록, 더보기. The chosen tab is lit and 700 with a 2px line along its top edge; the rest are muted.
- **Admin mode:** a 40 inverted strip directly above the tab bar on every screen: a ground lamp, 관리자 모드, and 로그아웃 at the right.
- **더보기** is a page, not a popover: grouped rows (기록: 칭호, 명예의 전당; 함께하기: 게시판, 팀 빌더, 계산기; 리그: 소개, 디스코드 참여), then the theme as a three-way choice (어둡게, 밝게, 기기 설정) and 공지 알림 as a switch. Admin login is a row here.
- **Desktop (860 and up):** a 64 top bar on the 1200 content: the brand, every page as a 15 word with a 2px line under the current one (the word's own width), each word taking the bar's height and 12 on each side for the pointer and the focus ring, the words 32 apart; the line is never under 20, so a one-letter word (홈) keeps a line centred on it, the theme button at the right end. No tab bar. Where there is no 더보기 (1100 and up), 관리자 로그인 is an underlined word at the end of the footer, not an icon in the bar.
- **Back:** a 12px dim link with a chevron, 20 under the bar, naming where it goes (← 공지).
- **Nothing is tied to the scroll.** The bars do not move; a sideways list is the browser's own scroll. On a phone a sideways row (page tabs, chips, the line score) runs on to the screen's edge, so a word cut there says the row goes on; a row of tabs keeps its hairline to the content's edge.

## Sheets, dialogs, toasts

- **A sheet** rises from the bottom over a veil of `--ground` at .72 (never black). It is a `--panel` plate with a hairline on its top edge, a 32 by 4 grip, its title at 20 and a × at the top right. Pull down or press the veil to close.
- **On a sheet every panel stands one step up** (`--panel-2`), a Pokémon's cell included, so a surface on a sheet reads as it does on the ground.
- **Every sheet is built like the party sheet:** its title and one grey line under it, then its content in one column that only scrolls down (nothing in a sheet scrolls sideways; rows of chips wrap), then its actions as planes along the bottom edge, a word action standing as a second action panel. A sheet that shows a record (a party, a trainer, a Pokémon, a champion) is as wide as the content on desktop; a form, a question or a single sample (one case) keeps 576, so no sheet stands half empty.
- **A dialog** is a panel laid on the veil, its title, a sentence saying why, then what to do. A dialog that refuses (공지를 지울 수 없습니다) lists what blocks it as rows.
- **A toast** is an inverted panel, 52, above the docked action or the tab bar, with its one action as an underlined word (되돌리기, 다시 시도). An error toast starts with the `!` square.
- **Confirm by undo.** Where an action can be undone (saving a result, moving a seed), it acts at once and offers 되돌리기, rather than asking first. A delete that cannot be undone still asks.

## Motion

**A board switches on; it does not fly.** Four verbs, all transform and opacity on a picture already drawn. The site is meant to feel finished, not still: what arrives rises the last 12 into its place as it lights, and everything a pointer can press answers it.

| Verb | When | Length | Curve |
|---|---|---|---|
| press | a finger comes down: scale .976 | 100 | ease-out |
| tone | a state changes: a panel's tone, a lamp, inversion, a cell flashing once | 160 | ease-out |
| leave | a sheet or toast goes, a page's old content goes | 260 | ease-in |
| light | things arrive by lighting: panels, then bars and words, then pictures | 420 in all | ease-out |

- **First open:** the ground, the bars and every unlit segment are in the HTML's first paint, so there is no loading screen and no white frame. Panels, page titles and section heads come on top to bottom, 38 apart (the stagger stops growing at 260), each rising 12 into place over 420; then segment bars light, 62 apart per display; pictures come last. On a return nothing replays. A returning visitor's board opens on the facts it last read (the last `site_data` kept in the browser) and lights as on first open; when the new read differs, the changed facts switch at once, as a score does, and nothing replays. A first visit, or one whose kept copy is gone, waits for the read as before; on the home the reign (the champion panel and its six) and the league's counters are one block and light together, the champion waiting at most a second for the counters while its picture is fetched.
- **Below the first screen:** a panel waits dark and lights, rising the same 12, the first time it nears the view (a screen's fifth before it arrives, so a reader does not meet dark panels), top to bottom. A grey line under a stack lights with the stack. It happens once; nothing is tied to the scroll after that.
- **A unit lights with its digits.** 일 beside the countdown is a word of the display and comes on with its lit bars, never before them.
- **A picture that arrives late** (a sprite still loading when its panel lit) comes on by tone when it has loaded, so no picture pops in.
- **Page change:** the moment a page is pressed, the line under the top bar's words slides to it and the page being left dims; if the next page takes longer than 260 (its code, its data), the busy cell stands over it. The new page then lights as on first open. Back does not replay: the page stands where it was left. The bars never move.
- **The sliding line:** the 2px line under the chosen word of a row of words (the top bar's pages, page tabs) is one line that slides to the chosen word over 420. The first placing does not move.
- **The pointer:** a door lifts one tone; a Pokémon in a door steps 4 up off its floor; an arrow leans 4 toward where it goes (back leans back); a link's word brightens. All by transform or colour over 160. Nothing grows.
- **A score changes:** the bars of the changed digit switch at once, as hardware does, and that cell brightens once (tone). Nothing rolls.
- **A winner is decided:** the winner's row inverts and the loser's dims (tone); the amber lamp moves to the next live match. This is the celebration; there is no burst.
- **Sheet:** the veil comes up to .72 (leave length, opacity) while the sheet rises by translateY (light length). It closes the same way, faster.
- **Busy:** one segment cell lights its six outer bars in turn around the cell, 840 a turn. A sending main action shows it in place of its word; a place that is loading shows it at its centre. Each bar is its own box, so it keeps turning on the compositor while the page under it is drawn.
- **Nothing breathes.** No opacity pulse marks a waiting thing: a slot being drawn shows the names rolling through it, and a line that waits on data keeps an unlit lamp beside its words (an error, the `!` square).
- **Loading** is the board switched off with the busy cell in it: every panel at its size, every segment unlit, no pictures and no lamps. Content lights into those panels, so nothing shifts. There is no spinner other than the cell and no loader wordmark. A long list (the builder's 359) fills the frame after its page stands.
- **Sheet on desktop:** the veil comes up while the dialog rises 12 into place over 420.
- **Reduced motion:** everything appears at once; only tone remains.
- **Theme change:** the page turns in one frame and a wash of the old ground, at .618, leaves it (leave, 260, fast at first), so it reads as a cross-fade that does not dwell in the muddy middle of navy over white; nothing is restyled frame by frame. The sun or moon turns in.
- **A control that swaps what is under it** (page tabs, filter chips, the pager) lights the new content as a page does. A switch's square slides across its track; a fold's chevron turns over 420 and its rows rise in one after another; a Pokémon that joins a team rises into its slot.

## The eye

Distances are measured on rendered ink at 390 and 1440, within 1px.

| Seen | Distance |
|---|---|
| bar to the first line of a page | 32 |
| a section title to its stack | 12 |
| between sections | 52 |
| a panel's edge to its first ink | 12 on a phone, 20 on desktop |
| a Pokémon's feet to its floor's top edge | 0 |
| a segment display's baseline to its unit's baseline | 0 |

Centring is by ink: text through the fonts' metrics (Albert Sans with its ascent override), pictures through `inkCentre.js`, except that a Pokémon is placed by its feet, not its centre.

## Layout and pages

**Home, phone.** Under the bar: the label row (a lamp, 다음 대회까지, or the amber lamp and 신청 접수 중 while the event takes applications, the date at the right), the countdown at 120 with 일, the event's name at 20 in two lines, on the event day before its start a counter 파티 제출 마감까지 with the hours left and 시간 under an amber lamp (party submission closes when the event starts; on the days before, the countdown already says it, so there is no counter; it opens the notice), the main action, then the champion panel (216, its floor 52), then three counters (대회, 트레이너, 역대 시즌; 84 tall, cells 115, 116, 115). With no event ahead the countdown stays dark, its lamp is an unlit housing, the name's place says 다음 대회 일정은 공지에 올라옵니다. and the main action is 공지 보기. Below, each section is its own module of the board, so the page has a beat: the season's ranking as a podium, the top three as three columns like the counters (the rank, the name, the points lit in segments at 40 with 점; a tie reads as equal columns, each rank named 공동 (공동 1위), a sole leader's column inverts), and the table going on with the fourth and fifth as rows, as on the records' ranking; while the ranking is read its place stands switched off, three dark columns, so nothing under it moves when it lights; the notices as a lead panel (the date as 월 and 일 displays at 32, 새 글 with its lamp, the title at 20 in two lines, a grey line) and the rest as rows; the past champions as a line score, one column a generation: the number lit at 32 on `--panel-2`, the Pokémon on its floor, the name and season, five across a phone, more scroll sideways.

**Home on event day.** The label turns amber, 오늘 대회 진행 중; the display shows the start time as a clock at 84 with 시작; the main action is 대진표 보기; 지금 경기 stands under it while a match is undecided: its stage with the amber lamp and 진행 중, the two players as rows of 52, and the round's progress (8강 진행, 2 / 4 종료). The champion stays where it is.

**Home, desktop.** Left column 709: label, countdown at 240 in the column's golden major and the event's name at 32 in the minor beside it (up to three lines, its last line on the digits' floor), the 파티 제출 마감까지 counter on the event day before the start, the main action (38.2% of the column) and 리그 소개, then 지금 경기 on event day, then the season ranking. Right column 439: the champion panel (its floor 64), the party as six cells, the counters, then notices. The past champions run the full 1200 under both. The two columns end on one line in every state: the main action stands on the column's floor when the hero is shorter, and the podium's columns or the lead notice take what is left under them.

**Notices.** The first notice of the first page (no search) is the home's lead panel; the rest are rows of 64: the title, a grey line with the date (고정 lit first when it is pinned: 고정, 10.28 수), a lamp column at the right end. A notice opens with its date line, the title at 32, two counters (대회까지, 신청 / 정원), spec rows (일시 with its start time, 형식, 방식, 단위, 신청 마감), the body, and the docked main action (참가 신청; once the closing time passes it becomes the party submission, or a muted 신청 마감). On desktop the two columns share their top line: the back link, date, title and body take 709, and the 439 beside them, from the same first line and held in view as the body scrolls, holds the counters, the spec, the main action, the links, then 다른 공지 (five rows). Body text runs to its column (709); a grid of cards in the body takes the same width. The form docks 신청. While applications are open an event notice also offers 신청 수정 as a second action: the same form, first asking for the name and the 제출 비밀번호 (docked 신청 불러오기; with no PIN yet the four digits typed become it), then the questions filled with the earlier answers, docked 수정. The name is not edited there, since it decides the player and the league.

**Party submission.** On the notice: a counter to the deadline (days and hours) and three status rows (신청, 선발전, 본선). The flow is three steps (팀 고르기, 확인, 제출): saved teams from the builder appear as panels with their six members; a team that breaks the rules is dimmed with `!` and the reason; the submitted one is recorded as a numbered submission that is never deleted, and the current one carries the lit lamp.

**Brackets.** A tree of match boxes (two rows, 36 each, the seam between) joined by lines drawn as one picture over the tree, measured from the boxes: out of each box at its middle, to the middle of its pair, on into the next box. A decided road is a 2px `--lit` line laid over the 1px `--mute` ones, square-capped so it runs unbroken from the winner's box to the next. The winner's row inverts, the loser's mutes, an unplayed slot is muted words (M3 승자). The live match carries the amber lamp beside its score. A phone shows two rounds at a time with every name whole (no seed column), and the tree stops round by round as it is swiped; on desktop a short tree runs the full 1200, its columns sharing what is left, and a long one scrolls sideways. Double elimination switches 승자조, 패자조, 그랜드 파이널. 공식 and 사설 are page tabs; 사설 explains in one panel that it never reaches the records. A list view shows matches as score panels. The list of brackets leads with its newest as a lead panel (the date as 월 and 일 displays, the name at 20, the grey line naming the winner, the amber lamp and 진행 중 while it runs); the rest are rows, their date in the tight form with the weekday 4 after it (09.13 토). The bracket's name is a page title at 32; desktop shows it with 우승 이미지 and 대진표 이미지 beside it once it is decided, a status strip while it runs (the amber lamp, 진행 중, and the round's progress such as 8강 2/4 종료), then the whole tree and a 우승 panel, 180 tall, that waits muted (결승이 끝나면 켜집니다.) and lights when the final ends with the winner's name at 32; the places (준우승, 4강) and the images follow the tree, and the result does not name the winner a second time. The leg into a box lights with the fork once both roads into it are decided.

**Records.** Page tabs 트레이너, 대회, 포켓몬, 랭킹. Counters on top (대회, 트레이너, 역대 챔피언 in 대, beside the hall's 챔피언 in 명); a ranking leads with the home's podium for its top three and the table goes on from the fourth; tables of 44 rows with the record holder inverted at 52 (under a pointer it steps to `--dim` and keeps its ground-coloured words); the events, newest first, part into chapters by season (a head with the season's name at 20 and its number of events lit at 32 with 회); an event's placings as strips joined by the seam, the place in a cell of its own (우승 inverted, 준우승 lit, 4강 dim) and the names beside it, the winner's at 20; every event opens its parties by one line that names them (입상자별 공식 파티, 팀원별 공식 파티), and parties read as six pictures; filters as chips; a trainer opens with three counters (우승, 준우승, 4강), titles as chips, recent events as rows with the result inverted when it is a win, and their most used Pokémon on floors. A Pokémon opens its sheet as a statistic, the Pokémon its subject: a 709 panel with the rank lit at 84 with 위 at the top left, the types on its floor and the Pokémon standing large at the right, four counters beside it (채용률, 등록 엔트리, 사용 트레이너, 우승 엔트리; two by two on a phone); then every share as the calculator's bar on its track in rows of 44 (the name, a move's type tag before it, the bar, the figure): its base stats and the samples' average points, the moves two columns down, 도구, 특성 and 성격 three across, the trainers who registered it. In each ranking a sole leader's row inverts.

**Titles and hall of fame.** Titles: generations as rows (the generation as a figure, the name, the season); the current holder inverts. The hall hangs one reign large and the rest on a wall: the crown, one panel with an inverted 현 챔피언 tag, the generation lit in segments at 84 with 대, the name at 32, the season and which title it is (2번째 우승), and the six large with their names (439 and 709 on desktop); then three counters (세대, 챔피언, 최다 우승 with the name); then 역대 챔피언, a wall of plates, newest first, three across on desktop, each the generation at 40, the season, the name at 20 and the six. A plate opens the champion sheet, which on desktop is as wide as the content.

**The champion sheet** is the hall's, not a record's: a reign is decided, so it opens with a seal, the sheet's one inverted panel, saying 현 챔피언 (or 명예의 전당 for a past reign) and the generation lit in segments at 84 with 대 챔피언; the title is the name and the grey line the season. A reign won after the sets were kept (the final submission's ability, item, nature, points and moves) hangs its six as plaques joined by the seam, one, two or three across: the picture on its floor and the facts split 1 to 1.618 (the name at 20, the type tags, 도구, 특성, 성격 with its arrows), and under both the four moves two by two, each one step up with its type tag under its name. The points table stays in the records' party sheet. An earlier reign keeps the six on their name bands and one muted line saying only the party was recorded. New champions get their plaques with no step by an operator. Wherever the sheet opens it ends the same way: 기록 보기 for that champion as its main action, and, opened from the home, 명예의 전당 보기 as a word under it.

**About.** The title at 32, then the league in numbers before it is explained: one wide counter 첫 대회 with the year (four cells) and the month (two cells) at 40, each followed by its unit in type (년, 월), and under it 대회 and 트레이너 as two counters side by side, doors to the records' tabs as on the home; on desktop the three stand in one row, as the home's counters do. The figures are the home's facts, so nothing new is counted. Then the paragraph and the sections (참가하는 법 first).

**Board.** Tabs 자유, 샘플, 파티; a search with 글쓰기 as the main action; rows of 64 with the comment count as words. Sample and party rows are the records' party rows: the title and its grey line, then the pictures (a party's six at the right in 64 cells on desktop; a sample's one leading its row). A sample or party post shows a team and lets people take it, so it is laid out for that, not as a notice. A party: the six large across the page with their names (each opens its settings below), the actions joined under them by the seam (팀 빌더에서 열기 as the main action, then 이미지 저장, 링크 공유, 수정, 삭제 in one row), the author's words, 포켓몬별 세팅 three across, the comments in a 709 column. A sample: its one case stands at the left (439) held in view; the actions, the words and the comments run at the right (709). Cases stand from their top edge and an empty move slot keeps a filled one's height, so every case in a row is the same length.

**Team builder.** Tabs 규정, 포켓몬 선택, 팀 구성, and a 내 팀 list. Six slots always on top. The list: a 64 picture cell centred on its row, name, type tags, the six base stats as six even columns of letter over figure (the sorted one bold), the total as the row's figure, +. The editor: the six as pictures that fill their slots, no name under them, the chosen slot inverted, spec panels, the points as bars on tracks (66 / 66), moves as four panels, a docked 현재 팀 저장 with 게시판에 올리기 beside it. Desktop: the rules as two cells in one row (레귤레이션, 파이컵 추가 룰), list 439, editor 709, the save under the editor. The list has the types as chips under its search (전체 359 first), one type at a time. The exported image uses the same panels and floors.

**Calculator.** Tabs 대미지, 스피드, 도감. Damage: two Pokémon panels (an empty one shows its + in the middle of the panel), the result as a segment range with the exact range in type, a bar on a track, and the verdict (확정 2타); then 배틀 조건 and 세부 설정 as sections. Speed: the base Pokémon's speed as a display and a line of rows (speed, picture, name, base) with the base row inverted; the opponents' modifier as a row of choices. Dex: picture, types, base stats as bars, defensive matchups as rows with the 4x row inverted.

**Admin.** Result entry: match chips (done with a check, current inverted), the match with ± around each score, 불참 처리 and 부전승, docked 저장하고 다음 경기, and an undo toast. Making a bracket: three steps (대회 설정, 참가자 확정, 대진 배치); points copied from the last event; party submitters checked first; draw, redraw, and swap two players by dragging one onto the other or pressing both (the held one inverts); 대결 확정. Recording: the placings and the points to add, previewed, then 기록에 반영 with 나중에. Notice editing: title, body, the notify check, 대회 신청 받기 as a switch with its 신청 마감 시각, the event day with its 시작 시각 (both required before saving while the event is ahead; party submission closes at that start, so there is no separate submission time), settings copied from a past event. Applicants: counters, search with CSV, chips (전체, 파티 제출, 미제출), rows with the submission lamp and their time on one line; 비밀번호 초기화 stands on every row, since the PIN is set by a first party submission or a first 신청 수정. A title's holders are picked: the known names (the records' trainers, for a partner the Pokémon) are offered as one types, and each chosen name is a chip with ×.

**Errors and empty.** An error is the `!` square and a sentence, then one way out (다시 시도). A connection drop keeps the board switched off with a toast. An empty search shows a dark 0 display and two sentences. 404 lights 404 on the board with 홈으로 and two shortcuts.

**Footer.** On the ground under a hairline: the brand at 24, the league's line, 디스코드 참여, and the fan-site notice in 12px muted type.

## Head and share surfaces

- **Tab icon:** the Wing Y alone, 64 wide on a transparent ground, no tile. `favicon-*.svg` is navy on a light browser and white on a dark one; `favicon-32.png` and `favicon.ico` are the fallbacks. The YPL letters are not used at tab size: at 16 they are about 5px tall and cannot be read.
- **App icons:** a navy square with the white Wing Y inside the maskable safe zone, because a home screen fills transparency with black.
- **Share image:** 1200 by 630, the navy ground and the brand alone, the mark and the wordmark centred by their ink. No sentence, no counters, no Pokémon: nothing on it can go out of date.
- **theme-color:** navy in both themes. A changed picture takes a new file name, because browsers keep icons.

## Logo

The Wing Y (`public/brand/ypl-wing-y.svg`) and the slanted solid wordmark (`public/brand/ypl-wordmark.svg`) are used as drawn, never redrawn, never animated, in the colour they stand on. On the phone bar the Wing Y is 20 tall beside the wordmark, 8 apart.

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
| Status labels | Short noun phrase | 진행 중, 종료, 대기 |
| Field hints | 예: and a real value | 예: 37회 파이컵 |

**Labels.** One form: a noun. Sino-Korean verbs lose 하기 (저장, 신청, 등록, 수정); native verbs keep 기 (보기, 만들기, 올리기, 내려받기). Object first (대진표 만들기). One action has one name on every screen. No `+` before a label in text, no 하세요 on a button.

**Punctuation.** No exclamation marks. A sentence ends with a period wherever it stands; a label takes none. Ellipsis is `…`, only on visible progress text and a field prompt. Quotes are curly. **No middle dot**: a list takes commas. No em dash in a sentence. A range in prose takes an en dash; the calculator's damage range is the one tilde, because it is a figure, not prose. Arrows only beside a stat (S↑ C↓) and as the → of an action.

**Numbers, dates, time.** Dates through `formatDate` (11월 7일 (토)); in a tight row digits and dots (10.28) with the weekday dim beside them; time 오후 3:05 in reading text and 13:00 on a clock display. Number and unit with no space (32명, 6대).

**English.** Names only. YPL, Yonsei Pokémon League, Pokémon with its accent. 디스코드 in running Korean. No all-caps labels. No emoji.

**Errors.** What did not happen, then what to do. Never a bare noun (저장 실패), never an error code or a technical word for a visitor.

**Page titles.** `페이지명 | YPL`; the home is `YPL | Yonsei Pokémon League`.

**Don't.** Claims with no fact behind them, pushing, invitations to a feeling, and 당신.

## Accessibility

- **AA** in both themes for all text; the lamp at 3 or more.
- **Never light alone.** A lamp stands beside a word; a winner reads by inversion and the word 승자 or the result; an error by the `!` square and a sentence.
- **Touch:** 44 by 44 at least on a phone; rows and fields are 52.
- **Keyboard:** everything by key, in reading order, with the one focus ring. Sheets lock what is behind them with `inert`. The first stop is 본문으로 건너뛰기.
- **Segments are pictures of numbers.** Each display carries its value as text for assistive technology (`aria-label="5일"`), and the unlit bars are hidden from it.
- **Reduced motion:** see Motion.

## Don't

- Do not round, frame, outline or shadow a surface. Join panels with the seam.
- Do not add a hue. Amber is the one lamp; status reads through light and words.
- Do not draw a reading number in segments, segments under 32, or a decimal point in segments.
- Do not give a Pokémon a box of its own or let it float: it stands on a floor in a panel.
- Do not blur, glow, gradient, sheen or grain anything.
- Do not move what is lit: no sliding pages, no rolling digits, no bouncing cards. What arrives may rise 12 as it lights, and a pointer may nudge a picture or an arrow 4; nothing else travels.
- Do not animate a shadow, filter, clip, mask or background; move transform and opacity on a picture already drawn.
- Do not use View Transitions snapshots or copy the page for a transition.
- Do not put a small label above a title, or repeat one fact twice on a screen.
- Do not change data behaviour from a visual change.

## Open

Measured in the browser but not yet on a real phone at the venue: the strength of the unlit bars (8% and 6%), the 44 touch floor on the bracket's 36 rows (the whole match box is the target), and each sprite's feet on its floor.
