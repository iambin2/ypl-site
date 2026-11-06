import { DUR, pause, reduced } from "../../components/common/motion.js";
import { mountBoard } from "./Scoreboard.jsx";

/* 배틀의 문 (DESIGN.md "Battle", Going in). Pressing 배틀 시작, 방 만들기, 참가 or 다시하기, the moment the opponent comes in, and the
   moment the team preview ends, the page does not just change: the board switches off to its ground and the match board lights in its
   middle (Scoreboard.jsx: the head strip with what this is, the opponent's row above ours, each with its dark cell). Behind it the
   next screen is made ready; once it stands (openGate) and the board has been read, its lamp turns amber, the match is live, and the
   board and the ground go. Only opacity and the 12 a panel rises move; with reduced motion it only appears and goes.
   A gate nobody opens opens by itself after six seconds. A side is a name, or { name, muted } (an opponent not yet there). */
let gate = null;
const READ = 760, LIMIT = 6000;

const done = a => a.finished.catch(() => {});
const sideOf = v => (typeof v === "string" ? { name: v } : v || { name: "" });

// resolves once the page is dark under the gate, so the caller can change what is under it
export function closeGate({ ours, theirs, line = "" } = {}) {
  if (gate) return gate.closed;
  const root = document.createElement("div");
  root.className = "bt-gate";
  root.setAttribute("aria-hidden", "true");
  (document.querySelector(".ypl") || document.body).appendChild(root);
  const them = sideOf(theirs), me = sideOf(ours);
  const board = mountBoard(root, { say: line, rows: [
    { label: them.muted ? "참가 대기" : "상대", name: them.name, muted: them.muted },
    { label: "나", name: me.name },
  ] });
  const calm = reduced();
  const at = performance.now();
  // the page switches off to the ground (tone) as the board lights on it, the strip first and the rows after it
  const closed = done(root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: calm ? 1 : DUR.tone, easing: "linear", fill: "both" }));
  board.on();
  const g = { root, board, at, calm, closed, opening: null };
  g.timer = setTimeout(() => openGate(), LIMIT);
  gate = g;
  return closed;
}

// the next screen stands: once the board has been read the lamp turns amber, the match is live, and the board and its ground go.
// Without a gate it does nothing.
export function openGate() {
  const g = gate;
  if (!g || g.opening) return g?.opening || Promise.resolve();
  clearTimeout(g.timer);
  g.opening = (async () => {
    await g.closed;
    const wait = READ - (performance.now() - g.at - DUR.tone);
    if (wait > 0) await pause(wait);
    // two frames, so what React drew under the gate has painted before it lifts
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    g.board.set({ live: true });
    await pause(DUR.leave);
    await Promise.all([g.board.off(), done(g.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.leave, delay: g.calm ? 0 : DUR.tone, easing: "linear", fill: "forwards" }))]);
    g.root.remove();
    if (gate === g) gate = null;
  })();
  return g.opening;
}
