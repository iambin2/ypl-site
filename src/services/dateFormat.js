/* 사이트의 모든 날짜는 이 한 곳에서 같은 표기로 바뀐다.
   올해: "10월 4일 (일)", 다른 해: "2025년 10월 4일 (토)", 달까지만: "2026년 8월", 시각이 있으면 뒤에 "오후 4:00".
   받는 값: "2026-10-04", "2026.10.04", "2026.08", "2024년 11월", ISO 시각("2026-10-04T07:00:00Z")과 Date. */
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function parts(value) {
  if (value instanceof Date || /T\d{2}:\d{2}/.test(String(value ?? ""))) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes() };
  }
  const n = String(value ?? "").match(/\d+/g);
  if (!n || n[0].length !== 4) return null;
  const [y, m, d, h, min] = n.map(Number);
  if (!m || m > 12) return { y };
  return { y, m, d: d && d <= 31 ? d : null, h: n.length >= 5 ? h : null, min: n.length >= 5 ? min : null };
}

export function formatDate(value, { now = new Date(), time = false } = {}) {
  const p = parts(value);
  if (!p) return "";
  if (!p.m) return `${p.y}년`;
  if (!p.d) return `${p.y}년 ${p.m}월`;
  const weekday = WEEKDAY[new Date(p.y, p.m - 1, p.d).getDay()];
  const day = `${p.y === now.getFullYear() ? "" : `${p.y}년 `}${p.m}월 ${p.d}일 (${weekday})`;
  if (!time || p.h == null) return day;
  return `${day} ${p.h < 12 ? "오전" : "오후"} ${p.h % 12 || 12}:${String(p.min).padStart(2, "0")}`;
}
