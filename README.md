# YPL — Yonsei Pokémon League 사이트

포켓몬 센터 연세점 공식 배틀 리그 기록 사이트입니다.
React + Vite 프로젝트이며, Netlify에 바로 배포할 수 있습니다.

---

## 0. 준비물

- **Node.js 18 이상** 설치 (https://nodejs.org — LTS 버전)
- 설치 후 터미널에서 `node -v` 가 버전을 출력하면 OK

---

## 1. 로컬에서 실행해 보기

이 폴더에서 터미널을 열고:

```bash
npm install      # 처음 한 번만 (의존성 설치)
npm run dev      # 개발 서버 실행 → 터미널에 뜨는 http://localhost:5173 접속
```

화면을 확인했으면 `Ctrl + C` 로 종료합니다.

배포용 정적 파일을 만들려면:

```bash
npm run build    # dist/ 폴더가 생성됩니다 (이게 실제 배포물)
npm run preview  # 빌드 결과를 로컬에서 미리보기
```

---

## 2. Netlify에 배포하기 (무료)

### 방법 A — GitHub 연동 (추천, 이후 자동 배포)

1. 이 폴더를 GitHub 저장소에 올립니다.
   ```bash
   git init
   git add .
   git commit -m "YPL site"
   git branch -M main
   git remote add origin https://github.com/<아이디>/ypl-site.git
   git push -u origin main
   ```
2. https://app.netlify.com → **Add new site → Import an existing project** → GitHub 저장소 선택
3. 빌드 설정은 자동 인식됩니다(`netlify.toml` 덕분). 그대로 **Deploy**
4. `https-...netlify.app` 주소가 생기고, 이후 GitHub에 push 할 때마다 자동 재배포됩니다.
5. 사이트 이름/도메인은 Netlify 대시보드 **Site settings → Domain** 에서 바꿀 수 있습니다.

### 방법 B — 드래그 앤 드롭 (가장 빠름, 자동배포는 없음)

1. `npm run build` 로 `dist/` 생성
2. https://app.netlify.com/drop 에 **`dist` 폴더를 통째로 끌어다 놓기**
3. 끝. (수정할 때마다 다시 빌드 후 드롭해야 합니다)

> 커스텀 도메인(예: ypl.yourclub.com)이 있으면 Netlify Domain 설정에서 연결할 수 있습니다.

---

## 3. 관리자 편집 내용을 "모두에게 공유"되게 저장하기 — Supabase 연동

현재 Supabase를 설정하지 않으면, 관리자 편집은 **그 브라우저(localStorage)에만** 저장됩니다.
즉 다른 사람에게는 반영되지 않습니다. 모두에게 공유되는 진짜 저장을 원하면 아래를 따라 하세요. (무료 플랜으로 충분)

### 3-1. Supabase 프로젝트 만들기
1. https://supabase.com 가입 → **New project** 생성 (지역은 Northeast Asia(Seoul) 추천)
2. 프로젝트가 켜지면 좌측 **SQL Editor** 열기
3. 이 폴더의 **`supabase_setup.sql`** 내용을 붙여넣고 **Run** → 테이블/권한 생성 완료

### 3-2. 키 복사
- 좌측 **Project Settings → API** 에서 두 값을 복사:
  - **Project URL** (예: `https://abcd1234.supabase.co`)
  - **anon public** 키 (긴 문자열)

### 3-3. 환경변수 넣기
**로컬 테스트용**: 이 폴더에 `.env` 파일을 만들고 (`.env.example` 복사):
```
VITE_SUPABASE_URL=여기에_Project_URL
VITE_SUPABASE_ANON_KEY=여기에_anon_키
```

**Netlify 배포용**: Netlify 대시보드 → **Site settings → Environment variables** 에
위 두 변수(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)를 똑같이 추가하고 **재배포**.

이제 관리자가 수정·저장하면 Supabase에 저장되고, 모든 방문자에게 같은 내용이 보입니다.

> 동작 모드 확인: 브라우저 콘솔에서 `localStorage`/`supabase` 중 무엇을 쓰는지 보고 싶으면,
> `src/storage.js` 의 `STORAGE_MODE` 값을 참고하세요. (`artifact` / `supabase` / `local`)

### 3-4. (선택) 더 안전하게 — 아무나 덮어쓰지 못하게 잠그기
현재는 anon 키로 누구나 쓰기가 가능합니다(동아리 내부용으론 보통 충분).
더 엄격하게 하려면 Supabase **Authentication** 으로 관리자 계정을 만들고,
`supabase_setup.sql` 의 write 정책을 `auth.role() = 'authenticated'` 조건으로 바꾸면 됩니다.
이 단계가 필요하면 알려주세요. (로그인 모달을 Supabase Auth와 연결하는 코드까지 추가해 드립니다.)

---

## 4. 관리자 로그인

- 화면 우측 상단 **관리자** 버튼
- 아이디: `yplofficial` / 비밀번호: `yplofficial123!`
- 계정을 바꾸려면 `src/App.jsx` 상단의 `ADMINS` 배열을 수정하세요.

> ⚠️ 이 로그인은 코드에 비밀번호가 들어가는 **클라이언트 측 소프트 게이트**입니다.
> 동아리 내부용으로는 충분하지만 완전한 보안은 아닙니다(소스를 열면 보입니다).
> 강한 인증이 필요하면 위 3-4의 Supabase Auth 연동을 쓰세요.

---

## 5. 폴더 구조

```
ypl-site/
├─ index.html            # 진입 HTML
├─ package.json          # 의존성/스크립트
├─ vite.config.js        # 빌드 설정
├─ netlify.toml          # Netlify 배포 설정(SPA 리다이렉트 포함)
├─ supabase_setup.sql    # Supabase 테이블 생성 SQL
├─ .env.example          # 환경변수 예시
├─ public/
│  └─ favicon.png        # 탭 아이콘(YPL 로고)
└─ src/
   ├─ main.jsx           # React 진입점
   ├─ App.jsx            # 사이트 전체 (UI·데이터·관리자 편집)
   └─ storage.js         # 저장 어댑터(아티팩트→Supabase→localStorage)
```

자주 바꾸는 곳:
- 포켓몬 이미지/데이터/문구 등 대부분은 `src/App.jsx` 안에 있습니다.
- 색·폰트 등 디자인은 `App.jsx` 상단의 `STYLES` 문자열에서 조정합니다.
