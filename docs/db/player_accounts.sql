-- 구글 로그인과 선수 기록 연결 (운영위 피드백, 2026-11-05: 아이디 기반 신원). 다시 실행해도 안전하다.
--
-- 순서: Supabase 대시보드에서 Google 공급자를 켜고(Authentication, Providers, Google: 클라이언트 ID와 비밀),
--       허용 리디렉션에 https://league.pokeyonsei.com 을 넣은 다음, 마지막으로 이 SQL을 실행한다.
--       화면은 이 SQL이 실행되기 전까지 구글 로그인을 보이지 않는다(player_accounts 표가 없으면 감춘다).
--
-- 지키는 것
--   - 구글 로그인은 선택이다. 신청, 제출, 배틀은 지금처럼 이름과 비밀번호로 된다.
--   - 구글 계정으로 들어온 사람은 누구나 authenticated 역할을 얻는다. 운영진의 표시는 app_metadata.ypl_admin뿐이라
--     쓰기 정책은 모두 운영진만 통과한다(2026-11-05 확인). 그 역할로 운영진 확인 없이 부를 수 있던 함수는 시즌을 만드는
--     ensure_current_ypl_season 하나라서, 아래에서 운영진만 부르게 막는다.
--   - 기존 기록과의 연결은 요청일 뿐이다. 운영진이 승인해야 연결되고, 한 기록에는 승인된 계정이 하나뿐이다.
--   - 계정 행은 본인과 운영진만 읽는다. 쓰기는 아래 두 함수로만 한다.

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

-- 2. 계정과 선수의 연결
create table if not exists public.player_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  account_name text,
  requested_name text,
  player_id uuid references ypl_schema_validation.players(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists player_accounts_one_approved on public.player_accounts (player_id) where status = 'approved';

alter table public.player_accounts enable row level security;
drop policy if exists player_accounts_read on public.player_accounts;
create policy player_accounts_read on public.player_accounts for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select ypl_schema_validation.is_ypl_admin()));
revoke all on table public.player_accounts from anon, authenticated;
grant select on table public.player_accounts to authenticated;

-- 연결 요청: 로그인한 본인이 기록의 이름을 대면 그 이름의 선수(띄어쓰기와 대소문자를 무시한 같은 이름)와 묶어 승인을 기다린다.
-- 같은 선수로 이미 승인된 연결은 다시 요청해도 승인 그대로다. 다른 계정에 승인된 기록은 요청할 수 없다.
create or replace function public.request_player_link(p_name text)
returns public.player_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_player uuid;
  v_row public.player_accounts;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.' using errcode = '42501'; end if;
  if ypl_schema_validation.is_ypl_admin() then raise exception '운영진 계정은 선수 기록과 연결하지 않습니다.'; end if;
  if v_name = '' or char_length(v_name) > 40 then raise exception '기록의 이름을 확인해 주세요.'; end if;
  select p.id into v_player from ypl_schema_validation.players p
    where lower(regexp_replace(p.display_name, '\s+', '', 'g')) = lower(regexp_replace(v_name, '\s+', '', 'g'))
    order by p.created_at limit 1;
  if v_player is null then raise exception '이 이름의 기록이 없습니다.'; end if;
  if exists (select 1 from public.player_accounts a where a.player_id = v_player and a.status = 'approved' and a.auth_user_id <> v_uid) then
    raise exception '이미 다른 계정과 연결된 기록입니다. 운영진에게 문의해 주세요.';
  end if;
  insert into public.player_accounts as a (auth_user_id, email, account_name, requested_name, player_id, status, requested_at, decided_at)
  values (v_uid, auth.jwt() ->> 'email', auth.jwt() -> 'user_metadata' ->> 'full_name', v_name, v_player, 'pending', now(), null)
  on conflict (auth_user_id) do update set
    email = excluded.email, account_name = excluded.account_name, requested_name = excluded.requested_name,
    status = case when a.status = 'approved' and a.player_id = excluded.player_id then 'approved' else 'pending' end,
    decided_at = case when a.status = 'approved' and a.player_id = excluded.player_id then a.decided_at else null end,
    player_id = excluded.player_id, requested_at = now()
  returning * into v_row;
  return v_row;
end
$$;
revoke all on function public.request_player_link(text) from public, anon;
grant execute on function public.request_player_link(text) to authenticated;

-- 운영진의 결정: 승인하면 그 계정이 그 기록의 주인이 되고, 거절하면 요청이 거절로 남는다.
create or replace function public.decide_player_link(p_user uuid, p_approve boolean)
returns public.player_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.player_accounts;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '운영진만 결정할 수 있습니다.' using errcode = '42501'; end if;
  update public.player_accounts set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now()
    where auth_user_id = p_user returning * into v_row;
  if v_row.auth_user_id is null then raise exception '요청을 찾을 수 없습니다.'; end if;
  return v_row;
end
$$;
revoke all on function public.decide_player_link(uuid, boolean) from public, anon;
grant execute on function public.decide_player_link(uuid, boolean) to authenticated;

commit;
