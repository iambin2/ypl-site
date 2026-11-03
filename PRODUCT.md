# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: members of 포켓몬 센터 연세점 (연세대학교 포켓몬스터 동아리) — trainers who play in YPL. They open the site mostly on a phone, both on ordinary days and on tournament day at the venue, to read notices, apply, submit an official party, follow the live bracket, and look up records, rankings, titles, and the hall of fame.

Secondary: the operating committee (운영위원) using the same site in admin mode to run events end to end; newcomers who arrive from Discord to see what the league is.

## Product Purpose

YPL is the league's single source of truth: notices → application → official party submission → bracket → results → records, rankings, titles, and hall of fame, all connected in one event lifecycle. Success is that a member can find "what's next for me" and "what happened" in seconds on a phone, and that operators can run a whole tournament from the UI.

## Positioning

Not a generic club homepage: every record on the site is derived from real, operated brackets and frozen official submissions. The history (2023.05 파이컵 → 2025.06 YPL 체제 → Champions series) is the league's own.

## Operating Context

- Monthly 파이컵 (Master / Rookie league), event 파이컵 라이트, and the semester-closing 챔피언스 시리즈 (Qualifier + Final).
- Seasons roll over every March 1 / September 1 (current: YPL Season 3 from 2026-09-01).
- Community lives on Discord; the site links there.
- Team Builder follows the current Pokémon Champions regulation and saves drafts in the browser.

## Capabilities and Constraints

- Views: 홈, 소개, 공지, 게시판 (자유, 샘플, 파티), 기록 (트레이너, 대회, 포켓몬, 랭킹), 대진표 (공식, 사설), 칭호, 명예의 전당, 팀 빌더, 계산기, 더보기. URL routing via `?view=`.
- Anonymous board posts and comments by nickname; notice search; application and party submission from notices; notice alerts by Web Push.
- Admin mode behind the shared Supabase Auth login, with editors, bracket making and result entry, record apply and revert. The database is the integrity boundary.
- React 18 + Vite, deployed to GitHub Pages; data from Supabase normalized schema. Frontend redesign must not change data behavior.
- Light and dark themes with a user toggle (어둡게, 밝게, 기기 설정) are a required feature. Dark is the first visit; a chosen theme is kept and set before the first paint.

## Brand Commitments

- Name: YPL — Yonsei Pokémon League, 포켓몬 센터 연세점.
- The site has one hue, navy `#081C3D` (a darkened Yonsei blue), in solid fills only: in dark it is the ground, in light it is the words, so the whole site is one colour on one ground. The one other colour is the amber lamp, which means live and is never text. No gradient, no trophy gold, no status hue; the user prefers complete solid colours like psacard.com.
- The brand mark is the user-approved Wing Y (`public/brand/ypl-wing-y.svg`), the user's 2026-10-12 mark as refined on 2026-10-27 (candidate H, the user's pick): two raised wings, each a broad top feather and one shorter one, meet in a Y; under a straight band cut across the neck, a fan tail of three feathers split by two slits. Every edge is straight and the mark is exactly symmetric. Preserve its proportions. The wordmark is the solid slanted YPL (`public/brand/ypl-wordmark.svg`). Both are used as drawn, never redrawn. Earlier marks live only in git history.
- Copy is plain Korean prose in 합니다체: no middle-dot (·) separators, no exclamation marks, no em dashes (DESIGN.md "Voice and tone").
- Tone: an official league site, not a fan site, as plain as psacard.com. The home is the league's scoreboard: the next event as a countdown, the reigning champion, the league in numbers, then time running down the page through the season's top three, the notices and the past champions.
- Channel roles: this site is the league's first and official source of notices and records; Discord is where battles are actually played and streamed. Copy must not call Discord the first place for news.
- Unofficial fan site: Pokémon trademarks belong to Nintendo, Creatures and GAME FREAK; the footer disclaimer stays.
- Standing direction preference (2026-09-11): the category standard — a professional league site (esports-league canon: schedule, results, standings, champions) played straight, held to the craft bar of Apple / Nike brand sites (restraint, generous space, confident type, precise motion). No novelty concept worlds.
- Visual system: YPL Scoreboard, live since 2026-11-03. `DESIGN.md` is its only authority (its Philosophy chapter says why): a navy board switched off, facts lit on square panels joined by a 2px seam, seven-segment numbers, one amber lamp for what is live, every measure from phi. Smooth motion comes first: whatever moves runs on the compositor.

## Evidence on Hand

Real content only: notices, board posts, tournament results, rankings, titles, hall of fame parties, Pokémon sprites/artwork already bundled for the team builder and HOF. No testimonials, sponsors, or member counts beyond what the data computes.

## Product Principles

1. The phone at the venue is the primary screen; every flow must be one-handed and fast.
2. Records are facts — present them with the clarity of an official league archive, never decoration over data.
3. One system everywhere: public pages, admin editors, and bracket runtime speak the same visual language.
4. Operators must never lose a working function to a visual change.

## Accessibility & Inclusion

Korean-first UI. Readable type on small screens, visible focus, sufficient contrast in both themes, reduced-motion respected.
