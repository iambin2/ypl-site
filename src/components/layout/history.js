/* History entries carry an index, so a back or forward move knows its direction (I3) and the scroll
   position it left (I4). Every page that pushes its own entry (an open bracket) goes through pushHistory, which keeps
   the index in step and remembers where the page it leaves was scrolled. backWith names the shared element the page
   wants to fly on the way back. */
let at = 0, hint = null;
const scrolls = {};
export const historyIndex = () => (Number.isInteger(window.history.state?.idx) ? window.history.state.idx : 0);
export function initHistory() {
  window.history.scrollRestoration = "manual";
  if (!Number.isInteger(window.history.state?.idx)) window.history.replaceState({ ...(window.history.state || {}), idx: 0 }, "");
  at = historyIndex();
}
/* A tab left open across a deploy keeps running the old build: the head script (vite.config.js) asks only when the page loads.
   So the page asks again when it comes back into view and every five minutes, and once a newer build is out, the next move
   within the site loads its address afresh instead of drawing it with the old code. window.__YPL_BUILD__ is set by the head
   script in a production build only; the dev server never asks. */
const BUILD = typeof window !== "undefined" ? window.__YPL_BUILD__ : null;
let newer = false, asked = 0;
// force: coming back into view always asks (it is rare and the answer is a few bytes); moves within the site ask once a minute
export function checkBuild(force = false) {
  if (!BUILD || newer || (!force && Date.now() - asked < 60_000)) return Promise.resolve(newer);
  asked = Date.now();
  return fetch(`${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(p => { if (typeof p?.version === "string" && p.version.trim() && p.version.trim() !== BUILD) newer = true; return newer; }, () => newer);
}
if (BUILD) {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void checkBuild(true); });
  setInterval(() => void checkBuild(), 5 * 60_000);
}

export function pushHistory(state, url) {
  // a newer build is out: the address is loaded afresh, on the new build
  if (newer) { window.location.assign(String(url)); return historyIndex(); }
  void checkBuild();
  scrolls[historyIndex()] = window.scrollY;
  at = historyIndex() + 1;
  window.history.pushState({ ...state, idx: at }, "", url);
  return at;
}
/* A page whose own state follows history (an open bracket) registers here instead of listening to popstate: App runs these
   inside the page transition, after the old screen is copied, so the page's change and the view land in one render. */
export const popHandlers = new Set();
export function backWith(shared) { hint = shared; window.history.back(); }
/* called once per popstate, before the page changes: where we were, where we are, where to scroll and the shared element to fly */
export function popped() {
  const from = at, to = historyIndex(), shared = hint;
  scrolls[from] = window.scrollY;
  at = to; hint = null;
  return { from, to, shared, scrollY: scrolls[to] || 0 };
}
