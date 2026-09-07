-- Official Champions Final record application.
-- Test schema only. The entered ordinal is authoritative for the whole pair.

create or replace function ypl_schema_validation.complete_championship_final_record_application(
    p_final_event_id uuid,
    p_ordinal integer
)
returns table (
    id uuid,
    qualifier_event_id uuid,
    status text,
    record_applied_at timestamptz,
    team_revealed_at timestamptz,
    round_number integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_final ypl_schema_validation.events%rowtype;
    v_qualifier ypl_schema_validation.events%rowtype;
    v_now timestamptz := now();
begin
    if p_final_event_id is null or p_ordinal is null or p_ordinal < 1 then
        raise exception using errcode = 'P0001', message = 'Champions Final과 1 이상의 공식 회차가 필요합니다.';
    end if;

    select * into v_final
      from ypl_schema_validation.events e
     where e.id = p_final_event_id
     for update;
    if not found or v_final.event_type <> 'champions'
       or v_final.championship_phase <> 'final'
       or v_final.status not in ('open', 'running')
       or v_final.record_applied_at is not null
       or v_final.team_reveal_mode <> 'on_record_apply' then
        raise exception using errcode = 'P0001', message = '기록 반영 가능한 Champions Final 상태가 아닙니다.';
    end if;

    select * into v_qualifier
      from ypl_schema_validation.events e
     where e.championship_final_event_id = p_final_event_id
       and e.event_type = 'champions'
       and e.championship_phase = 'qualifier'
     for update;
    if not found then
        raise exception using errcode = 'P0001', message = 'Champions Final에 대응하는 Qualifier pair를 찾을 수 없습니다.';
    end if;
    if v_qualifier.status <> 'completed' then
        raise exception using errcode = 'P0001', message = '완료된 Qualifier 없이 Champions Final 기록을 반영할 수 없습니다.';
    end if;

    update ypl_schema_validation.events e
       set round_number = p_ordinal,
           competition_settings = jsonb_set(
             jsonb_set(
               coalesce(e.competition_settings, '{}'::jsonb),
               '{championship,generation}',
               to_jsonb(p_ordinal),
               true
             ),
             '{championship,recordApplyOrdinalSnapshot}',
             jsonb_build_object(
               'roundNumber', v_qualifier.round_number,
               'generation', v_qualifier.competition_settings #>> '{championship,generation}'
             ),
             true
           ),
           updated_at = v_now
     where e.id = v_qualifier.id;

    update ypl_schema_validation.events e
       set status = 'completed',
           record_applied_at = v_now,
           team_revealed_at = v_now,
           round_number = p_ordinal,
           competition_settings = jsonb_set(
             jsonb_set(
               coalesce(e.competition_settings, '{}'::jsonb),
               '{championship,generation}',
               to_jsonb(p_ordinal),
               true
             ),
             '{championship,recordApplyOrdinalSnapshot}',
             jsonb_build_object(
               'roundNumber', v_final.round_number,
               'generation', v_final.competition_settings #>> '{championship,generation}'
             ),
             true
           ),
           updated_at = v_now
     where e.id = v_final.id
     returning e.id, v_qualifier.id, e.status, e.record_applied_at, e.team_revealed_at, e.round_number
      into id, qualifier_event_id, status, record_applied_at, team_revealed_at, round_number;

    return next;
end;
$$;

revoke all on function ypl_schema_validation.complete_championship_final_record_application(uuid, integer) from public;
revoke all on function ypl_schema_validation.complete_championship_final_record_application(uuid, integer) from authenticated, service_role;
grant execute on function ypl_schema_validation.complete_championship_final_record_application(uuid, integer) to anon;

create or replace function ypl_schema_validation.release_championship_final_record_application(
    p_final_event_id uuid
)
returns table (
    id uuid,
    status text,
    record_applied_at timestamptz,
    team_revealed_at timestamptz,
    round_number integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_final ypl_schema_validation.events%rowtype;
    v_qualifier ypl_schema_validation.events%rowtype;
    v_final_snapshot jsonb;
    v_qualifier_snapshot jsonb;
    v_now timestamptz := now();
begin
    select * into v_final
      from ypl_schema_validation.events e
     where e.id = p_final_event_id
     for update;
    if not found or v_final.event_type <> 'champions'
       or v_final.championship_phase <> 'final'
       or v_final.status <> 'completed'
       or v_final.record_applied_at is null then
        raise exception using errcode = 'P0001', message = '기록 반영이 완료된 Champions Final만 취소할 수 있습니다.';
    end if;

    select * into v_qualifier
      from ypl_schema_validation.events e
     where e.championship_final_event_id = p_final_event_id
       and e.event_type = 'champions'
       and e.championship_phase = 'qualifier'
     for update;
    if not found then
        raise exception using errcode = 'P0001', message = 'Champions Final에 대응하는 Qualifier pair를 찾을 수 없습니다.';
    end if;

    v_final_snapshot := v_final.competition_settings #> '{championship,recordApplyOrdinalSnapshot}';
    v_qualifier_snapshot := v_qualifier.competition_settings #> '{championship,recordApplyOrdinalSnapshot}';

    update ypl_schema_validation.event_registrations r
       set final_submission_id = null,
           updated_at = v_now
     where r.event_id = p_final_event_id
       and exists (
         select 1 from ypl_schema_validation.entry_participants ep
          where ep.event_id = p_final_event_id
            and ep.registration_id = r.id
       );

    update ypl_schema_validation.events e
       set round_number = case when v_qualifier_snapshot is null then e.round_number else (v_qualifier_snapshot ->> 'roundNumber')::integer end,
           competition_settings = case when v_qualifier_snapshot is null then e.competition_settings else jsonb_set(
             e.competition_settings #- '{championship,recordApplyOrdinalSnapshot}',
             '{championship,generation}',
             coalesce(to_jsonb((v_qualifier_snapshot ->> 'generation')::integer), 'null'::jsonb),
             true
           ) end,
           updated_at = v_now
     where e.id = v_qualifier.id;

    update ypl_schema_validation.events e
       set status = 'running',
           record_applied_at = null,
           team_revealed_at = null,
           round_number = case when v_final_snapshot is null then e.round_number else (v_final_snapshot ->> 'roundNumber')::integer end,
           competition_settings = case when v_final_snapshot is null then e.competition_settings else jsonb_set(
             e.competition_settings #- '{championship,recordApplyOrdinalSnapshot}',
             '{championship,generation}',
             coalesce(to_jsonb((v_final_snapshot ->> 'generation')::integer), 'null'::jsonb),
             true
           ) end,
           updated_at = v_now
     where e.id = v_final.id
     returning e.id, e.status, e.record_applied_at, e.team_revealed_at, e.round_number
      into id, status, record_applied_at, team_revealed_at, round_number;
    return next;
end;
$$;

revoke all on function ypl_schema_validation.release_championship_final_record_application(uuid) from public;
revoke all on function ypl_schema_validation.release_championship_final_record_application(uuid) from authenticated, service_role;
grant execute on function ypl_schema_validation.release_championship_final_record_application(uuid) to anon;
