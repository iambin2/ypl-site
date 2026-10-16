import React, { useEffect } from "react";

/* L0 무대: 흑연색 바탕 위로 바로 위에서 떨어지는 부드러운 빛 하나(C3). 40초 넘는 주기로 아주 느리게 흐르고(D1),
   페이지가 바뀌면 빛의 자리가 천천히 옮겨 가며, 대회 상태에 따라 밝기가 달라지고, 스크롤에 아주 약하게 따라온다(D2).
   커서와 기기 기울기에는 반응하지 않는다. */
const LIGHT_X = { home: "0vw", news: "-18vw", bracket: "16vw", records: "-8vw", titles: "10vw", champions: "-12vw", builder: "6vw", about: "-4vw", board: "14vw" };

export default function Stage({ view, state = "open" }) {
  useEffect(() => {
    // 기기 해상도의 디더, 255단계 중 한 단계 수준: 빛의 띠 현상만 막고 눈에는 보이지 않는다(C6)
    try {
      const k = Math.min(3, Math.round(devicePixelRatio || 1)), n = 128 * k, c = document.createElement("canvas");
      c.width = c.height = n;
      const x = c.getContext("2d"), d = x.createImageData(n, n);
      for (let i = 0; i < d.data.length; i += 4) { const v = (Math.random() * 255) | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 3; }
      x.putImageData(d, 0, 0);
      document.documentElement.style.setProperty("--grain", `url(${c.toDataURL()})`);
    } catch { /* canvas unavailable: the stage stays plain */ }
  }, []);
  return (
    <div className="stage" id="ypl-stage" data-state={state} style={{ "--lx": LIGHT_X[view] || "0vw" }} aria-hidden="true">
      <div className="light light-a" /><div className="light light-b" />
    </div>
  );
}

/* G4, J3: 스크롤을 내리면 바가 숨고 올리면 나온다. 콘텐츠가 상단 바 아래로 지나가면 바 아래에 옅은 그림자.
   무대의 빛은 스크롤에 아주 약하게 따라온다. 리렌더 없이 클래스만 바꾼다. */
const bars = () => [document.querySelector(".topbar"), document.querySelector(".tabbar"), document.querySelector(".admin-dock")];
export function showBars() { bars().forEach(b => b?.classList.remove("hide")); }
export function useScrollChrome() {
  useEffect(() => {
    let lastY = scrollY, ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = scrollY, dy = y - lastY;
        document.querySelector(".topbar")?.classList.toggle("scrolled", y > 8);
        if (y < 64) { showBars(); lastY = y; }
        else if (Math.abs(dy) > 10) { bars().forEach(b => b?.classList.toggle("hide", dy > 0)); lastY = y; }
        document.getElementById("ypl-stage")?.style.setProperty("--ly", -Math.min(y * 0.05, 48) + "px");
      });
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);
}
