/* Glass lights up where it is touched: a bloom of light rises inside the glass under the finger and the rim catches it
   nearest the finger, held while the finger stays and let go after it lifts. The same ceiling light (C3) answering the
   hand, as the home hall's beams answer the pointer: the glass stays still, only light moves.
   One delegated listener; nothing here touches the DOM at import time. Reduced motion keeps the press without it. */
import { EASE_OUT, reduced } from "./motion.js";

const SEL = ".glass, .ypl-btn--glass, .ypl-btn--tonal, .btn:not(.btn-primary):not(.btn-danger):not(.tb-main-btn)";
const IN = 200, OUT = 560;

function glint(el, e) {
  const r = el.getBoundingClientRect(), d = Math.max(r.height * 2.6, 120);
  const g = document.createElement("span"), i = document.createElement("i"), b = document.createElement("b");
  g.className = "glint"; g.append(i, b); g.setAttribute("aria-hidden", "true");
  g.style.cssText = `--gx0:${e.clientX - r.left}px;--gy0:${e.clientY - r.top}px;--gd:${d}px;--gr:${d * .6}px`;
  el.prepend(g);
  const a = g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: IN, easing: EASE_OUT, fill: "forwards" });
  i.animate([{ transform: "scale(.35)" }, { transform: "none" }], { duration: IN + OUT, easing: EASE_OUT, fill: "forwards" });
  const off = () => {
    removeEventListener("pointerup", off); removeEventListener("pointercancel", off);
    a.finished.then(() => g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT, easing: EASE_OUT, fill: "forwards" }).finished)
      .catch(() => {}).finally(() => g.remove());
  };
  addEventListener("pointerup", off); addEventListener("pointercancel", off);
}

let started = false;
export function startGlint() {
  if (started || typeof window === "undefined") return;
  started = true;
  document.addEventListener("pointerdown", e => {
    if (e.button || reduced()) return;
    const el = e.target.closest?.(SEL);
    if (el && !el.disabled && !el.closest("#ypl-ghosts, .fly")) glint(el, e);
  }, { capture: true, passive: true });
}
