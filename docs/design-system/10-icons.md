# 10 아이콘

사이트 자체 아이콘 세트 하나만 쓴다. 코드의 `src/components/common/Icon.jsx`에 있는 42종이다.

arrow, back, up, down, chev, chevl, chevr, ext, x, check, alert, plus, minus, search, edit, trash, refresh, download, lock, msg, image, video, link, form, list, crown, bolt, map, handshake, medal, spark, swords, chart, trophy, gear, dice, moon, sun, sort, calendar, pin, team, discord.

## 규칙

- 24 격자, 획 `stroke-icon`(2px), 둥근 끝과 둥근 이음, 색은 `currentColor`.
- 크기는 16, 20, 24 세 가지. 글자 옆에서는 글자 크기에 맞춘다: 15px 이하 글자에 16, 17~20px에 20, 그 이상에 24.
- 글자와 나란히 놓을 때 아이콘의 중심을 한글의 중심에 맞춘다(`vertical-align: -0.125em`). 아이콘과 글자 사이는 `space-1`(4) 또는 `space-2`(8).
- 채운 아이콘은 crown, handshake, discord 셋. 그 밖에 선택된 상태를 채운 아이콘으로 바꾸지 않는다. 선택은 면으로 표시한다(09 상호작용 상태).
- 아이콘만 있는 버튼은 원형 44px, 접근 가능한 이름을 단다.
- 이모지와 글자 기호(▾, ✓, →)를 아이콘으로 쓰지 않는다.
- 새 아이콘이 필요하면 같은 격자와 획으로 세트에 더한다. 다른 세트에서 가져오지 않는다.
