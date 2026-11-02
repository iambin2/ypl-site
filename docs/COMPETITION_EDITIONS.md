# 대회 회차

회차는 Event 행 수나 참가 리그 수가 아니라 대회 한 회에 부여한다. `competition_editions`의 `(family, round_number)`가 유일하며 신규 Event는 `competition_edition_id`로 연결된다. 시즌이 바뀌어도 회차는 이어진다.

| 계열 | 포함 | 다음 회차 기준 |
| --- | --- | --- |
| regular | 정규 파이컵 개인 마스터/루키와 팀전 | 팀전 리전 워즈 37회 다음 38회 |
| champions | 챔피언스 싱글/더블의 선발전과 본선 | 과거 6회 다음 7회 |
| light | 파이컵 라이트, 과거 라이트 팀전 포함 | 완료된 7회 다음 8회 |

마스터/루키 Event, 또는 싱글/더블 및 선발전/본선 Event는 같은 회차를 공유하되 Registration, Entry, Submission/Snapshot, BracketRuntime, Result와 RankingAward는 각 Event가 소유한다. 팀전이 master로 저장되거나 팀에 루키 선수가 있어도 회차 계열은 regular다. Champions의 division은 NULL이며 event_type으로 구분한다.

과거 자료의 회차만 catalogue에 등록하고 기존 Event 행과 경기/포인트/공식 파티는 이행 중 변경하지 않는다. Champions 1~6회의 NULL battle_format/phase는 그대로 보존한다. 과거 Event의 연결은 이후 실제 편집 시 기존 회차에 붙이며 회차를 다시 할당하지 않는다.

## 저장

`reserve_competition_edition`은 관리자만 호출한다. 계열별 transaction advisory lock 아래 회차를 예약하고 Event 트리거가 실제 회차를 적용한다. 브라우저의 번호는 미리보기이며 신뢰하지 않는다. 같은 공지를 수정하거나 재시도하면 기존 회차를 유지한다. 취소된 대회의 예약 회차도 다른 대회에 재사용하지 않는다.

일반 통합 접수는 회차를 한 번만 예약하여 master/rookie에 공통 적용한다. 신규 팀전도 같은 regular counter를 진행시킨다. 같은 회차에 팀전과 개인전을 혼합하지 않는다.

Champions 공지는 배틀 형식을 고른 뒤 `새 회차 생성` 또는 `7회에 더블 추가`처럼 기존 회차를 명시한다. 같은 회차에 이미 있는 종목은 다시 추가할 수 없다. 새 회차의 첫 종목이 7회를 예약하고, 다른 종목은 7회를 선택해 공유할 수 있다. 선발전은 연결된 본선의 회차를 사용한다. 본선의 registration_settings에는 회차 연결만 전달하며 선발전의 신청자/제출 파티는 복사하지 않는다. 이름에는 싱글/더블을 표시한다.

## 적용과 확인

2026-11-02 운영 `YPL_DB`에 `shared_competition_editions_and_round_reservation` migration을 적용했다. 38회 NPC 공지를 명시적으로 정정해 마스터와 루키 Event를 동일한 regular 38회에 연결했다. 기존 8건의 신청 ID/응답/접수 시각을 보존하면서 마스터 3명과 루키 5명으로 배정했다. 실제 신청으로 양쪽 runtime 생성 RPC를 검증하고 롤백했으며 기존 완료 기록과 공식 파티/포인트의 fingerprint가 일치했다.

`node scripts/build-competition-edition-migration.mjs`가 `competition_editions.sql`, 갱신된 `league_intake.sql`, Champions pair 저장 함수만 하나의 migration으로 출력한다. 기존 Champions의 진출/완료/명예의 전당 RPC는 교체하지 않는다. DB migration을 먼저 적용한 뒤 대응 프런트엔드를 배포한다.

38회 NPC 공지의 기존 잘못된 37회 값은 `correct_pristine_event_round`로 명시적으로 정정한다. 이 함수는 기존 edition에 연결되지 않고 제출/Entry/대진표가 없는 열린 단독 개인전만 허용한다. 이후 통합 접수로 전환해 신청 ID/응답/접수 시각을 보존한다. 이미 완료된 37회 팀전은 수정하지 않는다.

격리 DB 검증은 `scripts/verify-league-intake-db.mjs`를 사용한다. 실제 runtime/제출/기록 RPC와 RLS 아래 세 계열, 같은 회차의 양쪽 리그, Champions 싱글/더블, 기존 신청 이행, 자격 재검사, 리그별 기록/포인트와 취소 독립성을 검증한다. 화면에서도 리그를 바꾸면 신청자 선택이 초기화되고 선택한 리그 명단만 사용한다.
