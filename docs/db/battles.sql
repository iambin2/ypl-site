-- 사이트 안 배틀(1단계: 친선전). 쇼다운 엔진은 battle Edge Function 안에서만 돈다.
-- 방문자는 공개 행만 읽는다. 쓰기는 함수가 service_role로 아래 두 함수만 부른다. 공식 데이터와는 어떤 외래 키로도 이어지지 않는다.
-- 한 번 실행하면 되고, 다시 실행해도 있는 행은 건드리지 않는다.

-- 1. 공개 행. 진행 중에는 관전 로그(양쪽 모두에게 보이는 줄)만 있고, 끝나면 전체 로그와 입력 기록이 함께 공개된다.
-- 입력 기록은 시드와 모든 선택이라, 같은 엔진으로 배틀을 처음부터 그대로 다시 돌릴 수 있다.
create table if not exists public.battles (
  id text primary key check (id ~ '^[a-z0-9]{12}$'),
  regulation text not null check (regulation ~ '^[a-z0-9-]{1,12}$'),
  format_id text not null,
  engine text not null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'ended')),
  p1_name text not null check (char_length(btrim(p1_name)) between 1 and 20),
  p2_name text check (char_length(btrim(p2_name)) between 1 and 20),
  turn integer not null default 0,
  winner text check (winner in ('p1', 'p2', 'tie')),
  ended_by text check (ended_by in ('battle', 'forfeit')),
  spectator_log text not null default '',
  log text,
  input_log text,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ended') = (winner is not null and log is not null and input_log is not null))
);
create index if not exists battles_created_idx on public.battles (created_at desc);

alter table public.battles enable row level security;
revoke all on table public.battles from public, anon, authenticated;
grant select on table public.battles to anon, authenticated;
drop policy if exists battles_read on public.battles;
create policy battles_read on public.battles for select to anon, authenticated using (true);

-- 2. 닫힌 행. 엔진 상태(시드와 양쪽 파티가 들어 있다), 좌석 토큰의 해시, 아직 짝이 맞지 않은 선택.
create table if not exists public.battle_secrets (
  battle_id text primary key references public.battles (id) on delete cascade,
  p1_token_hash text not null,
  p2_token_hash text,
  p1_team jsonb not null,
  state jsonb,
  pending jsonb not null default '{}'::jsonb
);
alter table public.battle_secrets enable row level security;
revoke all on table public.battle_secrets from public, anon, authenticated;
-- 이 프로젝트는 새 표에 기본 권한을 주지 않는다(access_lockdown.sql). 배틀 함수는 service_role로 두 표를 읽는다. 쓰기는 아래 함수로만.
grant select on table public.battles, public.battle_secrets to service_role;

-- 3. 만들기. 사이트 전체 분당 20판, 모두 5000판까지. 넘치면 오래된 판을 운영진이 정리한다.
-- ponytail: 사이트 전체 한도다. 악용이 생기면 요청 IP별 한도로 바꾼다.
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
  if (select count(*) from public.battles b where b.created_at > now() - interval '1 minute') >= 20 then
    raise exception using errcode = 'P0001', message = '배틀이 많이 열리고 있습니다. 잠시 뒤 다시 시도해 주세요.';
  end if;
  if (select count(*) from public.battles) >= 5000 then
    raise exception using errcode = 'P0001', message = '배틀 저장 공간이 가득 찼습니다. 운영진에게 정리를 요청해 주세요.';
  end if;
  insert into public.battles (id, regulation, format_id, engine, p1_name)
  values (p_id, p_regulation, p_format_id, p_engine, btrim(p_p1_name));
  insert into public.battle_secrets (battle_id, p1_token_hash, p1_team)
  values (p_id, p_p1_token_hash, p_p1_team);
end;
$$;

-- 4. 저장. 읽을 때의 version과 같을 때만 쓴다. 두 선수의 선택이 동시에 들어오면 늦은 쪽이 false를 받고 다시 읽어 적용한다.
-- 두 표를 한 트랜잭션으로 쓰므로 공개 행과 엔진 상태가 어긋나지 않는다. null인 인자는 그 칸을 그대로 둔다.
create or replace function public.battle_save(
  p_id text, p_version integer,
  p_status text, p_p2_name text, p_turn integer, p_winner text, p_ended_by text,
  p_spectator_log text, p_log text, p_input_log text,
  p_p2_token_hash text, p_state jsonb, p_pending jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.battles b
     set status = coalesce(p_status, b.status),
         p2_name = coalesce(btrim(p_p2_name), b.p2_name),
         turn = coalesce(p_turn, b.turn),
         winner = coalesce(p_winner, b.winner),
         ended_by = coalesce(p_ended_by, b.ended_by),
         spectator_log = coalesce(p_spectator_log, b.spectator_log),
         log = coalesce(p_log, b.log),
         input_log = coalesce(p_input_log, b.input_log),
         version = b.version + 1,
         updated_at = now()
   where b.id = p_id and b.version = p_version;
  if not found then return false; end if;
  update public.battle_secrets s
     set p2_token_hash = coalesce(p_p2_token_hash, s.p2_token_hash),
         state = coalesce(p_state, s.state),
         pending = coalesce(p_pending, s.pending)
   where s.battle_id = p_id;
  return true;
end;
$$;

revoke all on function public.battle_create(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.battle_save(text, integer, text, text, integer, text, text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.battle_create(text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.battle_save(text, integer, text, text, integer, text, text, text, text, text, text, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
