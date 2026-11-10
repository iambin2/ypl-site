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
  /* what stands in a row the browser is skipping (content-visibility: auto, a long list's rows below the view) is not seen, and asking
     where it stands would lay each skipped row out for the answer (2026-11-10: the calculator's speed tab stood frozen 430 while its
     350 pictures were asked one by one) */
  const skipped = el => typeof el.checkVisibility === "function" && !el.checkVisibility({ contentVisibilityAuto: true });
  const last = total - DUR.tone;
  /* [data-rise]: a grey line under a stack (a tie, a note) lights with the stack instead of standing lit before it.
     .btn--main: the main action is an inverted panel and comes on in its place in the order, not lit before the board.
     .champion, .podium-col, .lead, .ho-col: panels that hold a display but rise as a whole, like a counter; a line score's column rises as
     one, its three cells together */
  const panels = [...root.querySelectorAll(".pn:not(:has(.seg)), .inv:not(:has(.seg)), .counter, .champion, .podium-col, .lead, .ho-col, h1, .sh, .hof-crown, .btn--main, [data-rise]")]
    .filter(el => !el.parentElement.closest(".pn, .inv, .counter, .ho-col, .hof-crown, .sheet, .stack.chips, .chips"));
  // a counter's unit (일, 명) is a word of its display: it comes on with the lit bars, not before them
  const displays = [...root.querySelectorAll(".seg .on, :is(.pn, .inv):has(.seg) > :not(.seg, :has(.seg)), .counter-board > :not(.seg), [data-light]")];
  const pictures = [...root.querySelectorAll("img")];
  /* every place is read before anything is written: a read after a write lays the whole new page out again, and the page was laid out
     four times over as it lit (2026-11-10, measured: a notice opening held one frame 57) */
  const box = new Map();
  for (const el of [...panels, ...displays, ...pictures]) if (!box.has(el)) box.set(el, skipped(el) ? null : el.getBoundingClientRect());
  const height = innerHeight;
  const seen = el => { const r = box.get(el); return Boolean(r) && r.top < height; };
  // a page returned to mid-scroll: what stands above the view is not seen and stays lit, so the stagger starts at the first line in view
  const above = el => box.get(el).bottom <= 0;
  panels.filter(el => seen(el) && !above(el)).forEach((el, i) => rise(el, Math.min(i * STAGGER.row, DUR.leave)));
  revealLater(panels.filter(el => !seen(el)));
  const on = (els, start, step) => els.filter(seen).forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: DUR.tone, delay: Math.min(start + i * step, last), easing: EASE_OUT, fill: "backwards" }));
  on(displays, Math.min(DUR.tone, last), STAGGER.display);
  on(pictures, last, 0);
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
   its displays after them, done by 260. Going back lights the page it returns to the same way, where it was left (2026-11-06: a back
   that only swapped the page read as a cut, so in and out are one motion). The bars never move. ---------- */
const main = () => document.getElementById("ypl-main");
/* mutate() must render the next page synchronously (flushSync). scrollY is where the new page starts. dir is kept for callers. */
export function transition(mutate, { scrollY: nextY = 0 } = {}) {
  mutate();
  window.scrollTo(0, nextY);
  light(main(), DUR.leave);
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

/* ---------- the four battle verbs (DESIGN.md "Battle"): the battle field is the one place a lit thing travels ----------
   Each returns a promise that settles when the verb is over, so the field can run a turn one message at a time.
   Reduced motion: nothing travels, the verb settles at once and only the cell's inversion (flash) remains. */
// A hidden page (another app on the phone, a background tab) stops the animation clock, and a turn must not wait on it forever:
// past its own length a verb is over, and it is put at its end.
function settled(anim) {
  if (!anim?.finished) return Promise.resolve();
  const length = anim.effect?.getComputedTiming?.().endTime || DUR.light;
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(resolve, length + DUR.press); });
  return Promise.race([anim.finished, late]).then(() => {}, () => {}).finally(() => {
    clearTimeout(timer);
    try { if (anim.playState !== "finished") anim.finish(); } catch { /* cancelled already */ }
  });
}
const centreOf = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
function toward(from, to, length) {
  const [ax, ay] = centreOf(from), [bx, by] = centreOf(to);
  const d = Math.hypot(bx - ax, by - ay) || 1;
  return [(bx - ax) / d * length, (by - ay) / d * length];
}
const OUT = DUR.press / DUR.leave; // 100 out, 160 back
/* a cell inverts once: its lit plate (.bt-hit) comes up and goes, the tone verb's length; hold keeps it for a Mega Evolution */
export function flash(plate, hold = 0) {
  if (!plate?.animate) return Promise.resolve();
  const total = DUR.tone + hold;
  return settled(plate.animate([{ opacity: 0 }, { opacity: 1, offset: Math.min(.5, DUR.press / 2 / total) }, { opacity: 1, offset: 1 - DUR.press / 2 / total }, { opacity: 0 }], { duration: total, easing: EASE_OUT }));
}
/* strike: a physical move, the attacker travels 32 toward its target and back */
export function strike(mon, target) {
  if (!mon?.animate || !target || reduced()) return Promise.resolve();
  const [dx, dy] = toward(mon, target, 32);
  return settled(mon.animate([{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px)`, offset: OUT, easing: EASE_IN }, { transform: "none" }], { duration: DUR.leave, easing: EASE_OUT }));
}
/* take: a Pokémon is hit, it travels 12 away from the blow and back while its cell inverts once */
export function take(mon, plate, from) {
  const moved = !mon?.animate || !from || reduced() ? Promise.resolve() : (() => {
    const [dx, dy] = toward(from, mon, 12);
    return settled(mon.animate([{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px)`, offset: OUT }, { transform: "none" }], { duration: DUR.leave, easing: EASE_OUT }));
  })();
  return Promise.all([moved, flash(plate)]);
}
/* chase: a line of 8px squares in the move's type colour switches on and off from the attacker to each target, 38 apart, each lit 100 */
export function chase(layer, from, targets, typeClass) {
  if (!layer || !from || !targets.length || reduced()) return Promise.resolve();
  const box = layer.getBoundingClientRect();
  const [ax, ay] = centreOf(from);
  const runs = targets.map(target => {
    const [bx, by] = centreOf(target);
    const count = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) / 20));
    return Array.from({ length: count + 1 }, (_, i) => {
      const dot = document.createElement("i");
      dot.className = "bt-dot " + typeClass;
      dot.style.transform = `translate(${ax - box.left + (bx - ax) * i / count - 4}px, ${ay - box.top + (by - ay) * i / count - 4}px)`;
      layer.appendChild(dot);
      return settled(dot.animate([{ opacity: 1 }, { opacity: 1 }], { duration: DUR.press, delay: i * STAGGER.row })).then(() => dot.remove());
    });
  });
  return Promise.all(runs.flat());
}
/* fall: a Pokémon faints, it sinks 12 as it goes dark, the reverse of light */
export function fall(mon) {
  if (!mon?.animate || reduced()) return Promise.resolve();
  return settled(mon.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(12px)" }], { duration: DUR.leave, easing: EASE_IN, fill: "forwards" }));
}
/* a Pokémon sent in lights as anything arrives */
export function enter(mon) {
  if (!mon?.animate || reduced()) return Promise.resolve();
  return settled(mon.animate(RISE, { duration: DUR.light, easing: EASE_OUT }));
}
/* the page being left dims (DESIGN.md "Motion", Page change) while what it waits on is read; returns the animations, so a refusal can
   cancel them and stand the page up again */
export function dimAway(els) {
  if (reduced()) return [];
  return [].concat(els).filter(Boolean).map(el => el.animate([{ opacity: 1 }, { opacity: .382 }], { duration: DUR.leave, easing: EASE_IN, fill: "forwards" }));
}
/* the screen being left goes all the way out, from wherever its dimming stands, the moment before the next one takes its place (the
   battle's going in and going back, 2026-11-09): returns the animations, so the next screen can let them go as it lights */
export function goOut(els) {
  if (reduced()) return [];
  return [].concat(els).filter(Boolean).map(el => el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: DUR.leave, easing: EASE_IN, fill: "forwards" }));
}
/* one set of keys hands its place to another (the moves to the target picker and back, 2026-11-09): what is left dims to the locked
   keys' light (press length), and what comes up starts from that light, so the swap is never lit keys vanishing in one frame */
export function handOff(els) {
  if (reduced()) return Promise.resolve();
  return Promise.all([].concat(els).filter(Boolean).map(el => settled(el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: .382 }], { duration: DUR.press, easing: EASE_IN, fill: "forwards" }))));
}
/* the team preview arrives as a scene of its own (DESIGN.md "Battle", Going in): the other side's six switch on one after another,
   62 apart, as a board announces a line-up, then a beat, then ours rise into their places the same way. first, then: the elements in
   the order they light (a place may be empty: what is drawn a moment later takes its turn with elapsed, the time since the scene began).
   still: one of them that lights without rising (the last part of a column that scrolls: 12 under its place it reaches out of the
   column and draws its scrollbar). Reduced motion: they stand at once. */
export function lineup(first, then, elapsed = 0, still = null) {
  if (reduced()) return;
  [...first, ...then].forEach((el, i) => el?.animate?.(el === still ? [{ opacity: 0 }, { opacity: 1 }] : RISE, { duration: DUR.light, delay: Math.max(0, i * STAGGER.display + (i >= first.length ? DUR.tone : 0) - elapsed), easing: EASE_OUT, fill: "backwards" }));
}
/* the HP gauge: changed cells switch as a score's bars do, 38 apart, from the right when it falls and from the left when it rises */
export function gauge(cells, before, after, offValue) {
  if (reduced() || before === after) return Promise.resolve();
  const changed = cells.map((el, i) => ({ el, i })).filter(({ i }) => (i < before) !== (i < after));
  if (after < before) changed.reverse();
  const [from, to] = after < before ? [1, offValue] : [offValue, 1];
  return Promise.all(changed.map(({ el }, k) => settled(el.animate([{ opacity: from }, { opacity: from }, { opacity: to }], { duration: DUR.press, delay: k * STAGGER.row, fill: "backwards" }))));
}
export const pause = ms => new Promise(resolve => setTimeout(resolve, reduced() ? 0 : ms));

/* a 연승 도전 run climbs (Streak.jsx): once the board stands, what was just won brightens once in its new light (tone), then what comes
   next lights rising the last 12, one after another 62 apart: a step of the floor, or a floor of the tower */
export function climb(won, next) {
  if (reduced()) return;
  [].concat(won).forEach(el => el?.animate?.([{ opacity: .382 }, { opacity: 1 }], { duration: DUR.tone, delay: DUR.light, easing: EASE_OUT, fill: "backwards" }));
  [].concat(next).forEach((el, i) => el?.animate?.(RISE, { duration: DUR.light, delay: DUR.light + DUR.tone + i * STAGGER.display, easing: EASE_OUT, fill: "backwards" }));
}

/* into a sheet: the pressed row stays where it is, and the sheet's title lights a beat after the sheet starts to rise */
export function settleTitle(target) {
  if (!target || reduced() || typeof target.animate !== "function") return;
  target.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.tone, delay: DUR.press, easing: EASE_OUT, fill: "backwards" });
}
