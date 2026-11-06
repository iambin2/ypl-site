-- 2026-11-06 급한 수정. battle_rooms.sql 과 battle_rematch.sql 이 새 열을 만들었지만 방문자에게 읽기를 허락하지 않았다.
-- 방문자는 battles 를 열마다 허락받아 읽으므로(battle_integration.sql), 사이트가 배틀 행을 읽지 못해 사람끼리의 방 화면이 멈추고
-- 공개 방 목록이 비었다. 아래 한 줄로 두 열을 읽게 한다. 다시 실행해도 안전하다.
grant select (room, rematch_id) on table public.battles to anon, authenticated;
notify pgrst, 'reload schema';
