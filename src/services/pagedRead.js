/* PostgREST는 한 번에 max-rows(Supabase 기본 1000)행까지만 돌려주고, 잘랐다는 오류를 내지 않는다.
   여러 대회를 한꺼번에 읽는 조회는 첫 응답이 그 크기에 닿으면 key 순서로 끝까지 나눠 다시 읽는다.
   그 아래에서는 지금과 같은 한 번의 조회다. query 는 부를 때마다 새 조회를 만드는 함수다. */
export const PAGE_ROWS = 1000;

export async function readAll(query, key = "id") {
  const first = await query();
  if (first.error || (first.data || []).length < PAGE_ROWS) return first;
  const data = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const page = await query().order(key).range(from, from + PAGE_ROWS - 1);
    if (page.error) return page;
    data.push(...(page.data || []));
    if ((page.data || []).length < PAGE_ROWS) return { data, error: null };
  }
}
