import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { reduced } from "../components/common/motion.js";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Seg from "../components/common/Seg.jsx";
import Empty from "../components/common/Empty.jsx";
import Loader, { Busy } from "../components/common/Loader.jsx";
import { Chips, Choice, Counter, Dock, Mon, OptionRows, Question, Row, Toast } from "../components/common/Board.jsx";
import { siteConfirm } from "../components/common/SiteDialog.jsx";
import Modal from "../components/common/Modal.jsx";
import { pushHistory } from "../components/layout/history.js";
import { championsData } from "../services/index.js";
import { onSpriteError, spriteUrl } from "../services/teamBuilderCore.js";
import { readSavedTeams, showdownTeam } from "../services/battleTeams.js";
import { createBattleReader, josa, parseHP, requestKey, slotPasses, toID } from "../services/battleLog.js";
import { LobbyBars, LobbyStage, STATUS, Stage, effLabel, effectiveness, nameOf, other, sceneOf, typesOf, useStageTape } from "./battle/Stage.jsx";
import { setSpeed as setStageSpeed } from "./battle/stageFx.js";
import { BOARD_DRAFT_KEY, battleHref, battlePollDelay, cancelBattle, chooseInBattle, createBattle, forfeitBattle, forgetSeat, isDoubles, joinBattle, listEventBattles, playerViewIsCurrent, readBattleRow, readBattleVersion, readSeat, takeOfficialSeat, viewBattle } from "../services/battleService.js";
import { collectGraphMatches, evalGraph } from "../services/bracketWinnerPlan.js";
import { shareLink } from "../services/communityStore.js";
import { logUpTo, nextStop, replayStops, secondsLeft, turnStop } from "../services/battleReplay.js";
import { claimTimeout, readDeadline, rememberBattle } from "../services/battleWatch.js";
import { BattleLists, ReplayBar, downloadReplay } from "./battle/Replay.jsx";
import { FoeSix, MonCard, PickDock, TeamInfo, TeamPick, ownCards, seenCards } from "./battle/Sets.jsx";

/* 배틀 (DESIGN.md "Battle"). 친선전은 팀 빌더에 저장한 팀으로 열고, 링크를 받은 사람이 참가한다.
   공식 경기는 대진표의 경기에서 열고, 그 경기의 두 선수가 제출 비밀번호로 앉아 공식 파티로 치른다. 끝나면 서버가 승자를 대진표에 넣는다.
   판정은 모두 쇼다운 엔진이 서버(battle 함수)에서 하고, 이 화면은 고른 것을 보내고 기록을 읽어 보여 줄 뿐이다. */
const REGULATIONS = { "m-c": "M-C", "m-b": "M-B" };
const FORMATS = [["singles", "싱글"], ["doubles", "더블"]];
const NAME_KEY = "ypl-battle:name";

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
// the saved team a battle was opened with, so its waiting screen can stand that team on the court (this device only)
const OPEN_TEAM_KEY = "ypl-battle:open-team:v1";
const openTeams = () => { try { return JSON.parse(localStorage.getItem(OPEN_TEAM_KEY) || "{}"); } catch { return {}; } };
const keepOpenTeam = (id, teamId) => { try { localStorage.setItem(OPEN_TEAM_KEY, JSON.stringify({ ...Object.fromEntries(Object.entries(openTeams()).slice(-19)), [id]: teamId })); } catch { /* 대기 화면이 팀 없이 선다 */ } };
const openTeam = id => readSavedTeams().find(t => t.id === openTeams()[id]) || null;

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
  if (id) return <BattleRoom key={id} id={id} res={res} say={say} go={go} onLeave={() => open(null)} start={{ turn: params.get("turn"), side: params.get("side") }} />;
  if (official) return <OfficialSeat {...official} res={res} onOpen={open} />;
  return <BattleOpen res={res} onOpen={open} preset={params.get("team")} />;
}

/* 저장한 팀: 팀 이름과 규정, 그리고 여섯을 그림으로(DESIGN.md "Where a Pokémon stands": 파티 목록은 이름 줄이 아니라 그림). 고른 팀은 반전한다. */
function TeamRows({ teams, value, onChange, res }) {
  return <div className="stack" role="radiogroup" aria-label="팀">
    {teams.map(team => {
      const on = team.id === value;
      const reg = REGULATIONS[team.regulationId] || team.regulationId;
      return <label key={team.id} className={"bt-team " + (on ? "inv" : "pn")}>
        <input type="radio" className="sr-only" name="battle-team" checked={on} onChange={() => onChange(team.id)}
          aria-label={`${team.name}, ${reg}, ${team.members.map(m => res.text.pokedex[m.pokemonId] || m.pokemonName).join(", ")}`} />
        <span className="bt-team-head"><b className="t15">{team.name}</b><span className="t12 reg dim">{reg}</span>{on && <Icon n="check" size={20} />}</span>
        <span className="bt-team-six" aria-hidden="true">{team.random
          ? Array.from({ length: 6 }, (_, i) => <span key={i} className="bt-team-q t15">?</span>)
          : team.members.map((m, i) => <span key={i} className="stand"><i className="floor" /><Mon src={spriteUrl(m.pokemonName)} loading="lazy" onError={onSpriteError()} /></span>)}</span>
      </label>;
    })}
  </div>;
}

/* a random party (a random battle): chosen like a team, drawn by the battle function when the battle opens */
const RANDOM = "random:";
const randomTeams = regs => regs.map(reg => ({ id: RANDOM + reg, name: "랜덤 파티", regulationId: reg, members: [], random: true }));
const sendTeam = (team, res) => (team.random ? "random" : showdownTeam(team, res.detail));

function NoTeams() {
  return <Empty title="저장한 팀이 없습니다." desc="팀 빌더에서 팀을 저장하면 여기에서 고를 수 있습니다.">
    <Button variant="second" href="?view=builder">팀 빌더 열기</Button>
  </Empty>;
}

/* 배틀 전 화면(DESIGN.md "Battle", Opening and waiting): 경기가 치러질 모습을 먼저 보인다. 위에는 나 대 상대, 그 아래 경기장에는
   고른 팀의 앞 포켓몬이 우리 쪽에 서고(그 아래 판에 이름과 타입) 상대 쪽은 상대가 올 때까지 비어 있다. 그 다음이 고를 것(형식, 팀)과 주 행동이다.
   여는 사람과 링크로 참가하는 사람이 같은 화면을 쓴다. foe는 참가하는 쪽에서 본 연 사람의 이름이다. */
function Lobby({ res, teams, teamId, setTeamId, teamLabel, name, setName, foe, doubles, setup, action, after }) {
  const team = teams.find(t => t.id === teamId);
  const leads = (team?.members || []).slice(0, doubles ? 2 : 1).map(m => res.detail.pokedex[m.pokemonId]?.name || m.pokemonName);
  const stageLabel = team ? `경기장, ${leads.map(species => nameOf(res, species)).join(", ")}` : "빈 경기장";
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      <div className="bt-lobby">
        <div className="bt-lobby-show">
          <div className="stack bt-versus">
            <label className="pn bt-vs" htmlFor="bt-name">
              <span className="t12 dim">내 이름</span>
              <input id="bt-name" value={name} maxLength={20} autoComplete="nickname" onChange={e => setName(e.target.value)} placeholder="예: 이제빈" />
            </label>
            <span className="pn bt-vs-mid t15" aria-hidden="true">VS</span>
            <span className="pn bt-vs foe">
              <span className="t12 dim">상대</span>
              {foe ? <b>{foe}</b> : <b className="mute">링크로 참가</b>}
            </span>
          </div>
          <LobbyStage leads={leads} doubles={doubles} label={stageLabel} />
          <LobbyBars leads={leads} doubles={doubles} res={res} />
        </div>
        <div className="bt-lobby-set">
          {setup}
          <div className="q"><span className="q-label t12 dim">{teamLabel}</span>{teams.length ? <TeamRows teams={teams} value={teamId} onChange={setTeamId} res={res} /> : <NoTeams />}</div>
          {action}
        </div>
      </div>
      {after}
    </div>
  );
}

// what the battle function refused, with the Pokémon it names in Korean (기술이 하나도 없는 포켓몬(Garchomp) → 한카리아스)
const failText = (e, res) => {
  const problem = e.problems?.[0];
  if (!problem) return e.message;
  return `${e.message} ${res ? problem.replace(/포켓몬\(([^)]+)\)/, (_, species) => `포켓몬(${nameOf(res, species)})`) : problem}`;
};
function BattleOpen({ res, onOpen, preset }) {
  const teams = useMemo(() => [...readSavedTeams().filter(team => REGULATIONS[team.regulationId]), ...randomTeams(Object.keys(REGULATIONS))], []);
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
      const made = await createBattle({ regulation: team.regulationId, battleFormat: format, name: name.trim(), team: sendTeam(team, res) });
      keepOpenTeam(made.id, team.id);
      onOpen(made.id);
    } catch (e) {
      setError(failText(e, res));
      setBusy(false);
    }
  };
  return <Lobby res={res} teams={teams} teamId={teamId} setTeamId={setTeamId} teamLabel="팀" name={name} setName={setName} doubles={format === "doubles"}
    setup={<Question id="bt-format" label="형식" group>
      <Choice name="bt-format" options={FORMATS.map(([, label]) => label)} value={FORMATS.find(([key]) => key === format)[1]} onChange={label => setFormat(FORMATS.find(([, l]) => l === label)[0])} />
    </Question>}
    action={<Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <Button variant="main" onClick={submit} loading={busy} disabled={!team || !name.trim()}>배틀 열기</Button>
    </Dock>}
    after={<BattleLists onOpen={onOpen} />} />;
}

/* ---------- a battle: its version is asked on battlePollDelay's rhythm, and only a change of version reads the row ----------
   A player's own view comes back with each choice; the server is asked for it again only when the engine moved since. */
function BattleRoom({ id, res, say, go, onLeave, start }) {
  const [row, setRow] = useState(undefined);
  const [view, setView] = useState(null);
  const [seat, setSeat] = useState(() => readSeat(id));
  // undefined until read: a battle that is not there reads null, which must still count as a change (a cancelled or mistyped link)
  const version = useRef(undefined);
  const rowRef = useRef(undefined);
  const viewRef = useRef(null);
  const viewRow = useRef(null); // the last row this device's view is known to be current with
  const movedAt = useRef(Date.now());
  const show = useCallback(next => { viewRef.current = next; movedAt.current = Date.now(); setView(next); }, []);
  /* a view comes from the poll and from our own choice. A poll's view that set out before a newer one, or while a choice was
     on its way, may be older than the choice's answer: it is dropped, and the version is left unread so the next tick reads again */
  const order = useRef({ n: 0, busy: 0 });
  // this device finds the battle again on the battle page (이 기기의 배틀), played or watched
  useEffect(() => { rememberBattle(id); }, [id]);
  const refresh = useCallback(async () => {
    const next = await readBattleRow(id);
    // the clock of the decision it waits on (docs/db/battle_timer.sql); none before that SQL runs
    if (next?.status === "active") next.deadline_at = await readDeadline(id);
    rowRef.current = next;
    setRow(next);
    if (next && readSeat(id) && next.status !== "waiting") {
      if (!playerViewIsCurrent(viewRef.current, viewRow.current, next)) {
        const n = ++order.current.n;
        try {
          const fresh = await viewBattle(id);
          if (n !== order.current.n || order.current.busy) return;
          show(fresh);
        } catch (e) {
          if (e.status !== 403) throw e;
          // the seat moved to another device (the same player came in again there): this one watches
          forgetSeat(id); setSeat(null); show(null);
        }
      }
      viewRow.current = next;
    }
    version.current = next?.version ?? null; // only once all of it was read, so a failed or dropped read is tried again
  }, [id, show]);
  const api = useMemo(() => {
    const act = run => async (...args) => {
      const o = order.current;
      o.n += 1; o.busy += 1;
      try { return await run(...args); } finally { o.busy -= 1; o.n += 1; }
    };
    return { choose: act(chooseInBattle), forfeit: act(forfeitBattle) };
  }, []);
  useEffect(() => {
    let stopped = false, busy = false, timer = null;
    const tick = async () => {
      if (busy) return;
      busy = true;
      clearTimeout(timer);
      try {
        if (document.visibilityState === "visible") {
          // a finished official battle waits for its bracket line, which the server writes without moving the version
          if (rowRef.current?.status === "ended") await refresh();
          else if ((await readBattleVersion(id)) !== version.current) { await refresh(); movedAt.current = Date.now(); }
        }
      } catch { /* 다음 차례에 다시 읽는다 */ }
      busy = false;
      if (stopped) return;
      const delay = battlePollDelay(rowRef.current, Date.now() - movedAt.current);
      if (delay != null) timer = setTimeout(tick, delay);
    };
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
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
    if (seat) return <Waiting row={row} res={res} team={openTeam(id)} onShare={share} onCancel={cancel} />;
    // an official match is entered from its own seat screen: the player's party PIN, never a builder team
    if (row.kind === "official") return <OfficialSeat res={res} eventId={row.event_id} nodeKey={row.source_node_key} onOpen={() => { setSeat(readSeat(id)); refresh(); }} />;
    return <Join row={row} res={res} onJoined={next => { setSeat(readSeat(id)); show(next); refresh(); }} />;
  }
  return <Arena row={row} view={view} seat={seat} res={res} onView={show} onShare={share} go={go} api={api} say={say} start={start} />;
}

/* the opener waits (DESIGN.md "Battle", Opening and waiting): the screen it opened from, now set. The matchup with our name lit and
   the opponent's place waiting, the court with our leads standing and a light breathing where each of theirs will be sent in,
   the time waited in segments, the battle as a row, the team brought, then the link to send and 대기 취소. */
export function Waiting({ row, res, team, onShare, onCancel }) {
  const official = row.kind === "official";
  const doubles = isDoubles(row.format_id);
  const leads = (team?.members || []).slice(0, doubles ? 2 : 1).map(m => res?.detail.pokedex[m.pokemonId]?.name || m.pokemonName);
  const now = useNow(true);
  const since = Date.parse(row.created_at || "") || now;
  const waited = Math.max(0, Math.floor((now - since) / 1000));
  const clock = `${Math.min(99, Math.floor(waited / 60))}:${String(waited % 60).padStart(2, "0")}`;
  const rule = `${REGULATIONS[row.regulation] || ""} ${doubles ? "더블" : "싱글"}`;
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      <div className="bt-lobby">
        <div className="bt-lobby-show">
          <div className="stack bt-versus">
            <span className="pn bt-vs"><span className="t12 dim">나</span><b>{row.p1_name || "나"}</b></span>
            <span className="pn bt-vs-mid t15" aria-hidden="true">VS</span>
            <span className="pn bt-vs foe"><span className="t12 dim bt-vs-wait"><i className="lamp" aria-hidden="true" />참가 대기</span><b className="mute">상대</b></span>
          </div>
          {res && <LobbyStage leads={leads} doubles={doubles} awaiting label={`경기장, ${leads.length ? leads.map(s => nameOf(res, s)).join(", ") : "우리 쪽"}, 상대 쪽은 비어 있음`} />}
          {res && leads.length > 0 && <LobbyBars leads={leads} doubles={doubles} res={res} />}
        </div>
        <div className="bt-lobby-set">
          <Counter label="기다린 시간" value={clock} cells={3} h={52} />
          <Row title={`상대를 기다리는 중입니다.`} line={`${rule} ${official ? "공식 경기" : "친선 배틀"}`} lamp="참가 대기" />
          {team && res && <div className="q"><span className="q-label t12 dim">가져온 팀</span><TeamRows teams={[team]} value={team.id} onChange={() => {}} res={res} /></div>}
          <p className="t12 dim">{official ? "상대 선수가 들어오면 시작합니다." : "상대가 링크로 들어오면 시작합니다."}</p>
          <Dock><Button variant="main" onClick={onShare}>링크 공유</Button></Dock>
          <Button variant="link" onClick={onCancel}>대기 취소</Button>
        </div>
      </div>
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
      if (alive) setMatch({ eventName: facts.event?.name || "", label: node.label || "", a: nameOf(sp(node.a)), b: nameOf(sp(node.b)), entries: [sp(node.a), sp(node.b)], decided: Boolean(node.winner) });
    }).catch(() => alive && setMatch(null));
    return () => { alive = false; };
  }, [eventId, nodeKey]);
  return match;
}

function OfficialSeat({ eventId, nodeKey, res, onOpen }) {
  const match = useMatchPlayers(eventId, nodeKey);
  const [side, setSide] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  /* this device may already hold a seat in the match's open battle. Only a battle of this match's two players counts: when an
     operator changed an earlier match, the same place holds new players, and the old battle is closed as they sit down. */
  const entries = match?.entries?.join(",");
  useEffect(() => {
    if (!entries) return;
    listEventBattles(eventId).then(list => setOpen(list.find(b => b.source_node_key === nodeKey && b.status !== "ended"
      && [b.p1_entry_id, b.p2_entry_id].filter(Boolean).every(id => match.entries.includes(id))) || null));
  }, [eventId, nodeKey, entries]);
  useEffect(() => { if (open && readSeat(open.id)) onOpen(open.id); }, [open]);
  if (match === undefined) return <Loader />;
  if (!match) return <Empty title="경기를 찾을 수 없습니다." desc="대진표에서 다시 열어 주세요." />;
  const submit = async () => {
    setBusy(true); setError("");
    try { onOpen((await takeOfficialSeat({ eventId, nodeKey, side, pin })).id); }
    catch (e) { setError(failText(e, res)); setBusy(false); }
  };
  const names = [match.a, match.b];
  return (
    <div className="bt-page">
      <h1 className="t32">공식 경기</h1>
      <Row title={`${match.a} 대 ${match.b}`} line={[match.eventName, match.label].filter(Boolean).join(", ")} lamp={open ? "진행 중" : null} />
      {match.decided
        ? <Empty title="이미 승자가 정해진 경기입니다." desc="대진표에서 결과를 확인해 주세요." />
        : <>
          <p className="read dim bt-intro">제출 비밀번호로 자기 자리에 앉습니다.</p>
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
  const teams = useMemo(() => [...readSavedTeams().filter(team => team.regulationId === row.regulation), ...randomTeams([row.regulation])], [row.regulation]);
  const [name, setName] = useState(rememberedName);
  const [teamId, setTeamId] = useState(teams[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const team = teams.find(t => t.id === teamId);
  const doubles = isDoubles(row.format_id);
  const submit = async () => {
    setBusy(true); setError("");
    try {
      rememberName(name.trim());
      onJoined(await joinBattle(row.id, { name: name.trim(), team: sendTeam(team, res) }));
    } catch (e) {
      setError(failText(e, res));
      setBusy(false);
    }
  };
  return <Lobby res={res} teams={teams} teamId={teamId} setTeamId={setTeamId} teamLabel={`팀 (${REGULATIONS[row.regulation]})`} name={name} setName={setName}
    foe={row.p1_name} doubles={doubles}
    setup={<Row title={`${REGULATIONS[row.regulation]} ${doubles ? "더블" : "싱글"} 친선 배틀`} line="참가하면 바로 시작합니다." lamp="참가 대기" />}
    action={<Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <Button variant="main" onClick={submit} loading={busy} disabled={!team || !name.trim()}>참가</Button>
    </Dock>} />;
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
    // the request it answers goes with it: the server refuses a choice whose request has moved on (a stale screen, a lost answer sent again)
    try { setChosenSay(said); onView(await api.choose(row.id, choice, requestKey(view?.turn, request))); return true; }
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
  // before the leads are sent out the stage is empty: the team preview stands in its place
  const started = Boolean(scene && [...scene.p1.active, ...scene.p2.active].some(Boolean));
  const nameAt = (side, slot) => { const m = scene?.[side]?.active?.[slot]; return m ? `${side === perspective ? "" : "상대 "}${nameOf(res, m.species)}` : "빈 자리"; };
  const typesAt = (side, slot) => { const m = scene?.[side]?.active?.[slot]; return m && !m.fainted ? typesOf(res, m.species) : null; };
  const foes = (scene?.[foe]?.active || []).map((m, slot) => (m && !m.fainted ? { slot, name: nameOf(res, m.species), types: typesOf(res, m.species) } : null));
  // a player's own party as the engine brought it (moves, item, ability, stats): kept from the last request, so it stays open while the other player chooses
  const party = useRef(null);
  if (request?.side?.pokemon) party.current = request.side.pokemon;
  const pickCount = useRef(0);
  if (request?.teamPreview) pickCount.current = Math.min(request.maxChosenTeamSize || request.side.pokemon.length, request.side.pokemon.length);
  // every move's full PP as the engine has told it for the Pokémon out, so a Pokémon on the bench shows what it has left too
  const maxpp = useRef({});
  for (const slot of request?.active || []) for (const m of slot.moves || []) if (m.maxpp != null) maxpp.current[m.id] = m.maxpp;
  const [picks, setPicks] = useState([]);
  const [partyOpen, setPartyOpen] = useState(false);
  const openParty = seat && party.current ? () => setPartyOpen(true) : null;
  const ownList = () => ownCards(res, party.current || [], {
    active: request?.active || [], maxpp: maxpp.current,
    used: Object.fromEntries((scene?.[perspective]?.roster || []).filter(m => m.name).map(m => [m.name, m.ppUsed])),
  });
  // the party beside the stage: a player reads the foe's shown set and their own whole one; a spectator reads both as shown
  const infoSides = !scene ? [] : seat
    ? [{ key: "foe", label: `${names[foe]}의 파티`, cards: seenCards(res, scene[foe].roster) }, { key: "own", label: "내 파티", cards: ownList() }]
    : [perspective, foe].map(side => ({ key: side, label: `${names[side]}의 파티`, cards: seenCards(res, scene[side].roster) }));
  // on a wide screen the match takes the whole window: the page frame lets go of its 1200 for this view only
  useEffect(() => {
    const page = document.getElementById("ypl-main");
    page?.classList.add("page--battle");
    return () => page?.classList.remove("page--battle");
  }, []);
  const preview = tape.state.sides;
  /* one column on a phone: the head, the result, the stage (or the team preview), the replay, the choices, the party, the log.
     On a wide screen the stage stands on the left as large as the window allows, and everything else stands in a column beside it
     that scrolls on its own, so the stage never leaves the screen */
  return (
    <div className="bt-page bt-match">
      <div className="bt-main">
        {started
          ? <Stage scene={scene} stageRef={tape.stageRef} perspective={perspective} doubles={doubles} res={res} names={names} clock={left} mine={Boolean(seat && !waiting)}
              targeting={target?.targeting} said={tape.said} ask={boxAsk} known={known.current} onParty={openParty} />
          : seat && party.current
          ? <TeamPick res={res} foe={preview[foe].preview} foeName={names[foe]} pokemon={party.current} count={pickCount.current}
              locked={!choosing} picks={picks} setPicks={setPicks} />
          : <div className="bt-preview">
              {[foe, perspective].map(side => <FoeSix key={side} res={res} species={preview[side].preview} title={`${names[side]}의 파티`} />)}
            </div>}
      </div>
      <div className="bt-side">
        {/* on a wide screen the team preview's sections open with a title; the column beside it opens with one too, so both start on one line */}
        {!started && <span className="bt-pv-title bt-side-title" aria-hidden="true">경기</span>}
        <div className="pn bt-head">
          <span className="status t12">{ended ? "종료" : <><i className="lamp sig" aria-hidden="true" />{started ? "진행 중" : "선출 중"}</>}{official && <span className="dim">공식 경기</span>}</span>
          <b className="bt-head-names">{`${names[perspective]} 대 ${names[foe]}`}</b>
        </div>
        {shownEnded && <Row className="inv bt-result" title={row.winner === "tie" ? "무승부" : `${names[row.winner]} 승리`}
          line={[row.ended_by === "forfeit" ? "기권으로 끝났습니다." : row.ended_by === "timeout" ? "시간이 다 되어 끝났습니다." : "배틀이 끝났습니다.", bracketLine].filter(Boolean).join(" ")} />}
        {shownEnded && replay && replay.stops.length > 1 && <ReplayBar stops={replay.stops} at={at} playing={autoplay} onJump={jump} onStep={stepOn} onPlay={play} />}
        {!started && seat && party.current && choosing && <PickDock res={res} pokemon={party.current} count={pickCount.current} picks={picks} setPicks={setPicks}
          onSend={send} toast={error ? <Toast error>{error}</Toast> : null} />}
        {/* the game asks only once the stage has played what came before: a choice never appears over a turn still on stage */}
        {seat && !ended && started && <div ref={consoleRef} className="bt-console">
          {choosing && <Choices key={requestKey(view?.turn, request)} request={request} doubles={doubles} res={res} foes={foes} typesAt={typesAt} nameAt={nameAt}
            onSend={send} setTarget={setTarget} setAsk={setAsk} toast={error ? <Toast error>{error}</Toast> : null} />}
        </div>}
        {(waiting || (error && !request)) && <Dock toast={error && !choosing ? <Toast error>{error}</Toast> : null}>
          {waiting && <div className="pn bt-waiting"><Busy h={32} /><span className="t15">{request?.teamPreview && view?.chosen ? "상대의 선출을 기다리는 중…" : "상대의 선택을 기다리는 중…"}</span></div>}
        </Dock>}
        {started && <TeamInfo key={seat ? "seat" : "watch"} res={res} sides={infoSides} />}
        <div className="bt-play">
          <Chips label="연출 속도" value={String(speed)} onChange={v => setSpeedChoice(Number(v))} options={SPEEDS.map(([v, label]) => [String(v), `연출 ${label}`])} />
        </div>
        {!seat && <Chips label="시점" value={pov} onChange={turnTo} options={[["p1", `${names.p1} 시점`], ["p2", `${names.p2} 시점`]]} />}
        <details className="bt-logbox">
          <summary className="t12 dim">전체 기록</summary>
          <Log lines={tape.lines} />
        </details>
        <div className="bt-links">
          {(!seat || ended) && <Button variant="link" onClick={shareHere}>링크 공유</Button>}
          {seat && !ended && <Button variant="link" onClick={giveUp}>기권</Button>}
          {official && <Button variant="link" onClick={() => go?.("bracket", { eventId: row.event_id })}>대진표</Button>}
          {ended && <Button variant="link" onClick={shareToBoard}>게시판에 공유</Button>}
          {ended && log && <Button variant="link" onClick={() => downloadReplay({ row, log, res, perspective, names })}>기록 내려받기</Button>}
          <span className="t12 mute">배틀 엔진: Pokémon Showdown (MIT)</span>
        </div>
      </div>
      {partyOpen && party.current && <Modal title="내 파티" onClose={() => setPartyOpen(false)} className="wide">
        <div className="stack bt-cards sheet-cards">{ownList().map(c => <MonCard key={c.key} res={res} {...c} />)}</div>
      </Modal>}
    </div>
  );
}

/* ---------- choices: built from the request alone, as the engine asks ---------- */
const NEEDS_TARGET = { normal: "any", any: "any", adjacentFoe: "foe", adjacentAlly: "ally", adjacentAllyOrSelf: "allyOrSelf" };
const CATEGORY = { Physical: "물리", Special: "특수", Status: "변화" };
const EFF_WORD = { 4: "효과 매우 굉장 ×4", 2: "효과 굉장 ×2", .5: "효과 별로 ×½", .25: "효과 매우 별로 ×¼", 0: "효과 없음" };
const effClass = m => "bt-eff" + (m >= 2 ? " hard" : m === 0 ? " none" : "");

function Choices({ request, doubles, res, foes, typesAt, nameAt, onSend, setTarget, setAsk, toast }) {
  const side = request.side;
  const [picks, setPicks] = useState([]);
  const [mega, setMega] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiming, setAiming] = useState(null);
  // a new request mounts a new Choices (keyed by the turn and the request: the engine sets no rqid, a switch after a faint keeps the turn,
  // and a locked move can ask the very same thing two turns running), so nothing chosen for the last one carries over
  useEffect(() => () => { setTarget(null); setAsk(""); }, []);
  const species = details => String(details).split(", ")[0];
  const name = details => nameOf(res, species(details));
  const moveName = id => res.text.moves[id]?.name || res.detail.moves[id]?.name || id;
  const send = async (choice, said) => { setSending(true); const went = await onSend(choice, said); setSending(false); if (!went) setPicks([]); };
  const slots = side.pokemon.slice(0, request.active?.length || request.forceSwitch?.length || 1);
  const forced = request.forceSwitch;
  // a slot that has nothing to choose passes: a fainted one, one not asked to switch, or one asked when the bench has run out
  const passes = i => slotPasses(request, i);
  const at = (() => { let i = picks.length; while (i < slots.length && passes(i)) i += 1; return i; })();
  const complete = at >= slots.length;
  // the question stands in the message box, as the game puts it there
  const aimed = aiming != null && request.active?.[at]?.moves?.[aiming];
  const question = request.teamPreview || complete || forced ? ""
    : aimed ? `${name(slots[at].details)}의 ${moveName(aimed.id)}, 대상을 무대에서 골라 주세요.`
    : `${josa(name(slots[at].details), "topic")} 무엇을 할까?`;
  useEffect(() => { setAsk(question); }, [question]);

  // the team preview is chosen on its own screen (TeamPick, battle/Sets.jsx)
  if (request.teamPreview) return null;

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
  // one Mega Evolution a battle: in doubles both may be offered it, but once the first takes it the second is not
  const megaOpen = active?.canMegaEvo && !picks.some(p => / mega$/.test(p || ""));
  // the bench: every brought Pokémon not out, one tap to send it in (Showdown keeps them under the moves)
  const bench = <Bench pokemon={side.pokemon} res={res} label={forced ? `${who} 대신 나갈 포켓몬` : trapped ? "교체할 수 없는 상태" : "교체"}
    pick={i => {
      const mon = side.pokemon[i];
      const free = !trapped && !mon.active && !mon.condition.endsWith(" fnt") && !switchedIn.has(i);
      return free ? () => add(`switch ${i + 1}`, `${who} 대신 ${name(mon.details)}`) : null;
    }} />;
  if (forced) return <div className="bt-choices">
    {bench}
    {picks.length > 0 && <div className="bt-tools"><Button variant="link" onClick={reset}>처음부터 다시 고르기</Button></div>}
    {toast && <Dock toast={toast} />}
  </div>;

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
    {/* Mega Evolution: a key the moves' width above them, set before a move is chosen, as the game asks for it first. Its emblem is
        the games' rainbow helix (public/brand/mega-evolution.png) as given; the key inverts while it is on */}
    {megaOpen && <button type="button" className={"bt-mega" + (mega ? " on" : "")} aria-pressed={mega} onClick={() => setMega(!mega)}>
      <img className="bt-mega-mark" src="/brand/mega-evolution.png" alt="" draggable="false" />
      <span className="bt-mega-say"><b>{`${who} 메가진화`}</b><small>{mega ? "켜졌습니다. 기술을 고르면 메가진화합니다." : "켜고 기술을 고르면 메가진화합니다."}</small></span>
      <span className="bt-mega-tick" aria-hidden="true">{mega && <Icon n="check" size={20} />}</span>
    </button>}
    <div className="stack bt-moves">
      {active.moves.map((move, i) => {
        const data = res.detail.moves[move.id] || {};
        const type = data.type || "Normal";
        // every foe now out, in the order they stand; shown only when one of them is not ×1
        const marks = data.category && data.category !== "Status" ? foes.filter(Boolean).map(f => ({ f, m: effectiveness(type, f.types) })) : [];
        const shown = marks.some(x => x.m !== 1) ? marks : [];
        // two lines, every move alike, as a game's move key: the name and how it lands; its type, category and power, its accuracy and priority, and its PP
        const kind = CATEGORY[data.category] + (data.basePower > 0 ? ` ${data.basePower}` : "");
        const foot = [data.category !== "Status" && data.accuracy !== true && data.accuracy < 100 && `명중 ${data.accuracy}`,
          data.priority ? `우선도 ${data.priority > 0 ? "+" : ""}${data.priority}` : null].filter(Boolean).join(" ");
        return <button key={move.id} type="button" className={`bt-move type-${toID(type)}${aiming === i ? " on" : ""}`} disabled={move.disabled || sending} onClick={() => choose(move, i)} aria-pressed={aiming === i}
          aria-label={`${moveName(move.id)}, ${res.text.types[type] || type}, ${CATEGORY[data.category] || ""}${data.basePower > 0 ? ` 위력 ${data.basePower}` : ""}, ${data.accuracy === true ? "필중" : `명중 ${data.accuracy}`}${move.pp != null ? `, PP ${move.pp} / ${move.maxpp}` : ""}${shown.map(x => `, ${doubles ? x.f.name + " " : ""}${EFF_WORD[x.m] || effLabel(x.m)}`).join("")}`}>
          <span className="bt-move-top">
            <b className="bt-move-name">{moveName(move.id)}</b>
            {shown.length > 0 && <span className="bt-effs" aria-hidden="true">{shown.map(x => <span key={x.f.slot} className={effClass(x.m)}>{effLabel(x.m)}</span>)}</span>}
          </span>
          <span className="bt-move-line" aria-hidden="true">
            <span className="bt-move-type">{res.text.types[type] || type}</span>
            <span className="bt-move-kind">{kind}{foot && <span>{foot}</span>}</span>
            {/* a move locked in (Outrage, a charging move) is asked without its PP */}
            <span className="bt-move-pp">{move.pp != null ? `${move.pp}/${move.maxpp}` : ""}</span>
          </span>
        </button>;
      })}
    </div>
    {picks.length > 0 && <div className="bt-tools"><Button variant="link" onClick={reset}>처음부터 다시 고르기</Button></div>}
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
        return <button key={mon.ident + i} type="button" className="bt-sw" disabled={!go} onClick={go || undefined}
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
