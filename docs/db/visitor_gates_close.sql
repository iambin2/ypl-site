-- 방문자 쓰기의 2단계: 새 클라이언트가 배포된 뒤 예전 길을 닫는다. 한 번만 실행한다.
-- 되돌리려면 ypl_backup.site_data_20261103 에서 행을 복원하고 access_lockdown.sql 의 이전 판 정책을 다시 만든다.

create schema if not exists ypl_backup;
create table if not exists ypl_backup.site_data_20261103 as select * from public.site_data;
alter table ypl_backup.site_data_20261103 enable row level security;
revoke all on schema ypl_backup from anon, authenticated;

-- 이름만 아는 사람의 파티 제출을 막는다. 새 함수가 내부에서만 부른다.
revoke all on function ypl_schema_validation.submit_registration_team_snapshot(uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- 방문자는 이제 site_data 를 쓰지 않는다.
drop policy if exists site_data_community_insert on public.site_data;
drop policy if exists site_data_community_update on public.site_data;
revoke insert, update on public.site_data from anon;

-- 공개 행에서 평문 비밀번호, 해시, 비공개 글을 지운다. 글은 community_items 로 옮겨졌다.
delete from public.site_data where key in ('ypl_showcase_v1', 'ypl_private_brackets_v1');
update public.site_data set value = value - 'board' where key = 'ypl_data_v4';
