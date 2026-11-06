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
- **Actions have three tiers** and only three: the main action (an inverted 52 panel, → after the word when it goes on, ✓ after it when it commits, + before it when it creates; one a screen and one a sheet), the second action (a panel, 52, or 44 in a row of small actions), the link (an underlined word). A sheet's or dialog's confirm is its main action; a destructive confirm is the main action too, its sentence says what it destroys. Beside a back action the main action stands last and larger, 1.618 to 1.
- **Surfaces have four tiers:** the ground, a panel, the panel's next step (`--panel-2`, and `--rule` for a step on a sheet or a panel), and the inverted panel. A surface is never more than one step above what holds it.
- `tests/designLaw.test.mjs` holds the tags and the actions to their tiers: an `h1` is 32, an `h2` and an `h3` are 20 (the named exceptions excepted), and a button is main, second or link.

## Composing a screen

**The numbers make a screen correct; these make it right.** Each rule below was found the same way: a built screen was called wrong in the owner's words (quoted, so the failure is recognised when it comes back), and the screen that fixed it was approved. They bind every screen, the admin and the battle's page parts included. Before a new or changed screen is shown, check it against every rule here at 390 and 1440, in both themes, and by using it (submit the form, play the battle), not only by a still. A screen that passes `tests/designLaw.test.mjs` but breaks one of these is not done.

**What the eye meets first**

1. **Size follows use.** What is read or pressed most stands first and largest; what is read once stands smaller and later. A container is the size of what it holds: a name does not get a panel built for a picture (the battle matchup went from 84 to 64), and the party a player needs is never cut while the opponent's stands large. Failure: "커야 할 요소는 작고, 작아야 할 요소는 크고", "많이 쓰는 건 크고 잘 보이는 곳에".
2. **The subject is the hero.** A screen about a Pokémon stands the Pokémon large on its floor with its figures beside it (the records' Pokémon sheet); a party is six pictures; a match is two sides facing across VS. A picture shrunk beside a list of words fails: "포켓몬도 주인공처럼 보이지 않고 그냥 이미지 하나".
3. **Show it, do not list it.** A count is a counter, a share is a bar on its track, a type or a league is its tag, a party is its pictures, a matchup is a board of cells. Lines of label and value are the last resort, never the design. Where the data has colour (types), the colour is used, because it is content. Failure: "단순 텍스트의 나열", "너무 단조롭다", "다채로움도 없고".
4. **The fact a visitor came for is found without reading.** The deadline, the rule that decides their league, their own result stand where the eye lands: spec rows under the title, or the 439 held in view on desktop. Failure: "중요한 내용은 눈에 들어오지도 않아".

**Everything hangs from something**

5. **No word floats.** Every word, figure and picture belongs to a panel, a cell, a row or a band, at that container's edge or centre. A label left in open space between two blocks is moved into the cell it names (the type boards: each type a cell of the head column, each count in its own cell, so the board has no gap). Failure: "붕 떠 있다", "우연히 텍스트가 저기 있는 느낌", "어쩌다가 저기 있는 느낌".
6. **No dead space, no crowding.** Every gap is the step of Space for the relation it shows. A band that separates nothing, two separate things touching, or one gap wider than its siblings is a bug, most often an empty element still keeping its margin (the empty console that doubled the gap above 기권). Measure it. Failure: "의미 없는 빈 공간", "너무 꽉 끼여서", "너무 붙어 있다", "다닥다닥", "공백이 다른 것들에 비해 엄청 넓어져서".
7. **Nothing touches an edge it does not belong to.** A check, a label or a picture keeps its panel's padding on every width; a layout that is right on a phone is checked again on desktop. Failure: "체크박스가 너무 왼쪽에 딱 붙어 있어서".
8. **Centred is measured.** A popup, a banner, a plate, a word on a key is centred by its ink (The eye), never assumed from the CSS. Failure: "승리 팝업이 중앙에 정렬되지 않아".
9. **Lines meet across columns.** Two columns share their top line and their last; keys in a row of panels stand on one line (link requests two across, their keys aligned).
10. **A screen uses its window, and wastes none of it.** Desktop fills its law (the 1200, the battle the whole window); a phone shows what is needed without scrolling past empty or oversized parts. Failure: "화면 낭비가 너무 심해", "창을 가득 채우지 않는".

**One kind, one look, everywhere**

11. **Fix the family, not the one.** When one element of a kind is wrong, every element of that kind across the site is found and fixed with it: one box with every box and popup, one type cell with every type cell, one Pokémon cell's tone with every cell, one chosen panel with every chosen panel, one way in with every way out. The owner never meets the same mistake twice. Failure: "게시판의 글 사각형만 묘하게 다른", "키키링의 배경 네모만 묘하게 색이 다르지 않아?".
12. **Same role, same size, same lines.** A pair of keys has one type size; tags in one list break alike (every type on one line); cells of one grid are one size whatever they hold. Failure: "승인과 거절 글자 크기도 다르고", "어떤 것은 타입이 두 줄로, 어떤 것은 한 줄로", "타입별로 네모 크기가 다른".
13. **An inverted panel inverts what is in it.** What stands on a chosen (lit) panel stands on its lit tone: a picture's cell turns transparent, a tag steps to the ground. No island of the old tone is left inside it. Failure: "흰색으로 바뀌는데 포켓몬 배경은 남색이라 부자연스러워".
14. **Motion comes in pairs, and moments get scenes.** Whatever has an entrance has the matching exit (going back lights as going in does; a sheet closes as it opened), and no change of screen is a cut. A moment that matters (going into a battle, the leads thrown) is a scene of its own. Failure: "나갈 때는 창만 뚝하고 전환", "아무 애니메이션 없이 창만 변화", "두근두근함과 웅장함이 하나도 없어".

**Nothing without a reason**

15. **Every mark answers "what is this?"** A line, a square, a band or a block that a visitor cannot name a use for goes. Leftovers count: a light line on a box's top edge, a hairline showing under a sheet on a phone, an engine credit in a prominent place. Failure: "이상한 검은 줄이 있어. 무슨 용도로 만들었는지 모르겠네", "화살표 옆의 네모 세 개는 뭐야?", "뜬금 없는 자리에 뜬금 없이 존재감".
16. **Demote, do not delete.** A useful feature that is not the point (the replay keys, the whole log, the engine credit) moves back and down and quiets; it stays. "완전히 없애지는 마. 눈에 안 띄게만."
17. **Explain in the flow, never in a popup.** A feature is met where its need arises and says what it does in its own line: the account key leads to 내 기록 찾기 inside the records, a Google sign-in carries Google's G, the operators' login stands with the footer's other links. No explaining modal and no hidden entry. Failure: "너무 숨어 있고 안내도 없고", "눈에 너무 안 띄는데", "팝업을 띄워서 구구절절 설명하는 건 반대".
18. **A decision about someone else asks once.** Approving, rejecting and a delete that cannot be undone each confirm once; what can be undone acts at once and offers 되돌리기 (Sheets).

**Judgement, and what was approved**

19. **The best form for each element, not one rule for all.** The law gives the parts; choosing among them is judgement (planes hold, lines operate). A screen called wrong is redesigned from what people do on it, not restyled: "완전히 새롭게", "BRAND NEW".
20. **What was approved is the precedent.** Before inventing, reuse the forms that were approved after being called wrong: the one name a panel exists for at 20 with its facts as spec rows or a grey line under it; one panel for one thing; two decisions joined on the seam at 1 to 1.618, the back one first (the link requests, the confirm dialog); fields 20 apart and sections 52; on desktop a form laid out as its notice, the form in 709 and the facts with the action in the 439 held in view; a record as counters, then bars on tracks (the Pokémon sheet); a status or a league as the type's tag; a team as six pictures on floors.
21. **Both themes are one job.** A fix made in one theme is made and checked in the other in the same change. "당연히 다크모드도 고쳐야지."

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
- **A type is one tag everywhere**, a Pokémon's or a move's alike, on the page and in the saved image: a square tag 24 tall on `--panel-2` (the ground where it stands on a surface already one tone up), an 8 square in the type's colour, then the name at 12/600. Square and on whole pixels, never slanted, so every tag draws alike. A trainer's league is the same tag after the name in the records' trainer list (added 2026-11-06): 마스터 with its square lit, 루키 with its square muted and its word dim; on the inverted row the tag steps down to the ground.
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

- The floor is a place, not a paint: nothing is drawn under a Pokémon. The battle stage alone mirrors a Pokémon in its polished floor (Battle, The stage). Where a name stands under the picture, that line of words is the floor; where none does, the floor shrinks to 4 and the picture takes the cell. Only a chosen member's name band lights (inverted).
- The picture's feet touch the floor's top edge, measured on the picture's ink (`inkCentre.js` reads each sprite's alpha once), not on its box. Transparent margins differ by sprite, so a box alignment leaves some floating.
- On the home, the current champion and the text that names it share one panel, read like a counter: 현 챔피언 at the top left, and standing on the floor beside the Pokémon the generation lit in segments at 40 with 대 (as the line score lights it), the name and the season, "파티 보기" in the floor (52, 64 on desktop), the Pokémon standing on that floor at the right.
- A party of six is six cells, each with its floor; a chosen member's name band inverts. A list of parties shows the six as pictures, not as a line of names.
- Sprites are transparent; no plate, glow, outline or shadow is added behind them. The battle stage's floor reflection is the one picture under a sprite, and only there.

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
| Main action | One per screen or sheet: an inverted panel, 52 tall, the word on the left and its mark on the right, full width on a phone: → when it goes on (opens, steps forward), ✓ when it commits (저장, 대결 확정, 기록에 반영, 신청). An action that creates (글쓰기, 샘플 올리기, 파티 올리기, 새 팀, 새 사설 대진표) puts its + before the word instead, the two standing together at the left (+ 글쓰기); beside a search it keeps its own width at the row's right end (2026-11-06, the owner kept this form over the word first). On a scrolling screen it docks above the tab bar on a ground strip with a hairline, so it never scrolls away. Beside a back action (취소, 이전, 나중에) the back stands first and the main action last, 1 to 1.618, in a dock as in a sheet; two forward actions keep the main action first |
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

- **Phone top bar:** 56, the ground tone with a hairline under it. The Wing Y (20 tall) and the wordmark, then at the right the Google account word, the lamp's fixture and the theme button. It stands still.
- **The account word** (added 2026-11-06, docs/db/player_accounts.sql): Google's G (20 square) and one word at 15/600 before the lamp, on every width. The account exists to hold one's own record, so the word says that (2026-11-06: 구글 로그인 did not say why it was there): signed out it is 내 기록 and opens the records' trainer list on 내 기록 찾기, where Google sign-in is offered in the flow; signed in it is the account's trainer name (내 기록 until one is linked) and opens that trainer's sheet, which holds 로그아웃. It is a word, not an avatar, and it shows only where Supabase is configured. The G is Google's own four-colour mark (public/brand/google-g.svg), the one picture besides Pokémon that keeps colours of its own, because Google's brand rules forbid recolouring it; it stands before the words of every Google sign-in, the bar's and the 구글 로그인 buttons on the form and the trainer sheet, and nowhere else.
- **Phone tab bar:** 64, the ground tone with a hairline on top: 홈, 공지, 대진표, 기록, 더보기. The chosen tab is lit and 700 with a 2px line along its top edge; the rest are muted.
- **Admin mode:** a 40 inverted strip directly above the tab bar on every screen: a ground lamp, 관리자 모드, and 로그아웃 at the right.
- **더보기** is a page, not a popover: grouped rows (기록: 칭호, 명예의 전당; 함께하기: 게시판, 팀 빌더, 배틀, 계산기; 리그: 소개, 디스코드 참여), then the theme as a three-way choice (어둡게, 밝게, 기기 설정) and 공지 알림 as a switch. Admin login is a row here. On desktop the page uses the 1200 as a page of two kinds: the groups in the 709, the settings and the login in the 439.
- **Desktop (860 and up):** a 64 top bar on the 1200 content: the brand, every page as a 15 word with a 2px line under the current one (the word's own width), each word taking the bar's height and 12 on each side for the pointer and the focus ring, the words 32 apart; the line is never under 20, so a one-letter word (홈) keeps a line centred on it, the account word and the theme button at the right end. No tab bar. 관리자 로그인 stands in the footer's first line at every width (and as a row on 더보기), not as an icon in the bar.
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

**A board switches on; it does not fly.** Four verbs, all transform and opacity on a picture already drawn. The battle stage moves by its own rules (Battle) and is the only place outside them. The site is meant to feel finished, not still: what arrives rises the last 12 into its place as it lights, and everything a pointer can press answers it.

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
- **Page change:** the moment a page is pressed, the line under the top bar's words slides to it and the page being left dims; if the next page takes longer than 260 (its code, its data), the busy cell stands over it. The new page then lights as on first open. Going back is the same motion (2026-11-06: a back that only swapped the page read as a cut): the page returned to lights where it was left, from the first line in view. A page within a page (a notice, a post, a bracket, a form, making a bracket) goes in and comes out the same way. The bars never move.
- **The sliding line:** the 2px line under the chosen word of a row of words (the top bar's pages, page tabs) is one line that slides to the chosen word over 420. The first placing does not move.
- **The pointer:** a door lifts one tone; a Pokémon in a door steps 4 up off its floor; an arrow leans 4 toward where it goes (back leans back); a link's word brightens. All by transform or colour over 160. Nothing grows.
- **A score changes:** the bars of the changed digit switch at once, as hardware does, and that cell brightens once (tone). Nothing rolls.
- **A winner is decided:** the winner's row inverts and the loser's dims (tone); the amber lamp moves to the next live match. This is the celebration; there is no burst.
- **Sheet:** the veil comes up to .72 (leave length, opacity) while the sheet rises by translateY (light length). It closes the same way, faster.
- **Busy:** one segment cell lights its six outer bars in turn around the cell, 840 a turn. A sending action shows it in place of its word, never a word such as 보내는 중…; a place that is loading shows it at its centre. Each bar is its own box, so it keeps turning on the compositor while the page under it is drawn.
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

**Home, phone.** Under the bar: the label row (a lamp, 다음 대회까지, or the amber lamp and 신청 접수 중 while the event takes applications, the date at the right), the countdown at 120 with 일, the event's name at 20 in two lines, on the event day before its start a counter 파티 제출 마감까지 with the hours left and 시간 under an amber lamp (party submission closes when the event starts; on the days before, the countdown already says it, so there is no counter; it opens the notice), the main action, then the champion panel (216, its floor 52), then three counters (대회, 트레이너, 역대 시즌; 84 tall, cells 115, 116, 115). With no event ahead the countdown stays dark, its lamp is an unlit housing, the name's place says 다음 대회 일정은 공지에 올라옵니다. and the main action is 공지 보기. Below, each section is its own module of the board, so the page has a beat: the season's ranking as a podium, the top three as three columns like the counters (the rank, the name, the points lit in segments at 40 with 점; a tie reads as equal columns, each rank named 공동 (공동 1위), a sole leader's column inverts), and the table going on with the fourth and fifth as rows, as on the records' ranking; while the ranking is read its place stands switched off, three dark columns, so nothing under it moves when it lights; the notices as a lead panel (the date as 월 and 일 displays at 32, 새 글 with its lamp, the title at 20 in two lines, a grey line) and the rest as the notices page's own rows of 64 (the title, a grey line with the date), one component in both places; the past champions as a line score, one column a generation: the number lit at 32 on `--panel-2`, the Pokémon on its floor, the name and season, five across a phone, more scroll sideways.

**Home on event day.** The label turns amber, 오늘 대회 진행 중; the display shows the start time as a clock at 84 with 시작; the main action is 대진표 보기; 지금 경기 stands under it while a match is undecided: its stage with the amber lamp and 진행 중, the two players as rows of 52, and the round's progress (8강 진행, 2 / 4 종료); while a match of that event is played as a site battle, one more head strip under them, the amber lamp with the two names and 배틀 진행 중 (갑 대 을 배틀 진행 중) and 관전 at its right end, opens it to watch (Battle). The champion stays where it is.

**Home, desktop.** Left column 709: label, countdown at 240 in the column's golden major and the event's name at 32 in the minor beside it (up to three lines, its last line on the digits' floor), the 파티 제출 마감까지 counter on the event day before the start, the main action (38.2% of the column) and 리그 소개, then 지금 경기 on event day, then the season ranking. Right column 439: the champion panel (its floor 64), the party as six cells, the counters, then notices. The past champions run the full 1200 under both. The two columns end on one line in every state: the main action stands on the column's floor when the hero is shorter, and the podium's columns or the lead notice take what is left under them.

**Notices.** The first notice of the first page (no search) is the home's lead panel; the rest are rows of 64: the title, a grey line with the date (고정 lit first when it is pinned: 고정, 10.28 수), a lamp column at the right end. A notice opens with its date line, the title at 32, two counters (대회까지, 신청 / 정원), spec rows (일시 with its start time, 형식, 방식, 단위, 신청 마감), the body, and the docked main action (참가 신청; once the closing time passes it becomes the party submission, or a muted 신청 마감). On desktop the two columns share their top line: the back link, date, title and body take 709, and the 439 beside them, from the same first line and held in view as the body scrolls, holds the counters, the spec, the main action, the links, then 다른 공지 (five rows). Body text runs to its column (709); a grid of cards in the body takes the same width. The form (신청, 신청 수정; rebuilt 2026-11-06, when the stacked fields read as crowded and floating and the league's rule was lost between them) is laid out as its notice: the back link, the title at 32 and one grey line (* 표시는 필수입니다.), then the event's facts as spec rows (일시, 신청 마감, and 리그 루키와 마스터 함께 접수 with its rule as a grey line under them), then the form in sections, each a title at 20 with its fields 20 apart, the sections 52 apart (참가자: the Google account, the name and the same name's record; 신청 내용: the operators' questions), then 신청 현황; on desktop the facts, the docked 신청 and 신청 현황 stand in the 439 beside the form, held in view. The form docks 신청. While applications are open an event notice also offers 신청 수정 as a second action: the same form, first asking for the name and the 제출 비밀번호 (docked 신청 불러오기; with no PIN yet the four digits typed become it), then the questions filled with the earlier answers, docked 수정. The first step is one section, 본인 확인. The name is not edited there, since it decides the player and the league.

**Party submission.** On the notice: a counter to the deadline (days and hours) and three status rows (신청, 선발전, 본선). In the builder it is one panel padded 20: the event's name at 20 with the rule and the deadline as its grey line, the steps, then each step's block 20 apart; 신청자 이름 is a labelled field joined on the seam to 신청자 확인, the field taking the steps' first two thirds and the key the last, the PIN a labelled field the same two thirds wide, and 파티 제출 ✓ the panel's main action. The flow is three steps (팀 고르기, 확인, 제출): saved teams from the builder appear as panels with their six members; a team that breaks the rules is dimmed with `!` and the reason; the submitted one is recorded as a numbered submission that is never deleted, and the current one carries the lit lamp.

**Brackets.** A tree of match boxes (two rows, 36 each, the seam between) joined by lines drawn as one picture over the tree, measured from the boxes: out of each box at its middle, to the middle of its pair, on into the next box. A decided road is a 2px `--lit` line laid over the 1px `--mute` ones, square-capped so it runs unbroken from the winner's box to the next. The winner's row inverts, the loser's mutes, an unplayed slot is muted words (M3 승자). The live match carries the amber lamp beside its score; a match being played as a site battle carries it in its box's top right corner, and its sheet holds the battle (Battle). A phone shows two rounds at a time with every name whole (no seed column), and the tree stops round by round as it is swiped; on desktop a short tree runs the full 1200, its columns sharing what is left, and a long one scrolls sideways. Double elimination switches 승자조, 패자조, 그랜드 파이널. 공식 and 사설 are page tabs; 사설 explains in one panel that it never reaches the records. A list view shows matches as score panels. The list of brackets leads with its newest as a lead panel (the date as 월 and 일 displays, the name at 20, the grey line naming the winner, the amber lamp and 진행 중 while it runs); the rest are rows, their date in the tight form with the weekday 4 after it (09.13 토). The bracket's name is a page title at 32; desktop shows it with 우승 이미지 and 대진표 이미지 beside it once it is decided, a status strip while it runs (the amber lamp, 진행 중, and the round's progress such as 8강 2/4 종료), then the whole tree and a 우승 panel, 180 tall, that waits muted (결승이 끝나면 켜집니다.) and lights when the final ends with the winner's name at 32; the places (준우승, 4강) and the images follow the tree, and the result does not name the winner a second time. The leg into a box lights with the fork once both roads into it are decided.

**Records.** Page tabs 트레이너, 대회, 포켓몬, 랭킹. Counters on top (대회, 트레이너, 역대 챔피언 in 대, beside the hall's 챔피언 in 명); a ranking leads with the home's podium for its top three and the table goes on from the fourth, a tie named there as on the podium (공동 4), the rank column widening to 84 for the whole table while one is shown; tables of 44 rows with the record holder inverted at 52 (under a pointer it steps to `--dim` and keeps its ground-coloured words); the events, newest first, part into chapters by season (a head with the season's name at 20 and its number of events lit at 32 with 회); an event's placings as strips joined by the seam, the place in a cell of its own (우승 inverted, 준우승 lit, 4강 dim) and the names beside it, the winner's at 20; every event opens its parties by one line that names them (입상자별 공식 파티, 팀원별 공식 파티), and parties read as six pictures; filters as chips; a trainer opens with three counters (우승, 준우승, 4강), titles as chips, all one look (a reign leads by its place, never by inversion), recent events as rows with the result inverted when it is a win, their most used Pokémon on floors, and, once they have played one, 공식 배틀 N판: their official site battles as rows (상대 and the name, a grey line with the date, the turns and 기권 when it ended so, 승리 inverted or 패배 dim at the right), each opening its replay. A Pokémon opens its sheet as a statistic, the Pokémon its subject: a 709 panel with the rank lit at 84 with 위 at the top left, the types on its floor and the Pokémon standing large at the right, four counters beside it (채용률, 등록 엔트리, 사용 트레이너, 우승 엔트리; two by two on a phone); a line under them says what the counts are, and once the Pokémon was sent out in an official site battle, 공식 배틀 follows as three counters (선출 and 선봉 in 판, 승률 in %), counted from the battles' own logs, a Mega with its base form; then every share as the calculator's bar on its track in rows of 44 (the name, a move's type tag before it, the bar, the figure): its base stats and the samples' average points, the moves two columns down, 도구, 특성 and 성격 three across, the trainers who registered it. In each ranking a sole leader's row inverts.

**Titles and hall of fame.** Titles: generations as rows (the generation as a figure, the name, the season); the current holder inverts. The hall hangs one reign large and the rest on a wall: the crown, one panel with an inverted 현 챔피언 tag, the generation lit in segments at 84 with 대, the name at 32, the season and which title it is (2번째 우승), and the six large with their names (439 and 709 on desktop, where the tag stays at the top and the generation, name, season and links stand on the floor, read like the home's champion panel); then three counters (세대, 챔피언, 최다 우승 with the name); then 역대 챔피언, a wall of plates, newest first, three across on desktop, each the generation at 40, the season, the name at 20 and the six. A plate opens the champion sheet, which on desktop is as wide as the content.

**The champion sheet** is the hall's, not a record's: a reign is decided, so it opens with a seal, the sheet's one inverted panel, saying 현 챔피언 (or 명예의 전당 for a past reign) and the generation lit in segments at 84 with 대 챔피언; the title is the name and the grey line the season. A reign won after the sets were kept (the final submission's ability, item, nature, points and moves) hangs its six as plaques joined by the seam, one, two or three across: the picture on its floor and the facts split 1 to 1.618 (the name at 20, the type tags, 도구, 특성, 성격 with its arrows), and under both the four moves two by two, each one step up with its type tag under its name. The points table stays in the records' party sheet. An earlier reign keeps the six on their name bands and one muted line saying only the party was recorded. New champions get their plaques with no step by an operator. Wherever the sheet opens it ends the same way: 기록 보기 for that champion as its main action, and, opened from the home, 명예의 전당 보기 as a word under it.

**About.** The title at 32, then the league in numbers before it is explained: one wide counter 첫 대회 with the year (four cells) and the month (two cells) at 40, each followed by its unit in type (년, 월), and under it 대회 and 트레이너 as two counters side by side, doors to the records' tabs as on the home; on desktop the three stand in one row, as the home's counters do. The figures are the home's facts, so nothing new is counted. Then the paragraph and the sections (참가하는 법 first).

**Board.** Tabs 자유, 샘플, 파티; a search with 글쓰기 as the main action; rows of 64 with the comment count as words. A finished battle's 게시판에 공유 opens 자유's 글쓰기 with the title (갑 대 을 배틀) and the replay's address in the body, nothing posted until the visitor posts it. Sample and party rows are the records' party rows: the title and its grey line, then the pictures (a party's six at the right in 64 cells on desktop; a sample's one leading its row). A sample or party post shows a team and lets people take it, so it is laid out for that, not as a notice. A sample or party post has nothing small above its title but the back link: its facts (the tab, the format, the rule, the author, the date) are the title's grey line, 4 under it. Each Pokémon's settings are one card: its name strip, its picture and the facts, points and moves under it, all one panel on the seam with the tables one step up. A party: the six large across the page with their names (each opens its settings below), the actions joined under them by the seam (팀 빌더에서 열기 as the main action, then 이미지 저장, 링크 공유, 수정, 삭제 in one row), the author's words, 포켓몬별 세팅 three across, the comments in a 709 column. A sample: its one case stands at the left (439) held in view; the actions, the words and the comments run at the right (709). Cases stand from their top edge and an empty move slot keeps a filled one's height, so every case in a row is the same length.

**Team builder.** Tabs 규정, 포켓몬 선택, 팀 구성, and a 내 팀 list. Six slots always on top. The list: a 64 picture cell centred on its row, name, type tags, the six base stats as six even columns of letter over figure (the sorted one bold), the total as the row's figure, +. The editor: the six as pictures that fill their slots, no name under them, the chosen slot inverted, spec panels, the points as bars on tracks (66 / 66), moves as four panels, a docked 현재 팀 저장 with 게시판에 올리기 beside it, and once the team is saved as it stands, 이 팀으로 배틀 as a word, which opens a friendly battle with that team chosen. Desktop: the rules as two cells in one row (레귤레이션, 파이컵 추가 룰), list 439, editor 709, the save under the editor. The list has the types as chips under its search (전체 359 first), one type at a time. The exported image uses the same panels and floors. Under the team step stands 타입 상성 (added 2026-11-06): two boards of cells joined by the seam, 방어 상성 (what each attacking type does to each member, its ability counted) and 공격 상성 (each member's best damaging move against each type). The board's frame is one step up (`--panel-2`): the head column holds the types, each a cell the column's width with the tag's square and name standing in it, so the board has no gap; the head row holds the corner naming the rows (공격 타입, 상대 타입), each member's picture on its floor and the counts' words (약점 and 내성, or 2배), each centred in its own cell. A cell carries the battle's marks: ×2 lit, ×½, ×¼ and ×0 dim, ×1 dark, ×4 inverted as in the dex; a count is lit where it is the problem (약점 above 내성) and muted at 0. Over each board one line names the types to look at as tags (약점이 내성보다 많은 타입, 2배로 칠 기술이 없는 타입). A phone shows one board under a choice of the two; desktop shows both side by side, half and half, since they are equal.

**Calculator.** Tabs 대미지, 스피드, 도감. Damage: two Pokémon panels (an empty one shows its + in the middle of the panel; until one is chosen its 세부 설정 says so in a panel of its own, never on the open ground), the result as a segment range with the exact range in type, a bar on a track, and the verdict (확정 2타); then 배틀 조건 and 세부 설정 as sections. Speed: the base Pokémon's speed as a display and a line of rows (speed, picture, name, base) with the base row inverted; the opponents' modifier as a row of choices. Dex: picture, types, base stats as bars, defensive matchups as rows with the 4x row inverted.

**Admin.** Result entry: match chips (done with a check, current inverted), the match with ± around each score, 불참 처리 and 부전승, docked 저장하고 다음 경기, and an undo toast. Making a bracket: three steps (대회 설정, 참가자 확정, 대진 배치); points copied from the last event; party submitters checked first; draw, redraw, and swap two players by dragging one onto the other or pressing both (the held one inverts); 대결 확정. Recording: the placings and the points to add, previewed, then 기록에 반영 with 나중에. Notice editing: title, body, the notify check, 대회 신청 받기 as a switch with its 신청 마감 시각, the event day with its 시작 시각 (both required before saving while the event is ahead; party submission closes at that start, so there is no separate submission time), settings copied from a past event. Applicants: counters, search with CSV, chips (전체, 파티 제출, 미제출), rows with the submission lamp and their time on one line; 비밀번호 초기화 stands on every row, since the PIN is set by a first party submission or a first 신청 수정. A title's holders are picked: the known names (the records' trainers, for a partner the Pokémon) are offered as one types, and each chosen name is a chip with ×.

**Errors and empty.** An error is the `!` square and a sentence, then one way out (다시 시도). A connection drop keeps the board switched off with a toast. An empty search shows a dark 0 display and two sentences. 404 lights 404 on the board with 홈으로 and two shortcuts.

**Footer.** On the ground under a hairline: the brand at 24 and the league's line, with 관리자 로그인 and 디스코드 참여 at the right end of the same line as 15 underlined words, 32 apart (2026-11-06: operators could not find the login as small type at the bottom); then one 12 line, the copyright with 개인정보처리방침 20 after it, and the fan-site notice in 12px muted type under it. Signed in, 관리자 로그인 leaves the footer (the admin strip has 로그아웃).

## Battle

**The battle is a game, not a page of the board.** (Decided 2026-11-05: the battle screen must overwhelm, a fierce battle watched from the stands of a new Pokémon game, so the committee's "unfinished, copied from Showdown" never comes up again.) The engine is Pokémon Showdown's, so every ruling is Showdown's, and the Pokémon pictures stay the site's HOME renders; everything else on the battle screen is designed as a new, current Pokémon game would design it: the stadium, the camera, the moves, the HUD over the stage, the move cards and the big moments. The battle has no sound (removed 2026-11-05 at the user's word). The board's law (tokens, the golden series, panels on the seam, light as the only emphasis, no gradient, glow, blur, shadow or radius, the four type sizes, the verbs of motion) does not govern the battle screen. Two things carry over from the site, so the battle still belongs to it: its colour (the navy family of the themes, the type colours, amber for what is live) and its taste (calm typography in the site's fonts, Korean in the Voice and tone, nothing cheap or noisy for its own sake). Light, glow, bloom, additive light, particles, shadows and reflections are the stage's effects to use. Everything a player reads or presses on the battle screen (the HUD over the stage, the strips, the move cards, the bench, the keys, the plates and words over the stage) is laid out as a game lays it out but drawn in the site's own manner (decided 2026-11-05 after the first HUD): solid colours, square corners, square marks and tags, no gradient and no circle. The one exception is Mega Evolution's emblem, the games' rainbow helix (`public/brand/mega-evolution.png`, drawn as given, straight on the key with no tile behind it). What opens over the battle as a page element (a Pokémon's sheet, a confirm dialog, a toast) and every screen outside the battle stay on the board and under every rule. The battle screen's files are `battle.css`, `battle-stage.css` and `src/pages/battle/` (`tests/designLaw.test.mjs` leaves them out). Where a paragraph below still speaks of the board's restraint for the battle screen, this paragraph wins.

**Judging the stage.** The stage is free of the board's numbers but not of judgement. What it was called wrong for, and what was approved instead:

- **The Pokémon's shape always reads, and every effect on the field reads too.** Weather, terrain, rooms and hazards never hide a Pokémon or glow over it, yet each is plainly there, and several at once each stay identifiable. Both ends fail: "포켓몬의 형체를 알아보지 못하게", "눈이 아플 정도로 과한" and "너무 지나치게 절제되었음, 티가 잘 안 남", "눈에 너무 잘 안 보여".
- **Like the move in the games.** A move, a field or a doll is drawn from what it is in the games, checked side by side with a reference before it is called alike (psychic terrain is ripples, not a magic circle; the substitute is the chubby plush). Failure: "하나도 안 닮았는데", "마법진 관련이 아님".
- **Rich by shape and layers, never by brightness, and never one plain stroke.** A move gathers, travels and lands; a path curves. A lone circle or a ruler-straight beam fails: "원이나 일직선 같은 느낌", "레이저 같은 효과, 너무 정직한 일직선".
- **Plain and calm behind it.** The arena is one solid tone with the court's lines, no logo, no bands, no gradient, vignette, light shafts or repeated squares, and the camera holds still. Failure: "부자연스러운 그라데이션", "빛기둥 4개가 서 있는 것 같은", "카메라 움직임이 오히려 어지럽게".
- **One style for everything drawn.** What the stage draws itself (the Poké Ball, the doll, a hazard) is lit and shaded as the Pokémon's renders are, so nothing sits on the stage like a sticker. Failure: "몬스터볼 혼자 붕 뜨는 것 같아".
- **Nothing the official game does not show.** No number or word rises over a Pokémon, no ring under it; Showdown is the reference for what a player is told and where, 포켓몬 챔피언스 for how it feels.
- **Never a stutter, never a jagged line.** Every loop closes on itself to the pixel and the picture is drawn at the screen's own resolution, measured, not judged in a headless still. Failure: "뚝뚝 끊어지는 느낌", "선이 자글자글해".

**The stage.** (Rebuilt 2026-11-06, made plain the same day.) The arena, the Pokémon, every effect, the field and the camera are one GPU picture, a WebGL2 canvas under the stage's places (`src/pages/battle/gl.js`), on one clock. The arena (`arena.js`) is painted once per size and theme in the site's own tones and nothing on it moves: one solid ground, the site's navy in dark and paper in light, from top to bottom, and on it only the court in perspective (side lines, far line, centre line and one circle). No wall band, no floor tone, no court fill, no sheen, no glow on the lines and no logo (2026-11-06, the user: the club's wing and the near-alike bands read as smudges). It is painted a fifth past the stage on every side, further than the camera's pan and shake ever reach, so its edge never shows. Each Pokémon is its picture on the floor with its reflection under it, breathing from its feet. The `.bs-slot` elements stay for layout and for picking a target; the canvas draws their pictures. Without WebGL2 the stage falls back to the pictures alone (`.bs-nogl`). The picture is supersampled (2026-11-06: the court's lines looked jagged at 125%): the canvas matches the screen's own pixels one to one, the scene is drawn at least twice the CSS size (up to 3 on a phone, within 4 million pixels) and the last pass filters it down with four taps across each screen pixel, instead of the browser shrinking a larger canvas without a filter.

**The camera.** (2026-11-06: held still.) The camera keeps the wide shot through every move: its pushes and pans read as dizzy, and a move is judged as it looks from the stands. Only a hard blow shakes it a little (smooth noise that decays, never a jump). The pushes and pans are still in the engine behind `CAMERA_MOVES` in `gl.js` (a critically damped spring, so a new target never jerks it), and the lab's 기술 screen turns them on to compare. Measured 2026-11-06: through six heavy moves under rain, terrain and hazards, 560 frames at 16.7 ms with none over 20 ms, the engine's own work 0.6 ms a frame (5.3 ms at most with the CPU slowed four times).

**Weight.** A blow lands with weight: at its impact the whole stage holds still for a moment (hit-stop: 60, 90 on a critical or super effective one, 120 on the blow that knocks a Pokémon out) before the knock-back, the burst and the HP move on. A critical hit pushes the camera in on its target (1.25) for the hold; the message window says it. The blow that takes a Pokémon's last HP is played at half speed from its impact, the camera holding on the target, and the fall that follows is the stage's quietest beat: the stadium lamps dim one step while it sinks and come back as it goes out. The stage shakes only for what shakes the ground (an earthquake, a hard blow, a fall), small and once.

**The big moments.** Three moments are scenes of their own, each under 3.4 seconds at 보통 and each skippable by a tap on the stage, which plays it to its end at once. The opening: the stadium's lamps switch on bank by bank, one night band, lit on its two edges, opens across the stage from its middle line with the two trainers' names facing each other across VS in it (it closes back into its line), unless the gate has just shown them, and each side's leads are thrown: a Poké Ball, lit as the Pokémon's renders are (2026-11-06: the flat disc sat on the stage like a sticker; now a sphere shaded from the upper left with a highlight, a soft fall-off and a cool rim, its red, white, band and button turning with it in 24 frames, so it tumbles rather than spins flat), arcs in from the near or the far edge with its soft shadow crossing the floor under it, opens at the top of its fall and the Pokémon grows out of its light (sent in). Mega Evolution: the stage dims to a third behind the one evolving, a ring in its type colours turns in and closes round it, the light inside it builds in two swells, then the stadium lamps flash once, the new form stands lit and settles to its own colours in a burst; it is the only time the stadium flashes. The end: the camera frames the winner's last Pokémon standing, the stadium board inverts the winner's name, the lamps run once along their banks, and the winner plate rises as before.

**Nothing is written over a Pokémon.** (Decided 2026-11-05.) As in 포켓몬 챔피언스, no damage number, no 급소, no 효과가 굉장하다 or 빗나감 rises over a Pokémon: the message window says each of them, and the stage shows a blow by its camera, its weight and the HP sliding on the plate. What stands over the picture is only the turn, the winner, an ability or item plate and the opening names, and they stand outside the camera (`.bs-over`), so a push or a pan never moves them off the middle.

**The field stays on the stage, behind the Pokémon.** (Restrained 2026-11-06.) A Pokémon's shape always comes first. Weather, terrain, rooms and each side's hazards and screens are groups of looping GPU particles and lines (`arena.js`), faded in and out as one; what stays on the field never feeds the bloom, so it never glows over a Pokémon. Weather is drawn mostly behind them and only fine and faint in front (rain streaks, a little sand, snowflakes); terrain is a cast the floor takes and a life on it, all under the Pokémon: electric yellow bolts and sparks, grassy a green lawn of fine tufts with a few flowers and pollen, misty low mist and glints, psychic a pink and violet floor with ripples running out across it and waves rolling over it (never a magic circle). A room is a box standing on the court in the court's own perspective, every Pokémon inside it (its floor, side walls and ceiling are faint panes, lines run over its floor under them): its far wall a faint pane with a fine grid in the room's two colours (Trick Room pink and cyan), lines running from it to the camera along the side walls and the ceiling, its edges drawn on as it goes up and a slow light running along them. Spikes and toxic spikes are caltrops about a fifth of the side's height, in a staggered row at its feet, each with its shadow, three more each time one is used (spikes up to nine, toxic spikes up to six); stealth rock is stones floating round the side at knee height; sticky web lies flat under it; a screen is a pane barely there with its top edge lit in its colour, each at its own height so several read apart. Checked 2026-11-06 alone and all together, in both themes.

**The HUD, the strips and the message window.** The arena is one night frame, whatever the site's theme: the foe's strip, the stage, our strip, joined on the seam. The HUD stands over the stage as the games put it, so nothing covers a Pokémon: the foe's plates in the top corners (the first holds the field's tags under it; in doubles the two are small, a quarter of the stage, as Showdown keeps them), ours at the bottom right over the message window, and the message window as a solid band across the bottom (the newest line lit, the one before it dim, the question the newest when the game asks), with the clock in its right corner. On a phone the stage is 4 to 3 in a battle so the HUD has room, and our Pokémon stand a little higher and, in doubles, a little to the left. A plate is a solid panel: the name with the gender and a status as a square tag in its type's colour, then the HP as one square bar (green while half stands, yellow to a fifth, red under it; ours exact, the foe's in percent) with its number at the right, then one line of marks only when there are any (a rise lit, a fall dim, what clings to it plain). HP slides from where it stood with a pale trail of what was lost. Tapping a plate opens the Pokémon's sheet (as before: HP, gender, types, ability, item once seen, base stats, stat changes, what clings, speed range at level 50, weaknesses and immunities, moves shown). A fainted Pokémon's plate goes out with it, as the games take it away: the blow's HP first runs all the way to 0 on the plate, and the plate goes out as the Pokémon begins to fall, never at the blow (2026-11-06); the next one sent in brings its own. A strip holds the trainer's name, the party as six squares (the ones out a tone lighter, the unseen as shadows, the fainted grey, a status as a small square) and the side's conditions as tags. Plates are kept small and tidy, as Showdown keeps them (decided 2026-11-05): about 30% of the stage on a phone and 26% on a desktop, so the foe's never touch the stadium board in the middle; on a phone in doubles our two plates are one line each (name, bar, HP) so the pair stays low in its corner. On a phone the stadium board shows the turn alone (two names would be cut to a syllable at that size; the strips carry them), on a desktop the names stand beside it. An ability or item plate puts what it belongs to on its own small line over its name. Our strip is itself the key that opens our whole party as cards: the name, the six and 내 파티 with a chevron at its end on one line that never wraps (2026-11-06: a separate key fell onto a line of its own under the six on a phone); the name gives way first with an ellipsis, then the six shrink together, square; the side's conditions take a line under it.

**The party (decided 2026-11-05).** One card shows a Pokémon wherever the battle shows a party (`src/pages/battle/Sets.jsx`), and its sizes follow what a player needs: largest the picture and the name, then the four moves as keys in their type's colour (with the PP left, or for the foe how often each was used), then the ability and the item, smallest the five stats. Our cards are the set as the engine brought it; the foe's show only what the battle has shown (an ability or item not yet seen reads 모름, a Pokémon not yet out says so). Beside the stage, under the choices, the party stands open through the whole battle as Showdown's tooltips laid open: one side at a time behind two chips (the foe's party, 내 파티), the Pokémon out first. **The team preview** is its own screen in the stage's place: the foe's six small along the top (a picture, the name, the types, six across on a desktop and three on a phone), ours below as six large cards (three across, two on a phone), each chosen by a tap; the chosen card inverts and lights its order number, and an unchosen card shows no number. On a wide screen the side column lists the places in order (1 선두, 2, 3...) with who goes there, over 선출 확정; on a phone 선출 확정 docks. The key reads how many are still to pick (2마리 더 고르기) until the choice is whole.

**Mega Evolution** is a key the moves' width, above them, so it is set before a move is chosen: the helix as given, the Pokémon's name with 메가진화 and one line of what it does, and a square that takes a check; while it is on the key inverts.

**Where the match stands.** On a phone the match is one column (the head as one 52 line: the lamp and where it stands, the two names at 15, the turn; the head, the result, the stage or the team preview, the replay, the choices, the party, the playback keys, the log folded behind 전체 기록); between 860 and 1199 it is one column up to 980; from 1200 the page lets go of its 1200 and the stage stands on the left as large as the window allows at 16 to 9, never taller than the window under the bar, and everything else stands in a 400 column beside it that stays in view and scrolls on its own (the head with 선출 중, 진행 중 or 종료 and the two names at 20, the result, the replay, the choices, the party, the playback keys, the log), so the stage never leaves the screen. On a desktop the strips' party squares are 40 and the marks under a plate read at 12. A move key is two lines: the name and how it lands, then its type, category and power (accuracy and priority only when they fit whole) and its PP.

**Replay.** A finished battle opens on its end and is its own replay, on the same stage, as Showdown's replays are. Right under the stage, standing back: five small square keys with their signs (처음, 이전 턴, 재생, 다음 턴, 끝, each named for assistive technology; 재생 inverts and shows its pause sign while it plays; a key with nowhere to go is muted), and the track as any player's scrubber: a 4 rail lit as far as the replay has played and a 12 square handle where it stands, moved by transform (drag it to any turn; the range input lies over it unseen). No word stands beside it: the head's turn counter follows the replay and says the number (decided 2026-11-06: the word 끝 read as cheap, and a row of one cell a stop did not read as a position). A jump (처음, 이전 턴, 끝, the bar) stands the stage there at once; 다음 턴 and 재생 play the turn on the stage at the playback speed, a turn standing 680 before the next. A pause lets the turn on the stage finish. The replay stands on the team preview (both parties), on each turn's opening, and on the end; 재생 at the end starts again from the preview. The head's turn and the log follow the replay. 링크 공유 shares the replay where it stands (`?view=battle&id=…&turn=5`, and `&side=p2` when watched from that side), and the link opens it there.

**Playback.** 연출 보통, 연출 빠르게, 연출 건너뛰기 as the board's chips, remembered on the device. 건너뛰기 plays the state with no effects. A page opened mid-battle catches up at once; only what arrives while it is open is staged. One who is not playing (a spectator, a replay) also has 시점 as chips, the two names (갑 시점, 을 시점): the chosen side stands near, and the stage starts again from where it stands. A player always sees from their seat.

**The clock.** Every decision has 90 seconds, team preview included, counted by the server from the moment the engine asks (`docs/db/battle_timer.sql`). While a decision is owed, the stage shows the seconds left in the message window's right corner: two segment cells on a square panel and a bar under them emptying as the 90 run out, amber under 30 and red for the last 10. When they run out, the waiting player's screen tells the server, which checks by its own clock and ends the battle: the one who did not choose loses on time (시간이 다 되어 끝났습니다.), recorded as a forfeit in the input log so the replay plays the same. The board never chooses for a player. Where that SQL has not run there is no deadline and no clock.

**Finding a battle again.** There are no accounts, so the battle page lists, under its form, 진행 중인 배틀 (battles moved in the last half hour, each with the amber lamp and 진행 중; pressing one watches it) and 이 기기의 배틀 (every battle this device opened, joined or watched, kept in the browser: the two names, a grey line with 친선 or 공식, 싱글 or 더블, the date, the turns and 기권 or 시간 초과, and at the right 승리 inverted or 패배 dim for a seat this device held, otherwise 종료 or 대기). Each opens its battle or its replay. 기록 삭제 at the right of its head picks before it deletes (2026-11-06): a check leads each row, the link becomes 취소, and under the list 전체 선택 and N개 삭제 join on the seam, 1 to 1.618; the delete asks once and the chosen battles go from this device, with their seats. A battle still waiting or being played stands muted without a check, since its seat is still needed. The replays stay on the server.

**The head.** The amber lamp with 진행 중 while the battle runs (Lamps), the turn as two segment cells at 32 with 턴. A turn opens with its number on an inverted plate over the stage; the battle ends with the winner's name on one, an amber square before it, and then the winner's row inverts as in a bracket.

**Choices.** The game asks only once the stage has played what came before, so a choice never appears over a turn still on the stage. The question stands in the message box as the game puts it there (리자몽은 무엇을 할까?), and the four moves are panels two by two on the seam right under it: the name at 15 and, at its right, how the move lands on each foe now out in the order they stand, as Champions marks it, a hit that counts lit (×2), a weak one dim (×½), none muted (×0), shown when any of them is not ×1; under it the move's type tag and the category with the power (특수 95); on a third line, 12 dim, the accuracy when it is under 100 (명중 90) and a priority, and the PP at the right end (PP 12/12). Every move is these three lines, 84 tall, so no move breaks a line of its own. The four keys never leave their places (2026-11-06): a move that cannot be used now (no PP, Disable, a Choice item's lock) keeps its key, its words and its place, its colour gone grey and dimmed; a move asked alone (Outrage, a charge, Recharge, Struggle) stands with the Pokémon's other moves off beside it. A choice goes the moment it is made, as Champions sends it, with no confirm: a move is sent when it is tapped, and in doubles the first Pokémon's choice waits for the second's, which sends the turn (처음부터 다시 고르기, a word, takes back the first while the second is asked). A move that needs a target (doubles) gives the move keys' place to the target picker, as Showdown and Champions ask (2026-11-06: rings drawn round the Pokémon on the stage read as dated): the field as the stage shows it, the foe's two over ours, each place a key 84 tall with the picture, the name, the HP and the move's matchup there; a place it cannot reach (the user itself) is muted, an empty one says 빈 자리, and 돌아가기 under it brings the moves back (Escape too). The box asks 리자몽의 에어슬래시, 누구에게 쓸까?. With one place left it goes there at once. A key's type, colour and matchups are the type the move goes out as (`src/pages/battle/battleWords.js`): the user's ability (Pixilate and its kin, Dragonize, Normalize, Liquid Voice), the weather for Weather Ball (none while Cloud Nine or Air Lock is out, sun and rain not under a Utility Umbrella), the terrain for Terrain Pulse, the form for Aura Wheel, Raging Bull and Ivy Cudgel; a matchup follows the target's typing as it stands (Soak, Trick-or-Treat, Burn Up, Roost for its turn, Transform) and the moves that break the chart (Freeze-Dry, Flying Press, Thousand Arrows). Revival Blessing asks 누구를 되살릴까? over the fainted ones. `scripts/battle-fuzz.mjs` plays random battles and checks all of it against the engine. Under the moves stands the bench, as Showdown keeps it: the brought Pokémon not out, each a 52 panel with its picture, name and HP, one tap to switch in; one that cannot come in is muted, and a trapped Pokémon's bench says so. A forced switch shows the bench under the last moves, which stand where they were, locked and dimmed. 메가진화 is a check by the moves; its key stands over them from the first turn until Mega Evolution is spent or its holder falls, off (나와 있을 때 켤 수 있습니다.) while the holder is not the one choosing, so it never comes and goes with a switch. After a reload, before anything has been asked on the screen, the locked keys are the request's own moves, off and without their PP. Once a choice goes, the stage comes into view (on a phone the moves sit under it), the same keys (메가진화, the moves, the bench) stay where they stood, locked and dimmed, until the next question, so nothing leaves and comes back and the page never jumps, the box says what was chosen (리자몽의 열풍, 한카리아스의 지진), and the dock shows the busy cell and 상대의 선택을 기다리는 중…. The playback chips stand under the choices. The team preview shows the foe's six with their type tags and our six as cells picked in order, sent with 선출 확정 ✓. A decision that runs out of time loses the battle on time (The clock); the board never chooses for a player.

**Opening and waiting.** A friendly battle opens from a saved team and its link goes to the opponent. Before it opens, the screen shows the match as it will be played, then what to bring: 배틀 at 32, the matchup as three panels on the seam, 64 tall (68 from 860, where the label is 15; 2026-11-06, 84 was more panel than name) (내 이름 typed in place at 20, VS in a 52 cell, 상대 at 20 at the right end, muted 링크로 참가 until someone joins), and under it, for a random party, its six places as unlit square panels (nothing is known until the battle opens, so nothing repeats the choice on the left; 2026-11-06), otherwise the stage itself, the chosen team's first Pokémon standing on our near side (one in singles, two in doubles) and the far side empty, closed under it, where a battle has our status bars, by a panel for each with its name and type tags. A change of team or format sends the leads in again out of the same light as in a battle. Then 형식 as a choice, the saved teams as panels (the name, the rule at the right, the six as pictures on their floors, the chosen one inverted with a check, its six standing straight on the white with no navy cell behind them, as the chosen team preview card and the builder's chosen saved team do too), and the docked 배틀 열기 →. (Rearranged 2026-11-06, so what is pressed most is first and largest and the action is never under the fold.) On desktop the choices take the 709 on the left, 상대 and 형식 and then the teams two to a row; the 439 on the right holds the matchup, the court and the action under it as one card that stays in view while the page scrolls. On a phone the matchup comes first (the name is typed in it), then the choices, then the court, and the action docks. Under the lobby, 방 참가 stands in the 439 and the device's lists in the 709 (on a phone 방 참가 first). A battle with the computer left half played stands above everything as a row. The one who joins through the link sees the same screen with the opener's name lit as 상대, the battle's rule and format as a row with 참가 대기, and docks 참가. The one who opened it waits on the same screen, now set: the matchup with its own name lit and the opponent's place muted (상대) under a lamp and 참가 대기, the stage with its leads standing (the team this device opened with) and, on the far floor where each of theirs will be sent in, two rings of light breathing out in turn, the light a Pokémon comes out of not yet bloomed; then, on the 709 (first on a phone), 상대를 기다리는 중입니다. as a row with the rule and the format and 참가 대기, a code room's 방 코드 and 기다린 시간 side by side in segments at 84 (52 for the time alone), one grey line on what starts it and the team brought as its panel; on the 439 the matchup, the court, the docked 링크 공유, and 대기 취소 as a word under it: it asks once (대기를 취소할까요?) and leaves nothing, since nothing was played. A battle that started cannot be cancelled; it ends by play or by 기권.

**Going in** (2026-11-06, settled the same day after a versus screen and a party lineup both read as floating; `src/pages/battle/Gate.js`). Pressing 배틀 시작, 방 만들기, 참가 or 다시하기, the moment the opponent comes into a waiting room, and the moment the team preview ends never just swap the page: the stage's own opening band (The big moments) plays at the size of the window, in the arena's night tones in either theme. The page goes dark, the band lit on its two edges opens from its middle line, the two names face each other across VS in it (64 wide, 28 on a phone), and one dim line under the band says what this is, the only thing that changes with the moment: the rule and the kind (M-C 싱글 컴퓨터와의 배틀), 상대가 들어왔습니다., 배틀 시작. An opponent not yet there stands muted (참가 대기). No party stands in it. Behind it the next screen is made ready (the room created, the computer's party drawn, the stage stood up in the dark); once it stands and the names have been read, the band closes back into its line and the dark lifts. From the team preview the stage's own band is left out, since the gate just played it: the lamps switch on, then the balls are thrown, and no lead stands on the canvas before its ball. Transform and opacity only; with reduced motion it only fades. A gate nobody opens opens by itself after six seconds, and a refusal opens it on the screen it came from with the reason.

**The opponent and the rooms** (2026-11-06). Before 형식 the lobby asks 상대, three choices: 컴퓨터, 공개 방, 코드 방, 컴퓨터 first and chosen. 형식 starts on 싱글. The matchup's far panel says, muted, who will come (컴퓨터, 누구나 참가, 코드로 참가), and the docked action is 배틀 시작 → for the computer and 방 만들기 → for a room. A battle with the computer starts at once on this device and is played like any other, the computer choosing as a player would; it leaves no link and no board post (its links are 새 배틀 and 기록 내려받기), and a battle left half played stands above 상대 as a row, 컴퓨터와의 배틀 with 진행 중, that opens it again. An open room stands for 30 minutes on the battle page under 방 참가 as a row (the opener's name and 의 방, the rule, the format and 공개 방, 참가 대기); a code room stands nowhere, and its waiting screen shows 방 코드 first, four digits in segments at 52 above 기다린 시간. 방 참가 is a section under the lobby: 방 코드 as a field (숫자 4자리) and 코드로 참가 as a second-rank key under it, never a second dock, then the open rooms. A code room's link carries its code; opened without one, the joining screen asks 방 코드 under the battle's row.

**An official match.** A bracket match is played from its sheet: 배틀로 경기 is the main action of an undecided match whose two players are known (individual official brackets in progress only). It opens the seat screen: 공식 경기 at 32, the match as a row (갑 대 을, the event and the round in its grey line, the amber lamp with 진행 중 once a battle is open), one sentence, then the two names as a choice (선수) and 제출 비밀번호 (four digits), docked 경기 시작, or 경기 들어가기 when the other player is already in. The player plays the latest official party they submitted, never a builder team; the same player on another phone takes the same seat again. A match already decided says so and offers nothing. While it waits the panel says the opponent comes in from the bracket.

**How an event is played, and random battles.** Each event chooses how its matches are played (`competition_settings.matchPlay`, the event editor's 경기 진행): 포켓몬 챔피언스 (the default: played in the game, the operators enter the result, and the bracket offers no 배틀로 경기), 사이트 배틀 (the latest submitted party), or 랜덤 배틀 (a random party the engine draws for each seat). The battle function refuses an official battle for an event played in the game. A random party is six species from Showdown's gen 9 random battle sets kept to the regulation (`src/data/random-sets.json`, `node scripts/build-random-sets.mjs`), one of each, no item twice, four moves of a role, legal by Showdown's own validator; a friendly battle offers it as 랜덤 파티, one panel of its own above 저장한 팀 however many rules there are (2026-11-06), with the rule as a choice joined under it on the seam (shown only when there is more than one); its six stay unknown until the battle opens. A party still being built battles as it stands (one to six Pokémon); only a Pokémon with no move is refused.

**The result goes in by itself.** When an official battle ends, the server puts its winner into the bracket, single or double elimination, the same way an operator's pick would, and the next match forms. The end row says how it went in its grey line: 대진표에 반영했습니다., 대진표에 넣는 중입니다. while it is on its way, or 대진표에 넣지 못했습니다. 운영진이 확인합니다. with the reason. The bracket reads itself again within its 15 second rhythm, so an operator's open screen shows the result without a reload.

**In the bracket.** A match being played carries the amber lamp in its box's top right corner (Lamps: live). Its sheet, and the operator's result entry, hold the battle as a block under the match: a row 사이트 배틀 with what is happening (waiting, playing, ended and whether it went in) and one second action, 경기 들어가기 while it waits, 관전 while it runs, 리플레이 once it ended. Elsewhere the battle reaches the board in three places: the home's 지금 경기 strip (Layout), the trainer's 공식 배틀 rows and the Pokémon's 공식 배틀 counters in the records.

**After the battle.** (Rebuilt 2026-11-06: 새 배틀 sat under the whole party, a long scroll away.) The end is a block of its own where the choices were: the result at 32 (승리 inverted, 패배 on a panel, 무승부 and 무효 likewise; anyone watching reads who won), how it went under it at 15, then the keys. 다시하기 is the main key and 새 배틀 the second beside it; on a phone they dock at the bottom and the page comes back up to the stage, whose result stands right under it with the replay; on a wide screen the side column goes back to its top. 다시하기 against the computer starts a new battle at once (the same name, rule, format and saved team, a random party drawn again, and a new party for the computer). 다시하기 in a friendly battle (`docs/db/battle_rematch.sql`) opens the next battle as a code room that stands on no list and writes it on the ended one; the other player's ended screen keeps reading for ten minutes and, once it sees it, shows a lamp with 상대가 다시하기를 원합니다. and turns its key to 다시하기 수락, which seats them with the same name and their own same team. The one who asked waits on the waiting screen (상대의 다시하기를 기다리는 중입니다., no code shown). An official battle has no 다시하기; its main key is 대진표. Under them the rest are keys side by side (링크 공유, 게시판에 공유, 기록 내려받기; feedback 2026-11-06 asked for them larger than words). While a battle is played, 기권 is a full key right under the choices, in its own dark red, the one key on the battle screen that is neither navy nor white; it asks once. The whole log opens behind a row-sized key (전체 기록 at 15 with a chevron). What stays a row of words: 링크 공유 (for everyone once it ends; a spectator has it throughout), 대진표 for an official one, 게시판에 공유 (it opens the board's 글쓰기 with the title and the replay's address), 기록 내려받기 (a text file: the game's words turn by turn, then Showdown's own log), and the engine's credit muted.

**What the stage plays.** Every line of the log is staged in order: the message lights and its effect plays at once, and the next line comes when both are done, the message having stood at least 680 (at 보통); a line's reading time runs while its effect plays, never after it. A move and what comes of it are one beat, as Showdown runs them: the critical hit, the matchup, a guard or a substitute taking it and the damage land at the blow's impact, and their words join the move's in the box (the move dim, the newest lit), so a target never waits a beat to react; the targets of a spread move take their HP together, the hits of a multi-hit move one after another. The leads of both sides come out together, and the stat changes of one cause (위협 on both foes) play at once. Lines that arrive while the stage plays are played next, never left waiting for another update. All of it is `src/pages/battle/stageFx.js` (Web Animations, no dependency), and every effect gives up after its own length, since a hidden page stops animation clocks. Each stretch of a movement has its own curve (out when it leaves, in when it strikes, in and out when it settles), so nothing snaps into place; everything moves by transform and opacity, and a path is sampled densely so it never shows a corner. Every picture either side may send in is fetched when the team preview names it. The shapes are the type's, in its colour, drawn as flat solid shapes with a white heart where a light needs one (a flame, a drop, a jagged bolt, a leaf, a crystal, a crescent, a glint, an orb), never a gradient; the words over the stage are the board's plates. Every move is drawn in three layers, so none is a lone circle or a straight line: it gathers at the user, it travels and leaves its type behind it on the way, and it lands with a star of light, speed lines and what its type throws. The moves the club uses most (counted from the submitted parties) each have a drawing of their own rather than their type's, status moves included (칼춤 crosses blades over its user, 나쁜음모 and 명상 turn their sign over its head, 용의춤 and 껍질깨기 break their shell of light, 날개쉬기 lands it, 도깨비불 sends its flames floating, 하품 a slow bubble, 앵콜 claps). Richness comes from shape, layers, the camera and weight, never from a glow: shakes are small and rare, flashes brief, a hard blow washes the stage in its colour at a tenth, and only Mega Evolution flashes the stadium.

| Moment | What |
|---|---|
| a physical move | the user winds back and lunges at its target (a priority move such as 속이기 or 기습 dashes with no wind-up), two afterimages of it following a few frames late and its type left on the way (embers, bubbles, leaves, glints); at the contact the blow lands on the target while the user goes home; a contact move leaves its mark: fangs close (깨물어부수기, 번개엄니), claws rake three lines (드래곤클로), a blade cuts a crescent (리프블레이드, 깜짝베기), two lines cross (크로스촙, 시저크로스) |
| a special move | a light gathers at the user, motes spiralling in and a ring closing to a glint (never a filled disc), then the move travels as its type does, from one small table, each leaving its trail: fire a rising arc of flames with embers, water a stream of drops behind an orb with bubbles, electric a jagged bolt struck three times with a fork, grass leaves that weave and drift down, ice and steel a beam that swells twice with crystals or glints along it, psychic rings that swell, ghost a swaying orb leaving wisps, poison and ground lobbed high, flying crescents pointing the way they fly, fighting an orb in rings, fairy stars that glint; a few moves the regulation sees most change only how they travel: sounds are rings that swell (하이퍼보이스, 바크아웃), some drop from above the target with a trail (용성군, 골드러시, 눈보라), 번개 strikes from the sky, some are wider beams that hold longer (파괴광선, 솔라빔, 매지컬샤인), some orbs (문포스, 섀도볼) |
| a status move at another | four soft motes drift over in the type's colour and leave a ring, no shards; a powder (버섯포자) falls on the target |
| a move on itself | rings of its type rise around it |
| a spread move | every target at once: a special one opens a flat ring from the user's feet across the court before it reaches them, a physical one rears the user up; 스톤샤워 drops rocks on each target and ground moves shake the stage |
| a miss | the move flies on past the target, which steps aside and back; 빗나감 dim |
| a guard holds | the move stops short at the guard, and the guard's ring closes |
| a hit | the blow lands: a shockwave ring, a star of light in the type's colour with a white heart, speed lines, and what the type throws (flames that lick up, drops that splash and fall with a ripple on the floor, small bolts, leaves, crystals that jut and break, sludge, dust and stones that fall back, crossing crescents, converging rings, wisps, scales, sparkles); a critical or super effective blow adds a second ring, washes the stage in its colour and leans the camera in, a resisted one is smaller. The target is knocked back away from the foe and settles, and flashes, by how much it took, its HP sweeps down its bar cell after cell (quick at first, settling, 420 to 1100 by how much went, the colour changing where the sweep crosses a half or a fifth), a critical hit shakes the stage once; the critical hit and the matchup are said in the message window, never over the Pokémon. A multi-hit move lands hit after hit in a short rhythm (300 to 520 each): each lands its own blow and its bar takes only that hit's HP as it lands; the count is said in the message window once the last has landed |
| HP lost to something else | the Pokémon shudders in place, drawn in what took it: a burn's flames licking up it, poison bubbling up out of it, the sand's grains blown across it, hail falling on it, and rocks dropped on it as it comes in over 스텔스록; recoil and a confused self-hit only shudder |
| HP that flows | a green stream of motes and glints drifts from the one losing it to the one gaining it (기가드레인 from its target, 씨뿌리기 to the seeder), then the gain rises |
| healing | green crosses and glints rise and a ring of light climbs from its feet, and the HP gained rises on a lit plate |
| a stat change | arrows rise in fire's colour or fall in water's through the picture in columns, a band of the same colour passing the same way, and the picture brightens or dims once |
| a status | its ring, and the status drawn on it in its own shapes: a burn's flames, paralysis crackling over it, poison bubbling up, sleep's Zs, crystals closing round a freeze |
| cannot move | paralysis crackles over it in small bolts and jolts it, sleep lets out Zs that drift up, a freeze closes crystals round it and glints, a flinch jolts it back with speed lines; confusion sways it side to side first, small stars turning over its head |
| Protect and its kin | a dome of light closes around it, a ring closing onto it and a glint crossing it |
| 대타출동 | the Pokémon shrinks into a puff of smoke and the doll drops into its place, squashes as it lands and springs up; the doll is the games' stuffed plush, drawn in flat cel fills (a round ear and a tall point, eyes shut, a wavy smile, a pale cheek, a seamed ball of a belly between stubby arms, big feet forward), facing the foe as our pictures do; it squashes and springs back when a blow lands on it, and when it breaks it squashes once more and bursts in smoke and scraps of its fabric, and the Pokémon comes back where it stood |
| 변신 | the picture narrows to a line of light and opens again |
| a turn to charge | the light gathers at it twice, rings rising round it, and holds a beat (솔라빔) |
| a field or a side set up | 트릭룸 turns the space a little and back as the room comes up; hazards are dropped onto their places one after another and a web spreads out flat; a screen fades in and out as a field does, and one a blow breaks (깨뜨리다) falls apart in glass shards of its colour first |
| sent in | a light blooms where it will stand, glints scatter from it, and the Pokémon grows out of it, bright at first and settling to its own colours, with a ring of light opening round it and a ring on the floor at its feet; its picture is decoded first, so it never grows out of an empty frame |
| called back | (Redrawn 2026-11-06: the straight red beam read as a laser.) Sent in played backwards: red light takes the Pokémon from its edge in, red motes gather to its heart and a ring on the floor closes on its feet; it swells a breath and folds into its own middle (the picture closes on its centre, not its feet) as one red light, which flies home to its trainer's corner as a comet on the arc the ball came in on, up and over, its tail thinning behind it; the next ball is thrown back along the same arc. About a second at 보통. Dragged out (울부짖기), it is blown off its side on gusts |
| fainting | it stands through the blow that took its last HP, then greys where it stands, holds a beat, and sinks into the floor at its feet as it goes out, a faint ring and puffs of dust where it stood; its bar says 쓰러짐 |
| Mega Evolution | a ring in the type colours turns in and closes round it as the light inside it builds in two swells, the stage lights faintly as the ring goes out, and it stands in its new form, lit, which settles to its own colours in a burst; nothing stays lit after |
| an ability or an item | a panel slides in on its owner's side naming it (어흥염의 특성, 위협), as the games show it |

- **Reduced motion:** nothing travels or shakes and the camera stays wide; a big moment stands as its last frame; bursts, flashes, numbers and the HP bars still say what happened.

## Head and share surfaces

- **Tab icon:** the Wing Y alone, 64 wide on a transparent ground, no tile. `favicon-*.svg` is navy on a light browser and white on a dark one; `favicon-32.png` and `favicon.ico` are the fallbacks. The YPL letters are not used at tab size: at 16 they are about 5px tall and cannot be read.
- **App icons:** a navy square with the white Wing Y inside the maskable safe zone, because a home screen fills transparency with black.
- **Share image:** 1200 by 630, the navy ground and the brand alone, the mark and the wordmark centred by their ink. No sentence, no counters, no Pokémon: nothing on it can go out of date.
- **theme-color:** navy in both themes. A changed picture takes a new file name, because browsers keep icons.

## Logo

The Wing Y (`public/brand/ypl-wing-y.svg`) and the slanted solid wordmark (`public/brand/ypl-wordmark.svg`) are used as drawn, never redrawn, never animated, in the colour they stand on. On the phone bar the Wing Y is 20 tall beside the wordmark, 8 apart.

## Voice and tone

Words are under the law too. Korean, plain and factual: what happens, then what to do. These rules cover the words the site itself writes, never what people write in it, and never the game's own battle messages: those are quoted as the game prints them (Showdown's Korean text, taken from Pokémon Champions), 반말 and exclamation marks included, and only the site's words around them follow this chapter.

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

**Official names.** A thing is called by its official name: 포켓몬 챔피언스, never 포챔스 or another short form; YPL and Yonsei Pokémon League as written. A share preview and a tab title say the name and nothing else.

**No filler.** A line earns its place by saying something the screen does not already show. What reads as written by a machine goes: a sentence that repeats its label or its heading, reassurance (걱정하지 마세요, 간편하게, 손쉽게), a summary of what was just seen, a list of benefits, a line that addresses the reader's feelings. When unsure, the shorter sentence that states the fact wins.

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
- Do not move what is lit: no sliding pages, no rolling digits, no bouncing cards. What arrives may rise 12 as it lights, a pointer may nudge a picture or an arrow 4, and the battle stage moves by its own rules (Battle); nothing else travels.
- Do not animate a shadow, filter, clip, mask or background; move transform and opacity on a picture already drawn.
- Do not use View Transitions snapshots or copy the page for a transition.
- Do not put a small label above a title, or repeat one fact twice on a screen.
- Do not change data behaviour from a visual change.

## Open

Measured in the browser but not yet on a real phone at the venue: the strength of the unlit bars (8% and 6%), the 44 touch floor on the bracket's 36 rows (the whole match box is the target), and each sprite's feet on its floor. Not yet played on two real phones: an official bracket match, and the battle stage's smoothness on a phone GPU.
