import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Button from "../components/common/Button.jsx";
import Seg from "../components/common/Seg.jsx";
import Empty from "../components/common/Empty.jsx";
import Loader, { Busy } from "../components/common/Loader.jsx";
import { Choice, Dock, Mon, OptionRows, Question, Row, Toast } from "../components/common/Board.jsx";
import { siteConfirm } from "../components/common/SiteDialog.jsx";
import { DUR, chase, enter, fall, flash, gauge, pause, strike, take } from "../components/common/motion.js";
import { pushHistory } from "../components/layout/history.js";
import { championsData } from "../services/index.js";
import { spriteUrl } from "../services/teamBuilderCore.js";
import { readSavedTeams, showdownTeam } from "../services/battleTeams.js";
import { createBattleReader, toID } from "../services/battleLog.js";
import { BOARD_DRAFT_KEY, battleHref, cancelBattle, chooseInBattle, createBattle, forfeitBattle, isDoubles, joinBattle, listEventBattles, readBattleRow, readBattleVersion, readSeat, takeOfficialSeat, viewBattle } from "../services/battleService.js";
import { collectGraphMatches, evalGraph } from "../services/bracketWinnerPlan.js";
import { shareLink } from "../services/communityStore.js";
import Pager from "../components/common/Pager.jsx";

/* 배틀 (DESIGN.md "Battle"). 친선전은 팀 빌더에 저장한 팀으로 열고, 링크를 받은 사람이 참가한다.
   공식 경기는 대진표의 경기에서 열고, 그 경기의 두 선수가 제출 비밀번호로 앉아 공식 파티로 치른다. 끝나면 서버가 승자를 대진표에 넣는다.
   판정은 모두 쇼다운 엔진이 서버(battle 함수)에서 하고, 이 화면은 고른 것을 보내고 기록을 읽어 보여 줄 뿐이다. */
const REGULATIONS = { "m-c": "M-C", "m-b": "M-B" };
const FORMATS = [["singles", "싱글"], ["doubles", "더블"]];
const NAME_KEY = "ypl-battle:name";
const POLL_MS = 1500;

function useResources() {
  const [res, setRes] = useState(null);
  useEffect(() => {
    Promise.all([import("../data/battle-text-ko.json"), championsData.load()])
      .then(([text, detail]) => setRes({ text: text.default, detail }), error => setRes({ error }));
  }, []);
  return res;
}
const rememberedName = () => { try { return localStorage.getItem(NAME_KEY) || ""; } catch { return ""; } };
const rememberName = name => { try { localStorage.setItem(NAME_KEY, name); } catch { /* 이름은 다음에 다시 쓰면 된다 */ } };

export default function BattlePage({ flash: say, go }) {
  const params = new URLSearchParams(window.location.search);
  const [id, setId] = useState(() => params.get("id"));
  const official = params.get("event") && params.get("match") ? { eventId: params.get("event"), nodeKey: params.get("match") } : null;
  const res = useResources();
  const open = useCallback(next => {
    const url = new URL(window.location.href);
    url.search = next ? `view=battle&id=${encodeURIComponent(next)}` : "view=battle";
    pushHistory({ view: "battle" }, url);
    setId(next);
  }, []);
  if (!res) return <Loader />;
  if (res.error) return <Empty title="배틀을 준비하지 못했습니다." desc="잠시 뒤 다시 시도해 주세요." />;
  if (id) return <BattleRoom id={id} res={res} say={say} go={go} onLeave={() => open(null)} />;
  if (official) return <OfficialSeat {...official} onOpen={open} />;
  return <BattleOpen res={res} onOpen={open} preset={params.get("team")} />;
}

/* 저장한 팀을 고르는 줄: 팀 이름과 여섯의 한국어 이름 */
function TeamRows({ teams, value, onChange, res }) {
  const options = teams.map(team => ({
    value: team.id,
    title: team.name,
    line: `${REGULATIONS[team.regulationId] || team.regulationId}, ${team.members.map(m => res.text.pokedex[m.pokemonId] || m.pokemonName).join(", ")}`,
  }));
  return <OptionRows name="battle-team" options={options} value={value} onChange={onChange} />;
}

function NoTeams() {
  return <Empty title="저장한 팀이 없습니다." desc="팀 빌더에서 팀을 저장하면 여기에서 고를 수 있습니다.">
    <Button variant="second" href="?view=builder">팀 빌더 열기</Button>
  </Empty>;
}

function BattleOpen({ res, onOpen, preset }) {
  const teams = useMemo(() => readSavedTeams().filter(team => REGULATIONS[team.regulationId]), []);
  const [name, setName] = useState(rememberedName);
  const [format, setFormat] = useState("doubles");
  // the team builder's 이 팀으로 배틀 opens here with its team chosen
  const [teamId, setTeamId] = useState((teams.some(t => t.id === preset) ? preset : teams[0]?.id) || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const team = teams.find(t => t.id === teamId);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      rememberName(name.trim());
      const made = await createBattle({ regulation: team.regulationId, battleFormat: format, name: name.trim(), team: showdownTeam(team, res.detail) });
      onOpen(made.id);
    } catch (e) {
      setError(e.problems?.length ? `${e.message} ${e.problems[0]}` : e.message);
      setBusy(false);
    }
  };
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      <p className="read dim bt-intro">팀 빌더에 저장한 팀으로 친선 배틀을 엽니다. 링크를 받은 상대가 참가하면 시작합니다.</p>
      <Question id="bt-name" label="이름">
        <input id="bt-name" className="in" value={name} maxLength={20} autoComplete="nickname" onChange={e => setName(e.target.value)} placeholder="예: 이제빈" />
      </Question>
      <Question id="bt-format" label="형식" group>
        <Choice name="bt-format" options={FORMATS.map(([, label]) => label)} value={FORMATS.find(([key]) => key === format)[1]} onChange={label => setFormat(FORMATS.find(([, l]) => l === label)[0])} />
      </Question>
      <div className="q"><span className="q-label t12 dim">팀</span>{teams.length ? <TeamRows teams={teams} value={teamId} onChange={setTeamId} res={res} /> : <NoTeams />}</div>
      <p className="t12 mute bt-credit">배틀 엔진: Pokémon Showdown (MIT)</p>
      <Dock toast={error ? <Toast error>{error}</Toast> : null}>
        <Button variant="main" onClick={submit} loading={busy} disabled={!team || !name.trim()}>배틀 열기</Button>
      </Dock>
    </div>
  );
}

/* ---------- a battle: its public row is read every 1.5 seconds, and only a change of version reads the rest ---------- */
function BattleRoom({ id, res, say, go, onLeave }) {
  const [row, setRow] = useState(undefined);
  const [view, setView] = useState(null);
  const [seat, setSeat] = useState(() => readSeat(id));
  const version = useRef(null);
  const refresh = useCallback(async () => {
    const next = await readBattleRow(id);
    setRow(next);
    if (next && readSeat(id) && next.status !== "waiting") setView(await viewBattle(id));
  }, [id]);
  useEffect(() => {
    let stopped = false, timer = null;
    const tick = async () => {
      try {
        if (document.visibilityState === "visible") {
          const v = await readBattleVersion(id);
          if (v !== version.current) { version.current = v; await refresh(); }
        }
      } catch { /* 다음 차례에 다시 읽는다 */ }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id, refresh]);

  if (row === undefined) return <Loader />;
  if (row === null) return <Empty title="배틀을 찾을 수 없습니다." desc="링크가 맞는지 확인해 주세요." />;
  const share = async () => { const how = await shareLink({ view: "battle", id }, "YPL 배틀"); if (how === "copied") say?.("링크를 복사했습니다."); };
  if (row.status === "waiting") {
    const cancel = async () => {
      if (!(await siteConfirm({ title: "대기를 취소할까요?", body: "아직 아무도 참가하지 않아 남는 기록이 없습니다.", confirmLabel: "대기 취소" }))) return;
      try { await cancelBattle(id); say?.("대기를 취소했습니다."); onLeave(); }
      catch (e) { say?.(e.message); refresh(); }
    };
    if (seat) return <Waiting row={row} onShare={share} onCancel={cancel} />;
    // an official match is entered from its own seat screen: the player's party PIN, never a builder team
    if (row.kind === "official") return <OfficialSeat eventId={row.event_id} nodeKey={row.source_node_key} onOpen={() => { setSeat(readSeat(id)); refresh(); }} />;
    return <Join row={row} res={res} onJoined={next => { setSeat(readSeat(id)); setView(next); refresh(); }} />;
  }
  return <Arena row={row} view={view} seat={seat} res={res} onView={setView} onShare={share} go={go} />;
}

function Waiting({ row, onShare, onCancel }) {
  const official = row.kind === "official";
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      <div className="pn bt-wait">
        <Busy h={32} />
        <div className="bt-wait-say"><b className="t20">상대를 기다리는 중입니다.</b><span className="t12 dim">{official
          ? "공식 경기입니다. 상대 선수가 대진표의 이 경기에서 들어오면 시작합니다."
          : `${REGULATIONS[row.regulation]} ${isDoubles(row.format_id) ? "더블" : "싱글"}, 링크를 상대에게 보내 주세요.`}</span></div>
      </div>
      <Button variant="link" onClick={onCancel}>대기 취소</Button>
      <Dock><Button variant="main" onClick={onShare}>링크 공유</Button></Dock>
    </div>
  );
}

/* ---------- an official match: the player taps their name and gives their party PIN; their latest official party plays ---------- */
function useMatchPlayers(eventId, nodeKey) {
  const [match, setMatch] = useState(undefined);
  useEffect(() => {
    let alive = true;
    import("../services/index.js").then(s => s.fetchNormalizedBracketRuntime(eventId)).then(facts => {
      const graph = facts?.bracket?.graph;
      const node = graph && collectGraphMatches(graph).find(m => m.id === nodeKey);
      if (!node) { if (alive) setMatch(null); return; }
      const { sp } = evalGraph(graph);
      const nameOf = entryId => facts.bracket.participants?.find(p => p.entryId === entryId)?.name || "";
      if (alive) setMatch({ eventName: facts.event?.name || "", label: node.label || "", a: nameOf(sp(node.a)), b: nameOf(sp(node.b)), decided: Boolean(node.winner) });
    }).catch(() => alive && setMatch(null));
    return () => { alive = false; };
  }, [eventId, nodeKey]);
  return match;
}

function OfficialSeat({ eventId, nodeKey, onOpen }) {
  const match = useMatchPlayers(eventId, nodeKey);
  const [side, setSide] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  // this device may already hold a seat in the match's open battle
  useEffect(() => { listEventBattles(eventId).then(list => setOpen(list.find(b => b.source_node_key === nodeKey && b.status !== "ended") || null)); }, [eventId, nodeKey]);
  useEffect(() => { if (open && readSeat(open.id)) onOpen(open.id); }, [open]);
  if (match === undefined) return <Loader />;
  if (!match) return <Empty title="경기를 찾을 수 없습니다." desc="대진표에서 다시 열어 주세요." />;
  const submit = async () => {
    setBusy(true); setError("");
    try { onOpen((await takeOfficialSeat({ eventId, nodeKey, side, pin })).id); }
    catch (e) { setError(e.problems?.length ? `${e.message} ${e.problems[0]}` : e.message); setBusy(false); }
  };
  const names = [match.a, match.b];
  return (
    <div className="bt-page">
      <h1 className="t32">공식 경기</h1>
      <Row title={`${match.a} 대 ${match.b}`} line={[match.eventName, match.label].filter(Boolean).join(", ")} lamp={open ? "진행 중" : null} />
      {match.decided
        ? <Empty title="이미 승자가 정해진 경기입니다." desc="대진표에서 결과를 확인해 주세요." />
        : <>
          <p className="read dim bt-intro">자기 이름을 고르고 파티를 제출할 때 정한 비밀번호를 입력해 주세요. 제출한 공식 파티로 경기합니다.</p>
          <Question id="bt-side" label="선수" group>
            <Choice name="bt-side" options={names} value={side === "a" ? match.a : side === "b" ? match.b : ""} onChange={label => setSide(label === match.a ? "a" : "b")} />
          </Question>
          <Question id="bt-pin" label="제출 비밀번호">
            <input id="bt-pin" className="in" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="숫자 4자리" />
          </Question>
          <Dock toast={error ? <Toast error>{error}</Toast> : null}>
            <Button variant="main" onClick={submit} loading={busy} disabled={!side || pin.length !== 4}>{open ? "경기 들어가기" : "경기 시작"}</Button>
          </Dock>
        </>}
      {open && <Button variant="link" href={battleHref(open.id)}>관전</Button>}
    </div>
  );
}

function Join({ row, res, onJoined }) {
  const teams = useMemo(() => readSavedTeams().filter(team => team.regulationId === row.regulation), [row.regulation]);
  const [name, setName] = useState(rememberedName);
  const [teamId, setTeamId] = useState(teams[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const team = teams.find(t => t.id === teamId);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      rememberName(name.trim());
      onJoined(await joinBattle(row.id, { name: name.trim(), team: showdownTeam(team, res.detail) }));
    } catch (e) {
      setError(e.problems?.length ? `${e.message} ${e.problems[0]}` : e.message);
      setBusy(false);
    }
  };
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      <Row title={row.p1_name} line={`${REGULATIONS[row.regulation]} ${isDoubles(row.format_id) ? "더블" : "싱글"} 친선 배틀`} lamp="참가 대기" />
      <Question id="bt-name" label="이름">
        <input id="bt-name" className="in" value={name} maxLength={20} autoComplete="nickname" onChange={e => setName(e.target.value)} placeholder="예: 이제빈" />
      </Question>
      <div className="q"><span className="q-label t12 dim">{`팀 (${REGULATIONS[row.regulation]})`}</span>{teams.length ? <TeamRows teams={teams} value={teamId} onChange={setTeamId} res={res} /> : <NoTeams />}</div>
      <Dock toast={error ? <Toast error>{error}</Toast> : null}>
        <Button variant="main" onClick={submit} loading={busy} disabled={!team || !name.trim()}>참가</Button>
      </Dock>
    </div>
  );
}

/* ---------- the field and the log, played one message at a time ---------- */
const slotKey = (side, slot) => `${side}${"ab"[slot]}`;
const identKey = ident => String(ident).slice(0, 3);
function fieldOf(state) {
  const side = id => state.sides[id].active.map(mon => mon && ({ species: mon.species, hp: mon.hp, maxhp: mon.maxhp, status: mon.status, fainted: mon.fainted, boosts: { ...mon.boosts } }));
  return { p1: side("p1"), p2: side("p2"), turn: state.turn, weather: state.weather, fields: [...state.fields], conditions: { p1: [...state.sides.p1.conditions], p2: [...state.sides.p2.conditions] }, ended: state.ended, winner: state.winner };
}
const litCells = mon => (!mon || mon.fainted || !mon.maxhp ? 0 : Math.max(mon.hp > 0 ? 1 : 0, Math.ceil(mon.hp / mon.maxhp * 10)));

function useBattleTape(log, res, perspective) {
  const reader = useRef(null);
  const done = useRef(0);
  const running = useRef(false);
  const fieldRef = useRef(null);
  const [field, setField] = useState(null);
  const [lines, setLines] = useState([]);
  const [kick, setKick] = useState(0);
  const lastMover = useRef(null);
  const reset = () => { reader.current = createBattleReader({ text: res.text, moves: res.detail.moves, perspective }); done.current = 0; };
  if (!reader.current) reset();

  useEffect(() => {
    if (running.current || log == null) return;
    const all = String(log).split("\n");
    if (all.length < done.current) { reset(); setLines([]); }
    const fresh = all.slice(done.current);
    if (!fresh.length) return;
    running.current = true;
    // a page opened mid-battle catches up at once; only what arrives while it is open is played
    const instant = done.current === 0;
    const node = key => fieldRef.current?.querySelector(`[data-mon="${key}"]`);
    const mon = key => node(key)?.querySelector(".mon");
    const plate = key => node(key)?.querySelector(".bt-hit");
    (async () => {
      await null; // out of the effect: flushSync may not run inside React's own work
      let pending = [];
      const flushLines = () => { if (pending.length) { const add = pending; pending = []; flushSync(() => setLines(list => [...list, ...add])); } };
      for (const line of fresh) {
        done.current += 1;
        const before = instant ? null : fieldOf(reader.current.state);
        const { lines: said, event } = reader.current.read(line);
        if (event?.verb === "turn") pending.push({ turn: event.turn });
        pending.push(...said.map(text => ({ text })));
        if (instant) continue;
        flushLines();
        const show = () => flushSync(() => setField(fieldOf(reader.current.state)));
        switch (event?.verb) {
          case "strike": lastMover.current = identKey(event.ident); await strike(mon(identKey(event.ident)), mon(identKey(event.targets[0]))); break;
          case "chase": lastMover.current = identKey(event.ident); await chase(fieldRef.current?.querySelector(".bt-layer"), mon(identKey(event.ident)), event.targets.map(t => mon(identKey(t))).filter(Boolean), `type-${toID(event.type)}`); break;
          case "self": lastMover.current = identKey(event.ident); await flash(plate(identKey(event.ident))); break;
          case "take": case "hp": {
            const key = identKey(event.ident);
            if (event.verb === "take") await take(mon(key), plate(key), mon(lastMover.current));
            const was = before?.[key.slice(0, 2)]?.[key.charCodeAt(2) - 97];
            show();
            const cells = [...(node(key)?.querySelectorAll(".bt-gauge > i") || [])];
            await gauge(cells, litCells(was), litCells(fieldOf(reader.current.state)[key.slice(0, 2)][key.charCodeAt(2) - 97]), Number(getComputedStyle(document.documentElement).getPropertyValue("--off")) || .08);
            break;
          }
          case "fall": await fall(mon(identKey(event.ident))); show(); break;
          case "enter": show(); await enter(mon(identKey(event.ident))); break;
          case "mega": show(); await flash(plate(identKey(event.ident)), DUR.light - DUR.tone); break;
          default: show(); if (said.length) await pause(DUR.tone);
        }
      }
      flushLines();
      flushSync(() => setField(fieldOf(reader.current.state)));
      running.current = false;
      // what arrived while this ran is played next
      if (String(log).split("\n").length > done.current) setKick(k => k + 1);
    })();
  }, [log, kick]);

  return { field, lines, fieldRef, state: reader.current.state, speciesName: reader.current.speciesName };
}

function MonCell({ mon, side, slot, own, speciesName, pick }) {
  const key = slotKey(side, slot);
  // the cell stays as it is when it becomes a target: a press plate lies over it, so the picture is never drawn again
  const Box = "div";
  const props = {};
  const plate = label => pick && <button type="button" className="bt-pick" onClick={pick.onPick} aria-label={`${label} 대상으로 고르기`} />;
  if (!mon) return <Box className="pn stand bt-cell" data-mon={key}><i className="floor" aria-hidden="true" /><i className="bt-hit" aria-hidden="true" />{plate("빈 자리")}</Box>;
  const exact = own && mon.maxhp !== 100;
  const hp = mon.fainted ? 0 : exact ? mon.hp : Math.round(mon.hp / mon.maxhp * 100);
  const name = speciesName(mon.species);
  const lit = litCells(mon);
  const status = mon.status && mon.status !== "fnt" ? STATUS[mon.status] || mon.status : "";
  const boosts = Object.entries(mon.boosts || {}).filter(([, v]) => v);
  return (
    <Box className="pn stand bt-cell" data-mon={key} {...props} role="group"
      aria-label={`${own ? "" : "상대 "}${name}, HP ${hp}${exact ? ` / ${mon.maxhp}` : "%"}${status ? `, ${status}` : ""}`}>
      <span className="bt-top">
        <span className="bt-hp"><Seg value={String(hp)} h={32} cells={3} label="" /><span className="t12 dim">{exact ? `/ ${mon.maxhp}` : "%"}</span>
          <span className="bt-marks">{status && <span className="pn2 bt-chip">{status}</span>}{boosts.map(([stat, v]) => <span key={stat} className="pn2 bt-chip">{`${STAT_SHORT[stat] || stat} ${v > 0 ? "+" : ""}${v}`}</span>)}</span>
        </span>
        <span className="bt-gauge" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < lit ? undefined : "off"} />)}</span>
      </span>
      <i className="floor" aria-hidden="true"><span className={"t12" + (mon.fainted ? " mute" : "")}>{name}</span></i>
      {!mon.fainted && <Mon src={spriteUrl(mon.species)} />}
      <i className="bt-hit" aria-hidden="true" />
      {plate(`${own ? "" : "상대 "}${name}`)}
    </Box>
  );
}
const STATUS = { brn: "화상", par: "마비", slp: "잠듦", frz: "얼음", psn: "독", tox: "맹독" };
const STAT_SHORT = { atk: "공격", def: "방어", spa: "특공", spd: "특방", spe: "스피드", accuracy: "명중", evasion: "회피" };

function Field({ field, fieldRef, perspective, doubles, speciesName, text, targeting }) {
  const foe = perspective === "p1" ? "p2" : "p1";
  const slots = doubles ? [0, 1] : [0];
  const say = [field?.weather && (text.default[field.weather]?.weatherName || field.weather), ...(field?.fields || []).map(f => text.moves[f]?.name || f)].filter(Boolean);
  const sideSay = id => (field?.conditions?.[id] || []).map(c => text.moves[c]?.name || c);
  return (
    <div className="bt-field" ref={fieldRef}>
      {(say.length > 0 || sideSay(foe).length > 0 || sideSay(perspective).length > 0) && <div className="pn bt-strip t12">
        {say.map(s => <b key={s}>{s}</b>)}
        {sideSay(foe).map(s => <span key={"f" + s} className="dim">{`상대 ${s}`}</span>)}
        {sideSay(perspective).map(s => <span key={"o" + s} className="dim">{`우리 편 ${s}`}</span>)}
      </div>}
      {[foe, perspective].map(side => (
        <div key={side} className="bt-side" style={{ "--n": slots.length }}>
          {slots.map(slot => <MonCell key={slot} mon={field?.[side]?.[slot]} side={side} slot={slot} own={side === perspective} speciesName={speciesName}
            pick={targeting ? targeting(side, slot) : null} />)}
        </div>
      ))}
      <div className="bt-layer" aria-hidden="true" />
    </div>
  );
}

function Log({ lines }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [lines.length]);
  return (
    <div className="stack bt-log" ref={ref} aria-live="polite">
      {lines.map((line, i) => line.turn != null
        ? <div key={i} className="pn2 bt-turn t12">{`${line.turn}턴`}</div>
        : <p key={i} className="pn bt-line">{line.text}</p>)}
    </div>
  );
}

/* A finished battle is its replay: the field as it stood at the end of each turn and that turn's messages, stepped by a pager. */
function replayTurns(log, res, perspective) {
  const reader = createBattleReader({ text: res.text, moves: res.detail.moves, perspective });
  const turns = [{ turn: 0, lines: [], field: null }];
  for (const line of String(log || "").split("\n")) {
    const { lines, event } = reader.read(line);
    if (event?.verb === "turn") { turns[turns.length - 1].field = fieldOf(reader.state); turns.push({ turn: event.turn, lines: [{ turn: event.turn }] }); }
    turns[turns.length - 1].lines.push(...lines.map(text => ({ text })));
  }
  turns[turns.length - 1].field = fieldOf(reader.state);
  return turns;
}

function Arena({ row, view, seat, res, onView, onShare, go }) {
  const perspective = seat?.side || "p1";
  const log = seat ? view?.log : row.spectator_log;
  const doubles = isDoubles(row.format_id);
  const tape = useBattleTape(log, res, perspective);
  const turns = useMemo(() => row.status === "ended" && log ? replayTurns(log, res, perspective) : null, [row.status, log, perspective]);
  const [page, setPage] = useState(null);
  const replaying = turns && page != null && page < turns.length - 1;
  const shownTurn = replaying ? turns[page].turn : tape.field?.turn ?? row.turn ?? 0;
  const official = row.kind === "official";
  const bracketLine = !official || row.status !== "ended" ? null
    : row.applied_at ? "대진표에 반영했습니다."
    : row.apply_error ? `대진표에 넣지 못했습니다. 운영진이 확인합니다. (${row.apply_error})`
    : "대진표에 넣는 중입니다.";
  const shareToBoard = () => {
    const url = new URL(window.location.href);
    url.search = `view=battle&id=${encodeURIComponent(row.id)}`;
    try { sessionStorage.setItem(BOARD_DRAFT_KEY, JSON.stringify({ title: `${row.p1_name} 대 ${row.p2_name} 배틀`, body: `리플레이: ${url.href}` })); } catch { /* the board opens empty */ }
    go?.("board");
  };
  const [target, setTarget] = useState(null);
  const [error, setError] = useState("");
  const ended = row.status === "ended";
  const names = { p1: row.p1_name, p2: row.p2_name };
  const send = async choice => {
    setError("");
    try { onView(await chooseInBattle(row.id, choice)); }
    catch (e) { setError(e.message); }
  };
  const giveUp = async () => {
    if (!(await siteConfirm({ title: "기권할까요?", body: "상대의 승리로 기록됩니다.", confirmLabel: "기권", danger: true }))) return;
    try { onView(await forfeitBattle(row.id)); } catch (e) { setError(e.message); }
  };
  const request = !ended && seat ? view?.request : null;
  const waiting = !ended && seat && (!request || request.wait || view?.chosen);
  const foe = perspective === "p1" ? "p2" : "p1";
  // before the leads are sent out the field is empty: the foe's six stand in its place (the team preview)
  const started = Boolean(tape.field && [...tape.field.p1, ...tape.field.p2].some(Boolean));
  return (
    <div className="bt-page">
      <div className="pn bt-head">
        <span className="bt-head-say">
          <span className="status t12">{ended ? "종료" : <><i className="lamp sig" aria-hidden="true" />진행 중</>}</span>
          <b className="t15">{`${names[perspective]} 대 ${names[perspective === "p1" ? "p2" : "p1"]}`}</b>
          {official && <span className="t12 dim">공식 경기</span>}
        </span>
        <span className="counter-board"><Seg value={String(shownTurn)} h={32} cells={2} label={`${shownTurn}턴`} /><span className="t15">턴</span></span>
      </div>
      {ended && <Row className="inv" title={row.winner === "tie" ? "무승부" : `${names[row.winner]} 승리`}
        line={[row.ended_by === "forfeit" ? "기권으로 끝났습니다." : "배틀이 끝났습니다.", bracketLine].filter(Boolean).join(" ")} />}
      <div className="bt-room">
        <div className="bt-main">
          {replaying
            ? <Field field={turns[page].field} fieldRef={{ current: null }} perspective={perspective} doubles={doubles} speciesName={tape.speciesName} text={res.text} />
            : started
            ? <Field field={tape.field} fieldRef={tape.fieldRef} perspective={perspective} doubles={doubles} speciesName={tape.speciesName} text={res.text} targeting={target?.targeting} />
            : <div className="bt-choices"><span className="t12 dim">{`${names[foe]}의 파티`}</span>
                <Party pokemon={tape.state.sides[foe].preview.map(species => ({ ident: species, details: species, condition: "100/100" }))} name={details => tape.speciesName(details)} pick={() => null} still /></div>}
          {request && !waiting && <Choices key={request.rqid ?? row.turn} request={request} doubles={doubles} res={res} onSend={send} setTarget={setTarget} toast={error ? <Toast error>{error}</Toast> : null} />}
        </div>
        <Log lines={replaying ? turns[page].lines : tape.lines} />
      </div>
      {/* in its own box, so a turned page lights the room just before it (Pager lights its parent's previous sibling) */}
      {turns && turns.length > 1 && <div><Pager unit="턴" page={(page ?? turns.length - 1) + 1} pages={turns.length} onGo={next => setPage(Math.max(0, Math.min(turns.length - 1, next - 1)))} /></div>}
      <div className="bt-links">
        {!seat && <Button variant="link" onClick={onShare}>링크 공유</Button>}
        {seat && !ended && <Button variant="link" onClick={giveUp}>기권</Button>}
        {official && <Button variant="link" onClick={() => go?.("bracket", { eventId: row.event_id })}>대진표</Button>}
        {ended && <Button variant="link" onClick={shareToBoard}>게시판에 공유</Button>}
        <span className="t12 mute">배틀 엔진: Pokémon Showdown (MIT)</span>
      </div>
      {(waiting || (error && !request)) && <Dock toast={error ? <Toast error>{error}</Toast> : null}>
        {waiting && <div className="pn bt-waiting"><Busy h={32} /><span className="t15">{request?.teamPreview && view?.chosen ? "상대의 선출을 기다리는 중…" : "상대의 선택을 기다리는 중…"}</span></div>}
      </Dock>}
    </div>
  );
}

/* ---------- choices: built from the request alone, as the engine asks (Controls) ---------- */
const NEEDS_TARGET = { normal: "any", any: "any", adjacentFoe: "foe", adjacentAlly: "ally", adjacentAllyOrSelf: "allyOrSelf" };

function Choices({ request, doubles, res, onSend, setTarget, toast }) {
  const side = request.side;
  const [picks, setPicks] = useState([]);
  const [mode, setMode] = useState("move");
  const [mega, setMega] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiming, setAiming] = useState("");
  // a new request mounts a new Choices (keyed by its rqid), so nothing chosen for the last one carries over
  useEffect(() => () => setTarget(null), []);
  const species = details => String(details).split(", ")[0];
  const name = details => res.text.pokedex[toID(species(details))] || species(details);
  const send = async choice => { setSending(true); await onSend(choice); setSending(false); };

  // team preview: pick the ones to bring, in order; the first ones lead
  if (request.teamPreview) {
    const count = request.maxChosenTeamSize || side.pokemon.length;
    const toggle = i => setPicks(list => list.includes(i) ? list.filter(x => x !== i) : list.length < count ? [...list, i] : list);
    return <div className="bt-choices">
      <span className="t12 dim">{`선출 ${picks.length} / ${count}, 고른 순서대로 나갑니다.`}</span>
      <Party pokemon={side.pokemon} name={name} pick={i => ({ chosen: picks.includes(i), order: picks.indexOf(i) + 1, onPick: () => toggle(i) })} />
      <Dock toast={toast}><Button variant="main" icon="check" loading={sending} disabled={picks.length !== count} onClick={() => send(`team ${picks.map(i => i + 1).join(", ")}`)}>선출 확정</Button></Dock>
    </div>;
  }

  const slots = side.pokemon.slice(0, request.active?.length || request.forceSwitch?.length || 1);
  const forced = request.forceSwitch;
  // a slot that has nothing to choose passes: a fainted one, or one not asked to switch
  const passes = i => forced ? !forced[i] : !slots[i] || slots[i].condition.endsWith(" fnt") || request.active[i]?.commanding;
  const at = (() => { let i = picks.length; while (i < slots.length && passes(i)) i += 1; return i; })();
  const complete = at >= slots.length;
  const choice = slots.map((_, i) => picks[i] || "pass").join(", ");
  const add = text => setPicks(list => { const next = [...list]; while (next.length < at) next.push("pass"); next[at] = text; return next; });
  const reset = () => { setPicks([]); setMode("move"); setMega(false); setTarget(null); };
  const switchedIn = new Set(picks.filter(p => p.startsWith("switch")).map(p => Number(p.split(" ")[1]) - 1));

  if (complete) return <div className="bt-choices">
    <Button variant="link" onClick={reset}>다시 고르기</Button>
    <Dock toast={toast}><Button variant="main" icon="check" loading={sending} onClick={() => send(choice)}>선택 확정</Button></Dock>
  </div>;

  const active = request.active?.[at];
  const who = name(slots[at].details);
  const canSwitch = forced || !active?.trapped;
  if (mode === "switch" || forced) {
    return <div className="bt-choices">
      <span className="t12 dim">{`${who} 대신 나갈 포켓몬`}</span>
      <Party pokemon={side.pokemon} name={name} pick={i => {
        const mon = side.pokemon[i];
        const free = !mon.active && !mon.condition.endsWith(" fnt") && !switchedIn.has(i);
        return free ? { chosen: false, onPick: () => { add(`switch ${i + 1}`); setMode("move"); } } : null;
      }} />
      {!forced && <Button variant="link" onClick={() => setMode("move")}>기술로 돌아가기</Button>}
    </div>;
  }

  const choose = (move, index) => {
    const want = doubles ? NEEDS_TARGET[move.target] : null;
    const tail = mega ? " mega" : "";
    if (!want) { add(`move ${index + 1}${tail}`); setMega(false); return; }
    setTarget({
      targeting: (fieldSide, slot) => {
        const own = fieldSide === side.id;
        const ok = want === "any" ? !(own && slot === at) : want === "foe" ? !own : want === "ally" ? own && slot !== at : own;
        if (!ok) return null;
        const loc = own ? -(slot + 1) : slot + 1;
        return { chosen: false, onPick: () => { add(`move ${index + 1} ${loc}${tail}`); setMega(false); setTarget(null); setAiming(""); } };
      },
    });
    setAiming(res.text.moves[move.id]?.name || move.move);
  };
  if (aiming) return <div className="bt-choices">
    <span className="t15">{`${who}의 ${aiming}, 대상을 필드에서 골라 주세요.`}</span>
    <Button variant="link" onClick={() => { setTarget(null); setAiming(""); }}>기술로 돌아가기</Button>
  </div>;
  return <div className="bt-choices">
    <span className="t12 dim">{`${who}의 기술`}</span>
    <div className="stack bt-moves">
      {active.moves.map((move, i) => {
        const data = res.detail.moves[move.id] || {};
        return <button key={move.id} type="button" className="pn bt-move" disabled={move.disabled} onClick={() => choose(move, i)}
          aria-label={`${res.text.moves[move.id]?.name || move.move}, ${res.text.types[data.type] || data.type || ""}, PP ${move.pp} / ${move.maxpp}`}>
          <b className="t15">{res.text.moves[move.id]?.name || move.move}</b>
          <span className="bt-move-line">{data.type && <span className={`tb-type type-${toID(data.type)}`}>{res.text.types[data.type] || data.type}</span>}<span className="t12 dim">{`PP ${move.pp} / ${move.maxpp}`}</span></span>
        </button>;
      })}
    </div>
    <div className="bt-tools">
      {canSwitch && <Button variant="second" size="sm" onClick={() => setMode("switch")}>교체</Button>}
      {active.canMegaEvo && <Choice name="bt-mega" options={["메가진화"]} value={mega ? ["메가진화"] : []} onChange={list => setMega(list.length > 0)} multiple />}
    </div>
  </div>;
}

function Party({ pokemon, name, pick, still = false }) {
  return <div className="stack bt-party">
    {pokemon.map((mon, i) => {
      const p = pick(i);
      const fainted = mon.condition.endsWith(" fnt");
      const Box = p ? "button" : "div";
      return <Box key={mon.ident + i} className={"pn stand bt-party-cell" + (p || still ? "" : " off")} {...(p ? { type: "button", onClick: p.onPick, "aria-pressed": p.chosen } : {})}
        aria-label={`${name(mon.details)}${fainted ? ", 쓰러짐" : ""}${p?.order ? `, ${p.order}번째` : ""}`}>
        <i className={"floor" + (p?.chosen ? " inv" : "")}><span className={"t12" + (fainted ? " mute" : "")}>{p?.order ? `${p.order} ${name(mon.details)}` : name(mon.details)}</span></i>
        <Mon src={spriteUrl(String(mon.details).split(", ")[0])} />
      </Box>;
    })}
  </div>;
}
