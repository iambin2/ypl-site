# YPL 기술 구조 및 데이터 아키텍처

## 1. 시스템과 환경 경계

YPL은 Team Builder, 대회 운영, Records를 하나의 Event lifecycle으로 연결한다.

```text
YPL Tools
└─ Team Builder

YPL 운영
├─ 공지 / Event / 신청
├─ official party submission
├─ 참가자 확정 / 대진 / 경기
└─ record apply / revert

YPL Records
├─ 트레이너
├─ 대회 archive
├─ Pokémon usage
└─ ranking
```

Test에서 검증한 normalized architecture는 새 Production `YPL_DB` (`rqffrogcverfjqzjasax`, Seoul)의 `ypl_schema_validation`에도 migration/cutover 완료됐다.

- Production: active Event-linked competition runtime은 `ypl_schema_validation` normalized facts만 사용한다. `public.site_data / ypl_data_v4`는 기존 site-level data 및 historical legacy compatibility를 위해 보존한다.
- Test: regression과 migration verification reference, clean production-candidate / rollback reference를 유지한다.
- Old Production: active app source가 아닌 rollback/archive source로 보존한다.

## 2. Data source boundary

### Active normalized Event

공식 회차는 `competition_editions`의 regular/champions/light 세 계열로 관리한다. 신규 Event는 `competition_edition_id`를 가지며 정규 파이컵의 마스터/루키/팀전은 같은 regular 회차 체계를 사용한다. Champions 싱글/더블과 각 선발전/본선은 명시적으로 같은 회차에 연결한다. 서버가 계열별 잠금으로 회차를 예약한다. 과거 기록은 회차 catalogue만 등록하고 경기/파티/포인트를 변경하지 않는다. 상세 규칙은 [COMPETITION_EDITIONS.md](COMPETITION_EDITIONS.md)를 따른다.

신규 active Event-linked runtime의 canonical facts는 normalized schema에 있다.

```text
Season
└─ Event
   ├─ EventRegistration
   │  └─ RegistrationSubmission revision
   │     └─ TeamSnapshot
   │        └─ TeamSnapshotMember
   ├─ Entry
   │  └─ EntryParticipant
   └─ BracketRuntime
      ├─ BracketEntrySlot
      ├─ BracketIdentityChange
      └─ formed Match
         └─ Result / RankingAward
```

- `BracketRuntime`은 active normalized bracket의 discriminator다.
- `BracketEntrySlot`은 실제 draw position의 persistent fact다. Entry seed는 draw slot이 아니다.
- `BracketIdentityChange`는 runtime이 만든/연결/변경한 identity와 rollback ownership을 기록한다.
- Match에는 실제 formed node와 winner fact만 저장한다.
- bracket graph, BYE, unresolved future Match, advancement edge, loser movement, GF/reset activation은 persisted graph가 아니라 pure projection이다.
- BracketDraw animation은 저장된 projection을 읽는 presentation-only UI다. 추첨, slot 변경, Match write를 하지 않는다.

새 active bracket을 `public.site_data / ypl_data_v4.brackets`에 저장하거나 legacy graph를 fallback source로 사용하지 않는다. active runtime의 legacy dependency는 0이어야 한다.

방문자 공간(자유게시판, 샘플과 파티 소개글, 사설 대진표)은 `public.community_items`에 행 단위로만 저장한다(`src/services/communityStore.js`, `docs/db/visitor_gates.sql`). 쓰기는 `community_write` 함수뿐이고, 비공개 글은 RLS가 가리며, 비밀번호는 방문자가 읽을 수 없는 `public.visitor_pins`에서 서버가 대조한다. 이 데이터는 Event, Registration, Result, RankingAward, 칭호, 명예의 전당과 어떤 경로로도 연결하지 않으며, 사설 대진표는 기록 반영 흐름을 갖지 않는다(`tests/community.test.mjs`).

사설 대진표의 수정은 DB가 발급한 `updatedAt` 토큰을 `_expectedUpdatedAt`으로 제출한다. `community_write`가 행 잠금 아래 토큰을 비교하므로 같은 대진표를 두 기기가 읽었어도 뒤늦은 저장으로 먼저 입력한 결과를 덮지 않는다. 충돌하면 화면은 최신 값을 다시 읽고 재입력을 안내한다. 일반 게시판의 쓰기 형식은 유지한다. 적용 스크립트는 `docs/db/private_bracket_conflict_guard.sql`, 검증 범위는 [COMPETITION_FLOW_VERIFICATION.md](COMPETITION_FLOW_VERIFICATION.md)를 따른다.

### Historical legacy compatibility

`site_data.ypl_data_v4.brackets`의 legacy graph는 다음 조건의 completed historical display에만 허용한다.

- Event-linked active runtime이 아니다.
- `eventId`가 없는 pre-normalized completed bracket이다.
- read-only presentation만 제공한다.

historical bracket은 winner 변경, participant/party 변경, delete, record apply/revert, active sync 대상이 아니다. legacy compatibility는 active lifecycle을 되살리는 근거가 아니다.

## 3. Event, Registration, Submission

### Event / Registration

`Event`는 season, event type, division, battle format, competition format, rule, schedule, record lifecycle의 canonical owner다.

- 신청은 `EventRegistration`이다.
- 이름 기반 연결은 같은 Event 안에서 `registration_name` exact match만 허용한다. fuzzy match나 동명이인 임의 선택은 금지한다.
- 기존 Event 수정은 기존 `season_id`와 `round_number`를 유지한다.
- Event가 completed 또는 record-applied이면 official submission write를 막는다.

### 루키와 마스터 통합 접수

`league_intakes`는 하나의 공지와 Rookie/Master Event 두 개를 묶는다. 공지는 함께 접수하고 대진표 생성에서 리그를 선택한다. Registration, official submission, runtime, Result, RankingAward 및 기록 완료 상태는 여전히 각 Event가 소유한다. 신규 팀전은 Master로 고정하며 역사 Light 팀전은 보존한다.

개인 Master 참가 또는 개인 Rookie/Light champion 이력으로 개인 Master 자격을 판정한다. 팀전은 자격 근거에서 제외한다. DB가 신청 destination과 양쪽 중복을 검사하고 EntryParticipant 생성 때 재검사한다. 공통 파티 제출 경로는 실제 Registration 소유 Event로 연결하고 Submission/final pointer를 복사하지 않는다. 양쪽 후속 사실 검사와 공지 삭제는 원자적 DB 처리다.

2026-11-02 운영 DB에 통합 접수와 공식 회차 확장을 적용했다. 이후 재설치 시에도 DB 스크립트를 먼저 적용한 다음 프런트엔드를 배포한다. 전환 제약, 적용 순서와 검증은 `docs/LEAGUE_INTAKE.md`와 `docs/COMPETITION_EDITIONS.md`를 따른다.

### Official submission

공식 파티는 mutable Team Builder draft가 아니라 immutable revision chain이다.

```text
EventRegistration
→ RegistrationSubmission(revision)
→ TeamSnapshot
→ TeamSnapshotMember
```

- 재제출은 기존 row update가 아니라 새 Submission/Snapshot revision 생성이다.
- Event rule (`regulation_id`, `cup_rule_id`, `cup_rule_settings`)은 authoritative다.
- `submission_target_at`은 운영 경고 기준일 수 있으나 lifecycle 상태를 우회하지 않는다.
- `final_submission_id`는 제출 여부가 아니라 record apply 시점의 official freeze pointer다.

### Record apply와 roster 공개

record apply는 실제 `EntryParticipant.registration_id`만 대상으로 최신 Submission을 freeze한다. Result, RankingAward, freeze, Event 완료, Champions HOF는 `apply_event_record` 한 트랜잭션으로 함께 반영되고, 취소도 `revert_event_record` 한 트랜잭션이다(`docs/db/record_apply_rpc.sql`). 브라우저는 계획만 계산한다.

```text
EntryParticipant.registration_id
→ EventRegistration.final_submission_id
→ RegistrationSubmission
→ TeamSnapshot
→ TeamSnapshotMember
```

- 실제 참가했지만 미제출이면 Result/참가 이력은 가능하고 roster/Pokémon usage는 없다.
- 제출했지만 actual EntryParticipant가 없는 no-show는 official roster/Pokémon usage에 포함하지 않는다.
- official roster 공개가 필요한 `on_record_apply` Event는 apply 후 `status=completed`, `record_applied_at`, `team_revealed_at`을 모두 가진다.
- revert는 Result/Award rollback과 pointer release, Event 공개 상태 해제를 수행하되 immutable Submission/Snapshot history는 보존한다.
- 공개된 normalized Event는 final pointer가 없는 참가자를 legacy party로 보충하지 않는다.

## 4. Bracket runtime

### 생성과 projection

active Event-linked bracket은 다음 lifecycle으로 생성한다.

```text
EventRegistration preflight
→ Entry / EntryParticipant confirmation
→ BracketRuntime + persisted slots
→ initial formed Match materialization
→ canonical projection refetch
→ Bracket UI
```

Single, Double, Team runtime은 normalized lifecycle을 사용한다. malformed Event ownership, slot set, Entry identity, Match topology는 legacy fallback 대신 fail closed 한다.

### Match와 성적

- winner select/change/cancel은 canonical Match fact를 갱신한다.
- winner 변경은 downstream stale Match를 정리하고 formed downstream node만 다시 materialize한다.
- Result는 Entry placement fact이며 Match/Result source ownership은 historical row를 덮어쓰지 않는다.
- team Result는 Team Entry 단위이며 member-level ranking payout과 혼동하지 않는다.

### Runtime delete / rollback

runtime delete는 UI graph delete가 아니다. ownership이 명확한 runtime-owned facts를 FK-safe 순서로 정리한다.

```text
runtime-owned Match
→ BracketEntrySlot / BracketIdentityChange
→ EntryParticipant / Entry
→ runtime-created non-durable Registration / unreferenced Player
→ BracketRuntime
```

- Submission이 있거나 `final_submission_id`가 있는 durable EventRegistration은 삭제하지 않는다.
- durable existing Registration의 player link는 rollback으로 복원하지 않는다.
- non-durable runtime-created Registration만 삭제할 수 있다.
- runtime이 non-durable existing Registration의 player link를 바꿨고 exact ownership이 확인되면 이전 player로 복구한다.
- Player는 다른 Registration, EntryParticipant, Match, RankingAward, HOF 등 참조가 없을 때만 삭제한다.
- ambiguous ownership, durable downstream, applied bracket은 fail closed 한다.

## 5. Result, Ranking, Records

### Result와 RankingAward

`Result`와 `RankingAward`는 다른 사실이다.

- Result: Event Entry의 champion, runner-up, semifinalist placement.
- RankingAward: 실제 지급한 points/win/runner-up/top4 ledger delta.
- `RankingBaseline + RankingAward`가 normalized ranking의 canonical source다.

정책:

- Rookie는 RankingAward를 만들지 않는다.
- ordinary Master/Light는 현재 placement policy에 따라 RankingAward를 만든다.
- team placement는 team history에는 보존하지만 개인 wins/runner-ups/top4 count에는 포함하지 않는다.
- Champions Qualifier와 Final은 RankingAward, points delta, season/series ranking delta를 만들지 않는다.

normalized ranking UI는 YPL/Classic normalized Season을 최신순으로 보여 주며 legacy `+ 추가` mutation UI를 제공하지 않는다. 기본 Season 순서는 YPL 최신→과거, 그 다음 Classic 최신→과거다.

### Records projection

Records는 completed official Event를 normalized facts에서 projection한다.

```text
Event → Entry → EntryParticipant → Player
Event → Match → Result
Event → RankingAward / RankingBaseline
EventRegistration.final_submission_id → official roster → Pokémon usage
```

동일 Event에 linked legacy record가 있으면 normalized projection과 중복 표시하지 않는다. historical compatibility Event만 legacy read를 유지한다.

Records용 rule display는 `competition_settings.recordRuleLabel`이다.

- 자유 텍스트이며 비어 있으면 표시하지 않는다.
- `cup_rule_id`는 Team Builder validation/enforcement의 technical identifier이며 raw Records label로 사용하지 않는다.

## 6. Champions

### Pair와 phase boundary

하나의 Champions 공지는 Qualifier와 Final Event pair를 만든다.

| 구분 | Qualifier | Final |
| --- | --- | --- |
| `battle_format` | singles 또는 doubles | pair와 동일 |
| `competition_format` | double_elimination | single_elimination |
| division | `NULL` | `NULL` |
| schedule | `qualifierHeldOn`, `qualifierSubmissionTargetAt` | `finalHeldOn`, `finalSubmissionTargetAt` |
| Registration/Submission/Snapshot | Qualifier 전용 X | Final 전용 Y |

`battle_format`은 Pokémon battle format이고 `competition_format`은 bracket topology다. 두 개념을 혼동하지 않는다.

Qualifier X와 Final Y는 Player identity만 공유한다. Submission, Snapshot, `final_submission_id`, Registration을 copy, reuse, fallback하지 않는다. Final official roster/HOF는 Final Y만 사용한다.

### Direct selection과 Qualifier setup

Qualifier setup은 다음 순서다.

1. Qualifier EventRegistration 중 direct entrant를 선택하고 normalized direct selection fact로 저장한다.
2. direct entrant를 제외한 Registration 중 actual Qualifier participant를 확정한다.
3. direct entrant와 no-show는 Qualifier Entry를 만들지 않는다.
4. actual participant만 Entry/EntryParticipant와 Double Elimination runtime에 들어간다.

`finalCapacity=C`, direct entrant 수 `D`, actual Qualifier participant 수 `A`일 때:

```text
qualifierTarget Q = C - D
requiredEliminations E = A - Q
```

`qualification_slots`는 공지 작성 시 운영자가 입력하는 값이 아니다. setup에서 derived `Q`를 Qualifier runtime의 값으로 저장한다.

Qualifier는 Double Elimination의 2패 탈락 Match facts로 E명이 탈락할 때까지 진행한다.

- `eliminatedCount < E`: 정상 진행/수정.
- `eliminatedCount = E`: 새 winner 입력과 새 downstream materialization은 금지, 이미 played된 결정 Match의 correction/cancel은 apply 전 허용.
- qualifier apply 후: Match mutation은 금지하며 reopen 후에만 수정 가능.

Qualifier는 champion을 결정하지 않으며 fake final Match를 만들지 않는다.

### Qualifier apply / reopen

survivor 도달 자체는 Final entry 확정이 아니다. 운영자가 Qualifier apply를 실행할 때 atomic flow가 direct/survivor를 재검증한다.

```text
persisted direct selection → ranking Advancement + Final EventRegistration
survivor Qualifier Entry → qualifier Advancement + Final EventRegistration
Qualifier → completed
```

- Final Registration은 이 시점에 생성되지만 Final Entry와 Final Submission은 생성하지 않으며 `final_submission_id`는 `NULL`이다.
- Qualifier actual participant의 Submission X는 Qualifier official roster/usage에만 쓰인다.
- Qualifier는 Result, RankingAward, HOF, champion/runner-up/semifinalist placement를 생성하지 않는다.
- reopen/apply-revert는 Final downstream이 없는 경우에만 허용한다. Final Submission도 blocker다.
- apply-revert 후 direct selection과 played Qualifier Match는 유지한다. bracket delete before apply는 direct selection과 runtime-owned qualifier facts를 rollback한다.

### Final

Final candidate source는 Advancement가 만든 Final EventRegistration이다. Final wizard는 ordinary participant confirmation을 재사용하여 당일 actual participant만 선택한다.

- finalCapacity는 advancement capacity이지 actual bracket participant count가 아니다.
- Final wizard는 direct/ranking selection, provenance mutation, arbitrary Registration 생성, submission completion을 bracket prerequisite로 삼지 않는다.
- manual replacement capability는 provenance fact로 보존하지만 Final bracket creation surface와 섞지 않는다.
- Final apply는 actual participant의 Final Submission Y만 freeze하고 Result, placement, HOF를 만든다.
- Champions Final은 RankingAward를 만들지 않는다.

### Champions Records와 HOF

Qualifier와 Final은 Records archive에서 하나의 Champions tournament row로 보인다.

- Qualifier-only archive row는 표시하지 않는다.
- Final이 완료되면 Final participant/result를 우선 표시하고, Final에 없는 Qualifier-only actual participant는 `참가`로 병합한다.
- 같은 Player가 두 phase에 있으면 Final result를 우선해 한 번만 표시한다.
- Trainer/Pokémon roster history에서는 Qualifier X와 Final Y를 별도의 official roster로 보존한다.

HOF는 Final champion Result에만 생성한다. party는 Final frozen TeamSnapshot chain을 사용하며 Pokémon display name은 Records의 canonical localization pipeline을 재사용한다. artwork identity는 `pokemon_id` 기반이다.

Champions ordinal은 하나다. Final record apply가 확정한 ordinal을 paired Qualifier/Final `round_number`와 `HallOfFameEntry.generation_number`에 동일하게 사용한다. 예를 들어 Records의 `제7회 챔피언스`와 HOF의 `7대 싱글 챔피언`은 같은 ordinal이다.

## 7. Announcement deletion

공지 삭제는 delete-then-restore가 아니라 read-only preflight다.

다음 downstream fact 중 하나라도 있으면 deletion을 차단한다.

- EventRegistration
- RegistrationSubmission
- Entry / EntryParticipant
- BracketRuntime / Match
- Result / RankingAward / HallOfFameEntry
- `record_applied_at`

차단 시 announcement, Event, Registration 등 어떤 mutation도 하지 않는다. pristine Event만 announcement reference를 정리하고 Event status를 `cancelled`로 바꾼다. Event physical delete는 하지 않는다. Champions는 Qualifier/Final pair 전체를 검사한다.

## 8. Season과 round numbering

### Event round number

새 Event의 `round_number`는 Event name이 아니라 existing non-cancelled Event history로 자동 배정한다.

| 새 Event | sequence source | 새 round |
| --- | --- | --- |
| Rookie individual | non-team Rookie max | max + 1 |
| Master individual | non-team Master max | max + 1 |
| Light individual | non-team Light max | max + 1 |
| Team | non-team Master max | max + 1 |
| Champions pair | Champions max | max + 1, Qualifier/Final shared |

Team Event는 Master sequence를 참조하지만 자체가 Master sequence를 전진시키지 않는다. 따라서 Master 36 뒤 Team 37이 있어도 다음 Master는 37일 수 있다.

### Season rollover

`resolve_ypl_season_for_date(p_at)`가 Asia/Seoul 날짜를 반기 window로 계산하고, 비공개 날짜 주입 함수 `ensure_current_ypl_season_for_date(p_at)`가 advisory transaction lock 안에서 canonical Season row와 YPL-only current 상태를 만든다. 앱은 DB `now()`만 쓰는 `ensure_current_ypl_season()` wrapper를 호출하므로 anon caller가 임의 날짜로 rollover할 수 없다. anchor는 `2026-09-01 KST = YPL 시즌 3`이며 이후 매년 3월 1일/9월 1일에 전환한다. anchor 이전 날짜는 fail closed로 자동 생성하지 않는다.

- partial unique index는 `series='ypl' AND status='current'`만 보호한다. Classic row와 기존 Event 연결은 rollover가 변경하지 않는다.
- 신규 ordinary Event와 Champions Qualifier/Final pair는 생성 직전에 ensure RPC를 호출해 같은 YPL Season을 사용한다. 기존 Event/pair 수정은 현재 Season으로 이동하지 않고 기존 `season_id`를 유지한다.
- `pg_cron` scheduler는 사용하지 않는다. idempotent ensure RPC를 current-season 진입점에서 호출하며, 이 방식은 Production에도 적용됐다. anchor는 `2026-09-01 = YPL 시즌 3`, `2027-03-01 = YPL 시즌 4`, `2027-09-01 = YPL 시즌 5`다.

## 9. Production migration / cutover 완료

Production은 새 `YPL_DB`의 `ypl_schema_validation`을 active normalized schema로 사용한다. `public.site_data / ypl_data_v4`는 기존 site-level data 및 historical legacy compatibility를 위해 보존한다. 특히 `ypl_data_v4.brackets`의 legacy graph는 Event-unlinked pre-normalized completed bracket의 read-only compatibility에만 허용하며 active Event-linked bracket runtime fallback으로 사용하지 않는다.

- normalized application table 22개, function 26개, constraint 174개, index 100개, trigger 2개를 migration했다.
- source/destination의 table row count, non-empty data hash, function/constraint/index/trigger catalog fingerprint, table/function/schema ACL fingerprint parity를 확인했다.
- orphan Event/Registration/Entry/Submission/Result/HOF, broken `final_submission_id`는 모두 0이며 current YPL Season은 정확히 하나다.
- custom schema API exposure와 `ypl_schema_validation` REST/RPC HTTP 200을 검증했고 production env는 `VITE_YPL_DATA_SCHEMA=ypl_schema_validation` 경계를 사용한다.
- 기존 Production은 변경하지 않고 rollback/archive source로 보존했다.

## 10. Security boundary

Client/UI는 UX guard일 뿐 canonical integrity boundary가 아니다. RPC/service/DB는 Event ownership, phase, lifecycle state, exact Registration/Entry identity, durable downstream fact를 independently validate하고 fail closed 해야 한다.

2026-10-16부터 Production DB가 쓰기 권한의 관문이다 (`docs/db/access_lockdown.sql`, 근거와 검증과 되돌리기는 `docs/db-access-lockdown.md`).

- `ypl_schema_validation` 22개 table과 `public.site_data` 모두 RLS가 켜져 있다. anon은 전부 읽을 수 있다. `visitor_pins`는 어떤 방문자 역할도 읽을 수 없다.
- anon이 쓰는 것은 다섯 가지뿐이다. 방문자 공간 RPC `community_write` (SECURITY DEFINER, 글마다 서버가 비밀번호 대조), 열린 Event의 신청서 `event_registrations` INSERT (열 단위 grant와 `visitor_apply` 정책), 공식 파티 제출 RPC `submit_registration_team_snapshot` (6개 인자판, SECURITY DEFINER, 첫 제출이 정한 비밀번호를 재제출에 요구하고 운영진은 `reset_submission_pin`으로 초기화한다), 공지 알림 구독 RPC `save_push_subscription`과 `delete_push_subscription` (SECURITY DEFINER, `docs/db/announcement_push.sql`). `push_subscriptions` table은 anon에게 닫혀 있고 endpoint는 알려진 푸시 서비스만 받는다. 대회에 연결하지 않은 신청서의 응답 RPC `submit_announcement_response` (SECURITY DEFINER, `docs/db/backend_hardening.sql`)는 `ypl_data_v4`를 열지 않고 켜진 신청서에 응답 하나만 덧붙인다.
- 그 밖의 모든 쓰기와 관리자 RPC 실행은 `authenticated` 역할만 가능하고, RLS `admin_write` 정책이 JWT `app_metadata.ypl_admin = true` 를 요구한다. 관리자는 Supabase Auth로 로그인한다 (`src/storage.js` 의 `signInAdmin`).
- 챔피언스 RPC는 SECURITY INVOKER라 같은 RLS를 거친다. DEFINER로 남은 것은 파티 제출, 공지 알림 구독, `ensure_current_ypl_season` 계열, Qualifier direct selection 정리 trigger뿐이다.
- TRUNCATE는 anon과 authenticated 모두에게 없다.
- `site_data` 쓰기는 읽은 `revision`이 그대로일 때만 성공한다 (`src/services/revisionedRow.js`, 트리거는 `docs/db/backend_hardening.sql`). 읽기에 실패한 행은 쓰지 않으므로, 씨드를 띄운 화면의 저장이 실제 데이터를 덮지 않는다. 재방문 첫 그림에 쓰는 브라우저 사본(`ypl-seen-site`, `siteDataService.js`)도 같은 이유로 보이기만 하고 저장의 근거가 되지 않는다.
- 공지 신청서의 `form.closesAt`(한국 시각)이 지나면 방문자의 신청을 DB가 거절한다: 대회 연결 신청은 `event_registrations` BEFORE INSERT 트리거, 연결하지 않은 신청서는 `submit_announcement_response` (`docs/db/application_close.sql`). 운영진의 늦은 등록은 막지 않는다.
- 파티(`team_snapshots`, `team_snapshot_members`)는 제출된 대회의 `team_revealed_at` 이 있거나 운영진일 때만 읽힌다. 화면의 공개 판정만으로는 REST 직접 조회를 막지 못한다 (`docs/db/private_answers.sql`).
- 신청서 답 중 `public` 표시가 있는 질문의 답만 `site_data` 의 `form.responses` 와 `registration_data.answers` 에 남는다. 나머지는 운영진만 읽는 `public.form_private_answers` (subject = 응답 id 또는 registration id) 로 저장 전에 떼어 내고, 운영진 화면이 합쳐 읽는다 (`loadPrivateAnswers`). 질문의 공개 표시를 나중에 바꿔도 이미 들어온 답은 옮기지 않는다.

`docs/db/*.sql` 원본의 ACL 줄은 이 상태와 같게 유지한다. 새 함수나 table을 추가하면 anon에게 쓰기나 관리자 RPC 실행을 주지 않는다 (`tests/championsApplicationEventPairRpc.test.mjs` 가 검사한다). broad table write grant, broad anon mutation, ambiguous cascade cleanup을 도입하지 않는다.
