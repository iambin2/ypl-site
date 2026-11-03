-- 신청 마감의 서버 쪽 (2026-11-03). 공지 신청서의 form.closesAt 이 지나면 방문자의 신청을 DB가 거절한다.
-- 지금까지는 화면만 신청 버튼을 닫았다(src/services/announcementTimes.js applicationsClosed). 같은 판정을 여기서 한다:
-- closesAt 이 있고 그 시각이 지났으면 마감이다. closesAt 이 없는 예전 공지는 이전처럼 대회 상태(events.status)만 본다.
--
-- 막는 길은 둘이다.
--   1. 대회에 연결된 신청: 방문자의 event_registrations INSERT (access_lockdown.sql visitor_apply). BEFORE INSERT 트리거.
--      공지는 form.eventId 가 이 대회인 것, 또는 통합 접수(league_intakes)의 공지다. 통합 접수 트리거가 event_id 를
--      루키/마스터로 바꾸기 전이든 뒤든 같은 공지를 찾는다.
--   2. 대회에 연결하지 않은 신청서: public.submit_announcement_response (backend_hardening.sql). 같은 판정을 더한다.
-- 운영진(is_ypl_admin)과 신청이 아닌 등록(advancement 등)은 막지 않는다: 늦은 참가는 운영진이 넣는다.
--
-- 방문자 쓰기의 개수 제한 (같은 날 더함). 신청 행과 알림 구독은 크기만 막혀 있어(event_registrations_data_size,
-- push_subscriptions 의 check) API 를 직접 부르면 가짜 신청과 가짜 구독이 끝없이 쌓였다. 게시판(community_write)과 같은 브레이크다:
-- 방문자 신청은 전체 분당 20건, 대회당 512건. 알림 구독은 1000개(notify-announcement 가 한 번에 읽는 한도).
--
-- 적용: Supabase SQL 편집기에서 한 번 실행. 여러 번 실행해도 된다. 클라이언트 변경은 필요 없다(오류 문구가 그대로 신청서에 보인다).

-- closesAt 은 편집기의 datetime-local 값("2026-11-03T23:59")이라 시간대가 없다. 운영진이 한국 시각으로 쓴 값이다.
-- 시간대가 붙은 값이 오면 그대로 읽는다. 읽을 수 없는 값은 마감으로 본다(망가진 값은 닫힌 쪽으로 실패한다).
create or replace function ypl_schema_validation.application_closed(p_form jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_form ->> 'closesAt', ''));
begin
  if v = '' then return false; end if;
  return now() >= case
    when v ~ '(Z|[+-]\d\d(:?\d\d)?)$' then v::timestamptz
    else v::timestamp at time zone 'Asia/Seoul'
  end;
exception when others then
  return true;
end;
$$;
revoke all on function ypl_schema_validation.application_closed(jsonb) from public;
grant execute on function ypl_schema_validation.application_closed(jsonb) to anon, authenticated;

create or replace function ypl_schema_validation.guard_application_close()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.registration_source is distinct from 'application' or (select ypl_schema_validation.is_ypl_admin()) then
    return new;
  end if;
  if exists (
    select 1
      from public.site_data s
     cross join lateral jsonb_array_elements(s.value -> 'announcements') as a(item)
     where s.key = 'ypl_data_v4'
       and (a.item #>> '{form,eventId}' = new.event_id::text
            or a.item ->> 'id' in (select li.announcement_id from ypl_schema_validation.league_intakes li
                                    where new.event_id in (li.master_event_id, li.rookie_event_id)))
       and ypl_schema_validation.application_closed(a.item -> 'form')
  ) then
    raise exception using errcode = 'P0001', message = '신청이 마감되었습니다.';
  end if;
  -- 동시에 들어온 신청이 서로의 개수를 못 보고 함께 지나가지 않게 차례로 센다
  perform pg_advisory_xact_lock(hashtext('visitor_apply'));
  if (select count(*) from ypl_schema_validation.event_registrations r
       where r.registration_source = 'application' and r.created_at > now() - interval '1 minute') >= 20 then
    raise exception using errcode = 'P0001', message = '신청이 많이 들어오고 있습니다. 잠시 뒤 다시 시도해 주세요.';
  end if;
  if (select count(*) from ypl_schema_validation.event_registrations r
       where r.event_id = new.event_id and r.registration_source = 'application') >= 512 then
    raise exception using errcode = 'P0001', message = '신청 인원이 가득 찼습니다. 운영진에게 문의해 주세요.';
  end if;
  return new;
end;
$$;
revoke all on function ypl_schema_validation.guard_application_close() from public, anon, authenticated, service_role;
drop trigger if exists guard_application_close on ypl_schema_validation.event_registrations;
create trigger guard_application_close before insert on ypl_schema_validation.event_registrations
  for each row execute function ypl_schema_validation.guard_application_close();

-- backend_hardening.sql 의 같은 함수에 마감 확인만 더했다.
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

-- announcement_push.sql 의 같은 함수에 구독 수 한도만 더했다. 이미 있는 구독의 키 갱신은 한도와 상관없이 된다.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.push_subscriptions s where s.endpoint = p_endpoint)
     and (select count(*) from public.push_subscriptions) >= 1000 then
    raise exception using errcode = 'P0001', message = '알림 구독자가 가득 찼습니다.';
  end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth)
  values (p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke all on function public.save_push_subscription(text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text) to anon, authenticated;
