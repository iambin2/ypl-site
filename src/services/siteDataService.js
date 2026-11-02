import { STORAGE_MODE, getData, setData, supa } from "../storage.js";

// 운영 사이트의 기존 공유 데이터 키를 한 곳에서 관리한다.
// 이 값은 현재 production Supabase의 site_data / ypl_data_v4와 호환되어야 한다.
export const SITE_DATA_KEY = "ypl_data_v4";

export async function loadSiteData() {
  try {
    const first = await getData(SITE_DATA_KEY);
    if (first || STORAGE_MODE !== "supabase") return first;
    // 폰의 불안한 네트워크에서는 한 번의 실패가 흔하다. 씨드를 보이기 전에 한 번 더 읽는다.
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await getData(SITE_DATA_KEY);
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
