import React, { useMemo, useRef, useState } from "react";
import Button from "../components/common/Button.jsx";
import Dropdown from "../components/common/Dropdown.jsx";
import Field from "../components/common/Field.jsx";
import Empty from "../components/common/Empty.jsx";
import Loader from "../components/common/Loader.jsx";
import { Choice, Question, SectionHead } from "../components/common/Board.jsx";
import { Arena, Waiting, useResources } from "./BattlePage.jsx";
import { createBattleReader } from "../services/battleLog.js";
import { readSavedTeams, showdownTeam } from "../services/battleTeams.js";
import { formatId, startBattle, choose, forfeit, readout } from "../../supabase/functions/battle/engine.mjs";
import { LAB_TEAMS } from "./battleLabTeams.js";

/* 배틀 실험실 (?view=lab, 개발 서버에서만). 쇼다운 엔진을 이 브라우저에서 돌려 두 자리를 모두 직접 조작하고,
   배틀 화면(BattlePage의 Arena)을 그대로 띄운다. 서버도 DB도 쓰지 않는다.
   아래의 도구는 기록(쇼다운 프로토콜) 줄을 화면에만 넣는다: 동작, 날씨, 필드, 상태를 바로 켜 보되 엔진의 판정은 바꾸지 않는다. */
const NAMES = { p1: "가람", p2: "나래" };
const SEATS = [["p1", `${NAMES.p1} 자리`], ["p2", `${NAMES.p2} 자리`], ["spectator", "관전"]];
const FORMATS = [["doubles", "더블"], ["singles", "싱글"]];
const SCREENS = ["배틀", "대기 (친선)", "대기 (공식)"];
const KINDS = ["친선", "공식 (반영)", "공식 (넣는 중)", "공식 (오류)"];
const CHASE = { Normal: "Hyper Voice", Fire: "Flamethrower", Water: "Hydro Pump", Electric: "Thunderbolt", Grass: "Energy Ball", Ice: "Ice Beam", Fighting: "Aura Sphere", Poison: "Sludge Bomb", Ground: "Earth Power", Flying: "Air Slash", Psychic: "Psychic", Bug: "Bug Buzz", Rock: "Power Gem", Ghost: "Shadow Ball", Dragon: "Draco Meteor", Dark: "Dark Pulse", Steel: "Flash Cannon", Fairy: "Moonblast" };
const HITS = [["없음", 0], ["25%", .25], ["50%", .5], ["전부", 1]];
const STATUSES = ["brn", "par", "slp", "frz", "psn", "tox"];
const STATUS_NAMES = { brn: "화상", par: "마비", slp: "잠듦", frz: "얼음", psn: "독", tox: "맹독" };
const STAT_KEYS = ["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"];
const WEATHERS = ["RainDance", "SunnyDay", "Sandstorm", "Snowscape", "Hail"];
const FIELDS = ["Trick Room", "Electric Terrain", "Psychic Terrain", "Grassy Terrain", "Misty Terrain", "Gravity", "Magic Room", "Wonder Room"];
const SIDE = ["Reflect", "Light Screen", "Aurora Veil", "Tailwind", "Stealth Rock", "Spikes", "Toxic Spikes", "Sticky Web", "Safeguard", "Mist"];
const toId = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function BattleLabPage({ flash: say, go }) {
  const res = useResources();
  if (!res) return <Loader />;
  if (res.error) return <Empty title="배틀을 준비하지 못했습니다." desc={String(res.error.message || res.error)} />;
  return <Lab res={res} say={say} go={go} />;
}

/* a row of keys on the choice grid: a press runs at once */
function Keys({ keys }) {
  return <div className="choice stack">{keys.map(([label, run, off]) =>
    <button key={label} type="button" className="choice-opt pn" disabled={off} onClick={run}>{label}</button>)}</div>;
}
/* the same grid as switches: a lit one is on */
function Toggles({ options, on, onToggle }) {
  return <div className="choice stack">{options.map(([id, label]) =>
    <label key={id} className={"choice-opt " + (on.includes(id) ? "inv" : "pn")}>
      <input type="checkbox" className="sr-only" checked={on.includes(id)} onChange={() => onToggle(id)} />{label}
    </label>)}</div>;
}

function Lab({ res, say, go }) {
  const teams = useMemo(() => [
    ...Object.entries(LAB_TEAMS).map(([label, sets]) => ({ label, sets, reg: "m-c" })),
    ...readSavedTeams().filter(t => t.regulationId === "m-c" || t.regulationId === "m-b").map(t => ({ label: `저장: ${t.name}`, sets: showdownTeam(t, res.detail), reg: t.regulationId })),
  ], [res]);
  const teamOptions = teams.map((t, i) => ({ value: String(i), label: t.label }));
  const [format, setFormat] = useState("doubles");
  const [picks, setPicks] = useState({ p1: "0", p2: String(Math.min(1, teams.length - 1)) });
  const [seat, setSeat] = useState("p1");
  const [auto, setAuto] = useState(true);
  const [screen, setScreen] = useState(SCREENS[0]);
  const [kind, setKind] = useState(KINDS[0]);
  const [error, setError] = useState("");
  const [, setVersion] = useState(0);
  const lab = useRef(null);
  const autoRef = useRef(auto); autoRef.current = auto;
  const seatRef = useRef(seat); seatRef.current = seat;

  // the engine runs here; every side but the seat (or both, when watching) can be chosen for by Showdown's default
  const openFor = (b, side) => { const r = b[side].activeRequest; return r && !r.wait && !b[side].isChoiceDone(); };
  const autoChoose = sides => {
    const b = lab.current.battle;
    for (let i = 0; i < 20 && !b.ended; i++) {
      const open = sides.filter(side => openFor(b, side));
      if (!open.length) break;
      for (const side of open) b.choose(side, "default");
    }
  };
  const step = () => {
    const L = lab.current;
    if (autoRef.current) autoChoose(["p1", "p2"].filter(side => side !== seatRef.current && seatRef.current !== "spectator"));
    const out = readout(L.battle);
    const channels = { p1: out.sideLog.p1, p2: out.sideLog.p2, spectator: out.spectatorLog };
    for (const key of Object.keys(channels)) {
      const lines = channels[key] ? channels[key].split("\n") : [];
      L.logs[key].push(...lines.slice(L.read[key]));
      L.read[key] = lines.length;
    }
    L.out = out;
    setVersion(v => v + 1);
  };
  const start = () => {
    setError("");
    try {
      const reg = teams[picks.p1].reg;
      const formatid = formatId(reg, format);
      const seed = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x10000));
      const battle = startBattle({ formatid, seed, p1: { name: NAMES.p1, team: teams[picks.p1].sets }, p2: { name: NAMES.p2, team: teams[picks.p2].sets } });
      lab.current = { n: (lab.current?.n || 0) + 1, battle, reg, formatid, forfeited: false, logs: { p1: [], p2: [], spectator: [] }, read: { p1: 0, p2: 0, spectator: 0 } };
      step();
    } catch (e) { setError(e.message); }
  };
  const L = lab.current;
  const seatSide = seat === "spectator" ? null : seat;
  const api = {
    choose: async (_, choice) => {
      const done = choose(L.battle, null, seatSide, choice);
      if (!done.ok) throw new Error(done.error);
      step();
      return null;
    },
    forfeit: async () => { forfeit(L.battle, seatSide); L.forfeited = true; step(); return null; },
  };
  const inject = lines => {
    const list = lines.filter(Boolean);
    if (!list.length) return;
    for (const key of Object.keys(L.logs)) L.logs[key].push(...list);
    setVersion(v => v + 1);
  };

  // the field as the screen reads it, from each player's own log (exact HP), so a key acts on what is shown
  const seen = useMemo(() => {
    if (!L) return null;
    const readAll = side => { const reader = createBattleReader({ text: res.text, moves: res.detail.moves, perspective: side }); L.logs[side].forEach(line => reader.read(line)); return reader; };
    return { p1: readAll("p1"), p2: readAll("p2") };
  }, [L, L?.logs.p1.length, L?.logs.p2.length]);

  const out = L?.out;
  const row = out && {
    id: `lab-${L.n}`, regulation: L.reg, format_id: L.formatid, status: out.ended ? "ended" : "active",
    p1_name: NAMES.p1, p2_name: NAMES.p2, turn: out.turn, winner: out.winner, ended_by: L.forfeited ? "forfeit" : null,
    spectator_log: L.logs.spectator.join("\n"), kind: kind === "친선" ? "friendly" : "official", event_id: null,
    applied_at: kind === "공식 (반영)" ? "now" : null, apply_error: kind === "공식 (오류)" ? "실험실의 예시 오류" : null,
  };
  const view = out && seatSide && {
    side: seatSide, status: row.status, turn: out.turn, winner: out.winner, request: out.request[seatSide],
    chosen: openFor(L.battle, seatSide) || !out.request[seatSide] || out.request[seatSide].wait ? null : "chosen",
    log: L.logs[seatSide].join("\n"),
  };
  const waitingRow = { regulation: "m-c", format_id: formatId("m-c", format), kind: screen === "대기 (공식)" ? "official" : "friendly" };

  return (
    <div className="bt-page">
      <h1 className="t32">배틀 실험실</h1>
      <p className="read dim bt-intro">이 브라우저에서 쇼다운 엔진을 돌려 두 자리를 모두 직접 고릅니다. 서버와 DB에는 아무것도 남지 않습니다. 개발 서버에서만 열립니다.</p>

      <Question id="lab-screen" label="화면" group>
        <Choice name="lab-screen" options={SCREENS} value={screen} onChange={setScreen} />
      </Question>
      {screen !== "배틀"
        ? <Waiting row={waitingRow} onShare={() => say?.("실험실: 링크 공유")} onCancel={() => say?.("실험실: 대기 취소")} />
        : row
        ? <Arena key={`${row.id}-${seat}`} row={row} view={view} seat={seatSide ? { side: seatSide } : null} res={res} onView={() => {}} onShare={() => say?.("실험실: 링크 공유")} go={go} api={api} />
        : <Empty title="배틀을 열어 주세요." desc="아래에서 형식과 두 팀을 고르고 새 배틀을 누르면 시작합니다." />}

      <SectionHead title="배틀 준비" />
      <Question id="lab-format" label="형식" group>
        <Choice name="lab-format" options={FORMATS.map(([, l]) => l)} value={FORMATS.find(([k]) => k === format)[1]} onChange={label => setFormat(FORMATS.find(([, l]) => l === label)[0])} />
      </Question>
      {["p1", "p2"].map(side => <Question key={side} id={`lab-team-${side}`} label={`${NAMES[side]}의 팀`}>
        <Dropdown id={`lab-team-${side}`} value={picks[side]} options={teamOptions} onChange={v => setPicks(p => ({ ...p, [side]: v }))} ariaLabel={`${NAMES[side]}의 팀`} />
      </Question>)}
      {error && <p className="t12 dim">{error}</p>}
      <Button variant="second" onClick={start}>{L ? "새 배틀" : "배틀 열기"}</Button>

      <SectionHead title="자리" />
      <Question id="lab-seat" label="보는 자리" group>
        <Choice name="lab-seat" options={SEATS.map(([, l]) => l)} value={SEATS.find(([k]) => k === seat)[1]} onChange={label => setSeat(SEATS.find(([, l]) => l === label)[0])} />
      </Question>
      <Choice name="lab-auto" options={["상대는 쇼다운 기본 선택으로 자동"]} value={auto ? ["상대는 쇼다운 기본 선택으로 자동"] : []} onChange={list => setAuto(list.length > 0)} multiple />
      {L && <Keys keys={[["지금 열린 선택을 모두 자동으로", () => { autoChoose(["p1", "p2"]); step(); }, out?.ended]]} />}
      <Question id="lab-kind" label="경기 종류 (끝난 뒤 줄)" group>
        <Choice name="lab-kind" options={KINDS} value={kind} onChange={setKind} />
      </Question>

      {L && seen && <Bench res={res} seen={seen} doubles={/vgc/.test(L.formatid)} inject={inject} turn={out?.turn || 0} />}
    </div>
  );
}

/* ---------- the bench: protocol lines put on the screen alone ---------- */
function Bench({ res, seen, doubles, inject, turn }) {
  const slots = ["p1", "p2"].flatMap(side => (doubles ? [0, 1] : [0]).map(slot => `${side}${"ab"[slot]}`));
  const monAt = key => seen[key.slice(0, 2)].state.sides[key.slice(0, 2)].active[key.charCodeAt(2) - 97];
  const slotLabel = key => { const mon = monAt(key); return `${NAMES[key.slice(0, 2)]} ${mon ? seen.p1.speciesName(mon.species) : "빈 자리"}`; };
  const [src, setSrc] = useState("p1a");
  const [tgt, setTgt] = useState("p2a");
  const [type, setType] = useState("Fire");
  const [hit, setHit] = useState("25%");
  const [stat, setStat] = useState("atk");
  const [free, setFree] = useState("");
  const from = slots.includes(src) ? src : slots[0];
  const to = slots.includes(tgt) ? tgt : slots[slots.length - 1];
  const ident = key => `${key}: ${monAt(key)?.name || key}`;
  const side = key => key.slice(0, 2);
  const foes = key => slots.filter(k => side(k) !== side(key) && monAt(k) && !monAt(k).fainted);

  // HP moved by a share of the maximum; at nothing the Pokémon falls
  const hpLines = (key, share, how = "") => {
    const mon = monAt(key);
    if (!mon || mon.fainted || !share) return [];
    const hp = Math.max(0, Math.min(mon.maxhp, Math.round(mon.hp + share * mon.maxhp)));
    const cond = hp === 0 ? "0 fnt" : `${hp}/${mon.maxhp}${mon.status ? ` ${mon.status}` : ""}`;
    return [`|${share < 0 ? "-damage" : "-heal"}|${ident(key)}|${cond}${how}`, hp === 0 ? `|faint|${ident(key)}` : ""];
  };
  const damage = HITS.find(([l]) => l === hit)[1];
  const move = (name, targets, extra = "") => [`|move|${ident(from)}|${name}|${targets[0] ? ident(targets[0]) : ""}${extra}`, ...targets.flatMap(k => hpLines(k, -damage))];
  const tName = t => res.text.types[t] || t;

  return <>
    <SectionHead title="동작 넣기" />
    <p className="t12 dim">아래 단추는 기록 줄을 화면에만 넣습니다. 엔진의 판정은 바뀌지 않아서, 다음 턴이 진행되면 HP와 상태는 엔진의 값으로 돌아옵니다.</p>
    <Question id="lab-src" label="쓰는 쪽" group><Choice name="lab-src" options={slots.map(slotLabel)} value={slotLabel(from)} onChange={l => setSrc(slots.find(k => slotLabel(k) === l))} /></Question>
    <Question id="lab-tgt" label="받는 쪽" group><Choice name="lab-tgt" options={slots.map(slotLabel)} value={slotLabel(to)} onChange={l => setTgt(slots.find(k => slotLabel(k) === l))} /></Question>
    <Question id="lab-hit" label="기술의 피해" group><Choice name="lab-hit" options={HITS.map(([l]) => l)} value={hit} onChange={setHit} /></Question>
    <Question id="lab-type" label="특수 기술의 타입 (쫓는 칸의 색)">
      <Dropdown id="lab-type" value={type} options={Object.keys(CHASE).map(t => ({ value: t, label: `${tName(t)} (${res.text.moves[toId(CHASE[t])]?.name || CHASE[t]})` }))} onChange={setType} ariaLabel="특수 기술의 타입" />
    </Question>
    <Keys keys={[
      ["물리 기술 (strike)", () => inject(move("Tackle", [to]))],
      ["특수 기술 (chase)", () => inject(move(CHASE[type], [to]))],
      ["범위 기술", () => { const targets = foes(from); if (targets.length) inject(move(CHASE[type], targets, `|[spread] ${targets.join(",")}`)); }],
      ["자기 기술 (flash)", () => inject([`|move|${ident(from)}|Swords Dance|${ident(from)}`, `|-boost|${ident(from)}|atk|2`])],
      ["빗나감", () => inject([`|move|${ident(from)}|${CHASE[type]}|${ident(to)}|[miss]`, `|-miss|${ident(from)}|${ident(to)}`])],
      ["메가진화 (flash)", () => inject([`|-mega|${ident(from)}|${monAt(from)?.species || ""}|`])],
    ]} />
    <Keys keys={[
      ["받는 쪽 피해 25% (take)", () => inject(hpLines(to, -.25))],
      ["받는 쪽 회복 25%", () => inject(hpLines(to, .25, "|[from] item: Leftovers"))],
      ["받는 쪽 쓰러짐 (fall)", () => inject(hpLines(to, -1))],
      ["받는 쪽 다시 등장 (enter)", () => { const mon = monAt(to); if (mon) inject([`|switch|${ident(to)}|${mon.species}, L50|${mon.maxhp}/${mon.maxhp}`]); }],
    ]} />

    <SectionHead title="상태와 능력 변화 (받는 쪽)" />
    <Keys keys={[...STATUSES.map(s => [STATUS_NAMES[s], () => inject([`|-status|${ident(to)}|${s}`])]),
      ["상태 풀기", () => { const s = monAt(to)?.status; if (s && s !== "fnt") inject([`|-curestatus|${ident(to)}|${s}|[msg]`]); }],
      ["혼란", () => inject([`|-start|${ident(to)}|confusion`])]]} />
    <Question id="lab-stat" label="능력">
      <Dropdown id="lab-stat" value={stat} options={STAT_KEYS.map(k => ({ value: k, label: res.text.stats[k] || k }))} onChange={setStat} ariaLabel="능력" />
    </Question>
    <Keys keys={[["+1", 1], ["+2", 2], ["+3", 3], ["-1", -1], ["-2", -2]].map(([l, n]) => [l, () => inject([`|${n > 0 ? "-boost" : "-unboost"}|${ident(to)}|${stat}|${Math.abs(n)}`])])
      .concat([["능력 변화 초기화", () => inject([`|-clearboost|${ident(to)}`])]])} />

    <SectionHead title="날씨와 필드" />
    <Question id="lab-weather" label="날씨" group>
      <Choice name="lab-weather" options={["없음", ...WEATHERS.map(w => res.text.default[toId(w)]?.weatherName || w)]}
        value={res.text.default[seen.p1.state.weather]?.weatherName || "없음"}
        onChange={label => { const w = WEATHERS.find(x => res.text.default[toId(x)]?.weatherName === label); inject([w ? `|-weather|${w}` : "|-weather|none"]); }} />
    </Question>
    <Question id="lab-field" label="필드" group>
      <Toggles options={FIELDS.map(f => [toId(f), res.text.moves[toId(f)]?.name || f])} on={seen.p1.state.fields}
        onToggle={id => { const f = FIELDS.find(x => toId(x) === id); const on = seen.p1.state.fields.includes(id); inject([on ? `|-fieldend|move: ${f}` : `|-fieldstart|move: ${f}|[of] ${ident(from)}`]); }} />
    </Question>
    {["p1", "p2"].map(s => <Question key={s} id={`lab-side-${s}`} label={`${NAMES[s]} 쪽`} group>
      <Toggles options={SIDE.map(c => [toId(c), res.text.moves[toId(c)]?.name || c])} on={seen.p1.state.sides[s].conditions}
        onToggle={id => { const c = SIDE.find(x => toId(x) === id); inject([`|${seen.p1.state.sides[s].conditions.includes(id) ? "-sideend" : "-sidestart"}|${s}: ${NAMES[s]}|move: ${c}`]); }} />
    </Question>)}

    <SectionHead title="문장" />
    <Keys keys={[
      ["급소", () => inject([`|-crit|${ident(to)}`])],
      ["효과가 굉장했다", () => inject([`|-supereffective|${ident(to)}`])],
      ["효과가 별로", () => inject([`|-resisted|${ident(to)}`])],
      ["효과가 없다", () => inject([`|-immune|${ident(to)}`])],
      ["실패", () => inject([`|-fail|${ident(from)}`])],
      ["다음 턴 표시", () => inject([`|turn|${turn + 1}`])],
    ]} />
    <Field label="기록 줄 직접 넣기 (한 줄에 하나, 쇼다운 프로토콜)">
      <textarea rows={4} value={free} onChange={e => setFree(e.target.value)} placeholder={`|move|${ident(from)}|Thunderbolt|${ident(to)}\n|-damage|${ident(to)}|50/100`} />
    </Field>
    <Button variant="second" onClick={() => inject(free.split("\n").map(l => l.trim()))} disabled={!free.trim()}>넣기</Button>
  </>;
}
