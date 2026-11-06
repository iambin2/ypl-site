import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Button from "../components/common/Button.jsx";
import Dropdown from "../components/common/Dropdown.jsx";
import Field from "../components/common/Field.jsx";
import Empty from "../components/common/Empty.jsx";
import Loader from "../components/common/Loader.jsx";
import { Choice, Question, SectionHead } from "../components/common/Board.jsx";
import { Arena, Waiting, useResources } from "./BattlePage.jsx";
import { createBattleReader } from "../services/battleLog.js";
import { readSavedTeams, showdownTeam } from "../services/battleTeams.js";
import { formatId, startBattle, choose, forfeit, readout, randomTeam } from "../../supabase/functions/battle/engine.mjs";
import { LAB_TEAMS } from "./battleLabTeams.js";
import { Dex } from "@pkmn/sim";
import { recipeOf } from "./battle/moveFx.js";
import { spriteUrl, onSpriteError } from "../services/teamBuilderCore.js";
import * as fx from "./battle/stageFx.js";
import { hitStop } from "./battle/stageCamera.js";
import { glOf } from "./battle/gl.js";

/* 배틀 실험실 (?view=lab, 개발 서버에서만). 쇼다운 엔진을 이 브라우저에서 돌려 두 자리를 모두 직접 조작하고,
   배틀 화면(BattlePage의 Arena)을 그대로 띄운다. 서버도 DB도 쓰지 않는다.
   아래의 도구는 기록(쇼다운 프로토콜) 줄을 화면에만 넣는다: 동작, 날씨, 필드, 상태를 바로 켜 보되 엔진의 판정은 바꾸지 않는다. */
const NAMES = { p1: "가람", p2: "나래" };
const SEATS = [["p1", `${NAMES.p1} 자리`], ["p2", `${NAMES.p2} 자리`], ["spectator", "관전"]];
const FORMATS = [["doubles", "더블"], ["singles", "싱글"]];
const SCREENS = ["기술", "배틀", "대기 (친선)", "대기 (공식)"];
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
    { label: "랜덤 파티", random: true, reg: "m-c" },
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
    // the clock as the server sets it (docs/db/battle_timer.sql): 90 seconds from each move of the engine
    if (!L.out || L.out.spectatorLog !== out.spectatorLog) L.deadline = out.ended ? null : new Date(Date.now() + 90000).toISOString();
    L.out = out;
    setVersion(v => v + 1);
  };
  const teamOf = (pick, formatid) => (teams[pick].random ? randomTeam(formatid) : teams[pick].sets);
  const start = () => {
    setError("");
    try {
      const reg = teams[picks.p1].reg;
      const formatid = formatId(reg, format);
      const seed = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x10000));
      const battle = startBattle({ formatid, seed, p1: { name: NAMES.p1, team: teamOf(picks.p1, formatid) }, p2: { name: NAMES.p2, team: teamOf(picks.p2, formatid) } });
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
    timeout: async () => { forfeit(L.battle, seatSide === "p1" ? "p2" : "p1"); L.forfeited = "timeout"; step(); return null; },
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
    p1_name: NAMES.p1, p2_name: NAMES.p2, turn: out.turn, winner: out.winner, ended_by: L.forfeited === "timeout" ? "timeout" : L.forfeited ? "forfeit" : null, deadline_at: L.deadline,
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
      {screen === "기술" ? <MoveBench res={res} /> : <>
      {screen !== "배틀"
        ? <Waiting row={{ ...waitingRow, p1_name: "실험실", created_at: new Date(Date.now() - 42000).toISOString() }} res={res} team={{ id: "lab", name: "견본 A", regulationId: "m-c", members: LAB_TEAMS["견본 A"].map(s => ({ pokemonName: s.species, pokemonId: s.species.toLowerCase().replace(/[^a-z0-9]/g, "") })) }} onShare={() => say?.("실험실: 링크 공유")} onCancel={() => say?.("실험실: 대기 취소")} />
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
      </>}
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

  /* every move a Pokémon can know in Champions, played one by one on the stage as a move line alone (with the chosen damage):
     how each recipe (moveFx.js) looks. window.__labMoves and __labPlay let a recorder walk them all. */
  const allMoves = useMemo(() => [...new Set(Object.values(res.detail.learnsets).flat())].filter(id => res.detail.moves[id])
    .sort((a, b) => recipeOf(a).localeCompare(recipeOf(b)) || a.localeCompare(b)), [res]);
  const [pick, setPick] = useState(0);
  const [running, setRunning] = useState(false);
  const playMove = id => {
    const data = Dex.moves.get(id), name = data.name;
    const self = ["self", "allySide", "allies", "allyTeam", "adjacentAllyOrSelf"].includes(data.target) && data.target !== "adjacentAlly";
    const spread = ["allAdjacentFoes", "allAdjacent"].includes(data.target) && doubles;
    const targets = self ? [from] : spread ? foes(from) : [data.target === "adjacentAlly" ? slots.find(k => k !== from && side(k) === side(from)) || to : to];
    const hurt = data.category !== "Status" ? targets.flatMap(k => hpLines(k, -damage)) : [];
    inject([`|move|${ident(from)}|${name}|${ident(targets[0])}${spread ? `|[spread] ${targets.join(",")}` : ""}`, ...hurt]);
  };
  const run = useRef(false);
  useEffect(() => () => { run.current = false; }, []);
  const playAll = async from0 => {
    run.current = true; setRunning(true);
    for (let i = from0; i < allMoves.length && run.current; i++) { setPick(i); playMove(allMoves[i]); await new Promise(r => setTimeout(r, 2600)); }
    run.current = false; setRunning(false);
  };
  if (typeof window !== "undefined") {
    window.__labMoves = allMoves; window.__labPlay = id => playMove(id); window.__labInject = inject;
    // everyone out back to full HP, so a long run never wears the stage down to empty sides
    window.__labRestore = () => inject(slots.flatMap(k => { const m = monAt(k); return m && !m.fainted && m.hp < m.maxhp ? [`|-heal|${ident(k)}|${m.maxhp}/${m.maxhp}`] : []; }));
  }
  const cur = allMoves[pick] || "";

  return <>
    <SectionHead title={`기술 전체 (${allMoves.length})`} />
    <p className="t12 dim">포켓몬 챔피언스에서 배울 수 있는 기술을 연출 유형 순으로 하나씩 무대에 올립니다. 쓰는 쪽과 받는 쪽, 피해는 아래 동작 넣기의 선택을 따릅니다.</p>
    <Question id="lab-move" label={`기술 (${pick + 1} / ${allMoves.length}, ${recipeOf(cur)})`}>
      <Dropdown id="lab-move" value={String(pick)} options={allMoves.map((id, i) => ({ value: String(i), label: `${recipeOf(id)}: ${res.text.moves[id]?.name || id}` }))} onChange={v => setPick(Number(v))} ariaLabel="기술" />
    </Question>
    <Keys keys={[
      ["이전", () => { const i = Math.max(0, pick - 1); setPick(i); playMove(allMoves[i]); }, running],
      ["재생", () => playMove(cur), running],
      ["다음", () => { const i = Math.min(allMoves.length - 1, pick + 1); setPick(i); playMove(allMoves[i]); }, running],
      [running ? "멈춤" : "여기부터 전부", () => { if (running) run.current = false; else playAll(pick); }],
    ]} />

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

/* ---------- 기술 실험: the battle stage alone, with the Pokémon, the move, the outcome and the clock in the player's hands ---------- */
// no engine and no log: a move is played straight on the stage (stageFx.move), as the tape would play it, and played again at will
const BENCH_SLOTS = { doubles: [["p2a", "foe-d0"], ["p2b", "foe-d1"], ["p1a", "own-d0"], ["p1b", "own-d1"]], singles: [["p2a", "foe"], ["p1a", "own"]] };
const SLOT_NAMES = { p1a: "우리 왼쪽", p1b: "우리 오른쪽", p2a: "상대 왼쪽", p2b: "상대 오른쪽" };
const OUTCOMES = ["명중", "급소", "효과가 굉장함", "효과가 별로", "빗나감", "방어"];
const RATES = [["보통", 1], ["1/2", .5], ["1/4", .25], ["1/10", .1]];
const BENCH_WEATHER = [["", "없음"], ["raindance", "비"], ["sunnyday", "쾌청"], ["sandstorm", "모래바람"], ["snowscape", "설경"], ["hail", "싸라기눈"], ["deltastream", "난기류"]];
const BENCH_FIELDS = [["electricterrain", "일렉트릭필드"], ["grassyterrain", "그래스필드"], ["mistyterrain", "미스트필드"], ["psychicterrain", "사이코필드"], ["trickroom", "트릭룸"], ["magicroom", "매직룸"], ["wonderroom", "원더룸"], ["gravity", "중력"]];
const BENCH_SIDE = [["stealthrock", "스텔스록"], ["spikes", "압정뿌리기"], ["toxicspikes", "독압정"], ["stickyweb", "끈적끈적네트"], ["reflect", "리플렉터"], ["lightscreen", "빛의장막"], ["auroraveil", "오로라베일"], ["safeguard", "신비의부적"], ["mist", "흰안개"], ["tailwind", "순풍"]];
const SELF_TARGETS = ["self", "allySide", "allies", "allyTeam", "adjacentAllyOrSelf"];
const BENCH_START = { p1a: "charizard", p1b: "garchomp", p2a: "tyranitar", p2b: "gengar" };
const FOLLOW = "카메라가 기술을 따라감";

function MoveBench({ res }) {
  const ref = useRef(null);
  const ko = id => res.text.pokedex[id] || res.detail.pokedex[id]?.name || id;
  const roster = useMemo(() => Object.keys(res.detail.learnsets).filter(id => res.detail.pokedex[id]).map(id => ({ value: id, label: ko(id) })).sort((a, b) => a.label.localeCompare(b.label, "ko")), [res]);
  const moveName = id => res.text.moves[id]?.name || res.detail.moves[id]?.name || id;
  const moves = useMemo(() => [...new Set(Object.values(res.detail.learnsets).flat())].filter(id => res.detail.moves[id]).sort((a, b) => moveName(a).localeCompare(moveName(b), "ko")), [res]);
  const [format, setFormat] = useState("doubles");
  const [mons, setMons] = useState(() => Object.fromEntries(Object.entries(BENCH_START).map(([k, id]) => [k, res.detail.pokedex[id] ? id : roster[0]?.value])));
  const [query, setQuery] = useState("");
  const [move, setMove] = useState("flamethrower");
  const [from, setFrom] = useState("p1a");
  const [to, setTo] = useState(["p2a"]);
  const [outcome, setOutcome] = useState(OUTCOMES[0]);
  const [rate, setRate] = useState(RATES[0][0]);
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(false);
  const [weather, setWeather] = useState("");
  const [fields, setFields] = useState([]);
  const [sides, setSides] = useState({ foe: [], own: [] });
  // how many times each was set: spikes stack to 3, toxic spikes to 2, and the field lays down more of them each time
  const [spikeLayers, setSpikeLayers] = useState("1");
  const [toxicLayers, setToxicLayers] = useState("1");
  const [running, setRunning] = useState(false);
  const run = useRef(false);
  useEffect(() => () => { run.current = false; }, []);

  const slots = BENCH_SLOTS[format].map(([k]) => k);
  const side = k => k.slice(0, 2);
  const keyLabel = k => `${format === "singles" ? (side(k) === "p1" ? "우리" : "상대") : SLOT_NAMES[k]} ${ko(mons[k])}`;
  const shown = useMemo(() => { const q = query.trim().toLowerCase(); return q ? moves.filter(id => moveName(id).toLowerCase().includes(q) || id.includes(q.replace(/[^a-z0-9]/g, "") || "\u0000")) : moves; }, [query, moves]);
  const data = res.detail.moves[move] || {};
  const target = Dex.moves.get(move).target;
  const engine = () => glOf(ref.current);

  // who stands where: a Pokémon that changes is sent in again (without a ball)
  const placed = useRef({});
  useLayoutEffect(() => {
    const st = ref.current;
    if (!st) return;
    fx.sync(st);
    for (const k of slots) if (placed.current[k] !== mons[k]) fx.enter(st, k, { ball: false });
    placed.current = Object.fromEntries(slots.map(k => [k, mons[k]]));
  }, [format, ...slots.map(k => mons[k])]);
  useEffect(() => {
    if (!slots.includes(from)) setFrom(slots.find(k => side(k) === "p1"));
    setTo(list => { const kept = list.filter(k => slots.includes(k)); return kept.length ? kept : [slots.find(k => side(k) === "p2")]; });
  }, [format]);
  useEffect(() => {
    const st = ref.current;
    if (!st) return;
    const layers = { spikes: Number(spikeLayers), toxicspikes: Number(toxicLayers) };
    fx.field(st, { weather, fields, foe: { conditions: sides.foe, layers }, own: { conditions: sides.own, layers } });
  }, [weather, fields.join(), sides.foe.join(), sides.own.join(), format, spikeLayers, toxicLayers]);
  useEffect(() => { const e = engine(); if (!e) return; e.scale = RATES.find(([l]) => l === rate)[1]; e.paused = paused; e.camFixed = !follow; if (!follow) e.wide(.3); });

  // the move played as the tape plays it: the camera on the user, the move, and each target's reaction at its impact
  const play = async (id = move) => {
    const st = ref.current, e = engine();
    if (!st || !e) return;
    const m = res.detail.moves[id], tgt = Dex.moves.get(id).target;
    const foes = slots.filter(k => side(k) !== side(from));
    const targets = SELF_TARGETS.includes(tgt) ? [from]
      : format === "doubles" && tgt === "allAdjacentFoes" ? foes
      : format === "doubles" && tgt === "allAdjacent" ? slots.filter(k => k !== from)
      : to.filter(k => slots.includes(k));
    const ahead = { power: {}, missed: new Set(), blocked: new Set() };
    for (const k of targets) {
      if (outcome === "급소" || outcome === "효과가 굉장함") ahead.power[k] = 1.3;
      if (outcome === "효과가 별로") ahead.power[k] = .7;
      if (outcome === "빗나감") ahead.missed.add(k);
      if (outcome === "방어" && k !== from) { ahead.blocked.add(k); fx.shield(st, k); }
    }
    if (follow) e.shot(...fx.spot(st, from), 1.12, { smooth: .21 });
    await fx.move(st, { ident: from, targets, type: m.type, category: m.category, move: id, priority: m.priority || 0, verb: SELF_TARGETS.includes(tgt) ? "self" : "strike", spread: targets.length > 1 }, k => k, ahead);
    if (m.category !== "Status" && outcome !== "빗나감" && outcome !== "방어") {
      await hitStop(st, outcome === "급소" || outcome === "효과가 굉장함" ? 90 : 60);
      await Promise.all(targets.filter(k => k !== from).map(k => fx.hit(st, k, { share: .3, crit: outcome === "급소", strong: outcome === "효과가 굉장함", weak: outcome === "효과가 별로" })));
    }
    await e.after(450);
    if (follow) e.wide(.34);
  };
  const step = n => { const i = Math.max(0, Math.min(moves.length - 1, moves.indexOf(move) + n)); setMove(moves[i]); play(moves[i]); };
  const playAll = async () => {
    run.current = true; setRunning(true);
    for (let i = Math.max(0, moves.indexOf(move)); i < moves.length && run.current; i++) { setMove(moves[i]); await play(moves[i]); await engine()?.after(500); }
    run.current = false; setRunning(false);
  };
  const frame = n => { const e = engine(); if (!e) return; e.paused = true; setPaused(true); e.stepMs = n * 1000 / 60; };
  const each = fn => () => to.filter(k => slots.includes(k)).forEach(k => fn(ref.current, k));
  const toggle = (list, id) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  return <>
    <div className="bt-arena">
      <div className="bs-stage" ref={ref}>
        <div className="bs-world">
          {["foe", "own"].map(s => <div key={s} className={`bs-side ${s}`}>
            {BENCH_SLOTS[format].filter(([, pos]) => pos.startsWith(s)).map(([k, pos]) => <div key={k} className="bs-slot" data-mon={k} data-pos={pos}>
              <div className="bs-mon" key={mons[k]} data-name={mons[k]}><img src={spriteUrl(res.detail.pokedex[mons[k]]?.name || mons[k])} alt="" draggable="false" decoding="async" onError={onSpriteError()} /></div>
            </div>)}
          </div>)}
        </div>
        <div className="bs-over" aria-hidden="true" />
      </div>
    </div>

    <SectionHead title="재생" />
    <Keys keys={[["이전 기술", () => step(-1), running], [`재생: ${moveName(move)}`, () => play(), running], ["다음 기술", () => step(1), running], [running ? "연속 재생 멈춤" : "여기부터 연속 재생", () => { if (running) run.current = false; else playAll(); }]]} />
    <Keys keys={[[paused ? "계속" : "일시 정지", () => setPaused(p => !p)], ["한 프레임 앞으로", () => frame(1)], ["다섯 프레임 앞으로", () => frame(5)]]} />
    <Question id="bench-rate" label="재생 속도" group><Choice name="bench-rate" options={RATES.map(([l]) => l)} value={rate} onChange={setRate} /></Question>
    <Choice name="bench-follow" options={[FOLLOW]} value={follow ? [FOLLOW] : []} onChange={list => setFollow(list.length > 0)} multiple />

    <SectionHead title={`기술 (${shown.length} / ${moves.length})`} />
    <Field label="기술 찾기" hint="한글 이름이나 영문 이름의 일부"><input id="bench-query" className="in" value={query} onChange={e => setQuery(e.target.value)} placeholder="화염, 10만, surf" /></Field>
    <Question id="bench-move" label={`기술 (${res.text.types[data.type] || data.type || ""}, ${data.category === "Physical" ? "물리" : data.category === "Special" ? "특수" : "변화"}, 연출 각본 ${recipeOf(move) || "없음"}, 대상 ${target})`}>
      <Dropdown id="bench-move" value={shown.includes(move) ? move : ""} placeholder="기술 고르기" options={shown.map(id => ({ value: id, label: `${moveName(id)} (${recipeOf(id) || "기본"})` }))} onChange={id => { setMove(id); play(id); }} ariaLabel="기술" />
    </Question>
    <Question id="bench-from" label="쓰는 쪽" group><Choice name="bench-from" options={slots.map(keyLabel)} value={keyLabel(from)} onChange={l => setFrom(slots.find(k => keyLabel(k) === l))} /></Question>
    <Question id="bench-to" label="받는 쪽 (범위 기술과 자신에게 쓰는 기술은 기술이 정합니다)" group><Choice name="bench-to" options={slots.map(keyLabel)} value={to.filter(k => slots.includes(k)).map(keyLabel)} onChange={list => setTo(slots.filter(k => list.includes(keyLabel(k))))} multiple /></Question>
    <Question id="bench-outcome" label="결과" group><Choice name="bench-outcome" options={OUTCOMES} value={outcome} onChange={setOutcome} /></Question>

    <SectionHead title="포켓몬" />
    <Question id="bench-format" label="형식" group><Choice name="bench-format" options={["더블", "싱글"]} value={format === "doubles" ? "더블" : "싱글"} onChange={l => setFormat(l === "더블" ? "doubles" : "singles")} /></Question>
    {slots.map(k => <Question key={k} id={`bench-mon-${k}`} label={format === "singles" ? (side(k) === "p1" ? "우리" : "상대") : SLOT_NAMES[k]}>
      <Dropdown id={`bench-mon-${k}`} value={mons[k]} options={roster} onChange={id => setMons(m => ({ ...m, [k]: id }))} ariaLabel={SLOT_NAMES[k]} />
    </Question>)}

    <SectionHead title="받는 쪽에게 바로" />
    <Keys keys={[
      ["맞음", each((st, k) => fx.hit(st, k, { share: .3 }))], ["급소", each((st, k) => fx.hit(st, k, { share: .4, crit: true }))],
      ["회복", each(fx.heal)], ["혼란", each(fx.sway)], ["방어", each((st, k) => fx.shield(st, k))],
      ["능력 +2", each((st, k) => fx.boost(st, k, 2))], ["능력 -2", each((st, k) => fx.boost(st, k, -2))],
      ...STATUSES.map(s => [STATUS_NAMES[s], each((st, k) => fx.status(st, k, s))]),
      ["쓰러짐과 다시 등장", each(async (st, k) => { await fx.faint(st, k); await fx.wait(300); await fx.enter(st, k); })],
      ["돌아가고 다시 등장", each(async (st, k) => { await fx.leave(st, k); await fx.enter(st, k); })],
      ["메가진화 빛", each(async (st, k) => { await fx.megaStart(st, k); await fx.megaEnd(st, k); })],
      ["변신", each(fx.morph)],
    ]} />
    <Keys keys={[["승리", () => fx.final(ref.current, { players: NAMES, sides: { p1: { team: { a: { fainted: true } } }, p2: { team: { a: { fainted: true }, b: { fainted: true }, c: { fainted: true } } } }, turn: 12, winner: "p1", perspective: "p1", seated: true })], ["무승부", () => fx.final(ref.current, { players: NAMES, sides: { p1: { team: { a: { fainted: true } } }, p2: { team: { a: { fainted: true }, b: { fainted: true }, c: { fainted: true } } } }, turn: 12, winner: "tie", perspective: "p1" })], ["시작판", () => fx.opening(ref.current, NAMES.p1, NAMES.p2, { seated: true })], ["턴 표시", () => fx.banner(ref.current, "3턴")], ["무대 흔들기", () => fx.shake(ref.current, 2)], ["트릭룸 비틀기", () => fx.twist(ref.current)]]} />

    <SectionHead title="날씨와 필드" />
    <Question id="bench-weather" label="날씨" group><Choice name="bench-weather" options={BENCH_WEATHER.map(([, l]) => l)} value={BENCH_WEATHER.find(([id]) => id === weather)[1]} onChange={l => setWeather(BENCH_WEATHER.find(([, x]) => x === l)[0])} /></Question>
    <Question id="bench-field" label="필드와 룸" group><Toggles options={BENCH_FIELDS} on={fields} onToggle={id => setFields(f => toggle(f, id))} /></Question>
    {["foe", "own"].map(s => <Question key={s} id={`bench-side-${s}`} label={s === "foe" ? "상대 쪽" : "우리 쪽"} group>
      <Toggles options={BENCH_SIDE} on={sides[s]} onToggle={id => setSides(v => ({ ...v, [s]: toggle(v[s], id) }))} />
    </Question>)}
    <Question id="bench-spikes" label="압정뿌리기를 쓴 횟수" group><Choice name="bench-spikes" options={["1", "2", "3"]} value={spikeLayers} onChange={setSpikeLayers} /></Question>
    <Question id="bench-toxic" label="독압정을 쓴 횟수" group><Choice name="bench-toxic" options={["1", "2"]} value={toxicLayers} onChange={setToxicLayers} /></Question>
    <p className="t12 dim">다크와 라이트는 위쪽 막대의 테마 단추로 바꿉니다. 무대가 바로 다시 그려집니다.</p>
  </>;
}
