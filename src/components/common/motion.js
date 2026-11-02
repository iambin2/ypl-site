/* Motion helpers. Pure CSS + Web Animations, no dependency (H5). Everything here moves by transform and opacity only, so it runs on the
   compositor and keeps its frames while the main thread draws the next page.
   Nothing here touches the DOM at import time: tests load components that import this file under Node. */

export const EASE_OUT = "cubic-bezier(.22,1,.36,1)";
export const EASE_IN = "cubic-bezier(.5,0,.75,0)";
export const EASE_IN_OUT = "cubic-bezier(.65,0,.35,1)";

const mq = q => typeof window !== "undefined" && window.matchMedia?.(q).matches;
export const reduced = () => mq("(prefers-reduced-motion: reduce)");
export const desktop = () => mq("(min-width: 860px)");

/* one length for each verb of the motion law, the --t-* of tokens.css: press, tone, leave, light. place, lift, seal and wait are the old
   verbs, folded into light until the pages that call them are rebuilt. */
export const DUR = { press: 100, tone: 160, leave: 260, light: 420, place: 420, lift: 420, seal: 420, wait: 420 };
/* things that arrive together arrive one step apart */
export const STAGGER = { row: 38, display: 62, tile: 62 };

/* ---------- the verbs of the motion law (DESIGN.md): pages and components move through these, never through their own .animate() ---------- */
/* place: what arrives rises the shortest way into its place. step spaces out what arrives together. */
export function place(els, { delay = 0, step = 0, y = 12 } = {}) {
  if (reduced()) return;
  [].concat(els).forEach((el, i) => el?.animate([{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: "none" }],
    { duration: DUR.place, delay: delay + i * step, easing: EASE_OUT, fill: "backwards" }));
}
/* light: a board switches on (DESIGN.md "Motion", first open). Nothing moves, only opacity: panels come on top to bottom 38 apart,
   then the lit bars and titles 62 apart, pictures last; everything has landed by 420. Panels that hold a display keep their unlit bars
   from the first paint, so only their lit bars and words come on. Only what is on the first screen lights; the rest simply stands. */
export function light(root) {
  if (!root || reduced() || typeof root.animate !== "function") return;
  const seen = el => el.getBoundingClientRect().top < innerHeight;
  const on = (els, start, step) => els.filter(seen).forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: DUR.tone, delay: Math.min(start + i * step, DUR.light - DUR.tone), easing: EASE_OUT, fill: "backwards" }));
  on([...root.querySelectorAll(".pn:not(:has(.seg))")], 0, STAGGER.row);
  on([...root.querySelectorAll(".seg .on, .pn:has(.seg) > :not(.seg, :has(.seg)), [data-light]")], DUR.tone, STAGGER.display);
  on([...root.querySelectorAll("img")], DUR.leave, 0);
}
/* stand: a case is heavier than a word: it comes up further on the larger spring and lands */
export function stand(els, { delay = STAGGER.tile, step = STAGGER.tile } = {}) {
  if (reduced()) return;
  [].concat(els).forEach((el, i) => el?.animate([{ opacity: 0, transform: "translateY(32px) scale(.976)" }, { opacity: 1, offset: .382 }, { opacity: 1, transform: "none" }],
    { duration: DUR.lift, delay: delay + i * step, easing: springs().lift, fill: "backwards" }));
}
/* seal: one solid slanted band crosses a case's window behind what it holds. Once, for an event, never for a habit. */
export function seal(caseEl, delay = 0) {
  if (reduced()) return;
  caseEl?.querySelector(".case-band")?.animate([{ transform: "translateX(-162%) skewX(-12deg)" }, { transform: "translateX(340%) skewX(-12deg)" }], { duration: DUR.seal, delay, easing: EASE_IN_OUT });
}

/* the scoreboard has no spring: a board switches on. Old callers that still ask for one get the ease-out curve. */
export function springs() { return { spring: EASE_OUT, lift: EASE_OUT }; }

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

export function centerOf(el) {
  if (!el) return [];
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

/* ---------- page change (DESIGN.md "Motion"): the old content goes at once; the new page's blocks light on top to bottom, 38 apart,
   done by 260. Back does not replay: the page stands where it was left. The bars never move and nothing flies between pages. ---------- */
const main = () => document.getElementById("ypl-main");
/* mutate() must render the next page synchronously (flushSync). scrollY is where the new page starts. */
export function transition(mutate, { dir = "forward", scrollY: nextY = 0 } = {}) {
  mutate();
  window.scrollTo(0, nextY);
  const m = main();
  if (dir === "back" || reduced() || typeof m?.animate !== "function") return;
  // the blocks on the first screen, top to bottom: the page's own children, or its sections' children when it is one column of sections
  const top = m.children.length === 1 ? [...m.firstElementChild.children] : [...m.children];
  const seen = top.filter(el => el.getBoundingClientRect().top < innerHeight);
  const last = Math.floor((DUR.leave - DUR.press) / STAGGER.row);
  seen.forEach((el, i) => {
    const delay = Math.min(i, last) * STAGGER.row;
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.leave - delay, delay, easing: EASE_OUT, fill: "backwards" });
  });
}

/* ---------- theme change (B6): nothing moves. The page turns in one frame with nothing over it, and a control's own tone transition sits
   this frame out, so no surface trails the words on it. ---------- */
export function themeTurn(commit) {
  const root = document.documentElement;
  root.classList.add("theme-turn");
  commit();
  requestAnimationFrame(() => root.classList.remove("theme-turn"));
}

/* I2 into a sheet, kept small: the pressed row stays where it is, and the sheet's title settles into place a short
   way, a beat after the sheet starts to rise. */
export function settleTitle(target) {
  if (!target || reduced() || typeof target.animate !== "function") return;
  target.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
    { duration: DUR.place, delay: DUR.press, easing: EASE_OUT, fill: "backwards" });
}
