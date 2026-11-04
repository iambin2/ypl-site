import React, { useEffect, useRef, useState } from "react";

/* 무대에 남아 보이는 필드 (DESIGN.md "Battle", The field stays on the stage). 코트, 필드, 룸과 중력, 한쪽 편의 벽, 순풍, 설치기를 그린다.
   모양은 모두 선과 작은 도형이고 색은 타입 색이다. 칠한 면은 거의 없어서 여럿이 겹쳐도 서로를 가리지 않는다.
   자리: 상대 편은 코트의 먼 쪽, 우리 편은 가까운 쪽. 바닥에 놓이는 것(압정, 독압정, 끈적끈적넷)은 그 편의 발 앞,
   떠 있는 것(스텔스록)은 그 편의 둘레, 벽은 그 편을 덮는 반원, 순풍은 그 편 뒤에서 상대 쪽으로 분다. 모양은 battle-stage.css. */

/* a layer that fades in when it comes and out when it goes, so a change of weather or terrain is a cross-fade, never a cut */
const LEAVE_MS = 700;
export function Fading({ kind, value, children }) {
  const [gone, setGone] = useState([]);
  const last = useRef(value);
  useEffect(() => {
    const prev = last.current;
    last.current = value;
    if (!prev || prev === value) return;
    setGone(list => [...list.filter(x => x !== prev), prev]);
    setTimeout(() => setGone(list => list.filter(x => x !== prev)), LEAVE_MS);
  }, [value]);
  return <>
    {gone.filter(g => g !== value).map(g => <i key={g} className={`bs-layer ${kind} ${g} leaving`} aria-hidden="true">{children?.(g)}</i>)}
    {value && <i key={value} className={`bs-layer ${kind} ${value}`} aria-hidden="true">{children?.(value)}</i>}
  </>;
}

// the court in perspective, drawn once: the far line, the centre line and its circle, the two sides running to the camera
export function Court() {
  return <svg className="bs-court" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path d="M27.6 42H72.4M0 59L27.6 42M100 59L72.4 42M-6 52.6H106" />
    <ellipse cx="50" cy="52.6" rx="10" ry="3.1" />
  </svg>;
}

/* a room is a box drawn round the court: its far wall, and the four edges running from its corners to the camera */
export function RoomBox() {
  return <svg className="bs-box" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path className="wall" d="M24 6H76V42H24Z" />
    <path d="M24 6L-8 -20M76 6L108 -20M24 42L-8 104M76 42L108 104" />
    <path className="lines" d="M37 6V42M50 6V42M63 6V42M24 18H76M24 30H76" />
  </svg>;
}

/* ---------- what a side has set up ---------- */
// where each thing stands on each side, in shares of the stage: [left, top, size as a share of the stage's height]
const ROCKS = { foe: [[29, 30, 7], [45, 17, 5], [63, 34, 6.5], [80, 22, 5.5]], own: [[3, 62, 10], [46, 54, 8], [84, 60, 9], [90, 84, 7.5]] };
const SPIKES = { foe: [[40, 52.5], [52, 54], [64, 52.8], [34, 54.6], [58, 55.6], [70, 54.8], [46, 56.2], [76, 56.6], [28, 56.4]],
  own: [[14, 93], [40, 95], [70, 94], [26, 97.5], [56, 97.8], [84, 96.6], [6, 97], [48, 92.4], [92, 92.6]] };
const TOXIC = { foe: [[44, 55.2], [60, 53.6], [36, 52.6], [68, 56.4]], own: [[33, 94], [62, 92], [18, 96.4], [76, 98]] };
const SPIKE_SIZE = { foe: 5.4, own: 8 };

function Rock({ at: [x, y, s] }) {
  return <svg className="bs-rock" style={{ left: `${x}%`, top: `${y}%`, height: `${s}%` }} viewBox="0 0 20 24" aria-hidden="true">
    <path className="r0" d="M10 0 19 8 15 24 5 24 1 8Z" /><path className="r1" d="M10 0 19 8 11 11Z" /><path className="r2" d="M1 8 10 0 11 11 5 24Z" />
  </svg>;
}
function Spike({ at: [x, y], size, toxic }) {
  return <svg className={"bs-spike" + (toxic ? " toxic" : "")} style={{ left: `${x}%`, top: `${y}%`, height: `${size}%` }} viewBox="0 0 24 12" aria-hidden="true">
    <path className="s0" d="M12 0 14.4 4.6 24 6 14.4 7.4 12 12 9.6 7.4 0 6 9.6 4.6Z" /><path className="s1" d="M12 0 14.4 4.6 12 6 9.6 4.6Z" />
  </svg>;
}
// a web lying flat on the floor: spokes from its centre and three rings, drawn in perspective (the viewBox is wider than tall)
const SPOKES = Array.from({ length: 12 }, (_, i) => { const a = i / 12 * Math.PI * 2; return [50 + Math.cos(a) * 49, 20 + Math.sin(a) * 19]; });
const WEB = [
  ...SPOKES.map(([x, y]) => `M50 20L${x.toFixed(1)} ${y.toFixed(1)}`),
  ...[.34, .64, .94].map(r => "M" + SPOKES.map(([x, y]) => `${(50 + (x - 50) * r).toFixed(1)} ${(20 + (y - 20) * r).toFixed(1)}`).join("L") + "Z"),
].join("");
function Web({ own }) {
  return <svg className={`bs-web ${own ? "own" : "foe"}`} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d={WEB} /></svg>;
}

// on the floor, under the Pokémon: spikes, toxic spikes, sticky web; and stealth rock floating round the side
export function Hazards({ cond, layers, own }) {
  const at = own ? "own" : "foe";
  const n = Math.min(3, layers.spikes || 1), t = Math.min(2, layers.toxicspikes || 1);
  return <div className={`bs-hazards ${at}`} aria-hidden="true">
    {cond.includes("stickyweb") && <Web own={own} />}
    {cond.includes("spikes") && SPIKES[at].slice(0, n * 3).map((p, i) => <Spike key={`s${i}`} at={p} size={SPIKE_SIZE[at]} />)}
    {cond.includes("toxicspikes") && TOXIC[at].slice(0, t * 2).map((p, i) => <Spike key={`t${i}`} at={p} size={SPIKE_SIZE[at]} toxic />)}
    {cond.includes("stealthrock") && ROCKS[at].map((p, i) => <Rock key={`r${i}`} at={p} />)}
  </div>;
}

// tailwind: gusts that blow from behind the side toward the foe
export function Wind({ on, own }) {
  return on ? <i className={`bs-tailwind ${own ? "own" : "foe"}`} aria-hidden="true"><i /></i> : null;
}

// the screens a side has up stand over it as domes, one inside the next, each an outline in its colour: they never hide the Pokémon
const SCREENS = ["reflect", "lightscreen", "auroraveil", "safeguard", "mist"];
export function Screens({ cond, own }) {
  const up = SCREENS.filter(c => cond.includes(c));
  if (!up.length) return null;
  return <div className={`bs-screens ${own ? "own" : "foe"}`} aria-hidden="true">
    {up.map((c, i) => <svg key={c} className={`bs-dome ${c}`} style={{ "--i": i }} viewBox="0 0 100 50" preserveAspectRatio="none">
      <path className="fill" d="M0 50A50 50 0 0 1 100 50Z" /><path d="M0 50A50 50 0 0 1 100 50" />
    </svg>)}
  </div>;
}
