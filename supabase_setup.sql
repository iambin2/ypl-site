-- ============================================================
-- YPL 사이트용 Supabase 설정 SQL
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 "Run" 하세요.
-- ============================================================

-- 1) 데이터를 통째로 저장할 키-값 테이블 (사이트 전체 상태를 한 행에 JSON으로 저장)
create table if not exists public.site_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- 2) RLS(행 수준 보안) 켜기
alter table public.site_data enable row level security;

-- 3) 누구나 "읽기"는 가능 (방문자 조회용)
create policy "public read"
  on public.site_data for select
  using (true);

-- 4) 누구나 "쓰기"도 가능하게 하려면 아래 정책을 추가하세요.
--    (동아리 내부용 소프트 게이트라 충분하지만, 익명 anon 키로 누구나 덮어쓸 수 있게 됩니다.
--     더 안전하게 하려면 README의 'Supabase Auth로 관리자 잠그기' 참고)
create policy "public write"
  on public.site_data for insert
  with check (true);

create policy "public update"
  on public.site_data for update
  using (true) with check (true);
