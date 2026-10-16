-- Event names follow one grammar, assembled by src/services/eventName.js:
--   "{N}회 파이컵 마스터 리그", "{N}회 파이컵 루키 리그", "{N}회 파이컵 라이트",
--   "{N}회 파이컵 팀전", "{N}회 챔피언스 시리즈 선발전|본선", each with an optional subtitle.
-- This file is the DB-side guard and the one-time 2026-10 cleanup that lets it validate.
-- Run once, top to bottom, in the Supabase SQL editor. It is one transaction.

begin;

-- 1. One-time cleanup: "N회 파이컵 | 마스터리그" style names and the two seminar mini events.
update ypl_schema_validation.events set name =
  case name
    when '베틀부 세미나 미니대회' then '배틀부 세미나 미니대회 1조'
    when '미니대회2조' then '배틀부 세미나 미니대회 2조'
    else replace(replace(regexp_replace(name, '\s*\|\s*', ' ', 'g'), '마스터리그', '마스터 리그'), '루키리그', '루키 리그')
  end,
  updated_at = now()
where name like '%|%' or name ~ '(마스터|루키)리그' or name in ('베틀부 세미나 미니대회', '미니대회2조');

-- 2. The notices keep a copy of their Event's name; a later notice save writes it back,
--    so the copies must match or the old names return.
update public.site_data set value = jsonb_set(value, '{announcements}', (
  select jsonb_agg(
    case a->>'id'
      when 'sssc905' then jsonb_set(jsonb_set(a, '{title}', '"배틀부 세미나 미니대회 1조"'), '{form,eventDraft,name}', '"배틀부 세미나 미니대회 1조"')
      when '6bp9f2s' then jsonb_set(jsonb_set(a, '{title}', '"배틀부 세미나 미니대회 2조"'), '{form,eventDraft,name}', '"배틀부 세미나 미니대회 2조"')
      when 'j8s6v7f' then jsonb_set(a, '{form,eventDraft,name}', '"37회 파이컵 팀전 리전 워즈"')
      else a
    end order by ord)
  from jsonb_array_elements(value->'announcements') with ordinality t(a, ord)))
where key = 'ypl_data_v4';

-- 3. The Champions pair RPC appended " · 본선" / " · 선발전". Patch the live body in place
--    (only the two suffixes change; docs/db/champions_application_event_pair_rpc.sql matches).
do $$
declare def text;
begin
  def := pg_get_functiondef('ypl_schema_validation.save_championship_application_event_pair'::regproc);
  def := replace(replace(def, $q$' · 본선'$q$, $q$' 본선'$q$), $q$' · 선발전'$q$, $q$' 선발전'$q$);
  execute def;
end $$;

-- 4. The guard: no separators, no glued league names, no stray spaces.
alter table ypl_schema_validation.events drop constraint if exists events_name_clean;
alter table ypl_schema_validation.events add constraint events_name_clean check (
  name = btrim(name)
  and name <> ''
  and name !~ '[|·•]'
  and name !~ '\s{2,}'
  and name !~ '(마스터|루키)리그'
);

-- Check: bad_left 0, rpc_has_dot false, the three notices show the new names.
select
  (select count(*) from ypl_schema_validation.events
    where name ~ '[|·•]' or name ~ '(마스터|루키)리그' or name like '%베틀%') as bad_left,
  (pg_get_functiondef('ypl_schema_validation.save_championship_application_event_pair'::regproc) like '%·%') as rpc_has_dot,
  (select jsonb_agg(jsonb_build_object('title', a->>'title', 'draft', a->'form'->'eventDraft'->>'name'))
     from public.site_data, jsonb_array_elements(value->'announcements') a
    where key = 'ypl_data_v4' and a->>'id' in ('sssc905', '6bp9f2s', 'j8s6v7f')) as notices;

commit;
