/* site_data 는 행을 통째로 덮어쓰므로, 읽은 뒤에 누가 먼저 저장했으면 쓰지 않는다.
   revision 은 DB 트리거가 올린다(docs/db/backend_hardening.sql). 읽은 값과 달라졌으면 0행이 바뀐다.
   revision 을 모르는 행(아직 없는 행, 위 SQL 적용 전의 행)은 지킬 기준이 없어 예전처럼 넣는다. */
export const WRITE_CONFLICT = "conflict";

export async function writeRevisioned(table, key, value, revision) {
  const { data, error } = revision == null
    ? await table.upsert({ key, value }, { onConflict: "key" }).select()
    : await table.update({ value }).eq("key", key).eq("revision", revision).select("revision");
  if (error) throw error;
  if (revision != null && !data.length) return WRITE_CONFLICT;
  return data?.[0]?.revision;
}

// write 는 매번 최신 행을 다시 읽어 그 위에 쓴다.
export async function retryOnConflict(write, attempts = 4) {
  let result = WRITE_CONFLICT;
  for (let i = 0; i < attempts && result === WRITE_CONFLICT; i += 1) result = await write();
  return result;
}
