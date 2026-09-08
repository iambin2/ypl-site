# YPL 개발 로드맵

이 문서는 **현재 상태, 남은 작업, 진행 순서**만 다룬다. 현재 구조와 data invariant는 [ARCHITECTURE.md](ARCHITECTURE.md), 변경 이력은 `PATCH_NOTES_2026-08-26.md`가 담당한다.

## 1. 현재 상태

- Test 환경의 normalized application, official submission, bracket runtime, Records, Champions 운영 흐름은 완료됐다.
- P2-7은 완료 상태다. 신규 active Event-linked bracket은 normalized runtime만 사용한다.
- YPL Season automatic rollover는 Test Supabase의 canonical RPC와 current-season 진입점 fallback으로 완료됐다.
- historical legacy data는 read-only compatibility 경계로만 남아 있다.
- Production normalized cutover는 아직 시작하지 않았다. Production 데이터와 Test fixture는 별개의 대상이다.

현재 active 운영 흐름은 다음과 같다.

```text
공지 → Event → EventRegistration → official Submission revision
→ Entry / EntryParticipant → BracketRuntime / Match
→ Result / RankingAward (정책 대상만) → final_submission_id freeze → Records
```

## 2. 완료된 핵심 기능

### Application / Event

- 공지와 Event를 연결하고, 신청은 `EventRegistration`으로 관리한다.
- 신규 Event는 현재 Season에 연결하며, 기존 Event 수정은 기존 `season_id`와 `round_number`를 보존한다.
- 신규 Event의 회차는 이름 파싱이 아니라 `round_number` history에서 자동 배정한다.
- Regulation과 Cup Rule은 Event authoritative rule이며, Records용 추가 룰은 `competition_settings.recordRuleLabel`의 자유 텍스트로 분리한다.

### Official Team submission

- Team Builder의 공식 제출은 `EventRegistration → RegistrationSubmission revision → immutable TeamSnapshot → TeamSnapshotMember`다.
- record apply는 실제 `EntryParticipant.registration_id`의 최신 제출만 `final_submission_id`로 freeze한다.
- revert는 pointer와 공개 상태만 해제하며 Submission/Snapshot revision history는 보존한다.

### Normalized bracket runtime

- 신규 active Event-linked Single, Double, Team bracket은 `BracketRuntime`, persisted `BracketEntrySlot`, Entry identity, formed Match facts로 운영한다.
- graph, BYE, future node, double-elimination advancement/GF/reset은 pure projection이며 active canonical DB graph가 아니다.
- 신규 bracket 생성 직후에는 저장된 projection만 사용하는 BracketDraw presentation을 보여 준다.
- runtime delete와 participant rollback은 ownership metadata를 기준으로 fail closed하게 처리한다.

### Record lifecycle / Records

- Result와 RankingAward는 분리된 canonical facts다. Result는 성적, RankingAward는 실제 ranking ledger다.
- 공식 roster와 Pokémon usage는 공개된 frozen final Submission만 읽고, 실제 EntryParticipant가 없는 no-show는 집계하지 않는다.
- 개인전, 팀전, Champions Final의 record apply/revert lifecycle이 normalized Records와 연결되어 있다.
- normalized ranking UI는 YPL/Classic normalized series만 사용하며 legacy `+ 추가` mutation을 노출하지 않는다.

### Champions

- 하나의 Champions 공지는 Qualifier Event와 Final Event pair를 만든다.
- Qualifier direct selection, 실제 참가 확정, survivor-derived qualification, Final Registration 생성, Final bracket과 HOF까지의 운영 흐름이 구현됐다.
- Qualifier와 Final의 Registration, Submission, Snapshot, schedule은 독립적이다.
- Champions는 Qualifier/Final 모두 ranking point를 지급하지 않는다.

### Deletion / rollback

- 공지 삭제는 downstream fact를 먼저 검사하는 strict preflight다.
- runtime delete는 durable Registration/Submission/Player relationship을 보존하며 runtime-owned facts만 정리한다.
- historical completed legacy bracket은 read-only이고 mutation 대상이 아니다.

## 3. 현재 남은 작업

### 다음 순서

1. 신청·제출·대진·결과 변경·apply/revert·삭제를 묶은 integrated QA
2. 운영에 필요한 작은 UI polish와 Test fixture 정리
3. Production migration/cutover 준비와 historical/business data migration 검증
4. Auth/RLS 및 RPC privilege hardening

`Battle Data`나 Pokémon Champions 외부 메타 통계는 현재 범위가 아니며 최하위 우선순위다. Title automation과 Replica Team ID Import도 핵심 운영 흐름 이후에 재검토한다.

## 4. Production cutover

현재 normalized runtime의 Test 완료와 Production 전환 완료는 다르다. Production은 blue-green 성격의 절차로 전환한다.

```text
기존 Production 보존
→ Test에서 검증한 normalized schema/RPC 정리
→ 새 Production DB 준비
→ historical/business data migration
→ integrity 및 운영 검증
→ cutover
→ 기존 Production을 rollback source로 보존
```

- Test fixture를 Production에 승격하지 않는다.
- `public.site_data / ypl_data_v4` historical compatibility는 초기 새 Production에도 필요한 범위만 남을 수 있다.
- 명시적인 최종 승인 전에는 Production 조회, migration, write를 수행하지 않는다.

## 5. 운영 완료 기준

다음 운영자가 source 수정이나 Supabase 직접 조작 없이 UI만으로 한 시즌을 운영할 수 있으면 현재 운영 범위는 완료다.

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
