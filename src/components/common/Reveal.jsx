import React, { useLayoutEffect, useRef } from "react";

/* 연속 등장 간격은 두 가지뿐이다: 목록 행 40ms, 타일 60ms. */
export const STAGGER = { row: 40, tile: 60 };

/* J1: 섹션이 처음 보일 때 한 번, 블러가 풀리며 올라온다(로고 등장과 같은 문법).
   처음부터 화면 안에 있는 것은 움직이지 않고 그대로 보인다. 화면 아래에 있는 것만 숨겨 두었다가
   들어올 때 풀어 준다. 판단은 같은 작업이 끝난 뒤(페이지 전환이 스크롤을 옮긴 뒤)에 한다.
   관찰자가 없거나 울리지 않아도 내용이 비지 않도록, 숨기는 일은 관찰자가 있을 때만 한다. */
let io = null;
const observer = () => io || (io = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target, delay = +el.dataset.delay || 0;
  io.unobserve(el);
  // 순서 지연은 등장하는 동안에만 건다. 남겨 두면 hover 같은 다른 전환까지 늦어진다.
  if (delay) { el.style.transitionDelay = delay + "ms"; setTimeout(() => { el.style.transitionDelay = ""; }, delay + 900); }
  el.classList.remove("pre");
}), { rootMargin: "0px 0px -6% 0px" }) : null);

export default function Reveal({ children, delay = 0, className = "", tag = "div", ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current, o = observer();
    if (!el || !o) return undefined;
    let live = true;
    queueMicrotask(() => {
      if (!live || el.getBoundingClientRect().top < innerHeight * 0.94) return;
      el.style.transition = "none"; el.classList.add("pre"); void el.offsetWidth; el.style.transition = "";
      o.observe(el);
    });
    return () => { live = false; o.unobserve(el); };
  }, []);
  const Tag = tag;
  return (
    <Tag ref={ref} className={"reveal" + (className ? " " + className : "")} data-delay={delay || undefined} {...rest}>{children}</Tag>
  );
}
