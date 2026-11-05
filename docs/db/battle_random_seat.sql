-- 랜덤 배틀 대회의 공식 좌석 (운영위 피드백, 2026-11-05). battle_links.sql 다음에 실행한다. 다시 실행해도 안전하다.
--
-- 대회의 경기 진행 방식이 랜덤 배틀(competition_settings.matchPlay = 'random')이면, 선수는 파티를 제출하지 않아도 앉는다.
-- 배틀 함수가 그 자리의 랜덤 파티를 뽑기 때문이다. 나머지는 그대로다: 진행 중인 개인전, 정해진 두 선수, 제출 비밀번호
-- (아직 없으면 신청 수정에서 숫자 4자리를 정하면 그것이 비밀번호가 된다), 바뀐 대진의 배틀 닫기.
-- 다른 진행 방식(사이트 배틀)의 대회는 예전처럼 마지막으로 제출한 공식 파티로 앉는다.

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

  -- a random battle event: no party is needed, the battle function draws one for this seat
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
