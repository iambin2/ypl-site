-- 신청 수정 (2026-11-04). 신청 마감 전까지 신청자가 자기 신청의 답을 고친다.
-- 지금까지는 고칠 길이 없어 다시 신청했고, 바뀐 이름(이제빈 (수정))이 새 사람으로 들어가 리그까지 갈렸다.
--
-- 본인 확인은 파티 제출과 같은 제출 비밀번호(visitor_gates.sql, scope 'submission', 신청 id)다. 신청 하나에 비밀번호 하나.
-- 아직 비밀번호가 없으면 처음 불러올 때 정한 숫자 4자리가 그 비밀번호가 된다. 남이 먼저 정했다면 본인이 비밀번호 오류로
-- 바로 알게 되고 운영진이 초기화한다(파티 제출과 같은 약속). 다섯 번 틀리면 15분 잠긴다.
--
-- 고치는 것은 답뿐이다. 이름은 선수와 리그를 정하므로 바뀌지 않는다(guard_league_intake_registration 이 막는다).
-- 마감은 신청을 막는 판정과 같다: 공지의 신청서가 켜져 있고 closesAt 이 지나지 않았고, 대회가 열려 있고 기록 반영 전.
-- 비공개 답은 split_registration_answers 트리거가 그대로 비공개 표로 나눈다.
--
-- 적용: Supabase SQL 편집기에서 한 번 실행. 여러 번 실행해도 된다. 새 클라이언트보다 먼저 실행한다.

begin;

-- 신청 한 줄을 잠그고, 고칠 수 있는지와 비밀번호를 본다. 거절은 값으로 돌려준다(예외는 실패 횟수까지 되돌린다).
create or replace function ypl_schema_validation.application_edit_gate(p_registration_id uuid, p_registration_name text, p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r ypl_schema_validation.event_registrations%rowtype;
  v_status text;
  v_subject text := p_registration_id::text;
begin
  select * into r from ypl_schema_validation.event_registrations
   where id = p_registration_id and registration_name = btrim(coalesce(p_registration_name, '')) and registration_source = 'application'
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = '이 이름으로 접수된 신청을 찾지 못했습니다.';
  end if;
  if not exists (select 1 from ypl_schema_validation.events e where e.id = r.event_id and e.status = 'open' and e.record_applied_at is null)
     or not exists (
       select 1
         from public.site_data s
        cross join lateral jsonb_array_elements(s.value -> 'announcements') as a(item)
        where s.key = 'ypl_data_v4'
          and a.item ->> 'id' = r.registration_data ->> 'announcementId'
          and a.item #>> '{form,enabled}' = 'true'
          and not ypl_schema_validation.application_closed(a.item -> 'form')
     ) then
    raise exception using errcode = 'P0001', message = '신청이 마감되어 수정할 수 없습니다.';
  end if;
  v_status := public.visitor_pin_check('submission', v_subject, p_pin);
  if v_status = 'no_pin' then
    if coalesce(p_pin, '') !~ '^[0-9]{4}$' then return 'pin_required'; end if;
    insert into public.visitor_pins (scope, subject, pin_hash)
    values ('submission', v_subject, public.visitor_pin_hash(v_subject, p_pin));
    return 'ok';
  end if;
  return v_status;
end;
$$;
revoke all on function ypl_schema_validation.application_edit_gate(uuid, text, text) from public, anon, authenticated;

-- 불러오기: 본인이면 공개 답과 비공개 답을 합쳐 돌려준다.
create or replace function ypl_schema_validation.open_event_application(p_registration_id uuid, p_registration_name text, p_pin text)
returns table (answers jsonb, denied text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := ypl_schema_validation.application_edit_gate(p_registration_id, p_registration_name, p_pin);
begin
  if v_status <> 'ok' then
    return query select null::jsonb, v_status;
    return;
  end if;
  return query
  select coalesce(r.registration_data -> 'answers', '{}'::jsonb)
         || coalesce((select f.answers from public.form_private_answers f where f.subject = r.id::text), '{}'::jsonb),
         null::text
    from ypl_schema_validation.event_registrations r
   where r.id = p_registration_id;
end;
$$;
revoke all on function ypl_schema_validation.open_event_application(uuid, text, text) from public, anon, authenticated;
grant execute on function ypl_schema_validation.open_event_application(uuid, text, text) to anon, authenticated;

-- 저장: 답 전체를 새 답으로 바꾼다. 신청 시각과 순서, 이름, 리그는 그대로다.
create or replace function ypl_schema_validation.edit_event_application(p_registration_id uuid, p_registration_name text, p_answers jsonb, p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if jsonb_typeof(p_answers) is distinct from 'object' or octet_length(p_answers::text) > 8192 then
    raise exception using errcode = 'P0001', message = '신청 내용이 너무 길어 저장할 수 없습니다.';
  end if;
  v_status := ypl_schema_validation.application_edit_gate(p_registration_id, p_registration_name, p_pin);
  if v_status <> 'ok' then return v_status; end if;
  update ypl_schema_validation.event_registrations
     set registration_data = jsonb_set(registration_data, '{answers}', p_answers), updated_at = now()
   where id = p_registration_id;
  return null;
end;
$$;
revoke all on function ypl_schema_validation.edit_event_application(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function ypl_schema_validation.edit_event_application(uuid, text, jsonb, text) to anon, authenticated;

commit;
