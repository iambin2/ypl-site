/* Motion helpers. Pure CSS + Web Animations, no dependency (H5). Everything here moves by transform and opacity only, so it runs on the
   compositor and keeps its frames while the main thread draws the next page.
   Nothing here touches the DOM at import time: tests load components that import this file under Node. */

export const EASE_OUT = "cubic-bezier(.22,1,.36,1)";
export const EASE_IN = "cubic-bezier(.5,0,.75,0)";

const mq = q => typeof window !== "undefined" && window.matchMedia?.(q).matches;
export const reduced = () => mq("(prefers-reduced-motion: reduce)");
export const desktop = () => mq("(min-width: 860px)");

/* one length for each verb of the motion law, the --t-* of tokens.css: press, tone, leave, light. place, lift, seal and wait are the old
   verbs, folded into light until the pages that call them are rebuilt. */
export const DUR = { press: 100, tone: 160, leave: 260, light: 420, place: 420, lift: 420, seal: 420, wait: 420 };
/* things that arrive together arrive one step apart */
export const STAGGER = { row: 38, display: 62, tile: 62 };

/* ---------- the verbs of the motion law (DESIGN.md): pages and components move through these, never through their own .animate() ---------- */
/* place: what arrives switches on where it stands; nothing flies (DESIGN.md "Motion"). step spaces out what arrives together. */
export function place(els, { delay = 0, step = 0 } = {}) {
  if (reduced()) return;
  [].concat(els).forEach((el, i) => el?.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: DUR.tone, delay: Math.min(delay + i * step, DUR.light - DUR.tone), easing: EASE_OUT, fill: "backwards" }));
}
/* tone: a state changes in place (DESIGN.md "Motion"): what changed brightens once from dim to lit. A changed segment cell, a lamp. */
export function tone(els) {
  if (typeof document === "undefined") return;
  [].concat(els).forEach(el => el?.animate?.([{ opacity: .382 }, { opacity: 1 }], { duration: DUR.tone, easing: EASE_OUT }));
}
/* light: a board switches on (DESIGN.md "Motion", 2026-11-03). Panels, titles and section heads come on top to bottom 38 apart, each
   rising the last 12 into its place as it lights; then the lit bars and words of the displays 62 apart; pictures last. What lies below
   the first screen waits dark and lights the same way the first time it scrolls into view. A panel that holds a display keeps its
   unlit bars, so only its lit bars and words come on. */
const RISE = [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }];
let watcher = null;
function rise(el, delay) {
  el.classList.remove("rv");
  el.animate(RISE, { duration: DUR.light, delay, easing: EASE_OUT, fill: "backwards" });
}
/* a fifth of a screen before it arrives, so a reader does not meet panels still dark; top to bottom whatever order the observer reports */
function revealLater(els) {
  if (typeof IntersectionObserver !== "function") return;
  watcher ||= new IntersectionObserver(entries => {
    entries.filter(e => e.isIntersecting).sort((p, q) => p.boundingClientRect.top - q.boundingClientRect.top)
      .forEach((e, i) => { watcher.unobserve(e.target); rise(e.target, Math.min(i * STAGGER.row, DUR.leave)); });
  }, { rootMargin: "0px 0px 20% 0px" });
  els.forEach(el => { el.classList.add("rv"); watcher.observe(el); });
}
export function light(root, total = DUR.light) {
  if (!root || reduced() || typeof root.animate !== "function") return;
  const seen = el => el.getBoundingClientRect().top < innerHeight;
  const last = total - DUR.tone;
  /* [data-rise]: a grey line under a stack (a tie, a note) lights with the stack instead of standing lit before it.
     .btn--main: the main action is an inverted panel and comes on in its place in the order, not lit before the board.
     .champion, .podium-col, .lead, .ho-col: panels that hold a display but rise as a whole, like a counter; a line score's column rises as
     one, its three cells together */
  const panels = [...root.querySelectorAll(".pn:not(:has(.seg)), .inv:not(:has(.seg)), .counter, .champion, .podium-col, .lead, .ho-col, h1, .sh, .hof-crown, .btn--main, [data-rise]")]
    .filter(el => !el.parentElement.closest(".pn, .inv, .counter, .ho-col, .hof-crown, .sheet, .stack.chips, .chips"));
  panels.filter(seen).forEach((el, i) => rise(el, Math.min(i * STAGGER.row, DUR.leave)));
  revealLater(panels.filter(el => !seen(el)));
  const on = (els, start, step) => els.filter(seen).forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: DUR.tone, delay: Math.min(start + i * step, last), easing: EASE_OUT, fill: "backwards" }));
  // a counter's unit (일, 명) is a word of its display: it comes on with the lit bars, not before them
  on([...root.querySelectorAll(".seg .on, :is(.pn, .inv):has(.seg) > :not(.seg, :has(.seg)), .counter-board > :not(.seg), [data-light]")], Math.min(DUR.tone, last), STAGGER.display);
  on([...root.querySelectorAll("img")], last, 0);
}

/* the line under the chosen word of a row of words (the top bar's pages, page tabs) belongs to the word: it is the word's own ::before,
   exactly the word's width wherever fonts, zoom or the window take it. A change of word only animates it: the new word's line starts
   where the old one stood and settles into place by transform. Nothing is measured once and kept.
   A row is remembered by its name, so a page that draws its tabs afresh on a change of tab (the board, the brackets) still slides its
   line; a row that leaves forgets its line, so coming back to the page places it without moving. Returns whether the word changed. */
const lastLine = new Map();
const lineKey = row => row.getAttribute("aria-label") || row;
export function slideLine(row) {
  const cur = row?.querySelector(':scope > :is([aria-current="page"], [data-current], [aria-selected="true"])');
  if (!cur) return false;
  // measured from the line itself (its ::before), wherever the stylesheet places it inside the word's room
  const line = getComputedStyle(cur, "::before");
  const now = { left: cur.offsetLeft + (parseFloat(line.left) || 0), width: parseFloat(line.width) || cur.offsetWidth, row };
  const was = lastLine.get(lineKey(row));
  lastLine.set(lineKey(row), now);
  const moved = Boolean(was && now.width && (was.left !== now.left || was.width !== now.width));
  if (!moved || reduced() || typeof cur.animate !== "function") return moved;
  try {
    cur.animate([{ transform: `translateX(${was.left - now.left}px) scaleX(${was.width / now.width})` }, { transform: "none" }],
      { duration: DUR.light, easing: EASE_OUT, pseudoElement: "::before" });
  } catch { /* a browser without pseudo-element animation shows the line in place */ }
  return moved;
}
/* a row that unmounts forgets its line a beat later, unless the line was placed again meanwhile: by a row of the same name in the same
   commit, or by the same row mounting again (StrictMode's trial unmount) */
export function forgetLine(row) {
  if (!row) return;
  const key = lineKey(row), placed = lastLine.get(key);
  setTimeout(() => { if (placed?.row === row && lastLine.get(key) === placed) lastLine.delete(key); });
}

/* sampled at 120 a second so a 120Hz screen gets a real frame each refresh, not a straight line between two */
const FPS = 120;
/* a damped spring that starts with the velocity the finger left it with (H5) */
export function springTo(from, to, v0, response = 0.42, zeta = 0.86) {
  const w0 = (2 * Math.PI) / response, wd = w0 * Math.sqrt(1 - zeta * zeta), A = from - to, B = (v0 + zeta * w0 * A) / wd, amp = Math.hypot(A, B), out = [];
  for (let t = 0; t < 2; t += 1 / FPS) {
    const e = Math.exp(-zeta * w0 * t);
    out.push(to + e * (A * Math.cos(wd * t) + B * Math.sin(wd * t)));
    if (t > 0.05 && e * amp < 0.4) break;
  }
  out.push(to);
  return { values: out, duration: ((out.length - 1) * 1000) / FPS };
}

/* ---------- page change (DESIGN.md "Motion"): the old content goes at once; the new page's panels light top to bottom, 38 apart, and
   its displays after them, done by 260. Back does not replay: the page stands where it was left. The bars never move. ---------- */
const main = () => document.getElementById("ypl-main");
/* mutate() must render the next page synchronously (flushSync). scrollY is where the new page starts. */
export function transition(mutate, { dir = "forward", scrollY: nextY = 0 } = {}) {
  mutate();
  window.scrollTo(0, nextY);
  if (dir !== "back") light(main(), DUR.leave);
}

/* ---------- theme change: the page turns in one frame and a wash of the old ground leaves it (leave, 260, fast at first), so the change reads
   as a cross-fade without dwelling in the muddy middle of navy over white. Nothing is restyled frame by frame. The theme button's sun and
   moon turn in. Reduced motion turns in one frame. ---------- */
let themeTimer = 0;
export function themeTurn(commit) {
  const root = document.documentElement;
  if (reduced()) {
    root.classList.add("theme-turn");
    commit();
    requestAnimationFrame(() => root.classList.remove("theme-turn"));
    return;
  }
  // the page turns in one frame; a wash of the old ground lies over it and clears (opacity only, one layer, on the compositor)
  const old = getComputedStyle(root).getPropertyValue("--ground").trim();
  clearTimeout(themeTimer);
  root.classList.add("theme-fade");
  commit();
  const wash = document.createElement("div");
  wash.className = "theme-wash";
  wash.style.background = old;
  document.body.appendChild(wash);
  wash.animate([{ opacity: .618 }, { opacity: 0 }], { duration: DUR.leave, easing: EASE_OUT, fill: "forwards" }).finished.finally(() => wash.remove());
  themeTimer = setTimeout(() => root.classList.remove("theme-fade"), DUR.light);
}

/* what follows a control that swaps the content under it (page tabs, filter chips) lights again, as a page does: everything after it in
   the page, at every level up to the page itself, not only the first level that has a next sibling */
export function lightAfter(el) {
  for (let at = el; at && at.id !== "ypl-main"; at = at.parentElement)
    for (let n = at.nextElementSibling; n; n = n.nextElementSibling) light(n, DUR.leave);
}

/* into a sheet: the pressed row stays where it is, and the sheet's title lights a beat after the sheet starts to rise */
export function settleTitle(target) {
  if (!target || reduced() || typeof target.animate !== "function") return;
  target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.tone, delay: DUR.press, easing: EASE_OUT, fill: "backwards" });
}
