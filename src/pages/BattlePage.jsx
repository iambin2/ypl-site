import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { reduced } from "../components/common/motion.js";
import Button from "../components/common/Button.jsx";
import Seg from "../components/common/Seg.jsx";
import Empty from "../components/common/Empty.jsx";
import Loader, { Busy } from "../components/common/Loader.jsx";
import { Chips, Choice, Dock, Mon, OptionRows, Question, Row, Toast } from "../components/common/Board.jsx";
import { siteConfirm } from "../components/common/SiteDialog.jsx";
import { pushHistory } from "../components/layout/history.js";
import { championsData } from "../services/index.js";
import { spriteUrl } from "../services/teamBuilderCore.js";
import { readSavedTeams, showdownTeam } from "../services/battleTeams.js";
import { josa, parseHP, toID } from "../services/battleLog.js";
import { STATUS, Stage, effLabel, effectiveness, nameOf, other, typesOf, useStageTape } from "./battle/Stage.jsx";
import { setSpeed as setStageSpeed } from "./battle/stageFx.js";
import { BOARD_DRAFT_KEY, battleHref, cancelBattle, chooseInBattle, createBattle, forfeitBattle, isDoubles, joinBattle, listEventBattles, readBattleRow, readBattleVersion, readSeat, takeOfficialSeat, viewBattle } from "../services/battleService.js";
import { collectGraphMatches, evalGraph } from "../services/bracketWinnerPlan.js";
import { shareLink } from "../services/communityStore.js";
import { logUpTo, nextStop, replayStops, secondsLeft, turnStop } from "../services/battleReplay.js";
import { claimTimeout, readDeadline, rememberBattle } from "../services/battleWatch.js";
import { BattleLists, ReplayBar, downloadReplay } from "./battle/Replay.jsx";

/* 배틀 (DESIGN.md "Battle"). 친선전은 팀 빌더에 저장한 팀으로 열고, 링크를 받은 사람이 참가한다.
   공식 경기는 대진표의 경기에서 열고, 그 경기의 두 선수가 제출 비밀번호로 앉아 공식 파티로 치른다. 끝나면 서버가 승자를 대진표에 넣는다.
   판정은 모두 쇼다운 엔진이 서버(battle 함수)에서 하고, 이 화면은 고른 것을 보내고 기록을 읽어 보여 줄 뿐이다. */
const REGULATIONS = { "m-c": "M-C", "m-b": "M-B" };
const FORMATS = [["singles", "싱글"], ["doubles", "더블"]];
const NAME_KEY = "ypl-battle:name";
const POLL_MS = 1500;

export function useResources() {
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
  // a replay's link may open it at a turn and from a side (?turn=5&side=p2)
  if (id) return <BattleRoom id={id} res={res} say={say} go={go} onLeave={() => open(null)} start={{ turn: params.get("turn"), side: params.get("side") }} />;
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
      <BattleLists onOpen={onOpen} />
      <p className="t12 mute bt-credit">배틀 엔진: Pokémon Showdown (MIT)</p>
      <Dock toast={error ? <Toast error>{error}</Toast> : null}>
        <Button variant="main" onClick={submit} loading={busy} disabled={!team || !name.trim()}>배틀 열기</Button>
      </Dock>
    </div>
  );
}

/* ---------- a battle: its public row is read every 1.5 seconds, and only a change of version reads the rest ---------- */
function BattleRoom({ id, res, say, go, onLeave, start }) {
  const [row, setRow] = useState(undefined);
  const [view, setView] = useState(null);
  const [seat, setSeat] = useState(() => readSeat(id));
  const version = useRef(null);
  // this device finds the battle again on the battle page (이 기기의 배틀), played or watched
  useEffect(() => { rememberBattle(id); }, [id]);
  const refresh = useCallback(async () => {
    const next = await readBattleRow(id);
    // the clock of the decision it waits on (docs/db/battle_timer.sql); none before that SQL runs
    if (next?.status === "active") next.deadline_at = await readDeadline(id);
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
  return <Arena row={row} view={view} seat={seat} res={res} onView={setView} onShare={share} go={go} say={say} start={start} />;
}

export function Waiting({ row, onShare, onCancel }) {
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

/* ---------- the arena: the stage, its playback, the choices and the log (DESIGN.md "Battle", The stage) ---------- */
const SPEED_KEY = "ypl-battle:speed";
const SPEEDS = [[1, "보통"], [.5, "빠르게"], [0, "건너뛰기"]];
function readSpeed() {
  try { const v = localStorage.getItem(SPEED_KEY); return SPEEDS.some(([s]) => String(s) === v) ? Number(v) : 1; } catch { return 1; }
}

// the whole log; it changes only when a line is added, so the stage's every step does not draw it again
const Log = React.memo(function Log({ lines }) {
  const ref = useRef(null);
  // keep the newest line in view, once a frame at most and only while the log is open (a closed one costs no layout)
  useEffect(() => {
    const el = ref.current;
    if (!el?.closest("details")?.open) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [lines.length]);
  return (
    <div className="stack bt-log" ref={ref} aria-live="off">
      {lines.map((line, i) => line.turn != null
        ? <div key={i} className="pn2 bt-turn t12">{`${line.turn}턴`}</div>
        : <p key={i} className="pn bt-line">{line.text}</p>)}
    </div>
  );
});

/* api: where choices go. The server by default; the battle lab (BattleLabPage.jsx, dev only) passes its own engine. */
const SERVER = { choose: chooseInBattle, forfeit: forfeitBattle, timeout: claimTimeout };
// a clock that moves once a second while it is on
function useNow(on) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!on) return undefined; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [on]);
  return now;
}
const TURN_BEAT = 680; // a replay's turn stands this long before the next one plays, as a message stands
export function Arena({ row, view, seat, res, onView, onShare, go, say, start, api = SERVER }) {
  const ended = row.status === "ended";
  // a player sees from their own seat; anyone else may watch from either side (시점), as a link may ask (?side=p2)
  const [pov, setPov] = useState(() => (start?.side === "p2" ? "p2" : "p1"));
  const perspective = seat?.side || pov;
  const log = seat ? view?.log : row.spectator_log;
  const doubles = isDoubles(row.format_id);
  const [speed, setSpeedChoice] = useState(readSpeed);
  useEffect(() => { setStageSpeed(speed); try { localStorage.setItem(SPEED_KEY, String(speed)); } catch { /* the next visit plays at 보통 */ } }, [speed]);
  /* The replay (DESIGN.md "Battle", Replay): cue is how many lines of the finished log the stage shows, null all of them.
     A jump starts the stage again and catches up at once (epoch); a step on, or play, adds the next turn, which the stage plays. */
  const replay = useMemo(() => (ended && log ? replayStops(log) : null), [ended, log]);
  const [cue, setCue] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const tape = useStageTape(logUpTo(log, cue), res, perspective, epoch);
  const at = cue ?? replay?.total ?? 0;
  const jump = to => { setAutoplay(false); setCue(replay && to < replay.total ? to : null); setEpoch(e => e + 1); };
  const stepOn = () => { const to = replay && nextStop(replay.stops, at); if (to != null) setCue(to < replay.total ? to : null); };
  const play = () => {
    if (autoplay) { setAutoplay(false); return; }
    if (at >= replay.total) { setCue(replay.stops[0].at); setEpoch(e => e + 1); }
    setAutoplay(true);
  };
  // playing: the next turn goes on once the stage has played this one and it has stood a beat
  useEffect(() => {
    if (!autoplay || !replay || tape.playing || tape.read < Math.min(at, replay.total)) return undefined;
    if (at >= replay.total) { setAutoplay(false); return undefined; }
    const t = setTimeout(stepOn, TURN_BEAT);
    return () => clearTimeout(t);
  });
  // a link's turn (?turn=5) opens the replay there, once, when the log is read
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || log == null) return;
    opened.current = true;
    if (replay && start?.turn != null) jump(turnStop(replay.stops, start.turn));
  }, [log]);
  const turnTo = side => { setPov(side); setEpoch(e => e + 1); };
  const scene = tape.scene;
  const shownTurn = tape.scene?.turn ?? row.turn ?? 0;
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
  const [ask, setAsk] = useState("");
  const [chosenSay, setChosenSay] = useState("");
  const [error, setError] = useState("");
  // the result waits for the stage: a battle that ended while its last turn still plays does not tell its end before the stage does;
  // a replay already knows it, so stepping through one never moves the page
  const shownEnded = ended && (cue != null || (tape.scene?.ended ?? true));
  const names = { p1: row.p1_name, p2: row.p2_name };
  // a choice goes the moment it is made, as Champions sends it; false when it did not go, so the choices stay open
  // once a choice goes, the stage comes into view (on a phone the moves sit under it), so the turn is watched, not scrolled to
  const watch = () => {
    const arena = document.querySelector(".bt-arena");
    if (!arena) return;
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-height")) || 0;
    const top = arena.getBoundingClientRect().top - bar;
    if (top < 0) window.scrollBy({ top, behavior: reduced() ? "auto" : "smooth" });
  };
  const send = async (choice, said = "") => {
    setError("");
    watch();
    try { setChosenSay(said); onView(await api.choose(row.id, choice)); return true; }
    catch (e) { setChosenSay(""); setError(e.message); return false; }
  };
  const giveUp = async () => {
    if (!(await siteConfirm({ title: "기권할까요?", body: "상대의 승리로 기록됩니다.", confirmLabel: "기권", danger: true }))) return;
    try { onView(await api.forfeit(row.id)); } catch (e) { setError(e.message); }
  };
  const request = !ended && seat ? view?.request : null;
  const waiting = !ended && seat && (!request || request.wait || view?.chosen);
  const choosing = Boolean(request && !waiting && !tape.playing);
  /* the clock (DESIGN.md "Battle", The clock; docs/db/battle_timer.sql): the seconds left for the decision the battle waits on.
     When they run out, the waiting player's screen asks the server, which checks by its own clock and ends the battle on time.
     The board never chooses for anyone. With no deadline (that SQL not run yet) there is no clock. */
  const deadline = !ended ? row.deadline_at : null;
  const now = useNow(Boolean(deadline));
  const left = secondsLeft(deadline, now);
  const claimed = useRef(0);
  useEffect(() => {
    if (left !== 0 || !waiting || !api.timeout || Date.now() - claimed.current < 5000) return;
    claimed.current = Date.now();
    api.timeout(row.id).then(next => next && onView(next), () => { /* not yet by the server's clock: asked again in a moment */ });
  }, [left, waiting, now]);
  // a link to where the replay stands, and from the side being watched
  const shareHere = async () => {
    const extra = { ...(cue != null ? { turn: String(shownTurn) } : {}), ...(!seat && pov !== "p1" ? { side: pov } : {}) };
    if (!Object.keys(extra).length) return onShare?.();
    const how = await shareLink({ view: "battle", id: row.id, ...extra }, "YPL 배틀");
    if (how === "copied") say?.("링크를 복사했습니다.");
  };
  // the message box: the game's question while we choose, what we chose while the other player chooses
  const boxAsk = choosing ? ask : waiting && !tape.playing && chosenSay ? chosenSay : "";
  // the choices keep their place while the turn plays: the room they took stays, so nothing under them moves up and the page never jumps
  const consoleRef = useRef(null);
  useLayoutEffect(() => {
    const el = consoleRef.current;
    if (!el) return;
    if (choosing) { el.style.minHeight = ""; el.dataset.h = String(el.offsetHeight); }
    else el.style.minHeight = !ended && el.dataset.h ? `${el.dataset.h}px` : "";
  });
  // our brought Pokémon, known before they come out (the strip shows the rest as shadows)
  const known = useRef([]);
  if (request?.side?.pokemon) known.current = request.side.pokemon.map(p => String(p.details).split(", ")[0]);
  const foe = other(perspective);
  // before the leads are sent out the stage is empty: both parties stand in its place (the team preview)
  const started = Boolean(scene && [...scene.p1.active, ...scene.p2.active].some(Boolean));
  const nameAt = (side, slot) => { const m = scene?.[side]?.active?.[slot]; return m ? `${side === perspective ? "" : "상대 "}${nameOf(res, m.species)}` : "빈 자리"; };
  const typesAt = (side, slot) => { const m = scene?.[side]?.active?.[slot]; return m && !m.fainted ? typesOf(res, m.species) : null; };
  const foes = (scene?.[foe]?.active || []).map((m, slot) => (m && !m.fainted ? { slot, name: nameOf(res, m.species), types: typesOf(res, m.species) } : null));
  const desktop = typeof window !== "undefined" && window.matchMedia?.("(min-width: 860px)").matches;
  return (
    <div className="bt-page">
      <div className="pn bt-head">
        <span className="bt-head-say">
          <span className="status t12">{ended ? "종료" : <><i className="lamp sig" aria-hidden="true" />진행 중</>}</span>
          <b className="t15">{`${names[perspective]} 대 ${names[foe]}`}</b>
          {official && <span className="t12 dim">공식 경기</span>}
        </span>
        <span className="bt-head-boards">
          {left != null && <span className="counter-board"><Seg value={String(left)} h={32} cells={Math.max(2, String(left).length)} label={`남은 시간 ${left}초`} /><span className="t15">초</span></span>}
          <span className="counter-board"><Seg value={String(shownTurn)} h={32} cells={2} label={`${shownTurn}턴`} /><span className="t15">턴</span></span>
        </span>
      </div>
      {shownEnded && <Row className="inv" title={row.winner === "tie" ? "무승부" : `${names[row.winner]} 승리`}
        line={[row.ended_by === "forfeit" ? "기권으로 끝났습니다." : row.ended_by === "timeout" ? "시간이 다 되어 끝났습니다." : "배틀이 끝났습니다.", bracketLine].filter(Boolean).join(" ")} />}
      <div className="bt-room">
        <div className="bt-main">
          {started
            ? <Stage scene={scene} stageRef={tape.stageRef} perspective={perspective} doubles={doubles} res={res} names={names}
                targeting={target?.targeting} said={tape.said} ask={boxAsk} known={known.current} />
            : <TeamPreview tape={tape} res={res} sides={seat ? [foe] : [foe, perspective]} names={names} />}
          {/* the game asks only once the stage has played what came before: a choice never appears over a turn still on stage */}
          {/* only a player still playing has choices; anyone else gets no empty box, so the replay stands under the stage */}
          {seat && !ended && <div ref={consoleRef}>
            {choosing && <Choices key={JSON.stringify(request)} request={request} doubles={doubles} res={res} foes={foes} typesAt={typesAt} nameAt={nameAt}
              onSend={send} setTarget={setTarget} setAsk={setAsk} toast={error ? <Toast error>{error}</Toast> : null} />}
          </div>}
          {shownEnded && replay && replay.stops.length > 1 && <ReplayBar stops={replay.stops} at={at} playing={autoplay} onJump={jump} onStep={stepOn} onPlay={play} />}
          <Chips label="연출 속도" value={String(speed)} onChange={v => setSpeedChoice(Number(v))} options={SPEEDS.map(([v, label]) => [String(v), `연출 ${label}`])} />
          {!seat && <Chips label="시점" value={pov} onChange={turnTo} options={[["p1", `${names.p1} 시점`], ["p2", `${names.p2} 시점`]]} />}
        </div>
        <details className="bt-logbox" open={desktop || undefined}>
          <summary className="t12 dim">전체 기록</summary>
          <Log lines={tape.lines} />
        </details>
      </div>
      <div className="bt-links">
        {(!seat || ended) && <Button variant="link" onClick={shareHere}>링크 공유</Button>}
        {seat && !ended && <Button variant="link" onClick={giveUp}>기권</Button>}
        {official && <Button variant="link" onClick={() => go?.("bracket", { eventId: row.event_id })}>대진표</Button>}
        {ended && <Button variant="link" onClick={shareToBoard}>게시판에 공유</Button>}
        {ended && log && <Button variant="link" onClick={() => downloadReplay({ row, log, res, perspective, names })}>기록 내려받기</Button>}
        <span className="t12 mute">배틀 엔진: Pokémon Showdown (MIT)</span>
      </div>
      {(waiting || (error && !request)) && <Dock toast={error ? <Toast error>{error}</Toast> : null}>
        {waiting && <div className="pn bt-waiting"><Busy h={32} /><span className="t15">{request?.teamPreview && view?.chosen ? "상대의 선출을 기다리는 중…" : "상대의 선택을 기다리는 중…"}</span></div>}
      </Dock>}
    </div>
  );
}

/* before the battle: the foe's six with their types, as the team preview shows them; one who watches sees both sides */
function TeamPreview({ tape, res, sides, names }) {
  return sides.map(side => <div key={side} className="bt-choices">
    <span className="t12 dim">{`${names[side]}의 파티`}</span>
    <Party preview pokemon={tape.state.sides[side].preview.map(species => ({ ident: species, details: species, condition: "100/100" }))} res={res} />
  </div>);
}

/* ---------- choices: built from the request alone, as the engine asks ---------- */
const NEEDS_TARGET = { normal: "any", any: "any", adjacentFoe: "foe", adjacentAlly: "ally", adjacentAllyOrSelf: "allyOrSelf" };
const CATEGORY = { Physical: "물리", Special: "특수", Status: "변화" };
const EFF_WORD = { 4: "효과 매우 굉장 ×4", 2: "효과 굉장 ×2", .5: "효과 별로 ×½", .25: "효과 매우 별로 ×¼", 0: "효과 없음" };
const effClass = m => "bt-eff" + (m >= 2 ? " hard" : m === 0 ? " none" : "");
const MEGA = "메가진화";

function Choices({ request, doubles, res, foes, typesAt, nameAt, onSend, setTarget, setAsk, toast }) {
  const side = request.side;
  const [picks, setPicks] = useState([]);
  const [mega, setMega] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiming, setAiming] = useState(null);
  // a new request mounts a new Choices (keyed by the request itself: the engine sets no rqid, and a switch after a faint keeps the turn), so nothing chosen for the last one carries over
  useEffect(() => () => { setTarget(null); setAsk(""); }, []);
  const species = details => String(details).split(", ")[0];
  const name = details => nameOf(res, species(details));
  const moveName = id => res.text.moves[id]?.name || res.detail.moves[id]?.name || id;
  const send = async (choice, said) => { setSending(true); const went = await onSend(choice, said); setSending(false); if (!went) setPicks([]); };
  const slots = side.pokemon.slice(0, request.active?.length || request.forceSwitch?.length || 1);
  const forced = request.forceSwitch;
  // a slot that has nothing to choose passes: a fainted one, or one not asked to switch
  const passes = i => forced ? !forced[i] : !slots[i] || slots[i].condition.endsWith(" fnt") || request.active?.[i]?.commanding;
  const at = (() => { let i = picks.length; while (i < slots.length && passes(i)) i += 1; return i; })();
  const complete = at >= slots.length;
  // the question stands in the message box, as the game puts it there
  const aimed = aiming != null && request.active?.[at]?.moves?.[aiming];
  const question = request.teamPreview || complete || forced ? ""
    : aimed ? `${name(slots[at].details)}의 ${moveName(aimed.id)}, 대상을 무대에서 골라 주세요.`
    : `${josa(name(slots[at].details), "topic")} 무엇을 할까?`;
  useEffect(() => { setAsk(question); }, [question]);

  // team preview: pick the ones to bring, in order; the first ones lead
  if (request.teamPreview) {
    const count = request.maxChosenTeamSize || side.pokemon.length;
    const toggle = i => setPicks(list => list.includes(i) ? list.filter(x => x !== i) : list.length < count ? [...list, i] : list);
    return <div className="bt-choices">
      <span className="t12 dim">{`선출 ${picks.length} / ${count}, 고른 순서대로 나갑니다. 앞의 ${doubles ? "둘" : "하나"}이 선봉입니다.`}</span>
      <Party pokemon={side.pokemon} res={res} pick={i => ({ chosen: picks.includes(i), order: picks.indexOf(i) + 1, onPick: () => toggle(i) })} />
      <Dock toast={toast}><Button variant="main" icon="check" loading={sending} disabled={picks.length !== count} onClick={() => send(`team ${picks.map(i => i + 1).join(", ")}`)}>선출 확정</Button></Dock>
    </div>;
  }

  const add = (text, said) => {
    const next = [...picks];
    while (next.length < at) next.push("pass");
    next[at] = text;
    next.said = [...(picks.said || []), said];
    setPicks(next);
    setAiming(null); setTarget(null); setMega(false);
    // the last Pokémon's choice sends the turn at once; the ones before it wait for it
    let i = next.length; while (i < slots.length && passes(i)) i += 1;
    if (i >= slots.length) send(slots.map((_, k) => next[k] || "pass").join(", "), next.said.filter(Boolean).join(", "));
  };
  const reset = () => { setPicks([]); setMega(false); setAiming(null); setTarget(null); };
  const switchedIn = new Set(picks.filter(p => p?.startsWith?.("switch")).map(p => Number(p.split(" ")[1]) - 1));

  // sent (or on its way): what was chosen, and, if it did not go, the way back
  if (complete) return <div className="bt-choices">
    <span className="t15">{(picks.said || []).filter(Boolean).join(", ") || "선택을 마쳤습니다."}</span>
    {!sending && <div className="bt-tools"><Button variant="link" onClick={reset}>다시 고르기</Button></div>}
    {toast && <Dock toast={toast} />}
  </div>;

  const active = request.active?.[at];
  const who = name(slots[at].details);
  const trapped = !forced && active?.trapped;
  // the bench: every brought Pokémon not out, one tap to send it in (Showdown keeps them under the moves)
  const bench = <Bench pokemon={side.pokemon} res={res} label={forced ? `${who} 대신 나갈 포켓몬` : trapped ? "교체할 수 없는 상태" : "교체"}
    pick={i => {
      const mon = side.pokemon[i];
      const free = !trapped && !mon.active && !mon.condition.endsWith(" fnt") && !switchedIn.has(i);
      return free ? () => add(`switch ${i + 1}`, `${who} 대신 ${name(mon.details)}`) : null;
    }} />;
  if (forced) return <div className="bt-choices">{bench}{toast && <Dock toast={toast} />}</div>;

  const choose = (move, index) => {
    const data = res.detail.moves[move.id] || {};
    const want = doubles ? NEEDS_TARGET[move.target] : null;
    const tail = mega ? " mega" : "";
    const label = `${who}${mega ? "(메가진화)" : ""}의 ${moveName(move.id)}`;
    if (aiming === index) { setAiming(null); setTarget(null); return; }
    if (!want) { add(`move ${index + 1}${tail}`, label); return; }
    // a move that needs a target: the move lights and the stage rings who it can reach; tapping it again lets it go
    setTarget({
      targeting: (fieldSide, slot) => {
        const own = fieldSide === side.id;
        const ok = want === "any" ? !(own && slot === at) : want === "foe" ? !own : want === "ally" ? own && slot !== at : own;
        if (!ok) return null;
        const loc = own ? -(slot + 1) : slot + 1;
        const types = typesAt(fieldSide, slot);
        const mark = types && data.category !== "Status" && data.type ? effectiveness(data.type, types) : null;
        return { mark, onPick: () => add(`move ${index + 1} ${loc}${tail}`, `${label}, ${nameAt(fieldSide, slot)}에게`) };
      },
    });
    setAiming(index);
  };
  return <div className="bt-choices">
    <div className="stack bt-moves">
      {active.moves.map((move, i) => {
        const data = res.detail.moves[move.id] || {};
        const type = data.type || "Normal";
        // every foe now out, in the order they stand; shown only when one of them is not ×1
        const marks = data.category && data.category !== "Status" ? foes.filter(Boolean).map(f => ({ f, m: effectiveness(type, f.types) })) : [];
        const shown = marks.some(x => x.m !== 1) ? marks : [];
        // three lines, every move alike: the name and how it lands; its type, category and power; its accuracy and priority, and its PP
        const kind = CATEGORY[data.category] + (data.basePower > 0 ? ` ${data.basePower}` : "");
        const foot = [data.category !== "Status" && data.accuracy !== true && data.accuracy < 100 && `명중 ${data.accuracy}`,
          data.priority ? `우선도 ${data.priority > 0 ? "+" : ""}${data.priority}` : null].filter(Boolean).join(", ");
        return <button key={move.id} type="button" className={(aiming === i ? "inv" : "pn") + " bt-move"} disabled={move.disabled || sending} onClick={() => choose(move, i)} aria-pressed={aiming === i}
          aria-label={`${moveName(move.id)}, ${res.text.types[type] || type}, ${CATEGORY[data.category] || ""}${data.basePower > 0 ? ` 위력 ${data.basePower}` : ""}, ${data.accuracy === true ? "필중" : `명중 ${data.accuracy}`}, PP ${move.pp} / ${move.maxpp}${shown.map(x => `, ${doubles ? x.f.name + " " : ""}${EFF_WORD[x.m] || effLabel(x.m)}`).join("")}`}>
          <span className="bt-move-top">
            <b className="t15 bt-move-name">{moveName(move.id)}</b>
            {shown.length > 0 && <span className="bt-effs" aria-hidden="true">{shown.map(x => <span key={x.f.slot} className={effClass(x.m)}>{effLabel(x.m)}</span>)}</span>}
          </span>
          <span className="bt-move-line">
            <span className={`tb-type type-${toID(type)}`}>{res.text.types[type] || type}</span>
            <span className="t12 dim">{kind}</span>
          </span>
          <span className="bt-move-foot t12 dim">
            <span>{foot}</span>
            <span className="bt-move-pp">{`PP ${move.pp}/${move.maxpp}`}</span>
          </span>
        </button>;
      })}
    </div>
    {(active.canMegaEvo || picks.length > 0) && <div className="bt-tools">
      {active.canMegaEvo && <Choice name="bt-mega" options={[MEGA]} value={mega ? [MEGA] : []} onChange={list => setMega(list.length > 0)} multiple />}
      {picks.length > 0 && <Button variant="link" onClick={reset}>처음부터 다시 고르기</Button>}
    </div>}
    {bench}
    {toast && <Dock toast={toast} />}
  </div>;
}

/* the bench: a row of the brought Pokémon not out, each its picture, name and HP; one that cannot come in is muted */
function Bench({ pokemon, res, pick, label }) {
  const out = pokemon.map((mon, i) => ({ mon, i })).filter(({ mon }) => !mon.active);
  if (!out.length) return null;
  return <div className="bt-bench">
    <span className="t12 dim">{label}</span>
    <div className="stack bt-bench-row">
      {out.map(({ mon, i }) => {
        const go = pick(i);
        const species = String(mon.details).split(", ")[0];
        const { hp, maxhp, status } = parseHP(mon.condition);
        const fainted = status === "fnt";
        return <button key={mon.ident + i} type="button" className="pn bt-sw" disabled={!go} onClick={go || undefined}
          aria-label={`${nameOf(res, species)}${fainted ? ", 쓰러짐" : `, HP ${hp} / ${maxhp}`} 교체`}>
          <img src={spriteUrl(species)} alt="" draggable="false" />
          <span className="bt-sw-say">
            <b className="t15">{nameOf(res, species)}</b>
            <span className="t12 dim">{fainted ? "쓰러짐" : `${hp}/${maxhp}`}{status && !fainted ? `, ${STATUS[status] || status}` : ""}</span>
          </span>
        </button>;
      })}
    </div>
  </div>;
}

/* the party as cells, each Pokémon on its floor with its name; HP, status and item at the top (the foe's preview shows types) */
const STATUS_TYPE = { brn: "fire", par: "electric", psn: "poison", tox: "poison", slp: "normal", frz: "ice" };
function Party({ pokemon, res, pick, preview = false }) {
  return <div className="stack bt-party">
    {pokemon.map((mon, i) => {
      const p = pick?.(i);
      const species = String(mon.details).split(", ")[0];
      const { hp, maxhp, status } = parseHP(mon.condition);
      const fainted = status === "fnt";
      const Box = p ? "button" : "div";
      const item = mon.item ? res.text.items[toID(mon.item)]?.name || mon.item : "";
      return <Box key={mon.ident + i} className={"pn stand bt-party-cell" + (p || preview ? "" : " off")}
        {...(p ? { type: "button", onClick: p.onPick, "aria-pressed": p.chosen } : {})}
        aria-label={`${nameOf(res, species)}${fainted ? ", 쓰러짐" : ""}${p?.order ? `, ${p.order}번째` : ""}`}>
        <span className="bt-party-top">
          {preview
            ? <span className="tb-types">{typesOf(res, species).map(t => <span key={t} className={`tb-type type-${toID(t)}`}>{res.text.types[t] || t}</span>)}</span>
            : <>
              <span>{fainted ? "쓰러짐" : `${hp}/${maxhp}`}</span>
              {status && !fainted && <span className={`bt-mark type-${STATUS_TYPE[status] || "normal"}`}>{STATUS[status] || status}</span>}
              {item && <span className="dim">{item}</span>}
            </>}
        </span>
        <Mon src={spriteUrl(species)} />
        <i className={"floor" + (p?.chosen ? " inv" : "")}><span className="t12">{p?.order ? `${p.order} ${nameOf(res, species)}` : nameOf(res, species)}</span></i>
      </Box>;
    })}
  </div>;
}
