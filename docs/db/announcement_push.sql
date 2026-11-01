-- 공지 알림(Web Push) 구독. 방문자는 함수로만 자기 구독을 넣고 빼며, 표는 Edge Function(service_role)만 읽는다.
-- endpoint는 Edge Function이 그대로 호출하는 주소이므로 알려진 푸시 서비스만 받는다.
create table if not exists public.push_subscriptions (
  endpoint text primary key
    check (length(endpoint) <= 1024
      and endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'),
  p256dh text not null check (length(p256dh) <= 256),
  auth text not null check (length(auth) <= 64),
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, delete on table public.push_subscriptions to service_role;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.push_subscriptions (endpoint, p256dh, auth)
  values (p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public;
revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.save_push_subscription(text, text, text) to anon, authenticated;
grant execute on function public.delete_push_subscription(text) to anon, authenticated;
