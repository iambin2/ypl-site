-- 챔피언스 본선 직행자 추천 (2026-11-03)
--
-- 선발전이 속한 시즌의 랭킹(RankingBaseline + 기록 반영된 RankingAward, counts_season)에서
-- 이 선발전에 신청한 사람을 순위대로 p_count 명(기본 4) 돌려준다. 보통 한 시즌 상위 4명이 직행이다.
-- 읽기만 한다. 직행자 선택과 저장은 여전히 운영자가 한다(set_championship_qualifier_direct_selections).
-- 순위는 포인트, 우승, 준우승, 4강 순이다. 시즌 순위(season_rank)를 함께 주므로
-- 상위권이 신청하지 않아 5위가 추천되면 화면에서 보인다.
--
-- 신청에 선수가 아직 연결되지 않았으면 이름으로 찾는다. 같음은 띄어쓰기와 대소문자만 무시한다
-- (playerNameKey, player_name_unique.sql 과 같은 규칙).
--
-- 재실행 가능하다. 클라이언트는 이 함수가 없으면 추천만 숨긴다.

create or replace function ypl_schema_validation.recommend_championship_direct_entrants(
    p_qualifier_event_id uuid,
    p_count integer default 4
)
returns table (
    registration_id uuid,
    registration_name text,
    season_rank integer,
    points numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
    with qualifier as (
        select event.id, event.season_id
          from ypl_schema_validation.events as event
         where event.id = p_qualifier_event_id
           and event.event_type = 'champions'
           and event.championship_phase = 'qualifier'
    ),
    ledger as (
        select baseline.player_id, baseline.points, baseline.wins, baseline.runner_ups, baseline.top4s
          from ypl_schema_validation.ranking_baselines as baseline
          join qualifier on baseline.scope = 'season' and baseline.season_id = qualifier.season_id
        union all
        select award.player_id, award.points_delta, award.win_delta, award.runner_up_delta, award.top4_delta
          from ypl_schema_validation.ranking_awards as award
          join ypl_schema_validation.events as event on event.id = award.event_id
          join qualifier on event.season_id = qualifier.season_id
         where award.counts_season
           and event.status = 'completed'
           and event.record_applied_at is not null
    ),
    standings as (
        select ledger.player_id,
               sum(ledger.points) as points,
               rank() over (
                   order by sum(ledger.points) desc, sum(ledger.wins) desc,
                            sum(ledger.runner_ups) desc, sum(ledger.top4s) desc
               )::integer as season_rank
          from ledger
         group by ledger.player_id
        having sum(ledger.points) > 0
    )
    select registration.id, registration.registration_name, standings.season_rank, standings.points
      from ypl_schema_validation.event_registrations as registration
      join qualifier on registration.event_id = qualifier.id
      join ypl_schema_validation.players as player
        on player.id = registration.player_id
        or (registration.player_id is null
            and lower(regexp_replace(player.display_name, '\s+', '', 'g'))
              = lower(regexp_replace(registration.registration_name, '\s+', '', 'g')))
      join standings on standings.player_id = player.id
     order by standings.season_rank, registration.registration_name
     limit greatest(coalesce(p_count, 4), 0);
$$;

revoke all on function ypl_schema_validation.recommend_championship_direct_entrants(uuid, integer) from public, anon;
grant execute on function ypl_schema_validation.recommend_championship_direct_entrants(uuid, integer) to authenticated;
