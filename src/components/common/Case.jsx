import React, { useState } from "react";

/* 그림을 못 불러오면 빈칸이 아니라 포켓몬 이름이 그 자리에 선다. */
export function Sprite({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <small className="case-name">{name}</small>;
  return <img src={src} alt="" decoding="async" loading="lazy" onError={() => setFailed(true)} />;
}

/* 케이스: 이 사이트의 카드. 회색 틀 안에 흰 라벨과 네이비 창이 봉인되어 있다. 어떤 면도 그림자나 선을 쓰지 않는다.
   창에는 하나만 든다: sprite 하나, party 여섯, 아니면 children(큰 숫자나 이름). 창이 없으면 라벨만 있는 케이스다.
   onClick 이 있으면 누르는 케이스이고 호버에 들린다. title 은 라벨의 이름, line 은 회색 줄, fig 와 unit 은 오른쪽의 큰 숫자. */
export default function Case({ title, line, fig, unit, sprite, party, children, onClick, label, off = false, className = "", ...rest }) {
  const Box = onClick ? "button" : "div";
  const press = onClick ? { type: "button", onClick, "aria-label": label } : {};
  const names = party?.map(m => m.name).filter(Boolean).join(", ");
  return (
    <Box className={"case" + (sprite !== undefined ? " one" : "") + (off ? " off" : "") + (className ? " " + className : "")} {...press} {...rest}>
      <span className="case-label">
        <span className="case-who"><b>{title}</b>{line && <span>{line}</span>}</span>
        {fig != null && fig !== "" && <strong className="case-fig tnum">{fig}{unit && <small>{unit}</small>}</strong>}
      </span>
      {sprite !== undefined && <span className="case-win"><i className="case-band" aria-hidden="true" />{sprite && <Sprite src={sprite} />}</span>}
      {party?.length > 0 && <span className="case-win case-six" role="img" aria-label={names}>
        <i className="case-band" aria-hidden="true" />
        {party.map((m, i) => <span className="case-mon" key={i}><Sprite src={m.img} name={m.name} /></span>)}
      </span>}
      {children != null && children !== false && <span className="case-win case-say"><i className="case-band" aria-hidden="true" />{children}</span>}
    </Box>
  );
}
