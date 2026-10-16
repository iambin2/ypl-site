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
export function pushHistory(state, url) {
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
