-- Test Supabase migration source: YPL Season automatic rollover.
-- This is deliberately limited to ypl_schema_validation and never rewrites Event.season_id.

drop index if exists ypl_schema_validation.uq_seasons_one_current;

create unique index uq_seasons_one_current_ypl
  on ypl_schema_validation.seasons (status)
  where series = 'ypl' and status = 'current';

create or replace function ypl_schema_validation.resolve_ypl_season_for_date(
  p_at timestamptz default now()
)
returns table (season_number smallint, starts_on date, ends_on date)
language sql
stable
set search_path = ''
as $$
  with local_day as (
    select timezone('Asia/Seoul', p_at)::date as value
  ), boundary as (
    select
      case
        when extract(month from value)::integer <= 2
          then make_date(extract(year from value)::integer - 1, 9, 1)
        when extract(month from value)::integer >= 9
          then make_date(extract(year from value)::integer, 9, 1)
        else make_date(extract(year from value)::integer, 3, 1)
      end as season_starts_on
    from local_day
    where value >= date '2026-09-01'
  )
  select
    (
      3
      + ((extract(year from season_starts_on)::integer - 2026) * 2)
      + case when extract(month from season_starts_on)::integer = 3 then -1 else 0 end
    )::smallint as season_number,
    season_starts_on as starts_on,
    (season_starts_on + interval '6 months - 1 day')::date as ends_on
  from boundary;
$$;

create or replace function ypl_schema_validation.ensure_current_ypl_season_for_date(
  p_at timestamptz default now()
)
returns ypl_schema_validation.seasons
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target record;
  v_season ypl_schema_validation.seasons%rowtype;
begin
  select * into v_target
    from ypl_schema_validation.resolve_ypl_season_for_date(p_at);

  if not found then
    raise exception using
      errcode = 'P0001',
      message = '2026-09-01 Asia/Seoul anchor 이전에는 자동 YPL Season을 만들 수 없습니다.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ypl_schema_validation.ensure_current_ypl_season', 0)
  );

  update ypl_schema_validation.seasons
     set status = 'past'
   where series = 'ypl'
     and status = 'current'
     and number is distinct from v_target.season_number;

  insert into ypl_schema_validation.seasons (
    code, name, series, number, starts_on, ends_on, sort_order, status
  ) values (
    'ypl-' || v_target.season_number,
    'YPL 시즌 ' || v_target.season_number,
    'ypl',
    v_target.season_number,
    v_target.starts_on,
    v_target.ends_on,
    v_target.season_number,
    'current'
  )
  on conflict (code) do update
    set name = excluded.name,
        series = excluded.series,
        number = excluded.number,
        starts_on = excluded.starts_on,
        ends_on = excluded.ends_on,
        sort_order = excluded.sort_order,
        status = excluded.status
  returning * into v_season;

  return v_season;
end;
$$;

drop function if exists ypl_schema_validation.ensure_current_ypl_season(timestamptz);

create function ypl_schema_validation.ensure_current_ypl_season()
returns ypl_schema_validation.seasons
language sql
security definer
set search_path = ''
as $$
  select ypl_schema_validation.ensure_current_ypl_season_for_date(pg_catalog.now());
$$;

revoke all on function ypl_schema_validation.resolve_ypl_season_for_date(timestamptz) from public;
revoke all on function ypl_schema_validation.ensure_current_ypl_season_for_date(timestamptz) from public, anon, authenticated;
revoke all on function ypl_schema_validation.ensure_current_ypl_season() from public;
grant execute on function ypl_schema_validation.resolve_ypl_season_for_date(timestamptz) to anon, authenticated;
grant execute on function ypl_schema_validation.ensure_current_ypl_season() to anon, authenticated;
