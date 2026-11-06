import { reduced } from "../../components/common/motion.js";

/* 배틀의 문 (DESIGN.md "Battle", Going in). Pressing 배틀 시작, 방 만들기, 참가 or 다시하기, the moment the opponent comes in, and the
   moment the team preview ends, the page does not just change: the stage's own opening plays at the size of the window. The page goes
   dark, one band lit on its two edges opens from its middle line, the two names come in toward VS from their own sides, and one line
   under the band says what this is (the rule, 상대가 들어왔습니다, 배틀 시작). An opponent not yet there stands muted (참가 대기).
   Behind it the next screen is made ready; once it stands (openGate) and the names have been read, the band closes back into its
   line and the dark lifts. Only transform and opacity move; with reduced motion it only fades. A gate nobody opens opens by itself
   after six seconds. A side is a name, or { name, muted }. */
let gate = null;
const DARK = 200, READ = 760, LIMIT = 6000;
const IN = "cubic-bezier(.5,0,.75,0)", OUT = "cubic-bezier(.22,1,.36,1)";

const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
const done = a => a.finished.catch(() => {});
const sideOf = v => (typeof v === "string" ? { name: v } : v || { name: "" });
const nameOf = (side, own) => el("b", "bt-gate-name" + (own ? " own" : "") + (side.muted ? " muted" : ""), side.name);

// resolves once the page is dark under the gate, so the caller can change what is under it
export function closeGate({ ours, theirs, line = "" } = {}) {
  if (gate) return gate.closed;
  const root = el("div", "bt-gate");
  root.setAttribute("aria-hidden", "true");
  const band = el("div", "bt-gate-band");
  const mine = nameOf(sideOf(ours), true), them = nameOf(sideOf(theirs), false);
  const vs = el("span", "bt-gate-vs", "VS");
  band.append(mine, vs, them);
  const say = el("span", "bt-gate-line", line);
  root.append(band, say);
  (document.querySelector(".ypl") || document.body).appendChild(root);
  const calm = reduced();
  const at = performance.now();
  const closed = done(root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DARK, easing: "linear", fill: "both" }));
  if (!calm) {
    const on = (n, frames, delay, duration) => n.animate(frames, { duration, delay, easing: OUT, fill: "both" });
    // the band opens from its middle line, as the stage's does; the names come in toward VS from their own sides
    on(band, [{ transform: "scaleY(0)" }, { transform: "none" }], DARK - 60, 380);
    on(vs, [{ transform: "scale(1.5)", opacity: 0 }, { transform: "none", opacity: 1 }], DARK + 160, 320);
    for (const [n, dx] of [[mine, -32], [them, 32]]) on(n, [{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], DARK + 140, 420);
    on(say, [{ opacity: 0 }, { opacity: 1 }], DARK + 320, 320);
  }
  const me = { root, band, say, at, calm, closed, opening: null };
  me.timer = setTimeout(() => openGate(), LIMIT);
  gate = me;
  return closed;
}

// the next screen stands: once the matchup has been read, the band closes into its line and the dark lifts. Without a gate it does nothing.
export function openGate() {
  const me = gate;
  if (!me || me.opening) return me?.opening || Promise.resolve();
  clearTimeout(me.timer);
  me.opening = (async () => {
    await me.closed;
    const wait = READ - (performance.now() - me.at - DARK);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    // two frames, so what React drew under the gate has painted before it lifts
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!me.calm) {
      me.say.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards" });
      for (const n of me.band.children) n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" });
      await done(me.band.animate([{ transform: "none" }, { transform: "scaleY(0)" }], { duration: 300, delay: 120, easing: IN, fill: "forwards" }));
    }
    await done(me.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: me.calm ? 240 : 280, easing: "linear", fill: "forwards" }));
    me.root.remove();
    if (gate === me) gate = null;
  })();
  return me.opening;
}
