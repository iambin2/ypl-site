import React, { useEffect, useRef, useState } from "react";
import { reduced, returning } from "./motion.js";

/* K4: 숫자는 자릿수마다 굴러가며 바뀐다. 처음 화면에 들어올 때도 0에서 제 값까지 한 번 굴러온다.
   뒤로 돌아온 화면은 이미 본 값이라 굴리지 않는다.
   자릿수가 같으면 같은 칸이 남아 굴러가고, 자릿수가 바뀌면 새로 그린다. 읽는 값은 aria-label 하나. */
export default function Roll({ value, format = n => n.toLocaleString("ko-KR") }) {
  const n = Number(value) || 0;
  const s = format(n);
  const ref = useRef(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver !== "function" || reduced() || returning());
  useEffect(() => {
    if (seen) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px" });
    // 0을 한 프레임 그린 뒤에 관찰해야 굴러가는 전환이 생긴다
    const raf = requestAnimationFrame(() => ref.current && io.observe(ref.current));
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [seen]);
  return (
    <span className="roll" role="img" aria-label={s} key={s.length} ref={ref}>
      {[...s].map((ch, i) => /\d/.test(ch)
        ? <span className="rd" aria-hidden="true" key={i}><span className="rs" style={{ "--d": seen ? ch : 0 }}>{"0123456789".split("").map(d => <i key={d}>{d}</i>)}</span></span>
        : <span aria-hidden="true" key={i}>{ch}</span>)}
    </span>
  );
}
