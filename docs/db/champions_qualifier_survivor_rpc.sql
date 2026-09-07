-- Champions Qualifier survivor finalization.
-- Test schema only. A Qualifier is a Double Elimination field reduction, not
-- a champion/placement tournament. Do not apply this file to Production.

create or replace function ypl_schema_validation.championship_qualifier_match_stop_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_event ypl_schema_validation.events%rowtype;
    v_runtime_id uuid;
    v_alive_count integer;
begin
    if new.source <> 'normalized_bracket_runtime' or new.match_kind <> 'bracket' then
        return new;
    end if;
    select * into v_event
      from ypl_schema_validation.events e
     where e.id = new.event_id
       and e.event_type = 'champions'
       and e.championship_phase = 'qualifier'
     for update;
    if not found then
        return new;
    end if;
    if v_event.status = 'completed' and tg_op = 'UPDATE'
       and new.winner_entry_id is distinct from old.winner_entry_id then
        raise exception using errcode = 'P0001', message = '종료된 선발전의 경기 결과는 먼저 종료 취소 후 수정해야 합니다.';
    end if;
    if v_event.status not in ('open', 'running') then
        return new;
    end if;
    select br.id into v_runtime_id
      from ypl_schema_validation.bracket_runtimes br
     where br.event_id = v_event.id
       and br.topology_kind = 'double_elimination';
    if v_runtime_id is null then
        return new;
    end if;
    with entrants as (
        select s.entry_id
          from ypl_schema_validation.bracket_entry_slots s
         where s.bracket_runtime_id = v_runtime_id
    ), losses as (
        select case when m.winner_entry_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end as entry_id,
               count(*)::integer as loss_count
          from ypl_schema_validation.matches m
         where m.event_id = v_event.id
           and m.source = 'normalized_bracket_runtime'
           and m.match_kind = 'bracket'
           and m.winner_entry_id is not null
           and m.winner_entry_id in (m.entry_a_id, m.entry_b_id)
         group by 1
    )
    select count(*)::integer into v_alive_count
      from entrants e left join losses l on l.entry_id = e.entry_id
     where coalesce(l.loss_count, 0) < 2;

    if v_alive_count <= v_event.qualification_slots
       and (
           tg_op = 'INSERT'
           or (tg_op = 'UPDATE' and old.winner_entry_id is null and new.winner_entry_id is not null)
       ) then
        raise exception using errcode = 'P0001', message = '본선 진출 인원이 확정되어 선발전 경기를 더 진행할 수 없습니다.';
    end if;
    return new;
end;
$$;

drop trigger if exists championship_qualifier_match_stop_guard on ypl_schema_validation.matches;
create trigger championship_qualifier_match_stop_guard
before insert or update of winner_entry_id on ypl_schema_validation.matches
for each row execute function ypl_schema_validation.championship_qualifier_match_stop_guard();

create or replace function ypl_schema_validation.finalize_championship_qualifier(
    p_qualifier_event_id uuid
)
returns table (
    qualifier_event_id uuid,
    final_event_id uuid,
    alive_entry_ids uuid[],
    qualifier_advancement_count integer,
    created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_qualifier ypl_schema_validation.events%rowtype;
    v_final ypl_schema_validation.events%rowtype;
    v_runtime ypl_schema_validation.bracket_runtimes%rowtype;
    v_alive_ids uuid[];
    v_alive_count integer;
    v_existing_count integer;
    v_capacity integer;
    v_generation integer;
    v_survivor record;
    v_player_id uuid;
    v_registration_id uuid;
    v_player_name text;
begin
    select * into v_qualifier
      from ypl_schema_validation.events e
     where e.id = p_qualifier_event_id
     for update;
    if not found
       or v_qualifier.event_type <> 'champions'
       or v_qualifier.championship_phase <> 'qualifier'
       or v_qualifier.championship_final_event_id is null then
        raise exception using errcode = 'P0001', message = 'canonical Champions Qualifier Event를 찾을 수 없습니다.';
    end if;
    select * into v_final
      from ypl_schema_validation.events e
     where e.id = v_qualifier.championship_final_event_id
     for update;
    if not found or v_final.event_type <> 'champions'
       or v_final.championship_phase <> 'final'
       or v_final.competition_format <> 'single_elimination' then
        raise exception using errcode = 'P0001', message = '연결된 Champions Final Event ownership이 일치하지 않습니다.';
    end if;
    select * into v_runtime
      from ypl_schema_validation.bracket_runtimes br
     where br.event_id = v_qualifier.id
       and br.topology_kind = 'double_elimination'
     for update;
    if not found or exists (
        select 1 from ypl_schema_validation.bracket_runtimes br
         where br.event_id = v_qualifier.id and br.id <> v_runtime.id
    ) then
        raise exception using errcode = 'P0001', message = 'Qualifier에는 정확히 하나의 normalized Double Elimination runtime이 필요합니다.';
    end if;
    if v_qualifier.qualification_slots is null or v_qualifier.qualification_slots < 1 then
        raise exception using errcode = 'P0001', message = 'qualification_slots가 올바르지 않습니다.';
    end if;
    if exists (
        select 1 from ypl_schema_validation.matches m
         where m.event_id = v_qualifier.id
           and m.source = 'normalized_bracket_runtime'
           and m.match_kind = 'bracket'
           and m.winner_entry_id is not null
           and m.winner_entry_id not in (m.entry_a_id, m.entry_b_id)
    ) then
        raise exception using errcode = 'P0001', message = 'Qualifier Match winner identity가 canonical Entry sides와 일치하지 않습니다.';
    end if;

    with entrants as (
        select e.id
          from ypl_schema_validation.entries e
          join ypl_schema_validation.bracket_entry_slots s
            on s.entry_id = e.id and s.event_id = e.event_id
         where e.event_id = v_qualifier.id
           and e.entry_type = 'individual'
           and e.status = 'active'
           and s.bracket_runtime_id = v_runtime.id
    ), losses as (
        select case when m.winner_entry_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end as entry_id,
               count(*)::integer as loss_count
          from ypl_schema_validation.matches m
         where m.event_id = v_qualifier.id
           and m.source = 'normalized_bracket_runtime'
           and m.match_kind = 'bracket'
           and m.winner_entry_id is not null
         group by 1
    )
    select coalesce(array_agg(e.id order by e.id), array[]::uuid[]), count(*)::integer
      into v_alive_ids, v_alive_count
      from entrants e left join losses l on l.entry_id = e.id
     where coalesce(l.loss_count, 0) < 2;
    if v_alive_count <> v_qualifier.qualification_slots then
        raise exception using errcode = 'P0001', message = format('현재 생존 %s명 / 목표 %s명이라 선발전을 종료할 수 없습니다.', v_alive_count, v_qualifier.qualification_slots);
    end if;

    select count(*)::integer into v_existing_count
      from ypl_schema_validation.championship_advancements ca
      join ypl_schema_validation.event_registrations r on r.id = ca.final_registration_id
     where r.event_id = v_final.id and ca.advancement_type = 'qualifier';
    if v_existing_count > 0 then
        if v_qualifier.status = 'completed'
           and v_existing_count = v_qualifier.qualification_slots
           and not exists (
               select 1
                 from ypl_schema_validation.championship_advancements ca
                 join ypl_schema_validation.event_registrations r on r.id = ca.final_registration_id
                where r.event_id = v_final.id
                  and ca.advancement_type = 'qualifier'
                  and (ca.source_entry_id is null or not (ca.source_entry_id = any(v_alive_ids)) or r.registration_source <> 'advancement')
           ) then
            return query select v_qualifier.id, v_final.id, v_alive_ids, v_existing_count, false;
            return;
        end if;
        raise exception using errcode = 'P0001', message = '기존 qualifier advancement set이 survivor set과 일치하지 않습니다.';
    end if;
    if v_qualifier.status = 'completed' then
        raise exception using errcode = 'P0001', message = '종료된 Qualifier에 survivor advancement set이 없습니다.';
    end if;
    if v_qualifier.status not in ('open', 'running') or v_final.status <> 'open' or v_final.record_applied_at is not null then
        raise exception using errcode = 'P0001', message = '현재 Qualifier/Final 상태에서는 survivor finalization을 할 수 없습니다.';
    end if;

    v_capacity := (v_final.competition_settings #>> '{championship,finalCapacity}')::integer;
    v_generation := (v_final.competition_settings #>> '{championship,generation}')::integer;
    if v_capacity is null or v_capacity < v_qualifier.qualification_slots or v_generation is null or v_generation < 1 then
        raise exception using errcode = 'P0001', message = 'Final capacity 또는 generation 설정이 올바르지 않습니다.';
    end if;
    if (select count(*) from ypl_schema_validation.championship_advancements ca join ypl_schema_validation.event_registrations r on r.id=ca.final_registration_id where r.event_id=v_final.id) + v_alive_count > v_capacity then
        raise exception using errcode = 'P0001', message = 'Final capacity가 survivor와 기존 본선 진출자를 수용하지 못합니다.';
    end if;

    for v_survivor in
        select e.id as entry_id
          from ypl_schema_validation.entries e
         where e.id = any(v_alive_ids)
         order by e.id
    loop
        select ep.player_id, p.display_name
          into v_player_id, v_player_name
          from ypl_schema_validation.entry_participants ep
          join ypl_schema_validation.players p on p.id = ep.player_id and p.status <> 'inactive'
         where ep.event_id = v_qualifier.id
           and ep.entry_id = v_survivor.entry_id
           and ep.member_order = 1;
        if not found or (select count(*) from ypl_schema_validation.entry_participants ep where ep.event_id=v_qualifier.id and ep.entry_id=v_survivor.entry_id) <> 1 then
            raise exception using errcode = 'P0001', message = 'survivor Entry의 Player identity가 정확히 하나여야 합니다.';
        end if;
        if exists (select 1 from ypl_schema_validation.event_registrations r where r.event_id=v_final.id and r.player_id=v_player_id) then
            raise exception using errcode = 'P0001', message = 'survivor Player가 이미 Final Registration에 존재합니다.';
        end if;
        insert into ypl_schema_validation.event_registrations (
            id, event_id, player_id, registration_name, registration_data,
            registration_source, registered_at, updated_at
        ) values (
            gen_random_uuid(), v_final.id, v_player_id, v_player_name,
            jsonb_build_object('champions', jsonb_build_object('generation', v_generation, 'source', 'qualifier', 'reason', null)),
            'advancement', now(), now()
        ) returning id into v_registration_id;
        insert into ypl_schema_validation.championship_advancements (
            id, final_registration_id, source_entry_id, advancement_type, reason
        ) values (gen_random_uuid(), v_registration_id, v_survivor.entry_id, 'qualifier', null);
    end loop;

    update ypl_schema_validation.events e set status='completed', updated_at=now() where e.id=v_qualifier.id;
    delete from ypl_schema_validation.matches m
     where m.event_id=v_qualifier.id and m.source='normalized_bracket_runtime'
       and m.winner_entry_id is null and m.match_kind <> 'bracket';
    delete from ypl_schema_validation.matches m
     where m.event_id=v_qualifier.id and m.source='normalized_bracket_runtime'
       and m.winner_entry_id is null and m.match_kind = 'bracket';
    return query select v_qualifier.id, v_final.id, v_alive_ids, v_alive_count, true;
end;
$$;

create or replace function ypl_schema_validation.reopen_championship_qualifier(
    p_qualifier_event_id uuid
)
returns table (qualifier_event_id uuid, final_event_id uuid, removed_advancement_count integer, reopened boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_qualifier ypl_schema_validation.events%rowtype;
    v_final ypl_schema_validation.events%rowtype;
    v_count integer;
begin
    select * into v_qualifier from ypl_schema_validation.events e where e.id=p_qualifier_event_id for update;
    if not found or v_qualifier.event_type <> 'champions' or v_qualifier.championship_phase <> 'qualifier'
       or v_qualifier.championship_final_event_id is null or v_qualifier.status <> 'completed' then
        raise exception using errcode = 'P0001', message = '종료 취소할 completed Qualifier Event를 찾을 수 없습니다.';
    end if;
    select * into v_final from ypl_schema_validation.events e where e.id=v_qualifier.championship_final_event_id for update;
    if not found or v_final.event_type <> 'champions' or v_final.championship_phase <> 'final' then
        raise exception using errcode = 'P0001', message = '연결된 Final Event ownership이 일치하지 않습니다.';
    end if;
    if v_final.status <> 'open' or v_final.record_applied_at is not null
       or exists (select 1 from ypl_schema_validation.registration_submissions s join ypl_schema_validation.event_registrations r on r.id=s.registration_id where r.event_id=v_final.id)
       or exists (select 1 from ypl_schema_validation.event_registrations r where r.event_id=v_final.id and r.final_submission_id is not null)
       or exists (select 1 from ypl_schema_validation.entries e where e.event_id=v_final.id)
       or exists (select 1 from ypl_schema_validation.entry_participants ep where ep.event_id=v_final.id)
       or exists (select 1 from ypl_schema_validation.matches m where m.event_id=v_final.id)
       or exists (select 1 from ypl_schema_validation.results r where r.event_id=v_final.id)
       or exists (select 1 from ypl_schema_validation.ranking_awards a where a.event_id=v_final.id)
       or exists (select 1 from ypl_schema_validation.hall_of_fame_entries h where h.event_id=v_final.id)
       or exists (select 1 from ypl_schema_validation.bracket_runtimes br where br.event_id=v_final.id) then
        raise exception using errcode = 'P0001', message = 'Final downstream fact가 있어 선발전 종료를 취소할 수 없습니다.';
    end if;
    select count(*)::integer into v_count
      from ypl_schema_validation.championship_advancements ca
      join ypl_schema_validation.event_registrations r on r.id=ca.final_registration_id
     where r.event_id=v_final.id and ca.advancement_type='qualifier';
    if v_count <> v_qualifier.qualification_slots then
        raise exception using errcode = 'P0001', message = 'reopen할 qualifier advancement set이 canonical slots와 일치하지 않습니다.';
    end if;
    with target as (
        select ca.id as advancement_id, ca.final_registration_id
          from ypl_schema_validation.championship_advancements ca
          join ypl_schema_validation.event_registrations r on r.id=ca.final_registration_id
         where r.event_id=v_final.id and ca.advancement_type='qualifier'
    ), removed as (
        delete from ypl_schema_validation.championship_advancements ca
         using target t where ca.id=t.advancement_id
         returning t.final_registration_id
    )
    delete from ypl_schema_validation.event_registrations r
     using removed d
     where r.id=d.final_registration_id and r.event_id=v_final.id and r.registration_source='advancement';
    update ypl_schema_validation.events e set status='running', updated_at=now() where e.id=v_qualifier.id;
    return query select v_qualifier.id, v_final.id, v_count, true;
end;
$$;

revoke all on function ypl_schema_validation.finalize_championship_qualifier(uuid) from public;
revoke all on function ypl_schema_validation.finalize_championship_qualifier(uuid) from authenticated, service_role;
grant execute on function ypl_schema_validation.finalize_championship_qualifier(uuid) to anon;
revoke all on function ypl_schema_validation.reopen_championship_qualifier(uuid) from public;
revoke all on function ypl_schema_validation.reopen_championship_qualifier(uuid) from authenticated, service_role;
grant execute on function ypl_schema_validation.reopen_championship_qualifier(uuid) to anon;
