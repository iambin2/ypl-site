-- 도전의 탑 기록 리셋 (2026-11-11, docs/BATTLE_STREAK.md 14장). 사용자: "기존 기록은 리셋하면 그만이야".
-- 램프 셋 규칙과 층의 타입으로 오른 기록을 지우고, 새 규칙(램프 하나, 랭커 구축)으로 순위를 처음부터 세운다.
-- 지우는 것: 도전의 탑 판(battles kind streak, 그 비밀은 cascade로 함께)과 모든 도전(streak_runs). 친선, 공식, 컴퓨터 배틀은 건드리지 않는다.
-- streak_runs.sql을 먼저 실행한 뒤 한 번 실행한다. 되돌릴 수 없다.
begin;
delete from public.battles where kind = 'streak';
delete from public.streak_runs;
commit;
