import React, { useLayoutEffect, useRef } from "react";
import { placePill } from "./motion.js";

/* 같은 화면 안의 보기 전환(K3). 선택 알약은 목적지 쪽으로 먼저 늘어났다가 뒤따라 줄어든다.
   칸 폭이 서로 달라도 따라가도록 선택된 버튼을 직접 잰다. 넘치면 스크롤 막대 없이 가로로 넘기고,
   선택 칸을 보이는 곳으로 당긴다. */
// 탭마다 화면이 통째로 바뀌어 탭 막대가 새로 그려져도(게시판 샘플/파티, 사설 대진표) 알약은 끊기지 않는다.
// 사라지는 막대가 알약 자리를 이름(ariaLabel)으로 남기고, 곧바로 생긴 같은 이름의 막대가 그 자리에서 출발한다.
const handoff = new Map();
const HANDOFF_MS = 1000;

export default function Segmented({ value, onChange, options, ariaLabel, className = "" }) {
  const ref = useRef(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const ind = ref.current?.querySelector(":scope > .pill-ind");
    const prev = handoff.get(ariaLabel);
    const on = ref.current?.querySelector('[aria-selected="true"]');
    // 이미 목적지에 있던 알약이면 넘겨받지 않는다(넘겨받으면 placePill이 제자리로 보고 새 막대에 알약을 놓지 않는다).
    const there = on && prev && Math.abs(on.offsetLeft - prev.L) < 0.5 && Math.abs(on.offsetLeft + on.offsetWidth - prev.R) < 0.5;
    if (ind && prev && !there && performance.now() - prev.at < HANDOFF_MS) { ind._lens = { L: prev.L, R: prev.R, h: prev.h }; placed.current = true; }
    return () => {
      const lens = ind?._lens;
      if (!lens) return;
      const [L, R] = lens.now?.() || [lens.L, lens.R];
      handoff.set(ariaLabel, { L, R, h: lens.h, at: performance.now() });
    };
  }, []);

  useLayoutEffect(() => {
    const track = ref.current;
    if (!track) return undefined;
    placePill(track, placed.current);
    placed.current = true;
    const on = track.querySelector('[aria-selected="true"]');
    if (on && track.scrollWidth > track.clientWidth) track.scrollTo({ left: on.offsetLeft - track.clientWidth / 2 + on.offsetWidth / 2, behavior: "smooth" });
    const again = () => placePill(track, false);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(again) : null;
    ro?.observe(track);
    document.fonts?.ready.then(again);
    return () => ro?.disconnect();
  }, [value, options.length]);

  // 홈의 그림자는 바깥 상자에, 가로로 넘기는 칸과 렌즈는 안쪽 상자에 둔다. 넘겨도 홈의 가장자리는 제자리에 있다.
  return (
    // 트랙은 표면에 눌러 판 홈(groove), 선택 렌즈는 그 위에 떠 있다. 블러가 없어 세그먼트가 여러 개여도 한 화면 블러 예산 4개를 넘지 않는다(C7)
    <div className={"ypl-seg groove" + (className ? " " + className : "")}>
      <div className="seg-track" role="tablist" aria-label={ariaLabel} ref={ref}>
        <span className="pill-ind" aria-hidden="true"><i /><i /><i /></span>
        {options.map(([key, label]) => (
          <button key={key} type="button" role="tab" className="press" aria-selected={key === value} onClick={() => onChange(key)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
