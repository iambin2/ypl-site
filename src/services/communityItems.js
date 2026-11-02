/* 게시판 행을 화면이 쓰는 모양으로 묶는다. 저장소를 모르는 순수 함수만 둔다. */
const toItem = row => ({ ...row.payload, id: row.id, createdAt: row.created_at, secret: row.secret, hasPin: row.has_pin });

export function assembleCommunityItems(rows = []) {
  const byTime = (a, b) => (a.createdAt < b.createdAt ? -1 : 1);
  const comments = new Map();
  for (const row of rows) {
    if (!row.parent_id) continue;
    if (!comments.has(row.parent_id)) comments.set(row.parent_id, []);
    comments.get(row.parent_id).push(toItem(row));
  }
  return rows.filter(row => !row.parent_id)
    .map(row => ({ ...toItem(row), comments: (comments.get(row.id) || []).sort(byTime) }))
    .sort(byTime).reverse();
}

export const PIN_DENIED = {
  wrong_pin: "비밀번호가 일치하지 않습니다.",
  locked: "여러 번 틀려 15분 동안 잠겼습니다.",
  no_pin: "비밀번호가 없는 글입니다. 관리자에게 요청해 주세요.",
  stale: "다른 기기에서 대진표를 변경했습니다. 최신 결과를 확인한 뒤 다시 입력해 주세요.",
};

/* Supabase가 없는 환경(로컬 저장, 아티팩트)의 같은 동작. 지킬 공유 데이터가 없어 비밀번호는 보지 않는다. */
export function applyLocalWrite(items, { action, id, parentId, payload, secret }) {
  const patch = x => ({ ...x, ...payload, ...(secret === null || secret === undefined ? {} : { secret }) });
  const onComments = (x, change) => ({ ...x, comments: change(x.comments || []) });
  if (action === "create") {
    const item = { ...payload, id, createdAt: new Date().toISOString(), secret: Boolean(secret), comments: [] };
    return parentId ? items.map(x => x.id === parentId ? onComments(x, list => [...list, item]) : x) : [item, ...items];
  }
  if (action === "update") return items.map(x => x.id === id ? patch(x) : onComments(x, list => list.map(c => c.id === id ? patch(c) : c)));
  if (action === "delete") return items.filter(x => x.id !== id).map(x => onComments(x, list => list.filter(c => c.id !== id)));
  return items;
}
