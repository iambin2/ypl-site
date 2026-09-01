# YPL — Yonsei Pokémon League 사이트

포켓몬 센터 연세점(포센연) 자체 리그 YPL의 공식 기록 사이트. React + Vite.

- 라이브: https://iambin2.github.io/ypl-site/
- 배포: main 브랜치 push 시 GitHub Actions가 자동 빌드 후 GitHub Pages 게시
- 탭: 소개 / 공지 / 게시판 / 기록 / 대진표 / 칭호 / 명예의 전당 (관리자 로그인 시 편집)

---

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 생성
```

Node.js 18 이상. `.env.example`을 복사해 `.env`를 만들고 Supabase 값을 채웁니다.

vite base는 `/ypl-site/`로 고정되어 있습니다. GitHub Pages 경로와 묶여 있으니 바꾸지 마세요.

---

## 코드 구조

거의 모든 코드가 `src/App.jsx` 한 파일에 있습니다(약 590KB, 3,200줄). 배포를 단순하게 유지하려고 의도적으로 분리하지 않았습니다. 파일을 쪼개려면 먼저 상의해 주세요.

| 파일 | 내용 |
|---|---|
| `src/App.jsx` | 전체 UI, 로직, 스타일시트(`STYLES` 상수) |
| `src/storage.js` | 데이터 읽기/쓰기 (Supabase) |
| `index.html` | 타이틀, 파비콘(base64 인라인), 폰트 preconnect |

---

## 데이터

Supabase의 **공용 JSON 한 칸**에 전체 데이터를 저장합니다. `App.jsx`의 `SEED`는 폴백일 뿐 라이브 데이터가 아닙니다.

- **last-write-wins.** 두 명이 동시에 관리자 모드로 편집하면 나중에 저장한 쪽이 상대 작업을 통째로 덮어씁니다. 작업 전 서로 확인할 것.
- 자동 백업이 없습니다. 구조를 건드리는 작업 전에는 Table Editor에서 셀 값을 복사해 백업하세요.
- `normalizeData()`가 로드 시 누락된 배열을 보정합니다. 새 최상위 키를 추가하면 여기도 같이 수정해야 합니다.
- 파일 업로드는 없습니다. 이미지와 영상은 URL만 저장합니다.

주요 키: `rankings`, `seasons`, `tournaments`, `champions`, `titleGroups`, `announcements`, `board`, `meta`

---

## 디자인 시스템 (2026년 8월 리뉴얼, 준수 필수)

이전의 그라데이션과 금색 계열은 전부 폐기됐습니다. 현재는 미니멀 단색 체계입니다.

**색**
- 포인트 컬러는 로고 남색 `#1B3F86` 하나뿐. 다른 강조색을 추가하지 않습니다.
- 그라데이션 0개. 스타일시트와 canvas 모두.
- 색은 역할 변수로만 씁니다. 하드코딩 금지.
  - 면 `--s-page` `--s-card` `--s-soft` `--s-soft2` `--s-fill`
  - 글자 `--t-1` ~ `--t-5`
  - 선 `--ln-1` `--ln-2` `--ln-3`
  - 강조 `--ac-fill` `--ac-text` `--ac-hover`
- 레거시 변수(`--navy`, `--line`, `--muted` 등)는 위 토큰에 연결돼 있습니다. 값을 직접 바꾸지 마세요.
- 다크모드는 테두리 대신 면 밝기 차이로 구분합니다(`border-color:transparent`). 흰 윤곽선이 보이면 버그입니다.
- 색을 추가하면 라이트와 다크 양쪽에서 대비 4.5:1 이상을 확인하세요.

**모서리** 큰 면 18px / 버튼과 탭 12px / 작은 칩 10px. 원형은 쓰지 않습니다.

**글꼴** 본문 Wanted Sans, 워드마크 Anton, 세컨드 로고 `POKÉMON CENTER YONSEI`는 Cormorant Garamond. 세컨드 로고는 동아리 공식 자산이라 변경 금지.

**모션** 호버는 은은한 남색 백라이트만. 붕 뜨는 이동이나 확대는 쓰지 않습니다. 무한 반복 애니메이션도 없습니다.

**문구** 가운데점(`·`)을 쓰지 않습니다. "개인전, 더블 엘리미네이션, 8명"처럼 쉼표로 씁니다.

---

## 작업할 때 주의할 것

- **`STYLES`는 오버라이드로 쌓여 있습니다.** 뒤에 추가한 규칙이 앞을 덮으므로, 고칠 때는 최종 적용값을 확인하세요. 같은 클래스가 파일 여러 곳에 나옵니다.
- **PNG 저장 기능은 CSS를 쓰지 않습니다.** `downloadChampionPng`, `downloadBracketPng`는 canvas에 직접 그리고 색은 `BKC` 상수를 씁니다. 디자인을 바꾸면 여기도 따로 반영해야 합니다.
- **`POKE_IMG`(포켓몬 이미지, 326KB)는 지연 평가입니다.** 반드시 `pokeImg(name)` / `pokeImgTable()`로만 접근하세요. 직접 참조하면 최초 로딩이 느려집니다.
- 이미지에는 `loading="lazy" decoding="async"`를 붙입니다.
- 번들 크기를 963KB에서 590KB로 줄여 놓은 상태입니다. 큰 base64 자산을 다시 넣지 마세요.
- 파비콘은 `index.html`에 base64로 들어 있습니다. 별도 이미지 파일이 없습니다.

---

## 보안

`App.jsx` 상단의 `ADMINS`에 관리자 계정이 평문으로 있고 저장소가 공개라, 현재 관리자 로그인은 실질적인 접근 제어가 아닙니다. 구조 개선 전까지는 이 점을 전제로 작업하세요.

---

## 남은 과제

- 밴 리스트를 포켓몬별 집계(밴 횟수 순위)로도 보기
- 부전승 대 부전승 phantom 카드 화면에서 숨기기
- 응답이 많을 때 "최근 N명만 보기"
- 팀 빌더에서 짠 파티를 대회 엔트리로 바로 연결
- 더블 엘리미네이션, 조별예선 대회의 대진표 이미지 실사용 검증
