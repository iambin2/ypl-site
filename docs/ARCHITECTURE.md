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

현재 normalized runtime은 Test schema에서 검증된 구현이다. Production normalized cutover는 완료되지 않았으며, Production 접근·migration·write는 별도 최종 승인 전까지 금지한다.

## 2. Data source boundary

### Active normalized Event

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

record apply는 실제 `EntryParticipant.registration_id`만 대상으로 최신 Submission을 freeze한다.

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

자동 Season rollover는 아직 구현/Production 적용 전이다.

- Asia/Seoul 기준 매년 3월 1일과 9월 1일에 YPL series만 전환한다.
- exactly one current YPL Season, idempotency, concurrency safety를 보장해야 한다.
- existing `Event.season_id`는 immutable이고 rollover 뒤 신규 Event만 새 Season을 참조한다.
- Classic과 historical reconstruction에는 적용하지 않는다.

## 9. Production migration / cutover

Production의 current source는 여전히 legacy `public.site_data / ypl_data_v4`다. Test normalized completion을 Production completion으로 표현하지 않는다.

Production cutover는 기존 Production 보존, normalized schema/RPC 정리, 새 Production DB 준비, historical/business data migration, validation, cutover, rollback source 보존의 순서로 진행한다.

- Test fixture를 Production으로 승격하지 않는다.
- historical legacy compatibility가 필요한 범위는 새 Production에도 명시적으로 남긴다.
- Production mutation은 별도 최종 승인과 migration plan 없이는 수행하지 않는다.

## 10. Security boundary와 deferred work

Client/UI는 UX guard일 뿐 canonical integrity boundary가 아니다. RPC/service/DB는 Event ownership, phase, lifecycle state, exact Registration/Entry identity, durable downstream fact를 independently validate하고 fail closed 해야 한다.

Auth/RLS hardening과 RPC privilege review는 Production cutover 전의 별도 작업이다. broad table write grant, broad anon mutation, ambiguous cascade cleanup을 도입하지 않는다.
