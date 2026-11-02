import React, { useLayoutEffect, useRef } from "react";
import { reduced } from "./motion.js";

/* 같은 화면 안의 보기 전환. 기본은 페이지 탭(글자와 고른 글자 아래 2px 선), choice는 몇 가지 선택지를 44 패널로 늘어놓고
   고른 것을 반전한다. 선은 미끄러지지 않고 그 자리에서 켜진다. 넘치면 스크롤 막대 없이 가로로 넘기고 고른 칸을 보이는 곳으로 당긴다. */
export default function Segmented({ value, onChange, options, ariaLabel, className = "", choice = false }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const track = ref.current, on = track?.querySelector('[aria-selected="true"]');
    if (on && track.scrollWidth > track.clientWidth) track.scrollTo({ left: on.offsetLeft - track.clientWidth / 2 + on.offsetWidth / 2, behavior: reduced() ? "auto" : "smooth" });
  }, [value]);
  return (
    <div className={"ypl-seg" + (choice ? " ypl-choice" : "") + (className ? " " + className : "")}>
      <div className="seg-track" role="tablist" aria-label={ariaLabel} ref={ref}>
        {options.map(([key, label]) => (
          <button key={String(key)} type="button" role="tab" aria-selected={key === value} onClick={() => onChange(key)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
