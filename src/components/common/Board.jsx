import React from "react";
import Icon from "./Icon.jsx";
import Seg from "./Seg.jsx";
import { standInk } from "./inkCentre.js";

/* The scoreboard's shared parts (DESIGN.md, docs/redesign-next/BUILD.md chapter 3). A screen is built from these, board.css and the
   panel classes of tokens.css (.pn, .pn2, .stack, .inv, .lamp). A panel is a door: given onClick it is a button. */
const door = onClick => onClick ? { as: "button", props: { type: "button", onClick } } : { as: "div", props: {} };

/* A section is a title (20) and its link (a 12px underlined word on the right), 12 above its stack. */
export function SectionHead({ id, title, link, onLink }) {
  return (
    <div className="sh">
      <h2 className="t20" id={id}>{title}</h2>
      {link && <button type="button" className="sh-link" onClick={onLink}>{link}</button>}
    </div>
  );
}

/* A counter: a 84 panel, its label 12 on top, a 40 display of two cells under it. value null is the board switched off. */
export function Counter({ label, value, unit = "", cells = 2, onClick }) {
  const { as: Box, props } = door(onClick);
  const lit = value != null;
  return (
    <Box className="pn counter" {...props} aria-label={lit ? `${label} ${value}${unit}` : label}>
      <span className="t12 dim">{label}</span>
      <Seg value={lit ? value : ""} h={40} cells={cells} label={lit ? `${value}${unit}` : ""} />
    </Box>
  );
}

/* A row of a stack: 52 for one line, 64 with a grey line. lead is the cell on the left (a rank, a date), value the figure on the right,
   lamp the lamp column at the end (true lights it, false keeps the column dark). className sets the columns. */
export function Row({ lead, title, line, value, lamp, onClick, className = "", label }) {
  const { as: Box, props } = door(onClick);
  return (
    <Box className={"pn row" + (line ? " row--2" : "") + (className ? " " + className : "")} {...props} aria-label={label}>
      {lead != null && <span className="row-lead">{lead}</span>}
      <span className="row-main"><b className="t15">{title}</b>{line && <span className="t12 dim">{line}</span>}</span>
      {value != null && <span className="row-value">{value}</span>}
      {lamp != null && <span className="row-lamp">{lamp && <i className="lamp" aria-hidden="true" />}</span>}
    </Box>
  );
}

/* A Pokémon standing in its panel (DESIGN.md "Where a Pokémon stands"): the parent is a .stand panel with a .floor band; the picture
   stands with its ink's feet on the band's top edge. Pictures that fail to load leave the floor empty. */
export function Mon({ src, className = "" }) {
  if (!src) return null;
  const stand = img => { if (img?.complete && img.naturalWidth) standInk(img); };
  return <img className={"mon" + (className ? " " + className : "")} src={src} alt="" decoding="async" ref={stand} onLoad={e => standInk(e.currentTarget)} />;
}

/* The current champion: one panel, the name, generation and season top left, 파티 보기 in the floor band, the Pokémon on the floor
   at the right. champion null is the panel switched off. */
export function ChampionPanel({ champion, onClick }) {
  return (
    <button type="button" className="pn stand champion" onClick={champion ? onClick : undefined}
      aria-label={champion ? `현 챔피언 ${champion.name}, ${champion.label}, ${champion.line}, 파티 보기` : "현 챔피언"}>
      <i className="floor" aria-hidden="true" />
      {champion && <>
        <span className="champion-who">
          <span className="t12 dim">현 챔피언</span>
          <b className="t20">{champion.name}</b>
          <span className="t12 dim reg">{champion.label}, {champion.line}</span>
        </span>
        <span className="champion-more t12">파티 보기<Icon n="arrow" size={16} /></span>
        <Mon src={champion.party[0]?.img} />
      </>}
    </button>
  );
}
