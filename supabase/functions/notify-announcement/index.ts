// 새 공지를 구독자 전원에게 푸시로 보낸다. 운영진 토큰으로만 부를 수 있고, 내용은 요청이 아니라 저장된 공지에서 읽는다.
// 비밀값: VAPID_KEYS(JWK 키 쌍 JSON). 공개키는 src/services/announcementPush.js 의 VAPID_PUBLIC_KEY와 짝이다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from "jsr:@negrel/webpush@0.5.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: { user } } = await db.auth.getUser(token);
  if (user?.app_metadata?.ypl_admin !== true) return reply(403, { error: "forbidden" });

  const { id } = await req.json();
  const { data: site, error: siteError } = await db.from("site_data").select("value").eq("key", "ypl_data_v4").single();
  if (siteError) return reply(500, { error: siteError.message });
  const notice = site.value.announcements?.find((a: { id: string }) => a.id === id);
  if (!notice) return reply(404, { error: "notice not found" });

  // ponytail: PostgREST 기본 한도 1000행까지만 보낸다. 구독자가 1000명을 넘으면 range로 나눈다.
  const { data: subscribers, error } = await db.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (error) return reply(500, { error: error.message });

  const server = await ApplicationServer.new({
    contactInformation: "https://league.pokeyonsei.com/",
    vapidKeys: await importVapidKeys(JSON.parse(Deno.env.get("VAPID_KEYS")!)),
  });
  const message = JSON.stringify({
    title: "YPL 공지",
    body: String(notice.title).slice(0, 120),
    url: `?view=news&notice=${encodeURIComponent(id)}`,
  });
  const results = await Promise.allSettled(subscribers.map(({ endpoint, p256dh, auth }) =>
    server.subscribe({ endpoint, keys: { p256dh, auth } }).pushTextMessage(message, { ttl: 86400, urgency: Urgency.High })
  ));

  // 404, 410은 브라우저가 구독을 버린 것이다. 일시적인 실패는 지우지 않는다.
  const failed = results.flatMap((result, i) => result.status === "rejected" ? [{ reason: result.reason, endpoint: subscribers[i].endpoint }] : []);
  failed.forEach(({ reason }) => console.error(String(reason)));
  const gone = failed
    .filter(({ reason }) => reason instanceof PushMessageError && [404, 410].includes(reason.response.status))
    .map(({ endpoint }) => endpoint);
  if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);

  return reply(200, { sent: subscribers.length - failed.length, failed: failed.length, removed: gone.length });
});
