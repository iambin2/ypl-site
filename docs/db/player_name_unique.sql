-- 선수 이름 하나에 선수 한 명 (2026-11-03). Status: APPLIED to Production on 2026-11-03.
-- 띄어쓰기와 대소문자만 다른 이름은 같은 이름이다. 클라이언트의 playerNameKey(src/services/teamBuilderCore.js)와 같은 규칙이다.
-- 동명이인은 Player를 둘로 나눌 수 없고, 구분되는 이름으로 신청한다. 같은 사람이 표기만 바꿔 선수가 갈라지는 일도 DB가 막는다.
--
-- 실행 전 확인. 두 쿼리 모두 0이어야 한다(2026-11-03 운영 DB는 둘 다 0).
--   select count(*) from (select lower(regexp_replace(display_name, '\s', '', 'g'))
--     from ypl_schema_validation.players group by 1 having count(*) > 1) d;
--   select count(*) from (select event_id, lower(regexp_replace(registration_name, '\s', '', 'g'))
--     from ypl_schema_validation.event_registrations where registration_source = 'application'
--     group by 1, 2 having count(*) > 1) d;

begin;

create unique index if not exists uq_players_name_key
  on ypl_schema_validation.players (lower(regexp_replace(display_name, '\s', '', 'g')));

-- backend_hardening.sql의 같은 이름 색인을 같은 규칙으로 바꾼다. 운영진 경로(manual, advancement)는 여전히 막지 않는다.
drop index if exists ypl_schema_validation.event_registrations_application_name_key;
create unique index event_registrations_application_name_key
  on ypl_schema_validation.event_registrations (event_id, lower(regexp_replace(registration_name, '\s', '', 'g')))
  where registration_source = 'application';

commit;
