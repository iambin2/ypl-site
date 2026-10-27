/* Motion helpers ported from the lab (docs/redesign-glass/lab/glass-lab.html). Pure CSS + Web Animations, no dependency (H5).
   Nothing here touches the DOM at import time: tests load components that import this file under Node. */

export const EASE_OUT = "cubic-bezier(.22,1,.36,1)";
export const EASE_IN = "cubic-bezier(.5,0,.75,0)";
export const EASE_IN_OUT = "cubic-bezier(.65,0,.35,1)";

const mq = q => typeof window !== "undefined" && window.matchMedia?.(q).matches;
export const reduced = () => mq("(prefers-reduced-motion: reduce)");
export const desktop = () => mq("(min-width: 860px)");

/* a spring runs at its natural length, the same as --dur-snappy and --dur-soft in tokens.css; stretching it changes its feel */
export const DUR = { snappy: 400, soft: 670 };

let curves = null;
/* the CSS springs as WAAPI easings; browsers without linear() get the ease-out curve */
export function springs() {
  if (curves) return curves;
  let linear = false;
  try { document.body.animate([], { easing: "linear(0, 1)" }); linear = true; } catch { /* no linear() */ }
  const css = getComputedStyle(document.documentElement);
  curves = {
    snappy: linear ? css.getPropertyValue("--spring-snappy").trim() : EASE_OUT,
    soft: linear ? css.getPropertyValue("--spring-soft").trim() : EASE_OUT,
  };
  return curves;
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

export function centerOf(el) {
  if (!el) return [];
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

/* L5: one white light spreads from the moment of the win, no confetti. P2: a short buzz on Android. */
export function celebrate(x = innerWidth / 2, y = innerHeight * 0.38) {
  let layer = document.getElementById("ypl-burst");
  if (!layer) { layer = document.createElement("div"); layer.id = "ypl-burst"; layer.className = "burst"; layer.setAttribute("aria-hidden", "true"); document.body.append(layer); }
  const glow = document.createElement("i"), ring = document.createElement("b");
  for (const e of [glow, ring]) { e.style.setProperty("--x", x + "px"); e.style.setProperty("--y", y + "px"); layer.append(e); }
  if (reduced()) { ring.remove(); glow.animate([{ opacity: 0 }, { opacity: 0.8 }, { opacity: 0 }], { duration: 1200 }).finished.then(() => glow.remove()); }
  else {
    glow.animate([{ opacity: 0, transform: "scale(.12)" }, { opacity: 1, offset: 0.22 }, { opacity: 0, transform: "scale(1)" }], { duration: 1600, easing: EASE_OUT }).finished.then(() => glow.remove());
    ring.animate([{ opacity: 0.9, transform: "scale(.03)" }, { opacity: 0, transform: "scale(1)" }], { duration: 1150, easing: EASE_OUT }).finished.then(() => ring.remove());
  }
  try { navigator.vibrate?.([14, 50, 22]); } catch { /* not supported */ }
}

/* ---------- page transitions on the live page (I1, I2, I3) ----------
   No snapshots (H5): the old page is a live copy that fades out, the new page rises in, and a shared element
   flies between its two places. Glass keeps its real blur the whole time, so nothing pops when it ends. */
let flight = null;
/* true while a back transition renders the page it returns to: what was already seen there (Roll) does not play again */
let backing = false;
export const returning = () => backing;
const land = () => { if (!flight) return; flight.forEach(a => a.finish()); flight = null; };
const main = () => document.getElementById("ypl-main");
function ghostLayer() {
  let g = document.getElementById("ypl-ghosts");
  if (!g) { g = document.createElement("div"); g.id = "ypl-ghosts"; g.setAttribute("aria-hidden", "true"); (document.querySelector(".ypl") || document.body).append(g); }
  return g;
}
/* 복제본은 원래 부모 밖(#ypl-ghosts)에 놓인다. 부모에게서 물려받던 글자 모양(목록 제목의 굵기 등)을 그대로 들고 간다. */
const INHERITED = ["font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variation-settings", "font-feature-settings", "font-variant-numeric",
  "line-height", "letter-spacing", "word-spacing", "color", "text-align", "text-transform", "white-space", "word-break", "overflow-wrap", "text-wrap-mode", "text-wrap-style", "-webkit-font-smoothing"];
/* 가장 가까운 잘라 내는 조상이 보여 주는 너비: 말줄임으로 잘린 목록 제목은 잘린 한 줄 그대로 난다 */
function shownWidth(el, rect) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (getComputedStyle(p).overflowX === "visible") continue;
    return Math.min(rect.width, p.getBoundingClientRect().left + p.clientLeft + p.clientWidth - rect.left);
  }
  return rect.width;
}
function clone(el, rect, cls, host) {
  const c = el.cloneNode(true), cs = getComputedStyle(el);
  c.removeAttribute("id"); c.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
  c.querySelectorAll("iframe, video").forEach(e => { const p = document.createElement("div"); p.style.cssText = e.style.cssText; p.className = e.className; e.replaceWith(p); });
  // 캔버스(홈 표지의 무대)는 복제하면 비어 있다. 마지막 그림을 옮겨 그린다.
  const cvs = el.querySelectorAll("canvas");
  c.querySelectorAll("canvas").forEach((d, i) => { const s = cvs[i]; if (!s?.width) return; d.width = s.width; d.height = s.height; try { d.getContext("2d").drawImage(s, 0, 0); } catch { /* 읽을 수 없는 캔버스는 비워 둔다 */ } });
  c.classList.add(...cls.split(" "));
  c.inert = true;
  INHERITED.forEach(p => { const v = cs.getPropertyValue(p); if (v) c.style.setProperty(p, v); });
  const width = cls.includes("fly") ? shownWidth(el, rect) : rect.width;
  if (width < rect.width - 0.5) Object.assign(c.style, { overflow: "hidden", textOverflow: "ellipsis" });
  Object.assign(c.style, { left: rect.left + "px", top: rect.top + "px", width: width + "px", height: rect.height + "px" });
  host.append(c);
  // 복제본은 CSS 입장 애니메이션(대진 선 그리기, 우승 노드, .swap)을 처음부터 다시 튼다. 이미 끝난 모습으로 둔다.
  c.getAnimations({ subtree: true }).forEach(a => { if (a.animationName && a.timeline === document.timeline && a.effect.getComputedTiming().endTime !== Infinity) a.finish(); });
  return c;
}

/* mutate() must render the next page synchronously (flushSync). scrollY is where the new page starts. */
export function transition(mutate, { shared, dir = "forward", scrollY: nextY = 0 } = {}) {
  land();
  const m0 = main();
  if (!m0 || typeof m0.animate !== "function") { mutate(); window.scrollTo(0, nextY); return; }
  const move = !reduced(), anims = [], host = ghostLayer();
  const oldEl = shared && m0.querySelector(`[data-vt="${shared}"]`), oldRect = oldEl?.getBoundingClientRect();
  const ghost = clone(m0, m0.getBoundingClientRect(), "ghost", host);
  ghost.style.height = "auto";
  if (shared) ghost.querySelector(`[data-vt="${shared}"]`)?.style.setProperty("visibility", "hidden");
  const oldFly = oldEl && clone(oldEl, oldRect, "fly fly-skin", host);

  backing = dir === "back";
  try { mutate(); } finally { backing = false; }
  window.scrollTo(0, nextY);
  const m1 = main();
  if (!m1) { host.replaceChildren(); return; }

  // the landing spot is read before the page starts rising, so it lands once, exactly where it stays.
  // A CSS entrance on a wrapper of the target (.swap) would move that spot under the flight; the page rise below covers it,
  // so every .swap rise inside the new page is finished too instead of rising a second time inside the rising page.
  const target = shared && m1.querySelector(`[data-vt="${shared}"]`);
  m1.getAnimations({ subtree: true }).forEach(a => { if ((a.animationName === "y-swap" || (target && a.animationName && a.effect?.target?.contains?.(target))) && a.effect.getComputedTiming().endTime !== Infinity) a.finish(); });
  const nr = target?.getBoundingClientRect();

  const y = move ? (dir === "back" ? -16 : 16) : 0;
  anims.push(ghost.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateY(${-y / 4}px)` }], { duration: 200, easing: EASE_IN, fill: "forwards" }));
  anims.push(m1.animate([{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: "none" }], { duration: 480, easing: EASE_OUT, delay: 60, fill: "backwards" }));

  if (target && oldEl && nr.width > 0) {
    const s = oldRect.width / nr.width, dx = oldRect.left - nr.left, dy = oldRect.top - nr.top;
    const newFly = clone(target, nr, "fly fly-skin", host);
    target.style.visibility = "hidden";
    const t = { duration: move ? DUR.soft : 240, easing: move ? springs().soft : "linear" };
    if (target.classList.contains("card")) {
      const skin = document.createElement("div");
      skin.className = "card fly"; skin.style.borderRadius = getComputedStyle(target).borderRadius; host.insertBefore(skin, oldFly);
      const box = r => ({ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
      anims.push(skin.animate([box(oldRect), box(nr)], move ? t : { duration: 0 }));
    }
    const there = `translate(${dx}px,${dy}px) scale(${s})`, back = `translate(${-dx}px,${-dy}px) scale(${1 / s})`;
    anims.push(newFly.animate(move ? [{ transform: there, opacity: 0 }, { opacity: 1, offset: 0.4 }, { transform: "none", opacity: 1 }] : [{ opacity: 0 }, { opacity: 1 }], t));
    anims.push(oldFly.animate(move ? [{ transform: "none", opacity: 1 }, { opacity: 0, offset: 0.3 }, { transform: back, opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }], { ...t, fill: "forwards" }));
  } else oldFly?.remove();

  flight = anims;
  const me = anims;
  Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {
    if (flight !== me && flight) return;
    host.replaceChildren();
    m1.querySelectorAll("[data-vt]").forEach(n => { n.style.visibility = ""; });
    if (flight === me) flight = null;
  });
}

/* ---------- theme change (B6): the page fades to the next theme where it stands. The colour tokens are typed
   (@property) and fade on <html> (.theme-fade), so every element, gradient and glass follows them in place;
   nothing is copied, so nothing can move. ---------- */
let fadeEnd = 0;
export function themeFade(commit) {
  const root = document.documentElement;
  root.classList.add("theme-fade");
  commit();
  clearTimeout(fadeEnd);
  fadeEnd = setTimeout(() => root.classList.remove("theme-fade"), 480);
}

/* ---------- K3 liquid selection lens ----------
   The lens is two round caps and a body between them, drawn opaque inside one faded group so the pieces never
   show a seam. Only transforms move, so it keeps running on the compositor while the next page renders.
   The leading edge springs toward the target first, the trailing edge follows a beat later, and the lens
   thins a little while it is stretched, then settles as one drop. A new target mid-flight starts from where it is. */
const PILL_ON = ':scope > [aria-pressed="true"], :scope > [aria-current="page"], :scope > [aria-selected="true"], :scope > [data-current]';
export function placePill(box, animate, target) {
  const ind = box?.querySelector(":scope > .pill-ind");
  if (!ind) return;
  const on = target || box.querySelector(PILL_ON);
  if (!on) { ind.dataset.off = ""; return; }
  delete ind.dataset.off;
  const parts = [...ind.children], h = ind.offsetHeight || on.offsetHeight;
  const L = on.offsetLeft, R = L + on.offsetWidth, last = ind._lens;
  // Already there, or on its way there: a re-placement from a font load or a resize observer must not cut the move short.
  if (last && Math.abs(last.L - L) < 0.5 && Math.abs(last.R - R) < 0.5 && last.h === h) return;
  const from = last ? last.now?.() || [last.L, last.R] : null;
  last?.anims?.forEach(a => a.cancel());
  ind._lens = { L, R, h };
  const pose = (l, r, sy = 1) => [
    `translateX(${l}px) scaleY(${sy})`,
    `translateX(${l + h / 2}px) scale(${Math.max(0, r - l - h) / 100}, ${sy})`,
    `translateX(${r - h}px) scaleY(${sy})`,
  ];
  pose(L, R).forEach((t, k) => { if (parts[k]) parts[k].style.transform = t; });
  if (!animate || !from || parts.length < 3 || reduced() || typeof ind.animate !== "function") return;
  const [l0, r0] = from;
  if (Math.abs(l0 - L) < 0.5 && Math.abs(r0 - R) < 0.5) return;
  const right = L + R > l0 + r0;
  const lead = springTo(right ? r0 : l0, right ? R : L, 0, 0.34, 0.72).values;
  const trail = [...Array(Math.round(FPS / 15)).fill(right ? l0 : r0), ...springTo(right ? l0 : r0, right ? L : R, 0, 0.46, 0.9).values];
  const n = Math.max(lead.length, trail.length), at = (v, i) => v[Math.min(i, v.length - 1)];
  const frames = [[], [], []], track = [], wide = Math.max(r0 - l0, R - L);
  for (let i = 0; i < n; i++) {
    const [l, r] = right ? [at(trail, i), at(lead, i)] : [at(lead, i), at(trail, i)];
    const sy = 1 - Math.min(0.1, Math.max(0, r - l - wide) / (h * 6));
    pose(l, r, sy).forEach((t, k) => frames[k].push({ transform: t }));
    track.push([l, r]);
  }
  const anims = parts.slice(0, 3).map((part, k) => part.animate(frames[k], { duration: ((n - 1) * 1000) / FPS, easing: "linear" }));
  ind._lens.anims = anims;
  ind._lens.now = () => anims[0].playState === "running" ? track[Math.min(n - 1, Math.round(((anims[0].currentTime || 0) * FPS) / 1000))] : null;
}

/* I2 into a sheet, kept small: the pressed row stays where it is, and the sheet's title settles into place a short
   way with the lifting blur of a section reveal (J1), a beat after the sheet starts to rise. */
export function settleTitle(target) {
  if (!target || reduced() || typeof target.animate !== "function") return;
  target.animate([{ opacity: 0, transform: "translateY(6px)", filter: "blur(6px)" }, { opacity: 1, transform: "none", filter: "blur(0px)" }],
    { duration: 460, delay: 90, easing: EASE_OUT, fill: "backwards" });
}
