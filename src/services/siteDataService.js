import { STORAGE_MODE, getData, setData, supa } from "../storage.js";

// 운영 사이트의 기존 공유 데이터 키를 한 곳에서 관리한다.
// 이 값은 현재 production Supabase의 site_data / ypl_data_v4와 호환되어야 한다.
export const SITE_DATA_KEY = "ypl_data_v4";

// 재방문은 마지막으로 읽은 site_data 로 바로 그리고 새로 읽은 값으로 바꾼다(DESIGN.md "Motion", First open).
// 보이기만 하는 사본이다: 저장은 서버에서 읽은 revision 이 있어야 나가므로(storage.js) 이 사본 위의 편집은 쓰이지 않는다.
const SEEN_KEY = "ypl-seen-site";
let seen, seenText = null;
export function seenSiteData() {
  if (seen !== undefined) return seen;
  seen = null;
  if (STORAGE_MODE === "supabase") try { seenText = localStorage.getItem(SEEN_KEY); seen = JSON.parse(seenText); } catch { seen = null; }
  return seen;
}
// 새 값이 사본과 같으면 사본을 그대로 돌려준다. 화면은 같은 값을 다시 그리지 않는다.
function remember(value) {
  const text = JSON.stringify(value);
  if (text === seenText) return seenSiteData();
  try { localStorage.setItem(SEEN_KEY, text); } catch { /* 다음 방문은 읽기를 기다린다 */ }
  return value;
}

export async function loadSiteData() {
  try {
    const first = await getData(SITE_DATA_KEY);
    if (STORAGE_MODE !== "supabase") return first;
    if (first) return remember(first);
    // 폰의 불안한 네트워크에서는 한 번의 실패가 흔하다. 씨드를 보이기 전에 한 번 더 읽는다.
    await new Promise(resolve => setTimeout(resolve, 1000));
    const second = await getData(SITE_DATA_KEY);
    return second && remember(second);
  } catch {
    return null;
  }
}

export async function saveSiteData(value) {
  try {
    return await setData(SITE_DATA_KEY, value);
  } catch (error) {
    console.error(error);
    return false;
  }
}

// 공개 표시가 없는 질문의 답은 운영진만 읽는 표에 있다(docs/db/private_answers.sql). 방문자와 표가 없을 때는 빈 결과다.
// subject 는 신청서 응답 id 또는 대회 신청 id. 화면에서 합쳐 보이기만 하고 site_data 에 다시 쓰지 않는다.
export async function loadPrivateAnswers(subjects) {
  const ids = [...new Set((subjects || []).filter(Boolean).map(String))];
  if (STORAGE_MODE !== "supabase" || !ids.length) return new Map();
  const { data, error } = await supa.from("form_private_answers").select("subject, answers").in("subject", ids);
  if (error) { console.warn("private answers read failed", error); return new Map(); }
  return new Map((data || []).map(row => [row.subject, row.answers]));
}

// 대회에 연결하지 않은 신청서의 응답. 방문자는 행을 쓸 수 없으므로 DB 함수가 응답 하나만 덧붙인다.
export async function submitAnnouncementResponse(announcementId, answers) {
  if (STORAGE_MODE === "supabase") {
    const { error } = await supa.rpc("submit_announcement_response", { p_announcement_id: announcementId, p_answers: answers });
    if (error) throw new Error(error.message);
    return true;
  }
  const base = await getData(SITE_DATA_KEY);
  const response = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), answers };
  const announcements = (base?.announcements || []).map(a => a.id !== announcementId ? a
    : { ...a, form: { ...a.form, responses: [...(a.form?.responses || []), response] } });
  return setData(SITE_DATA_KEY, { ...base, announcements });
}
