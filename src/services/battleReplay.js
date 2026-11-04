/* 리플레이의 자리 (DESIGN.md "Battle", Replay). 끝난 배틀의 기록을 줄로 세어, 리플레이가 설 수 있는 자리를 셈한다.
   자리는 보여 줄 기록 줄의 수다: 처음(팀 미리보기, 없으면 배틀 시작), 각 턴이 열리는 줄, 끝. 화면과 상관없는 순수한 계산이다. */

// { total, stops: [{ turn, at, end? }] }, in order; the first stop is the team preview (turn 0), the last the end of the log
export function replayStops(log) {
  const lines = String(log ?? "").split("\n");
  const total = lines.length;
  const preview = lines.findIndex(l => l.startsWith("|teampreview"));
  const begin = preview >= 0 ? preview : lines.findIndex(l => l === "|start" || l.startsWith("|start|"));
  const stops = [{ turn: 0, at: begin >= 0 ? begin + 1 : Math.min(1, total) }];
  lines.forEach((line, i) => {
    const m = /^\|turn\|(\d+)/.exec(line);
    if (m && i + 1 > stops[stops.length - 1].at) stops.push({ turn: Number(m[1]), at: i + 1 });
  });
  const last = stops[stops.length - 1];
  if (last.at < total) stops.push({ turn: last.turn, at: total, end: true });
  else last.end = true;
  return { total, stops };
}

// the stop a position stands on: the last one at or before it
export function stopIndex(stops, at) {
  let i = 0;
  while (i + 1 < stops.length && stops[i + 1].at <= at) i += 1;
  return i;
}
// where the next turn opens, or null at the end
export const nextStop = (stops, at) => stops.find(s => s.at > at)?.at ?? null;
// where this turn opened, or the one before when the position stands on an opening; null at the start
export function prevStop(stops, at) {
  for (let i = stops.length - 1; i >= 0; i--) if (stops[i].at < at) return stops[i].at;
  return null;
}
// the opening of turn n (a link's ?turn=n): 0 is the team preview, past the last turn is the end
export function turnStop(stops, turn) {
  const n = Number(turn);
  if (!Number.isFinite(n) || n <= 0) return stops[0].at;
  return stops.find(s => !s.end && s.turn === n)?.at ?? stops.find(s => s.turn >= n)?.at ?? stops[stops.length - 1].at;
}
// the first lines of a log, as the stage reads them; a position at or past the end is the whole log
export const logUpTo = (log, at) => (at == null ? log : String(log ?? "").split("\n").slice(0, Math.max(1, at)).join("\n"));

/* 결정의 시계 (DESIGN.md "Battle", The clock; docs/db/battle_timer.sql): 마감까지 남은 초. 마감이 지났으면 0, 마감이 없으면 null. */
export function secondsLeft(deadline, now = Date.now()) {
  const at = deadline ? Date.parse(deadline) : NaN;
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : null;
}
