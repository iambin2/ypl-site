# YPL — Yonsei Pokémon League 사이트

포켓몬 센터 연세점 공식 배틀 리그 기록 사이트입니다.
React 18 + Vite로 만든 정적 SPA이며, GitHub Pages에 자동 배포됩니다.

- 배포 주소: https://iambin2.github.io/ypl-site/
- 데이터: Supabase (정규화 스키마 + 레거시 key-value 테이블)

---

## 0. 준비물

- **Node.js 20 이상** (https://nodejs.org — LTS). CI도 Node 20으로 빌드합니다.
- 터미널에서 `node -v` 가 버전을 출력하면 OK

---

## 1. 로컬 실행

```bash
npm install      # 처음 한 번만
npm run dev      # 개발 서버 → http://localhost:5173
```

종료는 `Ctrl + C`.

```bash
npm run build    # dist/ 생성 (실제 배포물)
npm run preview  # 빌드 결과 미리보기
npm test         # 테스트 249개 실행
```

테스트 한 개만 돌리려면 파일을 직접 실행합니다. 각 테스트는 `node:test` 단독 모듈이라 러너 설정이 없습니다.

```bash
node tests/championsCore.test.mjs
```

---

## 2. 환경변수

프로젝트 루트에 `.env` 를 만들고 (`.env.example` 참고) 아래 세 개를 채웁니다.

| 변수 | 설명 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | anon public 키 |
| `VITE_YPL_DATA_SCHEMA` | 정규화 데이터 스키마 이름 (운영값 `ypl_schema_validation`) |

값은 Supabase 대시보드 **Project Settings → API** 에서 복사합니다.
운영 빌드가 쓰는 값은 저장소의 `.env.production` 에 들어 있습니다.

`VITE_SUPABASE_*` 를 비워 두면 사이트는 `localStorage` 모드로 떨어집니다. 이 경우 관리자 편집이 **그 브라우저에만** 저장되고 다른 사람에게는 보이지 않습니다. 현재 동작 모드는 `src/storage.js` 의 `STORAGE_MODE` (`artifact` / `supabase` / `local`) 로 확인합니다.

---

## 3. 배포 — GitHub Pages

`main` 에 push하면 `.github/workflows/deploy.yml` 이 빌드해서 자동 배포합니다. 수동 작업은 없습니다.

두 가지만 주의하세요.

- `vite.config.js` 의 `base: "/ypl-site/"` 는 **저장소 이름과 반드시 같아야** 합니다. 저장소 이름을 바꾸면 이 값도 함께 바꿔야 링크와 정적 자산 경로가 살아 있습니다.
- 빌드 시 `version.json` 이 함께 생성되고, `index.html` 에 주입된 스크립트가 이 파일을 확인해 **새 배포가 감지되면 페이지를 자동으로 새로고침**합니다. 방문자가 캐시된 옛 화면에 머무르지 않게 하는 장치이므로, `index.html` 의 head나 `base` 를 건드릴 때 같이 확인하세요.

---

## 4. Supabase

### 데이터 소스가 두 개입니다

- **정규화 스키마** (`ypl_schema_validation`) — 진행 중인 모든 대회의 정본입니다. 시즌·공지·신청·공식 파티 제출·참가자·대진 런타임·경기·결과·랭킹이 전부 여기 있습니다.
- **레거시 `public.site_data`** — 사이트 수준 데이터와, 정규화 이전에 끝난 옛 대진표의 **읽기 전용** 보존용입니다. 새 대진표를 여기에 쓰면 안 됩니다.

자세한 규칙과 불변식은 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 에 있습니다. 데이터 관련 코드를 고치기 전에 반드시 읽으세요.

### 새 환경을 세팅한다면

`supabase_setup.sql` 은 **레거시 `site_data` 키-값 테이블만** 만듭니다. 정규화 스키마는 이 파일에 포함돼 있지 않으며, 운영 DB로의 마이그레이션·컷오버는 이미 완료된 상태입니다(`docs/ARCHITECTURE.md` §9). 새 환경을 처음부터 구축해야 한다면 그 문서의 마이그레이션 절차를 따르세요.

### 보안 상태 (알고 계셔야 할 것)

현재 앱 테이블과 `public.site_data` 에는 RLS가 켜져 있지 않고, anon 키로 쓰기가 가능합니다. 동아리 내부용으로는 통용되지만 완전한 보안은 아닙니다. Auth/RLS 강화와 RPC 권한 정리는 기능 호환성을 유지한 채 진행할 별도 후속 작업으로 남아 있습니다(`docs/ARCHITECTURE.md` §10).

---

## 5. 관리자 로그인

- 화면 우측 상단 **관리자** 버튼
- 아이디 `yplofficial` / 비밀번호 `yplofficial123!`
- 계정을 바꾸려면 [`src/admin/adminAuth.js`](src/admin/adminAuth.js) 의 `ADMINS` 배열을 수정합니다.

> ⚠️ 비밀번호가 코드에 들어가는 **클라이언트 측 소프트 게이트**입니다. 소스를 열면 보입니다. 실제 권한 검증은 위 4절의 Auth/RLS 작업에서 다룹니다.

---

## 6. 폴더 구조

```
ypl-site/
├─ index.html                 # 진입 HTML
├─ vite.config.js             # base 경로 + 버전 자동 새로고침 플러그인
├─ supabase_setup.sql         # 레거시 site_data 테이블 생성 SQL
├─ .github/workflows/deploy.yml
├─ docs/
│  ├─ ARCHITECTURE.md         # 데이터 구조와 불변식 (정본)
│  ├─ ROADMAP.md
│  ├─ brand/                  # 로고 원본
│  └─ db/
├─ scripts/                   # 운영 스크립트 (아래 7절)
├─ tests/                     # node:test 회귀 테스트 33개 파일
├─ public/
└─ src/
   ├─ main.jsx                # React 진입점
   ├─ App.jsx                 # 셸 — 뷰 상태, 사이트 데이터, 관리자 모드
   ├─ storage.js              # 저장 어댑터 (artifact → Supabase → localStorage)
   ├─ pages/                  # 화면 (홈, 기록, 대진표, 칭호, 팀 빌더 …)
   ├─ components/             # 공용 UI (common/, layout/)
   ├─ admin/                  # 관리자 모드 (에디터, 모달, 모드 바)
   ├─ services/               # 도메인 로직 — 대진 lifecycle, projection, 기록, 챔피언스
   ├─ data/                   # 팀 빌더 규정·현지화 데이터
   └─ styles/                 # tokens.css 기반 CSS 8개 파일
```

화면 이동은 라우터 라이브러리 없이 `?view=` 쿼리스트링으로 처리합니다 (`src/services/appRouting.js`).

디자인을 고칠 때는 `src/styles/tokens.css` 의 토큰을 먼저 확인하세요. 라이트/다크 두 테마가 `<html data-theme>` 위에 얹혀 있어서, 색을 직접 써 넣으면 한쪽 테마가 조용히 깨집니다. 전체 디자인 시스템은 [`DESIGN.md`](DESIGN.md), 제품 원칙과 브랜드 규칙은 [`PRODUCT.md`](PRODUCT.md) 에 있습니다.

---

## 7. 운영 스크립트

```bash
node scripts/backup-data.mjs [출력폴더]   # Supabase 전체 읽기 전용 스냅샷
node scripts/class-coverage.mjs           # 스타일 규칙이 없는 className 찾기
```

`backup-data.mjs` 는 `.env.production` 의 anon 키를 사용하며, RLS로 가려진 테이블은 조용히 건너뛰지 않고 보고합니다. 복구는 의도적인 수동 작업입니다.

`class-coverage.mjs` 는 현재 659개 중 43개가 매칭되지 않는 것이 기준선입니다(동적·조합 클래스명). 중요한 건 **내 변경이 새로 늘렸는지** 여부입니다.

`scripts/generate-normalized-migration.mjs` 는 레거시 CSV를 정규화 SQL로 변환하는 일회성 마이그레이션 도구입니다.
