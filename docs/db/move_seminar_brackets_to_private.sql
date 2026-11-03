-- 배틀부 세미나 미니대회 1조와 2조를 사설 대진표로 옮긴다 (2026-11-03, 한 번만 실행)
--
-- 두 대회는 비공식이다. 대회일이 없고 기록 반영 전인 running 상태로 공식 대진표에 남아 있었다.
-- 결과, 포인트, 공식 파티는 없다(실행 전 확인: results 0, ranking_awards 0, 제출 0).
--
-- 1. 끝난 대진(1조 7명, 2조 6명, 경기 결과 그대로)을 사설 대진표(community_items, board private_bracket)에 만든다.
--    비밀번호가 없으므로 운영진만 고치거나 지울 수 있다. 기록, 랭킹, 대회와 이어지지 않는다.
-- 2. 공식 쪽 대진은 기존 삭제 RPC로 지운다. 대진표가 만든 Entry, 경기, 선수만 소유 관계를 확인하며 지운다.
-- 3. 대회는 지우지 않고 cancelled 로 둔다(Event physical delete 금지). 신청 13건은 그 대회에 남는다.
-- 4. 대회를 만들려고 올린 빈 공지 두 개(본문 "1조", "2")를 공유 데이터에서 뺀다.
--
-- 한 트랜잭션이다. 이미 옮겼으면 아무것도 바꾸지 않는다. Supabase SQL 편집기에서 실행한다.

begin;

do $$
declare
    v_moves constant jsonb := '[
      {"event_id":"b67e74d7-3e84-4471-bc82-bec2ac36d2dc","runtime_id":"ebd4dff2-f68a-47e8-9699-9b67a163bd06","announcement_id":"sssc905","item_id":"pbseminar01a"},
      {"event_id":"96840902-0026-4d3e-bfa5-9e966b93943e","runtime_id":"41c14dcd-3cf1-4796-8128-c8632b41ad6e","announcement_id":"6bp9f2s","item_id":"pbseminar02b"}
    ]'::jsonb;
    v_move jsonb;
begin
    for v_move in select * from jsonb_array_elements(v_moves) loop
        if not exists (
            select 1 from ypl_schema_validation.bracket_runtimes
             where id = (v_move->>'runtime_id')::uuid and event_id = (v_move->>'event_id')::uuid
        ) then
            raise notice '% 는 이미 옮겼습니다.', v_move->>'item_id';
            continue;
        end if;
        if exists (select 1 from ypl_schema_validation.results where event_id = (v_move->>'event_id')::uuid)
           or exists (select 1 from ypl_schema_validation.ranking_awards where event_id = (v_move->>'event_id')::uuid) then
            raise exception '% 에 결과나 포인트가 있어 옮기지 않습니다.', v_move->>'event_id';
        end if;

        perform * from ypl_schema_validation.delete_normalized_single_bracket_runtime(
            (v_move->>'runtime_id')::uuid, (v_move->>'event_id')::uuid);

        update ypl_schema_validation.events
           set status = 'cancelled',
               registration_settings = registration_settings - 'announcementId',
               updated_at = now()
         where id = (v_move->>'event_id')::uuid;

        update public.site_data
           set value = jsonb_set(value, '{announcements}', coalesce((
                 select jsonb_agg(a order by ord)
                   from jsonb_array_elements(value->'announcements') with ordinality as t(a, ord)
                  where a->>'id' <> v_move->>'announcement_id'), '[]'::jsonb))
         where key = 'ypl_data_v4'
           and exists (select 1 from jsonb_array_elements(value->'announcements') a where a->>'id' = v_move->>'announcement_id');
    end loop;
end $$;

insert into public.community_items (id, board, parent_id, payload, secret, has_pin, created_at) values
('pbseminar01a', 'private_bracket', null, '{"name":"배틀부 세미나 미니대회 1조","host":"운영진","note":"","updatedAt":"2026-09-19T10:00:00.000Z","format":"elim","mode":"single","double":false,"order":"input","participants":[{"id":"1fc2bd6f-2c41-44a1-8f43-391b6d06d194","name":"김한성"},{"id":"2c6c0d5f-78de-4f25-bb48-dc947c6c01fd","name":"윤희수"},{"id":"4afa8fdd-a622-41f2-b199-f8fcd6541a2c","name":"이준원"},{"id":"a4840bc4-0772-444a-99ff-1072cdec4347","name":"조서준"},{"id":"b0827d2c-a16d-4c18-be24-27d5e10c94b8","name":"지용준"},{"id":"dde7bd2a-3bb9-43fb-9071-ee6ad8a4f178","name":"이준혁"},{"id":"f20b032a-f96e-4e09-b590-72f913d716cf","name":"유수환"}],"graph":{"kind":"single","size":8,"byes":1,"rounds":[[{"id":"single:r1:m1","a":{"pid":"4afa8fdd-a622-41f2-b199-f8fcd6541a2c"},"b":{"bye":true},"winner":"a"},{"id":"single:r1:m2","a":{"pid":"1fc2bd6f-2c41-44a1-8f43-391b6d06d194"},"b":{"pid":"b0827d2c-a16d-4c18-be24-27d5e10c94b8"},"winner":"a"},{"id":"single:r1:m3","a":{"pid":"2c6c0d5f-78de-4f25-bb48-dc947c6c01fd"},"b":{"pid":"dde7bd2a-3bb9-43fb-9071-ee6ad8a4f178"},"winner":"a"},{"id":"single:r1:m4","a":{"pid":"a4840bc4-0772-444a-99ff-1072cdec4347"},"b":{"pid":"f20b032a-f96e-4e09-b590-72f913d716cf"},"winner":"a"}],[{"id":"single:r2:m1","a":{"win":"single:r1:m1"},"b":{"win":"single:r1:m2"},"winner":"a"},{"id":"single:r2:m2","a":{"win":"single:r1:m3"},"b":{"win":"single:r1:m4"},"winner":"b"}],[{"id":"single:r3:m1","a":{"win":"single:r2:m1"},"b":{"win":"single:r2:m2"},"winner":"b"}]]}}'::jsonb, false, false, '2026-09-19T08:41:16Z'),
('pbseminar02b', 'private_bracket', null, '{"name":"배틀부 세미나 미니대회 2조","host":"운영진","note":"","updatedAt":"2026-09-19T10:00:00.000Z","format":"elim","mode":"single","double":false,"order":"input","participants":[{"id":"618abdf6-cca6-494d-8835-273579474898","name":"김주찬"},{"id":"a982ed30-114f-4c71-b1b1-138c3c1a7d58","name":"설재웅"},{"id":"b846a458-f691-4dc1-90c4-28747d68b5b2","name":"이진형"},{"id":"cf813b1c-a7ec-4737-81ca-ddf716051e8f","name":"임시현"},{"id":"d0d38a9c-01de-453e-a436-4399c998ee17","name":"김시형"},{"id":"e770e637-6c7f-45e9-90f1-49182ceec202","name":"이현성"}],"graph":{"kind":"single","size":8,"byes":2,"rounds":[[{"id":"single:r1:m1","a":{"pid":"cf813b1c-a7ec-4737-81ca-ddf716051e8f"},"b":{"bye":true},"winner":"a"},{"id":"single:r1:m2","a":{"pid":"e770e637-6c7f-45e9-90f1-49182ceec202"},"b":{"pid":"a982ed30-114f-4c71-b1b1-138c3c1a7d58"},"winner":"b"},{"id":"single:r1:m3","a":{"pid":"d0d38a9c-01de-453e-a436-4399c998ee17"},"b":{"pid":"b846a458-f691-4dc1-90c4-28747d68b5b2"},"winner":"b"},{"id":"single:r1:m4","a":{"pid":"618abdf6-cca6-494d-8835-273579474898"},"b":{"bye":true},"winner":"a"}],[{"id":"single:r2:m1","a":{"win":"single:r1:m1"},"b":{"win":"single:r1:m2"},"winner":"a"},{"id":"single:r2:m2","a":{"win":"single:r1:m3"},"b":{"win":"single:r1:m4"},"winner":"a"}],[{"id":"single:r3:m1","a":{"win":"single:r2:m1"},"b":{"win":"single:r2:m2"},"winner":"b"}]]}}'::jsonb, false, false, '2026-09-19T08:42:32Z')
on conflict (id) do nothing;

commit;

-- 확인: 두 대회가 cancelled 이고 대진이 없으며, 사설 대진표 두 개가 있고, 공지 두 개가 빠졌다.
-- select name, status, (select count(*) from ypl_schema_validation.bracket_runtimes b where b.event_id = e.id) runtimes
--   from ypl_schema_validation.events e where name like '배틀부 세미나%';
-- select id, payload->>'name' from public.community_items where board = 'private_bracket';
-- select count(*) from public.site_data, jsonb_array_elements(value->'announcements') a
--  where key = 'ypl_data_v4' and a->>'id' in ('sssc905', '6bp9f2s');
