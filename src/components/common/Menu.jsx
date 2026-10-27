import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import Modal, { useExitAnimation } from "./Modal.jsx";
import { DUR, EASE_IN, desktop, reduced, springs } from "./motion.js";

/* Menu rows: icon, label, a check on the current one. href rows open outside the site.
   Up and down arrows move focus between rows (wrapping, skipping disabled ones); Enter is the row's own click. */
export function MenuItems({ items, onPick, role = "menu" }) {
  const itemRole = role === "listbox" ? "option" : "menuitem";
  const ref = useRef(null);
  // A sheet opens with focus on the sheet itself, so listen on window and act while focus is anywhere in the menu's layer.
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const menu = ref.current;
      if (!menu || !(menu.closest(".sheet, .popover") || menu).contains(document.activeElement)) return;
      const rows = [...menu.querySelectorAll(".mi:not(:disabled)")];
      if (!rows.length) return;
      event.preventDefault();
      const i = rows.indexOf(document.activeElement), d = event.key === "ArrowDown" ? 1 : -1;
      rows[i < 0 ? (d > 0 ? 0 : rows.length - 1) : (i + d + rows.length) % rows.length].focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <div className="menu" role={role} ref={ref}>
      {items.map(it => {
        if (it.sep) return <div key={it.key} className="mi-sep" role="separator" />;
        const inner = <>{it.icon && <Icon n={it.icon} size={22} />}<span>{it.label}</span>
          {it.href && <Icon n="ext" size={16} className="mi-end" />}
          {it.current && <Icon n="check" size={18} className="check" />}</>;
        return it.href
          ? <a key={it.key} className="mi press" role={itemRole} href={it.href} target="_blank" rel="noopener noreferrer" onClick={() => onPick?.(it)}>{inner}</a>
          : <button key={it.key} type="button" className={"mi press" + (it.current ? " on" : "")} role={itemRole}
            aria-selected={role === "listbox" ? Boolean(it.current) : undefined} aria-current={role === "menu" && it.current ? "true" : undefined}
            disabled={it.disabled} onClick={() => { onPick?.(it); it.onSelect?.(); }}>{inner}</button>;
      })}
    </div>
  );
}

/* M6: on a desktop a glass popover grows out of its trigger; on a phone the same rows rise as a sheet. */
export default function Menu({ anchor, title, items, onClose, role }) {
  const [sheet] = useState(() => !desktop());
  if (sheet) return <Modal title={title} onClose={onClose}><MenuItems items={items} role={role} onPick={onClose} /></Modal>;
  return <Popover anchor={anchor} onClose={onClose}><MenuItems items={items} role={role} onPick={onClose} /></Popover>;
}

export function Popover({ anchor, onClose, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useExitAnimation(ref, { exit: node => [node.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: 150, easing: EASE_IN, fill: "forwards" })] });
  useLayoutEffect(() => {
    const pop = ref.current, trigger = anchor?.current || anchor;
    if (!pop || !trigger) return undefined;
    const r = trigger.getBoundingClientRect(), w = pop.offsetWidth;
    const left = Math.max(16, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 16));
    Object.assign(pop.style, { left: left + "px", top: r.bottom + 8 + "px", transformOrigin: `${r.left + r.width / 2 - left}px -8px` });
    if (!reduced()) pop.animate([{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }], { duration: DUR.snappy, easing: springs().snappy });
    pop.querySelector(".mi")?.focus({ preventScroll: true });
    const outside = e => { if (!pop.contains(e.target) && !trigger.contains(e.target)) closeRef.current?.(); };
    const key = e => { if (e.key === "Escape") { closeRef.current?.(); trigger.focus?.({ preventScroll: true }); } };
    const resize = () => closeRef.current?.();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", key); window.removeEventListener("resize", resize); };
  }, [anchor]);
  const node = <div className="popover glass-l3" ref={ref}>{children}</div>;
  const host = typeof document !== "undefined" ? (document.querySelector(".ypl") || document.body) : null;
  return host ? createPortal(node, host) : node;
}
