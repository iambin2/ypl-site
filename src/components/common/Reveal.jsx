import React, { useEffect, useRef, useState } from "react";

/* 스크롤 등장.
   내용은 보이지 않는 상태에서 출발하므로, 관찰자가 어떤 이유로든 한 번도
   울리지 않으면 화면이 비어 버립니다(백그라운드 탭에서 열기, 프리렌더,
   관찰자 미지원 등). 그래서 안전망을 함께 둡니다 — 1.2초 뒤에도 아직
   등장하지 않았는데 이미 화면 안에 들어와 있다면 그냥 보여 줍니다.
   화면 밖 요소는 건드리지 않으므로 스크롤 연출은 그대로 남습니다. */
export default function Reveal({ children, delay = 0, className = "", tag = "div", ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver !== "function") { setSeen(true); return; }

    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setSeen(true);
      io.disconnect();
    }, { threshold: .12, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);

    const safety = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        setSeen(true);
        io.disconnect();
      }
    }, 1200);

    return () => { clearTimeout(safety); io.disconnect(); };
  }, []);

  const Tag = tag;
  /* 순서는 CSS 변수로 넘긴다 — 등장이 transition 이 아니라 animation 이므로
     transitionDelay 를 쓰면 요소의 다른 전환(hover 등)까지 함께 늦춰진다. */
  return (
    <Tag
      ref={ref}
      className={`reveal ${seen ? "in" : ""} ${className}`}
      style={{ "--reveal-delay": delay + "ms" }}
      {...rest}
    >{children}</Tag>
  );
}
