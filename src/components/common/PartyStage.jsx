import React, { useLayoutEffect, useRef } from "react";
import { reduced, EASE_OUT } from "./motion.js";
import { onSpriteError } from "../../services/teamBuilderCore.js";

/* 흐림이 풀리며 올라오는 등장(J1과 같은 문법). 움직임 줄이기에서는 투명도만. */
export function arrive(els, start, step) {
  const still = reduced();
  els.forEach((el, i) => el?.animate(
    still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(20px)", filter: "blur(8px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }],
    { duration: still ? 400 : 820, delay: start + i * step, easing: EASE_OUT, fill: "backwards" },
  ));
}

/* 홈 전당과 같은 V: 가운데 둘이 가장 크고(1) 바깥으로 .84, .7, 작은 쪽이 더 뒤에 더 높이 선다 (HomePage sizeAt). */
const sizeAt = (i, n) => { const d = Math.abs(i - (n - 1) / 2); return d < 1 ? 1 : d < 2 ? .84 : .7; };

/* 무대 위의 우승 파티: 상자 없이, 천장 빛이 떨어지는 바닥에 홈과 같은 V로 서 있다. 움직이는 것은 빛뿐이라, 올린 포켓몬 말고는 한 걸음 어두워진다.
   members 는 [{ name, img, fallback? }], children 은 사진 설명 자리. enter 면 처음 그려질 때 가운데부터 차례로 선다.
   dais 면 명예의 전당의 단상 위에 선다: 바닥에 그린 세 개의 원(19차). */
export default function PartyStage({ members, label, enter = false, dais = false, children }) {
  const list = members.slice(0, 6);
  const ref = useRef(null);
  const played = useRef(false);
  useLayoutEffect(() => {
    if (!enter || played.current || !list.length) return;
    played.current = true;
    const mons = [...ref.current.querySelectorAll(".hx-mon")];
    const mid = (mons.length - 1) / 2;
    arrive(mons.slice().sort((a, b) => Math.abs(+a.dataset.i - mid) - Math.abs(+b.dataset.i - mid)), 420, 60);
  }, [enter, list.length]);
  return (
    <figure className={"hx-party" + (dais ? " dais" : "")} ref={ref}>
      <ol className="hx-floor" aria-label={label}>
        {list.map((m, i) => (
          <li key={i} className="hx-mon" data-i={i} style={{ "--s": sizeAt(i, list.length) }}>
            <span className="hx-mon-body">
              {m.img ? <img src={m.img} alt={m.name} decoding="async" fetchpriority={i < 3 ? "high" : undefined} onError={onSpriteError(m.fallback)} />
                : <span className="hx-mon-name">{m.name}</span>}
            </span>
            <i className="hx-contact" aria-hidden="true" />
          </li>
        ))}
      </ol>
      {children && <figcaption>{children}</figcaption>}
    </figure>
  );
}
