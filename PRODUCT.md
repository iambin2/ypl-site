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

- Views: 홈, 소개, 공지, 게시판, 기록 (트레이너/대회/포켓몬/랭킹), 대진표, 칭호, 명예의 전당, 팀 빌더 (도구). URL routing via `?view=`.
- Anonymous board posts and comments by nickname; notice search; application and party submission from notices.
- Client-side admin mode (soft gate) with editors, modals, bracket runtime controls, record apply/revert.
- React 18 + Vite, deployed to GitHub Pages; data from Supabase normalized schema. Frontend redesign must not change data behavior.
- Light and dark themes with a user toggle are a required feature.

## Brand Commitments

- Name: YPL — Yonsei Pokémon League, 포켓몬 센터 연세점. The user explicitly released every visual element (wordmark, color, type) for redesign except the light/dark theme feature.
- The site is neutral-only (black, white, grey), by the user's decision of 2026-09-11 that replaced the earlier Yonsei Blue commitment. No brand hue and no trophy gold; status colours only where they carry meaning.
- The brand mark is Braviary (워글, not Wooloo/우르), traced from its official artwork so a Pokémon fan recognises it at a glance: crest, forehead V, beak. Greys only, on an ink tile.
- Copy is plain Korean prose: no middle-dot (·) separators, and short intro sentences should sit on one line at laptop width.
- Tone: an official league site, not a fan site. The home page stays clean and professional; the winning party artwork belongs on the Hall of Fame page, not the home first viewport.
- Channel roles: this site is the league's first and official source of notices and records; Discord is where battles are actually played and streamed. Copy must not call Discord the first place for news.
- Unofficial fan site: Pokémon trademarks belong to Nintendo · Creatures · GAME FREAK; the footer disclaimer stays.
- Standing direction preference (2026-09-11): the category standard — a professional league site (esports-league canon: schedule, results, standings, champions) played straight, held to the craft bar of Apple / Nike brand sites (restraint, generous space, confident type, precise motion). No novelty concept worlds.

## Evidence on Hand

Real content only: notices, board posts, tournament results, rankings, titles, hall of fame parties, Pokémon sprites/artwork already bundled for the team builder and HOF. No testimonials, sponsors, or member counts beyond what the data computes.

## Product Principles

1. The phone at the venue is the primary screen; every flow must be one-handed and fast.
2. Records are facts — present them with the clarity of an official league archive, never decoration over data.
3. One system everywhere: public pages, admin editors, and bracket runtime speak the same visual language.
4. Operators must never lose a working function to a visual change.

## Accessibility & Inclusion

Korean-first UI. Readable type on small screens, visible focus, sufficient contrast in both themes, reduced-motion respected.
