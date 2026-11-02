-- Apply this file and league_intake.sql in ONE migration, before the frontend.
-- Historical Event facts stay intact. Only the edition catalogue is seeded.
create table if not exists ypl_schema_validation.competition_editions (
  id uuid primary key default gen_random_uuid(),
  family text not null check (family in ('regular','champions','light')),
  round_number integer not null check (round_number > 0),
  created_at timestamptz not null default now(),
  unique (family,round_number)
);
alter table ypl_schema_validation.competition_editions enable row level security;
revoke all on ypl_schema_validation.competition_editions from public,anon,authenticated;
grant select on ypl_schema_validation.competition_editions to anon,authenticated;
grant insert on ypl_schema_validation.competition_editions to authenticated;
drop policy if exists public_read on ypl_schema_validation.competition_editions;
create policy public_read on ypl_schema_validation.competition_editions for select to anon,authenticated using(true);
drop policy if exists admin_insert on ypl_schema_validation.competition_editions;
create policy admin_insert on ypl_schema_validation.competition_editions for insert to authenticated
  with check((select ypl_schema_validation.is_ypl_admin()));

alter table ypl_schema_validation.events add column if not exists competition_edition_id uuid
  references ypl_schema_validation.competition_editions(id) on delete restrict;
create index if not exists events_competition_edition_idx on ypl_schema_validation.events(competition_edition_id);

insert into ypl_schema_validation.competition_editions(family,round_number)
select distinct case when event_type='champions' then 'champions'
  when event_type='light' or division='light' then 'light' else 'regular' end,round_number
from ypl_schema_validation.events
where round_number>0 and (event_type in ('champions','light') or
  (event_type='pokecup' and (division is null or division in('master','rookie','light'))))
on conflict(family,round_number) do nothing;

create or replace function ypl_schema_validation.reserve_competition_edition(p_family text,p_existing_id uuid default null)
returns ypl_schema_validation.competition_editions
language plpgsql security invoker set search_path='' as $$
declare ed ypl_schema_validation.competition_editions%rowtype; n integer;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_family not in ('regular','champions','light') or p_family is null then raise exception '대회 계열이 올바르지 않습니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('competition-edition:'||p_family,0));
  if p_existing_id is not null then
    select * into strict ed from ypl_schema_validation.competition_editions where id=p_existing_id;
    if ed.family<>p_family then raise exception '다른 대회 계열의 회차를 사용할 수 없습니다.'; end if;
  else
    select coalesce(max(round_number),0)+1 into n from ypl_schema_validation.competition_editions where family=p_family;
    insert into ypl_schema_validation.competition_editions(family,round_number) values(p_family,n) returning * into ed;
  end if;
  return ed;
end $$;
revoke all on function ypl_schema_validation.reserve_competition_edition(text,uuid) from public,anon,service_role;
grant execute on function ypl_schema_validation.reserve_competition_edition(text,uuid) to authenticated;

create or replace function ypl_schema_validation.assign_competition_edition()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_family text; ed ypl_schema_validation.competition_editions%rowtype;
  existing ypl_schema_validation.events%rowtype; requested uuid; notice text;
begin
  v_family:=case when new.event_type='champions' then 'champions'
    when new.event_type='light' or new.division='light' then 'light'
    when new.event_type='pokecup' and (new.division in('master','rookie') or
      (new.division is null and new.round_number is not null)) then 'regular' else null end;
  if v_family is null then
    if new.competition_edition_id is not null then raise exception '기타 대회는 공식 회차에 연결할 수 없습니다.'; end if;
    return new;
  end if;
  if tg_op='UPDATE' and new.competition_edition_id is not distinct from old.competition_edition_id
     and new.round_number is not distinct from old.round_number and new.event_type=old.event_type
     and new.division is not distinct from old.division and new.battle_format is not distinct from old.battle_format
     and new.championship_phase is not distinct from old.championship_phase and new.is_team_event=old.is_team_event then return new; end if;
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('competition-edition:'||v_family,0));
  if tg_op='UPDATE' then existing:=old;
  else select * into existing from ypl_schema_validation.events where id=new.id; end if;
  if existing.id is not null and existing.competition_edition_id is not null then
    if new.competition_edition_id is null then new.competition_edition_id:=existing.competition_edition_id; end if;
    if new.competition_edition_id<>existing.competition_edition_id or new.round_number is distinct from existing.round_number
       or new.division is distinct from existing.division or new.battle_format is distinct from existing.battle_format
       or new.is_team_event is distinct from existing.is_team_event or new.event_type<>existing.event_type
       or new.championship_phase is distinct from existing.championship_phase then
      -- Registered identity and edition stay fixed after any downstream facts.
      if ypl_schema_validation.league_intake_has_downstream(array[existing.id]) then
        raise exception '신청이나 경기 기록이 있어 대회의 회차와 구분을 변경할 수 없습니다.';
      end if;
    end if;
  end if;
  requested:=new.competition_edition_id;
  if requested is null and existing.id is not null and existing.round_number>0 then
    select id into requested from ypl_schema_validation.competition_editions
      where competition_editions.family=v_family and round_number=existing.round_number;
  end if;
  notice:=new.registration_settings->>'announcementId';
  if requested is null and existing.id is null then
    requested:=nullif(new.registration_settings->>'competitionEditionId','')::uuid;
    if v_family='champions' and new.championship_phase='qualifier' then
      select competition_edition_id into requested from ypl_schema_validation.events where id=new.championship_final_event_id;
      if requested is null then raise exception '본선의 공식 회차를 확인할 수 없습니다.'; end if;
    end if;
    if requested is null and notice is not null then
      select competition_edition_id into requested from ypl_schema_validation.events
      where registration_settings->>'announcementId'=notice and competition_edition_id is not null limit 1;
    end if;
  end if;
  select * into ed from ypl_schema_validation.reserve_competition_edition(v_family,requested);
  if v_family='champions' and existing.id is null and (ed.round_number<7 or new.battle_format not in('singles','doubles')
     or new.championship_phase not in('qualifier','final') or new.championship_phase is null) then
    raise exception '새 챔피언스는 7회 이후의 싱글 또는 더블 선발전과 본선으로 생성해야 합니다.';
  end if;
  if v_family='regular' and exists(select 1 from ypl_schema_validation.events e
    where (e.competition_edition_id=ed.id or (e.competition_edition_id is null and e.event_type='pokecup'
      and (e.division is null or e.division in('master','rookie')) and e.round_number=ed.round_number))
      and e.id<>new.id and e.is_team_event<>new.is_team_event) then
    raise exception '같은 파이컵 회차에 개인전과 팀전을 혼합할 수 없습니다.';
  end if;
  if exists(select 1 from ypl_schema_validation.events e where e.competition_edition_id=ed.id and e.id<>new.id and
    ((v_family='champions' and e.battle_format=new.battle_format and e.championship_phase=new.championship_phase)
     or (v_family='regular' and (new.is_team_event or e.division is not distinct from new.division)) or v_family='light')) then
    raise exception '해당 회차의 종목이나 리그가 이미 생성되어 있습니다. 기존 공지를 수정해 주세요.';
  end if;
  new.competition_edition_id:=ed.id;
  new.round_number:=ed.round_number;
  new.registration_settings:=jsonb_set(coalesce(new.registration_settings,'{}'),'{competitionEditionId}',to_jsonb(ed.id::text));
  new.name:=regexp_replace(new.name,'^[0-9]+회[[:space:]]*',ed.round_number::text||'회 ');
  if v_family='champions' then
    new.competition_settings:=jsonb_set(new.competition_settings,'{championship,generation}',to_jsonb(ed.round_number));
  end if;
  return new;
end $$;
revoke all on function ypl_schema_validation.assign_competition_edition() from public,anon,authenticated,service_role;
drop trigger if exists assign_competition_edition on ypl_schema_validation.events;
create trigger assign_competition_edition before insert or update on ypl_schema_validation.events
  for each row execute function ypl_schema_validation.assign_competition_edition();

create unique index if not exists events_edition_variant_key on ypl_schema_validation.events
 (competition_edition_id,(case when event_type='champions' then battle_format||':'||championship_phase
   when event_type='light' or division='light' then 'light'
   when is_team_event then 'team' else coalesce(division,'regular') end))
 where competition_edition_id is not null;

-- Explicit administrative repair. It moves no registration or immutable fact.
create or replace function ypl_schema_validation.correct_pristine_event_round(p_event_id uuid,p_round integer)
returns uuid language plpgsql security invoker set search_path='' as $$
declare e ypl_schema_validation.events%rowtype; ed uuid;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('competition-edition:regular',0));
  select * into strict e from ypl_schema_validation.events where id=p_event_id for update;
  if e.status<>'open' or e.event_type<>'pokecup' or e.is_team_event or e.division not in('master','rookie')
     or p_round<1 or p_round is null or ypl_schema_validation.league_intake_has_downstream(array[e.id],true)
     or exists(select 1 from ypl_schema_validation.league_intakes where master_event_id=e.id or rookie_event_id=e.id) then
    raise exception '제출과 대진표가 없는 단독 개인전 공지만 회차를 정정할 수 있습니다.';
  end if;
  insert into ypl_schema_validation.competition_editions(family,round_number) values('regular',p_round)
    on conflict(family,round_number) do nothing;
  select id into ed from ypl_schema_validation.competition_editions where family='regular' and round_number=p_round;
  -- Trigger guards normally block changing an edition once applications exist.
  -- A legacy unlinked Event is the sole exception admitted by this repair RPC.
  if e.competition_edition_id is not null and e.competition_edition_id<>ed then
    raise exception '이미 공식 회차에 연결된 대회는 이행 대상이 아닙니다.';
  end if;
  update ypl_schema_validation.events set competition_edition_id=ed,round_number=p_round,
    name=regexp_replace(name,'^[0-9]+회[[:space:]]*',p_round::text||'회 '),updated_at=now() where id=e.id;
  return ed;
end $$;
revoke all on function ypl_schema_validation.correct_pristine_event_round(uuid,integer) from public,anon,service_role;
grant execute on function ypl_schema_validation.correct_pristine_event_round(uuid,integer) to authenticated;
