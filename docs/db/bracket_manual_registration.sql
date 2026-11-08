-- Operator additions before the draw, including a completed Rookie champion
-- entering the still-open Master event of the same intake. Never move history.
begin;
create or replace function ypl_schema_validation.is_completed_rookie_champion(p_event_id uuid,p_player_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from ypl_schema_validation.events e
    join ypl_schema_validation.entry_participants ep on ep.event_id=e.id
    join ypl_schema_validation.results r on r.event_id=e.id and r.entry_id=ep.entry_id
    where e.id=p_event_id and e.division='rookie' and not e.is_team_event
      and e.status='completed' and e.record_applied_at is not null
      and ep.player_id=p_player_id and r.placement_code='champion');
$$;
revoke all on function ypl_schema_validation.is_completed_rookie_champion(uuid,uuid) from public;
grant execute on function ypl_schema_validation.is_completed_rookie_champion(uuid,uuid) to anon,authenticated;

create or replace function ypl_schema_validation.guard_league_intake_registration()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare g ypl_schema_validation.league_intakes%rowtype; pid uuid; player_count integer; target uuid;
begin
  if tg_op='UPDATE' and new.event_id=old.event_id and new.player_id is not distinct from old.player_id
     and new.registration_name=old.registration_name then return new; end if;
  select * into g from ypl_schema_validation.league_intakes where master_event_id=new.event_id or rookie_event_id=new.event_id;
  if not found then
    if tg_op='INSERT' then
      -- Serialize only a pristine legacy-to-unified conversion. Ordinary
      -- grouped admission uses the intake lock below, not an Event-row lock.
      perform pg_advisory_xact_lock(hashtextextended('league-intake-event:' || new.event_id::text,0));
      select * into g from ypl_schema_validation.league_intakes where master_event_id=new.event_id or rookie_event_id=new.event_id;
    end if;
  end if;
  if g.id is null then
    if tg_op='UPDATE' and exists(select 1 from ypl_schema_validation.league_intakes where master_event_id=old.event_id or rookie_event_id=old.event_id) then
      raise exception '통합 접수 신청을 다른 대회로 이동할 수 없습니다.';
    end if;
    return new;
  end if;
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('league-intake:' || g.announcement_id, 0));
  elsif new.event_id is distinct from old.event_id or new.registration_name is distinct from old.registration_name
      or (old.player_id is not null and new.player_id is distinct from old.player_id) then
    raise exception '통합 접수 신청의 대회와 확정된 선수 소유권은 변경할 수 없습니다.';
  end if;
  new.registration_name := btrim(new.registration_name);
  select count(*), (array_agg(id))[1] into player_count,pid from ypl_schema_validation.players where display_name=new.registration_name;
  if player_count > 1 then raise exception '동명이인이 있어 운영진의 선수 확인이 필요합니다.'; end if;
  if new.player_id is not null and new.player_id is distinct from pid then raise exception '신청자와 선수 ID가 일치하지 않습니다.'; end if;
  new.player_id := pid;
  target := case when ypl_schema_validation.has_individual_master_eligibility(pid) then g.master_event_id else g.rookie_event_id end;
  if tg_op='INSERT' and new.registration_source='application' then
    new.event_id := target;
    if not exists(select 1 from ypl_schema_validation.events where id=target and status='open' and record_applied_at is null) then
      raise exception '현재 해당 리그에서 참가 신청을 받고 있지 않습니다.';
    end if;
  elsif new.event_id <> target then
    raise exception '선수의 개인 리그 자격과 신청 대회가 일치하지 않습니다.';
  end if;
  -- Initial NULL -> exact Player resolution is allowed even after party
  -- submission: the Registration/Submission IDs and Event remain unchanged.
  if exists(select 1 from ypl_schema_validation.event_registrations r
    where r.event_id in (g.master_event_id,g.rookie_event_id) and r.id<>new.id
      and (r.registration_name=new.registration_name or (pid is not null and r.player_id=pid))
      and not (new.event_id=g.master_event_id and r.event_id=g.rookie_event_id
        and ypl_schema_validation.is_completed_rookie_champion(g.rookie_event_id,pid))) then
    raise exception using errcode='23505',message='이미 이 공지에 참가 신청한 선수입니다.';
  end if;
  return new;
end $$;

create or replace function ypl_schema_validation.add_bracket_manual_registration(p_event_id uuid,p_name text)
returns ypl_schema_validation.event_registrations
language plpgsql security invoker set search_path='' as $$
declare e ypl_schema_validation.events%rowtype; g ypl_schema_validation.league_intakes%rowtype;
  r ypl_schema_validation.event_registrations%rowtype; pid uuid; pname text;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if nullif(btrim(p_name),'') is null then raise exception '참가자 이름을 입력해 주세요.'; end if;
  select * into g from ypl_schema_validation.league_intakes where master_event_id=p_event_id or rookie_event_id=p_event_id;
  if found then perform pg_advisory_xact_lock(hashtextextended('league-intake:'||g.announcement_id,0)); end if;
  select * into e from ypl_schema_validation.events where id=p_event_id for update;
  if not found or e.status not in ('open','running') or e.record_applied_at is not null then raise exception '참가자를 추가할 수 없는 대회입니다.'; end if;
  if e.is_team_event or e.championship_phase is not null then raise exception '팀전과 챔피언스는 해당 참가자 확정 절차를 사용해 주세요.'; end if;
  if exists(select 1 from ypl_schema_validation.bracket_runtimes where event_id=e.id) then raise exception '이미 생성된 대진표에는 참가자를 추가할 수 없습니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bracket-player:'||lower(regexp_replace(btrim(p_name),'\s','','g')),0));
  select id,display_name into pid,pname from ypl_schema_validation.players
    where lower(regexp_replace(display_name,'\s','','g'))=lower(regexp_replace(btrim(p_name),'\s','','g'));
  if pid is null then
    insert into ypl_schema_validation.players(display_name,status) values(btrim(p_name),'active') returning id,display_name into pid,pname;
  end if;
  select * into r from ypl_schema_validation.event_registrations where event_id=e.id and player_id=pid;
  if found then return r; end if;
  insert into ypl_schema_validation.event_registrations(event_id,player_id,registration_name,registration_source,registration_data)
    values(e.id,pid,pname,'manual','{"source":"bracket_operator"}') returning * into r;
  return r;
end $$;
revoke all on function ypl_schema_validation.add_bracket_manual_registration(uuid,text) from public,anon,service_role;
grant execute on function ypl_schema_validation.add_bracket_manual_registration(uuid,text) to authenticated;
commit;
