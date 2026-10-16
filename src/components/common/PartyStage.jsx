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

/* 포켓몬을 누르면(데스크톱은 올리면) 제자리에서 한 번 뛴다. 그림자는 떠 있는 동안 작고 옅어진다. */
function hop(e) {
  const mon = e.currentTarget, body = mon.firstElementChild, shadow = mon.querySelector(".hx-contact");
  if (!body || reduced() || body.getAnimations().length) return;
  body.animate([
    { transform: "none", easing: "cubic-bezier(.2,.75,.35,1)" },
    { transform: "translateY(-18px)", offset: .4, easing: "cubic-bezier(.55,0,.85,.4)" },
    { transform: "translateY(0) scale(1.05, .94)", offset: .74, easing: EASE_OUT },
    { transform: "none" },
  ], { duration: 620 });
  shadow?.animate([{ transform: "none" }, { transform: "scale(.66)", opacity: .45, offset: .4 }, { transform: "none", offset: .74 }, { transform: "none" }], { duration: 620 });
}

/* 무대 위의 우승 파티: 상자 없이, 천장 빛이 떨어지는 바닥에 서 있다. 폰은 앞뒤 두 줄, 넓은 화면은 가운데가 가까운 한 줄.
   members 는 [{ name, img, fallback? }], children 은 사진 설명 자리. enter 면 처음 그려질 때 가운데부터 차례로 선다. */
export default function PartyStage({ members, label, enter = false, children }) {
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
  const mid = (list.length - 1) / 2;
  return (
    <figure className="hx-party" ref={ref}>
      <ol className="hx-floor" aria-label={label}>
        {list.map((m, i) => (
          <li key={i} className={"hx-mon" + (i >= 3 ? " back" : "")} data-i={i} style={{ "--d": Math.abs(i - mid) }} onPointerEnter={e => e.pointerType === "mouse" && hop(e)} onPointerDown={hop}>
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
