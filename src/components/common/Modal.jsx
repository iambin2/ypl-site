import React, { useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import { EASE_IN, EASE_OUT, desktop, reduced, settleTitle, springTo, springs } from "./motion.js";

/* 닫힘 애니메이션 — 떠 있는 층은 부모가 상태를 지우는 순간 사라진다.
   그래서 React 가 떼어 낸 노드를 그 자리에 잠깐 다시 붙여 사라지는 모습만 재생하고 지운다.
   React 는 이 노드를 다시 건드리지 않는다. StrictMode 의 가짜 해제는 노드가 붙어 있으므로 건너뛴다.
   - replacedBy: 같은 종류의 새 층이 이미 떠 있으면(대화상자에서 대화상자로) 겹치지 않게 그대로 바꾼다.
   - inPlace: 부모 안에서 위치가 정해지는 층(드롭다운 메뉴)은 부모가 사라졌으면 재생하지 않는다.
   - exit(node): 사라지는 움직임을 직접 돌려준다(Web Animations). 없으면 .is-closing 의 CSS 애니메이션을 기다린다. */
export function useExitAnimation(ref, { replacedBy = null, inPlace = false, exit = null } = {}) {
  const exitRef = useRef(exit);
  exitRef.current = exit;
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    return () => {
      const parent = node.parentNode;
      const next = node.nextSibling;
      const scrollers = [node, ...node.querySelectorAll(".modal")].map(el => [el, el.scrollTop]);
      const liveBefore = replacedBy ? document.querySelectorAll(`${replacedBy}:not(.is-closing)`).length : 0;
      queueMicrotask(() => {
        if (node.isConnected || node.dataset.gone) return;
        // 같은 커밋에서 새 층이 들어와 개수가 줄지 않았다면 "교체"다. 아래에 남은 창 위의 확인창이 닫힐 때는 재생한다.
        if (replacedBy && document.querySelectorAll(`${replacedBy}:not(.is-closing)`).length >= liveBefore) return;
        if (inPlace && !parent?.isConnected) return;
        const host = parent?.isConnected ? parent : (document.querySelector(".ypl") || document.body);
        node.classList.add("is-closing");
        node.inert = true;
        node.setAttribute("aria-hidden", "true");
        host.insertBefore(node, host === parent && next?.parentNode === parent ? next : null);
        scrollers.forEach(([el, top]) => { el.scrollTop = top; });
        const done = () => node.remove();
        const anims = exitRef.current?.(node) || node.getAnimations({ subtree: true });
        Promise.all(anims.map(animation => animation.finished)).then(done, done);
        setTimeout(done, 700);
      });
    };
  }, [ref, replacedBy, inPlace]);
}

/* ---------- what sits behind an open sheet: locked, inert, and on a phone drawn back a little ----------
   One count for every open sheet, so a confirm over a form does not unlock the page underneath. */
let openSheets = 0, recedeAnim = null;
const behind = () => [document.getElementById("ypl-main"), document.querySelector(".topbar"), document.querySelector(".tabbar"),
  document.querySelector(".site-foot"), document.querySelector(".admin-dock")].filter(Boolean);
function recede(on) {
  const main = document.getElementById("ypl-main");
  if (!main || reduced() || desktop()) return;
  if (on) main.style.transformOrigin = `50% ${innerHeight / 2 - main.getBoundingClientRect().top}px`;
  recedeAnim?.cancel();
  recedeAnim = main.animate([{ transform: on ? "none" : "scale(.965)" }, { transform: on ? "scale(.965)" : "none" }],
    { duration: on ? 620 : 320, easing: on ? springs().soft : EASE_OUT, fill: "forwards" });
  if (!on) recedeAnim.finished.then(a => a.cancel()).catch(() => {});
}
function holdPage(on) {
  if (on ? openSheets++ > 0 : --openSheets > 0) return;
  document.documentElement.style.overflow = on ? "hidden" : "";
  behind().forEach(el => { el.inert = on; });
  // 폰의 시트는 상단 바 바로 아래까지 올라온다. 바가 시트 머리에 반쯤 걸려 보이지 않게 열린 동안 위로 비켜 둔다.
  if (!desktop()) document.querySelector(".topbar")?.classList.toggle("hide", on);
  recede(on);
}

/* 대화상자 — 폰은 아래에서 올라오는 글래스 시트(끌어내려 닫기, 손을 뗀 속도를 이어받는 스프링),
   데스크톱은 가운데 창(M5). Esc 와 바깥 누름으로 닫히고, 열려 있는 동안 뒤 페이지는 스크롤되지 않는다.
   title 이 없으면 머리 없이 children 만 그린다(label 이 이름이 된다).
   fly: { from: 누른 요소, selector: 시트 안의 제목 } 이면 시트 제목이 제자리로 살짝 내려앉는다(I2). */
export default function Modal({ title, hint, children, onClose, className = "", label, fly }) {
  const titleId = useId();
  const overlayRef = useRef(null);
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const flyRef = useRef(fly);

  useExitAnimation(overlayRef, {
    replacedBy: ".overlay",
    exit: node => {
      const sheet = node.querySelector(".sheet"), scrim = node.querySelector(".scrim");
      if (reduced()) return [node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" })];
      const out = [scrim.animate([{ opacity: getComputedStyle(scrim).opacity }, { opacity: 0 }], { duration: 240, easing: EASE_OUT, fill: "forwards" })];
      if (desktop()) out.push(sheet.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.97)" }], { duration: 180, easing: EASE_IN, fill: "forwards" }));
      else {
        const from = new DOMMatrix(getComputedStyle(sheet).transform).m42;
        out.push(sheet.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${sheet.offsetHeight + 20}px)` }], { duration: 240, easing: EASE_IN, fill: "forwards" }));
      }
      return out;
    },
  });

  useLayoutEffect(() => {
    const overlay = overlayRef.current, sheet = sheetRef.current, body = bodyRef.current;
    const scrim = overlay.querySelector(".scrim");
    const lastFocus = overlay.contains(document.activeElement) ? null : document.activeElement;
    let anim = null, drag = null, dragged = false;
    holdPage(true);

    const curY = () => new DOMMatrix(getComputedStyle(sheet).transform).m42;
    const slide = (to, v0 = 0) => {
      const from = curY();
      anim?.cancel();
      sheet.style.transform = `translateY(${to}px)`;
      if (reduced()) return Promise.resolve();
      const { values, duration } = springTo(from, to, v0);
      anim = sheet.animate(values.map(y => ({ transform: `translateY(${y}px)` })), { duration, easing: "linear" });
      return anim.finished.catch(() => {});
    };

    const flyTarget = flyRef.current && body.querySelector(flyRef.current.selector);
    settleTitle(flyTarget);
    flyRef.current = null;
    if (!reduced()) scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: EASE_OUT });
    if (desktop()) {
      if (!reduced()) sheet.animate([{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 480, easing: springs().snappy });
    } else {
      sheet.style.transform = `translateY(${sheet.offsetHeight + 20}px)`;
      slide(0);
    }
    if (!sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });

    /* K10: drag the sheet down to close; let go fast or past 30% and it leaves at the finger's speed */
    const down = e => {
      if (desktop() || e.button > 0 || e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (body.contains(e.target) && body.scrollTop > 0) return;
      drag = { y0: e.clientY, start: curY(), id: e.pointerId, pts: [[e.timeStamp, e.clientY]], on: false, scrolls: body.scrollHeight > body.clientHeight + 1 && body.contains(e.target) };
    };
    const move = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y0;
      if (!drag.on) {
        if (Math.abs(dy) < 6) return;
        if (dy < 0 && drag.scrolls) { drag = null; return; }
        drag.on = true; anim?.cancel(); sheet.setPointerCapture?.(drag.id);
      }
      let y = drag.start + dy;
      if (y < 0) y = -18 * Math.log1p(-y / 18);
      sheet.style.transform = `translateY(${y}px)`;
      drag.pts.push([e.timeStamp, e.clientY]);
      while (drag.pts.length > 2 && e.timeStamp - drag.pts[0][0] > 90) drag.pts.shift();
    };
    const up = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!d.on) return;
      dragged = true; setTimeout(() => { dragged = false; }, 0);
      const [t0, y0] = d.pts[0], dt = e.timeStamp - t0, v = dt > 0 ? ((e.clientY - y0) / dt) * 1000 : 0;
      if (curY() > sheet.offsetHeight * 0.3 || v > 700) {
        overlay.dataset.gone = "1";
        scrim.animate([{ opacity: getComputedStyle(scrim).opacity }, { opacity: 0 }], { duration: 240, easing: EASE_OUT, fill: "forwards" });
        slide(sheet.offsetHeight + 20, Math.max(v, 0)).then(() => {
          closeRef.current?.();
          // a parent that keeps the sheet open gets it back
          setTimeout(() => { if (overlay.isConnected) { delete overlay.dataset.gone; scrim.getAnimations().forEach(a => a.cancel()); slide(0); } }, 400);
        });
      } else slide(0, v);
    };
    const swallow = e => { if (dragged) { e.stopPropagation(); e.preventDefault(); } };
    const key = e => {
      if (e.key !== "Escape") return;
      // 창 위에 창이 떠 있으면 Esc 는 맨 위 창만 닫는다.
      const live = document.querySelectorAll(".overlay:not(.is-closing)");
      if (live[live.length - 1] === overlay) closeRef.current?.();
    };
    sheet.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    sheet.addEventListener("click", swallow, true);
    window.addEventListener("keydown", key);
    return () => {
      sheet.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      sheet.removeEventListener("click", swallow, true);
      window.removeEventListener("keydown", key);
      holdPage(false);
      if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    };
  }, []);

  const node = (
    <div className="overlay" ref={overlayRef}>
      <div className="scrim" onClick={() => closeRef.current?.()} />
      <section className={"sheet glass-l3" + (className ? " " + className : "")} role="dialog" aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined} aria-label={title !== undefined ? undefined : label}
        tabIndex={-1} ref={sheetRef}>
        <div className="grip" aria-hidden="true" />
        <div className="modal" ref={bodyRef}>
          {title !== undefined && <>
            <button type="button" className="modal-x press" onClick={() => closeRef.current?.()} aria-label="닫기"><Icon n="x" size={18} /></button>
            <h3 id={titleId}>{title}</h3>
          </>}
          {hint && <p className="hint">{hint}</p>}
          {children}
        </div>
      </section>
    </div>
  );
  const host = typeof document !== "undefined" ? (document.querySelector(".ypl") || document.body) : null;
  return host ? createPortal(node, host) : node;
}
