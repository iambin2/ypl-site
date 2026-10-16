// ============================================================================
// YPL 데이터 저장 어댑터
// 우선순위: (1) Claude 아티팩트(window.storage)  (2) Supabase  (3) localStorage
// - Supabase 환경변수가 설정되면 "모든 방문자에게 공유되는" 영구 저장이 됩니다.
// - 설정 안 하면 localStorage로 동작합니다(브라우저 1대에만 저장 = 진짜 공유 아님).
// ============================================================================
import { PostgrestClient } from "@supabase/postgrest-js";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 관리자 로그인 세션. 메모리에만 두므로 새로고침하면 관리자 모드와 함께 풀린다.
let session = null;
let refreshTimer = 0;

// 관리자로 로그인했으면 그 토큰, 아니면 anon key로 요청한다. 쓰기 권한은 DB가 토큰을 보고 판정한다.
const authFetch = (url, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session?.access_token || SUPA_KEY}`);
  return fetch(url, { ...init, headers });
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
  if (!response.ok) throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
  session = await response.json();
  clearTimeout(refreshTimer);
  // 만료 1분 전에 갱신한다. 실패하면 세션을 버리고, 다음 쓰기는 권한 오류로 끝난다.
  refreshTimer = setTimeout(
    () => requestToken("refresh_token", { refresh_token: session.refresh_token }).catch(signOutAdmin),
    Math.max(session.expires_in - 60, 30) * 1000,
  );
}

// 운영진 공용 아이디처럼 @ 가 없는 값은 내부 이메일로 바꾼다. .invalid 는 메일이 가지 않는 예약 도메인이라
// 누가 비밀번호 재설정을 요청해도 메일이 남의 손에 들어가지 않는다.
const adminEmailOf = login => (login.includes("@") ? login : `${login}@ypl.invalid`);

// Supabase가 없는 환경(로컬 저장, 아티팩트)은 지킬 공유 데이터가 없으니 확인 없이 들여보낸다.
export async function signInAdmin(login, password) {
  if (supa) await requestToken("password", { email: adminEmailOf(String(login || "").trim()), password });
}

export function signOutAdmin() {
  session = null;
  clearTimeout(refreshTimer);
}

export const STORAGE_MODE = (typeof window !== "undefined" && window.storage)
  ? "artifact"
  : (supa ? "supabase" : "local");

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
        .from("site_data").select("value").eq("key", key).maybeSingle();
      if (error) { console.error(error); return null; }
      return data ? data.value : null;
    } catch (e) { console.error(e); return null; }
  }
  // (3) localStorage 폴백
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

export async function setData(key, value) {
  if (typeof window !== "undefined" && window.storage) {
    try {
      const r = await window.storage.set(key, JSON.stringify(value), true);
      return !!r;
    } catch { return false; }
  }
  if (supa) {
    try {
      const { error } = await supa
        .from("site_data").upsert({ key, value }, { onConflict: "key" });
      if (error) { console.error(error); return false; }
      return true;
    } catch (e) { console.error(e); return false; }
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}
