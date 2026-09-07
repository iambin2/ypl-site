-- Champions Qualifier direct-entry setup. Test schema only.
alter table ypl_schema_validation.events
  drop constraint if exists chk_events_championship_stage_shape;
alter table ypl_schema_validation.events
  add constraint chk_events_championship_stage_shape
  check (
    (championship_phase is null and championship_final_event_id is null and qualification_slots is null)
    or (championship_phase = 'qualifier' and championship_final_event_id is not null and championship_final_event_id <> id and (qualification_slots is null or qualification_slots > 0))
    or (championship_phase = 'final' and championship_final_event_id is null and qualification_slots is null)
  );

create table if not exists ypl_schema_validation.championship_qualifier_direct_selections (
    id uuid primary key default gen_random_uuid(),
    qualifier_event_id uuid not null references ypl_schema_validation.events(id) on delete cascade,
    qualifier_registration_id uuid not null references ypl_schema_validation.event_registrations(id) on delete restrict,
    player_id uuid not null references ypl_schema_validation.players(id) on delete restrict,
    created_at timestamptz not null default now(),
    unique (qualifier_event_id, qualifier_registration_id),
    unique (qualifier_event_id, player_id)
);

alter table ypl_schema_validation.championship_advancements
  add column if not exists direct_selection_id uuid references ypl_schema_validation.championship_qualifier_direct_selections(id) on delete restrict;

create or replace function ypl_schema_validation.set_championship_qualifier_direct_selections(
    p_qualifier_event_id uuid,
    p_registration_ids uuid[]
)
returns table (qualifier_event_id uuid, direct_count integer, qualification_slots integer)
language plpgsql security definer set search_path = '' as $$
declare
    v_qualifier ypl_schema_validation.events%rowtype;
    v_final ypl_schema_validation.events%rowtype;
    v_capacity integer;
    v_direct_count integer;
begin
    select * into v_qualifier from ypl_schema_validation.events e where e.id=p_qualifier_event_id for update;
    if not found or v_qualifier.event_type<>'champions' or v_qualifier.championship_phase<>'qualifier'
       or v_qualifier.status not in ('open','running') or v_qualifier.championship_final_event_id is null then
       raise exception using errcode='P0001',message='직행자를 설정할 수 있는 Qualifier Event가 아닙니다.';
    end if;
    if exists(select 1 from ypl_schema_validation.bracket_runtimes where event_id=v_qualifier.id)
       or exists(select 1 from ypl_schema_validation.entries where event_id=v_qualifier.id) then
       raise exception using errcode='P0001',message='대진표 생성 후에는 본선 직행자를 변경할 수 없습니다.';
    end if;
    select * into v_final from ypl_schema_validation.events e where e.id=v_qualifier.championship_final_event_id for update;
    v_capacity := (v_final.competition_settings #>> '{championship,finalCapacity}')::integer;
    select count(*) into v_direct_count from unnest(coalesce(p_registration_ids,'{}'::uuid[])) as id;
    if v_capacity is null or v_direct_count >= v_capacity then
       raise exception using errcode='P0001',message='본선 직행자는 본선 정원보다 적어야 합니다.';
    end if;
    if v_direct_count <> (select count(distinct selection_id)::integer from unnest(coalesce(p_registration_ids,'{}'::uuid[])) as selection_id)
       or exists(select 1 from unnest(coalesce(p_registration_ids,'{}'::uuid[])) as selected(selection_id) left join ypl_schema_validation.event_registrations r on r.id=selected.selection_id and r.event_id=v_qualifier.id where r.id is null)
       or exists(select 1 from (select r.player_id,count(*) from ypl_schema_validation.event_registrations r where r.id=any(coalesce(p_registration_ids,'{}'::uuid[])) group by r.player_id) x where x.player_id is null or x.count>1) then
       raise exception using errcode='P0001',message='본선 직행자는 이 Qualifier의 유효 Event Registration을 중복 없이 선택해야 합니다.';
    end if;
    delete from ypl_schema_validation.championship_qualifier_direct_selections d where d.qualifier_event_id=v_qualifier.id;
    insert into ypl_schema_validation.championship_qualifier_direct_selections(qualifier_event_id,qualifier_registration_id,player_id)
    select v_qualifier.id,r.id,r.player_id from ypl_schema_validation.event_registrations r where r.id=any(coalesce(p_registration_ids,'{}'::uuid[]));
    update ypl_schema_validation.events set qualification_slots=v_capacity-v_direct_count,updated_at=now() where id=v_qualifier.id;
    return query select v_qualifier.id,v_direct_count,v_capacity-v_direct_count;
end $$;

create or replace function ypl_schema_validation.add_championship_qualifier_manual_registration(
    p_qualifier_event_id uuid,
    p_player_id uuid
)
returns table (registration_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
    v_qualifier ypl_schema_validation.events%rowtype;
    v_player ypl_schema_validation.players%rowtype;
    v_existing ypl_schema_validation.event_registrations%rowtype;
begin
    if p_qualifier_event_id is null or p_player_id is null then
        raise exception using errcode='P0001',message='Qualifier Event와 Player가 필요합니다.';
    end if;
    select * into v_qualifier from ypl_schema_validation.events e
     where e.id=p_qualifier_event_id for update;
    if not found or v_qualifier.event_type<>'champions' or v_qualifier.championship_phase<>'qualifier'
       or v_qualifier.status<>'open' then
        raise exception using errcode='P0001',message='대진표 생성 전 open Qualifier에만 수동 참가자를 추가할 수 있습니다.';
    end if;
    if exists(select 1 from ypl_schema_validation.bracket_runtimes where event_id=v_qualifier.id)
       or exists(select 1 from ypl_schema_validation.entries where event_id=v_qualifier.id) then
        raise exception using errcode='P0001',message='선발전 대진표 생성 후에는 수동 참가자를 추가할 수 없습니다.';
    end if;
    select * into v_existing from ypl_schema_validation.event_registrations r
     where r.event_id=v_qualifier.id and r.player_id=p_player_id for update;
    if found then
        return query select v_existing.id,false;
        return;
    end if;
    select * into v_player from ypl_schema_validation.players p
     where p.id=p_player_id and p.status<>'inactive';
    if not found then
        raise exception using errcode='P0001',message='활성 Player만 선발전 참가자로 추가할 수 있습니다.';
    end if;
    insert into ypl_schema_validation.event_registrations(
        event_id,player_id,registration_name,registration_data,registration_source,registered_at,updated_at
    ) values (
        v_qualifier.id,v_player.id,v_player.display_name,
        jsonb_build_object('champions',jsonb_build_object('source','manual')),
        'manual',now(),now()
    ) returning id into registration_id;
    return query select registration_id,true;
end $$;

revoke all on ypl_schema_validation.championship_qualifier_direct_selections from public, anon, authenticated;
grant select on table ypl_schema_validation.championship_qualifier_direct_selections to anon;
revoke all on function ypl_schema_validation.set_championship_qualifier_direct_selections(uuid,uuid[]) from public, authenticated, service_role;
grant execute on function ypl_schema_validation.set_championship_qualifier_direct_selections(uuid,uuid[]) to anon;
revoke all on function ypl_schema_validation.add_championship_qualifier_manual_registration(uuid,uuid) from public, authenticated, service_role;
grant execute on function ypl_schema_validation.add_championship_qualifier_manual_registration(uuid,uuid) to anon;

create or replace function ypl_schema_validation.clear_qualifier_direct_selections_on_runtime_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists (
    select 1 from ypl_schema_validation.events e
     where e.id=old.event_id and e.event_type='champions' and e.championship_phase='qualifier'
  ) then
    delete from ypl_schema_validation.championship_qualifier_direct_selections
     where qualifier_event_id=old.event_id;
  end if;
  return old;
end $$;
drop trigger if exists championship_qualifier_direct_selection_runtime_cleanup on ypl_schema_validation.bracket_runtimes;
create trigger championship_qualifier_direct_selection_runtime_cleanup
before delete on ypl_schema_validation.bracket_runtimes
for each row execute function ypl_schema_validation.clear_qualifier_direct_selections_on_runtime_delete();
revoke all on function ypl_schema_validation.clear_qualifier_direct_selections_on_runtime_delete() from public, anon, authenticated, service_role;

create or replace function ypl_schema_validation.finalize_championship_qualifier(p_qualifier_event_id uuid)
returns table (qualifier_event_id uuid, final_event_id uuid, alive_entry_ids uuid[], qualifier_advancement_count integer, created boolean)
language plpgsql security definer set search_path='' as $$
declare q ypl_schema_validation.events%rowtype; f ypl_schema_validation.events%rowtype; rt uuid;
  capacity integer; direct_count integer; alive_count integer; entrant_count integer; direct record; survivor record; pid uuid; pname text; rid uuid; alive_ids uuid[];
begin
 select * into q from ypl_schema_validation.events e where e.id=p_qualifier_event_id for update;
 if not found or q.event_type<>'champions' or q.championship_phase<>'qualifier' or q.championship_final_event_id is null then raise exception using errcode='P0001',message='canonical Qualifier Event를 찾을 수 없습니다.';end if;
 select * into f from ypl_schema_validation.events e where e.id=q.championship_final_event_id for update;
 if not found or f.championship_phase<>'final' or f.status<>'open' then raise exception using errcode='P0001',message='연결된 Final Event 상태가 올바르지 않습니다.';end if;
 capacity:=(f.competition_settings #>> '{championship,finalCapacity}')::integer;
 select count(*) into direct_count from ypl_schema_validation.championship_qualifier_direct_selections d where d.qualifier_event_id=q.id;
 if capacity is null or direct_count>=capacity or q.qualification_slots is distinct from capacity-direct_count then raise exception using errcode='P0001',message='직행자/qualification_slots derived state가 올바르지 않습니다.';end if;
 select id into rt from ypl_schema_validation.bracket_runtimes where event_id=q.id and topology_kind='double_elimination';
 if rt is null then raise exception using errcode='P0001',message='Qualifier normalized Double runtime이 필요합니다.';end if;
 with entrants as (select e.id from ypl_schema_validation.entries e join ypl_schema_validation.bracket_entry_slots s on s.entry_id=e.id where e.event_id=q.id and e.status='active' and s.bracket_runtime_id=rt), losses as (select case when m.winner_entry_id=m.entry_a_id then m.entry_b_id else m.entry_a_id end id,count(*) n from ypl_schema_validation.matches m where m.event_id=q.id and m.source='normalized_bracket_runtime' and m.match_kind='bracket' and m.winner_entry_id is not null group by 1) select array_agg(e.id order by e.id),count(*) into alive_ids,alive_count from entrants e left join losses l on l.id=e.id where coalesce(l.n,0)<2;
 select count(*) into entrant_count from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=rt;
 if entrant_count<q.qualification_slots or alive_count<>q.qualification_slots or entrant_count-alive_count<>entrant_count-q.qualification_slots then raise exception using errcode='P0001',message='Match-derived survivor/elimination state가 선발전 목표와 일치하지 않습니다.';end if;
 if exists(select 1 from ypl_schema_validation.championship_advancements a join ypl_schema_validation.event_registrations r on r.id=a.final_registration_id where r.event_id=f.id) then
   if q.status='completed' then return query select q.id,f.id,alive_ids,alive_count,false;return;end if;
   raise exception using errcode='P0001',message='기존 Final advancement가 있어 안전하게 기록 반영할 수 없습니다.';
 end if;
 if q.status not in ('open','running') then raise exception using errcode='P0001',message='현재 Qualifier 상태에서는 기록 반영할 수 없습니다.';end if;
 for direct in select d.id,d.player_id,p.display_name from ypl_schema_validation.championship_qualifier_direct_selections d join ypl_schema_validation.players p on p.id=d.player_id and p.status<>'inactive' where d.qualifier_event_id=q.id order by d.id loop
   insert into ypl_schema_validation.event_registrations(event_id,player_id,registration_name,registration_data,registration_source,registered_at) values(f.id,direct.player_id,direct.display_name,jsonb_build_object('champions',jsonb_build_object('source','ranking')),'advancement',now()) returning id into rid;
   insert into ypl_schema_validation.championship_advancements(final_registration_id,source_entry_id,direct_selection_id,advancement_type) values(rid,null,direct.id,'ranking');
 end loop;
 for survivor in select e.id from ypl_schema_validation.entries e where e.id=any(alive_ids) order by e.id loop
   select ep.player_id,p.display_name into pid,pname from ypl_schema_validation.entry_participants ep join ypl_schema_validation.players p on p.id=ep.player_id and p.status<>'inactive' where ep.event_id=q.id and ep.entry_id=survivor.id and ep.member_order=1;
   if not found or exists(select 1 from ypl_schema_validation.event_registrations r where r.event_id=f.id and r.player_id=pid) then raise exception using errcode='P0001',message='direct/survivor Player identity가 중복되었거나 올바르지 않습니다.';end if;
   insert into ypl_schema_validation.event_registrations(event_id,player_id,registration_name,registration_data,registration_source,registered_at) values(f.id,pid,pname,jsonb_build_object('champions',jsonb_build_object('source','qualifier')),'advancement',now()) returning id into rid;
   insert into ypl_schema_validation.championship_advancements(final_registration_id,source_entry_id,advancement_type) values(rid,survivor.id,'qualifier');
 end loop;
 if (select count(*) from ypl_schema_validation.event_registrations where event_id=f.id)<>capacity then raise exception using errcode='P0001',message='Final entrant set이 finalCapacity와 정확히 일치하지 않습니다.';end if;
 update ypl_schema_validation.events set status='completed',updated_at=now() where id=q.id;
 delete from ypl_schema_validation.matches where event_id=q.id and source='normalized_bracket_runtime' and winner_entry_id is null;
 return query select q.id,f.id,alive_ids,alive_count,true;
end $$;

create or replace function ypl_schema_validation.reopen_championship_qualifier(p_qualifier_event_id uuid)
returns table (qualifier_event_id uuid, final_event_id uuid, removed_advancement_count integer, reopened boolean)
language plpgsql security definer set search_path='' as $$
declare q ypl_schema_validation.events%rowtype; f ypl_schema_validation.events%rowtype; n integer; removed_count integer;
begin
 select * into q from ypl_schema_validation.events e where e.id=p_qualifier_event_id for update;
 if not found or q.championship_phase<>'qualifier' or q.status<>'completed' then raise exception using errcode='P0001',message='종료 취소할 completed Qualifier Event를 찾을 수 없습니다.';end if;
 select * into f from ypl_schema_validation.events e where e.id=q.championship_final_event_id for update;
 if f.status<>'open' or f.record_applied_at is not null or exists(select 1 from ypl_schema_validation.event_registrations r where r.event_id=f.id and r.final_submission_id is not null) or exists(select 1 from ypl_schema_validation.registration_submissions s join ypl_schema_validation.event_registrations r on r.id=s.registration_id where r.event_id=f.id) or exists(select 1 from ypl_schema_validation.entries where event_id=f.id) or exists(select 1 from ypl_schema_validation.matches where event_id=f.id) or exists(select 1 from ypl_schema_validation.bracket_runtimes where event_id=f.id) or exists(select 1 from ypl_schema_validation.results where event_id=f.id) or exists(select 1 from ypl_schema_validation.ranking_awards where event_id=f.id) or exists(select 1 from ypl_schema_validation.hall_of_fame_entries where event_id=f.id) then raise exception using errcode='P0001',message='Final downstream fact가 있어 선발전 기록 반영을 취소할 수 없습니다.';end if;
 if exists(select 1 from ypl_schema_validation.championship_advancements a join ypl_schema_validation.event_registrations r on r.id=a.final_registration_id where r.event_id=f.id and a.advancement_type='ranking' and a.direct_selection_id is null) then raise exception using errcode='P0001',message='Final entrant set에 ambiguous ranking advancement가 있어 취소할 수 없습니다.';end if;
 with target as (select a.id,a.final_registration_id from ypl_schema_validation.championship_advancements a join ypl_schema_validation.event_registrations r on r.id=a.final_registration_id where r.event_id=f.id and (a.direct_selection_id in (select ds.id from ypl_schema_validation.championship_qualifier_direct_selections ds where ds.qualifier_event_id=q.id) or a.source_entry_id in (select e.id from ypl_schema_validation.entries e where e.event_id=q.id))), deleted as (delete from ypl_schema_validation.championship_advancements a using target t where a.id=t.id returning t.final_registration_id) delete from ypl_schema_validation.event_registrations r using deleted d where r.id=d.final_registration_id and r.event_id=f.id;
 get diagnostics removed_count = row_count;
 select count(*) into n from ypl_schema_validation.championship_advancements a join ypl_schema_validation.event_registrations r on r.id=a.final_registration_id where r.event_id=f.id;
 if n<>0 then raise exception using errcode='P0001',message='Final entrant rollback target이 완전하지 않습니다.';end if;
 update ypl_schema_validation.events set status='running',updated_at=now() where id=q.id;
 return query select q.id,f.id,coalesce(removed_count,0),true;
end $$;
