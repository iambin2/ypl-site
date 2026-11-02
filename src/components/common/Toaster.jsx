import React, { useEffect, useRef, useState } from "react";
import { Bang } from "./Board.jsx";
import { DUR, EASE_OUT, reduced } from "./motion.js";

/* A toast is an inverted 52 panel above the tab bar (DESIGN.md "Sheets, dialogs, toasts"). It arrives as everything does, rising the
   last 12 into its place as it lights; a newer one covers the one before. push 로 받은 문장을 4.66초 보여 준다. 실패를 알리는 문장은 ! 칸으로 시작한다.
   action({ label, run })이 있으면 밑줄 단어 하나를 달고, 누르면 그 일을 하고 사라진다(c8 되돌리기). */
const LIFE = 4660;
const failed = text => /못했|못해|실패|없습니다|확인하지/.test(text);

function Toast({ item, index, onGone, onAct }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!reduced()) ref.current?.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: DUR.light, easing: EASE_OUT });
  }, []);
  useEffect(() => {
    if (!item.out) return undefined;
    const t = setTimeout(() => onGone(item.id), DUR.leave);
    return () => clearTimeout(t);
  }, [item.out, item.id, onGone]);
  return (
    <div ref={ref} className={"toast inv" + (item.out ? " out" : "") + (index > 0 ? " behind" : "")} style={{ zIndex: 10 - index }}>
      {failed(item.text) && <Bang />}
      <span>{item.text}</span>
      {item.action && !item.out && <button type="button" className="toast-act" onClick={() => onAct(item)}>{item.action.label}</button>}
    </div>
  );
}

export default function Toaster({ feed }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!feed) return undefined;
    setItems(list => [{ id: feed.id, text: feed.text, action: feed.action }, ...list]);
    // 다음 토스트가 와도 앞의 것은 제 시간에 사라진다(그래서 정리 함수로 타이머를 끊지 않는다).
    setTimeout(() => setItems(list => list.map(x => x.id === feed.id ? { ...x, out: true } : x)), LIFE);
    return undefined;
  }, [feed]);
  const gone = useRef(id => setItems(list => list.filter(x => x.id !== id))).current;
  const act = useRef(item => { setItems(list => list.map(x => x.id === item.id ? { ...x, out: true } : x)); item.action.run(); }).current;
  let live = 0;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map(item => <Toast key={item.id} item={item} index={item.out ? live : live++} onGone={gone} onAct={act} />)}
    </div>
  );
}
