-- 배틀과 리그 데이터의 이음새 보강 (2026-11-05 점검). battles.sql, battle_links.sql 다음에 한 번 실행한다. 다시 실행해도 안전하다.
-- 이 SQL을 먼저 실행하고, 그다음 battle 함수를 다시 묶어 배포한다(npm run build:battle 후 배포). 클라이언트는 앞뒤 어느 쪽이든 된다.
--
-- 1. 공개 전 파티 보호. 끝난 공식 배틀의 log 와 input_log 에는 두 선수의 공식 파티 전부(기술, 도구, 포인트)가 들어 있다.
--    battles 는 누구나 읽었으므로 대회가 파티를 공개하기(team_revealed_at) 전에도 상대 파티가 보였다(private_answers.sql 의 잠금을 우회).
--    이제 방문자는 이 두 칸을 직접 읽지 못한다. battle_full_log 가 친선전, 파티를 공개한 대회의 공식 배틀, 운영진에게만 전체를 주고,
--    그 밖에는 관전 로그(spectator_log, 경기를 본 사람이 본 것)만 준다. 선수 자신의 화면은 지금처럼 함수의 view 가 준다.
-- 2. 결과 반영 전 확인. 배틀의 두 선수가 지금 그 경기의 두 선수인지 본다. 운영진이 앞 경기를 바꿔 같은 자리에 다른 선수가 서면
--    예전 배틀의 승자를 새 대진에 넣지 않는다(players_changed).
-- 3. 무효. 더는 그 경기의 배틀일 수 없는 열린 배틀(선수가 바뀐 경기, 버려진 배틀)을 닫는다. 기다리던 배틀은 지우고(남길 것이 없다),
--    진행 중이던 배틀은 무승부, ended_by = 'void' 로 끝내 관전 로그를 리플레이로 남긴다. 대진표에는 아무것도 넣지 않는다.
--    선수가 바뀐 경기는 그 경기의 선수가 자리에 앉을 때 저절로, 버려진 배틀은 운영진이 battle_void 로 닫는다.
-- 4. 두 번째 선수의 시작을 한 트랜잭션으로(battle_start_official). 전에는 시작과 출전 기록이 두 번에 나뉘어, 사이에서 실패하면 영영 막힌 배틀이 남을 수 있었다.
-- 5. 챔피언스 선발전: 본선 진출 인원이 찬 뒤의 경기는 배틀로 열지 않는다(어차피 결과를 넣을 수 없다).
-- 6. 끝난 공식 배틀은 지울 수 없다. 공식 경기의 리플레이는 영구히 남는다.

begin;

-- ===== 1. 공개 전 파티 =====
revoke select on table public.battles from anon, authenticated;
grant select (id, regulation, format_id, engine, status, p1_name, p2_name, turn, winner, ended_by, spectator_log, version,
              created_at, updated_at, kind, event_id, source_node_key, p1_entry_id, p2_entry_id, p1_player_id, p2_player_id,
              applied_at, apply_error)
  on table public.battles to anon, authenticated;

create or replace function public.battle_full_log(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_battle public.battles%rowtype;
  v_revealed boolean;
begin
  select * into v_battle from public.battles b where b.id = p_id;
  if not found or v_battle.status <> 'ended' then return null; end if;
  v_revealed := v_battle.kind = 'friendly'
    or exists (select 1 from ypl_schema_validation.events e where e.id = v_battle.event_id and e.team_revealed_at is not null)
    or (select ypl_schema_validation.is_ypl_admin());
  if v_revealed then
    return jsonb_build_object('log', v_battle.log, 'input_log', v_battle.input_log, 'full', true);
  end if;
  return jsonb_build_object('log', v_battle.spectator_log, 'input_log', null, 'full', false);
end;
$$;
revoke all on function public.battle_full_log(text) from public;
grant execute on function public.battle_full_log(text) to anon, authenticated, service_role;

-- ===== 3. 무효 =====
alter table public.battles drop constraint if exists battles_ended_by_check;
alter table public.battles add constraint battles_ended_by_check check (ended_by in ('battle', 'forfeit', 'void'));

-- 안쪽 함수: 확인 없이 닫는다. 아무에게도 주지 않고 아래 두 함수만 부른다.
create or replace function public.battle_void_now(p_id text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_battle public.battles%rowtype;
begin
  select * into v_battle from public.battles b where b.id = p_id for update;
  if not found or v_battle.kind <> 'official' then return 'not_official'; end if;
  if v_battle.status = 'waiting' then
    delete from public.battles b where b.id = p_id;
    return 'deleted';
  end if;
  if v_battle.status <> 'active' then return 'ended'; end if;
  update public.battles b
     set status = 'ended', winner = 'tie', ended_by = 'void', log = b.spectator_log, input_log = '',
         apply_error = left(p_reason, 300), version = b.version + 1, updated_at = now()
   where b.id = p_id;
  update public.battle_secrets s set pending = '{}'::jsonb where s.battle_id = p_id;
  return 'void';
end;
$$;
revoke all on function public.battle_void_now(text, text) from public, anon, authenticated, service_role;

-- 운영진이 버려진 배틀을 닫는다(대진표의 결과 입력). 승자는 운영진이 대진표에서 따로 정한다.
create or replace function public.battle_void(p_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select ypl_schema_validation.is_ypl_admin()) then
    raise exception using errcode = '42501', message = '운영진만 배틀을 무효로 할 수 있습니다.';
  end if;
  return public.battle_void_now(p_id, '운영진이 배틀을 무효로 했습니다.');
end;
$$;
revoke all on function public.battle_void(text) from public, anon;
grant execute on function public.battle_void(text) to authenticated;

-- ===== 6. 끝난 공식 배틀은 지우지 않는다 =====
create or replace function public.battles_keep_official()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.kind = 'official' and old.status = 'ended' then
    raise exception using errcode = 'P0001', message = '끝난 공식 배틀은 리플레이로 남기므로 지울 수 없습니다.';
  end if;
  return old;
end;
$$;
drop trigger if exists battles_keep_official on public.battles;
create trigger battles_keep_official before delete on public.battles for each row execute function public.battles_keep_official();

-- ===== 3, 5. 공식 경기의 자리 (battle_links.sql 의 같은 함수를 바꾼다) =====
create or replace function public.battle_official_seat(p_event_id uuid, p_source_node_key text, p_side text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event ypl_schema_validation.events%rowtype;
  v_match ypl_schema_validation.matches%rowtype;
  v_seat record;
  v_status text;
  v_submission uuid;
  v_team jsonb;
  v_alive integer;
  v_stale record;
begin
  select * into v_event from ypl_schema_validation.events e where e.id = p_event_id;
  if not found then return jsonb_build_object('status', 'no_event'); end if;
  if v_event.status <> 'running' or v_event.record_applied_at is not null or v_event.is_team_event then
    return jsonb_build_object('status', 'not_running');
  end if;
  select * into v_match from ypl_schema_validation.matches m
   where m.event_id = p_event_id and m.source = 'normalized_bracket_runtime' and m.match_kind = 'bracket'
     and m.source_node_key = p_source_node_key;
  if not found or v_match.entry_a_id is null or v_match.entry_b_id is null then
    return jsonb_build_object('status', 'not_formed');
  end if;
  if v_match.winner_entry_id is not null then return jsonb_build_object('status', 'decided'); end if;

  -- 선발전의 본선 진출 인원이 이미 찼으면 이 경기의 결과는 넣을 수 없다(championship_qualifier_match_stop_guard 와 같은 셈)
  if v_event.event_type = 'champions' and v_event.championship_phase = 'qualifier' then
    with entrants as (
      select s.entry_id from ypl_schema_validation.bracket_entry_slots s
        join ypl_schema_validation.bracket_runtimes br on br.id = s.bracket_runtime_id
       where br.event_id = p_event_id and br.topology_kind = 'double_elimination'
    ), losses as (
      select case when m.winner_entry_id = m.entry_a_id then m.entry_b_id else m.entry_a_id end as entry_id, count(*)::integer as loss_count
        from ypl_schema_validation.matches m
       where m.event_id = p_event_id and m.source = 'normalized_bracket_runtime' and m.match_kind = 'bracket'
         and m.winner_entry_id is not null and m.winner_entry_id in (m.entry_a_id, m.entry_b_id)
       group by 1
    )
    select count(*)::integer into v_alive from entrants e left join losses l on l.entry_id = e.entry_id where coalesce(l.loss_count, 0) < 2;
    if v_alive > 0 and v_alive <= v_event.qualification_slots then return jsonb_build_object('status', 'qualifier_done'); end if;
  end if;

  if p_side not in ('a', 'b') then return jsonb_build_object('status', 'not_player'); end if;
  select p.entry_id, p.player_id, p.registration_id, r.final_submission_id, r.registration_name, p_side as side
    into v_seat
    from ypl_schema_validation.entry_participants p
    join ypl_schema_validation.event_registrations r on r.id = p.registration_id
   where p.event_id = p_event_id and p.entry_id = case p_side when 'a' then v_match.entry_a_id else v_match.entry_b_id end;
  if not found then return jsonb_build_object('status', 'not_player'); end if;

  v_status := public.visitor_pin_check('submission', v_seat.registration_id::text, p_pin);
  if v_status <> 'ok' then return jsonb_build_object('status', v_status); end if;

  -- 이 자리에 열린 배틀이 지금 경기의 선수들 것이 아니면(운영진이 앞 경기를 바꿨다) 닫는다. 그 배틀은 결과를 넣을 수 없다.
  for v_stale in
    select b.id from public.battles b
     where b.kind = 'official' and b.event_id = p_event_id and b.source_node_key = p_source_node_key and b.status in ('waiting', 'active')
       and not (b.p1_entry_id in (v_match.entry_a_id, v_match.entry_b_id)
                and (b.p2_entry_id is null or b.p2_entry_id in (v_match.entry_a_id, v_match.entry_b_id)))
  loop
    perform public.battle_void_now(v_stale.id, '대진이 바뀌어 이 경기의 배틀이 아니게 되었습니다.');
  end loop;

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

-- ===== 4. 두 번째 선수가 들어와 시작한다: 공개 행, 출전, 엔진 상태를 한 번에 =====
create or replace function public.battle_start_official(
  p_id text, p_version integer, p_p2_name text, p_turn integer, p_spectator_log text,
  p_p2_token_hash text, p_state jsonb, p_p2_entry_id uuid, p_p2_player_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.battles b
     set status = 'active', p2_name = btrim(p_p2_name), turn = p_turn, spectator_log = p_spectator_log,
         p2_entry_id = p_p2_entry_id, p2_player_id = p_p2_player_id, version = b.version + 1, updated_at = now()
   where b.id = p_id and b.version = p_version and b.status = 'waiting' and b.kind = 'official';
  if not found then return false; end if;
  update public.battle_secrets s set p2_token_hash = p_p2_token_hash, state = p_state, pending = '{}'::jsonb where s.battle_id = p_id;
  return true;
end;
$$;

-- ===== 2. 결과 반영 (battle_links.sql 의 같은 함수를 바꾼다): 쓰기 전에 그 경기의 두 선수가 배틀의 두 선수인지 본다 =====
create or replace function public.battle_apply_result(
  p_battle_id text, p_expected_stamp text, p_mode text, p_runtime_id uuid,
  p_updates jsonb, p_inserts jsonb, p_delete_ids uuid[]
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_battle public.battles%rowtype;
  v_event ypl_schema_validation.events%rowtype;
  v_winner uuid;
  v_update jsonb;
  v_row ypl_schema_validation.matches%rowtype;
  v_target ypl_schema_validation.matches%rowtype;
  v_now timestamptz := now();
  v_count integer;
begin
  select * into v_battle from public.battles b where b.id = p_battle_id for update;
  if not found or v_battle.kind <> 'official' then return 'not_official'; end if;
  if v_battle.applied_at is not null then return 'already'; end if;
  if v_battle.status <> 'ended' or v_battle.winner not in ('p1', 'p2') then return 'not_ended'; end if;
  v_winner := case v_battle.winner when 'p1' then v_battle.p1_entry_id else v_battle.p2_entry_id end;
  if v_winner is null or v_battle.p1_entry_id is null or v_battle.p2_entry_id is null then return 'no_entry'; end if;

  -- the winner RPC and the operator's sync lock the Event first; so does this
  select * into v_event from ypl_schema_validation.events e where e.id = v_battle.event_id for update;
  if not found or v_event.status <> 'running' or v_event.record_applied_at is not null or v_event.is_team_event then
    return 'not_running';
  end if;
  -- the match must still be this battle's match: undecided, and between the same two entries
  select * into v_target from ypl_schema_validation.matches m
   where m.event_id = v_event.id and m.source = 'normalized_bracket_runtime' and m.match_kind = 'bracket'
     and m.source_node_key = v_battle.source_node_key;
  if not found then return 'players_changed'; end if;
  if v_target.winner_entry_id is not null then return 'decided'; end if;
  if not ((v_target.entry_a_id = v_battle.p1_entry_id and v_target.entry_b_id = v_battle.p2_entry_id)
       or (v_target.entry_a_id = v_battle.p2_entry_id and v_target.entry_b_id = v_battle.p1_entry_id)) then
    return 'players_changed';
  end if;
  if public.battle_match_stamp(v_event.id) is distinct from p_expected_stamp then return 'stale'; end if;

  if p_mode = 'single' then
    perform 1 from ypl_schema_validation.set_normalized_single_bracket_winner(p_runtime_id, v_event.id, v_battle.source_node_key, v_winner);
  elsif p_mode = 'double' then
    for v_update in select * from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb)) loop
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
    insert into ypl_schema_validation.matches (event_id, source, match_kind, parent_match_id, round_number, stage_label, sequence_no,
           entry_a_id, entry_b_id, player_a_id, player_b_id, winner_entry_id, winner_player_id, resolution, played_at, source_node_key, updated_at)
    select v_event.id, 'normalized_bracket_runtime', r.match_kind, r.parent_match_id, r.round_number, r.stage_label, r.sequence_no,
           r.entry_a_id, r.entry_b_id, r.player_a_id, r.player_b_id, r.winner_entry_id, r.winner_player_id, r.resolution, r.played_at, r.source_node_key, v_now
      from jsonb_populate_recordset(null::ypl_schema_validation.matches, coalesce(p_inserts, '[]'::jsonb)) r;
    delete from ypl_schema_validation.matches m
     where m.event_id = v_event.id and m.source = 'normalized_bracket_runtime' and m.id = any (coalesce(p_delete_ids, '{}'::uuid[]));
  else
    return 'bad_mode';
  end if;

  -- the battle's match must now carry the battle's winner; anything else rolls the whole write back
  perform 1 from ypl_schema_validation.matches m
   where m.event_id = v_event.id and m.source = 'normalized_bracket_runtime' and m.source_node_key = v_battle.source_node_key
     and m.winner_entry_id = v_winner;
  if not found then raise exception using errcode = 'P0001', message = 'the bracket did not take the battle winner'; end if;

  update public.battles b set applied_at = v_now, apply_error = null where b.id = p_battle_id;
  return 'ok';
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.battle_official_seat(uuid, text, text, text)',
    'public.battle_start_official(text, integer, text, integer, text, text, jsonb, uuid, uuid)',
    'public.battle_apply_result(text, text, text, uuid, jsonb, jsonb, uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
