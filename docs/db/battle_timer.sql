-- 배틀의 시간 제한 (DESIGN.md "Battle", The clock). battles.sql, battle_links.sql 다음에 한 번 실행한다. 다시 실행해도 안전하다.
--
-- 지키는 것
--   - 결정할 일이 생길 때마다(배틀이 시작될 때, 엔진이 턴이나 교체를 진행할 때) 마감 시각이 새로 정해진다. 90초.
--     한쪽의 선택만 기다리는 동안(pending만 바뀌는 저장)에는 마감이 그대로다. 끝난 배틀에는 마감이 없다.
--   - 마감은 트리거가 정한다. 배틀 함수의 저장(battle_save)은 그대로이고, 엔진이 진행할 때만 spectator_log가 바뀌므로 그것으로 안다.
--   - 판정은 배틀 함수의 timeout 동작이 한다: 마감이 지났고, 늦은 쪽만 고를 일이 남았으면 그쪽이 진다(ended_by = 'timeout').
--     입력 기록에는 기권과 같은 >forcelose 한 줄이 남아 같은 엔진으로 그대로 다시 돌릴 수 있다. 판은 누구 대신 고르지 않는다.
--   - deadline_at은 공개 칸이다(시계를 보여 주려고). 다른 칸의 공개 범위는 바꾸지 않는다.
--
-- 순서: 이 SQL, 그다음 배틀 함수 배포(npm run build:battle 후 deploy). 클라이언트는 어느 쪽이 먼저여도 깨지지 않는다:
-- 칸이 없으면 시계를 띄우지 않고, 함수가 timeout을 모르면 마감 알림이 조용히 실패한다.

begin;

alter table public.battles add column if not exists deadline_at timestamptz;
-- 공개 칸을 칸 단위로 허락하는 곳(battle_integration.sql)에서도 읽히게
grant select (deadline_at) on table public.battles to anon, authenticated;

-- 시간 초과로 끝난 배틀
alter table public.battles drop constraint if exists battles_ended_by_check;
alter table public.battles add constraint battles_ended_by_check check (ended_by in ('battle', 'forfeit', 'void', 'timeout'));

create or replace function public.battle_set_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'active' then
    new.deadline_at := null;
  elsif tg_op = 'INSERT' or old.status is distinct from 'active' or new.spectator_log is distinct from old.spectator_log then
    new.deadline_at := now() + interval '90 seconds';
  end if;
  return new;
end;
$$;

drop trigger if exists battles_deadline on public.battles;
create trigger battles_deadline before insert or update on public.battles
  for each row execute function public.battle_set_deadline();

-- 이미 진행 중인 배틀은 지금부터 잰다
update public.battles set deadline_at = now() + interval '90 seconds' where status = 'active' and deadline_at is null;

commit;

notify pgrst, 'reload schema';
