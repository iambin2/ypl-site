-- 방문자 쓰기의 본인 확인과 게시판 행 단위 저장. 1단계: 새 길을 연다. 예전 길은 그대로 두므로 대회 중에도 끊기지 않는다.
-- backend_hardening.sql 다음에 실행한다. 새 클라이언트 배포 뒤에 visitor_gates_close.sql 로 예전 길을 닫는다.

-- 1. 비밀번호는 방문자가 읽을 수 없는 표에만 둔다. 숫자 4자리는 해시로 지켜지지 않으므로 지키는 것은 이 표의 닫힘과 시도 제한이다.
-- 그래서 해시는 예전 글의 형식(sha256, id를 소금으로)을 그대로 쓴다. 옮긴 글의 비밀번호가 바뀌지 않는다.
create table if not exists public.visitor_pins (
  scope text not null check (scope in ('submission', 'community')),
  subject text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  primary key (scope, subject)
);
alter table public.visitor_pins enable row level security;
revoke all on table public.visitor_pins from public, anon, authenticated;

create or replace function public.visitor_pin_hash(p_subject text, p_pin text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to('ypl:' || p_subject || ':' || p_pin, 'UTF8')), 'hex');
$$;
revoke all on function public.visitor_pin_hash(text, text) from public, anon, authenticated;

-- ok, wrong_pin, locked, no_pin 중 하나를 돌려준다. 예외를 던지면 실패 횟수까지 되돌아가므로 호출하는 쪽도 값으로 돌려준다.
create or replace function public.visitor_pin_check(p_scope text, p_subject text, p_pin text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_pin public.visitor_pins%rowtype;
begin
  select * into v_pin from public.visitor_pins p
   where p.scope = p_scope and p.subject = p_subject
   for update;
  if not found then return 'no_pin'; end if;
  if v_pin.locked_until > now() then return 'locked'; end if;
  if public.visitor_pin_hash(p_subject, coalesce(p_pin, '')) = v_pin.pin_hash then
    update public.visitor_pins p set failed_attempts = 0, locked_until = null
     where p.scope = p_scope and p.subject = p_subject;
    return 'ok';
  end if;
  if v_pin.failed_attempts >= 4 then
    update public.visitor_pins p set failed_attempts = 0, locked_until = now() + interval '15 minutes'
     where p.scope = p_scope and p.subject = p_subject;
    return 'locked';
  end if;
  update public.visitor_pins p set failed_attempts = p.failed_attempts + 1
   where p.scope = p_scope and p.subject = p_subject;
  return 'wrong_pin';
end;
$$;
revoke all on function public.visitor_pin_check(text, text, text) from public, anon, authenticated;

-- 2. 공식 파티 제출. 첫 제출이 비밀번호를 정하고, 재제출은 그 비밀번호를 요구한다.
-- 첫 제출을 남이 먼저 했다면 본인이 비밀번호 오류로 바로 알게 되고, 운영진이 초기화한다. 조용히 덮이는 일은 없다.
-- 파티 저장은 기존 함수가 그대로 한다. Event, Registration 순서의 잠금도 같아 재제출이 줄을 선다.
create or replace function ypl_schema_validation.submit_registration_team_snapshot(
  p_event_id uuid,
  p_registration_id uuid,
  p_registration_name text,
  p_snapshot jsonb,
  p_members jsonb,
  p_pin text
)
returns table (submission_id uuid, snapshot_id uuid, revision integer, submitted_at timestamptz, denied text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_subject text := p_registration_id::text;
begin
  perform 1 from ypl_schema_validation.events e where e.id = p_event_id for update;
  perform 1 from ypl_schema_validation.event_registrations r
   where r.id = p_registration_id and r.event_id = p_event_id and r.registration_name = btrim(p_registration_name)
   for update;

  if found and not ypl_schema_validation.is_ypl_admin() then
    v_status := public.visitor_pin_check('submission', v_subject, p_pin);
    if v_status = 'no_pin' then
      if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
        return query select null::uuid, null::uuid, null::integer, null::timestamptz, 'pin_required'::text;
        return;
      end if;
      insert into public.visitor_pins (scope, subject, pin_hash)
      values ('submission', v_subject, public.visitor_pin_hash(v_subject, p_pin));
    elsif v_status <> 'ok' then
      return query select null::uuid, null::uuid, null::integer, null::timestamptz, v_status;
      return;
    end if;
  end if;

  return query
  select s.submission_id, s.snapshot_id, s.revision, s.submitted_at, null::text
    from ypl_schema_validation.submit_registration_team_snapshot(p_event_id, p_registration_id, p_registration_name, p_snapshot, p_members) s;
end;
$$;
revoke all on function ypl_schema_validation.submit_registration_team_snapshot(uuid, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function ypl_schema_validation.submit_registration_team_snapshot(uuid, uuid, text, jsonb, jsonb, text) to anon, authenticated;

-- 비밀번호를 잊었거나 남이 먼저 제출한 경우의 복구. 파티 이력은 건드리지 않는다.
create or replace function public.reset_submission_pin(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ypl_schema_validation.is_ypl_admin() then
    raise exception using errcode = '42501', message = '운영진만 초기화할 수 있습니다.';
  end if;
  delete from public.visitor_pins p where p.scope = 'submission' and p.subject = p_registration_id::text;
end;
$$;
revoke all on function public.reset_submission_pin(uuid) from public, anon, authenticated;
grant execute on function public.reset_submission_pin(uuid) to authenticated;

-- 3. 게시판과 사설 대진표를 행 단위로. 한 사람의 쓰기가 남의 글을 지울 수 없고, 비공개 글은 RLS가 가린다.
-- 대회 기록과 어떤 외래 키로도 이어지지 않는다. 쓰기는 아래 함수로만 들어온다.
create table if not exists public.community_items (
  id text primary key,
  board text not null check (board in ('free', 'showcase', 'private_bracket')),
  parent_id text references public.community_items (id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 32768),
  secret boolean not null default false,
  has_pin boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists community_items_board_created_idx on public.community_items (board, created_at desc);
create index if not exists community_items_parent_idx on public.community_items (parent_id);

alter table public.community_items enable row level security;
revoke all on table public.community_items from public, anon, authenticated;
grant select on table public.community_items to anon, authenticated;
drop policy if exists community_items_read on public.community_items;
create policy community_items_read on public.community_items for select to anon, authenticated
  using (not secret or (select ypl_schema_validation.is_ypl_admin()));

-- ok, wrong_pin, locked, no_pin 중 하나를 돌려준다. 잘못된 입력만 예외로 끝난다.
-- ponytail: 쓰기 제한은 사이트 전체 분당 20건이다. 악용이 생기면 요청 IP별 제한으로 바꾼다.
create or replace function public.community_write(
  p_action text,
  p_board text,
  p_id text,
  p_parent_id text,
  p_payload jsonb,
  p_secret boolean,
  p_pin text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := ypl_schema_validation.is_ypl_admin();
  v_item public.community_items%rowtype;
  v_parent public.community_items%rowtype;
  v_pin text := nullif(p_pin, '');
  v_status text;
  c_reserved constant text[] := array['id', 'pin', 'pinHash', 'comments', 'secret', 'createdAt', 'hasPin', '_expectedUpdatedAt'];
begin
  if p_action = 'create' then
    if p_board not in ('free', 'showcase', 'private_bracket')
       or coalesce(p_id, '') !~ '^[a-z0-9]{4,40}$'
       or jsonb_typeof(p_payload) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = '저장할 글이 올바르지 않습니다.';
    end if;
    if v_pin is not null and v_pin !~ '^[0-9]{4}$' then
      raise exception using errcode = 'P0001', message = '비밀번호는 숫자 4자리로 입력해 주세요.';
    end if;
    if p_board = 'private_bracket' and p_parent_id is null and v_pin is null then
      raise exception using errcode = 'P0001', message = '관리 비밀번호를 입력해 주세요.';
    end if;
    if p_parent_id is not null then
      select * into v_parent from public.community_items i
       where i.id = p_parent_id and i.board = p_board and i.parent_id is null;
      if not found then
        raise exception using errcode = 'P0001', message = '글을 찾을 수 없습니다.';
      end if;
    end if;
    if not v_admin then
      perform pg_advisory_xact_lock(hashtext('community_write'));
      if (select count(*) from public.community_items i where i.created_at > now() - interval '1 minute') >= 20 then
        raise exception using errcode = 'P0001', message = '글이 많이 올라오고 있습니다. 잠시 뒤 다시 시도해 주세요.';
      end if;
      if (select count(*) from public.community_items i where i.board = p_board) >= 3000 then
        raise exception using errcode = 'P0001', message = '저장 공간이 가득 찼습니다. 관리자에게 오래된 글 정리를 요청해 주세요.';
      end if;
    end if;
    insert into public.community_items (id, board, parent_id, payload, secret, has_pin)
    values (p_id, p_board, p_parent_id, case when p_board='private_bracket' then
              (p_payload - c_reserved) || jsonb_build_object('updatedAt',clock_timestamp())
            else p_payload - c_reserved end,
            coalesce(v_parent.secret, p_secret, false), v_pin is not null);
    if v_pin is not null then
      insert into public.visitor_pins (scope, subject, pin_hash)
      values ('community', p_id, public.visitor_pin_hash(p_id, v_pin));
    end if;
    return 'ok';
  end if;

  if p_action not in ('verify', 'update', 'delete') then
    raise exception using errcode = 'P0001', message = '알 수 없는 요청입니다.';
  end if;
  select * into v_item from public.community_items i where i.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = '삭제되었거나 찾을 수 없는 글입니다.';
  end if;
  if not v_admin then
    v_status := public.visitor_pin_check('community', p_id, v_pin);
    if v_status <> 'ok' then return v_status; end if;
  end if;

  if p_action = 'update' then
    if jsonb_typeof(p_payload) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = '저장할 글이 올바르지 않습니다.';
    end if;
    -- The row lock serializes saves; the token also rejects an older reader.
    -- Old clients without a token must refresh instead of overwriting results.
    if v_item.board='private_bracket' and
       (not (p_payload ? '_expectedUpdatedAt') or
        p_payload->'_expectedUpdatedAt' is distinct from coalesce(v_item.payload->'updatedAt','null'::jsonb)) then
      return 'stale';
    end if;
    update public.community_items i
       set payload = i.payload || (p_payload - c_reserved) || case when i.board='private_bracket'
             then jsonb_build_object('updatedAt',clock_timestamp()) else '{}'::jsonb end,
           secret = coalesce(p_secret, i.secret)
     where i.id = p_id;
    if p_secret is not null then
      update public.community_items i set secret = p_secret where i.parent_id = p_id;
    end if;
  elsif p_action = 'delete' then
    delete from public.visitor_pins p
     where p.scope = 'community'
       and p.subject in (select i.id from public.community_items i where i.id = p_id or i.parent_id = p_id);
    delete from public.community_items i where i.id = p_id;
  end if;
  return 'ok';
end;
$$;
revoke all on function public.community_write(text, text, text, text, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.community_write(text, text, text, text, jsonb, boolean, text) to anon, authenticated;

-- 4. 지금까지의 글을 옮긴다. 다시 실행해도 있는 글은 건드리지 않는다. 원본은 close 단계의 백업까지 그대로 남는다.
with source as (
  select 'free' as board, b as item from public.site_data s, jsonb_array_elements(s.value -> 'board') b where s.key = 'ypl_data_v4'
  union all
  select 'showcase', b from public.site_data s, jsonb_array_elements(s.value -> 'items') b where s.key = 'ypl_showcase_v1'
  union all
  select 'private_bracket', b from public.site_data s, jsonb_array_elements(s.value -> 'items') b where s.key = 'ypl_private_brackets_v1'
)
insert into public.community_items (id, board, parent_id, payload, secret, has_pin, created_at)
select item ->> 'id', board, null,
       item - array['id', 'pin', 'pinHash', 'comments', 'secret', 'createdAt'],
       coalesce((item ->> 'secret')::boolean, false),
       coalesce(item ->> 'pin', item ->> 'pinHash', '') <> '',
       coalesce((item ->> 'createdAt')::timestamptz, now())
  from source
 where item ? 'id'
on conflict (id) do nothing;

with source as (
  select 'free' as board, b as item from public.site_data s, jsonb_array_elements(s.value -> 'board') b where s.key = 'ypl_data_v4'
  union all
  select 'showcase', b from public.site_data s, jsonb_array_elements(s.value -> 'items') b where s.key = 'ypl_showcase_v1'
)
insert into public.community_items (id, board, parent_id, payload, secret, has_pin, created_at)
select c ->> 'id', board, item ->> 'id',
       c - array['id', 'pin', 'pinHash', 'comments', 'secret', 'createdAt'],
       coalesce((item ->> 'secret')::boolean, false),
       coalesce(c ->> 'pin', c ->> 'pinHash', '') <> '',
       coalesce((c ->> 'createdAt')::timestamptz, now())
  from source, jsonb_array_elements(coalesce(item -> 'comments', '[]'::jsonb)) c
 where c ? 'id'
on conflict (id) do nothing;

with source as (
  select b as item from public.site_data s, jsonb_array_elements(s.value -> 'board') b where s.key = 'ypl_data_v4'
  union all
  select b from public.site_data s, jsonb_array_elements(s.value -> 'items') b where s.key in ('ypl_showcase_v1', 'ypl_private_brackets_v1')
), records as (
  select item from source
  union all
  select c from source, jsonb_array_elements(coalesce(item -> 'comments', '[]'::jsonb)) c
)
insert into public.visitor_pins (scope, subject, pin_hash)
select 'community', item ->> 'id',
       coalesce(nullif(item ->> 'pinHash', ''), public.visitor_pin_hash(item ->> 'id', item ->> 'pin'))
  from records
 where item ? 'id' and coalesce(item ->> 'pin', item ->> 'pinHash', '') <> ''
on conflict (scope, subject) do nothing;
