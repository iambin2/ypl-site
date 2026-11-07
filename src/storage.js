// ============================================================================
// YPL 데이터 저장 어댑터
// 우선순위: (1) Claude 아티팩트(window.storage)  (2) Supabase  (3) localStorage
// - Supabase 환경변수가 설정되면 "모든 방문자에게 공유되는" 영구 저장이 됩니다.
// - 설정 안 하면 localStorage로 동작합니다(브라우저 1대에만 저장 = 진짜 공유 아님).
// ============================================================================
import { PostgrestClient } from "@supabase/postgrest-js";
import { WRITE_CONFLICT, writeRevisioned } from "./services/revisionedRow.js";

export const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// 현장의 불안한 네트워크에서 조회가 멈추면 화면이 끝없이 불러오는 중에 머문다. 쓰기는 끊지 않는다: 저장됐는지 알 수 없게 된다.
const READ_TIMEOUT_MS = 15000;

/* 관리자 로그인 세션. 토큰은 메모리에 두고, 갱신 토큰만 이 탭의 sessionStorage에 남긴다(2026-11-08, 관리자 워크스페이스:
   새로고침할 때마다 다시 로그인해야 했다). 탭을 닫으면 사라지고, 다른 탭과 기기에는 넘어가지 않는다. 운영진이 함께 쓰는 계정이라
   localStorage에는 두지 않는다. */
const ADMIN_KEY = "ypl-admin:v1";
const keepRefresh = token => { try { if (token) sessionStorage.setItem(ADMIN_KEY, token); else sessionStorage.removeItem(ADMIN_KEY); } catch { /* 새로고침하면 다시 로그인한다 */ } };
let session = null;
let refreshTimer = 0;
let refreshing = null;
let expiresAt = 0;
let onSessionLost = null;

export const onAdminSessionLost = listener => { onSessionLost = listener; };

// 관리자로 로그인했으면 그 토큰, 아니면 anon key로 요청한다. 쓰기 권한은 DB가 토큰을 보고 판정한다.
const authFetch = async (url, init = {}) => {
  // 폰이 잠기면 갱신 타이머가 멈춘다. 깨어난 뒤의 첫 저장이 만료된 토큰으로 실패하지 않게 여기서도 확인한다.
  if (session && Date.now() >= expiresAt) await refreshSession();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session?.access_token || SUPA_KEY}`);
  const read = !init.method || init.method === "GET" || init.method === "HEAD";
  return fetch(url, { ...init, headers, signal: init.signal ?? (read ? AbortSignal.timeout?.(READ_TIMEOUT_MS) : undefined) });
};

// 환경변수가 둘 다 있을 때만 Supabase 클라이언트를 만듭니다.
// 사이트는 DB 조회와 RPC(from, rpc, schema)만 씁니다. supabase-js 전체(인증, 파일 저장소, 실시간)는 첫 화면 JS의
// 절반이 넘어서, 그 안의 PostgREST 클라이언트만 같은 주소와 헤더로 쓰고, 로그인은 Auth REST를 직접 부릅니다.
export const supa = SUPA_URL && SUPA_KEY
  ? new PostgrestClient(new URL("rest/v1", SUPA_URL.replace(/\/?$/, "/")).href, {
      headers: { apikey: SUPA_KEY },
      fetch: authFetch,
    })
  : null;

async function requestToken(grant, body) {
  let response;
  try {
    response = await fetch(new URL(`auth/v1/token?grant_type=${grant}`, SUPA_URL.replace(/\/?$/, "/")), {
      method: "POST",
      headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("로그인 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }
  if (!response.ok) {
    const rejected = new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
    rejected.rejected = true;
    throw rejected;
  }
  session = await response.json();
  keepRefresh(session.refresh_token);
  // 만료 1분 전에 갱신한다.
  expiresAt = Date.now() + Math.max(session.expires_in - 60, 30) * 1000;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshSession, expiresAt - Date.now());
}

// 갱신 토큰은 한 번만 쓸 수 있어 동시에 두 번 보내면 세션이 폐기된다. 서버가 거절했을 때만 세션을 버린다.
// 네트워크가 잠깐 끊긴 것이면 세션을 두고, 다음 요청이 다시 갱신한다.
function refreshSession() {
  return refreshing ||= requestToken("refresh_token", { refresh_token: session.refresh_token })
    .catch(error => { if (error.rejected) { signOutAdmin(); onSessionLost?.(); } })
    .finally(() => { refreshing = null; });
}

// 운영진 공용 아이디처럼 @ 가 없는 값은 내부 이메일로 바꾼다. .invalid 는 메일이 가지 않는 예약 도메인이라
// 누가 비밀번호 재설정을 요청해도 메일이 남의 손에 들어가지 않는다.
const adminEmailOf = login => (login.includes("@") ? login : `${login}@ypl.invalid`);

// Supabase가 없는 환경(로컬 저장, 아티팩트)은 지킬 공유 데이터가 없으니 확인 없이 들여보낸다.
export async function signInAdmin(login, password) {
  if (supa) await requestToken("password", { email: adminEmailOf(String(login || "").trim()), password });
}

// 새로고침한 탭: 남긴 갱신 토큰으로 다시 들어간다. 서버가 거절하면(만료, 다른 탭이 먼저 씀) 지우고 로그아웃 상태로 둔다.
export async function restoreAdmin() {
  let kept = null;
  try { kept = sessionStorage.getItem(ADMIN_KEY); } catch { return false; }
  if (!supa || !kept || session) return Boolean(session);
  try { await requestToken("refresh_token", { refresh_token: kept }); return true; }
  catch (error) { if (error.rejected) keepRefresh(null); return false; }
}

export function signOutAdmin() {
  keepRefresh(null);
  session = null;
  clearTimeout(refreshTimer);
}

// 방문자의 요청으로 Edge Function을 부르고 답을 돌려준다(배틀). 함수가 거절하면 그 이유를 담은 오류를 던진다.
export async function callFunction(name, body) {
  if (!supa) throw new Error("이 환경에서는 쓸 수 없습니다.");
  let response;
  try {
    response = await fetch(new URL(`functions/v1/${name}`, SUPA_URL.replace(/\/?$/, "/")), {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // the browser's own words ("Failed to fetch", "Load failed") are English and say nothing a player can act on
    throw Object.assign(new Error("연결이 끊겼습니다. 연결을 확인하고 다시 시도해 주세요."), { status: 0 });
  }
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(json.error || "잠시 뒤 다시 시도해 주세요."), { status: response.status, problems: json.problems });
  return json;
}

// 로그인한 세션으로 Edge Function을 부른다. Supabase가 없는 환경에서는 할 일이 없다.
export async function invokeFunction(name, body) {
  if (!supa) return;
  const response = await authFetch(new URL(`functions/v1/${name}`, SUPA_URL.replace(/\/?$/, "/")), {
    method: "POST",
    headers: { apikey: SUPA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
}

export const STORAGE_MODE = (typeof window !== "undefined" && window.storage)
  ? "artifact"
  : (supa ? "supabase" : "local");

// 키마다 마지막으로 읽은 행의 revision. 읽기에 성공한 키만 들어 있다.
const revisions = new Map();
const writeQueues = new Map();

export async function getData(key) {
  // (1) Claude 아티팩트 환경
  if (typeof window !== "undefined" && window.storage) {
    try {
      const r = await window.storage.get(key, true);
      return r ? JSON.parse(r.value) : null;
    } catch { return null; }
  }
  // (2) Supabase
  if (supa) {
    try {
      const { data, error } = await supa
        .from("site_data").select("*").eq("key", key).maybeSingle();
      if (error) { console.error(error); return null; }
      revisions.set(key, data?.revision);
      return data ? data.value : null;
    } catch (e) { console.error(e); return null; }
  }
  // (3) localStorage 폴백
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

// true(저장), false(실패), WRITE_CONFLICT(읽은 뒤 다른 저장이 있었음) 중 하나를 돌려준다.
export async function setData(key, value) {
  if (typeof window !== "undefined" && window.storage) {
    try {
      const r = await window.storage.set(key, JSON.stringify(value), true);
      return !!r;
    } catch { return false; }
  }
  if (supa) {
    // 읽지 못한 행은 쓰지 않는다. 씨드를 띄운 화면의 저장이 진짜 데이터를 덮으면 안 된다.
    if (!revisions.has(key)) return false;
    // 같은 화면의 저장이 겹쳐도 앞 저장의 revision을 이어받도록 차례로 보낸다.
    const queued = (writeQueues.get(key) || Promise.resolve()).then(async () => {
      try {
        const revision = await writeRevisioned(supa.from("site_data"), key, value, revisions.get(key));
        if (revision === WRITE_CONFLICT) return WRITE_CONFLICT;
        revisions.set(key, revision);
        return true;
      } catch (e) { console.error(e); return false; }
    });
    writeQueues.set(key, queued);
    return queued;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}
