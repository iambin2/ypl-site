/* 방문자의 구글 로그인 (docs/db/player_accounts.sql). 운영진 로그인(storage.js, 메모리 안의 세션)과 섞이지 않는 따로의 세션이다.
   구글에서 돌아오면 주소의 # 뒤에 토큰이 오고(Supabase의 implicit 흐름), 그것을 이 기기에 두고 주소에서 지운다.
   이 세션은 계정의 트레이너 이름 정하기, 계정으로 하는 신청, 자기 계정 읽기, 연승 도전의 시작과 순위의 내 줄에만 쓰고, 사이트의 다른 읽기와 쓰기는 지금처럼
   익명으로 한다(구글로 들어온 authenticated 역할은 방문자 쓰기 정책을 통과하지 못한다). */

import { supa } from "../storage.js";

const URL_BASE = String(import.meta.env?.VITE_SUPABASE_URL || "").replace(/\/?$/, "/");
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";
const STORE = "ypl-visitor-session";
// a link asked for before the sign-in, made once the visitor is back
const PENDING = "ypl-visitor-link";
// the application form the visitor left for Google, opened again once they are back
const PENDING_FORM = "ypl-visitor-form";

const enabled = () => Boolean(URL_BASE.length > 1 && KEY);
export const accountsEnabled = enabled;
// sign-in and sign-out are announced on window so the top bar, the form and the trainer sheet agree without a store
export const VISITOR_EVENT = "ypl-visitor";
const announce = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(VISITOR_EVENT)); };
const read = key => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
const write = (key, value) => { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* the next sign-in asks again */ } };

// called once as the app starts: a return from Google leaves its tokens after # in the address
export function captureVisitorSession() {
  if (typeof window === "undefined" || !window.location.hash.includes("access_token=")) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const access = params.get("access_token"), refresh = params.get("refresh_token");
  if (access && refresh) write(STORE, { access, refresh, until: Date.now() + (Number(params.get("expires_in")) || 3600) * 1000 - 60000 });
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
}

// back: where Google returns (the trainer's sheet, so the link is asked for as soon as the visitor is back)
export function signInWithGoogle(linkName = "", back = window.location.href.split("#")[0], form = "") {
  if (!enabled()) return;
  write(PENDING, linkName ? { name: linkName } : null);
  write(PENDING_FORM, form || null);
  window.location.assign(`${URL_BASE}auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`);
}

export function signOutVisitor() {
  const s = read(STORE);
  write(STORE, null);
  announce();
  if (s && enabled()) fetch(`${URL_BASE}auth/v1/logout`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${s.access}` } }).catch(() => {});
}

export const visitorSignedIn = () => Boolean(read(STORE));
export const takePendingLink = () => { const p = read(PENDING); write(PENDING, null); return p?.name || ""; };
export const takePendingForm = () => { const id = read(PENDING_FORM); write(PENDING_FORM, null); return id || ""; };

async function token() {
  const s = read(STORE);
  if (!s) return null;
  if (Date.now() < s.until) return s.access;
  const response = await fetch(`${URL_BASE}auth/v1/token?grant_type=refresh_token`, {
    method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh }),
  }).catch(() => null);
  if (!response?.ok) { if (response) { write(STORE, null); announce(); } return null; }
  const next = await response.json();
  write(STORE, { access: next.access_token, refresh: next.refresh_token, until: Date.now() + (next.expires_in || 3600) * 1000 - 60000 });
  return next.access_token;
}

async function rest(path, { method = "GET", body, auth = true } = {}) {
  const bearer = auth ? await token() : null;
  if (auth && !bearer) throw Object.assign(new Error("로그인이 만료되었습니다. 다시 로그인해 주세요."), { signedOut: true });
  const response = await fetch(`${URL_BASE}rest/v1/${path}`, {
    method, headers: { apikey: KEY, Authorization: `Bearer ${bearer || KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(json?.message || "잠시 뒤 다시 시도해 주세요."), { status: response.status, code: json?.code });
  return json;
}

/* the feature stands only once docs/db/player_accounts.sql has run: an anonymous read of the table is refused when it exists,
   and answers that there is no such table when it does not */
let ready = null;
export function accountsReady() {
  if (!enabled()) return Promise.resolve(false);
  return ready ||= rest("player_accounts?select=auth_user_id&limit=1", { auth: false })
    .then(() => true, error => error.status === 401 || error.status === 403 || error.code === "42501");
}

// this visitor's own account: { requested_name, status, player_id, email } or null. approved: the name is theirs alone
export async function myPlayerLink() {
  const rows = await rest("player_accounts?select=requested_name,status,player_id,email");
  return rows?.[0] || null;
}
// a request announces itself, so the top bar shows the name the account now asks for
export const requestPlayerLink = name => rest("rpc/request_player_link", { method: "POST", body: { p_name: name } }).then(out => { announce(); return out; });
// an application under the account's trainer name; leagues, duplicates and the close are the same triggers as a named one
export const applyWithAccount = (eventId, registrationData) =>
  rest("rpc/apply_with_account", { method: "POST", body: { p_event_id: eventId, p_registration_data: registrationData || {} } });

/* ---------- the operators' side, on the admin session (storage.js) ---------- */
export async function listLinkRequests() {
  const { data, error } = await supa.from("player_accounts").select("auth_user_id,email,account_name,requested_name,player_id,status,requested_at").order("requested_at", { ascending: false });
  if (error) throw new Error("연결 요청을 불러오지 못했습니다.");
  return data || [];
}
export async function decideLinkRequest(user, approve) {
  const { error } = await supa.rpc("decide_player_link", { p_user: user, p_approve: approve });
  if (error) throw new Error(error.message || "결정을 저장하지 못했습니다.");
}

/* 연승 도전 (docs/BATTLE_STREAK.md): the start is the one battle request made as the signed-in account, since the run is the
   account's; the battle function checks the token itself. A refusal keeps the function's own sentence. */
export async function startStreakRun() {
  const bearer = await token();
  if (!bearer) throw Object.assign(new Error("로그인이 만료되었습니다. 다시 로그인해 주세요."), { signedOut: true });
  const response = await fetch(`${URL_BASE}functions/v1/battle`, {
    method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "streak" }),
  }).catch(() => null);
  if (!response) throw Object.assign(new Error("연결이 끊겼습니다. 연결을 확인하고 다시 시도해 주세요."), { status: 0 });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json.error || "잠시 뒤 다시 시도해 주세요."), { status: response.status });
  return json;
}
/* a month's board (streak_board): read as the account when signed in, so the viewer's own row is marked. month: "2026-11-01", or
   none for this month. Before docs/db/streak_runs.sql has run there is no such function, and the feature stands aside (null). */
export async function readStreakBoard(month) {
  const signedIn = visitorSignedIn() && Boolean(await token());
  try {
    return await rest("rpc/streak_board", { method: "POST", body: month ? { p_month: month } : {}, auth: signedIn });
  } catch (error) {
    if (error.status === 404 || error.code === "PGRST202") return null;
    throw error;
  }
}
