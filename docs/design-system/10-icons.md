# 10 아이콘

사이트 자체 아이콘 세트 하나만 쓴다. 코드의 `src/components/common/Icon.jsx`에 있는 42종이다.

arrow, back, up, down, chev, chevl, chevr, ext, x, check, alert, plus, minus, search, edit, trash, refresh, download, lock, msg, image, video, link, form, list, crown, bolt, map, handshake, medal, spark, swords, chart, trophy, gear, dice, moon, sun, sort, calendar, pin, team, discord.

## 규칙

- 24 격자, 획 `stroke-icon`(2px), 둥근 끝과 둥근 이음, 색은 `currentColor`.
- 크기는 16, 18, 20, 24. 헤더 아이콘 버튼 안은 18, 글자 옆은 글자 크기에 맞춘다.
- 아이콘만 있는 버튼은 원형 44px(`target`), `fill` 면, 접근 가능한 이름을 단다. 헤더의 테마 버튼(다크에서는 해, 라이트에서는 달)과 메뉴 버튼(같은 굵기의 두 줄).
- 카드와 목록의 "다음으로"는 28px(데스크톱 32px) `fill` 원 안의 화살표 하나. 글자 기호 화살표(→)는 섹션 링크 글자 끝에만.
- 실버를 아이콘에 칠하지 않는다. 아이콘은 `ink`나 `text-2`.
- 이모지를 아이콘으로 쓰지 않는다. 새 아이콘은 같은 격자와 획으로 세트에 더한다.
