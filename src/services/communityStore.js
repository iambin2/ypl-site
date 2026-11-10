import { getData, setData, supa } from "../storage.js";
import { readAll } from "./pagedRead.js";
import { PIN_DENIED, applyLocalWrite, assembleCommunityItems } from "./communityItems.js";

/* 방문자가 자유롭게 쓰는 공간(자유게시판, 샘플과 파티 소개글, 사설 대진표)은 community_items 표에 행 단위로 둔다.
   - 쓰기는 community_write 함수로만 들어간다. 한 사람의 쓰기가 남의 글을 건드릴 수 없고, 비밀번호는 서버가 닫힌 표와 대조한다.
   - 공식 데이터(정규화 스키마, 기록, 랭킹)와 어떤 경로로도 이어지지 않는다. 아래 키는 화면이 쓰는 이름이다. */
export const FREE_BOARD_KEY = "ypl_board_v1";
export const SHOWCASE_KEY = "ypl_showcase_v1";
export const PRIVATE_BRACKETS_KEY = "ypl_private_brackets_v1";
const BOARD_OF = { [FREE_BOARD_KEY]: "free", [SHOWCASE_KEY]: "showcase", [PRIVATE_BRACKETS_KEY]: "private_bracket" };

// a failed read's sentence: the server's own Korean when it has one, never the browser's exception (TypeError: Failed to fetch)
export const readErrorText = (error, fallback) => (/[가-힣]/.test(error?.message || "") ? error.message : fallback);

export async function readCommunity(key) {
  if (!BOARD_OF[key]) throw new Error(`알 수 없는 저장 키: ${key}`);
  if (!supa) {
    const value = await getData(key);
    return Array.isArray(value?.items) ? value.items : [];
  }
  const { data, error } = await readAll(() => supa.from("community_items")
    .select("id, parent_id, payload, secret, has_pin, created_at").eq("board", BOARD_OF[key]));
  if (error) throw new Error(error.message);
  return assembleCommunityItems(data || []);
}

async function write(key, action, { id, parentId = null, payload = null, secret = null, pin = "" }) {
  if (!supa) {
    if (action === "verify") return "ok";
    const next = applyLocalWrite(await readCommunity(key), { action, id, parentId, payload, secret });
    if (!(await setData(key, { items: next }))) throw new Error("잠시 뒤 다시 시도해 주세요.");
    return "ok";
  }
  const { data, error } = await supa.rpc("community_write", {
    p_action: action, p_board: BOARD_OF[key], p_id: id, p_parent_id: parentId, p_payload: payload, p_secret: secret, p_pin: pin,
  });
  if (error) throw new Error(error.message);
  if (data !== "ok" && action !== "verify") throw new Error(PIN_DENIED[data] || "잠시 뒤 다시 시도해 주세요.");
  return data;
}

// 쓰기 전에 비밀번호만 확인한다. ok 가 아니면 PIN_DENIED 의 이유로 안내한다.
export const verifyCommunityPin = (key, id, pin) => write(key, "verify", { id, pin });
export const createCommunityItem = (key, id, payload, { parentId, secret, pin } = {}) => write(key, "create", { id, parentId, payload, secret, pin });
export const patchCommunityItem = (key, id, payload, { secret, pin, expectedUpdatedAt } = {}) => write(key, "update", {
  id, payload: key===PRIVATE_BRACKETS_KEY ? {...payload,_expectedUpdatedAt:expectedUpdatedAt??null} : payload, secret, pin,
});
export const deleteCommunityItem = (key, id, pin) => write(key, "delete", { id, pin });

export const newCommunityId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);

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
