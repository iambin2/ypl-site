import React, { useLayoutEffect, useRef } from "react";
import { reduced } from "./motion.js";

/* A choice (DESIGN.md "Controls"): a few options as 44 panels in a row joined by the seam, the chosen one inverted. Page tabs are
   TabsLine. 넘치면 스크롤 막대 없이 가로로 넘기고 고른 칸을 보이는 곳으로 당긴다. */
export default function Segmented({ value, onChange, options, ariaLabel, className = "" }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const track = ref.current, on = track?.querySelector('[aria-selected="true"]');
    if (on && track.scrollWidth > track.clientWidth) track.scrollTo({ left: on.offsetLeft - track.clientWidth / 2 + on.offsetWidth / 2, behavior: reduced() ? "auto" : "smooth" });
  }, [value]);
  return (
    <div className={"ypl-seg ypl-choice" + (className ? " " + className : "")}>
      <div className="seg-track" role="tablist" aria-label={ariaLabel} ref={ref}>
        {options.map(([key, label]) => (
          <button key={String(key)} type="button" role="tab" aria-selected={key === value} onClick={() => onChange(key)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
