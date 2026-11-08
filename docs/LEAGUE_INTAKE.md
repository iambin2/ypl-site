# 루키와 마스터 통합 접수

2026-11-02 운영 `YPL_DB`에 `unified_rookie_master_league_intake`와 `shared_competition_editions_and_round_reservation` DB 변경을 적용했다. 프런트엔드는 main에 병합하면 기존 GitHub Pages workflow에서 배포한다. 38회 NPC 공지는 양쪽 Event를 38회에 연결하고 기존 신청 8건을 마스터 3명과 루키 5명으로 배정했다. 신청 ID, 응답, 접수 시각을 보존했고 수동 소속리그 질문을 제거했다.

2026-11-02 GitHub `origin/main`의 `e3c84dfd9ed95f6e33d0d3c631858bcfee77437f`까지 29개 커밋을 반영했다. 최신 Navy 디자인과 Field/Button, 파티 제출 PIN, 원자적 기록 반영/취소 RPC, 공유 데이터 revision 보호를 유지한다. 통합 공지 삭제 후에는 공유 데이터를 다시 읽어 다음 저장에 필요한 revision도 갱신한다. 병합 전 작업 사본과 패치는 저장소 밖 `../league-sync-2026-11-02/`에 보관했다.

운영 DB의 현재 RLS, 관리자 `app_metadata.ypl_admin` 검사, PIN 6인자 제출과 구형 5인자 함수의 접근 차단, 원자적 기록 반영/취소 함수 및 revision 트리거를 확인한 뒤 적용했다. 실제 authenticated/anon 역할의 pair 생성과 재시도, 마스터/루키 배정, 중복 차단, PIN 누락 차단, 구형 제출 API 차단, 관리자/비관리자 취소 검증을 통과했다. 검증용 쓰기는 한 트랜잭션에서 모두 롤백했다.

적용 전후 기존 대회 62개, 신청 314개, 제출 74개, 결과 212개, 포인트 5개와 파티/참가/대진표/경기 및 공유 데이터의 개수와 전체 행 digest가 모두 일치했다. 기존 공지는 자동 전환하지 않았다. 새 SECURITY DEFINER 함수는 없으며 운영 보안 advisor 결과도 적용 전과 같다. 운영 DB 검증 SQL과 적용 전 카탈로그는 저장소 밖 `../league-sync-2026-11-02/`에 보관했다.

## 운영 기준

개인 마스터 참가 이력, 개인 루키 우승, 개인 라이트 우승 중 하나가 있으면 마스터 자격을 인정한다. 팀전 참가 및 팀전 우승, 라이트 단순 참가, 챔피언스 참가, 랭킹 점수는 개인 마스터 자격을 만들지 않는다. 신규 팀전은 마스터로 고정하고 과거 라이트 팀전 기록은 보존한다.

완료된 Event의 Player ID, individual Entry와 EntryParticipant 및 champion Result를 조회한다. 과거 이관 대회에는 record_applied_at이 없을 수 있으므로 이 값을 자격의 필수 조건으로 쓰지 않는다. 이름 연결은 기존 Player의 정확한 이름이 하나일 때만 허용하며 동명이인은 운영진 확인 대상으로 차단한다.

## 공지에서 기록까지

1. 새 일반 개인전 공지의 기본 접수 구분은 루키와 마스터 동시 접수다. 라이트와 챔피언스의 기존 별도 경로는 유지한다.
2. `league_intakes`가 공지 하나와 기존 형식의 master/rookie Event 두 개를 묶는다. 두 Event는 같은 `competition_edition_id`와 회차를 공유한다. 공지 생성 시 내부 Event를 함께 준비하지만 운영자가 리그를 선택하는 시점은 대진표 생성이다. 별도 DB나 새 Match/Result 저장소는 만들지 않는다. 회차 저장은 [대회 회차](COMPETITION_EDITIONS.md)를 따른다.
3. 신청 화면은 하나다. 기존 INSERT 권한과 RLS를 그대로 사용하고 DB의 BEFORE INSERT 트리거가 이력을 검사해 실제 Event를 정한다. 다른 Event로 직접 INSERT해도 같은 규칙을 적용하며 두 리그에 중복 신청할 수 없다. 단, 같은 회차 루키에서 우승해 기록 반영까지 끝난 선수는 열린 마스터에 별도 신청할 수 있다. 루키 신청과 제출은 유지한다. 새로운 Player는 일반 접수 단계에서 만들지 않는다.
4. 운영자 응답 화면과 CSV에는 두 리그를 함께 표시하고 리그별 인원을 보여 준다.
5. 대진표 생성에서 공지를 고른 뒤 마스터 또는 루키와 싱글/더블 엘리미네이션을 선택한다. 두 리그는 각각 방식을 정한다. 미신청자는 운영자의 ‘참가자 추가’로 입력하면 관리자 RPC가 기존 Player를 확인하거나 생성하고 해당 Event에 manual Registration을 만든다. 리그 자격 검사는 일반 접수와 동일하며 참가 확정 시 다시 검사한다. 이미 생성된 대진표에는 추가할 수 없다.
6. 공지의 공통 파티 제출 버튼에서 이름을 확인하면 실제 Registration 소유 Event를 찾는다. 이후 그 Event로 제출한다. 한 리그가 완료돼도 다른 리그의 제출은 계속 가능하다. Submission/Snapshot이나 final_submission_id를 다른 Event에 복사하지 않는다.
7. 기존 Event별 runtime, Result, RankingAward, 공식 파티 freeze/release를 사용한다. 루키는 포인트가 없고 마스터는 기존 지급 정책을 쓴다. 한 리그의 반영/취소는 다른 리그를 건드리지 않는다.
8. 공지 삭제는 양쪽 후속 사실을 검사하고, 최종 검사와 두 Event 취소 및 공지 삭제를 하나의 DB 트랜잭션으로 실행한다. 삭제 직전 새 신청이 들어오면 공지와 Event를 모두 보존한다. 공유 데이터의 다른 필드는 서버에서 유지한다.

## 기존 공지

공지 생성과 수정은 대진 방식을 정하지 않는다. 신규 Event는 `competition_format=NULL`이며 생성 RPC가 선택한 방식과 runtime을 함께 저장한다. 기존 공지에 방식이 저장되어 있어도 첫 대진표 생성 시 다시 선택할 수 있고, 공지 수정은 생성된 대진표의 방식을 보존한다. Champions 선발전과 본선도 각각 싱글/더블을 선택하며, 선발전은 싱글 1패 또는 더블 2패로 탈락자를 계산한다. 적용 순서는 `docs/db/bracket_manual_registration.sql`, `docs/db/bracket_format_at_creation.sql`, 대응 프런트엔드다.

같은 회차의 루키 우승자 승격은 Registration 이동이 아니다. 완료된 루키의 champion Result와 Player ID를 확인한 뒤 마스터에 새 Registration을 만든다. 기존 Submission, Snapshot, `final_submission_id`는 복사하지 않으며 마스터 파티는 새로 제출한다. `is_completed_rookie_champion`은 공개 사실만 읽고, `add_bracket_manual_registration`은 관리자만 실행할 수 있다.

기존 단독 접수 공지는 자동 변경하지 않는다. 열린 개인 마스터 공지가 기존 공지 ID에 정확히 연결되어 있고 공식 제출, Entry, 대진표, 결과 등 후속 사실이 없는 경우 운영자가 통합 접수로 전환할 수 있다. 기존 Master Event ID, season_id, round_number를 보존하고 Rookie Event만 추가한다. 신청만 있는 경우에는 같은 트랜잭션에서 자격에 따라 소속 Event만 배정하며 신청 ID, 응답, 접수 시각을 보존한다. 기존 신청의 동명이인, 잘못된 선수 연결, 이름 중복 또는 일반 신청 외의 연결이 있으면 전환 전체를 취소한다.

이미 제출이나 참가 데이터가 있는 공지는 서버가 전환을 차단한다. 특히 제출 후 다른 Event로 Registration을 이동하거나 공식 파티를 복제하는 자동 이행은 제공하지 않는다.

## 적용 순서

1. 기존 운영 스키마와 `is_ypl_admin()` 및 현재 RLS/ACL 상태를 확인한다. 최신 코드의 `backend_hardening.sql`, `visitor_gates.sql`, `visitor_gates_close.sql`, `record_apply_rpc.sql`에 해당하는 revision, PIN 6인자 제출 함수와 구형 5인자 함수 접근 차단, 원자적 기록 RPC의 실제 적용 상태도 확인한다. GitHub에 SQL이 있다는 사실만으로 운영 DB 적용을 가정하지 않는다.
2. `docs/db/league_intake.sql`을 검증 환경에서 실행한다. 새 table은 RLS를 사용하고 anon에는 읽기만 허용한다. 유일한 새 공개 RPC는 공개 사실을 읽는 `has_individual_master_eligibility(uuid)`이며 새 방문자 mutation RPC나 쓰기 권한은 없다.
3. 관리자 세션으로 pair 저장/취소와 공지 삭제를, anon 세션으로 배정/중복/파티 제출을 검증한다. 실행 도구의 보안 advisors 및 실제 DB 카탈로그의 권한도 확인한다.
4. 운영 DB에 같은 스크립트를 적용하고 API exposure와 함수 실행 권한을 확인한 다음 대응 프런트엔드를 배포한다. DB 스크립트 전에 프런트엔드를 배포하면 새 통합 접수 저장은 실패한다.
5. 기존 진행 중 공지/대회/파티는 변환하지 않는다. 새 통합 공지를 사용하기 시작한 뒤에는 통합 접수를 모르는 옛 프런트엔드로 단순 복귀하면 Rookie 신청이 화면에서 누락되므로, 복귀 시에도 공통 조회와 제출 경로를 유지해야 한다.

`access_lockdown.sql`의 공개 read helper 예외와 테스트 allowlist에도 새 read helper를 포함했다. `league_intake.sql`은 재실행 가능하며 역사 데이터 UPDATE/DELETE를 실행하지 않는다.

## 검증

Champions 선발전의 사이트 배틀 입장 검사도 선택한 방식의 탈락 기준을 따른다. `docs/db/championship_single_qualifier_battle_guard.sql`을 운영에 추가 적용했다. 기존 PIN과 파티 조회 및 권한은 유지하며 본선 정원에 도달한 Single 선발전의 새 배틀 입장을 차단한다. 실제 battle seat 함수와 네 가지 선발전/본선 조합을 격리 DB에서 함께 검증했다.

2026-11-08 `bracket_manual_registration_and_rookie_champion_promotion`, `choose_elimination_format_at_bracket_creation`를 운영 DB에 적용했다. 강진영의 완료된 38회 루키 신청과 우승 기록을 유지하고 같은 Player ID로 마스터 신청을 별도 추가했다. 방식 선택 migration 전후 Event 63개, Registration 322개, Submission 84개, Result 216개, Runtime 3개의 개수와 전체 행 digest가 일치했다. 운영 authenticated RPC로 실제 생성, 실패 시 방식 롤백, 동일 요청 재시도, 생성 후 방식 변경 차단을 검증하고 검증 데이터는 모두 롤백했다. 새 쓰기 함수는 SECURITY INVOKER이며 anon 실행 권한이 없다.

검증은 단위 테스트 557개, 격리 PostgreSQL 통합 검사 28개, production build를 통과했다. 선발전/본선 Single과 Double의 네 조합, 관리자 수동 추가와 자격 검증, 루키 우승자 승격 시 기존 기록 보존과 열린 마스터로 파티 제출 연결을 포함한다. 390px/1440px의 두 테마에서 실제 생성 컴포넌트의 방식 선택과 수동 추가도 확인했다. 대응 프런트엔드는 main에 병합하고 GitHub Pages 배포 결과를 확인한다.

- `npm test`: 2026-11-02 회차 수정 후 439개 통과. 자격 근거, 신규 접수 기본값, 그룹 대진표 선택, 다른 리그의 중복 신청 검사, 한쪽 완료 후 반대 리그 파티 조회, 서로 다른 시즌 연결 거부, 양쪽 공지 삭제 preflight와 공식 회차 선택을 포함한다. `npm run build`도 통과했다.
- `node scripts/audit-league-eligibility.mjs`: 운영 사이트의 공개 읽기 API에서 실제 근거를 재검수한다. 서버 쓰기는 하지 않는다. 2026-10-29 검수에서는 21명이며 라이트 우승 확장으로 김지승이 추가됐다.
- DB 통합 검증은 별도 임시 디렉터리에 `@electric-sql/pglite@0.5.13`을 설치하고 `node scripts/verify-league-intake-db.mjs <해당 패키지의 dist/index.js>`로 실행한다. 운영 DB 연결을 사용하지 않는다. 2026-11-02 최신 schema, 실제 runtime/party RPC와 RLS, revision/PIN, 원자적 기록 RPC로 16개 검증을 통과했다. 세 계열의 회차, 팀전 다음 정규 회차, Champions 7회 싱글/더블 공유, 신청 배정, 익명/비관리자 권한 차단, 중복 신청, pair 수정/취소 차단, 원자적 공지 삭제와 revision 증가, 팀전 고정, 실제 대진표 생성, PIN 누락/오류와 구형 제출 API 차단, 기록 반영 실패 시 전체 롤백, 리그별 포인트와 반영/취소 독립성을 검증한다. 게시판 이관은 이 격리 검증의 대상이 아니다.
- 로컬의 실제 접수 설정/대진표 생성 컴포넌트를 격리된 읽기 transport로 390px와 1440px에서 확인했다. 리그 전환 시 선택이 초기화되고 마스터 3명/루키 5명 중 해당 명단만 선택된다. Champions의 기존 7회에 더블 추가와 이름 미리보기도 확인했다.
- 운영 DB에서는 실제 38회 신청자 각각으로 두 리그의 runtime 생성 RPC를 실행하고 검증 트랜잭션을 롤백했다. 각 리그의 신청만 참가자로 연결됐으며 실제 대진표는 남기지 않았다. 전후 fingerprint로 기존 경기, Entry, 결과, 포인트, 공식 파티, 완료 대회와 다른 공지의 보존을 확인했다.
