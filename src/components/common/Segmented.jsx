import React, { useLayoutEffect, useRef, useState } from "react";

/* 같은 화면 안의 보기 전환. 선택 칸은 경쾌 스프링으로 미끄러지고,
   칸 폭이 서로 달라도 따라가도록 선택된 버튼을 직접 잰다.
   넘치면 스크롤 막대 없이 가로로 넘기고, 선택 칸을 보이는 곳으로 당긴다. */
export default function Segmented({ value, onChange, options, ariaLabel, className = "" }) {
  const ref = useRef(null);
  const [thumb, setThumb] = useState(null);

  useLayoutEffect(() => {
    const track = ref.current;
    if (!track) return undefined;
    const measure = () => {
      const on = track.querySelector('[aria-selected="true"]');
      if (!on) { setThumb(null); return; }
      setThumb({ x: on.offsetLeft, w: on.offsetWidth });
      const left = on.offsetLeft - track.clientWidth / 2 + on.offsetWidth / 2;
      if (track.scrollWidth > track.clientWidth) track.scrollTo({ left, behavior: "smooth" });
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(track);
    document.fonts?.ready.then(measure);
    return () => ro?.disconnect();
  }, [value, options.length]);

  return (
    <div className={"ypl-seg" + (className ? " " + className : "")} role="tablist" aria-label={ariaLabel} ref={ref}>
      {thumb && <i className="ypl-seg__thumb" aria-hidden="true" style={{ "--x": `${thumb.x}px`, "--w": `${thumb.w}px` }} />}
      {options.map(([key, label]) => (
        <button key={key} type="button" role="tab" aria-selected={key === value} onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  );
}
