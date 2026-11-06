import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import Seg from "../../components/common/Seg.jsx";
import { DUR, EASE_IN, STAGGER, light, pause, reduced } from "../../components/common/motion.js";

/* 배틀의 전광판 (DESIGN.md "Battle", Going in and The big moments; redrawn 2026-11-06 when the band with VS read as cheap and
   machine-made). One board says every moment of a match the way a stadium board does, so going in, the opening and the end are one
   object: a head strip (the lamp and what this is, and on the right what the cells count), then the two sides as rows, the opponent
   above and us below, as the stage stands them, each ending in one segment cell, the Pokémon it has knocked out. Before a match the
   cells are dark (an unplayed score); when it goes live the lamp turns amber; at the end the digits switch on and the winner's row
   inverts with 승리 while the loser's dims, and the lamp lights (done: a result just lit, 2026-11-06: the dark housing beside 종료
   read as a broken square). It switches on and leaves; nothing slides, scales or flies, and the camera holds.
   A row is { label, name, score, won, lost, muted }. */
const COUNTS = "쓰러뜨린 포켓몬";

function Board({ say, live = false, done = false, rows }) {
  return (
    <div className="bt-board">
      <div className="pn bt-board-head">
        <i className={"lamp " + (live ? "sig" : done ? "" : "unlit")} aria-hidden="true" />
        <span className="bt-board-say">{say}</span>
        <span className="bt-board-note">{COUNTS}</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} data-rise="" className={(r.won ? "inv" : "pn") + " bt-board-row" + (r.lost ? " lost" : "") + (r.muted ? " muted" : "")}>
          <span className="bt-board-who">
            <span className="bt-board-label">{r.label || " "}</span>
            <b className="bt-board-name">{r.name}</b>
          </span>
          <Seg value={r.score == null ? " " : String(Math.min(9, r.score))} h={40} cells={1} label={r.score == null ? "" : `${r.score}마리`} />
        </div>
      ))}
    </div>
  );
}

/* a board in host, drawn at once; set() changes it in place (a digit that changes brightens once, a row that inverts tones) */
export function mountBoard(host, props) {
  const root = createRoot(host);
  let now = props;
  const draw = next => { now = { ...now, ...next }; flushSync(() => root.render(<Board {...now} />)); };
  draw({});
  const el = host.firstElementChild;
  return {
    el,
    set: draw,
    // switches on: the strip and the rows top to bottom 38 apart, each rising the last 12 as it lights (motion.js light)
    on: () => { light(el); return pause(DUR.light + STAGGER.row * 2); },
    // goes: the words and the panels together, ease-in, as a page's old content goes
    off: () => (reduced() ? Promise.resolve() : el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.leave, easing: EASE_IN, fill: "forwards" }).finished.catch(() => {}))
      .then(() => root.unmount()),
  };
}

/* the board inside the stage (its .bs-over), centred over the arena, for the opening of a replay and for the end */
/* both on the veil, the arena in view under it (2026-11-07: the end switched the arena off to the ground and back, "경기장 위에 떴으면") */
export async function playBoard(over, props, steps = []) {
  if (!over) return;
  const host = document.createElement("div");
  host.className = "bt-board-host";
  over.appendChild(host);
  const b = mountBoard(host, props);
  const veil = to => (reduced() ? Promise.resolve() : host.animate([{ opacity: 1 - to }, { opacity: to }], { duration: to ? DUR.tone : DUR.leave, delay: to ? 0 : DUR.tone, easing: to ? "linear" : EASE_IN, fill: "both" }).finished.catch(() => {}));
  veil(1);
  await b.on();
  for (const [ms, next] of steps) { await pause(ms); b.set(next); }
  await Promise.all([b.off(), veil(0)]);
  host.remove();
}
