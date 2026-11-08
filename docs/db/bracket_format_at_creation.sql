-- A notice does not decide topology. Commit the operator's choice in the same
-- transaction as the runtime. Existing runtimes and completed records are fixed.
begin;
create or replace function ypl_schema_validation.create_selected_bracket_runtime(
  p_runtime_id uuid,p_event_id uuid,p_topology_kind text,p_participants jsonb,p_slots jsonb
) returns table(runtime_id uuid,event_id uuid,topology_kind text,participant_count integer,slot_count integer,created boolean)
language plpgsql security invoker set search_path='' as $$
declare e ypl_schema_validation.events%rowtype; rt ypl_schema_validation.bracket_runtimes%rowtype;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_topology_kind is null or p_topology_kind not in ('single_elimination','double_elimination') then raise exception '대진 방식을 선택해 주세요.'; end if;
  select * into e from ypl_schema_validation.events where id=p_event_id for update;
  if not found or e.status not in ('open','running') or e.record_applied_at is not null then raise exception '대진표를 생성할 수 없는 대회입니다.'; end if;
  select * into rt from ypl_schema_validation.bracket_runtimes where bracket_runtimes.event_id=e.id;
  if found and (rt.id is distinct from p_runtime_id or rt.topology_kind is distinct from p_topology_kind) then
    raise exception '이미 생성된 대진표의 방식을 바꿀 수 없습니다.';
  end if;
  update ypl_schema_validation.events set competition_format=p_topology_kind where id=e.id;
  if p_topology_kind='single_elimination' and not e.is_team_event then
    return query select r.runtime_id,r.event_id,'single_elimination'::text,r.participant_count,r.slot_count,r.created
      from ypl_schema_validation.create_normalized_single_bracket_runtime(p_runtime_id,p_event_id,p_participants,p_slots) r;
  else
    return query select r.runtime_id,r.event_id,r.topology_kind,r.participant_count,r.slot_count,r.created
      from ypl_schema_validation.create_normalized_bracket_runtime(p_runtime_id,p_event_id,p_topology_kind,p_participants,p_slots) r;
  end if;
end $$;
revoke all on function ypl_schema_validation.create_selected_bracket_runtime(uuid,uuid,text,jsonb,jsonb) from public,anon,service_role;
grant execute on function ypl_schema_validation.create_selected_bracket_runtime(uuid,uuid,text,jsonb,jsonb) to authenticated;
-- Change only topology-specific clauses of installed functions. This preserves
-- later identity, schedule, privacy and ownership fixes in the current bodies.
do $patch$
declare n text; f regprocedure; d text;
begin
 foreach n in array array['save_league_intake','save_championship_application_event_pair',
   'create_championship_advancement','championship_qualifier_match_stop_guard','finalize_championship_qualifier']
 loop
   select p.oid::regprocedure into strict f from pg_proc p
     where p.pronamespace='ypl_schema_validation'::regnamespace and p.proname=n;
   d:=pg_get_functiondef(f);
   if n='save_league_intake' then
     d:=replace(d,'or coalesce(p_settings->>''competition_format'','''') not in (''single_elimination'',''double_elimination'')','');
     d:=replace(d,'or current_event.competition_format is distinct from p_settings->>''competition_format''','');
     d:=replace(d,'p_settings->>''battle_format'', p_settings->>''competition_format'',','p_settings->>''battle_format'', null,');
     d:=replace(d,'competition_format=excluded.competition_format,','competition_format=ypl_schema_validation.events.competition_format,');
   elsif n='save_championship_application_event_pair' then
     d:=replace(d,'''champions'', null, p_battle_format, ''single_elimination''','''champions'', null, p_battle_format, null');
     d:=replace(d,'''champions'', null, p_battle_format, ''double_elimination''','''champions'', null, p_battle_format, null');
     d:=replace(d,'or v_qualifier.competition_format is distinct from ''double_elimination''','');
     d:=replace(d,'or v_final.competition_format is distinct from ''single_elimination''','');
     d:=replace(d,'competition_format = ''single_elimination'',','competition_format = v_final.competition_format,');
     d:=replace(d,'competition_format = ''double_elimination'',','competition_format = v_qualifier.competition_format,');
   elsif n='create_championship_advancement' then
     d:=replace(d,'v_final.competition_format <> ''single_elimination''',
       'coalesce(v_final.competition_format,''single_elimination'') not in (''single_elimination'',''double_elimination'')');
   elsif n='championship_qualifier_match_stop_guard' then
     d:=replace(d,'br.topology_kind = ''double_elimination''','br.topology_kind = v_event.competition_format');
     d:=replace(d,'coalesce(l.loss_count, 0) < 2','coalesce(l.loss_count, 0) < (case when v_event.competition_format=''single_elimination'' then 1 else 2 end)');
     -- A single winner RPC may try to form the next round on the target win.
     -- Suppress that unplayed row; a further winner update still fails closed.
     d:=replace(d,'raise exception using errcode = ''P0001'', message = ''본선 진출 인원이 확정되어 선발전 경기를 더 진행할 수 없습니다.'';',
       'if tg_op=''INSERT'' then return null; end if; raise exception using errcode = ''P0001'', message = ''본선 진출 인원이 확정되어 선발전 경기를 더 진행할 수 없습니다.'';');
   elsif n='finalize_championship_qualifier' then
     d:=replace(d,'topology_kind=''double_elimination''','topology_kind=q.competition_format');
     d:=replace(d,'coalesce(l.n,0)<2','coalesce(l.n,0)<(case when q.competition_format=''single_elimination'' then 1 else 2 end)');
     d:=replace(d,'Qualifier normalized Double runtime','Qualifier normalized runtime');
     -- Compatibility with an installation predating the direct-entrant setup.
     d:=replace(d,'br.topology_kind = ''double_elimination''','br.topology_kind = v_qualifier.competition_format');
     d:=replace(d,'coalesce(l.loss_count, 0) < 2','coalesce(l.loss_count, 0) < (case when v_qualifier.competition_format=''single_elimination'' then 1 else 2 end)');
     d:=replace(d,'v_final.competition_format <> ''single_elimination''',
       'coalesce(v_final.competition_format,''single_elimination'') not in (''single_elimination'',''double_elimination'')');
   end if;
   execute d;
 end loop;
end $patch$;
commit;
