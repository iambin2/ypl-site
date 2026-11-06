-- 공지 문구를 DESIGN.md "Voice and tone"에 맞춘다 (2026-11-06 전수조사).
--
-- 바꾸는 것 (공지는 public.site_data 의 ypl_data_v4 안 announcements 에만 있다):
--   1. 신청 버튼 "참가 신청하기" → "참가 신청" (라벨은 명사, 하기 없음). 같은 문구를 쓰는 모든 공지.
--   2. "YPL 시즌3 운영위원 신청" → "YPL 시즌 3 운영위원 신청" (시즌과 숫자 사이 띄어쓰기, 다른 화면과 같게).
--   3. 링크 이름 "NPC별 사용 포켓몬 목록." → 마침표 없이 (라벨은 마침표를 받지 않는다).
--   4. 제목: "제38회 파이컵 공지" → "38회 파이컵 공지" (다른 공지와 대회 이름이 쓰는 꼴),
--      "37회 파이컵 팀전 — 리전 워즈 (Region Wars)" → "37회 파이컵 팀전 리전 워즈" (대회 이름 그대로, em dash 없음),
--      "📢 YPL 시즌3 운영위원 모집" → "YPL 시즌 3 운영위원 모집" (이모지 없음).
--
-- 바꾸지 않는 것: 38회 신청서의 "참가자 이름" 질문. 그 질문이 공개 응답 목록(참가자 및 NPC)의 이름 칸이라, 지우면 목록에
-- NPC만 번호와 함께 남는다. 공지 본문(운영진이 쓴 글)과 38회의 신청 마감(의도된 값)도 그대로 둔다.
--
-- 안전: 지금 값과 정확히 같을 때만 바꾸므로 여러 번 실행해도 된다. 바꾸기 전 사본을 ypl_backup 에 남긴다.
-- 실행 중에 공지 편집 창이 열려 있으면, 그 창의 저장은 revision 이 달라 막힌다(다시 열어 저장하면 된다).
-- 적용: Supabase SQL 편집기에서 한 번 실행.

begin;

create schema if not exists ypl_backup;
create table if not exists ypl_backup.site_data_20261106_notice_copy as
  select * from public.site_data where key = 'ypl_data_v4';
alter table ypl_backup.site_data_20261106_notice_copy enable row level security;

update public.site_data s
   set value = jsonb_set(s.value, '{announcements}', (
     select coalesce(jsonb_agg(a3 order by ord), '[]'::jsonb)
       from (
         select ord,
                case a2->'form'->>'buttonLabel'
                  when '참가 신청하기' then jsonb_set(a2, '{form,buttonLabel}', '"참가 신청"')
                  when 'YPL 시즌3 운영위원 신청' then jsonb_set(a2, '{form,buttonLabel}', '"YPL 시즌 3 운영위원 신청"')
                  else a2
                end as a3
           from (
             select ord,
                    (case a->>'title'
                       when '제38회 파이컵 공지' then jsonb_set(a, '{title}', '"38회 파이컵 공지"')
                       when '37회 파이컵 팀전 — 리전 워즈 (Region Wars)' then jsonb_set(a, '{title}', '"37회 파이컵 팀전 리전 워즈"')
                       when '📢 YPL 시즌3 운영위원 모집' then jsonb_set(a, '{title}', '"YPL 시즌 3 운영위원 모집"')
                       else a
                     end)
                    || case when a->>'linkLabel' = 'NPC별 사용 포켓몬 목록.' then '{"linkLabel": "NPC별 사용 포켓몬 목록"}'::jsonb else '{}'::jsonb end as a2
               from jsonb_array_elements(s.value->'announcements') with ordinality t(a, ord)
           ) x
       ) y
   ))
 where s.key = 'ypl_data_v4'
   and jsonb_typeof(s.value->'announcements') = 'array';

-- 확인: 바뀐 공지만 보인다. 남은 것이 있으면 아래 첫 줄 수가 0이 아니다.
select count(*) filter (where a->>'title' ~ '—|📢|^제[0-9]+회' or a->'form'->>'buttonLabel' = '참가 신청하기' or a->>'linkLabel' ~ '\.$') as left_over,
       count(*) as notices
  from public.site_data, jsonb_array_elements(value->'announcements') a
 where key = 'ypl_data_v4';

commit;
