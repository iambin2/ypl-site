import { getData, setData } from "../storage.js";

/* 방문자가 자유롭게 쓰는 공간(샘플과 파티 소개글, 사설 대진표)은 site_data 의 별도 행에 둔다.
   - 모든 화면이 받는 사이트 데이터 행에 섞지 않는다: 그 행은 매 방문마다 내려받고 512 KB 상한이 있다.
   - 공식 데이터(정규화 스키마, 기록, 랭킹)와 어떤 경로로도 이어지지 않는다. 이 모듈은 아래 두 키만 쓴다. */
export const SHOWCASE_KEY = "ypl_showcase_v1";
export const PRIVATE_BRACKETS_KEY = "ypl_private_brackets_v1";
export const COMMUNITY_KEYS = new Set([SHOWCASE_KEY, PRIVATE_BRACKETS_KEY]);
// site_data_max_512kb 제약보다 조금 아래에서 먼저 막아, DB 오류 대신 알아들을 수 있는 문장을 보여 준다.
export const COMMUNITY_MAX_BYTES = 500 * 1024;

const listOf = value => (Array.isArray(value?.items) ? value.items : []);

export async function readCommunity(key) {
  if (!COMMUNITY_KEYS.has(key)) throw new Error(`알 수 없는 저장 키: ${key}`);
  return listOf(await getData(key));
}

/* 저장 직전에 최신 목록을 다시 읽어 그 위에 바꾼다. 두 사람이 거의 동시에 쓰면 늦게 쓴 쪽이 이긴다.
   ponytail: 행 하나를 통째로 덮어쓴다. 동시 작성이 잦아지면 행 단위 테이블과 RPC로 옮긴다. */
export async function updateCommunity(key, mutate) {
  const current = await readCommunity(key);
  const next = mutate(current);
  if (!Array.isArray(next)) throw new Error("저장할 목록이 올바르지 않습니다.");
  const value = { items: next };
  if (new Blob([JSON.stringify(value)]).size > COMMUNITY_MAX_BYTES) throw new Error("저장 공간이 가득 찼습니다. 관리자에게 오래된 글 정리를 요청해 주세요.");
  if (!(await setData(key, value))) throw new Error("저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  return next;
}

/* 삭제와 수정 비밀번호. 공유 행은 누구나 읽을 수 있으니 숫자를 그대로 두지 않는다.
   ponytail: 4자리 해시는 마음먹으면 풀린다. 사이트 전체와 같은 수준의 가벼운 잠금이다. */
export async function hashPin(id, pin) {
  const bytes = new TextEncoder().encode(`ypl:${id}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function pinMatches(record, pin) {
  return Boolean(record?.pinHash && pin && (await hashPin(record.id, pin)) === record.pinHash);
}

export const newCommunityId = () => Math.random().toString(36).slice(2, 10);

/* 글이나 대진표를 바로 여는 주소. 폰은 공유 시트, 그 밖에는 클립보드에 복사한다. */
export function communityUrl(params) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams(params).toString();
  url.hash = "";
  return url.href;
}

export async function shareLink(params, title = "") {
  const url = communityUrl(params);
  if (matchMedia("(pointer: coarse)").matches && navigator.share) {
    try { await navigator.share({ url, title }); return "shared"; }
    catch (error) { if (error?.name === "AbortError") return "cancelled"; }
  }
  try { await navigator.clipboard.writeText(url); return "copied"; }
  catch { window.prompt("주소를 복사해 주세요.", url); return "prompted"; }
}
