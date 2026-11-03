import React, { useEffect, useLayoutEffect, useRef } from "react";
import Icon from "./Icon.jsx";
import Seg from "./Seg.jsx";
import { standInk } from "./inkCentre.js";
import { forgetLine, lightAfter, slideLine } from "./motion.js";

/* the chosen word's line slides from the word before it (motion.js slideLine); the line itself is the word's own ::before.
   lights: a change of word also lights what the row swaps, even when the page drew the row afresh for the new word. */
export function useSlideLine(key, lights = false) {
  const ref = useRef(null);
  useLayoutEffect(() => { if (slideLine(ref.current) && lights) lightAfter(ref.current); }, [key]);
  useLayoutEffect(() => { const row = ref.current; return () => forgetLine(row); }, []);
  return ref;
}
/* after the first render, a change of value lights what the control swaps (motion.js lightAfter) */
function useLightOnChange(ref, value) {
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } lightAfter(ref.current); }, [value]);
}

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

/* A counter: a 84 panel, its label 12 on top, a 40 display under it. value null is the board switched off.
   lamp lights the label's lamp ("sig" for amber), after is the unit in type on the display's baseline (일, / 32). */
export function Counter({ label, value, unit = "", cells = 2, onClick, lamp, after, h = 40 }) {
  const { as: Box, props } = door(onClick);
  const lit = value != null;
  return (
    <Box className="pn counter" {...props} aria-label={lit ? `${label} ${value}${unit}` : label}>
      <span className="t12 dim counter-label">{lamp && <i className={"lamp" + (lamp === "sig" ? " sig" : "")} aria-hidden="true" />}{label}</span>
      <span className="counter-board"><Seg value={lit ? value : ""} h={h} cells={cells} label={lit ? `${value}${unit}` : ""} />{after}</span>
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
export function Mon({ src, className = "", ...rest }) {
  if (!src) return null;
  const stand = img => { if (img?.complete && img.naturalWidth) standInk(img); };
  return <img className={"mon" + (className ? " " + className : "")} src={src} alt="" decoding="async" {...rest} ref={stand} onLoad={e => standInk(e.currentTarget)} />;
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

/* ---------- controls (DESIGN.md "Controls") ---------- */

/* the ! square an error starts with: the error reads by it and a sentence, never by a colour */
export const Bang = () => <span className="bang" aria-hidden="true">!</span>;

/* A back link: 12 dim with a chevron, naming where it goes. */
export function BackLink({ to, onClick }) {
  return <button type="button" className="back t12 dim" onClick={onClick}><Icon n="back" size={16} />{to}</button>;
}

/* A field: its label 12 dim, 8 above the control; an error keeps the 2px line and adds the ! square and a sentence under it.
   group is true for a row of choices, which a label cannot point at. */
export function Question({ id, label, required = false, error, group = false, children }) {
  const Label = group ? "span" : "label";
  return (
    <div className={"q" + (error ? " has-error" : "")} role={group ? "group" : undefined} aria-labelledby={group ? `${id}-label` : undefined}>
      <Label className="q-label t12 dim" id={`${id}-label`} htmlFor={group ? undefined : id}>{label}{required && " *"}</Label>
      {children}
      {error && <p className="q-error t12" id={`${id}-error`} role="alert"><Bang />{error}</p>}
    </div>
  );
}

/* Choice: a few options as 44 panels in a row, the chosen one inverted. multiple turns it into checks: 20 squares beside their words. */
export function Choice({ name, options, value, onChange, multiple = false }) {
  if (multiple) {
    const list = Array.isArray(value) ? value : [];
    return (
      <div className="checks">
        {options.map((op, i) => <label className="check-row" key={i}>
          <input type="checkbox" className="sr-only" checked={list.includes(op)} onChange={() => onChange(list.includes(op) ? list.filter(x => x !== op) : [...list, op])} />
          <span className={"box" + (list.includes(op) ? " on" : "")} aria-hidden="true">{list.includes(op) && <Icon n="check" size={16} />}</span>
          <span className="t15 reg">{op}</span>
        </label>)}
      </div>
    );
  }
  return (
    <div className="choice stack" role="radiogroup">
      {options.map((op, i) => <label className={"choice-opt " + (value === op ? "inv" : "pn")} key={i}>
        <input type="radio" className="sr-only" name={name} checked={value === op} onChange={() => onChange(op)} />{op}
      </label>)}
    </div>
  );
}

/* The main action's strip: on a phone it docks above the tab bar on the ground with a hairline, so it never scrolls away. toast stands
   above it: an inverted 52 panel, an error starting with the ! square, its one action an underlined word. */
/* a cell: a label 12 over its value 15 in a 52 panel; a dropdown or pick field inside fills the cell (c7 spec cells, c8 fields) */
export function Cell({ label, wide = false, className = "", children }) {
  return <div className={"cell" + (wide ? " wide" : "") + (className ? " " + className : "")}><span className="cell-label">{label}</span>{children}</div>;
}
/* options as rows of 64: a title and a grey line, the chosen one inverted with a check (c19 rules, c8 settings) */
export function OptionRows({ name, options, value, onChange, disabled = false }) {
  return (
    <div className="stack" role="radiogroup">
      {options.map(op => <label key={op.value} className={"opt-row " + (value === op.value ? "inv" : "pn") + (disabled ? " off" : "")}>
        <input type="radio" className="sr-only" name={name} checked={value === op.value} disabled={disabled} onChange={() => onChange(op.value)} />
        <span className="opt-copy"><b className="t15">{op.title}</b>{op.line && <span className="t12 reg opt-line">{op.line}</span>}</span>
        {value === op.value && <Icon n="check" size={20} />}
      </label>)}
    </div>
  );
}
export function Dock({ toast, children }) {
  return <div className="dock">{toast}{children}</div>;
}
export function Toast({ error = false, action, onAction, children }) {
  return (
    <div className="toast-panel inv" role={error ? "alert" : "status"}>
      <span className="toast-say">{error && <Bang />}{children}</span>
      {action && <button type="button" className="toast-act" onClick={onAction}>{action}</button>}
    </div>
  );
}

/* Page tabs: words 15 on a 44 line with a hairline under the row; the chosen word is 700, lit, with a 2px line under it. */
export function TabsLine({ value, onChange, options, label }) {
  const ref = useSlideLine(value, true);
  return (
    <div className="tabsline" role="tablist" aria-label={label} ref={ref}>
      {options.map(([key, text]) => <button type="button" role="tab" key={key} aria-selected={value === key} className={value === key ? "on" : undefined} onClick={() => onChange(key)}>{text}</button>)}
    </div>
  );
}

/* Steps of a flow (DESIGN.md "Controls"): a row of panels, 44; done dim with a check, current inverted, next muted. at is 1-based;
   past the last step every step is done. */
export function Steps({ labels, at }) {
  return (
    <ol className="stack steps" style={{ "--n": labels.length }}>
      {labels.map((label, i) => {
        const n = i + 1, state = n < at ? "done" : n === at ? "inv" : "next";
        return <li key={label} className={"step " + (state === "inv" ? "inv" : "pn " + state)} aria-current={state === "inv" ? "step" : undefined}>
          <span className="num">{n}</span>{state === "done" && <Icon n="check" size={16} />}{label}</li>;
      })}
    </ol>
  );
}

/* A status at a row's end: the amber lamp beside 진행 중 for what is live, otherwise the words dim. */
export function Status({ live, children }) {
  return <span className={"status t12" + (live ? "" : " dim")}>{live && <i className="lamp sig" aria-hidden="true" />}{children}</span>;
}

/* Chips: filters and counts as 32 panels in a row, 12px, the applied one inverted, the count in its word (전체 59). */
export function Chips({ value, onChange, options, label }) {
  const ref = useRef(null);
  useLightOnChange(ref, value);
  return (
    <div className="chips" role="group" aria-label={label} ref={ref}>
      {options.map(([key, text]) => <button type="button" key={key} aria-pressed={value === key} className={value === key ? "inv" : "pn"} onClick={() => onChange(key)}>{text}</button>)}
    </div>
  );
}
