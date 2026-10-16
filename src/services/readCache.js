/* 다시 방문한 화면이 지난 조회 결과로 바로 그려지도록 마지막 결과를 기억한다(stale-while-revalidate).
   화면은 들어올 때마다 새로 조회하고, 기억한 값은 그 조회가 끝나기 전의 첫 그림에만 쓴다.
   새 결과가 지난 결과와 같으면 지난 객체를 그대로 돌려줘, 화면이 같은 내용을 다시 그리지 않게 한다.
   쓰기 뒤의 다시 조회도 같은 길로 새 결과를 받으므로 기억한 값이 쓰기를 가리지 않는다. */
const last = new Map();

export function peekRead(key) {
  return last.get(key);
}

export async function freshRead(key, load) {
  const next = await load();
  const prev = last.get(key);
  let same = false;
  try { same = prev !== undefined && JSON.stringify(prev) === JSON.stringify(next); } catch { same = false; }
  if (same) return prev;
  last.set(key, next);
  return next;
}
