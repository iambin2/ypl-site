# YPL 개발 로드맵

이 문서는 **현재 상태, 남은 작업, 진행 순서**만 다룬다. 현재 구조와 data invariant는 [ARCHITECTURE.md](ARCHITECTURE.md), 변경 이력은 `PATCH_NOTES_2026-08-26.md`가 담당한다.

## 1. 현재 상태

- normalized Event lifecycle, official submission, bracket runtime, Records, Champions 운영 흐름이 완료됐다.
- integrated QA와 Test fixture cleanup이 완료됐다.
- 새 Production DB migration, 환경 cutover, GitHub `main` cutover 및 Pages 배포가 완료됐다.
- YPL Season automatic rollover가 Production에 적용됐다.
- historical legacy data는 read-only compatibility 경계로만 남아 있다.

현재 active 운영 흐름은 다음과 같다.

```text
공지 → Event → EventRegistration → RegistrationSubmission / TeamSnapshot
→ Entry / EntryParticipant → BracketRuntime / BracketEntrySlot → Match
→ Result / RankingAward (정책 대상만)
→ final_submission_id freeze → Records / HOF
```

## 2. 완료된 핵심 기능

### Application / Event

- 공지와 Event를 연결하고, 신청은 `EventRegistration`으로 관리한다.
- 신규 Event는 current YPL Season에 연결하며 기존 Event의 `season_id`와 `round_number`는 보존한다.
- 신규 Event의 회차는 이름 파싱이 아니라 `round_number` history에서 자동 배정한다.
- Regulation과 Cup Rule은 Event authoritative rule이며, Records용 추가 룰은 `competition_settings.recordRuleLabel`의 자유 텍스트로 분리한다.

### Official Team submission

- Team Builder의 공식 제출은 `EventRegistration → RegistrationSubmission revision → immutable TeamSnapshot → TeamSnapshotMember`다.
- record apply는 실제 `EntryParticipant.registration_id`의 최신 제출만 `final_submission_id`로 freeze한다.
- revert는 pointer와 공개 상태만 해제하며 Submission/Snapshot revision history는 보존한다.

### Normalized bracket runtime

- 신규 active Event-linked Single, Double, Team bracket은 `BracketRuntime`, `BracketEntrySlot`, Entry identity, formed Match facts로 운영한다.
- graph, BYE, future node, double-elimination advancement/GF/reset은 pure projection이며 canonical DB graph가 아니다.
- runtime delete와 participant rollback은 ownership metadata를 기준으로 fail closed하게 처리한다.

### Record lifecycle / Records

- Result와 RankingAward는 분리된 canonical facts다. Result는 성적, RankingAward는 실제 ranking ledger다.
- 공식 roster와 Pokémon usage는 공개된 frozen final Submission만 읽고 no-show는 집계하지 않는다.
- 개인전, 팀전, Champions Final의 record apply/revert lifecycle이 normalized Records와 연결되어 있다.
- Champions Qualifier/Final은 archive에서 하나의 대회로 보이며 Champions에는 ranking point를 지급하지 않는다.

### Deletion / rollback

- 공지 삭제는 downstream fact를 먼저 검사하는 strict preflight다.
- runtime delete는 durable Registration/Submission/Player relationship을 보존하며 runtime-owned facts만 정리한다.
- historical completed legacy bracket은 read-only이고 mutation 대상이 아니다.

## 3. 현재 남은 작업

1. 실제 운영 중 발견되는 regression 대응과 소규모 UI polish
2. 기능 compatibility를 보존하는 Auth/RLS/RPC privilege hardening
3. 필요 시 Production 운영 데이터 backup/audit 절차 보강

후순위는 `Battle Data` 및 Pokémon Champions 외부 메타/통계, Title automation, Replica Team ID Import다.

## 4. Production 상태

Production cutover는 완료됐다.

```text
Test validation
→ 새 Production DB migration
→ data/catalog/integrity verification
→ production env schema cutover
→ GitHub main cutover
→ Pages deploy
→ 기존 Production rollback/archive 보존
```

- active application은 새 Production `YPL_DB`의 `ypl_schema_validation` normalized facts를 사용한다.
- `public.site_data / ypl_data_v4`는 기존 site-level data 및 historical legacy compatibility를 위해 보존하며 신규 active runtime source가 아니다.
- 기존 Production main은 `backup/main-before-season3-cutover-20260909` branch와 `backup-main-before-season3-cutover-20260909` tag의 두 ref로 이중 보존했다.

## 5. 운영 완료 기준

현재 운영 범위는 다음 lifecycle을 UI만으로 운영할 수 있는 수준까지 충족했다. 한 시즌 장기 운영에서 발견되는 회귀와 보안 hardening은 별도 후속 작업으로 관리한다.

```text
공지 / Event 생성
→ 신청
→ phase별 공식 파티 제출
→ 실제 참가자 확정
→ 대진 생성 및 경기 진행
→ 결과 수정 또는 취소
→ record apply / Records / HOF
→ revert / 재반영
→ 안전한 삭제 및 재생성
```
