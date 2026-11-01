import { invokeFunction, supa } from "../storage.js";
import { pushMode } from "./announcementPushPolicy.js";

// VAPID 공개키. 비공개 짝은 Supabase의 VAPID_KEYS 비밀값에만 있다.
const VAPID_PUBLIC_KEY = "BDEiajwx8KVQ0lhlM0ML3jVCBCY9dIYs6MOITkOgYSdx4qioLWc81F3vMyTsIKWY4TITFtuVccEh612fVxIXKEE";
const SCOPE = import.meta.env.BASE_URL;

export const currentPushMode = () => pushMode({
  connected: !!supa,
  hasPush: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
  ios: /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
  standalone: navigator.standalone === true,
});

async function saveSubscription(subscription) {
  const { endpoint, keys } = subscription.toJSON();
  const { error } = await supa.rpc("save_push_subscription", { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth });
  if (error) throw new Error("알림을 등록하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
}

const browserSubscription = async () => (await navigator.serviceWorker.getRegistration(SCOPE))?.pushManager.getSubscription() ?? null;

// 브라우저가 구독 주소를 바꿨어도 서버가 따라오도록, 켜 둔 사람이 공지 화면에 오면 다시 저장한다.
export async function isPushOn() {
  const subscription = await browserSubscription();
  if (subscription) saveSubscription(subscription).catch(console.error);
  return !!subscription;
}

export async function enablePush() {
  if (await Notification.requestPermission() !== "granted") throw new Error("브라우저 설정에서 이 사이트의 알림을 허용해 주세요.");
  await navigator.serviceWorker.register(`${SCOPE}sw.js`);
  const { pushManager } = await navigator.serviceWorker.ready;
  const subscription = await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY });
  try {
    await saveSubscription(subscription);
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}

export async function disablePush() {
  const subscription = await browserSubscription();
  if (!subscription) return;
  await subscription.unsubscribe();
  // 지우지 못해도 다음 발송에서 410을 받고 정리된다.
  await supa.rpc("delete_push_subscription", { p_endpoint: subscription.endpoint });
}

export const notifyAnnouncement = id => invokeFunction("notify-announcement", { id });
