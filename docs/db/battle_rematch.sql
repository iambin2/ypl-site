-- 다시하기 (2026-11-06). battles.sql, battle_links.sql, battle_rooms.sql 다음에 실행한다. 다시 실행해도 안전하다.
--
-- 친선 배틀이 끝나면 두 선수 중 한 사람이 다시하기를 누른다. 배틀 함수가 같은 규정과 형식으로 새 배틀(코드 방, 목록에 서지 않는다)을
-- 열고, 끝난 배틀의 공개 행에 그 id(rematch_id)를 적는다. 상대의 화면은 끝난 배틀을 계속 읽다가 rematch_id를 보고 다시하기를
-- 권하고, 상대가 누르면 함수가 끝난 배틀의 자리 토큰을 확인한 뒤 새 배틀에 앉힌다. 코드를 몰라도 되고, 다른 사람은 들어올 수 없다.
-- 연 사람이 기다리다 취소하면 새 배틀은 사라지고, 다음 다시하기가 rematch_id를 새로 적는다.
-- 이 SQL을 실행한 다음 배틀 함수를 다시 배포하고(npm run build:battle, 배포 명령은 supabase/functions/battle/index.ts), 그 다음 사이트를 배포한다.
-- SQL만 실행되고 함수가 그대로면 사이트의 다시하기는 오류를 보여 줄 뿐 아무것도 바꾸지 않는다.

alter table public.battles add column if not exists rematch_id text;
-- 방문자는 battles 를 열마다 허락받아 읽는다(battle_integration.sql): 새 열도 읽을 수 있게 한다
grant select (rematch_id) on table public.battles to anon, authenticated;

-- 끝난 친선 배틀에 다시하기 배틀을 적는다. p_expected는 함수가 읽은 값이어서, 두 사람이 동시에 눌러도 한 사람만 적는다.
create or replace function public.battle_set_rematch(p_id text, p_rematch text, p_expected text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.battles set rematch_id = p_rematch
   where id = p_id and status = 'ended' and kind = 'friendly' and rematch_id is not distinct from p_expected;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

revoke all on function public.battle_set_rematch(text, text, text) from public, anon, authenticated;
grant execute on function public.battle_set_rematch(text, text, text) to service_role;

notify pgrst, 'reload schema';
