-- 연승 도전 (docs/BATTLE_STREAK.md, 2026-11-07). 다시 실행해도 안전하다.
--
-- 생각
--   - 승인된 Google 계정의 트레이너가 컴퓨터와 랜덤 배틀을 이어서 하고, 지기 전까지 이긴 판 수가 기록이다. 순위는 달(KST)마다
--     계정별 최고 기록 하나다. 같은 연승이면 그 연승에 먼저 닿은 사람이 위다.
--   - 판은 방 배틀과 같은 battles 와 battle_secrets 의 행이다(kind 'streak'). 엔진도 컴퓨터도 배틀 함수 안에서만 돌고, 시드와
--     파티는 함수가 뽑는다. 그래서 공개 행으로 누구나 관전하고, 끝난 판은 리플레이로 본다.
--   - 쓰기는 배틀 함수가 service_role로 아래 함수만 부른다. 방문자는 순위(streak_board)만 읽는다.
--   - 공식 기록(정규화 스키마)과는 어떤 외래 키로도 이어지지 않는다. Result도 RankingAward도 만들지 않는다.
--   - 무료 요금제 안에 머문다(DB 500 MB). 끝난 판은 엔진 상태와 컴퓨터의 추리를 지우고, 지난달보다 오래된 판은 행째 지운다.
--     도전 기록(streak_runs)은 작아서 남긴다. 새 도전은 사이트 전체 하루 300번까지다.
--   - 시간이 지난 판(90초 안에 고르지 않음)을 닫는 따로 도는 작업은 없다. 누가 새 도전을 시작할 때 지난 판들을 조금씩 닫는다.
--     그 사이에도 순위는 마감이 지난 판을 진행 중으로 보이지 않는다.

begin;

-- 1. 판의 종류에 연승 도전을 더한다. 연승 판은 친선전처럼 대회와 이어지지 않는다.
alter table public.battles drop constraint if exists battles_kind;
alter table public.battles add constraint battles_kind check (
  kind in ('friendly', 'official', 'streak') and ((kind in ('friendly', 'streak')) = (event_id is null and source_node_key is null))
);

-- 2. 도전. 이름은 시작할 때의 승인된 이름을 그때의 사실로 남긴다(운영진이 나중에 계정 이름을 바꿔도 지난 기록은 그대로).
create table if not exists public.streak_runs (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  trainer_name text not null check (char_length(btrim(trainer_name)) between 1 and 40),
  format_id text not null,
  month date not null,
  wins integer not null default 0 check (wins >= 0),
  status text not null default 'active' check (status in ('active', 'ended')),
  battle_id text references public.battles (id) on delete set null,
  started_at timestamptz not null default now(),
  last_win_at timestamptz,
  ended_at timestamptz,
  check ((status = 'ended') = (ended_at is not null)),
  check ((wins = 0) = (last_win_at is null))
);
create unique index if not exists streak_runs_one_active on public.streak_runs (auth_user_id) where status = 'active';
create index if not exists streak_runs_board on public.streak_runs (month, wins desc, last_win_at);
alter table public.streak_runs enable row level security;
revoke all on table public.streak_runs from public, anon, authenticated;
grant select on table public.streak_runs to service_role;

alter table public.battles add column if not exists run_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'battles_run_fk') then
    alter table public.battles add constraint battles_run_fk foreign key (run_id) references public.streak_runs (id) on delete set null;
  end if;
end $$;
alter table public.battles drop constraint if exists battles_run_kind;
alter table public.battles add constraint battles_run_kind check ((kind = 'streak') = (run_id is not null));
-- 방문자는 battles 를 열마다 허락받아 읽는다(battle_column_grants.sql)
grant select (run_id) on table public.battles to anon, authenticated;

-- 3. 컴퓨터의 추리(createCpu의 memory()). 요청마다 새로 만드는 서버 컴퓨터가 이어 받는다. 판이 끝나면 지운다.
alter table public.battle_secrets add column if not exists cpu_memory jsonb;

create or replace function public.battle_set_cpu_memory(p_id text, p_memory jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if octet_length(p_memory::text) > 262144 then
    raise exception using errcode = '22023', message = 'cpu memory is too large';
  end if;
  update public.battle_secrets s set cpu_memory = p_memory
   where s.battle_id = p_id
     and exists (select 1 from public.battles b where b.id = p_id and b.kind = 'streak' and b.status = 'active');
end;
$$;

-- 4. 친선전의 한도(분당 20판, 모두 5000판)는 친선전과 공식전만 센다. 연승 판은 아래 자기 한도와 정리를 따른다.
create or replace function public.battle_create(
  p_id text, p_regulation text, p_format_id text, p_engine text,
  p_p1_name text, p_p1_token_hash text, p_p1_team jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('battle_create'));
  if (select count(*) from public.battles b where b.created_at > now() - interval '1 minute' and b.kind <> 'streak') >= 20 then
    raise exception using errcode = 'P0001', message = '배틀이 많이 열리고 있습니다. 잠시 뒤 다시 시도해 주세요.';
  end if;
  if (select count(*) from public.battles b where b.kind <> 'streak') >= 5000 then
    raise exception using errcode = 'P0001', message = '배틀 저장 공간이 가득 찼습니다. 운영진에게 정리를 요청해 주세요.';
  end if;
  insert into public.battles (id, regulation, format_id, engine, p1_name)
  values (p_id, p_regulation, p_format_id, p_engine, btrim(p_p1_name));
  insert into public.battle_secrets (battle_id, p1_token_hash, p1_team)
  values (p_id, p_p1_token_hash, p_p1_team);
end;
$$;

-- 5. 판 하나를 연다(아래 두 함수가 쓴다). 컴퓨터가 선출까지 고른 상태로 들어오므로 처음부터 진행 중이고, 90초 시계가 바로 간다.
--    판의 선수 이름은 20자까지라(battles), 계정 이름(40자까지)의 앞 20자로 선다.
create or replace function public.streak_open_battle(
  p_run uuid, p_id text, p_regulation text, p_format_id text, p_engine text, p_p1_name text,
  p_token_hash text, p_p1_team jsonb, p_state jsonb, p_pending jsonb, p_turn integer, p_spectator_log text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.battles (id, regulation, format_id, engine, status, kind, run_id, p1_name, p2_name, turn, spectator_log)
  values (p_id, p_regulation, p_format_id, p_engine, 'active', 'streak', p_run, left(btrim(p_p1_name), 20), '컴퓨터', p_turn, p_spectator_log);
  insert into public.battle_secrets (battle_id, p1_token_hash, p1_team, state, pending)
  values (p_id, p_token_hash, p_p1_team, p_state, coalesce(p_pending, '{}'::jsonb));
  update public.streak_runs r set battle_id = p_id where r.id = p_run;
end;
$$;

-- 6. 끝난 판을 정리한다: 엔진 상태와 추리를 지운다. 리플레이는 공개 행의 입력 기록으로 다시 돌린다.
create or replace function public.streak_clear_secret(p_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.battle_secrets s set state = null, pending = '{}'::jsonb, cpu_memory = null where s.battle_id = p_id;
$$;

-- 7. 배틀 함수가 첫 판의 엔진을 만들기 전에 선수 이름을 안다(엔진의 선수 이름이 판의 이름과 같도록). 승인되지 않았으면 null.
create or replace function public.streak_trainer_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select left(btrim(a.requested_name), 20) from public.player_accounts a where a.auth_user_id = p_user and a.status = 'approved';
$$;

-- 8. 시작. 승인된 계정만, 계정마다 진행 중인 도전 하나. 진행 중인 도전이 있으면 그때까지 이긴 판 수로 끝내고 그 판은 기권으로 닫는다.
--    시작할 때마다 시간이 지난 판을 20개까지 닫고, 지난달보다 오래된 연승 판을 200개까지 지운다.
create or replace function public.streak_start(
  p_user uuid, p_id text, p_regulation text, p_format_id text, p_engine text,
  p_token_hash text, p_p1_team jsonb, p_state jsonb, p_pending jsonb, p_turn integer, p_spectator_log text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_run uuid;
  v_stale record;
  v_keep_from timestamptz := (date_trunc('month', now() at time zone 'Asia/Seoul') - interval '1 month') at time zone 'Asia/Seoul';
begin
  select a.requested_name into v_name from public.player_accounts a where a.auth_user_id = p_user and a.status = 'approved';
  if v_name is null then
    raise exception using errcode = '42501', message = '이름이 승인된 Google 계정만 연승 도전을 할 수 있습니다.';
  end if;
  perform pg_advisory_xact_lock(hashtext('streak_start'));
  -- ponytail: 사이트 전체 하루 300번이다(무료 요금제의 함수 호출 월 50만, 한 판 25번 안팎). 한 사람이 채우면 계정별 한도로 바꾼다.
  if (select count(*) from public.streak_runs r where r.started_at > now() - interval '1 day') >= 300 then
    raise exception using errcode = 'P0001', message = '오늘의 연승 도전이 모두 찼습니다. 내일 다시 도전해 주세요.';
  end if;

  -- 이 계정의 진행 중인 도전
  for v_stale in
    select r.id as run_id, r.battle_id from public.streak_runs r where r.auth_user_id = p_user and r.status = 'active' for update
  loop
    update public.battles b
       set status = 'ended', winner = 'p2', ended_by = 'forfeit', log = b.spectator_log, input_log = '', version = b.version + 1, updated_at = now()
     where b.id = v_stale.battle_id and b.status = 'active';
    perform public.streak_clear_secret(v_stale.battle_id);
    update public.streak_runs r set status = 'ended', ended_at = now() where r.id = v_stale.run_id;
  end loop;

  -- 사이트의 시간이 지난 판: 90초 안에 고르지 않은 쪽이 지는 시계 규칙 그대로, 컴퓨터는 늦지 않으므로 선수가 진다
  for v_stale in
    select b.id, b.run_id from public.battles b
     where b.kind = 'streak' and b.status = 'active' and b.deadline_at < now() - interval '1 minute'
     order by b.deadline_at limit 20 for update skip locked
  loop
    update public.battles b
       set status = 'ended', winner = 'p2', ended_by = 'timeout', log = b.spectator_log, input_log = '', version = b.version + 1, updated_at = now()
     where b.id = v_stale.id;
    perform public.streak_clear_secret(v_stale.id);
    update public.streak_runs r set status = 'ended', ended_at = now() where r.id = v_stale.run_id and r.status = 'active';
  end loop;

  -- 지난달보다 오래된 연승 판. 도전 기록은 남고 그 판만 사라진다(battle_id가 비워진다)
  delete from public.battles b
   where b.id in (select o.id from public.battles o where o.kind = 'streak' and o.status = 'ended' and o.created_at < v_keep_from limit 200);

  insert into public.streak_runs (auth_user_id, trainer_name, format_id, month)
  values (p_user, btrim(v_name), p_format_id, (date_trunc('month', now() at time zone 'Asia/Seoul'))::date)
  returning id into v_run;
  perform public.streak_open_battle(v_run, p_id, p_regulation, p_format_id, p_engine, v_name, p_token_hash, p_p1_team, p_state, p_pending, p_turn, p_spectator_log);
  return jsonb_build_object('run_id', v_run, 'trainer_name', btrim(v_name), 'wins', 0);
end;
$$;

-- 9. 판이 끝난 뒤. 승자는 함수가 저장한 공개 행의 사실에서 읽는다. 이기면 연승을 하나 올리고, 아니면 도전을 끝낸다.
--    다음 판은 여기서 열지 않는다(2026-11-07): 다음 판의 90초는 선수가 다음 판을 누를 때 시작해야 하므로, 이긴 뒤의 도전은 다음 판이
--    열릴 때까지 쉬고(streak_next), 그동안 나가도 지지 않는다. 예전 함수(v16)가 다음 판을 함께 보내면 그대로 연다.
--    같은 판으로 두 번 불러도(다시 보낸 요청) 한 번만 센다: 센 판은 엔진 상태가 지워져 있다.
create or replace function public.streak_after_battle(
  p_battle_id text, p_id text, p_regulation text, p_format_id text, p_engine text,
  p_token_hash text, p_p1_team jsonb, p_state jsonb, p_pending jsonb, p_turn integer, p_spectator_log text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_battle public.battles%rowtype;
  v_run public.streak_runs%rowtype;
begin
  select * into v_battle from public.battles b where b.id = p_battle_id;
  if not found or v_battle.kind <> 'streak' or v_battle.status <> 'ended' then
    raise exception using errcode = '22023', message = 'not an ended streak battle';
  end if;
  select * into v_run from public.streak_runs r where r.id = v_battle.run_id for update;
  if v_run.status = 'ended' or v_run.battle_id is distinct from p_battle_id
     or not exists (select 1 from public.battle_secrets s where s.battle_id = p_battle_id and s.state is not null) then
    return jsonb_build_object('run_id', v_run.id, 'wins', v_run.wins, 'status', v_run.status, 'battle_id', v_run.battle_id, 'counted', false);
  end if;
  perform public.streak_clear_secret(p_battle_id);
  if v_battle.winner = 'p1' then
    update public.streak_runs r set wins = r.wins + 1, last_win_at = now() where r.id = v_run.id;
    if p_id is not null then
      perform public.streak_open_battle(v_run.id, p_id, p_regulation, p_format_id, p_engine, v_run.trainer_name, p_token_hash, p_p1_team, p_state, p_pending, p_turn, p_spectator_log);
    end if;
    return jsonb_build_object('run_id', v_run.id, 'wins', v_run.wins + 1, 'status', 'active', 'battle_id', coalesce(p_id, p_battle_id), 'counted', true);
  end if;
  update public.streak_runs r set status = 'ended', ended_at = now() where r.id = v_run.id;
  return jsonb_build_object('run_id', v_run.id, 'wins', v_run.wins, 'status', 'ended', 'battle_id', p_battle_id, 'counted', true);
end;
$$;

-- 9-1. 다음 판. 이긴 판에서 선수가 다음 판을 누르면 연다: 도전이 진행 중이고, 도전의 지금 판이 그 이긴 판이며, 이미 센 판일 때만.
--      다음 판이 이미 열렸으면(두 번 누름, 다른 기기) 열지 않는다.
create or replace function public.streak_next(
  p_battle_id text, p_id text, p_regulation text, p_format_id text, p_engine text,
  p_token_hash text, p_p1_team jsonb, p_state jsonb, p_pending jsonb, p_turn integer, p_spectator_log text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_battle public.battles%rowtype;
  v_run public.streak_runs%rowtype;
begin
  select * into v_battle from public.battles b where b.id = p_battle_id;
  if not found or v_battle.kind <> 'streak' or v_battle.status <> 'ended' or v_battle.winner is distinct from 'p1' then
    raise exception using errcode = 'P0001', message = '이긴 판에서만 다음 판을 열 수 있습니다.';
  end if;
  select * into v_run from public.streak_runs r where r.id = v_battle.run_id for update;
  if v_run.status <> 'active' or v_run.battle_id is distinct from p_battle_id
     or exists (select 1 from public.battle_secrets s where s.battle_id = p_battle_id and s.state is not null) then
    raise exception using errcode = 'P0001', message = '이 도전의 다음 판은 이미 열렸거나 도전이 끝났습니다.';
  end if;
  perform public.streak_open_battle(v_run.id, p_id, p_regulation, p_format_id, p_engine, v_run.trainer_name, p_token_hash, p_p1_team, p_state, p_pending, p_turn, p_spectator_log);
  return jsonb_build_object('run_id', v_run.id, 'wins', v_run.wins, 'battle_id', p_id);
end;
$$;

-- 9-2. 다음 판을 만들 때 함수가 아는 도전의 연승(난이도를 정한다)
create or replace function public.streak_run_wins(p_battle_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select r.wins from public.streak_runs r join public.battles b on b.run_id = r.id where b.id = p_battle_id;
$$;

-- 10. 순위. 한 달(KST, 기본은 이번 달)의 계정별 최고 기록 하나씩, 연승이 많은 순, 같으면 먼저 닿은 순. 100명까지.
--    live: 지금 진행 중이고 시계가 남은 도전(그 판을 관전하도록 battle_id를 함께 준다). mine: 로그인한 본인의 줄.
--    1연승 이상이거나 지금 진행 중인 도전만 선다. 누구의 계정 id도 내보내지 않는다.
create or replace function public.streak_board(p_month date default null)
returns table (place integer, trainer_name text, wins integer, live boolean, battle_id text, reached_at timestamptz, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with month_runs as (
    select r.*, coalesce(r.last_win_at, r.started_at) as reached,
           (r.status = 'active' and b.status = 'active' and b.deadline_at > now()) as is_live
      from public.streak_runs r
      left join public.battles b on b.id = r.battle_id
     where r.month = coalesce(p_month, (date_trunc('month', now() at time zone 'Asia/Seoul'))::date)
  ), best as (
    select distinct on (m.auth_user_id) m.*
      from month_runs m
     where m.wins > 0 or m.is_live
     order by m.auth_user_id, m.wins desc, m.reached, m.is_live desc
  )
  select (row_number() over (order by b.wins desc, b.reached))::integer, b.trainer_name, b.wins, coalesce(b.is_live, false),
         case when b.is_live then b.battle_id end, b.reached, b.auth_user_id = (select auth.uid())
    from best b
   order by b.wins desc, b.reached
   limit 100;
$$;

revoke all on function public.battle_set_cpu_memory(text, jsonb) from public, anon, authenticated;
revoke all on function public.streak_open_battle(uuid, text, text, text, text, text, text, jsonb, jsonb, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.streak_clear_secret(text) from public, anon, authenticated;
revoke all on function public.streak_trainer_name(uuid) from public, anon, authenticated;
revoke all on function public.streak_start(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.streak_after_battle(text, text, text, text, text, text, jsonb, jsonb, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.streak_next(text, text, text, text, text, text, jsonb, jsonb, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.streak_run_wins(text) from public, anon, authenticated;
revoke all on function public.streak_board(date) from public;
grant execute on function public.battle_set_cpu_memory(text, jsonb) to service_role;
grant execute on function public.streak_trainer_name(uuid) to service_role;
grant execute on function public.streak_start(uuid, text, text, text, text, text, jsonb, jsonb, jsonb, integer, text) to service_role;
grant execute on function public.streak_after_battle(text, text, text, text, text, text, jsonb, jsonb, jsonb, integer, text) to service_role;
grant execute on function public.streak_next(text, text, text, text, text, text, jsonb, jsonb, jsonb, integer, text) to service_role;
grant execute on function public.streak_run_wins(text) to service_role;
grant execute on function public.streak_board(date) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
