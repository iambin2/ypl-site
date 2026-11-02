-- 기록 반영과 취소를 한 트랜잭션으로 묶는다. 중간에 끊겨도 반쯤 반영된 대회가 남지 않는다.
-- 계획(어떤 Result와 RankingAward를 바꿀지)은 클라이언트의 순수 함수가 만들고, 여기서 다시 잠그고 적용한다.
-- SECURITY INVOKER 라 관리자 RLS를 그대로 거친다. 기존 freeze, release, Champions 함수를 그대로 부른다.

create or replace function ypl_schema_validation.apply_event_record(
  p_event_id uuid,
  p_result_plan jsonb,
  p_award_plan jsonb,
  p_reveal_rosters boolean,
  p_championship_ordinal integer,
  p_hall_of_fame_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c_source constant text := 'normalized_bracket_runtime';
  v_event ypl_schema_validation.events%rowtype;
  v_ids uuid[];
  v_row jsonb;
  v_count integer;
  v_now timestamptz := now();
begin
  select * into v_event from ypl_schema_validation.events e where e.id = p_event_id for update;
  if not found or v_event.status not in ('open', 'running') or v_event.record_applied_at is not null then
    raise exception using errcode = 'P0001', message = '대회가 이미 완료되었거나 기록을 반영할 수 없는 상태입니다.';
  end if;
  if p_reveal_rosters and v_event.team_reveal_mode <> 'on_record_apply' then
    raise exception using errcode = 'P0001', message = '기록 반영 시 공개 설정을 확인할 수 없습니다.';
  end if;

  -- 지울 포인트가 지울 결과를 참조하므로 포인트부터 지운다.
  select coalesce(array_agg(value::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(p_award_plan -> 'deleteIds', '[]'::jsonb));
  delete from ypl_schema_validation.ranking_awards a
   where a.event_id = p_event_id and a.award_kind = 'placement' and a.source = c_source and a.id = any(v_ids);
  get diagnostics v_count = row_count;
  if v_count <> cardinality(v_ids) then
    raise exception using errcode = 'P0001', message = '입상 포인트가 동기화 중 변경되었습니다. 대진표를 새로고침해 주세요.';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_result_plan -> 'updates', '[]'::jsonb)) loop
    update ypl_schema_validation.results r
       set entry_id = (v_row #>> '{payload,entry_id}')::uuid,
           placement_code = v_row #>> '{payload,placement_code}',
           rank_min = (v_row #>> '{payload,rank_min}')::integer,
           rank_max = (v_row #>> '{payload,rank_max}')::integer,
           placement_label = v_row #>> '{payload,placement_label}',
           updated_at = v_now
     where r.id = (v_row ->> 'id')::uuid and r.event_id = p_event_id and r.source = c_source;
    if not found then
      raise exception using errcode = 'P0001', message = '결과가 동기화 중 변경되었습니다. 대진표를 새로고침해 주세요.';
    end if;
  end loop;

  insert into ypl_schema_validation.results (id, event_id, entry_id, placement_code, rank_min, rank_max, placement_label, source, updated_at)
  select x.id, p_event_id, x.entry_id, x.placement_code, x.rank_min, x.rank_max, x.placement_label, c_source, v_now
    from jsonb_to_recordset(coalesce(p_result_plan -> 'inserts', '[]'::jsonb))
      as x(id uuid, entry_id uuid, placement_code text, rank_min integer, rank_max integer, placement_label text);

  select coalesce(array_agg(value::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(p_result_plan -> 'deleteIds', '[]'::jsonb));
  delete from ypl_schema_validation.results r
   where r.event_id = p_event_id and r.source = c_source and r.id = any(v_ids);
  get diagnostics v_count = row_count;
  if v_count <> cardinality(v_ids) then
    raise exception using errcode = 'P0001', message = '결과가 동기화 중 변경되었습니다. 대진표를 새로고침해 주세요.';
  end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_award_plan -> 'updates', '[]'::jsonb)) loop
    update ypl_schema_validation.ranking_awards a
       set points_delta = (v_row #>> '{payload,points_delta}')::numeric,
           win_delta = (v_row #>> '{payload,win_delta}')::integer,
           runner_up_delta = (v_row #>> '{payload,runner_up_delta}')::integer,
           top4_delta = (v_row #>> '{payload,top4_delta}')::integer,
           counts_series = (v_row #>> '{payload,counts_series}')::boolean,
           counts_season = (v_row #>> '{payload,counts_season}')::boolean,
           reason = v_row #>> '{payload,reason}'
     where a.id = (v_row ->> 'id')::uuid and a.event_id = p_event_id
       and a.award_kind = 'placement' and a.source = c_source;
    if not found then
      raise exception using errcode = 'P0001', message = '입상 포인트가 동기화 중 변경되었습니다. 대진표를 새로고침해 주세요.';
    end if;
  end loop;

  insert into ypl_schema_validation.ranking_awards (
    event_id, player_id, result_id, award_kind, points_delta, win_delta, runner_up_delta, top4_delta,
    counts_series, counts_season, reason, source
  )
  select p_event_id, x.player_id, x.result_id, 'placement', x.points_delta, x.win_delta, x.runner_up_delta, x.top4_delta,
         x.counts_series, x.counts_season, x.reason, c_source
    from jsonb_to_recordset(coalesce(p_award_plan -> 'inserts', '[]'::jsonb))
      as x(player_id uuid, result_id uuid, points_delta numeric, win_delta integer, runner_up_delta integer,
           top4_delta integer, counts_series boolean, counts_season boolean, reason text);

  perform 1 from ypl_schema_validation.freeze_event_final_submissions(p_event_id);

  if p_championship_ordinal is not null then
    perform 1 from ypl_schema_validation.complete_championship_final_record_application(p_event_id, p_championship_ordinal);
    perform 1 from ypl_schema_validation.ensure_championship_final_hall_of_fame(p_event_id, p_hall_of_fame_id);
  else
    update ypl_schema_validation.events e
       set status = 'completed', record_applied_at = v_now, updated_at = v_now,
           team_revealed_at = case when p_reveal_rosters then v_now else e.team_revealed_at end
     where e.id = p_event_id;
  end if;

  select jsonb_build_object('id', e.id, 'status', e.status, 'record_applied_at', e.record_applied_at,
                            'team_revealed_at', e.team_revealed_at, 'round_number', e.round_number)
    into v_row
    from ypl_schema_validation.events e where e.id = p_event_id;
  return v_row;
end;
$$;
revoke all on function ypl_schema_validation.apply_event_record(uuid, jsonb, jsonb, boolean, integer, uuid) from public, anon, service_role;
grant execute on function ypl_schema_validation.apply_event_record(uuid, jsonb, jsonb, boolean, integer, uuid) to authenticated;

create or replace function ypl_schema_validation.revert_event_record(p_event_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c_source constant text := 'normalized_bracket_runtime';
  v_event ypl_schema_validation.events%rowtype;
  v_champions_final boolean;
  v_row jsonb;
begin
  select * into v_event from ypl_schema_validation.events e where e.id = p_event_id for update;
  if not found or v_event.status <> 'completed' or v_event.record_applied_at is null then
    raise exception using errcode = 'P0001', message = '기록 반영이 완료된 대회만 취소할 수 있습니다.';
  end if;
  v_champions_final := v_event.event_type = 'champions' and v_event.championship_phase = 'final';

  if v_champions_final then
    perform 1 from ypl_schema_validation.remove_championship_final_hall_of_fame(p_event_id);
  end if;
  delete from ypl_schema_validation.ranking_awards a
   where a.event_id = p_event_id and a.award_kind = 'placement' and a.source = c_source;
  delete from ypl_schema_validation.results r
   where r.event_id = p_event_id and r.source = c_source;

  if v_champions_final then
    perform 1 from ypl_schema_validation.release_championship_final_record_application(p_event_id);
  else
    perform 1 from ypl_schema_validation.release_event_final_submissions(p_event_id);
  end if;

  select jsonb_build_object('id', e.id, 'status', e.status, 'record_applied_at', e.record_applied_at,
                            'team_revealed_at', e.team_revealed_at, 'round_number', e.round_number)
    into v_row
    from ypl_schema_validation.events e where e.id = p_event_id;
  return v_row;
end;
$$;
revoke all on function ypl_schema_validation.revert_event_record(uuid) from public, anon, service_role;
grant execute on function ypl_schema_validation.revert_event_record(uuid) to authenticated;
