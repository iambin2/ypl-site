-- 컴퓨터와의 배틀 기록. 컴퓨터가 지난 배틀에서 배우게 하기 위한 재료다(2026-11-06).
-- 배틀은 그 기기에서 돌고, 끝나면 기기가 입력 기록(시드와 모든 선택)만 battle 함수의 record로 보낸다.
-- 함수는 같은 엔진으로 처음부터 다시 돌려 끝까지 가는지, 두 파티가 규정에 맞는지, p2가 컴퓨터인지 확인하고(engine.mjs readCpuRecord),
-- 승자와 턴 수도 그 결과에서 읽는다. 기기가 보낸 다른 값은 쓰지 않는다.
-- 선수 이름은 저장 전에 "선수"로 바꾼다(이름은 배틀 진행에 쓰이지 않는다). 그래서 이 표에는 누구의 이름도 남지 않는다.
-- 공개하지 않는다. 방문자는 읽지도 쓰지도 못하고, 함수가 service_role로 아래 함수만 부른다. 공식 데이터와는 이어지지 않는다.
-- 한 번 실행하면 되고, 다시 실행해도 있는 행은 건드리지 않는다.

-- id는 입력 기록의 SHA-256이다. 같은 배틀을 두 번 보내도(다시 연 화면, 다시 보낸 요청) 한 행만 남는다.
create table if not exists public.cpu_battles (
  id text primary key check (id ~ '^[0-9a-f]{64}$'),
  format_id text not null check (format_id ~ '^[a-z0-9]{1,40}$'),
  engine text not null,
  winner text not null check (winner in ('p1', 'p2', 'tie')),
  ended_by text not null check (ended_by in ('battle', 'forfeit')),
  turns integer not null check (turns >= 0),
  input_log text not null check (octet_length(input_log) <= 262144),
  created_at timestamptz not null default now()
);
create index if not exists cpu_battles_created_idx on public.cpu_battles (created_at desc);

alter table public.cpu_battles enable row level security;
revoke all on table public.cpu_battles from public, anon, authenticated;
grant select on table public.cpu_battles to service_role;

-- 사이트 전체 분당 30판, 모두 20000판까지(한 판은 수 KB). 넘치면 받지 않을 뿐 배틀은 그 기기에서 그대로 끝난다.
-- ponytail: 사이트 전체 한도다. 한 기기가 채우는 일이 생기면 요청 IP별 한도로 바꾼다.
create or replace function public.cpu_battle_record(
  p_id text, p_format_id text, p_engine text, p_winner text, p_ended_by text, p_turns integer, p_input_log text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('cpu_battle_record'));
  if exists (select 1 from public.cpu_battles c where c.id = p_id) then return true; end if;
  if (select count(*) from public.cpu_battles c where c.created_at > now() - interval '1 minute') >= 30 then return false; end if;
  if (select count(*) from public.cpu_battles) >= 20000 then return false; end if;
  insert into public.cpu_battles (id, format_id, engine, winner, ended_by, turns, input_log)
  values (p_id, p_format_id, p_engine, p_winner, p_ended_by, p_turns, p_input_log);
  return true;
end;
$$;

revoke all on function public.cpu_battle_record(text, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.cpu_battle_record(text, text, text, text, text, integer, text) to service_role;

notify pgrst, 'reload schema';
