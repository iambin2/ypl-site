-- 팀전의 판을 사이트 배틀로 (2026-11-08). battle_random_seat.sql 다음에 실행한다. 다시 실행해도 안전하다.
--
-- 팀전 대회도 경기 진행을 포켓몬 챔피언스(기본), 사이트 배틀, 랜덤 배틀 중에 고른다. 팀전 한 경기는 팀원끼리의 일반 판 N개
-- (N은 두 팀 중 큰 팀의 인원)와, 일반 판이 동점이면 에이스 결정전 한 판이다. 판마다 배틀 하나를 열고, 그 배틀의 source_node_key 는
-- 하위 경기 행과 같은 "상위 경기 키:bout:n" 또는 "상위 경기 키:ace" 다(src/services/teamBouts.js).
--
-- 지키는 것
--   - 판의 자리는 그 팀의 팀원이 자기 신청의 제출 비밀번호로 앉는다. 파티는 그 팀원의 최신 공식 파티(랜덤 배틀이면 함수가 뽑는다).
--   - 결과가 난 판은 다시 열지 않는다(무승부와 무효인 판만 다시 치른다). 한 팀원은 팀의 모두가 한 판씩 나오기 전에는 두 번째 일반 판에 앉지 못한다.
--   - 에이스 결정전은 일반 판이 모두 끝나 동점일 때만 열린다.
--   - 판의 결과는 시리즈가 끝날 때까지 배틀에만 있다. 끝나면 배틀 함수가 운영진의 팀전 입력과 같은 계산(bracketWinnerPlan.js
--     planTeamSeries)으로 상위 경기와 판 행을 만들고, 이 파일의 battle_apply_team_series 가 대회를 잠근 한 트랜잭션으로 쓴다.
--   - 개인전의 함수(battle_official_seat, battle_apply_result)는 그대로 팀전을 거절한다. 모든 함수는 service_role(배틀 함수)만 부른다.

begin;

-- 1. 판의 자리
create or replace function public.battle_team_seat(p_event_id uuid, p_bout_key text, p_side text, p_player_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event ypl_schema_validation.events%rowtype;
  v_match ypl_schema_validation.matches%rowtype;
  v_parent text;
  v_bout integer;
  v_ace boolean;
  v_entry uuid;
  v_size_a integer;
  v_size_b integer;
  v_size integer;
  v_seat record;
  v_status text;
  v_submission uuid;
  v_team jsonb;
  v_n integer;
  v_wins_a integer := 0;
  v_wins_b integer := 0;
  v_winner uuid;
  v_seated integer;
  v_stale record;
begin
  select * into v_event from ypl_schema_validation.events e where e.id = p_event_id;
  if not found then return jsonb_build_object('status', 'no_event'); end if;
  if v_event.status <> 'running' or v_event.record_applied_at is not null or not v_event.is_team_event
     or coalesce(v_event.competition_settings ->> 'matchPlay', '') not in ('site', 'random') then
    return jsonb_build_object('status', 'not_running');
  end if;

  -- "상위 키:bout:n" 또는 "상위 키:ace"
  v_parent := substring(p_bout_key from '^(.+):(?:bout:[1-9][0-9]*|ace)$');
  if v_parent is null then return jsonb_build_object('status', 'bad_bout'); end if;
  v_ace := p_bout_key = v_parent || ':ace';
  v_bout := case when v_ace then null else substring(p_bout_key from ':bout:([1-9][0-9]*)$')::integer end;

  select * into v_match from ypl_schema_validation.matches m
   where m.event_id = p_event_id and m.source = 'normalized_bracket_runtime' and m.match_kind = 'bracket' and m.source_node_key = v_parent;
  if not found or v_match.entry_a_id is null or v_match.entry_b_id is null then return jsonb_build_object('status', 'not_formed'); end if;
  if v_match.winner_entry_id is not null then return jsonb_build_object('status', 'decided'); end if;

  select count(*) into v_size_a from ypl_schema_validation.entry_participants p where p.event_id = p_event_id and p.entry_id = v_match.entry_a_id;
  select count(*) into v_size_b from ypl_schema_validation.entry_participants p where p.event_id = p_event_id and p.entry_id = v_match.entry_b_id;
  v_size := greatest(v_size_a, v_size_b);
  if not v_ace and (v_bout < 1 or v_bout > v_size) then return jsonb_build_object('status', 'bad_bout'); end if;

  -- 이 판의 결과가 이미 났으면 다시 열지 않는다
  if exists (
    select 1 from public.battles b
     where b.kind = 'official' and b.event_id = p_event_id and b.source_node_key = p_bout_key and b.status = 'ended'
       and coalesce(b.ended_by, '') <> 'void' and b.winner in ('p1', 'p2')
       and b.p1_entry_id in (v_match.entry_a_id, v_match.entry_b_id) and b.p2_entry_id in (v_match.entry_a_id, v_match.entry_b_id)
  ) then
    return jsonb_build_object('status', 'bout_decided');
  end if;

  -- 에이스 결정전: 일반 판이 모두 끝나 동점일 때만
  if v_ace then
    for v_n in 1 .. v_size loop
      select case b.winner when 'p1' then b.p1_entry_id else b.p2_entry_id end into v_winner
        from public.battles b
       where b.kind = 'official' and b.event_id = p_event_id and b.source_node_key = v_parent || ':bout:' || v_n and b.status = 'ended'
         and coalesce(b.ended_by, '') <> 'void' and b.winner in ('p1', 'p2')
         and b.p1_entry_id in (v_match.entry_a_id, v_match.entry_b_id) and b.p2_entry_id in (v_match.entry_a_id, v_match.entry_b_id)
       order by b.updated_at desc limit 1;
      if not found then return jsonb_build_object('status', 'ace_not_needed'); end if;
      if v_winner = v_match.entry_a_id then v_wins_a := v_wins_a + 1; else v_wins_b := v_wins_b + 1; end if;
    end loop;
    if v_wins_a <> v_wins_b then return jsonb_build_object('status', 'ace_not_needed'); end if;
  end if;

  if p_side not in ('a', 'b') then return jsonb_build_object('status', 'not_player'); end if;
  v_entry := case p_side when 'a' then v_match.entry_a_id else v_match.entry_b_id end;
  select p.entry_id, p.player_id, p.registration_id, r.final_submission_id, r.registration_name, p_side as side
    into v_seat
    from ypl_schema_validation.entry_participants p
    join ypl_schema_validation.event_registrations r on r.id = p.registration_id
   where p.event_id = p_event_id and p.entry_id = v_entry and p.player_id = p_player_id;
  if not found then return jsonb_build_object('status', 'not_player'); end if;

  -- 일반 판: 팀의 모두가 한 판씩 나오기 전에는 같은 팀원이 두 번째 판에 앉지 않는다
  if not v_ace then
    with seats as (
      select case when b.p1_entry_id = v_entry then b.p1_player_id else b.p2_player_id end as player_id
        from public.battles b
       where b.kind = 'official' and b.event_id = p_event_id
         and left(b.source_node_key, length(v_parent) + 6) = v_parent || ':bout:' and b.source_node_key <> p_bout_key
         and (b.status in ('waiting', 'active') or (coalesce(b.ended_by, '') <> 'void' and b.winner in ('p1', 'p2')))
         and v_entry in (b.p1_entry_id, b.p2_entry_id)
    )
    select count(distinct s.player_id) into v_seated from seats s where s.player_id is not null;
    if v_seated < (case p_side when 'a' then v_size_a else v_size_b end) and exists (
      select 1 from public.battles b
       where b.kind = 'official' and b.event_id = p_event_id
         and left(b.source_node_key, length(v_parent) + 6) = v_parent || ':bout:' and b.source_node_key <> p_bout_key
         and (b.status in ('waiting', 'active') or (coalesce(b.ended_by, '') <> 'void' and b.winner in ('p1', 'p2')))
         and ((b.p1_entry_id = v_entry and b.p1_player_id = p_player_id) or (b.p2_entry_id = v_entry and b.p2_player_id = p_player_id))
    ) then
      return jsonb_build_object('status', 'played_already');
    end if;
  end if;

  v_status := public.visitor_pin_check('submission', v_seat.registration_id::text, p_pin);
  if v_status <> 'ok' then return jsonb_build_object('status', v_status); end if;

  -- 이 판에 열린 배틀이 지금 경기의 두 팀 것이 아니면(운영진이 앞 경기를 바꿨다) 닫는다
  for v_stale in
    select b.id from public.battles b
     where b.kind = 'official' and b.event_id = p_event_id and b.source_node_key = p_bout_key and b.status in ('waiting', 'active')
       and not (b.p1_entry_id in (v_match.entry_a_id, v_match.entry_b_id)
                and (b.p2_entry_id is null or b.p2_entry_id in (v_match.entry_a_id, v_match.entry_b_id)))
  loop
    perform public.battle_void_now(v_stale.id, '대진이 바뀌어 이 경기의 배틀이 아니게 되었습니다.');
  end loop;

  if coalesce(v_event.competition_settings ->> 'matchPlay', '') = 'random' then
    return jsonb_build_object(
      'status', 'ok', 'side', v_seat.side, 'entryId', v_seat.entry_id, 'playerId', v_seat.player_id,
      'registrationName', v_seat.registration_name, 'team', null,
      'regulation', v_event.regulation_id, 'battleFormat', v_event.battle_format, 'eventName', v_event.name);
  end if;

  v_submission := coalesce(v_seat.final_submission_id, (
    select s.id from ypl_schema_validation.registration_submissions s
     where s.registration_id = v_seat.registration_id order by s.revision desc limit 1));
  if v_submission is null then return jsonb_build_object('status', 'no_team'); end if;
  select jsonb_agg(jsonb_build_object(
           'pokemonId', m.pokemon_id, 'pokemonName', m.pokemon_name_snapshot, 'ability', m.ability_id, 'nature', m.nature_id,
           'item', m.item_id, 'moves', jsonb_build_array(m.move_1_id, m.move_2_id, m.move_3_id, m.move_4_id),
           'statPoints', jsonb_build_object('hp', m.stat_hp, 'atk', m.stat_atk, 'def', m.stat_def, 'spa', m.stat_spa, 'spd', m.stat_spd, 'spe', m.stat_spe)
         ) order by m.slot)
    into v_team
    from ypl_schema_validation.registration_submissions s
    join ypl_schema_validation.team_snapshot_members m on m.snapshot_id = s.snapshot_id
   where s.id = v_submission;
  if v_team is null then return jsonb_build_object('status', 'no_team'); end if;

  return jsonb_build_object(
    'status', 'ok', 'side', v_seat.side, 'entryId', v_seat.entry_id, 'playerId', v_seat.player_id,
    'registrationName', v_seat.registration_name, 'team', v_team,
    'regulation', v_event.regulation_id, 'battleFormat', v_event.battle_format, 'eventName', v_event.name);
end;
$$;

-- 2. 끝난 시리즈를 대진표에 넣는다. 상위 경기와 판 행의 계획은 배틀 함수가 운영진 화면과 같은 계산으로 만든다(planTeamSeries).
-- 쓰는 순서는 운영진의 동기화(syncNormalizedBracketMatchesNow)와 같다: 상위 수정, 상위 추가, 판 삭제, 판 수정, 판 추가, 상위 삭제.
create or replace function public.battle_apply_team_series(
  p_battle_id text, p_parent_key text, p_winner_entry_id uuid, p_expected_stamp text,
  p_parent_updates jsonb, p_parent_inserts jsonb, p_parent_delete_ids uuid[],
  p_child_updates jsonb, p_child_inserts jsonb, p_child_delete_ids uuid[], p_battle_ids text[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_battle public.battles%rowtype;
  v_event ypl_schema_validation.events%rowtype;
  v_target ypl_schema_validation.matches%rowtype;
  v_update jsonb;
  v_row ypl_schema_validation.matches%rowtype;
  v_now timestamptz := now();
  v_count integer;
begin
  select * into v_battle from public.battles b where b.id = p_battle_id for update;
  if not found or v_battle.kind <> 'official' then return 'not_official'; end if;
  if v_battle.applied_at is not null then return 'already'; end if;
  if v_battle.status <> 'ended' then return 'not_ended'; end if;
  if left(v_battle.source_node_key, length(p_parent_key) + 1) <> p_parent_key || ':' then return 'players_changed'; end if;

  select * into v_event from ypl_schema_validation.events e where e.id = v_battle.event_id for update;
  if not found or v_event.status <> 'running' or v_event.record_applied_at is not null or not v_event.is_team_event then
    return 'not_running';
  end if;
  select * into v_target from ypl_schema_validation.matches m
   where m.event_id = v_event.id and m.source = 'normalized_bracket_runtime' and m.match_kind = 'bracket' and m.source_node_key = p_parent_key;
  if not found then return 'players_changed'; end if;
  if v_target.winner_entry_id is not null then return 'decided'; end if;
  if not ((v_target.entry_a_id = v_battle.p1_entry_id and v_target.entry_b_id = v_battle.p2_entry_id)
       or (v_target.entry_a_id = v_battle.p2_entry_id and v_target.entry_b_id = v_battle.p1_entry_id))
     or p_winner_entry_id not in (v_target.entry_a_id, v_target.entry_b_id) then
    return 'players_changed';
  end if;
  if public.battle_match_stamp(v_event.id) is distinct from p_expected_stamp then return 'stale'; end if;

  for v_update in select * from jsonb_array_elements(coalesce(p_parent_updates, '[]'::jsonb) || coalesce(p_child_updates, '[]'::jsonb)) loop
    v_row := jsonb_populate_record(null::ypl_schema_validation.matches, v_update -> 'payload');
    update ypl_schema_validation.matches m
       set match_kind = v_row.match_kind, parent_match_id = v_row.parent_match_id, round_number = v_row.round_number,
           stage_label = v_row.stage_label, sequence_no = v_row.sequence_no, entry_a_id = v_row.entry_a_id, entry_b_id = v_row.entry_b_id,
           player_a_id = v_row.player_a_id, player_b_id = v_row.player_b_id, winner_entry_id = v_row.winner_entry_id,
           winner_player_id = v_row.winner_player_id, resolution = v_row.resolution, played_at = v_row.played_at, updated_at = v_now
     where m.id = (v_update ->> 'id')::uuid and m.event_id = v_event.id and m.source = 'normalized_bracket_runtime';
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception using errcode = 'P0001', message = 'a planned match changed during the battle'; end if;
  end loop;
  -- 판 행이 붙는 상위 경기는 이미 있는 행이라, 상위와 판의 추가를 한 번에 넣어도 부모가 먼저 있다
  insert into ypl_schema_validation.matches (event_id, source, match_kind, parent_match_id, round_number, stage_label, sequence_no,
         entry_a_id, entry_b_id, player_a_id, player_b_id, winner_entry_id, winner_player_id, resolution, played_at, source_node_key, updated_at)
  select v_event.id, 'normalized_bracket_runtime', r.match_kind, r.parent_match_id, r.round_number, r.stage_label, r.sequence_no,
         r.entry_a_id, r.entry_b_id, r.player_a_id, r.player_b_id, r.winner_entry_id, r.winner_player_id, r.resolution, r.played_at, r.source_node_key, v_now
    from jsonb_populate_recordset(null::ypl_schema_validation.matches, coalesce(p_parent_inserts, '[]'::jsonb) || coalesce(p_child_inserts, '[]'::jsonb)) r;
  delete from ypl_schema_validation.matches m
   where m.event_id = v_event.id and m.source = 'normalized_bracket_runtime' and m.match_kind <> 'bracket'
     and m.id = any (coalesce(p_child_delete_ids, '{}'::uuid[]));
  delete from ypl_schema_validation.matches m
   where m.event_id = v_event.id and m.source = 'normalized_bracket_runtime' and m.match_kind = 'bracket'
     and m.id = any (coalesce(p_parent_delete_ids, '{}'::uuid[]));

  -- 경기가 이제 시리즈의 승자를 가져야 한다. 아니면 모두 되돌린다
  perform 1 from ypl_schema_validation.matches m
   where m.event_id = v_event.id and m.source = 'normalized_bracket_runtime' and m.match_kind = 'bracket'
     and m.source_node_key = p_parent_key and m.winner_entry_id = p_winner_entry_id;
  if not found then raise exception using errcode = 'P0001', message = 'the bracket did not take the series winner'; end if;

  update public.battles b set applied_at = v_now, apply_error = null
   where b.id = any (coalesce(p_battle_ids, '{}'::text[]) || p_battle_id) and b.kind = 'official' and b.event_id = v_event.id
     and left(b.source_node_key, length(p_parent_key) + 1) = p_parent_key || ':';
  return 'ok';
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.battle_team_seat(uuid, text, text, uuid, text)',
    'public.battle_apply_team_series(text, text, uuid, text, jsonb, jsonb, uuid[], jsonb, jsonb, uuid[], text[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

commit;
