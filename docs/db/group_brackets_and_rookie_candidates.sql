
begin;

alter table ypl_schema_validation.bracket_runtimes add column if not exists group_advance smallint;
alter table ypl_schema_validation.bracket_runtimes add column if not exists group_final_format text;
alter table ypl_schema_validation.bracket_runtimes drop constraint if exists bracket_runtimes_topology_kind_check;
alter table ypl_schema_validation.bracket_runtimes add constraint bracket_runtimes_topology_kind_check check (
  (topology_kind in ('single_elimination','double_elimination') and group_advance is null and group_final_format is null)
  or (topology_kind='groups_then_elimination' and group_advance is not null and group_advance>0
      and group_final_format is not null and group_final_format in ('single_elimination','double_elimination'))
);

create or replace function ypl_schema_validation.list_same_round_rookie_champions(p_event_id uuid)
returns table(player_id uuid, display_name text, registration_id uuid, registration_name text)
language sql stable security invoker set search_path='' as $$
  select distinct p.id,p.display_name,r.id,r.registration_name
    from ypl_schema_validation.league_intakes li
    join ypl_schema_validation.events m on m.id=li.master_event_id
    join ypl_schema_validation.events q on q.id=li.rookie_event_id
    join ypl_schema_validation.results result on result.event_id=q.id and result.placement_code='champion'
    join ypl_schema_validation.entry_participants ep on ep.event_id=q.id and ep.entry_id=result.entry_id
    join ypl_schema_validation.players p on p.id=ep.player_id
    left join ypl_schema_validation.event_registrations r on r.event_id=m.id and r.player_id=p.id
   where (select ypl_schema_validation.is_ypl_admin()) and li.master_event_id=p_event_id
     and m.event_type='pokecup' and m.division='master' and not m.is_team_event
     and m.status in ('open','running') and m.record_applied_at is null
     and q.event_type='pokecup' and q.division='rookie' and not q.is_team_event
     and q.season_id=m.season_id and q.competition_edition_id is not distinct from m.competition_edition_id
     and q.status='completed' and q.record_applied_at is not null
     and not exists(select 1 from ypl_schema_validation.bracket_runtimes br where br.event_id=m.id);
$$;

-- Recheck selected candidates during creation; ordinary applicants never depend on this check.
create or replace function ypl_schema_validation.check_draw_rookie_candidates(p_event_id uuid,p_players uuid[])
returns void language plpgsql security invoker set search_path='' as $$
declare g ypl_schema_validation.league_intakes%rowtype;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into g from ypl_schema_validation.league_intakes where master_event_id=p_event_id or rookie_event_id=p_event_id;
  if found then
    perform pg_advisory_xact_lock(hashtextextended('league-intake:'||g.announcement_id,0));
  end if;
  if cardinality(p_players)>0 then
    perform 1 from ypl_schema_validation.events where id=g.rookie_event_id for update;
    if exists(select 1 from unnest(p_players) pid
      where not exists(select 1 from ypl_schema_validation.list_same_round_rookie_champions(p_event_id) c where c.player_id=pid)) then
      raise exception '이번 회차 루키 우승 기록이 변경되었습니다. 참가자 명단을 다시 불러와 주세요.';
    end if;
  end if;
end $$;

-- Individual creation owns identity changes together with the draw. The ordinary
-- Single contract handles its own identities; Double and groups share the
-- identity validation below and the existing normalized deletion contract.
create or replace function ypl_schema_validation.create_individual_bracket_draw(
  p_runtime_id uuid,p_event_id uuid,p_topology text,p_participants jsonb,p_slots jsonb,
  p_advance integer default null,p_final_format text default null,p_rookie_players uuid[] default '{}',
  p_initial_matches jsonb default '[]'
) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
  e ypl_schema_validation.events%rowtype;
  r ypl_schema_validation.event_registrations%rowtype;
  p record;
  existing ypl_schema_validation.bracket_runtimes%rowtype;
  pid uuid; rid uuid; canonical_name text; player_count integer;
  was_new_player boolean; was_new_registration boolean; was_linked boolean;
  canonical jsonb:='[]'; n integer; pool_count integer; min_pool integer; max_pool integer;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if p_runtime_id is null or p_topology is null or p_topology not in ('single_elimination','double_elimination','groups_then_elimination')
     or coalesce(jsonb_typeof(p_participants),'')<>'array' or coalesce(jsonb_typeof(p_slots),'')<>'array' then
    raise exception '대진표 생성 값이 올바르지 않습니다.';
  end if;
  select * into existing from ypl_schema_validation.bracket_runtimes where event_id=p_event_id;
  if found then
    if existing.id=p_runtime_id and existing.topology_kind=p_topology
       and existing.group_advance is not distinct from p_advance and existing.group_final_format is not distinct from p_final_format
       and not exists (
         (select entry_id,entry_participant_id from ypl_schema_validation.bracket_identity_changes where bracket_runtime_id=existing.id
          except select t.entry_id,t.entry_participant_id from jsonb_to_recordset(p_participants) t(entry_id uuid,entry_participant_id uuid))
         union all
         (select t.entry_id,t.entry_participant_id from jsonb_to_recordset(p_participants) t(entry_id uuid,entry_participant_id uuid)
          except select entry_id,entry_participant_id from ypl_schema_validation.bracket_identity_changes where bracket_runtime_id=existing.id)
       )
       and not exists (
         (select entry_id,pool_no,slot_no from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=existing.id and stage_no=1
          except select s.entry_id,case when p_topology='groups_then_elimination' then s.pool_no else 0 end,s.slot_no
            from jsonb_to_recordset(p_slots) s(entry_id uuid,pool_no integer,slot_no integer))
         union all
         (select s.entry_id,case when p_topology='groups_then_elimination' then s.pool_no else 0 end,s.slot_no
            from jsonb_to_recordset(p_slots) s(entry_id uuid,pool_no integer,slot_no integer)
          except select entry_id,pool_no,slot_no from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=existing.id and stage_no=1)
       ) then return existing.id; end if;
    raise exception '이 대회에 연결된 대진표가 이미 있습니다.';
  end if;
  perform ypl_schema_validation.check_draw_rookie_candidates(p_event_id,p_rookie_players);
  select * into e from ypl_schema_validation.events where id=p_event_id for update;
  if not found or e.is_team_event or e.status not in ('open','running') or e.record_applied_at is not null then
    raise exception '개인전 대진표를 생성할 수 없는 대회입니다.';
  end if;
  if exists(select 1 from ypl_schema_validation.bracket_runtimes where event_id=e.id)
     or exists(select 1 from ypl_schema_validation.entries where event_id=e.id)
     or exists(select 1 from ypl_schema_validation.matches where event_id=e.id)
     or exists(select 1 from ypl_schema_validation.results where event_id=e.id)
     or exists(select 1 from ypl_schema_validation.ranking_awards where event_id=e.id) then
    raise exception '대회에 이미 저장된 대진 또는 출전 기록이 있습니다.';
  end if;
  n:=jsonb_array_length(p_participants);
  if n<2 or n>64 or (p_topology='double_elimination' and n<3) then raise exception '참가 인원이 올바르지 않습니다.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_participants)
      as t(participant_key text,display_name text,entry_id uuid,entry_participant_id uuid)
    where nullif(btrim(t.display_name),'') is null or nullif(t.participant_key,'') is null
       or t.entry_id is null or t.entry_participant_id is null) then raise exception '참가자 정보가 올바르지 않습니다.'; end if;
  if exists(select 1 from unnest(p_rookie_players) candidate
     where not exists(select 1 from jsonb_to_recordset(p_participants) t(player_id uuid) where t.player_id=candidate)) then
    raise exception '선택한 루키 우승자가 참가 명단에 없습니다.';
  end if;
  if p_topology='groups_then_elimination' then
    if e.championship_phase is not null or e.event_type='champions' then
      raise exception '챔피언스는 선발전과 본선 절차를 사용합니다.';
    end if;
    select count(*),min(size),max(size) into pool_count,min_pool,max_pool
      from (select pool_no,count(*) size from jsonb_to_recordset(p_slots) s(pool_no integer,slot_no integer,entry_id uuid) group by pool_no) pools;
    if p_advance is null or p_advance<1 or p_final_format is null or p_final_format not in ('single_elimination','double_elimination')
       or pool_count not between 1 and 32 or min_pool<=p_advance or max_pool-min_pool>1
       or pool_count*p_advance < (case when p_final_format='double_elimination' then 3 else 2 end)
       or jsonb_array_length(p_slots)<>n
       or (select count(distinct s.entry_id) from jsonb_to_recordset(p_slots) s(entry_id uuid))<>n
       or exists(select 1 from jsonb_to_recordset(p_slots) s(pool_no integer,slot_no integer,entry_id uuid)
          left join jsonb_to_recordset(p_participants) t(entry_id uuid) on t.entry_id=s.entry_id
          where s.pool_no is null or s.pool_no not between 1 and pool_count or s.slot_no is null or s.slot_no<1 or t.entry_id is null)
       or exists(select 1 from jsonb_to_recordset(p_slots) s(pool_no integer,slot_no integer)
          group by pool_no having max(slot_no)<>count(*) or count(distinct slot_no)<>count(*)) then
      raise exception '조 편성과 조별 진출 인원이 올바르지 않습니다.';
    end if;
  end if;

  -- Resolve by existing registration/Player first. New identities remain
  -- rollback-owned by the runtime, including automatically promoted entrants.
  for p in select * from jsonb_to_recordset(p_participants) t(
    participant_key text,display_name text,player_id uuid,registration_id uuid,entry_id uuid,entry_participant_id uuid
  ) order by lower(regexp_replace(btrim(display_name),'\s','','g'))
  loop
    perform pg_advisory_xact_lock(hashtextextended('bracket-player:'||lower(regexp_replace(btrim(p.display_name),'\s','','g')),0));
    select * into r from ypl_schema_validation.event_registrations where id=p.registration_id;
    if found and (r.event_id<>e.id or r.registration_name<>btrim(p.display_name) or r.registration_source='migration') then
      raise exception '참가 신청의 대회 또는 이름이 일치하지 않습니다.';
    end if;
    if r.id is null and p.player_id=any(p_rookie_players) then
      select * into r from ypl_schema_validation.event_registrations where event_id=e.id and player_id=p.player_id;
      if found and r.registration_name<>btrim(p.display_name) then raise exception '승격 참가자의 이름이 변경되었습니다.'; end if;
    end if;
    if coalesce(r.player_id,case when p.player_id=any(p_rookie_players) then p.player_id end) is not null then
      select id,display_name into pid,canonical_name from ypl_schema_validation.players
        where id=coalesce(r.player_id,p.player_id);
    else
      select count(*),(array_agg(id))[1],(array_agg(display_name))[1] into player_count,pid,canonical_name
        from ypl_schema_validation.players
        where lower(regexp_replace(display_name,'\s','','g'))=lower(regexp_replace(btrim(p.display_name),'\s','','g'));
      if player_count>1 then raise exception '동일한 이름의 선수가 있어 참가자의 신원을 확인해 주세요.'; end if;
    end if;
    if r.id is null and pid is not null then
      select * into r from ypl_schema_validation.event_registrations where event_id=e.id and player_id=pid;
    end if;
    if r.id is not null and (r.registration_source='migration' or (pid is not null and r.registration_name<>canonical_name)) then
      raise exception '기존 선수와 이름 표기가 다릅니다. 선수 명단과 같은 이름을 사용해 주세요.';
    end if;
    if r.player_id is not null and r.player_id is distinct from pid then raise exception '참가 신청에 연결된 선수가 다릅니다.'; end if;
    if p.player_id=any(p_rookie_players) and p.player_id is distinct from pid then raise exception '승격 참가자의 선수가 일치하지 않습니다.'; end if;
    was_new_player:=pid is null;
    was_new_registration:=r.id is null;
    was_linked:=not was_new_registration and r.player_id is null;
    pid:=coalesce(pid,p.player_id,gen_random_uuid());
    rid:=coalesce(r.id,p.registration_id,gen_random_uuid());
    canonical_name:=coalesce(canonical_name,btrim(p.display_name));
    if p_topology<>'single_elimination' then
      if was_new_player then
        insert into ypl_schema_validation.players(id,display_name,status) values(pid,canonical_name,'active');
      end if;
      if was_new_registration then
        insert into ypl_schema_validation.event_registrations(id,event_id,player_id,registration_name,registration_source,registration_data)
          values(rid,e.id,pid,canonical_name,'manual',
            case when pid=any(p_rookie_players) then '{"source":"same_round_rookie_champion"}'::jsonb else '{"source":"bracket_operator"}'::jsonb end);
      elsif was_linked then
        update ypl_schema_validation.event_registrations set player_id=pid,updated_at=now() where id=rid;
      end if;
      insert into ypl_schema_validation.entries(id,event_id,entry_type,display_name,status)
        values(p.entry_id,e.id,'individual',canonical_name,'active');
      insert into ypl_schema_validation.entry_participants(id,event_id,entry_id,registration_id,player_id,member_order)
        values(p.entry_participant_id,e.id,p.entry_id,rid,pid,1);
    end if;
    canonical:=canonical||jsonb_build_array(jsonb_build_object(
      'participant_key',p.participant_key,'display_name',canonical_name,'player_id',pid,'registration_id',rid,
      'entry_id',p.entry_id,'entry_participant_id',p.entry_participant_id,'entry_type','individual','member_order',1,
      'player_was_created',was_new_player,'registration_was_created',was_new_registration,
      'registration_player_was_changed',was_linked,'previous_registration_player_id',r.player_id,
      'entry_was_created',true,'entry_participant_was_created',true));
  end loop;
  if (select count(distinct t.player_id) from jsonb_to_recordset(canonical) t(player_id uuid))<>n then
    raise exception '같은 선수가 참가자 명단에 중복되어 있습니다.';
  end if;

  if p_topology<>'groups_then_elimination' then
    perform 1 from ypl_schema_validation.create_selected_bracket_runtime(p_runtime_id,e.id,p_topology,canonical,p_slots);
    if p_topology='double_elimination' then
      perform ypl_schema_validation.insert_group_final_matches(e.id,p_runtime_id,p_initial_matches);
    end if;
    if p_topology='single_elimination' then
      update ypl_schema_validation.event_registrations reg
         set registration_data=reg.registration_data||'{"source":"same_round_rookie_champion"}'::jsonb
       where reg.event_id=e.id and reg.player_id=any(p_rookie_players) and reg.registration_source='manual'
         and exists(select 1 from ypl_schema_validation.bracket_identity_changes c
             where c.bracket_runtime_id=p_runtime_id and c.registration_id=reg.id and c.registration_was_created);
    end if;
    return p_runtime_id;
  end if;

  insert into ypl_schema_validation.bracket_runtimes(id,event_id,topology_kind,previous_event_status,group_advance,group_final_format)
    values(p_runtime_id,e.id,p_topology,e.status,p_advance,p_final_format);
  insert into ypl_schema_validation.bracket_identity_changes(
      bracket_runtime_id,event_id,entry_participant_id,entry_id,registration_id,player_id,
      player_was_created,registration_was_created,registration_player_was_changed,previous_registration_player_id,
      entry_was_created,entry_participant_was_created)
    select p_runtime_id,e.id,t.entry_participant_id,t.entry_id,t.registration_id,t.player_id,
      t.player_was_created,t.registration_was_created,t.registration_player_was_changed,t.previous_registration_player_id,true,true
      from jsonb_to_recordset(canonical) t(entry_participant_id uuid,entry_id uuid,registration_id uuid,player_id uuid,
        player_was_created boolean,registration_was_created boolean,registration_player_was_changed boolean,previous_registration_player_id uuid);
  insert into ypl_schema_validation.bracket_entry_slots(bracket_runtime_id,event_id,stage_kind,stage_no,pool_no,slot_no,entry_id)
    select p_runtime_id,e.id,'group',1,s.pool_no,s.slot_no,s.entry_id from jsonb_to_recordset(p_slots) s(pool_no integer,slot_no integer,entry_id uuid);
  insert into ypl_schema_validation.matches(event_id,source,source_node_key,match_kind,sequence_no,stage_label,entry_a_id,entry_b_id,resolution)
    select e.id,'normalized_bracket_runtime',
       format('group:g%s:m%s',a.pool_no,row_number() over(partition by a.pool_no order by a.slot_no,b.slot_no)),
       'bracket',row_number() over(order by a.pool_no,a.slot_no,b.slot_no),format('%s조',a.pool_no),a.entry_id,b.entry_id,'unknown'
      from ypl_schema_validation.bracket_entry_slots a
      join ypl_schema_validation.bracket_entry_slots b on b.bracket_runtime_id=a.bracket_runtime_id and b.pool_no=a.pool_no and b.slot_no>a.slot_no
     where a.bracket_runtime_id=p_runtime_id and a.stage_kind='group' and b.stage_kind='group';
  update ypl_schema_validation.events set status='running',competition_format=p_topology,updated_at=now() where id=e.id;
  return p_runtime_id;
end $$;

-- Write only formed final matches. The browser and battle planner share the
-- normalized graph projection; the DB owns qualification and transaction locks.
create or replace function ypl_schema_validation.insert_group_final_matches(p_event_id uuid,p_runtime_id uuid,p_rows jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if coalesce(jsonb_typeof(p_rows),'')<>'array' or exists(
    select 1 from jsonb_to_recordset(p_rows) m(source_node_key text,entry_a_id uuid,entry_b_id uuid,winner_entry_id uuid)
    where m.source_node_key is null or m.source_node_key !~ '^(single:r[1-9][0-9]*:m[1-9][0-9]*|double:((w|l):r[1-9][0-9]*:m[1-9][0-9]*|(gf|reset):m1))$'
      or m.entry_a_id is null or m.entry_b_id is null or m.entry_a_id=m.entry_b_id or m.winner_entry_id is not null
      or (select count(*) from ypl_schema_validation.bracket_entry_slots s where s.bracket_runtime_id=p_runtime_id
          and s.event_id=p_event_id and s.stage_kind='elimination' and s.entry_id in (m.entry_a_id,m.entry_b_id))<>2
  ) then raise exception '본선 경기의 참가자 또는 구조가 일치하지 않습니다.'; end if;
  insert into ypl_schema_validation.matches(event_id,source,source_node_key,match_kind,round_number,stage_label,sequence_no,entry_a_id,entry_b_id,resolution)
    select p_event_id,'normalized_bracket_runtime',m.source_node_key,'bracket',m.round_number,m.stage_label,m.sequence_no,m.entry_a_id,m.entry_b_id,'unknown'
      from jsonb_to_recordset(p_rows) m(source_node_key text,round_number integer,stage_label text,sequence_no integer,entry_a_id uuid,entry_b_id uuid);
end $$;

create or replace function ypl_schema_validation.create_group_final(
  p_event_id uuid,p_runtime_id uuid,p_slots jsonb,p_matches jsonb
) returns void language plpgsql security invoker set search_path='' as $$
declare rt ypl_schema_validation.bracket_runtimes%rowtype;
  pool integer; state jsonb; qualified uuid[]:='{}'; entrants integer; size integer:=1;
begin
  rt:=ypl_schema_validation.lock_group_draw(p_event_id,p_runtime_id);
  if exists(select 1 from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=rt.id and stage_kind='elimination') then
    raise exception '이미 본선이 확정되었습니다.';
  end if;
  for pool in select distinct pool_no from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=rt.id and stage_kind='group'
  loop
    state:=ypl_schema_validation.group_pool_qualification(p_event_id,pool);
    if not (state->>'ready')::boolean then raise exception '조별 경기와 순위 결정전을 먼저 완료해 주세요.'; end if;
    qualified:=qualified||array(select value::uuid from jsonb_array_elements_text(state->'qualified'));
  end loop;
  entrants:=cardinality(qualified);
  while size<entrants loop size:=size*2; end loop;
  if coalesce(jsonb_typeof(p_slots),'')<>'array' or entrants<2 or jsonb_array_length(p_slots)<>entrants
     or exists(select 1 from jsonb_to_recordset(p_slots) s(slot_no integer,entry_id uuid)
        where s.slot_no is null or s.slot_no not between 1 and size or s.entry_id is null or not(s.entry_id=any(qualified)))
     or exists(select 1 from generate_series(1,size/2) n
        where not exists(select 1 from jsonb_to_recordset(p_slots) s(slot_no integer)
          where s.slot_no in (n*2-1,n*2))) then raise exception '조별 진출자와 본선 배치가 일치하지 않습니다.'; end if;
  insert into ypl_schema_validation.bracket_entry_slots(bracket_runtime_id,event_id,stage_kind,stage_no,pool_no,slot_no,entry_id)
    select rt.id,p_event_id,'elimination',2,0,s.slot_no,s.entry_id from jsonb_to_recordset(p_slots) s(slot_no integer,entry_id uuid);
  perform ypl_schema_validation.insert_group_final_matches(p_event_id,rt.id,p_matches);
end $$;

create or replace function ypl_schema_validation.reopen_group_stage(p_event_id uuid,p_runtime_id uuid,p_pool integer default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform ypl_schema_validation.lock_group_draw(p_event_id,p_runtime_id);
  -- A linked site battle can still complete against its original Match key.
  -- Require the operator to close a waiting/live room before reusing that key.
  if to_regclass('public.battles') is not null then
    if exists (
      select 1 from public.battles b where b.event_id=p_event_id and b.kind='official' and b.status in ('waiting','active')
        and (b.source_node_key ~ '^(single|double):' or
             (p_pool is not null and b.source_node_key ~ ('^playoff:g'||p_pool||':')))
    ) then raise exception '대기 중이거나 진행 중인 사이트 배틀을 먼저 종료해 주세요.'; end if;
  end if;
  if exists(select 1 from ypl_schema_validation.matches where event_id=p_event_id and source='normalized_bracket_runtime'
    and source_node_key ~ '^(single|double):' and winner_entry_id is not null) then
    raise exception '결과가 입력된 본선 경기를 먼저 취소해 주세요.';
  end if;
  delete from ypl_schema_validation.matches where event_id=p_event_id and source='normalized_bracket_runtime' and source_node_key ~ '^(single|double):';
  delete from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=p_runtime_id and stage_kind='elimination';
  if p_pool is not null then
    delete from ypl_schema_validation.matches where event_id=p_event_id and source='normalized_bracket_runtime'
      and source_node_key ~ ('^playoff:g'||p_pool||':m[1-9][0-9]*$');
  end if;
end $$;

create or replace function ypl_schema_validation.save_group_final_matches(
  p_event_id uuid,p_runtime_id uuid,p_expected jsonb,p_updates jsonb,p_inserts jsonb,p_deletes uuid[]
) returns void language plpgsql security invoker set search_path='' as $$
declare payload jsonb;
begin
  perform ypl_schema_validation.lock_group_draw(p_event_id,p_runtime_id);
  if not exists(select 1 from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=p_runtime_id and stage_kind='elimination') then
    raise exception '본선을 먼저 확정해 주세요.';
  end if;
  if exists (
    select 1 from (select id,winner_entry_id,entry_a_id,entry_b_id from ypl_schema_validation.matches
      where event_id=p_event_id and source='normalized_bracket_runtime' and source_node_key ~ '^(single|double):') m
    full join jsonb_to_recordset(p_expected) x(id uuid,winner_entry_id uuid,entry_a_id uuid,entry_b_id uuid) on x.id=m.id
    where x.id is null or m.id is null or row(x.winner_entry_id,x.entry_a_id,x.entry_b_id) is distinct from row(m.winner_entry_id,m.entry_a_id,m.entry_b_id)
  ) then raise exception '다른 곳에서 경기 결과를 변경했습니다. 대진표를 다시 불러와 주세요.'; end if;
  delete from ypl_schema_validation.matches where event_id=p_event_id and source='normalized_bracket_runtime'
    and source_node_key ~ '^(single|double):' and id=any(p_deletes);
  for payload in select value from jsonb_array_elements(p_updates) loop
    update ypl_schema_validation.matches m set
       entry_a_id=x.entry_a_id,entry_b_id=x.entry_b_id,winner_entry_id=x.winner_entry_id,
       resolution=x.resolution,played_at=x.played_at,updated_at=now()
      from jsonb_to_record(payload->'payload') x(entry_a_id uuid,entry_b_id uuid,winner_entry_id uuid,resolution text,played_at timestamptz)
      where m.id=(payload->>'id')::uuid and m.event_id=p_event_id and m.source='normalized_bracket_runtime' and m.source_node_key ~ '^(single|double):'
        and (select count(*) from ypl_schema_validation.bracket_entry_slots s where s.bracket_runtime_id=p_runtime_id
            and s.stage_kind='elimination' and s.entry_id in (x.entry_a_id,x.entry_b_id))=2;
    if not found then raise exception '본선 경기 소속을 확인하지 못했습니다.'; end if;
  end loop;
  perform ypl_schema_validation.insert_group_final_matches(p_event_id,p_runtime_id,p_inserts);
end $$;

-- The generic deletion RPC already knows how to remove owned slots, matches
-- and identities while preserving submitted registrations. Extend its shape check.
do $patch$
declare f regprocedure:='ypl_schema_validation.delete_normalized_bracket_runtime(uuid,uuid)'::regprocedure; d text;
begin
  d:=pg_get_functiondef(f);
  if position('groups_then_elimination' in d)=0 then
    d:=regexp_replace(d,$rx$or \(v_runtime\.topology_kind = 'single_elimination'\s+and m\.source_node_key$rx$,
      $replacement$or (v_runtime.topology_kind = 'groups_then_elimination' and m.source_node_key !~ '^((group|playoff):g[1-9][0-9]*:m[1-9][0-9]*|single:r[1-9][0-9]*:m[1-9][0-9]*|double:((w|l):r[1-9][0-9]*:m[1-9][0-9]*|(gf|reset):m1))$') or (v_runtime.topology_kind = 'single_elimination' and m.source_node_key$replacement$);
    if position('groups_then_elimination' in d)=0 then raise exception '현재 대진표 삭제 함수의 구조를 확인해 주세요.'; end if;
    execute d;
  end if;
end $patch$;

-- Reject an incomplete group tournament at the DB record boundary too.
create or replace function ypl_schema_validation.guard_group_record_apply()
returns trigger language plpgsql security invoker set search_path='' as $$
declare rt ypl_schema_validation.bracket_runtimes%rowtype; final_winner uuid;
begin
  if new.record_applied_at is null or old.record_applied_at is not null then return new; end if;
  select * into rt from ypl_schema_validation.bracket_runtimes where event_id=new.id and topology_kind='groups_then_elimination';
  if not found then return new; end if;
  if rt.group_final_format='single_elimination' then
    select winner_entry_id into final_winner from ypl_schema_validation.matches where event_id=new.id
      and source='normalized_bracket_runtime' and source_node_key ~ '^single:r[1-9][0-9]*:m[1-9][0-9]*$'
      order by round_number desc nulls last,sequence_no desc limit 1;
    if (select count(*) from ypl_schema_validation.matches where event_id=new.id and source='normalized_bracket_runtime'
        and source_node_key like 'single:%' and winner_entry_id is not null) <>
        (select count(*)-1 from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=rt.id and stage_kind='elimination') then
      final_winner:=null;
    end if;
  else
    select case when winner_entry_id=entry_a_id then winner_entry_id
      else (select reset.winner_entry_id from ypl_schema_validation.matches reset where reset.event_id=new.id
         and reset.source='normalized_bracket_runtime' and reset.source_node_key='double:reset:m1') end
      into final_winner from ypl_schema_validation.matches where event_id=new.id and source='normalized_bracket_runtime'
        and source_node_key='double:gf:m1' and winner_entry_id is not null;
  end if;
  if final_winner is null or not exists(select 1 from ypl_schema_validation.results where event_id=new.id
    and source='normalized_bracket_runtime' and placement_code='champion' and entry_id=final_winner) then
    raise exception '본선 우승자가 확정된 뒤 기록을 반영할 수 있습니다.';
  end if;
  return new;
end $$;
drop trigger if exists guard_group_record_apply on ypl_schema_validation.events;
create trigger guard_group_record_apply before update of record_applied_at on ypl_schema_validation.events
  for each row execute function ypl_schema_validation.guard_group_record_apply();

-- The first pass is the whole pool; every tied band is recomputed using only
-- its members. Stop recursion if there is no split (e.g. three 1–1 records).
create or replace function ypl_schema_validation.group_rank_bands(p_members uuid[],p_matches jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare band uuid[]; bands jsonb:='[]';
begin
  for band in
    with scores as (
      select id,(select count(*) from jsonb_to_recordset(p_matches) m(a uuid,b uuid,winner uuid)
        where m.a=any(p_members) and m.b=any(p_members) and m.winner=id) wins from unnest(p_members) id
    ) select array_agg(id order by id) from scores group by wins order by wins desc
  loop
    if cardinality(band)=cardinality(p_members) or cardinality(band)=1 then
      bands:=bands||jsonb_build_array(to_jsonb(band));
    else
      bands:=bands||ypl_schema_validation.group_rank_bands(band,p_matches);
    end if;
  end loop;
  return bands;
end $$;

create or replace function ypl_schema_validation.group_pool_qualification(p_event_id uuid,p_pool integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rt ypl_schema_validation.bracket_runtimes%rowtype;
  members uuid[]; games jsonb; band jsonb; ids uuid[]; qualified uuid[]:='{}';
  survivors uuid[]:='{}'; places integer; m record; pending boolean:=false;
begin
  select * into rt from ypl_schema_validation.bracket_runtimes where event_id=p_event_id and topology_kind='groups_then_elimination';
  if not found then raise exception '조별 대진표를 찾을 수 없습니다.'; end if;
  select array_agg(entry_id order by slot_no) into members from ypl_schema_validation.bracket_entry_slots
    where bracket_runtime_id=rt.id and stage_kind='group' and pool_no=p_pool;
  if cardinality(members) is null then raise exception '존재하지 않는 조입니다.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('a',entry_a_id,'b',entry_b_id,'winner',winner_entry_id)),'[]') into games
    from ypl_schema_validation.matches where event_id=p_event_id and source='normalized_bracket_runtime'
      and source_node_key ~ ('^group:g'||p_pool||':m[1-9][0-9]*$');
  if jsonb_array_length(games)<>cardinality(members)*(cardinality(members)-1)/2 or
      exists(select 1 from jsonb_to_recordset(games) g(a uuid,b uuid,winner uuid)
        where g.winner is null or not(g.a=any(members) and g.b=any(members))) then
    return jsonb_build_object('ready',false,'qualified','[]'::jsonb,'next','[]'::jsonb);
  end if;
  places:=rt.group_advance;
  for band in select value from jsonb_array_elements(ypl_schema_validation.group_rank_bands(members,games)) loop
    exit when places=0;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(band);
    if cardinality(ids)<=places then qualified:=qualified||ids; places:=places-cardinality(ids);
    else survivors:=ids; exit;
    end if;
  end loop;
  for m in select entry_a_id,entry_b_id,winner_entry_id from ypl_schema_validation.matches
    where event_id=p_event_id and source='normalized_bracket_runtime'
      and source_node_key ~ ('^playoff:g'||p_pool||':m[1-9][0-9]*$') order by sequence_no
  loop
    if pending or cardinality(survivors)<=places or not(m.entry_a_id=any(survivors) and m.entry_b_id=any(survivors)) then
      raise exception '결정전과 현재 조별 순위가 일치하지 않습니다.';
    end if;
    if m.winner_entry_id is null then pending:=true;
    else survivors:=array_remove(survivors,case when m.winner_entry_id=m.entry_a_id then m.entry_b_id else m.entry_a_id end);
    end if;
  end loop;
  if cardinality(survivors)=places then
    return jsonb_build_object('ready',true,'qualified',qualified||survivors,'next','[]'::jsonb);
  end if;
  return jsonb_build_object('ready',false,'qualified',qualified,'next',case when pending then '{}'::uuid[] else survivors end);
end $$;

create or replace function ypl_schema_validation.lock_group_draw(p_event_id uuid,p_runtime_id uuid)
returns ypl_schema_validation.bracket_runtimes language plpgsql security invoker set search_path='' as $$
declare e ypl_schema_validation.events%rowtype; rt ypl_schema_validation.bracket_runtimes%rowtype;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into e from ypl_schema_validation.events where id=p_event_id for update;
  if not found or e.status<>'running' or e.record_applied_at is not null then raise exception '대진표를 변경할 수 없는 대회입니다.'; end if;
  select * into rt from ypl_schema_validation.bracket_runtimes
    where id=p_runtime_id and event_id=p_event_id and topology_kind='groups_then_elimination';
  if not found then raise exception '조별 대진표의 대회 소속을 확인하지 못했습니다.'; end if;
  return rt;
end $$;

create or replace function ypl_schema_validation.create_group_playoff(p_event_id uuid,p_runtime_id uuid,p_pool integer)
returns text language plpgsql security invoker set search_path='' as $$
declare players uuid[]; key text;
begin
  perform ypl_schema_validation.lock_group_draw(p_event_id,p_runtime_id);
  if exists(select 1 from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=p_runtime_id and stage_kind='elimination') then
    raise exception '이미 본선이 확정되었습니다.';
  end if;
  select array_agg(value::uuid order by random()) into players
    from jsonb_array_elements_text(ypl_schema_validation.group_pool_qualification(p_event_id,p_pool)->'next');
  if coalesce(cardinality(players),0)<2 then raise exception '새 결정전이 필요한 동률이 없습니다.'; end if;
  select format('playoff:g%s:m%s',p_pool,count(*)+1) into key from ypl_schema_validation.matches
   where event_id=p_event_id and source='normalized_bracket_runtime' and source_node_key ~ ('^playoff:g'||p_pool||':m[1-9][0-9]*$');
  insert into ypl_schema_validation.matches(event_id,source,source_node_key,match_kind,sequence_no,stage_label,entry_a_id,entry_b_id,resolution)
    values(p_event_id,'normalized_bracket_runtime',key,'bracket',
      (select coalesce(max(sequence_no),0)+1 from ypl_schema_validation.matches where event_id=p_event_id),
      format('%s조 순위 결정전',p_pool),players[1],players[2],'unknown');
  return key;
end $$;

-- Lock all group result changes against playoff creation, final draw and
-- record application. This is also the gate for results from site battles.
create or replace function ypl_schema_validation.guard_group_stage_winner()
returns trigger language plpgsql security invoker set search_path='' as $$
declare rt uuid; pool text; step_no integer; is_pool boolean;
begin
  if new.source<>'normalized_bracket_runtime' or new.winner_entry_id is not distinct from old.winner_entry_id then return new; end if;
  if new.source_node_key !~ '^(group|playoff):g[1-9][0-9]*:m[1-9][0-9]*$' then return new; end if;
  perform 1 from ypl_schema_validation.events where id=new.event_id and status='running' and record_applied_at is null for update;
  if not found then raise exception '종료된 조별 결과는 변경할 수 없습니다.'; end if;
  select id into rt from ypl_schema_validation.bracket_runtimes where event_id=new.event_id and topology_kind='groups_then_elimination';
  if rt is null then raise exception '조별 대진표가 없습니다.'; end if;
  pool:=split_part(new.source_node_key,':',2);
  step_no:=substring(new.source_node_key from 'm([0-9]+)$')::integer;
  is_pool:=new.source_node_key like 'group:%';
  if exists(select 1 from ypl_schema_validation.bracket_entry_slots where bracket_runtime_id=rt and stage_kind='elimination')
     or exists(select 1 from ypl_schema_validation.matches where event_id=new.event_id and source='normalized_bracket_runtime'
       and source_node_key ~ ('^playoff:'||pool||':m[1-9][0-9]*$')
       and (is_pool or substring(source_node_key from 'm([0-9]+)$')::integer>step_no)) then
    raise exception '이 결과에 이어 결정전 또는 본선이 확정되어 변경할 수 없습니다.';
  end if;
  return new;
end $$;
drop trigger if exists guard_group_stage_winner on ypl_schema_validation.matches;
create trigger guard_group_stage_winner before update of winner_entry_id on ypl_schema_validation.matches
  for each row execute function ypl_schema_validation.guard_group_stage_winner();

create or replace function ypl_schema_validation.set_group_stage_winner(
  p_event_id uuid,p_runtime_id uuid,p_key text,p_winner uuid,p_expected_winner uuid
) returns void language plpgsql security invoker set search_path='' as $$
begin
  perform ypl_schema_validation.lock_group_draw(p_event_id,p_runtime_id);
  if p_key is null or p_key !~ '^(group|playoff):g[1-9][0-9]*:m[1-9][0-9]*$' then raise exception '조별 경기 키가 올바르지 않습니다.'; end if;
  update ypl_schema_validation.matches set winner_entry_id=p_winner,
    resolution=case when p_winner is null then 'unknown' else 'played' end,
    played_at=case when p_winner is null then null else now() end,updated_at=now()
    where event_id=p_event_id and source='normalized_bracket_runtime' and match_kind='bracket'
      and source_node_key=p_key and winner_entry_id is not distinct from p_expected_winner
      and (p_winner is null or p_winner in (entry_a_id,entry_b_id));
  if not found then raise exception '경기 참가자 또는 결과가 변경되었습니다. 새로고침해 주세요.'; end if;
end $$;

do $grants$
declare f text;
begin
  foreach f in array array[
    'list_same_round_rookie_champions(uuid)','check_draw_rookie_candidates(uuid,uuid[])',
    'create_individual_bracket_draw(uuid,uuid,text,jsonb,jsonb,integer,text,uuid[],jsonb)','group_rank_bands(uuid[],jsonb)',
    'group_pool_qualification(uuid,integer)','lock_group_draw(uuid,uuid)','create_group_playoff(uuid,uuid,integer)',
    'guard_group_stage_winner()','set_group_stage_winner(uuid,uuid,text,uuid,uuid)',
    'insert_group_final_matches(uuid,uuid,jsonb)','create_group_final(uuid,uuid,jsonb,jsonb)',
    'reopen_group_stage(uuid,uuid,integer)','save_group_final_matches(uuid,uuid,jsonb,jsonb,jsonb,uuid[])','guard_group_record_apply()'
  ] loop
    execute 'revoke all on function ypl_schema_validation.'||f||' from public,anon,service_role';
    execute 'grant execute on function ypl_schema_validation.'||f||' to authenticated';
  end loop;
  -- The existing service-only battle result writer fires the group trigger.
  grant execute on function ypl_schema_validation.guard_group_stage_winner() to service_role;
end $grants$;
commit;
