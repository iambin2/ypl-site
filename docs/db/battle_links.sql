-- 배틀 2단계: 대기 취소, 공식 경기 배틀, 배틀 결과의 대진표 자동 반영. battles.sql 다음에 한 번 실행한다. 다시 실행해도 안전하다.
-- 모든 함수는 service_role(배틀 함수)만 부른다. 방문자와 운영진 화면은 이 함수들을 직접 부르지 않는다.
-- 다음 파일: battle_integration.sql 이 battle_official_seat 과 battle_apply_result 를 바꾸고, 공개 전 파티 보호와 무효를 더한다.
--
-- 지키는 것
--   - 공식 경기의 자리는 그 경기 선수의 신청 이름과 제출 비밀번호(visitor_pins, 파티 제출과 같은 것)로만 앉는다.
--   - 파티는 그 선수가 공식으로 제출한 최신 파티다. 팀 빌더의 임시 팀은 공식 경기에 쓰지 못한다.
--   - 결과는 운영진이 손으로 넣는 것과 같은 길로 들어간다: 싱글은 기존 승자 RPC, 더블은 같은 계산(bracketWinnerPlan.js)의 결과를
--     대회를 잠근 한 트랜잭션으로 쓴다. 그사이 대진이 바뀌었으면 stale 을 돌려주고 함수가 다시 계산한다.
--   - 기록에 반영된 대회, 진행 중이 아닌 대회, 팀전, 이미 승자가 있는 경기는 건드리지 않는다(fail closed).
--   - 공식 기록의 표(ypl_schema_validation)에서 battles 로 외래 키를 걸지 않는다. 대회 삭제 점검과 엮이지 않게 한다.

begin;

-- 1. 배틀이 어떤 경기의 배틀인지
alter table public.battles add column if not exists kind text not null default 'friendly';
alter table public.battles add column if not exists event_id uuid;
alter table public.battles add column if not exists source_node_key text;
alter table public.battles add column if not exists p1_entry_id uuid;
alter table public.battles add column if not exists p2_entry_id uuid;
alter table public.battles add column if not exists p1_player_id uuid;
alter table public.battles add column if not exists p2_player_id uuid;
alter table public.battles add column if not exists applied_at timestamptz;
alter table public.battles add column if not exists apply_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'battles_kind' and conrelid = 'public.battles'::regclass) then
    alter table public.battles add constraint battles_kind check (
      kind in ('friendly', 'official')
      and (kind = 'friendly') = (event_id is null and source_node_key is null)
    );
  end if;
end;
$$;
-- 한 경기에 열린 배틀은 하나뿐이다(끝난 배틀은 여럿 남아도 된다)
create unique index if not exists battles_open_official_match
  on public.battles (event_id, source_node_key) where kind = 'official' and status in ('waiting', 'active');
create index if not exists battles_event_idx on public.battles (event_id) where event_id is not null;
create index if not exists battles_players_idx on public.battles (p1_player_id, p2_player_id) where kind = 'official';

-- 2. 대기 취소. 아직 상대가 들어오지 않은 배틀만 지운다. 남길 기록이 없다.
create or replace function public.battle_cancel(p_id text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with gone as (delete from public.battles b where b.id = p_id and b.status = 'waiting' returning 1)
  select exists (select 1 from gone);
$$;

-- 3. 공식 경기의 자리. 경기의 한쪽(a 또는 b) 선수의 제출 비밀번호가 맞으면 그 선수의 출전, 선수, 신청 이름, 최신 공식 파티를 돌려준다.
-- 비밀번호가 틀리면 visitor_pin_check 의 값(wrong_pin, locked, no_pin)을 status 로 돌려준다(예외를 던지면 실패 횟수가 되돌아간다).
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

  if p_side not in ('a', 'b') then return jsonb_build_object('status', 'not_player'); end if;
  select p.entry_id, p.player_id, p.registration_id, r.final_submission_id, r.registration_name, p_side as side
    into v_seat
    from ypl_schema_validation.entry_participants p
    join ypl_schema_validation.event_registrations r on r.id = p.registration_id
   where p.event_id = p_event_id and p.entry_id = case p_side when 'a' then v_match.entry_a_id else v_match.entry_b_id end;
  if not found then return jsonb_build_object('status', 'not_player'); end if;

  v_status := public.visitor_pin_check('submission', v_seat.registration_id::text, p_pin);
  if v_status <> 'ok' then return jsonb_build_object('status', v_status); end if;

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

-- 4. 공식 배틀을 연다(첫 선수가 p1). 열린 배틀이 이미 있으면 unique 인덱스가 막는다.
create or replace function public.battle_create_official(
  p_id text, p_regulation text, p_format_id text, p_engine text, p_p1_name text, p_p1_token_hash text, p_p1_team jsonb,
  p_event_id uuid, p_source_node_key text, p_p1_entry_id uuid, p_p1_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.battles (id, regulation, format_id, engine, p1_name, kind, event_id, source_node_key, p1_entry_id, p1_player_id)
  values (p_id, p_regulation, p_format_id, p_engine, btrim(p_p1_name), 'official', p_event_id, p_source_node_key, p_p1_entry_id, p_p1_player_id);
  insert into public.battle_secrets (battle_id, p1_token_hash, p1_team) values (p_id, p_p1_token_hash, p_p1_team);
end;
$$;

-- 5. 두 번째 선수의 출전과 선수, 그리고 자리를 다시 잡을 때의 새 토큰
create or replace function public.battle_set_seat(p_id text, p_side text, p_entry_id uuid, p_player_id uuid, p_token_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_side = 'p1' then
    update public.battles b set p1_entry_id = coalesce(p_entry_id, b.p1_entry_id), p1_player_id = coalesce(p_player_id, b.p1_player_id) where b.id = p_id;
    update public.battle_secrets s set p1_token_hash = coalesce(p_token_hash, s.p1_token_hash) where s.battle_id = p_id;
  elsif p_side = 'p2' then
    update public.battles b set p2_entry_id = coalesce(p_entry_id, b.p2_entry_id), p2_player_id = coalesce(p_player_id, b.p2_player_id) where b.id = p_id;
    update public.battle_secrets s set p2_token_hash = coalesce(p_token_hash, s.p2_token_hash) where s.battle_id = p_id;
  else
    raise exception using errcode = 'P0001', message = 'side must be p1 or p2';
  end if;
end;
$$;

-- 6. 대진 계산에 필요한 사실. 운영진 화면이 읽는 것과 같은 표를 통째로 돌려주고, 경기들의 지문(stamp)을 붙인다.
create or replace function public.battle_bracket_facts(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_runtime ypl_schema_validation.bracket_runtimes%rowtype;
  v_count integer;
begin
  select count(*) into v_count from ypl_schema_validation.bracket_runtimes r where r.event_id = p_event_id;
  if v_count <> 1 then return jsonb_build_object('status', 'no_runtime'); end if;
  select * into v_runtime from ypl_schema_validation.bracket_runtimes r where r.event_id = p_event_id;
  return jsonb_build_object(
    'status', 'ok',
    'event', (select to_jsonb(e) from ypl_schema_validation.events e where e.id = p_event_id),
    'runtime', to_jsonb(v_runtime),
    'slots', coalesce((select jsonb_agg(to_jsonb(s) order by s.slot_no) from ypl_schema_validation.bracket_entry_slots s where s.bracket_runtime_id = v_runtime.id), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(to_jsonb(x)) from ypl_schema_validation.entries x where x.event_id = p_event_id), '[]'::jsonb),
    'participants', coalesce((select jsonb_agg(to_jsonb(x)) from ypl_schema_validation.entry_participants x where x.event_id = p_event_id), '[]'::jsonb),
    'matches', coalesce((select jsonb_agg(to_jsonb(x)) from ypl_schema_validation.matches x where x.event_id = p_event_id), '[]'::jsonb),
    'registrations', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'event_id', x.event_id, 'registration_name', x.registration_name)) from ypl_schema_validation.event_registrations x where x.event_id = p_event_id), '[]'::jsonb),
    'stamp', public.battle_match_stamp(p_event_id)
  );
end;
$$;

create or replace function public.battle_match_stamp(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5(coalesce(string_agg(concat_ws('|', m.id, m.source_node_key, m.entry_a_id, m.entry_b_id, m.winner_entry_id, m.updated_at), ',' order by m.id), ''))
    from ypl_schema_validation.matches m where m.event_id = p_event_id;
$$;

-- 7. 결과 반영. 함수가 계산한 계획을 대회를 잠근 채 한 번에 쓴다. ok, stale, 또는 이유를 돌려준다.
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
  v_now timestamptz := now();
  v_count integer;
begin
  select * into v_battle from public.battles b where b.id = p_battle_id for update;
  if not found or v_battle.kind <> 'official' then return 'not_official'; end if;
  if v_battle.applied_at is not null then return 'already'; end if;
  if v_battle.status <> 'ended' or v_battle.winner not in ('p1', 'p2') then return 'not_ended'; end if;
  v_winner := case v_battle.winner when 'p1' then v_battle.p1_entry_id else v_battle.p2_entry_id end;
  if v_winner is null then return 'no_entry'; end if;

  -- the winner RPC and the operator's sync lock the Event first; so does this
  select * into v_event from ypl_schema_validation.events e where e.id = v_battle.event_id for update;
  if not found or v_event.status <> 'running' or v_event.record_applied_at is not null or v_event.is_team_event then
    return 'not_running';
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

-- 8. 반영하지 못한 이유를 남긴다. 운영진은 대진표에서 그 이유를 보고 손으로 넣는다.
create or replace function public.battle_mark_apply_error(p_battle_id text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.battles b set apply_error = left(p_error, 300) where b.id = p_battle_id and b.applied_at is null;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.battle_cancel(text)',
    'public.battle_official_seat(uuid, text, text, text)',
    'public.battle_create_official(text, text, text, text, text, text, jsonb, uuid, text, uuid, uuid)',
    'public.battle_set_seat(text, text, uuid, uuid, text)',
    'public.battle_bracket_facts(uuid)',
    'public.battle_match_stamp(uuid)',
    'public.battle_apply_result(text, text, text, uuid, jsonb, jsonb, uuid[])',
    'public.battle_mark_apply_error(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';
