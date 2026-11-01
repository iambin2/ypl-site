# Phase 1 원본 인벤토리 (2026-11-01, 커밋 전 YPL Navy 작업 트리 기준)

스크립트로 src 전체를 센 결과입니다. 코드는 수정하지 않았습니다.

```text
files 9 decls 4956 inline 81 lines 2371

## font-size: 21 distinct, 310 uses
83x .8125rem | 81x .9375rem | 52x .75rem | 25x 1rem | 19x 1.25rem | 18x 1.0625rem | 8x 1.5rem | 4x 1.75rem | 3x var(--fig-s) | 3x var(--display) | 3x var(--hero-4) | 2x var(--fig-m) | 1x var(--hero) | 1x var(--hero-2) | 1x var(--hero-3) | 1x 1.125rem | 1x var(--display-l) | 1x var(--fig-l) | 1x 2.25rem | 1x inherit | 1x clamp(1.75rem, 1.5rem + 1vw, 2.25rem)

## font-weight: 4 distinct, 208 uses
134x 600 | 58x 700 | 13x 400 | 3x 500

## line-height: 11 distinct, 141 uses
29x 1 | 29x 1.45 | 27x 1.55 | 26x 1.25 | 16x 1.35 | 6x 1.15 | 4x 1.06 | 1x 1.25em | 1x 1.8 | 1x 28px | 1x 1.15em

## letter-spacing: 6 distinct, 49 uses
21x -.02em | 16x -.015em | 6x -.025em | 3x inherit | 2x 0 | 1x .01em

## font-family: 0 distinct, 0 uses


## space tokens: 66 distinct, 1023 uses
198x var(--s2) | 180x var(--s3) | 179x 0 | 125x var(--s4) | 98x var(--s1) | 38x var(--s5) | 31x var(--s6) | 20x auto | 14x - | 11x var(--s8) | 11x var(--grid-gap) | 10x var(--s10) | 7x calc(var(--s4) | 6x var(--section)) | 6x var(--s14) | 5x var(--gutter) | 5x calc(var(--s2) * -1) | 5x 44px | 4x calc(var(--s6) | 3x var(--s4)) | 3x 6px | 3x 48px | 3x var(--pad) | 3x + | 3x 120px | 2x var(--section) | 2x var(--s6)) | 2x calc(var(--gutter) * -1) | 2x var(--grid-gap)) | 2x env(safe-area-inset-bottom, 0px)) | 2x calc(var(--hole) / -2) | 2x var(--chapter) | 2x .06em | 2x -75vmax | 2x -45vmax | 2x calc(var(--grid-gap) | 1x calc(var(--s1) * -1) | 1x var(--bk-gap) | 1x 28px | 1x 2px | 1x calc(var(--s2) | 1x calc(var(--s3) * -1) | 1x 52px | 1x calc(var(--pad) * -1) | 1x calc((var(--s6)

## space raw px only: 14 distinct, 26 uses
5x 44px | 3x 6px | 3x 48px | 3x 120px | 2x -75vmax | 2x -45vmax | 1x 28px | 1x 2px | 1x 52px | 1x 56px | 1x 112px | 1x 96px | 1x 104px | 1x -1px

## radius: 18 distinct, 146 uses
38x var(--r-pill) | 30x 50% | 25x var(--r-tile) | 14x var(--r-row) | 8x var(--r-card) | 7x var(--r) | 5x var(--r-field) | 3x inherit | 3x var(--r-hero) | 2x 16px | 2x 8px | 2x var(--r, var(--r-row)) | 2x 18px | 1x 30% | 1x var(--r-row) 0 0 var(--r-row) | 1x 0 var(--r-row) var(--r-row) 0 | 1x var(--r-card) var(--r-card) 0 0 | 1x 0

## border (shorthand): 7 distinct, 35 uses
27x 0 | 3x var(--stroke-connector) solid var(--bk-line) | 1x var(--stroke-connector) solid var(--line) | 1x 2px solid var(--fg) | 1x 3px solid var(--on-bar) | 1x 1.5px solid var(--ring) | 1x 3px solid transparent

## box-shadow: 9 distinct, 27 uses
11x inset 0 1px 0 var(--line) | 8x none | 2x var(--pod-rim) | 1x 0 0 0 130vmax var(--bar) | 1x 0 0 0 2px var(--stage) | 1x none !important | 1x inset 0 0 0 1.5px var(--fg) | 1x var(--plate-shadow) | 1x var(--l3-shadow)

## drop-shadow/filter: 3 distinct, 3 uses
1x brightness(calc(1 - (1 - var(--s)) * var(--recede) * 3)) | 1x brightness(.55) | 1x invert(1)

## z-index: 16 distinct, 31 uses
9x 1 | 4x 3 | 2x var(--z-popover) | 2x 16 | 2x 20 | 2x 6 | 1x var(--z-toast) | 1x var(--z-modal) | 1x 4 | 1x calc(var(--s) * 10) | 1x 0 | 1x 500 | 1x 15 | 1x 60 | 1x 19 | 1x 90

## durations: 15 distinct, 163 uses
75x var(--dur-fast) | 53x var(--dur-snappy) | 6x var(--dur-slow) | 5x var(--dur-soft) | 5x 90ms | 5x var(--dur-stage) | 4x var(--dur-base) | 2x 1.8s | 2x 240ms | 1x 200ms | 1x 1.6s | 1x 2s | 1x 1.2s | 1x 900ms | 1x 60ms

## easings: 6 distinct, 163 uses
100x var(--ease-out) | 53x var(--spring-snappy) | 3x var(--spring-soft) | 3x var(--ease-in-out) | 2x var(--ease-in) | 2x linear

## transition: all: 0 distinct, 0 uses


## breakpoints: 11 distinct, 60 uses
18x min-width:860 | 15x max-width:639 | 8x min-width:1024 | 4x max-width:859 | 4x min-width:640 | 3x max-width:1023 | 3x min-width:1100 | 2x min-width:760 | 1x max-width:1279 | 1x min-width:860 (js) | 1x min-width:1100 (js)

## max-width: 8 distinct, 17 uses
10x 100% | 1x 639px | 1x 110px | 1x 880px | 1x 560px | 1x 440px | 1x calc(100% - var(--gutter) * 2) | 1x 520px

## width with min(...): 12 distinct, 13 uses
2x min(100% - var(--gutter) * 2, var(--content)) | 1x min(780px, 100%) | 1x min(100%, 420px) | 1x min(360px, 100%) | 1x min(100% - var(--gutter) * 2, 380px) | 1x min(100% - 48px, 560px) | 1x min(var(--mon) * 5.4, 100cqi + var(--gutter) * 2) | 1x min(100% - 48px, 760px) | 1x min(100% - 48px, 680px) | 1x min(100%, 360px) | 1x min(100% - var(--gutter) * 2, 440px) | 1x min(100% - var(--gutter) * 2, 1200px)

## opacity: 13 distinct, 51 uses
21x 0 | 11x 1 | 3x var(--opacity-dim) | 3x .7 | 3x var(--opacity-disabled) | 2x .55 | 2x .75 | 1x .6 | 1x .3 | 1x .5 | 1x .26 | 1x .14 | 1x .35

## cursor: 4 distinct, 16 uses
10x pointer | 3x not-allowed | 2x default | 1x grab

## colour literals in tokens.css: 39 distinct, 87 uses
14x #ffffff | 13x #081c3d | 7x #1d3156 | 4x #000 | 3x #b3bed1 | 3x rgb(8 28 61 / .1) | 3x #5b6375 | 2x #12284c | 2x #a2abbc | 2x #e0e4ea | 2x #0c2147 | 2x #2a4170 | 2x #e6e9ee | 2x #4a5264 | 2x #eceef2 | 1x #3a4763 | 1x #9fb0cc | 1x rgb(255 255 255 / .12) | 1x #d5dce8 | 1x rgb(255 255 255 / .1) | 1x rgb(255 255 255 / .18) | 1x rgb(255 255 255 / .06) | 1x rgb(0 0 0 / .6) | 1x rgb(255 255 255 / .08) | 1x rgb(4 14 31 / .6) | 1x rgb(255 255 255 / .85) | 1x rgb(255 255 255 / .2) | 1x rgb(255 255 255 / .6) | 1x #f3f5f8 | 1x rgb(255 255 255 / .16) | 1x #2f3f5c | 1x rgb(8 28 61 / .06) | 1x rgb(8 28 61 / .11) | 1x rgb(8 28 61 / .035) | 1x rgb(8 28 61 / .3) | 1x rgb(8 28 61 / .04) | 1x rgb(8 28 61 / .45) | 1x rgb(8 28 61 / .7) | 1x rgb(8 28 61 / .28)

## colour literals outside tokens.css: 20 distinct, 20 uses
1x #000 @pages.css .bd-yt | 1x color-mix(in srgb, var(--fg) 30%, transparent) @pages.css .hof-stage, .hx-party.dais | 1x #9fa19f @team-builder.css .type-normal | 1x #e62829 @team-builder.css .type-fire | 1x #2980ef @team-builder.css .type-water | 1x #fac000 @team-builder.css .type-electric | 1x #3fa129 @team-builder.css .type-grass | 1x #3fd8ff @team-builder.css .type-ice | 1x #ff8000 @team-builder.css .type-fighting | 1x #9141cb @team-builder.css .type-poison | 1x #915121 @team-builder.css .type-ground | 1x #81b9ef @team-builder.css .type-flying | 1x #ef4179 @team-builder.css .type-psychic | 1x #91a119 @team-builder.css .type-bug | 1x #afa981 @team-builder.css .type-rock | 1x #704170 @team-builder.css .type-ghost | 1x #5060e1 @team-builder.css .type-dragon | 1x #624d4e @team-builder.css .type-dark | 1x #60a1b8 @team-builder.css .type-steel | 1x #ef70ef @team-builder.css .type-fairy

## colour literals in JS by file teamSheetImage.js,39 | BracketsPage.jsx,10 | RecordsPage.jsx,1 | normalizedRecordsProjection.js,1

## colour vars used: 41 distinct, 557 uses
134x fg-3 | 89x fg | 83x fg-2 | 41x tint | 37x tint-soft | 23x surface-2 | 18x accent | 18x on-accent | 16x surface | 16x line | 14x tint-strong | 11x on-bar | 7x bar | 4x pod | 4x on-bar-2 | 3x soft-hover | 3x well | 3x focus | 3x plate-l3 | 3x bar-up | 3x stage | 2x accent-hover | 2x rank-n | 2x window | 2x band | 1x soft | 1x accent-hl | 1x scrim | 1x case | 1x case-cur | 1x label | 1x on-label | 1x on-label-2 | 1x rank-1 | 1x rank-2 | 1x rank-3 | 1x tabs | 1x lens | 1x plate | 1x plate-shadow

## inline style props: 38 distinct, 81 uses
8x color: "var(--fg)" | 7x marginTop: 12 | 5x margin: 0 | 5x animationDelay: (i*STAGGER.row)+"ms" | 4x marginTop: 8 | 3x marginRight: "auto" | 3x marginBottom: 0 | 3x width: "auto" | 3x fontWeight: 600 | 3x height: totalH | 2x marginBottom: 12 | 2x marginBottom: 16 | 2x display: "flex" | 2x flexWrap: "wrap" | 2x justifyContent: "flex-end" | 2x marginTop: 4 | 2x cursor: "pointer" | 2x flex: 1 | 2x top: (centers[ri][j]-BK_MATCH_H/2)+"px" | 1x marginTop: -12 | 1x marginBottom: enabled?16:0 | 1x minHeight: 120 | 1x alignItems: "center" | 1x gap: 12 | 1x gap: 8

## tokens defined 104 unused: --bar-line

## text-wrap: 1 distinct, 4 uses
4x balance

## filter brightness etc: 0 distinct, 0 uses


## <button> first class: 59 distinct, 237 uses
92x btn | 49x ypl-btn | 8x bd-del | 7x nb-back | 5x tb-clear | 4x fb-ic | 4x pg-btn | 4x ypl-row | 4x ann-apply | 3x press | 2x fold-head | 2x ed-del | 2x ed-mv | 2x brand | 2x iconbtn | 2x bd-head | 2x records-round-toggle | 2x rc-name-link | 1x admin-dock-out | 1x fb-addopt | 1x fb-addq | 1x ed-x | 1x dd-btn+sel?: | 1x dd-opt+o.value===value? | 1x ls-clear | 1x mi | 1x modal-x | 1x ypl-more | 1x pg-btn+p===page? | 1x pick-row | 1x dd-btn | 1x current.danger | 1x ypl-table__name | 1x tab | 1x navlink | 1x bar-cta | 1x sc-pick-row | 1x sc-choose-mon | 1x sc-tile | 1x bk-bout-win+winner? | 1x bk-slot+isWin? | 1x bk-submission-toggle | 1x bk-submission-refresh | 1x calc-toggle | 1x calc-result-head | 1x calc-mon | 1x calc-versus-mon | 1x card | 1x hm-slab | 1x hm-all
button without class 3
## non-button onClick 4 1x Modal.jsx:div | 1x BracketsPage.jsx:div | 1x HomePage.jsx:section | 1x TeamBuilderPage.jsx:span
## inputs: 13 distinct, 129 uses
104x input.(none) | 10x textarea.(none) | 3x input.tb-input | 2x input.ed-w | 2x input.tb-stat-number | 1x input.ch-name | 1x input.fb-label | 1x input.bd-cform-nick | 1x input.bd-cform-pin | 1x input.bd-cform-body | 1x input.bd-cform-link | 1x input.bk-tc-name | 1x input.bk-tc-mem
## states (rule exists in CSS)
ypl-btn                [ 'hover', ':hover' ] Y active - focus - disabled Y
btn                    [ 'hover', ':hover' ] Y active - focus - disabled Y
btn-ghost              [ 'hover', ':hover' ] - active - focus - disabled -
tb-main-btn            [ 'hover', ':hover' ] Y active - focus - disabled Y
navlink                [ 'hover', ':hover' ] Y active - focus - disabled -
tab                    [ 'hover', ':hover' ] Y active - focus - disabled -
iconbtn                [ 'hover', ':hover' ] - active - focus - disabled -
bar-cta                [ 'hover', ':hover' ] Y active - focus - disabled -
modal-x                [ 'hover', ':hover' ] Y active - focus - disabled -
pg-btn                 [ 'hover', ':hover' ] - active - focus - disabled -
dd-btn                 [ 'hover', ':hover' ] - active - focus - disabled -
dd-opt                 [ 'hover', ':hover' ] Y active - focus Y disabled Y
mi                     [ 'hover', ':hover' ] Y active Y focus Y disabled Y
seg-track > button     [ 'hover', ':hover' ] Y active - focus - disabled -
ypl-row                [ 'hover', ':hover' ] Y active Y focus - disabled Y
nb-item                [ 'hover', ':hover' ] Y active - focus - disabled -
bd-head                [ 'hover', ':hover' ] Y active - focus - disabled -
pick-row               [ 'hover', ':hover' ] Y active - focus - disabled Y
hof-plaque             [ 'hover', ':hover' ] Y active - focus - disabled -
hm-slab                [ 'hover', ':hover' ] Y active - focus - disabled -
hm-route               [ 'hover', ':hover' ] Y active - focus - disabled -
hm-row                 [ 'hover', ':hover' ] Y active - focus - disabled -
hm-all                 [ 'hover', ':hover' ] - active - focus - disabled -
rc-chip                [ 'hover', ':hover' ] - active - focus - disabled -
ff-choice              [ 'hover', ':hover' ] - active - focus - disabled -
fold-head              [ 'hover', ':hover' ] - active - focus - disabled -
bk-slot                [ 'hover', ':hover' ] Y active - focus - disabled Y
tb-pokemon-row         [ 'hover', ':hover' ] Y active - focus - disabled Y
fb-ic                  [ 'hover', ':hover' ] - active - focus - disabled -
ed-mv                  [ 'hover', ':hover' ] Y active - focus - disabled Y
ed-del                 [ 'hover', ':hover' ] - active - focus - disabled -
lsearch input          [ 'hover', ':hover' ] - active - focus - disabled -
ann-link               [ 'hover', ':hover' ] - active - focus - disabled -
press class uses 101 | hl uses 11
focus-visible rules 6 outline:none 6
aria-label 80
## icons
27x 16 | 19x 14 | 14x 18 | 12x 15 | 10x 13 | 10x 12 | 4x 22 | 2x 20 | 2x 24 | 1x 30
raw <svg outside Icon.jsx SiteHeader.jsx:2 HomePage.jsx:4 RecordsPage.jsx:2
glyph arrows in copy {
  '… Pager.jsx': 2,
  '… teamSheetImage.js': 2,
  '↑ teamSheetImage.js': 1,
  '↓ teamSheetImage.js': 1,
  '… BoardPage.jsx': 4,
  '↑ BoardPage.jsx': 1,
  '↓ BoardPage.jsx': 1,
  '→ BracketsPage.jsx': 3,
  '… BracketsPage.jsx': 15,
  '✓ BracketsPage.jsx': 1,
  '↑ CalculatorPage.jsx': 1,
  '↓ CalculatorPage.jsx': 1,
  '→ HomePage.jsx': 1,
  '… NewsPage.jsx': 1,
  '→ TeamBuilderPage.jsx': 1,
  '… TeamBuilderPage.jsx': 8,
  '↑ TeamBuilderPage.jsx': 1,
  '↓ TeamBuilderPage.jsx': 1,
  '→ championsData.js': 2,
  '→ eventName.js': 2,
  '→ seasonLabel.js': 2,
  '↑ teamBuilderCore.js': 2,
  '↓ teamBuilderCore.js': 2
}
## korean strings 2412
[ [ '합니다체', 492 ], [ '해요체', 113 ], [ '한다체', 105 ], [ '기타', 5 ] ]
해요체 예 이 챔피언 기록을 삭제할까요? @AdminModalHost.jsx | 이 칭호를 삭제할까요? @AdminModalHost.jsx | 공지 저장에 실패했습니다. 대회 상태를 확인해 주세요. @AdminModalHost.jsx | 이 공지를 삭제할까요? @AdminModalHost.jsx | 운영진 전용입니다. 관리자 계정으로 로그인해 주세요. @AdminEditors.jsx | 챔피언 이름을 입력해 주세요. @AdminEditors.jsx | 포켓몬 이름을 입력하면 이미지가 자동으로 표시됩니다. 폼이 있 @AdminEditors.jsx | 이름에는 트레이너를, 아래에는 파트너 포켓몬을 쉼표(,)로 구 @AdminEditors.jsx | 신청 저장을 확인하지 못했습니다. 다시 시도해 주세요. @App.jsx | 선발전 종료 조건을 확인해 주세요. @ChampionsBracketControls.jsx | 본선에 제출, 대진, 결과가 하나도 없을 때만 선발전 종료를  @ChampionsBracketControls.jsx | 선발전 종료 취소 조건을 확인해 주세요. @ChampionsBracketControls.jsx | 생존자 계산이 유효하지 않습니다. 경기 결과를 확인해 주세요. @ChampionsBracketControls.jsx | 화면을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요. @LazyContent.jsx | 포켓몬을 1마리 이상 추가해 주세요. @teamSheetImage.js | 닉네임을 입력해 주세요. @BoardPage.jsx | 제목을 입력해 주세요. @BoardPage.jsx | 제목을 입력하세요. @BoardPage.jsx | 자유롭게 작성해 주세요. @BoardPage.jsx | 이미지 주소 또는 유튜브 링크를 붙여넣으세요. @BoardPage.jsx | 작성할 때 입력한 숫자 4자리를 다시 확인해 주세요. @BoardPage.jsx | 제목을 입력해 주세요. @BoardPage.jsx | 내용이나 링크를 입력해 주세요. @BoardPage.jsx | 이미지 주소 또는 유튜브 링크를 붙여넣으세요. @BoardPage.jsx | 닉네임을 입력해 주세요. @BoardPage.jsx
한다체 예 기록 반영 때 조건을 자동으로 확인하는 칭호입니다. | 참가자 이름은 신청 화면에서 따로 입력받습니다. 아래 설정은  | 해당 없음. 챔피언스는 구분 없이 진행합니다. | 회차는 이전 챔피언스 회차에 이어 자동으로 매겨집니다. | 이름과 성적을 입력하세요. 표시는 포인트 순으로 자동 정렬됩니 | 점 팀전 여부, 팀원 수, 대회 사정에 따라 달라질 수 있으므 | 연세대학교 포켓몬스터 동아리 포켓몬 센터 연세점이 운영하는 팬 | 정규 대회에 출전합니다. | 성적이 랭킹으로 쌓입니다. | 학기 말에 가장 큰 대회가 열립니다. | 그 시즌의 주인공이 됩니다. | 배틀과 중계는 디스코드에서 열립니다.
! strings 3 ).match(/^(\d+)회/)||[])[1])||null;
  @AdminEditors.jsx | 아직 신청자가 없습니다. 첫 신청자가 되어 보세요! @NewsPage.jsx | !shownTitles.has(t.name) && !(/챔피언\s @RecordsPage.jsx
em dash [
  '링크 1 (선택) — 누르면 새 탭으로 이동',
  '링크 2 (선택) — 추가 링크',
  '포인트 기준 — 우승',
  '— 누적 랭킹 미반영',
  '— 시즌별 성적 미반영',
  '— 이 대회는 제외',
  '— 이 대회는 제외',
  '— 챔피언스 시리즈는 제외',
  '— 시즌을 먼저 선택'
] ascii ... 0 …  23 ~ 0 straight quote in ko 0
emoji []
AI 문구 []
button labels 84 취소(17) | 삭제(4) | 저장(4) | 닫기(3) | del(i)} title="삭제">(2) | onNavigate("home")} aria-label="YPL 홈으로">(2) | 등록(2) | editPost(p)}>수정(2) | delPost(p)}>삭제(2) | editComment(p,c)}>수정(2) | delComment(p,c)}>삭제(2) | 다시 시도(2) | setQuery("")} aria-label="검색어 지우기">(2) | 로그아웃 | onSave(m)}>저장 | del(f.id)} title="질문 삭제"> | + 질문 추가 | + 트레이너 추가 | + 회차 추가 (맨 아래) | 날짜순 정렬 | void completeQualifier()}>선발전 기록 반영 | void reopenQualifier()}>선발전 기록 반영 취소 | window.location.reload()}>새로고침 | setQ("")} aria-label="검색어 지우기"> | closeRef.current?.()} aria-label="닫기"> | openInBuilder(p,go)}>팀 빌더에서 열기 | share(p)}>링크 공유 | 목록 | setAddedParticipants(prev=>prev.filter((_,j)=>j!==i))}
              >
                삭제 | setSelectedRegistrationIds(eventRegs.map(r=>r.id))}
            >
              전체 선택 | setSelectedRegistrationIds([])}
            >
              전체 해제 | + 참가자 추가 | setAddedParticipants(prev=>[...prev,""])}
          >
            + 참가자 추가 | setChampionshipManualOpen(false)}>취소 | 추가 | setCnt(Math.max(2,count-1))} aria-label="하나 줄이기"> | setCnt(Math.min(64,count+1))} aria-label="하나 늘리기"> | setStep(1)}>이전 | 대결 확정 | 다시 불러오기 | downloadChampionPng(b,res,nameOf)}>우승 이미지 | downloadBracketPng(b,nameOf)}>대진표 이미지 | onApply(b,res)}>기록에 반영 | 반영 취소 | 나중에 | 반영하기 | lock(open.id)}>입력 마치기 | 다시 추첨 | 결과 입력 | 링크 공유
## dates hard-coded [ '날짜 (2025.06)' ]
## system [
  'ErrorBoundary:1',
  'componentDidCatch:1',
  'navigator.onLine:1',
  '404:3',
  'NotFound:1',
  'Skeleton:1',
  'skeleton:1',
  'Empty :28',
  'Loader:25'
]
```
