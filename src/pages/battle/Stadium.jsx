import React, { useMemo } from "react";
import Seg from "../../components/common/Seg.jsx";

/* 경기장 (DESIGN.md "Battle", The stage). 밤의 경기장: 하늘에서 벽까지 내려오는 남색, 관중석의 실루엣과 카메라 플래시,
   네 줄의 조명과 그 아래로 떨어지는 빛줄기, 뒷벽 가운데 경기장 전광판(두 이름, 턴, 진행 중 램프). 모두 한 번 그려 두고,
   움직이는 것은 플래시의 깜빡임과 조명이 켜지는 순간뿐이다. 테마와 상관없이 늘 밤이다(경기장은 화면 속 게임의 세계다). */

const seeded = n => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
const TIERS = [{ y: 31, h: 4.2, w: 2.6 }, { y: 25.5, h: 3.8, w: 2.3 }, { y: 20.5, h: 3.4, w: 2 }, { y: 16, h: 3, w: 1.8 }, { y: 12, h: 2.6, w: 1.6 }];
const BANKS = [[4, 16], [19, 31], [69, 81], [84, 96]];

// the crowd as heads and shoulders, tier on tier, in the dark under the lights
function Stands() {
  const crowd = useMemo(() => {
    let d = "";
    TIERS.forEach((t, row) => {
      for (let x = .5; x < 100; x += t.w * (1.05 + seeded(row * 7 + x) * .4)) {
        if (row >= 3 && x > 35 && x < 65) continue;
        const h = t.h * (.8 + seeded(x * 3 + row) * .35), r = t.w * .32, cx = x + t.w / 2, top = t.y - h;
        d += `M${(x).toFixed(2)} ${t.y}V${(top + r * 1.6).toFixed(2)}Q${x.toFixed(2)} ${(top + r * .9).toFixed(2)} ${(cx - r).toFixed(2)} ${(top + r * .9).toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(cx + r).toFixed(2)} ${(top + r * .9).toFixed(2)}Q${(x + t.w).toFixed(2)} ${(top + r * .9).toFixed(2)} ${(x + t.w).toFixed(2)} ${(top + r * 1.6).toFixed(2)}V${t.y}Z`;
      }
    });
    return d;
  }, []);
  // camera flashes in the stands: a few, each on its own slow rhythm
  const flashes = useMemo(() => Array.from({ length: 18 }, (_, i) => ({ left: 3 + seeded(i * 5.1) * 94, top: 10 + seeded(i * 2.3) * 22, delay: -seeded(i * 9.7) * 6, dur: 3.2 + seeded(i * 4.4) * 4 }))
    .filter(f => !(f.left > 35 && f.left < 65 && f.top < 17)), []);
  return <>
    <svg className="bs-stands" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
      <path className="crowd" d={crowd} />
      <path className="rail" d="M0 35.2H100" />
    </svg>
    <div className="bs-flashes" aria-hidden="true">{flashes.map((f, i) => <i key={i} style={{ left: `${f.left}%`, top: `${f.top}%`, animationDelay: `${f.delay}s`, animationDuration: `${f.dur}s` }} />)}</div>
  </>;
}

// four banks of lamps along the roof, each switching on in its turn as the battle opens, and the light they pour on the field
function Lights() {
  return <div className="bs-lights" aria-hidden="true">
    {BANKS.map(([a, b], bank) => <span key={bank} className="bs-bank" style={{ left: `${a}%`, width: `${b - a}%`, "--bank": bank }}>
      {Array.from({ length: 10 }, (_, i) => <i key={i} />)}
    </span>)}
    {BANKS.map(([a, b], bank) => <i key={`c${bank}`} className="bs-shaft" style={{ left: `${(a + b) / 2}%`, "--bank": bank, "--lean": `${(bank < 2 ? 1 : -1) * (bank % 3 ? 10 : 18)}deg` }} />)}
  </div>;
}

/* the venue's own screen: the two names, the turn, the amber lamp while the battle runs; the winner's name lights */
function Board({ names, turn, live, winner }) {
  return <div className="bs-board" aria-hidden="true">
    <span className={"bs-board-name" + (winner === "p1" ? " win" : "")}>{names?.p1 || ""}</span>
    <span className="bs-board-mid">
      <i className={"bs-board-lamp" + (live ? " on" : "")} />
      <Seg value={String(Math.min(99, turn || 0)).padStart(2, "0")} h={20} cells={2} label="" />
    </span>
    <span className={"bs-board-name" + (winner === "p2" ? " win" : "")}>{names?.p2 || ""}</span>
  </div>;
}

export default function Stadium({ names, turn, live, winner }) {
  return <>
    <i className="bs-sky" aria-hidden="true" />
    <Stands />
    <Lights />
    <Board names={names} turn={turn} live={live} winner={winner} />
    <i className="bs-floor" aria-hidden="true" />
  </>;
}
