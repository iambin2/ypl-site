-- YPL DB access lockdown (Migration A + B)
-- Status: APPLIED to Production (rqffrogcverfjqzjasax) on 2026-10-16.
-- Rationale, verification and rollback: docs/db-access-lockdown.md.
--
-- This is the access boundary. The other docs/db files carry matching ACL
-- lines for their own functions and tables; where they disagree, this file
-- wins. Run it after them. It is not idempotent (create policy fails on a
-- rerun); drop the policies first if it ever has to be replayed.
--
-- anon reads everything and writes only: event_registrations INSERT (column
-- grant plus visitor_apply policy), the two community site_data keys, and the
-- submit_registration_team_snapshot RPC (SECURITY DEFINER). Every other write
-- needs an authenticated JWT with app_metadata.ypl_admin = true.

-- ===== Migration A: admin role, additive =====
-- A1. 관리자 판정. JWT app_metadata는 서버만 쓸 수 있다.
create or replace function ypl_schema_validation.is_ypl_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'ypl_admin')::boolean, false)
$$;
revoke all on function ypl_schema_validation.is_ypl_admin() from public;
grant execute on function ypl_schema_validation.is_ypl_admin() to anon, authenticated;

-- A2. 관리자 역할이 쓸 권한. 지금 anon이 가진 범위에, INVOKER로 바뀔 챔피언스 함수가 쓰고 잠그는 table을 더한다.
grant usage on schema ypl_schema_validation to authenticated;
grant select on all tables in schema ypl_schema_validation to authenticated;
grant insert, delete         on ypl_schema_validation.bracket_entry_slots,
                                ypl_schema_validation.bracket_identity_changes,
                                ypl_schema_validation.bracket_runtimes,
                                ypl_schema_validation.entries,
                                ypl_schema_validation.entry_participants,
                                ypl_schema_validation.players,
                                ypl_schema_validation.team_snapshots,
                                ypl_schema_validation.championship_qualifier_direct_selections to authenticated;
grant insert, update, delete on ypl_schema_validation.event_registrations,
                                ypl_schema_validation.matches,
                                ypl_schema_validation.ranking_awards,
                                ypl_schema_validation.results,
                                ypl_schema_validation.championship_advancements,
                                ypl_schema_validation.hall_of_fame_entries to authenticated;
grant insert, update         on ypl_schema_validation.events to authenticated;
grant insert                 on ypl_schema_validation.registration_submissions,
                                ypl_schema_validation.team_snapshot_members to authenticated;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'ypl_schema_validation' and p.prokind = 'f'
       and p.proname <> 'ensure_current_ypl_season_for_date'
  loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- A3. 방문자가 부르는 유일한 RPC. 본문이 Event 상태와 Registration exact match를 검사한다.
alter function ypl_schema_validation.submit_registration_team_snapshot(uuid, uuid, text, jsonb, jsonb) security definer;

-- ===== Migration B: lockdown, one transaction =====
begin;

-- B1. normalized table: RLS, 공개 읽기, 관리자 쓰기.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ypl_schema_validation' and c.relkind = 'r'
  loop
    execute format('alter table ypl_schema_validation.%I enable row level security', t);
    execute format('create policy public_read on ypl_schema_validation.%I for select to anon, authenticated using (true)', t);
    execute format('create policy admin_write on ypl_schema_validation.%I for all to authenticated
                      using ((select ypl_schema_validation.is_ypl_admin()))
                      with check ((select ypl_schema_validation.is_ypl_admin()))', t);
  end loop;
end $$;

-- B2. anon 쓰기 회수. 신청 INSERT만 열 단위로 되돌린다.
revoke insert, update, delete, truncate on all tables in schema ypl_schema_validation from anon;
revoke truncate on all tables in schema ypl_schema_validation from authenticated;
grant insert (event_id, player_id, registration_name, registration_data, registration_source, registered_at, updated_at)
  on ypl_schema_validation.event_registrations to anon;

create policy visitor_apply on ypl_schema_validation.event_registrations
  for insert to anon
  with check (
    registration_source = 'application'
    and final_submission_id is null
    and exists (select 1 from ypl_schema_validation.events e
                 where e.id = event_registrations.event_id and e.status = 'open' and e.record_applied_at is null)
    and (player_id is null or exists (select 1 from ypl_schema_validation.players p
                                       where p.id = event_registrations.player_id
                                         and p.display_name = event_registrations.registration_name))
  );

-- B3. site_data: 공개 읽기, 커뮤니티 두 key만 방문자 쓰기, 나머지는 관리자.
alter table public.site_data enable row level security;
revoke all on public.site_data from anon, authenticated;
grant select, insert, update on public.site_data to anon;
grant select, insert, update, delete on public.site_data to authenticated;

create policy site_data_read on public.site_data for select to anon, authenticated using (true);
create policy site_data_community_insert on public.site_data for insert to anon, authenticated
  with check (key in ('ypl_showcase_v1', 'ypl_private_brackets_v1'));
create policy site_data_community_update on public.site_data for update to anon, authenticated
  using (key in ('ypl_showcase_v1', 'ypl_private_brackets_v1'))
  with check (key in ('ypl_showcase_v1', 'ypl_private_brackets_v1'));
create policy site_data_admin on public.site_data for all to authenticated
  using ((select ypl_schema_validation.is_ypl_admin()))
  with check ((select ypl_schema_validation.is_ypl_admin()));

-- B4. RPC 실행 권한: 파티 제출과 관리자 판정만 anon에 남긴다.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'ypl_schema_validation' and p.prokind = 'f'
       and p.proname not in ('submit_registration_team_snapshot', 'is_ypl_admin', 'resolve_ypl_season_for_date')
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;  -- event trigger 전용

-- B5. 챔피언스 DEFINER 함수를 INVOKER로. 이제 RLS의 admin_write가 관문이다.
alter function ypl_schema_validation.add_championship_qualifier_manual_registration(uuid, uuid) security invoker;
alter function ypl_schema_validation.cancel_championship_advancement(uuid) security invoker;
alter function ypl_schema_validation.create_championship_advancement(uuid, uuid, uuid, uuid, text, uuid, text) security invoker;
alter function ypl_schema_validation.ensure_championship_final_hall_of_fame(uuid, uuid) security invoker;
alter function ypl_schema_validation.remove_championship_final_hall_of_fame(uuid) security invoker;
alter function ypl_schema_validation.finalize_championship_qualifier(uuid) security invoker;
alter function ypl_schema_validation.reopen_championship_qualifier(uuid) security invoker;
alter function ypl_schema_validation.set_championship_qualifier_direct_selections(uuid, uuid[]) security invoker;

commit;
