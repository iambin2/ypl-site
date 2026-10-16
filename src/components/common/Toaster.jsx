import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { reduced, springs } from "./motion.js";

/* K6: 토스트는 아래(폰은 탭 바 바로 위)에서 스프링으로 올라오고, 여러 개면 뒤로 겹쳐 쌓인다(Sonner 방식).
   push 로 받은 문장을 3.8초 보여 준다. 실패를 알리는 문장에는 확인 표시 대신 안내 표시를 단다. */
const LIFE = 3800;
const failed = text => /못했|못해|실패|없습니다|확인하지/.test(text);

function Toast({ item, index, onGone }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!reduced()) ref.current?.animate([{ transform: "translateY(120%) scale(.94)", opacity: 0 }, { transform: "translateY(0) scale(1)", opacity: 1 }], { duration: 560, easing: springs().snappy });
  }, []);
  useEffect(() => {
    if (!item.out) return undefined;
    const t = setTimeout(() => onGone(item.id), 260);
    return () => clearTimeout(t);
  }, [item.out, item.id, onGone]);
  return (
    <div ref={ref} className={"toast glass-l3" + (item.out ? " out" : "")} style={{ "--i": index, zIndex: 10 - index, opacity: index > 2 && !item.out ? 0 : undefined }}>
      <Icon n={failed(item.text) ? "info" : "check"} size={20} />
      <span>{item.text}</span>
    </div>
  );
}

export default function Toaster({ feed }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!feed) return undefined;
    setItems(list => [{ id: feed.id, text: feed.text }, ...list]);
    // 다음 토스트가 와도 앞의 것은 제 시간에 사라진다(그래서 정리 함수로 타이머를 끊지 않는다).
    setTimeout(() => setItems(list => list.map(x => x.id === feed.id ? { ...x, out: true } : x)), LIFE);
    return undefined;
  }, [feed]);
  const gone = useRef(id => setItems(list => list.filter(x => x.id !== id))).current;
  let live = 0;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map(item => <Toast key={item.id} item={item} index={item.out ? live : live++} onGone={gone} />)}
    </div>
  );
}
