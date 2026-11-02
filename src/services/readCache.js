/* 다시 방문한 화면이 지난 조회 결과로 바로 그려지도록 마지막 결과를 기억한다(stale-while-revalidate).
   화면은 들어올 때마다 새로 조회하고, 기억한 값은 그 조회가 끝나기 전의 첫 그림에만 쓴다.
   새 결과가 지난 결과와 같으면 지난 객체를 그대로 돌려줘, 화면이 같은 내용을 다시 그리지 않게 한다.
   쓰기 뒤의 다시 조회도 같은 길로 새 결과를 받으므로 기억한 값이 쓰기를 가리지 않는다.
   maxAgeMs 를 주면 그 시간 안의 재방문은 조회를 건너뛰고, 진행 중인 같은 조회가 있으면 그 결과를 함께 받는다.
   기록처럼 무거운 묶음을 방문자가 탭을 오갈 때마다 다시 받지 않기 위해서다. 관리자는 쓰고 바로 보므로 주지 않는다. */
const last = new Map();
const readAt = new Map();
const pending = new Map();

export function peekRead(key) {
  return last.get(key);
}

async function read(key, load) {
  const next = await load();
  readAt.set(key, Date.now());
  const prev = last.get(key);
  let same = false;
  try { same = prev !== undefined && JSON.stringify(prev) === JSON.stringify(next); } catch { same = false; }
  if (same) return prev;
  last.set(key, next);
  return next;
}

export function freshRead(key, load, maxAgeMs = 0) {
  if (!maxAgeMs) return read(key, load);
  if (Date.now() - (readAt.get(key) ?? -Infinity) < maxAgeMs) return Promise.resolve(last.get(key));
  if (!pending.has(key)) pending.set(key, read(key, load).finally(() => pending.delete(key)));
  return pending.get(key);
}
