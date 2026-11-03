-- 방문자가 읽으면 안 되는 두 가지를 DB에서 막는다 (2026-11-03 보안 점검).
--
-- 1. 공개 전 파티. team_snapshots 와 team_snapshot_members 는 누구나 읽을 수 있었다. 화면은 team_revealed_at 전까지
--    파티를 숨겼지만(normalizedRecordsProjection.js) 공개 키로 REST 를 부르면 상대 파티가 그대로 보였다.
--    이제 그 파티가 제출된 대회가 공개됐거나(team_revealed_at) 운영진일 때만 읽힌다.
-- 2. 신청서의 비공개 답. 신청서 질문은 public 표시가 있는 것만 공개 응답(예: 밴 리스트)으로 보인다. 그런데 답은 모두
--    누구나 읽는 곳에 있었다: 대회에 연결하지 않은 신청서는 site_data 의 form.responses, 대회 신청은
--    event_registrations.registration_data.answers. 이제 public 질문의 답만 그 자리에 남고, 나머지 답(지운 질문의 답과
--    질문을 찾을 수 없는 답 포함)은 운영진만 읽는 public.form_private_answers 로 간다. 공개 화면은 바뀌지 않는다.
--    운영진의 응답 보기와 대진표의 팀 지망은 두 곳을 합쳐 읽는다(siteDataService.js loadPrivateAnswers).
--
-- 적용: Supabase SQL 편집기에서 한 번 실행. 여러 번 실행해도 된다. 이미 있는 답도 함께 옮기고, 옮기기 전 사본을
-- ypl_backup 에 남긴다. 클라이언트는 이 SQL 앞이든 뒤든 배포해도 된다(표가 없으면 비공개 답 없이 보인다).

begin;

-- ===== 1. 공개 전 파티 =====

create or replace function ypl_schema_validation.snapshot_revealed(p_snapshot_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from ypl_schema_validation.registration_submissions s
      join ypl_schema_validation.event_registrations r on r.id = s.registration_id
      join ypl_schema_validation.events e on e.id = r.event_id
     where s.snapshot_id = p_snapshot_id
       and e.team_revealed_at is not null
  )
$$;
revoke all on function ypl_schema_validation.snapshot_revealed(uuid) from public;
grant execute on function ypl_schema_validation.snapshot_revealed(uuid) to anon, authenticated;

drop policy if exists public_read on ypl_schema_validation.team_snapshots;
create policy public_read on ypl_schema_validation.team_snapshots for select to anon, authenticated
  using (ypl_schema_validation.snapshot_revealed(id) or (select ypl_schema_validation.is_ypl_admin()));

drop policy if exists public_read on ypl_schema_validation.team_snapshot_members;
create policy public_read on ypl_schema_validation.team_snapshot_members for select to anon, authenticated
  using (ypl_schema_validation.snapshot_revealed(snapshot_id) or (select ypl_schema_validation.is_ypl_admin()));

-- ===== 2. 신청서의 비공개 답 =====

-- subject 는 대회에 연결하지 않은 신청서 응답의 id, 또는 event_registrations.id 다.
create table if not exists public.form_private_answers (
  subject text primary key,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.form_private_answers enable row level security;
revoke all on public.form_private_answers from public, anon, authenticated;
-- 방문자에게는 행이 없는 표로 보인다: 화면의 읽기가 오류 없이 빈 결과를 받는다.
grant select on public.form_private_answers to anon, authenticated;
grant delete on public.form_private_answers to authenticated;
drop policy if exists form_private_answers_admin on public.form_private_answers;
create policy form_private_answers_admin on public.form_private_answers for all to authenticated
  using ((select ypl_schema_validation.is_ypl_admin()))
  with check ((select ypl_schema_validation.is_ypl_admin()));

create or replace function public.announcement_form_fields(p_announcement_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select a.item #> '{form,fields}'
    from public.site_data s
   cross join lateral jsonb_array_elements(s.value -> 'announcements') as a(item)
   where s.key = 'ypl_data_v4' and a.item ->> 'id' = p_announcement_id
   limit 1
$$;
revoke all on function public.announcement_form_fields(text) from public, anon, authenticated;

-- public 표시가 있는 질문의 답만 공개 쪽이다. 나머지는 모두 비공개 쪽(닫힌 쪽으로 실패한다).
create or replace function public.form_answers_split(p_fields jsonb, p_answers jsonb, out public_answers jsonb, out private_answers jsonb)
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(a.key, a.value) filter (where f.pub), '{}'::jsonb),
         coalesce(jsonb_object_agg(a.key, a.value) filter (where not f.pub), '{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end) as a(key, value)
   cross join lateral (
     select coalesce(bool_or(x.field ->> 'public' = 'true'), false) as pub
       from jsonb_array_elements(case when jsonb_typeof(p_fields) = 'array' then p_fields else '[]'::jsonb end) as x(field)
      where x.field ->> 'id' = a.key
   ) as f
$$;
revoke all on function public.form_answers_split(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.keep_private_answers(p_subject text, p_answers jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.form_private_answers (subject, answers)
  select p_subject, p_answers where p_answers <> '{}'::jsonb
  on conflict (subject) do update set answers = public.form_private_answers.answers || excluded.answers
$$;
revoke all on function public.keep_private_answers(text, jsonb) from public, anon, authenticated;

-- 대회 신청: 방문자의 INSERT(visitor_apply) 그대로 두고, 행이 저장되기 전에 비공개 답을 떼어 낸다.
-- 이름이 guard_* 뒤에 와서 마감과 통합 접수 확인이 먼저 돈다. id 는 기본값이 이미 채워져 있다.
create or replace function ypl_schema_validation.split_registration_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_split record;
begin
  if jsonb_typeof(new.registration_data -> 'answers') is distinct from 'object' then
    return new;
  end if;
  select * into v_split from public.form_answers_split(
    public.announcement_form_fields(new.registration_data ->> 'announcementId'),
    new.registration_data -> 'answers'
  );
  perform public.keep_private_answers(new.id::text, v_split.private_answers);
  new.registration_data := jsonb_set(new.registration_data, '{answers}', v_split.public_answers);
  return new;
end;
$$;
revoke all on function ypl_schema_validation.split_registration_answers() from public, anon, authenticated;
drop trigger if exists split_registration_answers on ypl_schema_validation.event_registrations;
create trigger split_registration_answers before insert or update of registration_data on ypl_schema_validation.event_registrations
  for each row execute function ypl_schema_validation.split_registration_answers();

-- application_close.sql 의 같은 함수에서 응답에 공개 답만 남기고 나머지는 비공개 표로 보낸다.
create or replace function public.submit_announcement_response(p_announcement_id text, p_answers jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := gen_random_uuid()::text;
  v_split record;
  v_response jsonb;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text) > 8192 then
    raise exception using errcode = 'P0001', message = '응답이 너무 길어 저장할 수 없습니다.';
  end if;

  if exists (
    select 1
      from public.site_data s
     cross join lateral jsonb_array_elements(s.value -> 'announcements') as a(item)
     where s.key = 'ypl_data_v4'
       and a.item ->> 'id' = p_announcement_id
       and ypl_schema_validation.application_closed(a.item -> 'form')
  ) then
    raise exception using errcode = 'P0001', message = '신청이 마감되었습니다.';
  end if;

  select * into v_split from public.form_answers_split(public.announcement_form_fields(p_announcement_id), p_answers);
  v_response := jsonb_build_object(
    'id', v_id,
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'answers', v_split.public_answers
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

  perform public.keep_private_answers(v_id, v_split.private_answers);
end;
$$;
revoke all on function public.submit_announcement_response(text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_announcement_response(text, jsonb) to anon, authenticated;

-- ===== 이미 있는 답 옮기기 =====

create schema if not exists ypl_backup;
create table if not exists ypl_backup.site_data_20261104 as select * from public.site_data;
create table if not exists ypl_backup.event_registrations_20261104 as
  select id, registration_data from ypl_schema_validation.event_registrations;
alter table ypl_backup.site_data_20261104 enable row level security;
alter table ypl_backup.event_registrations_20261104 enable row level security;

-- 대회 신청은 같은 값으로 다시 쓰면 위 트리거가 나눈다. 이미 나뉜 행은 그대로다.
update ypl_schema_validation.event_registrations
   set registration_data = registration_data
 where jsonb_typeof(registration_data -> 'answers') = 'object';

select public.keep_private_answers(r.item ->> 'id', sp.private_answers)
  from public.site_data s
 cross join lateral jsonb_array_elements(s.value -> 'announcements') as a(item)
 cross join lateral jsonb_array_elements(
   case when jsonb_typeof(a.item #> '{form,responses}') = 'array' then a.item #> '{form,responses}' else '[]'::jsonb end
 ) as r(item)
 cross join lateral public.form_answers_split(a.item #> '{form,fields}', r.item -> 'answers') as sp
 where s.key = 'ypl_data_v4' and r.item ? 'id';

update public.site_data s
   set value = jsonb_set(s.value, '{announcements}', (
     select coalesce(jsonb_agg(
       case when jsonb_typeof(a.item #> '{form,responses}') = 'array' then
         jsonb_set(a.item, '{form,responses}', (
           select coalesce(jsonb_agg(
             -- id 가 없는 응답은 비공개 답을 옮길 자리가 없으니 그대로 둔다
             case when r.item ? 'id'
               then jsonb_set(r.item, '{answers}', (public.form_answers_split(a.item #> '{form,fields}', r.item -> 'answers')).public_answers)
               else r.item end
             order by r.ord
           ), '[]'::jsonb)
           from jsonb_array_elements(a.item #> '{form,responses}') with ordinality as r(item, ord)
         ))
       else a.item end
       order by a.ord
     ), '[]'::jsonb)
     from jsonb_array_elements(s.value -> 'announcements') with ordinality as a(item, ord)
   ))
 where s.key = 'ypl_data_v4' and jsonb_typeof(s.value -> 'announcements') = 'array';

commit;
