-- 구글 계정으로 트레이너 구분 (운영위 피드백, 2026-11-05와 2026-11-06: 아이디 기반 신원). 다시 실행해도 안전하다.
--
-- 순서: Supabase 대시보드에서 Google 공급자를 켜고(Authentication, Providers, Google: 클라이언트 ID와 비밀),
--       URL Configuration의 Redirect URLs에 https://league.pokeyonsei.com/** 를 넣은 다음(돌아올 주소에 ?view= 같은 뒤가 붙는다),
--       마지막으로 이 SQL을 실행한다.
--       화면은 이 SQL이 실행되기 전까지 구글 로그인을 보이지 않는다(player_accounts 표가 없으면 감춘다).
--
-- 생각
--   - 구글 계정은 희망자만 쓴다. 이름으로 하는 신청, 제출 비밀번호, 배틀은 그대로다.
--   - 계정 하나는 트레이너 이름 하나를 가진다(requested_name). 승인된 계정의 이름은 그 계정만 쓴다: 이름만으로 하는 신청이
--     그 이름을 쓰면 DB가 막는다. 그래서 계정으로 신청한 사람은 오타도, 남이 그 이름으로 신청하는 일도 없다.
--   - 선수 이름이 하나에 한 명인 규칙(player_name_unique.sql)은 그대로다. 동명이인은 처음 한 번 구분되는 이름(이제빈 B)을
--     정하고, 계정이 그 이름을 기억한다.
--   - 기존 기록이나 이름으로 받은 신청이 있는 이름은 요청(pending)이 되고, 운영진이 본인인지 확인해 승인한다.
--     기록이 없는 새 이름은 바로 승인된다. 남의 기록을 가져갈 길이 없다.
--   - 새 트레이너의 선수(Player)는 지금처럼 기록 반영 때 만들어진다. 그때 같은 이름을 가진 승인된 계정과 이어진다.
--   - 승인된 계정의 이름을 바꾸거나 연결을 푸는 것은 운영진만 한다(거절하면 계정이 다시 이름을 정할 수 있다).
--   - 구글 계정으로 들어온 사람은 누구나 authenticated 역할을 얻는다. 운영진의 표시는 app_metadata.ypl_admin뿐이라
--     쓰기 정책은 모두 운영진만 통과한다(2026-11-05 확인). 그 역할로 운영진 확인 없이 부를 수 있던 함수는 시즌을 만드는
--     ensure_current_ypl_season 하나라서, 아래에서 운영진만 부르게 막는다.
--   - 계정 행은 본인과 운영진만 읽는다. 쓰기는 아래 함수로만 한다.

begin;

-- 1. 구글 계정이 부를 수 없게: 시즌 만들기는 운영진만
create or replace function ypl_schema_validation.ensure_current_ypl_season()
returns ypl_schema_validation.seasons
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not ypl_schema_validation.is_ypl_admin() then
    raise exception '운영진만 시즌을 만들 수 있습니다.' using errcode = '42501';
  end if;
  return ypl_schema_validation.ensure_current_ypl_season_for_date(pg_catalog.now());
end
$$;
revoke all on function ypl_schema_validation.ensure_current_ypl_season() from public;
grant execute on function ypl_schema_validation.ensure_current_ypl_season() to authenticated;

-- 2. 계정과 트레이너. name_key는 선수 이름의 규칙(띄어쓰기와 대소문자 무시, uq_players_name_key와 같은 식)이다.
create table if not exists public.player_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  account_name text,
  requested_name text not null check (char_length(btrim(requested_name)) between 1 and 40),
  name_key text generated always as (lower(regexp_replace(requested_name, '\s', '', 'g'))) stored,
  player_id uuid references ypl_schema_validation.players(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists player_accounts_one_approved on public.player_accounts (player_id) where status = 'approved';
create unique index if not exists player_accounts_name_approved on public.player_accounts (name_key) where status = 'approved';

alter table public.player_accounts enable row level security;
drop policy if exists player_accounts_read on public.player_accounts;
create policy player_accounts_read on public.player_accounts for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select ypl_schema_validation.is_ypl_admin()));
revoke all on table public.player_accounts from anon, authenticated;
grant select on table public.player_accounts to authenticated;

-- 3. 이름 정하기: 로그인한 본인이 트레이너 이름을 댄다.
--    그 이름에 기록(선수)이나 이름으로 받은 신청이 있으면 운영진 확인을 기다리고(pending), 없으면 바로 그 계정의 이름이 된다.
create or replace function public.request_player_link(p_name text)
returns public.player_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_key text := lower(regexp_replace(btrim(coalesce(p_name, '')), '\s', '', 'g'));
  v_mine public.player_accounts;
  v_player ypl_schema_validation.players;
  v_status text;
  v_row public.player_accounts;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  if ypl_schema_validation.is_ypl_admin() then raise exception '운영진 계정은 트레이너와 연결하지 않습니다.'; end if;
  if v_key = '' or char_length(v_name) > 40 then raise exception '트레이너 이름을 확인해 주세요.'; end if;
  -- 같은 이름을 두 계정이 동시에 정하지 못하게 차례로 센다
  perform pg_advisory_xact_lock(hashtextextended('player-name:' || v_key, 0));

  select * into v_mine from public.player_accounts a where a.auth_user_id = v_uid for update;
  if v_mine.status = 'approved' then
    if v_mine.name_key = v_key then return v_mine; end if;
    raise exception '이 계정은 이미 %(으)로 연결되어 있습니다. 바꾸려면 운영진에게 문의해 주세요.', v_mine.requested_name;
  end if;
  if exists (select 1 from public.player_accounts a where a.status = 'approved' and a.name_key = v_key) then
    raise exception '이미 다른 계정이 쓰는 이름입니다. 동명이인이면 구분되는 이름(이름 뒤에 B)을 정해 주세요.';
  end if;

  select * into v_player from ypl_schema_validation.players p
   where lower(regexp_replace(p.display_name, '\s', '', 'g')) = v_key;
  v_status := case
    when v_player.id is not null then 'pending'
    when exists (select 1 from ypl_schema_validation.event_registrations r
                  where r.player_id is null and lower(regexp_replace(r.registration_name, '\s', '', 'g')) = v_key) then 'pending'
    else 'approved' end;

  insert into public.player_accounts as a (auth_user_id, email, account_name, requested_name, player_id, status, requested_at, decided_at)
  values (v_uid, auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'full_name', coalesce(v_player.display_name, v_name),
          v_player.id, v_status, now(), case when v_status = 'approved' then now() end)
  on conflict (auth_user_id) do update set
    email = excluded.email, account_name = excluded.account_name, requested_name = excluded.requested_name,
    player_id = excluded.player_id, status = excluded.status, requested_at = now(), decided_at = excluded.decided_at
  returning * into v_row;
  return v_row;
end
$$;
revoke all on function public.request_player_link(text) from public, anon;
grant execute on function public.request_player_link(text) to authenticated;

-- 4. 운영진의 결정: 승인하면 그 계정이 그 이름과 기록의 주인이 되고, 거절하면 계정이 이름을 다시 정할 수 있다.
--    승인된 연결을 거절로 바꾸면 연결이 풀린다.
create or replace function public.decide_player_link(p_user uuid, p_approve boolean)
returns public.player_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.player_accounts;
  v_player ypl_schema_validation.players;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '운영진만 결정할 수 있습니다.' using errcode = '42501'; end if;
  select * into v_row from public.player_accounts where auth_user_id = p_user for update;
  if v_row.auth_user_id is null then raise exception '요청을 찾을 수 없습니다.'; end if;
  if not p_approve then
    update public.player_accounts set status = 'rejected', decided_at = now() where auth_user_id = p_user returning * into v_row;
    return v_row;
  end if;
  -- 요청 뒤에 기록 반영으로 선수가 생겼을 수 있다
  select * into v_player from ypl_schema_validation.players p
   where p.id = v_row.player_id or (v_row.player_id is null and lower(regexp_replace(p.display_name, '\s', '', 'g')) = v_row.name_key);
  if exists (select 1 from public.player_accounts a where a.status = 'approved' and a.auth_user_id <> p_user
              and (a.name_key = v_row.name_key or (v_player.id is not null and a.player_id = v_player.id))) then
    raise exception '이 이름이나 기록은 이미 다른 계정과 연결되어 있습니다.';
  end if;
  update public.player_accounts
     set status = 'approved', decided_at = now(), player_id = v_player.id,
         requested_name = coalesce(v_player.display_name, requested_name)
   where auth_user_id = p_user
  returning * into v_row;
  return v_row;
end
$$;
revoke all on function public.decide_player_link(uuid, boolean) from public, anon;
grant execute on function public.decide_player_link(uuid, boolean) to authenticated;

-- 5. 새 트레이너의 선수가 기록 반영 때 생기면, 같은 이름을 가진 계정과 잇는다.
create or replace function public.link_new_player_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.player_accounts a set player_id = new.id
   where a.player_id is null and a.status in ('approved', 'pending')
     and a.name_key = lower(regexp_replace(new.display_name, '\s', '', 'g'));
  return null;
end
$$;
revoke all on function public.link_new_player_account() from public, anon, authenticated;
drop trigger if exists link_new_player_account on ypl_schema_validation.players;
create trigger link_new_player_account after insert on ypl_schema_validation.players
  for each row execute function public.link_new_player_account();

-- 6. 승인된 계정의 이름은 그 계정만 신청에 쓴다. 이름만으로 하는 신청(익명)이 그 이름을 쓰면 막는다. 운영진의 등록은 막지 않는다.
create or replace function public.guard_account_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.registration_source is distinct from 'application' or ypl_schema_validation.is_ypl_admin() then return new; end if;
  if exists (select 1 from public.player_accounts a
              where a.status = 'approved' and a.auth_user_id is distinct from auth.uid()
                and (a.name_key = lower(regexp_replace(btrim(new.registration_name), '\s', '', 'g'))
                     or (new.player_id is not null and a.player_id = new.player_id))) then
    raise exception using errcode = 'P0001', message = '구글 계정과 연결된 트레이너의 이름입니다. 본인이면 구글 계정으로 신청해 주세요.';
  end if;
  return new;
end
$$;
revoke all on function public.guard_account_name() from public, anon, authenticated;
drop trigger if exists guard_account_name on ypl_schema_validation.event_registrations;
create trigger guard_account_name before insert on ypl_schema_validation.event_registrations
  for each row execute function public.guard_account_name();

-- 7. 계정으로 신청: 이름은 계정의 트레이너 이름이고 선수도 계정의 선수다. 나머지는 이름으로 하는 신청과 같다:
--    리그 배정, 중복, 마감과 인원 제한은 event_registrations의 트리거들이 똑같이 지킨다.
create or replace function public.apply_with_account(p_event_id uuid, p_registration_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.player_accounts;
  v_name text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  select * into v_account from public.player_accounts a where a.auth_user_id = auth.uid() and a.status = 'approved';
  if v_account.auth_user_id is null then raise exception '구글 계정의 트레이너 이름이 아직 정해지지 않았습니다.'; end if;
  if not exists (select 1 from ypl_schema_validation.events e where e.id = p_event_id and e.status = 'open' and e.record_applied_at is null) then
    raise exception '현재 참가 신청을 받고 있는 대회가 아닙니다.';
  end if;
  select coalesce(p.display_name, v_account.requested_name) into v_name
    from (select 1) one left join ypl_schema_validation.players p on p.id = v_account.player_id;
  insert into ypl_schema_validation.event_registrations
    (event_id, player_id, registration_name, registration_data, registration_source, registered_at, updated_at)
  values (p_event_id, v_account.player_id, v_name, coalesce(p_registration_data, '{}'::jsonb), 'application', now(), now())
  returning id into v_id;
  return v_id;
end
$$;
revoke all on function public.apply_with_account(uuid, jsonb) from public, anon;
grant execute on function public.apply_with_account(uuid, jsonb) to authenticated;

commit;
