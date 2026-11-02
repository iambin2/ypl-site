-- Unified ordinary intake. Apply before deploying the matching frontend.
-- Additive: historical Events, submissions and records are not migrated.
begin;

create table if not exists ypl_schema_validation.league_intakes (
  id uuid primary key default gen_random_uuid(),
  announcement_id text not null unique check (btrim(announcement_id) <> ''),
  master_event_id uuid not null unique references ypl_schema_validation.events(id) on delete restrict,
  rookie_event_id uuid not null unique references ypl_schema_validation.events(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (master_event_id <> rookie_event_id)
);
alter table ypl_schema_validation.league_intakes enable row level security;
revoke all on ypl_schema_validation.league_intakes from public, anon, authenticated;
grant select on ypl_schema_validation.league_intakes to anon, authenticated;
grant insert, update on ypl_schema_validation.league_intakes to authenticated;
drop policy if exists public_read on ypl_schema_validation.league_intakes;
create policy public_read on ypl_schema_validation.league_intakes for select to anon, authenticated using (true);
drop policy if exists admin_write on ypl_schema_validation.league_intakes;
create policy admin_write on ypl_schema_validation.league_intakes for all to authenticated
  using ((select ypl_schema_validation.is_ypl_admin())) with check ((select ypl_schema_validation.is_ypl_admin()));

-- Public read-only fact. Team participation and team titles never qualify.
-- Historical imported Events have completed status but no record_applied_at.
create or replace function ypl_schema_validation.has_individual_master_eligibility(p_player_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from ypl_schema_validation.entry_participants ep
    join ypl_schema_validation.entries en on en.id = ep.entry_id and en.event_id = ep.event_id
    join ypl_schema_validation.events e on e.id = ep.event_id
    where ep.player_id = p_player_id and en.entry_type = 'individual' and en.status = 'active'
      and e.status = 'completed' and not e.is_team_event and e.event_type <> 'champions'
      and (
        (e.division = 'master' and e.event_type <> 'light')
        or ((e.division in ('rookie', 'light') or e.event_type = 'light') and exists (
          select 1 from ypl_schema_validation.results r
          where r.event_id = e.id and r.entry_id = en.id and r.placement_code = 'champion'
        ))
      )
  )
$$;
revoke all on function ypl_schema_validation.has_individual_master_eligibility(uuid) from public;
grant execute on function ypl_schema_validation.has_individual_master_eligibility(uuid) to anon, authenticated;

create or replace function ypl_schema_validation.league_intake_has_downstream(p_event_ids uuid[], p_ignore_registrations boolean default false)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (not p_ignore_registrations and exists(select 1 from ypl_schema_validation.event_registrations where event_id = any(p_event_ids)))
    or exists(select 1 from ypl_schema_validation.registration_submissions s join ypl_schema_validation.event_registrations r on r.id=s.registration_id where r.event_id = any(p_event_ids))
    or exists(select 1 from ypl_schema_validation.entries where event_id = any(p_event_ids))
    or exists(select 1 from ypl_schema_validation.entry_participants where event_id = any(p_event_ids))
    or exists(select 1 from ypl_schema_validation.bracket_runtimes where event_id = any(p_event_ids))
    or exists(select 1 from ypl_schema_validation.matches where event_id = any(p_event_ids))
    or exists(select 1 from ypl_schema_validation.results where event_id = any(p_event_ids))
    or exists(select 1 from ypl_schema_validation.ranking_awards where event_id = any(p_event_ids))
    or exists(select 1 from ypl_schema_validation.hall_of_fame_entries where event_id = any(p_event_ids))
    or exists(select 1 from ypl_schema_validation.events where id = any(p_event_ids) and (record_applied_at is not null or team_revealed_at is not null));
$$;
revoke all on function ypl_schema_validation.league_intake_has_downstream(uuid[],boolean) from public, anon, service_role;
grant execute on function ypl_schema_validation.league_intake_has_downstream(uuid[],boolean) to authenticated;

create or replace function ypl_schema_validation.save_league_intake(
  p_announcement_id text, p_season_id uuid, p_existing_master_event_id uuid, p_settings jsonb
)
returns ypl_schema_validation.league_intakes
language plpgsql security invoker set search_path = '' as $$
declare
  g ypl_schema_validation.league_intakes%rowtype;
  old_master ypl_schema_validation.events%rowtype;
  old_rookie ypl_schema_validation.events%rowtype;
  mid uuid; rid uuid; gid uuid; d text; eid uuid; n integer; subtitle text; edition uuid;
  common jsonb; current_event ypl_schema_validation.events%rowtype;
  registration ypl_schema_validation.event_registrations%rowtype;
  resolved_player uuid; player_count integer; target uuid;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  if nullif(btrim(p_announcement_id), '') is null or p_season_id is null
     or p_settings is null or jsonb_typeof(p_settings) <> 'object' then raise exception '공지와 시즌 설정이 필요합니다.'; end if;
  if coalesce(p_settings->>'battle_format','') not in ('singles','doubles')
     or coalesce(p_settings->>'competition_format','') not in ('single_elimination','double_elimination') then
    raise exception '통합 접수의 배틀 형식과 토너먼트 방식을 선택해 주세요.';
  end if;
  subtitle := btrim(coalesce(p_settings->>'subtitle',''));
  if subtitle ~ '[|·•]' or subtitle ~ '(마스터|루키)리그' then raise exception '부제의 구분자와 리그 표기를 정리해 주세요.'; end if;
  -- Serialize pair creation and registration admission. No client-only uniqueness.
  perform pg_advisory_xact_lock(hashtextextended('league-intake:' || p_announcement_id, 0));
  select * into g from ypl_schema_validation.league_intakes where announcement_id = p_announcement_id for update;
  if found then
    mid := g.master_event_id; rid := g.rookie_event_id; gid := g.id;
    if p_existing_master_event_id is not null and p_existing_master_event_id <> mid then raise exception '기존 공지와 대회 연결이 일치하지 않습니다.'; end if;
    select * into old_master from ypl_schema_validation.events where id = mid for update;
    select * into old_rookie from ypl_schema_validation.events where id = rid for update;
    if old_master.season_id is distinct from old_rookie.season_id or old_master.division <> 'master' or old_rookie.division <> 'rookie'
       or old_master.is_team_event or old_rookie.is_team_event or old_master.event_type <> 'pokecup' or old_rookie.event_type <> 'pokecup' then
      raise exception '통합 접수의 리그별 대회 연결이 올바르지 않습니다.';
    end if;
    p_season_id := old_master.season_id;
  else
    gid := gen_random_uuid(); rid := gen_random_uuid(); mid := coalesce(p_existing_master_event_id, gen_random_uuid());
    if p_existing_master_event_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('league-intake-event:' || mid::text,0));
      select * into old_master from ypl_schema_validation.events where id = mid for update;
      if not found or old_master.event_type <> 'pokecup' or old_master.division <> 'master' or old_master.is_team_event
         or old_master.status <> 'open' or old_master.record_applied_at is not null
         or old_master.registration_settings->>'announcementId' is distinct from p_announcement_id then
        raise exception '열린 개인 마스터 공지만 통합 접수로 전환할 수 있습니다.';
      end if;
      if ypl_schema_validation.league_intake_has_downstream(array[mid],true) then raise exception '기존 제출이나 참가, 대진표가 있어 통합 접수로 자동 전환할 수 없습니다.'; end if;
      if exists(select 1 from ypl_schema_validation.event_registrations where event_id=mid and final_submission_id is not null) then
        raise exception '공식 파티가 고정된 신청은 이동할 수 없습니다.';
      end if;
      p_season_id := old_master.season_id;
    end if;
  end if;
  if old_master.id is not null and ypl_schema_validation.league_intake_has_downstream(array[mid,rid]) then
    foreach current_event in array array[old_master,old_rookie] loop
      if current_event.id is null then continue; end if;
      if current_event.battle_format is distinct from p_settings->>'battle_format'
         or current_event.competition_format is distinct from p_settings->>'competition_format'
         or current_event.regulation_id is distinct from p_settings->>'regulation_id'
         or current_event.cup_rule_id is distinct from p_settings->>'cup_rule_id'
         or current_event.cup_rule_settings is distinct from coalesce(p_settings->'cup_rule_settings','{}'::jsonb)
         or coalesce(current_event.competition_settings->'titleAward','null'::jsonb) is distinct from coalesce(p_settings->'title_award','null'::jsonb)
         or coalesce(current_event.competition_settings->>'recordRuleLabel','') is distinct from coalesce(p_settings->>'record_rule_label','') then
        raise exception '신청이나 경기 기록이 있어 대회 규칙을 변경할 수 없습니다.';
      end if;
    end loop;
  end if;
  -- One ordinary competition owns both leagues, including rounds after teams.
  if old_master.id is not null then
    select id,round_number into edition,n from ypl_schema_validation.competition_editions
      where family='regular' and (id=old_master.competition_edition_id or
        (old_master.competition_edition_id is null and round_number=old_master.round_number));
    if edition is null then raise exception '기존 대회의 공식 회차를 확인할 수 없습니다.'; end if;
  else
    select id,round_number into edition,n from ypl_schema_validation.reserve_competition_edition('regular');
  end if;
  foreach d in array array['master','rookie'] loop
    eid := case when d = 'master' then mid else rid end;
    current_event := case when d = 'master' then old_master else old_rookie end;
    if current_event.id is not null then
      if current_event.round_number is distinct from n then raise exception '통합 접수의 양쪽 회차가 일치하지 않습니다.'; end if;
      if current_event.status = 'cancelled' and ypl_schema_validation.league_intake_has_downstream(array[mid,rid]) then raise exception '취소된 접수에 후속 기록이 있습니다.'; end if;
    end if;
    insert into ypl_schema_validation.events (
      id, season_id, name, round_number, competition_edition_id, event_type, division, battle_format, competition_format,
      competition_settings, is_team_event, regulation_id, cup_rule_id, cup_rule_settings,
      registration_settings, held_on, date_precision, status, submission_target_at, team_reveal_mode
    ) values (
      eid, p_season_id, concat(n,'회 파이컵 ',case when d='master' then '마스터' else '루키' end,' 리그',case when subtitle<>'' then ' '||subtitle else '' end),
      n, edition, 'pokecup', d, p_settings->>'battle_format', p_settings->>'competition_format',
      jsonb_build_object('recordRuleLabel',coalesce(p_settings->>'record_rule_label',''),'titleAward',p_settings->'title_award','rankingEnabled',d='master'),
      false, p_settings->>'regulation_id', p_settings->>'cup_rule_id', coalesce(p_settings->'cup_rule_settings','{}'::jsonb),
      jsonb_build_object('announcementId',p_announcement_id,'leagueIntakeId',gid,'competitionEditionId',edition,'intakeName',concat(n,'회 파이컵',case when subtitle<>'' then ' '||subtitle else '' end)),
      nullif(p_settings->>'held_on','')::date, case when nullif(p_settings->>'held_on','') is null then 'unknown' else 'exact' end,
      coalesce(nullif(current_event.status,'cancelled'),'open'), nullif(p_settings->>'submission_target_at','')::timestamptz, 'on_record_apply'
    ) on conflict (id) do update set
      name=excluded.name, competition_edition_id=excluded.competition_edition_id, battle_format=excluded.battle_format, competition_format=excluded.competition_format,
      competition_settings=excluded.competition_settings, regulation_id=excluded.regulation_id, cup_rule_id=excluded.cup_rule_id,
      cup_rule_settings=excluded.cup_rule_settings, registration_settings=excluded.registration_settings,
      held_on=excluded.held_on, date_precision=excluded.date_precision, submission_target_at=excluded.submission_target_at,
      status=excluded.status, updated_at=now();
  end loop;
  if g.id is null and p_existing_master_event_id is not null then
    -- Only application rows may move, before the pair becomes visible. No
    -- Submission/Entry exists (checked above), so all immutable chains and IDs
    -- remain untouched. The admission lock prevents concurrent legacy INSERTs.
    if exists(select 1 from ypl_schema_validation.event_registrations where event_id=mid group by btrim(registration_name) having count(*)>1) then
      raise exception '중복된 기존 신청 이름이 있어 전환 전에 검수가 필요합니다.';
    end if;
    for registration in select * from ypl_schema_validation.event_registrations where event_id=mid order by id for update loop
      if registration.registration_source <> 'application' then raise exception '일반 신청 외의 연결이 있어 자동 전환할 수 없습니다.'; end if;
      select count(*),(array_agg(id))[1] into player_count,resolved_player from ypl_schema_validation.players where display_name=btrim(registration.registration_name);
      if player_count>1 or (registration.player_id is not null and registration.player_id is distinct from resolved_player) then
        raise exception '기존 신청자의 정확한 선수 확인이 필요합니다.';
      end if;
      target := case when ypl_schema_validation.has_individual_master_eligibility(resolved_player) then mid else rid end;
      update ypl_schema_validation.event_registrations set event_id=target,player_id=resolved_player,
        registration_name=btrim(registration.registration_name),updated_at=now() where id=registration.id;
    end loop;
  end if;
  insert into ypl_schema_validation.league_intakes(id,announcement_id,master_event_id,rookie_event_id)
    values(gid,p_announcement_id,mid,rid) on conflict(announcement_id) do nothing;
  select * into strict g from ypl_schema_validation.league_intakes where id=gid;
  return g;
end $$;
revoke all on function ypl_schema_validation.save_league_intake(text,uuid,uuid,jsonb) from public, anon, service_role;
grant execute on function ypl_schema_validation.save_league_intake(text,uuid,uuid,jsonb) to authenticated;

-- Admit through either Event. The trigger assigns the canonical destination,
-- so visitors cannot bypass classification by inserting to the other Event.
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
      and (r.registration_name=new.registration_name or (pid is not null and r.player_id=pid))) then
    raise exception using errcode='23505',message='이미 이 공지에 참가 신청한 선수입니다.';
  end if;
  return new;
end $$;
revoke all on function ypl_schema_validation.guard_league_intake_registration() from public, anon, authenticated, service_role;
drop trigger if exists guard_league_intake_registration on ypl_schema_validation.event_registrations;
create trigger guard_league_intake_registration before insert or update on ypl_schema_validation.event_registrations
  for each row execute function ypl_schema_validation.guard_league_intake_registration();

create or replace function ypl_schema_validation.guard_league_intake_participant()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare g ypl_schema_validation.league_intakes%rowtype; target uuid;
begin
  select * into g from ypl_schema_validation.league_intakes where master_event_id=new.event_id or rookie_event_id=new.event_id;
  if not found then return new; end if;
  target := case when ypl_schema_validation.has_individual_master_eligibility(new.player_id) then g.master_event_id else g.rookie_event_id end;
  if new.event_id<>target then raise exception '현재 개인 리그 자격과 대진표 참가 리그가 일치하지 않습니다.'; end if;
  return new;
end $$;
revoke all on function ypl_schema_validation.guard_league_intake_participant() from public, anon, authenticated, service_role;
drop trigger if exists guard_league_intake_participant on ypl_schema_validation.entry_participants;
create trigger guard_league_intake_participant before insert or update on ypl_schema_validation.entry_participants
  for each row execute function ypl_schema_validation.guard_league_intake_participant();

create or replace function ypl_schema_validation.cancel_league_intake(p_intake_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare g ypl_schema_validation.league_intakes%rowtype;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into strict g from ypl_schema_validation.league_intakes where id=p_intake_id;
  perform pg_advisory_xact_lock(hashtextextended('league-intake:' || g.announcement_id,0));
  perform 1 from ypl_schema_validation.league_intakes where id=p_intake_id for update;
  perform 1 from ypl_schema_validation.events where id in(g.master_event_id,g.rookie_event_id) order by id for update;
  if ypl_schema_validation.league_intake_has_downstream(array[g.master_event_id,g.rookie_event_id]) then
    raise exception '연결된 리그에 신청이나 제출, 경기 기록이 있어 공지를 취소할 수 없습니다.';
  end if;
  update ypl_schema_validation.events set status='cancelled', registration_settings=registration_settings-'announcementId',updated_at=now()
    where id in(g.master_event_id,g.rookie_event_id);
  return true;
end $$;
revoke all on function ypl_schema_validation.cancel_league_intake(uuid) from public, anon, service_role;
grant execute on function ypl_schema_validation.cancel_league_intake(uuid) to authenticated;

-- Cancel and remove the notice in the same transaction, including the final
-- downstream check under the admission lock. Preserve other site_data fields.
create or replace function ypl_schema_validation.delete_league_intake_notice(p_intake_id uuid, p_announcement_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare g ypl_schema_validation.league_intakes%rowtype; site jsonb; announcements jsonb;
begin
  if not ypl_schema_validation.is_ypl_admin() then raise exception '관리자 권한이 필요합니다.'; end if;
  select * into strict g from ypl_schema_validation.league_intakes where id=p_intake_id;
  if g.announcement_id is distinct from p_announcement_id then raise exception '공지와 통합 접수 연결이 일치하지 않습니다.'; end if;
  perform ypl_schema_validation.cancel_league_intake(g.id);
  select value into strict site from public.site_data where key='ypl_data_v4' for update;
  if jsonb_typeof(site->'announcements') is distinct from 'array' then raise exception '공지 원본 형식을 확인할 수 없습니다.'; end if;
  select coalesce(jsonb_agg(item order by position),'[]'::jsonb) into announcements
    from jsonb_array_elements(site->'announcements') with ordinality as rows(item,position)
    where item->>'id' is distinct from p_announcement_id;
  site := jsonb_set(site,'{announcements}',announcements);
  update public.site_data set value=site where key='ypl_data_v4';
  return site;
end $$;
revoke all on function ypl_schema_validation.delete_league_intake_notice(uuid,text) from public, anon, service_role;
grant execute on function ypl_schema_validation.delete_league_intake_notice(uuid,text) to authenticated;

create or replace function ypl_schema_validation.guard_league_event_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.is_team_event and new.division is distinct from 'master' then
    if tg_op='INSERT' then raise exception '새 팀전은 마스터로 진행해야 합니다.'; end if;
    if not old.is_team_event or old.division is distinct from new.division then raise exception '새 팀전은 마스터로 진행해야 합니다.'; end if;
  end if;
  if tg_op='UPDATE' and exists(select 1 from ypl_schema_validation.league_intakes where master_event_id=old.id or rookie_event_id=old.id)
     and (new.season_id is distinct from old.season_id or new.division is distinct from old.division
       or new.event_type is distinct from old.event_type or new.is_team_event is distinct from old.is_team_event
       or new.registration_settings->>'leagueIntakeId' is distinct from old.registration_settings->>'leagueIntakeId') then
    raise exception '통합 접수 대회의 리그와 소유권을 변경할 수 없습니다.';
  end if;
  return new;
end $$;
revoke all on function ypl_schema_validation.guard_league_event_identity() from public, anon, authenticated, service_role;
drop trigger if exists guard_league_event_identity on ypl_schema_validation.events;
create trigger guard_league_event_identity before insert or update on ypl_schema_validation.events
  for each row execute function ypl_schema_validation.guard_league_event_identity();
commit;
