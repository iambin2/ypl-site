/* The lit lamp at the end of a notice row means new (DESIGN.md "Lamps"). A notice is new for seven days after its date,
   until this browser opens it. What was opened is a per-viewer convenience, so it lives in localStorage and may come back empty. */
const KEY = "ypl-seen-notices", DAYS = 7, DAY_MS = 86400000;

function seen() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); }
}

export function isNewNotice(a, now = new Date()) {
  const n = String(a?.date ?? "").match(/\d+/g);
  if (!a?.id || !n || n.length < 3) return false;
  const age = (new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(+n[0], +n[1] - 1, +n[2])) / DAY_MS;
  return age >= 0 && age < DAYS && !seen().has(String(a.id));
}

export function markNoticeSeen(id) {
  if (!id) return;
  try {
    const ids = seen();
    ids.add(String(id));
    localStorage.setItem(KEY, JSON.stringify([...ids].slice(-100)));
  } catch { /* private mode: the lamp simply stays */ }
}
