-- 2026-11 백엔드 점검에서 나온 DB 변경. Supabase SQL Editor에서 통째로 한 번 실행한다. 다시 실행해도 안전하다.
-- 사이트는 이 파일이 적용되기 전에도 지금처럼 동작하고, 적용되면 그 다음 조회부터 새 보호가 켜진다.

-- 1. site_data 동시 저장 보호.
-- 행을 통째로 덮어쓰므로, 낡은 화면이 저장하면 그 사이에 올라온 공지와 글이 사라졌다.
-- 앱은 읽은 revision 이 그대로일 때만 쓰고(src/services/revisionedRow.js), revision 은 어떤 경로로 쓰든 여기서 오른다.
alter table public.site_data add column if not exists revision bigint not null default 0;

create or replace function public.bump_site_data_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function public.bump_site_data_revision() from public, anon, authenticated;

drop trigger if exists site_data_bump_revision on public.site_data;
create trigger site_data_bump_revision
  before update on public.site_data
  for each row execute function public.bump_site_data_revision();

-- 2. 방문자가 쓰는 값의 상한. site_data 의 512 KB 제약과 같은 이유로, 사람이 지키지 않아도 DB가 막는다.
-- 동명이인이 함께 뛸 수 있는 운영진 경로(manual, advancement)는 막지 않고, 방문자 신청의 동시 중복만 막는다.
create unique index if not exists event_registrations_application_name_key
  on ypl_schema_validation.event_registrations (event_id, registration_name)
  where registration_source = 'application';

alter table ypl_schema_validation.event_registrations
  drop constraint if exists event_registrations_name_length,
  add constraint event_registrations_name_length check (char_length(registration_name) <= 100),
  drop constraint if exists event_registrations_data_size,
  add constraint event_registrations_data_size check (octet_length(registration_data::text) <= 16384);

alter table ypl_schema_validation.team_snapshot_members
  drop constraint if exists team_snapshot_members_text_size,
  add constraint team_snapshot_members_text_size check (octet_length(concat(
    pokemon_id, pokemon_name_snapshot, ability_id, nature_id, item_id,
    move_1_id, move_2_id, move_3_id, move_4_id
  )) <= 1024);

-- 3. 대회에 연결하지 않은 신청서(설문)의 응답.
-- 2026-10-16 잠금 이후 방문자는 ypl_data_v4 를 쓸 수 없어 이 신청서의 제출이 전부 실패했다.
-- 쓰기를 열지 않고 응답 하나만 원자적으로 덧붙인다.
-- ponytail: 응답도 매 방문 내려받는 행에 들어간다. 이 행이 256 KB를 넘으면 받지 않아 관리자 저장 여유를 남긴다.
-- 설문이 잦아지면 응답을 별도 행으로 옮긴다.
create or replace function public.submit_announcement_response(p_announcement_id text, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response jsonb;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text) > 8192 then
    raise exception using errcode = 'P0001', message = '응답이 너무 길어 저장할 수 없습니다.';
  end if;

  v_response := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'answers', p_answers
  );

  update public.site_data s
     set value = jsonb_set(s.value, '{announcements}', (
       select jsonb_agg(
         case when a.item ->> 'id' = p_announcement_id
           then jsonb_set(a.item, '{form,responses}', coalesce(a.item #> '{form,responses}', '[]'::jsonb) || v_response)
           else a.item
         end
         order by a.ord
       )
       from jsonb_array_elements(s.value -> 'announcements') with ordinality as a(item, ord)
     ))
   where s.key = 'ypl_data_v4'
     and octet_length(s.value::text) < 262144
     and exists (
       select 1
         from jsonb_array_elements(s.value -> 'announcements') as a(item)
        where a.item ->> 'id' = p_announcement_id
          and a.item #>> '{form,enabled}' = 'true'
          and a.item #>> '{form,eventId}' is null
     );

  if not found then
    raise exception using errcode = 'P0001', message = '지금은 이 신청서에 응답할 수 없습니다.';
  end if;
end;
$$;
revoke all on function public.submit_announcement_response(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_announcement_response(text, jsonb) to anon, authenticated;
