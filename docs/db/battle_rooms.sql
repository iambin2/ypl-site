-- 친선전의 방 (2026-11-06). battles.sql, battle_links.sql 다음에 실행한다. 다시 실행해도 안전하다.
--
-- 친선전을 열 때 방의 종류를 고른다. 공개 방은 배틀 화면의 열린 방 목록에 서서 누구나 들어온다. 코드 방은 목록에 서지 않고,
-- 방을 연 사람이 알려 주는 숫자 4자리를 넣어야 들어온다. 링크로 들어오는 길은 둘 다 그대로다(코드 방의 링크에는 코드가 함께 간다).
-- 방의 종류(room)는 공개 행에, 코드(room_code)는 닫힌 행(battle_secrets)에 둔다. 코드는 배틀 함수만 읽고, 참가할 때 함수가 맞춰 본다.
-- 이 SQL을 실행한 다음 배틀 함수를 다시 배포하고(npm run build:battle, 배포 명령은 supabase/functions/battle/index.ts), 그 다음 사이트를 배포한다.

alter table public.battles add column if not exists room text;
alter table public.battle_secrets add column if not exists room_code text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'battles_room_check') then
    alter table public.battles add constraint battles_room_check check (room is null or room in ('open', 'code'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'battle_secrets_room_code_check') then
    alter table public.battle_secrets add constraint battle_secrets_room_code_check check (room_code is null or room_code ~ '^[0-9]{4}$');
  end if;
end $$;

-- 열린 방 목록(기다리는 공개 방, 최근 것부터)과 코드로 방 찾기
create index if not exists battles_waiting_rooms_idx on public.battles (created_at desc) where status = 'waiting' and room is not null;
create index if not exists battle_secrets_room_code_idx on public.battle_secrets (room_code) where room_code is not null;

-- 방 만들기: battle_create 와 같은 한도로 배틀을 열고, 같은 트랜잭션에서 방의 종류와 코드를 적는다.
create or replace function public.battle_create_room(
  p_id text, p_regulation text, p_format_id text, p_engine text,
  p_p1_name text, p_p1_token_hash text, p_p1_team jsonb, p_room text, p_room_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_room not in ('open', 'code') or (p_room = 'code') <> (p_room_code is not null) then
    raise exception using errcode = '22023', message = 'room and code do not match';
  end if;
  perform public.battle_create(p_id, p_regulation, p_format_id, p_engine, p_p1_name, p_p1_token_hash, p_p1_team);
  update public.battles set room = p_room where id = p_id;
  update public.battle_secrets set room_code = p_room_code where battle_id = p_id;
end;
$$;

revoke all on function public.battle_create_room(text, text, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.battle_create_room(text, text, text, text, text, text, jsonb, text, text) to service_role;

notify pgrst, 'reload schema';

-- 2026-11-06 덧붙임: 방문자는 battles 를 열마다 허락받아 읽는다(battle_integration.sql). room 열도 읽을 수 있게 한다.
-- 이것이 없으면 사이트가 배틀 행을 읽지 못해 방 화면이 멈추고 공개 방 목록이 비었다.
grant select (room) on table public.battles to anon, authenticated;
