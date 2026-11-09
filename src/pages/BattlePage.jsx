import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DUR, dimAway, light, lineup, reduced } from "../components/common/motion.js";
import Button from "../components/common/Button.jsx";
import Icon from "../components/common/Icon.jsx";
import Seg from "../components/common/Seg.jsx";
import Empty from "../components/common/Empty.jsx";
import ErrorNote from "../components/common/ErrorNote.jsx";
import Loader, { Busy } from "../components/common/Loader.jsx";
import { Chips, Choice, Counter, Dock, Mon, OptionRows, Question, Row, SectionHead, TabsLine, Toast } from "../components/common/Board.jsx";
import ListSearch from "../components/common/ListSearch.jsx";
import Pager from "../components/common/Pager.jsx";
import { siteConfirm } from "../components/common/SiteDialog.jsx";
import Modal from "../components/common/Modal.jsx";
import { checkBuild, pushHistory } from "../components/layout/history.js";
import { championsData } from "../services/index.js";
import { onSpriteError, spriteUrl } from "../services/teamBuilderCore.js";
import { readSavedTeams, showdownTeam } from "../services/battleTeams.js";
import { createBattleReader, fourMoves, josa, parseHP, requestKey, revives, slotPasses, toID } from "../services/battleLog.js";
import { LobbyArena, LobbyStage, STATUS, Stage, effLabel, effectiveness, nameOf, other, sceneOf, typesOf, useStageTape } from "./battle/Stage.jsx";
import { goIn, prewarm, setSpeed as setStageSpeed } from "./battle/stageFx.js";
import { sfx } from "./battle/sfx.js";
import { audio, setSoundOn, soundOn } from "./battle/cries.js";
import { BOARD_DRAFT_KEY, battleHref, battlePollDelay, canRematch, cancelBattle, chooseInBattle, createBattle, recordCpuBattle, readCpuReplay, forfeitBattle, forgetSeat, isDoubles, joinBattle, listEventBattles, listOpenRooms, playerViewIsCurrent, readBattleRow, readBattleVersion, readSeat, rematchBattle, runGames, takeOfficialSeat, viewBattle, warmBattle } from "../services/battleService.js";
import { parseBoutKey } from "../services/teamBouts.js";
import { watchBattleSignal } from "../services/battleSignal.js";
import { SPEED_POWER, currentTypes, movePower, moveType, weatherSuppressed } from "./battle/battleWords.js";
import { DEFAULT_LEVEL, LEVELS, LEVEL_IDS, levelOf } from "../services/cpuLevels.js";
import { collectGraphMatches, evalGraph } from "../services/bracketWinnerPlan.js";
import { shareLink } from "../services/communityStore.js";
import { logUpTo, nextStop, prevStop, replayStops, secondsLeft, turnStop } from "../services/battleReplay.js";
import { claimTimeout, expireStreakGame, rememberBattle } from "../services/battleWatch.js";
import { BattleLists, ReplayBar, downloadReplay, replayKey } from "./battle/Replay.jsx";
import { FoeSix, MonCard, PickDock, TeamInfo, TeamPick, ownCards, seenCards } from "./battle/Sets.jsx";
import { StreakEnd, StreakOpen, StreakStake, floorCall } from "./battle/Streak.jsx";
import { gameWords, streakFloor } from "../services/streak.js";
import { LiveCard, LiveHall, useLabels, useLiveBoards } from "./battle/Live.jsx";

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
// a random party is kept by its id too (random:m-c), so the waiting screen says what was brought instead of standing empty
const openTeam = id => { const kept = openTeams()[id]; return readSavedTeams().find(t => t.id === kept) || (String(kept).startsWith("random:") ? randomTeams([kept.slice(7)])[0] : null); };

export default function BattlePage({ flash: say, go }) {
  const params = new URLSearchParams(window.location.search);
  const [id, setId] = useState(() => params.get("id"));
  /* a shared replay of a battle with the computer (?replay=…) is state like the battle's id: read from the address only once, it
     changed nothing when 새 배틀 left it, so the page never moved (2026-11-07, the user: "새 배틀 버튼을 누르면 아무 작동도 안 해") */
  const [replay, setReplay] = useState(() => params.get("replay"));
  const official = params.get("event") && params.get("match") ? { eventId: params.get("event"), nodeKey: params.get("match") } : null;
  /* the computer's room opens only on a battle this device holds: a link to it (?cpu=1) shared, opened on another device or after the
     battle was cleared comes to the battle page instead of a page with nothing on it */
  const [cpu, setCpu] = useState(() => {
    if (params.get("cpu") !== "1") return false;
    const kept = readCpuBattle();
    if (kept?.start || kept?.inputLog) return true;
    try { window.history.replaceState(window.history.state, "", "?view=battle"); } catch { /* the address keeps ?cpu=1 */ }
    return false;
  });
  // 다시하기 with the computer starts the room over with a new battle
  const [cpuRound, setCpuRound] = useState(0);
  const res = useResources();
  // next: a battle's id, CPU_ROOM for the battle with the computer, null for the battle page; code: a code room's four digits
  // tab: the battle page's tab to come back to (연승 순위 from a game of a run opens 연승 도전)
  const open = useCallback((next, code, tab) => {
    const url = new URL(window.location.href);
    url.search = next === CPU_ROOM ? "view=battle&cpu=1" : next ? `view=battle&id=${encodeURIComponent(next)}${code ? `&code=${code}` : ""}` : `view=battle${tab ? `&tab=${tab}` : ""}`;
    pushHistory({ view: "battle" }, url);
    moved.current = true;
    setCpu(next === CPU_ROOM);
    setId(next === CPU_ROOM ? null : next);
    setReplay(null);
  }, []);
  /* the new screen starts at its top, as a page does, before its first paint (on a phone 배틀 시작 stands low, and the room opened
     scrolled down to the footer) */
  const moved = useRef(false);
  useLayoutEffect(() => { if (moved.current) { moved.current = false; window.scrollTo(0, 0); } }, [cpu, id, replay, cpuRound]);
  // the stage's first paintings are made in idle moments while the page waits for its data (stageFx prewarm), not as a battle opens
  useEffect(() => { prewarm(); }, []);
  if (!res) return <Loader />;
  if (res.error) return <Empty title="배틀을 준비하지 못했습니다." desc="잠시 뒤 다시 시도해 주세요." />;
  // a replay's link may open it at a turn and from a side (?turn=5&side=p2)
  if (cpu) return <RoomGuard key={`cpu${cpuRound}`}><CpuRoom res={res} say={say} go={go} onLeave={() => open(null)} onRestart={() => { moved.current = true; setCpuRound(n => n + 1); }} /></RoomGuard>;
  if (replay) return <RoomGuard key={replay}><CpuReplay id={replay} res={res} say={say} go={go} onLeave={() => open(null)} start={{ turn: params.get("turn"), side: params.get("side") }} /></RoomGuard>;
  if (id) return <RoomGuard key={id}><BattleRoom id={id} res={res} say={say} go={go} onLeave={() => open(null)} onOpen={open} code={params.get("code")} start={{ turn: params.get("turn"), side: params.get("side") }} /></RoomGuard>;
  if (official) return <OfficialSeat {...official} res={res} onOpen={open} />;
  return <BattleOpen res={res} onOpen={open} go={go} preset={params.get("team")} />;
}

/* a battle that fails to draw stands up again by itself: everything it shows is read again from the server, so starting the room
   over is what a reload does, without the error screen in between. Only a failure that keeps coming back (four in 15 seconds) is
   shown. The last error is kept on this device (sessionStorage ypl-battle:last-error) so a report can name its cause. */
const LAST_ERROR_KEY = "ypl-battle:last-error";
class RoomGuard extends React.Component {
  state = { failed: false, round: 0, gaveUp: false };
  recent = [];
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) {
    console.error("battle room", error, info?.componentStack);
    try { sessionStorage.setItem(LAST_ERROR_KEY, JSON.stringify({ at: new Date().toISOString(), error: String(error?.stack || error).slice(0, 2000), where: String(info?.componentStack || "").slice(0, 2000) })); } catch { /* 남기지 못해도 화면은 다시 선다 */ }
    const now = Date.now();
    this.recent = [...this.recent.filter(t => now - t < 15000), now];
    if (this.recent.length > 3) this.setState({ gaveUp: true });
    else this.setState(s => ({ failed: false, round: s.round + 1 }));
  }
  render() {
    if (this.state.gaveUp) return <ErrorNote action="새로고침" onRetry={() => window.location.reload()}>배틀 화면을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</ErrorNote>;
    if (this.state.failed) return <Loader />;
    return <React.Fragment key={this.state.round}>{this.props.children}</React.Fragment>;
  }
}

/* 저장한 팀: 팀 이름과 규정, 그리고 여섯을 그림으로(DESIGN.md "Where a Pokémon stands": 파티 목록은 이름 줄이 아니라 그림). 고른 팀은 반전한다. */
function TeamRows({ teams, value, onChange, res }) {
  return <div className="stack bt-teams" role="radiogroup" aria-label="팀">
    {teams.map(team => {
      const on = team.id === value;
      const reg = REGULATIONS[team.regulationId] || team.regulationId;
      const said = `${team.name}, ${reg}, ${team.members.map(m => res.text.pokedex[m.pokemonId] || m.pokemonName).join(", ")}`;
      return <label key={team.id} className={"bt-team " + (on ? "inv" : "pn")}>
        <input type="radio" className="sr-only" name="battle-team" checked={on} onChange={() => onChange(team.id)} aria-label={said} />
        <span className="bt-team-head"><b className="t15">{team.name}</b><span className="t12 reg dim">{reg}</span>{on && <Icon n="check" size={20} />}</span>
        <span className="bt-team-six" aria-hidden="true">{team.members.map((m, i) => <span key={i} className="stand"><i className="floor" /><Mon src={spriteUrl(m.pokemonName)} loading="lazy" onError={onSpriteError()} /></span>)}</span>
      </label>;
    })}
  </div>;
}

/* a random party (a random battle): chosen like a team, drawn by the battle function when the battle opens */
const RANDOM = "random:";
const randomTeams = regs => regs.map(reg => ({ id: RANDOM + reg, name: "랜덤 파티", regulationId: reg, members: [], random: true }));
const sendTeam = (team, res) => (team.random ? "random" : showdownTeam(team, res.detail));
// the party a rematch brings: the saved team played with, as it is saved now, or a random party drawn again (also when the team is gone)
function rematchTeam(teamId, regulation, res) {
  const saved = teamId && !String(teamId).startsWith(RANDOM) ? readSavedTeams().find(t => t.id === teamId && t.regulationId === regulation) : null;
  return saved ? { id: saved.id, send: showdownTeam(saved, res.detail) } : { id: RANDOM + regulation, send: "random" };
}

/* 랜덤 파티 (2026-11-06): one panel of its own, apart from the saved teams, however many rules there are. The rule is a choice joined
   under it on the seam (M-C, M-B, ...); pressing the panel or a rule picks the random party of that rule. With one rule (a room's) the
   choice is not shown. The rule last picked is kept while the panel is not chosen, so picking it again brings the same rule back. */
function RandomPick({ regs, value, onChange }) {
  const chosen = String(value).startsWith(RANDOM) ? value.slice(RANDOM.length) : "";
  const [reg, setReg] = useState(chosen || regs[0]);
  useEffect(() => { if (chosen) setReg(chosen); }, [chosen]);
  const on = Boolean(chosen);
  const pick = r => { setReg(r); onChange(RANDOM + r); };
  return <div className="stack">
    <label className={"opt-row " + (on ? "inv" : "pn")}>
      <input type="radio" className="sr-only" name="battle-team" checked={on} onChange={() => pick(reg)} />
      <span className="opt-copy"><b className="t15">무작위 여섯 마리</b><span className="t12 reg opt-line">{REGULATIONS[reg] || reg} 규정</span></span>
      {on && <Icon n="check" size={20} />}
    </label>
    {regs.length > 1 && <div className="choice stack" role="radiogroup" aria-label="랜덤 파티 규정">
      {regs.map(r => <label key={r} className={"choice-opt " + (r === reg ? "inv" : "pn")}>
        <input type="radio" className="sr-only" name="battle-random-reg" checked={r === reg} onChange={() => pick(r)} />{REGULATIONS[r] || r}
      </label>)}
    </div>}
  </div>;
}

// the random party is always there, so a visitor with no saved team still sees a choice; this says where their own teams come from
function NoTeams() {
  return <p className="t12 dim bt-noteams">팀 빌더에서 저장한 팀이 여기에 나옵니다. <Button variant="link" href="?view=builder">팀 빌더 열기</Button></p>;
}
// the name is asked on the press, not by a key that will not press: an empty name focuses the field and says why
const NAME_MISSING = "이름을 입력해 주세요.";
const focusName = () => document.getElementById("bt-name")?.focus();

/* 배틀 전 화면(DESIGN.md "Battle", Opening and waiting, 2026-11-07 다시 설계). 배틀이 핵심이라 경기장이 주인공이다: 709에 배틀이 설
   모습 그대로의 경기장(상대의 줄, 고른 팀의 앞 포켓몬과 상대가 선 경기장, 내 이름을 쓰는 우리 줄과 여섯)이 서고 주 행동이 그 바로
   아래, 그 밑에 방 참가와 목록. 439에는 고르는 것(상대, 형식, 파티)이 같은 윗선에서 시작한다. 두 열은 페이지와 함께 스크롤한다.
   휴대폰은 경기장, 고르는 것, 목록 순서이고 주 행동은 아래에 붙는다. 여는 사람과 링크로 참가하는 사람이 같은 화면을 쓴다.
   foe는 참가하는 쪽에서 본 연 사람의 이름(없으면 foeHint를 흐리게), foeNote는 그 뒤의 흐린 말(컴퓨터의 난이도). */
function Lobby({ res, teams, teamId, setTeamId, teamLabel, name, setName, foe, foeHint = "링크로 참가", foeNote = "", foeLead = null, doubles, setup, action, tabs, before, after, onEnter }) {
  const team = teams.find(t => t.id === teamId);
  const saved = teams.some(t => !t.random);
  const random = Boolean(team?.random);
  const six = random ? [] : (team?.members || []).map(m => res.detail.pokedex[m.pokemonId]?.name || m.pokemonName);
  const leads = six.slice(0, doubles ? 2 : 1);
  const stageLabel = random ? "경기장, 랜덤 파티는 배틀이 열리면 정해집니다." : team ? `경기장, ${leads.map(species => nameOf(res, species)).join(", ")}` : "빈 경기장";
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      {tabs}
      {before}
      <div className="bt-lobby">
        <div className="bt-lobby-main">
          {/* the court for every party (2026-11-06, the user: one look for a random party and a saved team): a random party's leads are
              not drawn yet, so a light breathes on our floor where they will come out */}
          <LobbyArena res={res} foe={foe || foeHint} foeMuted={!foe} foeNote={foeNote} six={six}
            ours={<input id="bt-name" className="bt-name" aria-label="내 이름" value={name} maxLength={20} autoComplete="nickname" enterKeyHint="go" placeholder="내 이름"
              onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) onEnter?.(); }} />}>
            <LobbyStage leads={leads} doubles={doubles} random={random} foeLead={foeLead} label={`${stageLabel}${foeLead ? `, 상대 ${nameOf(res, foeLead)}` : ""}`} />
          </LobbyArena>
          {action}
          {after && <div className="bt-after">{after}</div>}
        </div>
        <div className="bt-lobby-set">
          {setup}
          <div className="q"><span className="q-label t12 dim">랜덤 파티</span><RandomPick regs={teams.filter(t => t.random).map(t => t.regulationId)} value={teamId} onChange={setTeamId} /></div>
          <div className="q"><span className="q-label t12 dim">{teamLabel}</span>{saved ? <TeamRows teams={teams.filter(t => !t.random)} value={teamId} onChange={setTeamId} res={res} /> : <NoTeams />}</div>
        </div>
      </div>
    </div>
  );
}

// what the battle function refused, with the Pokémon it names in Korean (기술이 하나도 없는 포켓몬(Garchomp) → 한카리아스)
const failText = (e, res) => {
  const problem = e.problems?.[0];
  if (!problem) return e.message;
  return `${e.message} ${res ? problem.replace(/포켓몬\(([^)]+)\)/, (_, species) => `포켓몬(${nameOf(res, species)})`) : problem}`;
};
/* ---------- the battle with the computer (src/services/battleCpu.js): the engine and the computer run in a worker on this device ----------
   Nothing goes to the server while it is played. The battle is kept here as its input log (the seed and every choice), so it comes
   back as it was after a reload: the worker plays the log again. A new battle with the computer replaces the one kept. Once it has
   ended, its input log alone is sent to be kept for the computer to learn from (docs/db/cpu_battles.sql). */
const CPU_ROOM = "cpu";
const CPU_KEY = "ypl-battle:cpu:v1";
/* the battle is held in memory too: where the browser cannot keep it (a private window, storage full), the battle just started still
   opens, and only a reload loses it (feedback 2026-11-06: "배틀하고 싶어도 배틀 창이 안 뜬다") */
let cpuHeld = null;
function readCpuBattle() { try { return JSON.parse(localStorage.getItem(CPU_KEY) || "null") || cpuHeld; } catch { return cpuHeld; } }
function keepCpuBattle(next) { cpuHeld = next; try { localStorage.setItem(CPU_KEY, JSON.stringify(next)); } catch { /* 이 화면을 닫으면 이어서 할 수 없다 */ } }

/* the computer's worker. The lobby's 배틀 시작 starts one before its going in plays, so the engine loads while the court goes dark and the
   team preview stands as the lamps go down, not after a blank moment; the room takes it once */
const cpuWorker = () => new Worker(new URL("./battle/cpu.worker.js", import.meta.url), { type: "module" });
let earlyWorker = null;
/* the battle it was started with, asked while the court goes dark: the room takes this answer instead of asking again, and the parties'
   pictures are taken before the team preview lights (2026-11-07, the user: the party's pictures came in a moment after the screen) */
let earlyStart = null;
function startEarly(w, start) {
  return new Promise((resolve, reject) => {
    const take = ({ data }) => {
      if (data.id !== 0) return;
      w.removeEventListener("message", take);
      if (data.ok) resolve(data); else reject(Object.assign(new Error(data.error), { problems: data.problems }));
    };
    w.addEventListener("message", take);
    w.postMessage({ id: 0, type: "start", ...start });
  });
}

/* ---------- going into a battle (DESIGN.md "Battle", Going in) ----------
   The court's Pokémon are called back and its lamps go down (goIn) while what the next screen needs is read: the battle's first screen
   and both parties' pictures, decoded before it lights, so no picture comes in after the screen has (2026-11-07). The room then opens
   on what was read instead of on its loader. cap: the most the pictures may hold the page, on a slow connection. */
const primed = new Map();
export async function preloadSprites(species, cap = 2000) {
  const urls = [...new Set(species.filter(Boolean).map(s => spriteUrl(s)))];
  const all = Promise.all(urls.map(url => { const img = new Image(); img.src = url; return img.decode().catch(() => {}); }));
  await Promise.race([all, new Promise(resolve => setTimeout(resolve, cap))]);
}
// the species a team preview shows: our party from the request, and both sides' as the preview lines name them
const partySpecies = (row, view) => [
  ...(view?.request?.side?.pokemon || []).map(p => String(p.details).split(", ")[0]),
  ...[...String(row?.spectator_log || "").matchAll(/^\|poke\|p[12]\|([^,|]+)/gm)].map(m => m[1]),
];
export async function enterBattle(id, dark) {
  // a watcher going into a run's next game has no seat there: the row is all it reads
  const ready = Promise.all([readBattleRow(id), readSeat(id) ? viewBattle(id) : null]).then(async ([row, view]) => {
    await preloadSprites(partySpecies(row, view));
    return { row, view };
  });
  const [, got] = await Promise.all([dark, ready]);
  primed.set(id, got);
}
/* the court of the screen a key was pressed on, going dark, and the rest of that screen dimming as a page being left does (DESIGN.md
   "Motion", Page change), so the whole screen goes, not only its court. A refusal stands it up again (standUp) */
let dimmed = [];
export const goingIn = scope => {
  const page = document.querySelector(scope)?.closest(".bt-page");
  if (page) dimmed = dimAway([...page.querySelectorAll(".bt-lobby-set, .bt-lists, .bt-side")]);
  return goIn(document.querySelector(`${scope} .bs-stage`)).catch(() => {});
};
export const standUp = () => { dimmed.forEach(a => a.cancel()); dimmed = []; };
function CpuRoom({ res, say, go, onLeave, onRestart }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const worker = useRef(null);
  const calls = useRef(new Map());
  useEffect(() => {
    const kept = readCpuBattle();
    if (!kept?.start && !kept?.inputLog) { setError({ none: true }); return undefined; }
    const w = earlyWorker || cpuWorker();
    const early = earlyWorker ? earlyStart : null;
    earlyWorker = null;
    earlyStart = null;
    worker.current = w;
    let n = 0;
    const take = data => {
      const now = readCpuBattle() || {};
      const same = now.inputLog === data.inputLog;
      const kept = { teamId: now.teamId, level: now.level ?? now.start?.level, regulation: data.row.regulation, createdAt: data.row.created_at, endedBy: data.row.ended_by === "forfeit" ? "forfeit" : null, status: data.row.status, inputLog: data.inputLog, recorded: same && now.recorded, replayId: same ? now.replayId : undefined };
      keepCpuBattle(kept);
      setState({ row: data.row, view: data.view });
      // an ended battle goes to the server once; a failure is tried again the next time this battle is opened
      if (kept.status === "ended" && !kept.recorded) {
        recordCpuBattle(kept.inputLog).then(({ recorded, id }) => {
          if (recorded && readCpuBattle()?.inputLog === kept.inputLog) keepCpuBattle({ ...readCpuBattle(), recorded: true, replayId: id });
        }, () => { /* 다음에 이 배틀을 열 때 다시 보낸다 */ });
      }
    };
    w.onmessage = ({ data }) => {
      if (data.push) { take(data); return; }
      const call = calls.current.get(data.id);
      calls.current.delete(data.id);
      if (!call) return;
      if (data.ok) { take(data); call.resolve(data.view); }
      else call.reject(Object.assign(new Error(data.error), { problems: data.problems }));
    };
    w.onerror = () => setError({ message: "컴퓨터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요." });
    const ask = (type, args = {}) => new Promise((resolve, reject) => { const id = ++n; calls.current.set(id, { resolve, reject }); w.postMessage({ id, type, ...args }); });
    worker.current.ask = ask;
    (kept.inputLog ? ask("resume", { inputLog: kept.inputLog, regulation: kept.regulation, createdAt: kept.createdAt, endedBy: kept.endedBy, level: kept.level })
      : early ? early.then(data => { take(data); return data.view; }) : ask("start", kept.start))
      .catch(e => setError({ message: failText(e, res) }));
    return () => { w.terminate(); worker.current = null; };
  }, []);
  const api = useMemo(() => ({
    choose: (_, choice) => worker.current.ask("choose", { choice }),
    forfeit: () => worker.current.ask("forfeit"),
  }), []);
  /* 다시하기: a new battle with the computer at once, the same name, rule and format, the same saved team (a random party drawn
     again) and a new party for the computer, which is always drawn when a battle starts */
  /* it goes in as the lobby's 배틀 시작 does (DESIGN.md "Battle", Going in): the finished court's Pokémon are called back and its lamps
     go down while the next battle is drawn on a worker started on the press and its pictures are taken, so the team preview lights
     straight after, with no blank page and no loader between (2026-11-08, the user: it cut to the team preview with no animation) */
  const rematch = async () => {
    const kept = readCpuBattle() || {};
    const doubles = isDoubles(state.row.format_id);
    const team = rematchTeam(kept.teamId, state.row.regulation, res);
    const next = { regulation: state.row.regulation, battleFormat: doubles ? "doubles" : "singles", name: state.row.p1_name, team: team.send, level: kept.level };
    earlyWorker?.terminate();
    earlyWorker = cpuWorker();
    earlyStart = startEarly(earlyWorker, next);
    await Promise.all([goingIn(".bt-main"), earlyStart.then(d => preloadSprites(partySpecies(d.row, d.view)), () => {})]);
    keepCpuBattle({ start: next, teamId: team.id });
    onRestart();
  };
  if (error?.none) return <ErrorNote action="배틀 화면으로" onRetry={onLeave}>진행 중인 컴퓨터와의 배틀이 없습니다. 배틀 화면에서 새로 시작해 주세요.</ErrorNote>;
  if (error) return <ErrorNote action="돌아가기" onRetry={onLeave}>{error.message}</ErrorNote>;
  /* 리플레이 공유: the battle's record on the server is its replay's address. It is sent when the battle ends; one that has not gone
     yet (offline, or the site taking too many) is sent now. A recorded battle from before the address was kept is sent again,
     which the server takes as the same row and answers with its id */
  const replayId = async () => {
    const kept = readCpuBattle() || {};
    if (kept.replayId) return kept.replayId;
    const { recorded, id } = await recordCpuBattle(kept.inputLog);
    if (!recorded || !id) throw new Error("지금은 리플레이를 만들 수 없습니다. 잠시 뒤 다시 시도해 주세요.");
    if (readCpuBattle()?.inputLog === kept.inputLog) keepCpuBattle({ ...readCpuBattle(), recorded: true, replayId: id });
    return id;
  };
  if (!state) return <Loader />;
  return <Arena row={state.row} view={state.view} seat={{ side: "p1" }} res={res} onView={view => setState(s => ({ ...s, view }))} go={go} say={say} api={api} onLeave={onLeave} onRematch={rematch} replayId={replayId} />;
}

/* a shared replay of a battle with the computer (?view=battle&replay=…): read from the server, watched as any finished battle is */
function CpuReplay({ id, res, say, go, onLeave, start }) {
  const [row, setRow] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { readCpuReplay(id).then(setRow, e => setError(failText(e, res))); }, [id]);
  if (error) return <ErrorNote action="배틀 화면으로" onRetry={onLeave}>{error}</ErrorNote>;
  if (!row) return <Loader />;
  return <Arena row={row} seat={null} res={res} go={go} say={say} start={start} onLeave={onLeave} />;
}

/* ---------- rooms: open and code rooms stand as one list, newest first. An open room is joined at once; a code room's join screen
   asks for its four digits (2026-11-07, the user: no separate code field, a code room asks when it is pressed) ---------- */
/* the rooms waiting for someone, read again every 15 seconds while the page is in view (a room fills or opens while it stands);
   null until the first read */
function useRooms() {
  const [rooms, setRooms] = useState(null);
  useEffect(() => {
    let on = true;
    const load = () => listOpenRooms().then(list => on && setRooms(list));
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
    return () => { on = false; clearInterval(t); };
  }, []);
  return rooms;
}

/* 방 목록 (DESIGN.md "Battle", The rooms, 2026-11-07): every room waiting for someone, on a page of its own beside 배틀 열기, built
   for many rooms at once. The counts first (기다리는 방, 공개, 비밀), then the search by the opener's name with 방 만들기 beside it,
   the filters (규정, 형식, 종류) on one line, and the rooms as rows, newest first, three to a line on a wide screen, 30 a page.
   Pressing a room goes in; a secret one asks its code there. */
const HALL_PAGE = 30;
const ALL = "all";
const HALL_RULES = [[ALL, "전체"], ...Object.entries(REGULATIONS)];
const HALL_FORMATS = [[ALL, "전체"], ["singles", "싱글"], ["doubles", "더블"]];
const HALL_KINDS = [[ALL, "전체"], ["open", "공개"], ["code", "비밀"]];
const ago = (at, now) => { const m = Math.floor((now - Date.parse(at || "")) / 60000); return !(m >= 1) ? "방금" : `${m}분 전`; };
function RoomHall({ rooms, onOpen, onMake }) {
  const [q, setQ] = useState("");
  const [rule, setRule] = useState(ALL);
  const [format, setFormat] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [page, setPage] = useState(1);
  const now = useNow(true);
  const all = rooms || [];
  const word = q.trim().toLowerCase();
  const list = all.filter(r => (rule === ALL || r.regulation === rule) && (format === ALL || (format === "doubles") === isDoubles(r.format_id))
    && (kind === ALL || r.room === kind) && (!word || String(r.p1_name || "").toLowerCase().includes(word)));
  const pages = Math.max(1, Math.ceil(list.length / HALL_PAGE));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * HALL_PAGE, cur * HALL_PAGE);
  // a filter or a search starts the list from its first page
  const pick = set => v => { set(v); setPage(1); };
  const count = n => (rooms ? String(n) : null);
  const filtered = word || rule !== ALL || format !== ALL || kind !== ALL;
  return <>
    <div className="stack bt-hall-counts">
      <Counter label="기다리는 방" value={count(all.length)} cells={3} lamp={all.length > 0} />
      <Counter label="공개 방" value={count(all.filter(r => r.room === "open").length)} cells={3} />
      <Counter label="비밀 방" value={count(all.filter(r => r.room === "code").length)} cells={3} />
    </div>
    <div className="stack bt-hall-tools"><ListSearch q={q} setQ={pick(setQ)} placeholder="방을 연 사람" count={list.length} /><Button variant="main" icon="plus" onClick={onMake}>방 만들기</Button></div>
    <div className="bt-hall-filters">
      {[["규정", rule, setRule, HALL_RULES], ["형식", format, setFormat, HALL_FORMATS], ["종류", kind, setKind, HALL_KINDS]].map(([label, value, set, options]) =>
        <span key={label} className="bt-hall-filter"><span className="t12 dim" aria-hidden="true">{label}</span><Chips value={value} onChange={pick(set)} label={label} options={options} /></span>)}
    </div>
    {!rooms ? <Loader />
      : !list.length ? (filtered
        ? <Empty title="조건에 맞는 방이 없습니다." desc="검색어나 조건을 바꿔 보세요." />
        : <Empty title="기다리는 방이 없습니다." />)
      : <div className="stack bt-hall-list">
        {shown.map(r => { const secret = r.room === "code";
          return <Row key={r.id} title={`${r.p1_name}의 방`} line={`${REGULATIONS[r.regulation] || ""} ${isDoubles(r.format_id) ? "더블" : "싱글"}, ${ago(r.created_at, now)}`}
            value={<span className={"bt-hall-kind t12" + (secret ? "" : " dim")}>{secret && <Icon n="lock" size={16} />}{secret ? "비밀" : "공개"}</span>}
            onClick={() => onOpen(r.id)} label={`${r.p1_name}의 ${secret ? "비밀 방" : "공개 방"}에 참가`} />; })}
      </div>}
    {/* in its own box, so a turned page lights the list just before it, as the board's pager does */}
    <div><Pager page={cur} pages={pages} onGo={setPage} /></div>
  </>;
}

/* 상대: 컴퓨터(이 기기에서 바로, 난이도는 폴리곤, 폴리곤2, 폴리곤Z) 또는 방 만들기. 방은 하나의 선택이고, 공개 방(열린 방 목록에 선다)인지 비밀 방(숫자 4자리를 알려 준
   사람만)인지는 그 아래에서 고른다(2026-11-06, 따로 선 공개 방과 코드 방을 하나로). 두 방 모두 링크로도 들어온다. */
const OPPONENTS = [["cpu", "컴퓨터"], ["room", "방 만들기"]];
const ROOMS = [["open", "공개 방", "누구나 참가"], ["code", "비밀 방", "코드로 참가"]];
/* the battle page: 배틀 열기 (the lobby), 연승 도전 (docs/BATTLE_STREAK.md), 방 목록 (every room waiting) and 중계 (every battle
   being played, battle/Live.jsx) as page tabs; the tab is kept in the address (&tab=streak, &tab=rooms, &tab=live) */
const BATTLE_TABS = ["open", "streak", "rooms", "live"];
function BattleOpen({ res, onOpen, go, preset }) {
  const [tab, setTab] = useState(() => { const asked = new URLSearchParams(window.location.search).get("tab"); return BATTLE_TABS.includes(asked) ? asked : "open"; });
  const rooms = useRooms();
  const live = useLiveBoards();
  // 방 만들기 on the list opens the lobby with 방 만들기 chosen as the opponent
  const [firstFoe, setFirstFoe] = useState("cpu");
  const changeTab = t => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t !== "open") url.searchParams.set("tab", t); else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
  };
  const tabs = <div className="bt-tabs"><TabsLine value={tab} onChange={changeTab} label="배틀 화면" options={[["open", "배틀 열기"], ["streak", "연승 도전"], ["rooms", rooms?.length ? `방 목록 ${rooms.length}` : "방 목록"], ["live", live?.length ? `중계 ${live.length}` : "중계"]]} /></div>;
  if (tab === "live") return <div className="bt-page"><h1 className="t32">배틀</h1>{tabs}<LiveHall res={res} rows={live} onOpen={onOpen} /></div>;
  if (tab === "streak") return <StreakOpen res={res} onOpen={onOpen} go={go} tabs={tabs} enter={enterBattle} goingIn={goingIn} standUp={standUp} />;
  return tab === "rooms"
    ? <div className="bt-page"><h1 className="t32">배틀</h1>{tabs}<RoomHall rooms={rooms} onOpen={onOpen} onMake={() => { setFirstFoe("room"); changeTab("open"); }} /></div>
    : <BattleSetup res={res} onOpen={onOpen} preset={preset} tabs={tabs} firstFoe={firstFoe} />;
}
function BattleSetup({ res, onOpen, preset, tabs, firstFoe }) {
  const teams = useMemo(() => [...readSavedTeams().filter(team => REGULATIONS[team.regulationId]), ...randomTeams(Object.keys(REGULATIONS))], []);
  const [name, setName] = useState(rememberedName);
  const [format, setFormat] = useState("singles");
  const [foe, setFoe] = useState(firstFoe);
  const [room, setRoom] = useState("open");
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const saved = readCpuBattle();
  // the team builder's 이 팀으로 배틀 opens here with its team chosen
  const [teamId, setTeamId] = useState((teams.some(t => t.id === preset) ? preset : teams[0]?.id) || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const team = teams.find(t => t.id === teamId);
  const submit = async () => {
    if (busy || !team) return;
    if (!name.trim()) { setError(NAME_MISSING); focusName(); return; }
    const me = name.trim();
    if (foe === "cpu") {
      if (saved?.status === "active" && !(await siteConfirm({ title: "새 배틀을 시작할까요?", body: "진행 중인 컴퓨터와의 배틀은 남지 않습니다.", confirmLabel: "새로 시작" }))) return;
      rememberName(me);
      setBusy(true);
      earlyWorker?.terminate();
      earlyWorker = cpuWorker();
      const start = { regulation: team.regulationId, battleFormat: format, name: me, team: sendTeam(team, res), level };
      earlyStart = startEarly(earlyWorker, start);
      // going in (DESIGN.md "Battle", Going in): the court's Pokémon are called back and its lamps go down while the battle is drawn
      // and its pictures are taken, then the battle's screen lights
      await Promise.all([goingIn(".bt-lobby-main"), earlyStart.then(d => preloadSprites(partySpecies(d.row, d.view)), () => {})]);
      keepCpuBattle({ start, teamId: team.id });
      onOpen(CPU_ROOM);
      return;
    }
    setBusy(true); setError("");
    try {
      rememberName(me);
      // the key turns busy while the room is made; the waiting screen opens on it
      const made = await createBattle({ regulation: team.regulationId, battleFormat: format, name: me, team: sendTeam(team, res), room });
      keepOpenTeam(made.id, team.id);
      onOpen(made.id);
    } catch (e) {
      setError(failText(e, res));
      setBusy(false);
    }
  };
  const typeName = v => { setName(v); if (error === NAME_MISSING) setError(""); };
  const roomRow = ROOMS.find(([key]) => key === room);
  return <Lobby res={res} teams={teams} teamId={teamId} setTeamId={setTeamId} teamLabel="저장한 팀" name={name} setName={typeName} doubles={format === "doubles"} onEnter={submit}
    foe={foe === "cpu" ? "컴퓨터" : null} foeNote={foe === "cpu" ? levelOf(level).label : ""} foeHint={roomRow[2]} foeLead={foe === "cpu" ? levelOf(level).species : null}
    before={saved?.status === "active" && <Row className="bt-resume" title="컴퓨터와의 배틀" line={levelOf(saved.level ?? saved.start?.level).label} lamp="진행 중" onClick={() => onOpen(CPU_ROOM)} label="컴퓨터와의 배틀 이어서 하기" />}
    setup={<>
      <Question id="bt-foe" label="상대" group>
        <Choice name="bt-foe" options={OPPONENTS.map(([, label]) => label)} value={OPPONENTS.find(([key]) => key === foe)[1]} onChange={label => setFoe(OPPONENTS.find(([, l]) => l === label)[0])} />
      </Question>
      {foe === "cpu" && <Question id="bt-level" label="난이도" group>
        <Choice name="bt-level" options={LEVEL_IDS.map(id => LEVELS[id].label)} value={levelOf(level).label} onChange={label => setLevel(LEVEL_IDS.find(id => LEVELS[id].label === label))} />
      </Question>}
      {foe === "room" && <Question id="bt-room" label="공개" group>
        <Choice name="bt-room" options={ROOMS.map(([, label]) => label)} value={roomRow[1]} onChange={label => setRoom(ROOMS.find(([, l]) => l === label)[0])} />
      </Question>}
      <Question id="bt-format" label="형식" group>
        <Choice name="bt-format" options={FORMATS.map(([, label]) => label)} value={FORMATS.find(([key]) => key === format)[1]} onChange={label => setFormat(FORMATS.find(([, l]) => l === label)[0])} />
      </Question>
    </>}
    action={<Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <Button variant="main" onClick={submit} loading={busy} disabled={!team}>{foe === "cpu" ? "배틀 시작" : "방 만들기"}</Button>
    </Dock>}
    tabs={tabs} after={<div className="bt-lists"><BattleLists onOpen={onOpen} /></div>} />;
}

/* ---------- a battle: its version is asked on battlePollDelay's rhythm, and only a change of version reads the row ----------
   A player's own view comes back with each choice; the server is asked for it again only when the engine moved since. */
function BattleRoom({ id, res, say, go, onLeave, onOpen, start, code }) {
  // a battle gone into from a key opens on what was read as the court went dark (enterBattle), not on its loader
  const [boot] = useState(() => { const got = primed.get(id) || null; primed.delete(id); return got; });
  const [row, setRow] = useState(boot?.row);
  const [view, setView] = useState(boot?.view ?? null);
  const [seat, setSeat] = useState(() => readSeat(id));
  // how many screens without a seat are watching now (battleSignal.js presence); null until the channel says
  const [watchers, setWatchers] = useState(null);
  // undefined until read: a battle that is not there reads null, which must still count as a change (a cancelled or mistyped link)
  const version = useRef(boot?.row?.version);
  const rowRef = useRef(boot?.row);
  const viewRef = useRef(boot?.view ?? null);
  const viewRow = useRef(boot?.row ?? null); // the last row this device's view is known to be current with
  const movedAt = useRef(Date.now());
  const show = useCallback(next => { viewRef.current = next; movedAt.current = Date.now(); setView(next); }, []);
  /* a view comes from the poll and from our own choice. A poll's view that set out before a newer one, or while a choice was
     on its way, may be older than the choice's answer: it is dropped, and the version is left unread so the next tick reads again */
  const order = useRef({ n: 0, busy: 0 });
  // this device finds the battle again on the battle page (이 기기의 배틀), played or watched
  useEffect(() => { rememberBattle(id); }, [id]);
  /* hint: a signal said the battle moved (battleSignal.js). When the engine ran, a seat asks its own view at once, beside the row,
     instead of after it; not for a version its view already is (its own choice, answered with that view), nor while a choice is on
     its way. That view is used only if it is of the row's version or later; otherwise (the battle moved again meanwhile) it is asked again. */
  const refresh = useCallback(async (hint = null) => {
    const early = hint?.moved && readSeat(id) && rowRef.current?.status === "active" && !order.current.busy
      && (hint.version == null || viewRef.current?.version !== hint.version)
      ? { n: ++order.current.n, view: viewBattle(id).catch(() => null) } : null;
    const next = await readBattleRow(id);
    // the clock of the decision it waits on (docs/db/battle_timer.sql), read with the row; none before that SQL runs, and none unless active
    if (next) { if (next.status === "active") next.deadline_at ??= null; else delete next.deadline_at; }
    rowRef.current = next;
    setRow(next);
    if (next && readSeat(id) && next.status !== "waiting") {
      if (!playerViewIsCurrent(viewRef.current, viewRow.current, next)) {
        const n = early ? early.n : ++order.current.n;
        try {
          let fresh = early ? await early.view : null;
          if (!fresh || fresh.version < next.version) fresh = await viewBattle(id);
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
    /* a refusal because the battle moved on (the request answered is old, or the battle ended) brings the screen up to date at once,
       so the new choices or the result stand there instead of the old keys waiting for the next poll */
    const catchUp = run => async (...args) => {
      try { return await run(...args); }
      catch (e) {
        if (e.status === 409) { viewBattle(id).then(show, () => {}); refresh().catch(() => {}); }
        throw e;
      }
    };
    // timeout must be here too: without it the waiting player's screen never tells the server the other's clock ran out
    return { choose: catchUp(act(chooseInBattle)), forfeit: catchUp(act(forfeitBattle)), timeout: act(claimTimeout) };
  }, [id, show, refresh]);
  useEffect(() => {
    let stopped = false, busy = false, timer = null, queued = null;
    /* hint: a signal from the server (battleSignal.js) that the battle moved. It reads at once what a poll would read once it
       noticed; a signal that comes while a read is on its way is kept and read right after it. The polls stay as they were. */
    const tick = async (hint = null) => {
      if (busy) { if (hint) queued = { version: null, moved: Boolean(queued?.moved || hint.moved) }; return; }
      busy = true;
      clearTimeout(timer);
      try {
        // a player in a live battle keeps asking from a background tab too, so the tab's title can say when it is their turn
        if (document.visibilityState === "visible" || (rowRef.current?.status === "active" && readSeat(id))) {
          if (hint) { if (hint.version == null || hint.version !== version.current) { await refresh(hint); movedAt.current = Date.now(); } }
          // a finished official battle waits for its bracket line, which the server writes without moving the version
          else if (rowRef.current?.status === "ended") await refresh();
          else if ((await readBattleVersion(id)) !== version.current) { await refresh(); movedAt.current = Date.now(); }
        }
      } catch { /* 다음 차례에 다시 읽는다 */ }
      busy = false;
      if (stopped) return;
      if (queued) { const again = queued; queued = null; void tick(again); return; }
      if (rowRef.current?.status === "waiting") void takeNewBuild();
      const delay = battlePollDelay(rowRef.current, Date.now() - movedAt.current, Boolean(readSeat(id)));
      if (delay != null) timer = setTimeout(tick, delay);
      else unwatch(); // the battle will not change again: nothing more to hear
    };
    const unwatch = watchBattleSignal(id, hint => { if (!stopped) void tick(hint); }, { watcher: !readSeat(id), onWatchers: n => { if (!stopped) setWatchers(n); } });
    /* a battle page can stay open for an hour: when a newer build is out it takes it, at a moment that loses nothing (the tab coming
       back into view, or while it only waits for an opponent); the room is read again from the server, as any reload does */
    const takeNewBuild = force => checkBuild(force).then(newer => { if (newer && !stopped) window.location.reload(); });
    const onVisible = () => { if (document.visibilityState === "visible") { void takeNewBuild(true); void tick(); } };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => { stopped = true; clearTimeout(timer); unwatch(); document.removeEventListener("visibilitychange", onVisible); };
  }, [id, refresh]);
  /* while this seat owes a choice and its player thinks, the battle function is kept warm (warmBattle), so the choice lands on a
     worker that is already up. Every 10 seconds from each new request, only while the page is in view. */
  const owes = Boolean(seat && row?.status === "active" && view?.request && !view.request.wait && !view.chosen);
  useEffect(() => {
    if (!owes) return undefined;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void warmBattle(id); }, 10_000);
    return () => clearInterval(timer);
  }, [owes, id, view]);

  if (row === undefined) return <Loader />;
  if (row === null) return <Empty title="배틀을 찾을 수 없습니다." desc="링크가 맞는지 확인해 주세요." />;
  // a code room's link carries its code, so the one who opens it comes straight in
  const share = async () => { const how = await shareLink({ view: "battle", id, ...(seat?.code ? { code: seat.code } : {}) }, "YPL 배틀"); if (how === "copied") say?.("링크를 복사했습니다."); };
  if (row.status === "waiting") {
    const cancel = async () => {
      if (!(await siteConfirm({ title: "대기를 취소할까요?", body: "아직 아무도 참가하지 않아 남는 기록이 없습니다.", confirmLabel: "대기 취소" }))) return;
      try { await cancelBattle(id); say?.("대기를 취소했습니다."); onLeave(); }
      catch (e) { say?.(e.message); refresh(); }
    };
    /* only the opener waits (a room's opener is always p1): a joiner's seat stands a moment over the row still read as waiting, and
       the screen it pressed 참가 on stays, its key busy, until the battle has started (DESIGN.md "Battle", Going in) */
    if (seat?.side === "p1") return <Waiting row={row} res={res} team={openTeam(id)} code={seat.code} rematch={seat.rematch} onShare={share} onCancel={cancel} />;
    // an official match is entered from its own seat screen: the player's party PIN, never a builder team
    if (row.kind === "official") return <OfficialSeat res={res} eventId={row.event_id} nodeKey={row.source_node_key} onOpen={() => { setSeat(readSeat(id)); refresh(); }} />;
    return <Join row={row} res={res} code={code} onJoined={next => { setSeat(readSeat(id)); show(next); refresh(); }} onRefresh={() => refresh().catch(() => {})} />;
  }
  /* 다시하기 with a person (docs/db/battle_rematch.sql): the next battle opened, joined, or already this player's; the key is busy
     while the server answers, and the room opens on it */
  const rematch = !seat || row.kind !== "friendly" || !canRematch() ? null : async () => {
    const team = rematchTeam(openTeams()[id], row.regulation, res);
    try {
      const made = await rematchBattle(id, team.send);
      keepOpenTeam(made.id, team.id);
      // the room is made before the court goes down, so a refusal never leaves this screen dark
      await goingIn(".bt-main");
      onOpen(made.id);
    } catch (e) { say?.(failText(e, res)); }
  };
  // a game of a 연승 도전 run ends on the run's keys: 다음 판 or 다시 도전, and 나가기 back to the 연승 도전 tab
  const streak = seat && row.kind === "streak" ? { onOpen, onOut: () => onOpen(null, null, "streak"), enter: enterBattle, goingIn, standUp } : null;
  return <Arena row={row} view={view} seat={seat} res={res} onView={show} go={go} api={api} say={say} start={start} onRematch={rematch} onLeave={onLeave} streak={streak} watchers={watchers} onOpen={onOpen} />;
}

/* a battle screen that takes the place of the one pressed (the waiting room, the team preview) lights as a page does (DESIGN.md
   "Battle", Going in; "Motion"), not under a gate: 2026-11-07, the user found the 배틀 시작 popup made the start stutter */
const useLit = () => useLayoutEffect(() => { light(document.getElementById("ypl-main"), DUR.leave); }, []);

/* the opener waits (DESIGN.md "Battle", Opening and waiting): the lobby's screen, now set. What the opener needs stands first and
   large: a code room's four digits to read out, the time waited, and 링크 공유. Beside it (under it on a phone) the matchup with our
   name lit and the opponent's place waiting, and the court with our leads standing and a light breathing where theirs will come in.
   rematch: the room 다시하기 opened, which the other player enters by pressing 다시하기 too, so it shows no code. */
export function Waiting({ row, res, team, code, rematch = false, onShare, onCancel }) {
  useLit();
  const official = row.kind === "official";
  const doubles = isDoubles(row.format_id);
  const six = team?.random ? [] : (team?.members || []).map(m => res?.detail.pokedex[m.pokemonId]?.name || m.pokemonName);
  const leads = six.slice(0, doubles ? 2 : 1);
  const now = useNow(true);
  const since = Date.parse(row.created_at || "") || now;
  const waited = Math.max(0, Math.floor((now - since) / 1000));
  const clock = `${Math.min(99, Math.floor(waited / 60))}:${String(waited % 60).padStart(2, "0")}`;
  const rule = `${REGULATIONS[row.regulation] || ""} ${doubles ? "더블" : "싱글"}`;
  const kind = rematch ? "다시하기" : official ? "공식 경기" : row.room === "open" ? "공개 방" : row.room === "code" ? "비밀 방" : "친선 배틀";
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      <div className="bt-lobby">
        <div className="bt-lobby-main">
          {res && <LobbyArena res={res} foe="참가 대기" foeMuted waiting six={six} ours={<b className="bt-trainer">{row.p1_name || "나"}</b>}>
            <LobbyStage leads={leads} doubles={doubles} awaiting random={Boolean(team?.random)} label={`경기장, ${leads.length ? leads.map(s => nameOf(res, s)).join(", ") : "우리 쪽"}, 상대 쪽은 비어 있음`} />
          </LobbyArena>}
          <Dock><Button variant="main" onClick={onShare}>링크 공유</Button></Dock>
          <Button variant="link" className="bt-cancel" onClick={onCancel}>대기 취소</Button>
        </div>
        <div className="bt-lobby-set">
          <Row title={rematch ? "상대의 다시하기를 기다리는 중입니다." : "상대를 기다리는 중입니다."} line={`${rule} ${kind}`} lamp="참가 대기" />
          {/* a code room's four digits stand first and largest: they are what the opener reads out to the one coming in */}
          <div className="bt-wait-counters">
            {code && !rematch && <Counter label="방 코드" value={code} cells={4} h={84} />}
            <Counter label="기다린 시간" value={clock} cells={3} h={code && !rematch ? 84 : 52} />
          </div>
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
      // a team bout (teamBouts.js) belongs to its team match: the seat is a member of either team
      const bout = parseBoutKey(nodeKey);
      const node = graph && collectGraphMatches(graph).find(m => m.id === (bout ? bout.parent : nodeKey));
      if (!node) { if (alive) setMatch(null); return; }
      const { sp } = evalGraph(graph);
      const team = entryId => facts.bracket.participants?.find(p => p.entryId === entryId);
      const nameOf = entryId => team(entryId)?.name || "";
      const members = side => (team(sp(node[side]))?.memberIdentities || []).map(x => ({ side, player: x.playerId, label: x.name }));
      const label = [node.label, bout && (bout.ace ? "에이스 결정전" : `${bout.bout}경기`)].filter(Boolean).join(" ");
      if (alive) setMatch({ eventName: facts.event?.name || "", label, a: nameOf(sp(node.a)), b: nameOf(sp(node.b)), entries: [sp(node.a), sp(node.b)], decided: Boolean(node.winner),
        seats: bout ? [...members("a"), ...members("b")] : null });
    }).catch(() => alive && setMatch(null));
    return () => { alive = false; };
  }, [eventId, nodeKey]);
  return match;
}

function OfficialSeat({ eventId, nodeKey, res, onOpen }) {
  const match = useMatchPlayers(eventId, nodeKey);
  const [side, setSide] = useState("");
  const [player, setPlayer] = useState(""); // a team bout's member
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
  const ready = Boolean(side) && (!match.seats || Boolean(player)) && pin.length === 4;
  const submit = async () => {
    if (busy || !ready) return;
    setBusy(true); setError("");
    try { onOpen((await takeOfficialSeat({ eventId, nodeKey, side, pin, player })).id); }
    // a wrong PIN is typed again from empty, with the field ready for it
    catch (e) { setError(failText(e, res)); setBusy(false); if (e.status === 403 || e.status === 401) { setPin(""); document.getElementById("bt-pin")?.focus(); } }
  };
  const names = [match.a, match.b];
  return (
    <div className="bt-page">
      <h1 className="t32">공식 경기</h1>
      <Row title={`${match.a} 대 ${match.b}`} line={[match.eventName, match.label].filter(Boolean).join(", ")} lamp={open ? "진행 중" : null} />
      {match.decided
        ? <Empty title="이미 승자가 정해진 경기입니다." desc="대진표에서 결과를 확인해 주세요." />
        : <>
          {match.seats
            /* a team bout: each team's members under the team's name, one of them chosen across both */
            ? ["a", "b"].map(t => {
              const seats = match.seats.filter(x => x.side === t);
              return <Question key={t} id={`bt-side-${t}`} label={t === "a" ? match.a : match.b} group>
                <Choice name={`bt-side-${t}`} options={seats.map(x => x.label)} value={side === t ? seats.find(x => x.player === player)?.label || "" : ""}
                  onChange={label => { setSide(t); setPlayer(seats.find(x => x.label === label).player); }} />
              </Question>;
            })
            : <Question id="bt-side" label="선수" group>
              <Choice name="bt-side" options={names} value={side === "a" ? match.a : side === "b" ? match.b : ""} onChange={label => setSide(label === match.a ? "a" : "b")} />
            </Question>}
          <Question id="bt-pin" label="제출 비밀번호">
            <input id="bt-pin" className="in" type="password" inputMode="numeric" autoComplete="off" maxLength={4} enterKeyHint="go" value={pin}
              onChange={e => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)); if (error) setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") submit(); }} placeholder="숫자 4자리" />
          </Question>
          <Dock toast={error ? <Toast error>{error}</Toast> : null}>
            <Button variant="main" onClick={submit} loading={busy} disabled={!ready}>{open ? "경기 들어가기" : "경기 시작"}</Button>
          </Dock>
        </>}
      {open && <Button variant="link" href={battleHref(open.id)}>관전</Button>}
    </div>
  );
}

function Join({ row, res, code: linkCode, onJoined, onRefresh }) {
  const teams = useMemo(() => [...readSavedTeams().filter(team => team.regulationId === row.regulation), ...randomTeams([row.regulation])], [row.regulation]);
  const [name, setName] = useState(rememberedName);
  // a code room asks for its four digits, unless the link brought them
  const [code, setCode] = useState(() => (/^[0-9]{4}$/.test(linkCode || "") ? linkCode : ""));
  const askCode = row.room === "code" && !/^[0-9]{4}$/.test(linkCode || "");
  const [teamId, setTeamId] = useState(teams[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const team = teams.find(t => t.id === teamId);
  const doubles = isDoubles(row.format_id);
  const submit = async () => {
    if (busy || !team) return;
    if (!name.trim()) { setError(NAME_MISSING); focusName(); return; }
    if (askCode && code.length !== 4) { setError("방 코드 4자리를 입력해 주세요."); document.getElementById("bt-code")?.focus(); return; }
    setBusy(true); setError("");
    try {
      rememberName(name.trim());
      const joined = await joinBattle(row.id, { name: name.trim(), team: sendTeam(team, res), ...(row.room === "code" ? { code } : {}) });
      // kept, so 다시하기 brings the same team
      keepOpenTeam(row.id, team.id);
      onJoined(joined);
    } catch (e) {
      setError(failText(e, res));
      setBusy(false);
      // someone else took the seat first, or the opener cancelled: the room reads the battle again and shows what it is now
      if (e.status === 409 || e.status === 404) onRefresh?.();
    }
  };
  const typeName = v => { setName(v); if (error === NAME_MISSING) setError(""); };
  return <Lobby res={res} teams={teams} teamId={teamId} setTeamId={setTeamId} teamLabel={`저장한 팀 (${REGULATIONS[row.regulation]})`} name={name} setName={typeName}
    foe={row.p1_name} doubles={doubles} onEnter={submit}
    setup={<>
      <Row title={`${REGULATIONS[row.regulation]} ${doubles ? "더블" : "싱글"} 친선 배틀`} lamp="참가 대기" />
      {askCode && <Question id="bt-code" label="방 코드">
        <input id="bt-code" className="in" inputMode="numeric" autoComplete="off" maxLength={4} enterKeyHint="go" value={code} placeholder="숫자 4자리"
          onChange={e => { setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 4)); if (error) setError(""); }}
          onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(); }} />
      </Question>}
    </>}
    action={<Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <Button variant="main" onClick={submit} loading={busy} disabled={!team}>참가</Button>
    </Dock>} />;
}

/* ---------- the arena: the stage, its playback, the choices and the log (DESIGN.md "Battle", The stage) ---------- */
const SPEED_KEY = "ypl-battle:speed";
// slowest first, as the replay's < and > step through them; 느리게 is the golden ratio over 보통 (DESIGN.md "The golden law": time)
const SPEEDS = [[1.618, "느리게"], [1, "보통"], [.5, "빠르게"], [0, "건너뛰기"]];
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
/* a match screen lights as a page does, but the team preview is the moment a battle is met and arrives as a scene: the other side's six
   switch on one by one, then ours (motion.js lineup), while the column beside it lights as a page (2026-11-08, the user: going into a
   battle did not feel natural; the preview stood lit all at once after the court went dark) */
function useMatchLit() {
  useLayoutEffect(() => {
    const main = document.getElementById("ypl-main");
    const preview = main?.querySelector(".bt-match .bt-preview");
    if (!preview?.querySelector(".bt-card")) { light(main, DUR.leave); return; }
    light(main.querySelector(".bt-match .bt-side"), DUR.leave);
    // the other side's six are read from the log a frame or two after the preview mounts: ours keep their turn after the six places,
    // and the six take theirs when they are drawn
    const cells = () => [...preview.querySelectorAll(".bt-foe-cell")];
    lineup([preview.querySelector(".bt-pv-foe .bt-pv-title"), ...Array(6).fill(null)], [...preview.querySelectorAll(".bt-pv-head, .bt-card")]);
    const began = performance.now();
    let frame = 0;
    const look = () => {
      if (cells().length) { lineup([null, ...cells()], [], performance.now() - began); return; }
      if (performance.now() - began < 400) frame = requestAnimationFrame(look);
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, []);
}
export function Arena({ row, view, seat, res, onView, go, say, start, onLeave, onRematch, replayId, api = SERVER, streak = null, watchers = null, onOpen = null }) {
  useMatchLit();
  // a battle with the computer lives on this device only: there is no link to share and no replay page to point to
  const local = row.kind === "cpu" && Boolean(seat);
  const ended = row.status === "ended";
  /* a player sees from their own seat while the battle is played; anyone else, and a player too once it is over (its replay, as
     Showdown's replays let anyone), may watch from either side (시점), as a link may ask (?side=p2). Unchosen, a player stands on
     their seat, a spectator on p1 */
  const [pov, setPov] = useState(() => (start?.side === "p1" || start?.side === "p2" ? start.side : null));
  const perspective = seat && !ended ? seat.side : pov || seat?.side || "p1";
  // seen from one's own seat: the rows say 상대 and 나, and the party beside the stage is one's own whole set
  const ownView = Boolean(seat && perspective === seat.side);
  /* a 연승 도전 game lets go of its engine once it ends (streak_clear_secret), so its seat's view of it comes back with no log: that
     seat replays the public log, which ends on the result, so a won game opened again stands on its end with 다음 판 (2026-11-09: it
     stood on a dark empty court with no keys, and a game ended by the clock went dark under its player) */
  const log = seat ? (ended && view && !view.log ? row.spectator_log : view?.log) : row.spectator_log;
  const doubles = isDoubles(row.format_id);
  const [speed, setSpeedChoice] = useState(readSpeed);
  useEffect(() => { setStageSpeed(speed); try { localStorage.setItem(SPEED_KEY, String(speed)); } catch { /* the next visit plays at 보통 */ } }, [speed]);
  // the battle's sound (DESIGN.md "Battle", Sound): cries and effects on unless the viewer turns them off, remembered on the device
  const [sound, setSound] = useState(soundOn);
  const toggleSound = () => { setSoundOn(!sound); setSound(!sound); };
  /* the browser keeps a page silent until its first tap or key (cries.js wakes the sound then). A replay that plays by itself has
     had none, so it played silent (2026-11-07, the user: "리플레이에서는 소리가 안 나오네"): the replay bar's sound key shows it and
     wakes it */
  const [awake, setAwake] = useState(() => audio()?.state === "running");
  useEffect(() => {
    const c = audio();
    if (!c) return undefined;
    const f = () => setAwake(c.state === "running");
    f();
    c.addEventListener("statechange", f);
    return () => c.removeEventListener("statechange", f);
  }, []);
  const soundKey = () => { if (sound && !awake) audio()?.resume().catch(() => {}); else toggleSound(); };
  /* The replay (DESIGN.md "Battle", Replay): cue is how many lines of the finished log the stage shows, null all of them.
     A jump starts the stage again and catches up at once (epoch); a step on, or play, adds the next turn, which the stage plays. */
  const replay = useMemo(() => (ended && log ? replayStops(log) : null), [ended, log]);
  /* 중계 (DESIGN.md "Battle", 중계): one watching a battle still being played has the replay's keys too, over what has been played so
     far; its last place is 실시간, where the stage follows the battle as it moves. bar: the stops the keys walk, finished or live */
  const watching = !seat && !ended && row.kind !== "cpu";
  const liveStops = useMemo(() => (watching && log ? replayStops(log) : null), [watching, log]);
  const bar = replay || liveStops;
  /* a battle already over when the page opens stands where its replay begins from the very first frame: at a link's turn, or at its
     start, playing by itself (below). Read whole first and then sent back, it showed its last line ("쓰러졌다") before the opening
     (2026-11-07) */
  const [opening] = useState(() => (!replay ? null : start?.turn != null ? { at: turnStop(replay.stops, start.turn) } : local ? null : { at: replay.stops[0].at, play: true }));
  const [cue, setCue] = useState(() => opening?.at ?? null);
  const [epoch, setEpoch] = useState(0);
  const [autoplay, setAutoplay] = useState(() => Boolean(opening?.play));
  const tape = useStageTape(logUpTo(log, cue), res, perspective, epoch, !ended, ownView);
  const at = cue ?? bar?.total ?? 0;
  const jump = to => { setAutoplay(false); setCue(bar && to < bar.total ? to : null); setEpoch(e => e + 1); };
  const stepOn = () => { const to = bar && nextStop(bar.stops, at); if (to != null) setCue(to < bar.total ? to : null); };
  const play = () => {
    if (autoplay) { setAutoplay(false); return; }
    // a battle still being played has nothing to play at 실시간: the stage already follows it
    if (at >= bar.total && !ended) return;
    if (at >= bar.total) { setCue(bar.stops[0].at); setEpoch(e => e + 1); }
    setAutoplay(true);
  };
  /* playing: the next turn goes on once the stage has played this one and it has stood a beat (longer when slow). The team preview
     is not held: the leads come out at once, so a replay opens on the battle starting, not on a waiting screen */
  useEffect(() => {
    if (!autoplay || !bar || tape.playing || tape.read < Math.min(at, bar.total)) return undefined;
    if (at >= bar.total) { setAutoplay(false); return undefined; }
    // at the start the opening goes as soon as the stage has its pictures ready (Stage.jsx warming), not on a beat
    if (at <= bar.stops[0].at) { let on = true; tape.ready().then(() => { if (on) stepOn(); }); return () => { on = false; }; }
    const t = setTimeout(stepOn, TURN_BEAT * Math.max(1, speed));
    return () => clearTimeout(t);
  });
  /* a battle that was already over when the page opened (a shared replay, a battle looked up again) plays from its start by itself,
     as Showdown's replays do; a link's turn (?turn=5) opens it there instead. Its result waits for the replay to reach the end, as a
     battle watched live does, and then stays. A battle that ends in front of its players stands on its end, as before */
  const opened = useRef(Boolean(opening));
  const [revealed, setRevealed] = useState(() => !opening?.play);
  // a log that came after the page opened (a seat's view read later) goes to its start the same way, once
  useEffect(() => {
    if (opened.current || log == null) return;
    opened.current = true;
    if (!replay) return;
    if (start?.turn != null) jump(turnStop(replay.stops, start.turn));
    else if (!local) { jump(replay.stops[0].at); setAutoplay(true); setRevealed(false); }
  }, [log]);
  useEffect(() => { if (!revealed && at >= (replay?.total ?? 0) && !tape.playing && (tape.scene?.ended ?? true)) setRevealed(true); });
  // the replay's keyboard (replayKey in Replay.jsx), while a finished battle stands
  const keyed = useRef(null);
  keyed.current = action => {
    const { stops } = bar;
    if (action === "play") play();
    else if (action === "prev") jump(prevStop(stops, at) ?? stops[0].at);
    else if (action === "next") stepOn();
    else if (action === "first") jump(stops[0].at);
    else if (action === "last") jump(ended ? stops[stops.length - 1].at : Infinity);
    else if (action === "sound") soundKey();
    else {
      const i = SPEEDS.findIndex(([v]) => v === speed) + (action === "slower" ? -1 : 1);
      if (SPEEDS[i]) setSpeedChoice(SPEEDS[i][0]);
    }
  };
  const keysOn = Boolean(bar && bar.stops.length > 1 && (ended || watching));
  useEffect(() => {
    if (!keysOn) return undefined;
    const onKey = e => { const action = replayKey(e); if (action) { e.preventDefault(); keyed.current(action); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keysOn]);
  const turnTo = side => { setPov(side); setEpoch(e => e + 1); };
  // 중계: the other battles being played (read while this one is watched), and what each is, this one's head included
  const liveRows = useLiveBoards(watching && Boolean(onOpen));
  const others = (liveRows || []).filter(r => r.id !== row.id)
    .sort((a, b) => (b.event_id && b.event_id === row.event_id) - (a.event_id && a.event_id === row.event_id)).slice(0, 3);
  const labels = useLabels(useMemo(() => [row, ...others], [row.id, others.map(r => r.id).join()]));
  const scene = tape.scene;
  const shownTurn = tape.scene?.turn ?? row.turn ?? 0;
  const official = row.kind === "official";
  const bracketLine = !official || row.status !== "ended" ? null
    : row.applied_at ? "대진표에 반영했습니다."
    : row.apply_error ? `대진표에 넣지 못했습니다. 운영진이 확인합니다. (${row.apply_error})`
    // a team bout waits for the rest of its series (teamBouts.js); the series goes in once every bout is decided
    : parseBoutKey(row.source_node_key) ? (row.winner === "tie" ? "무승부입니다. 이 판은 다시 치릅니다." : "이 판의 결과를 남겼습니다.")
    : "대진표에 넣는 중입니다.";
  /* where the replay lives: a battle's own page, or a battle with the computer by its record on the server (CpuRoom makes sure of it
     first, so a battle just played on this device has an address too) */
  const replayWhere = async () => (replayId ? { replay: await replayId() } : row.kind === "cpu" ? { replay: row.id } : { id: row.id });
  const shareToBoard = async () => {
    let where;
    try { where = await replayWhere(); } catch (e) { say?.(e.message); return; }
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ view: "battle", ...where }).toString();
    try { sessionStorage.setItem(BOARD_DRAFT_KEY, JSON.stringify({ title: `${row.p1_name} 대 ${row.p2_name} 배틀`, body: `리플레이: ${url.href}` })); } catch { /* the board opens empty */ }
    go?.("board");
  };
  const [ask, setAsk] = useState("");
  const [chosenSay, setChosenSay] = useState("");
  const [error, setError] = useState("");
  // the result waits for the stage: a battle that ended while its last turn still plays does not tell its end before the stage does;
  // a replay already knows it, so stepping through one never moves the page
  // held: the page is leaving for the next battle and its replay was put at the end (settle below), so the result stays where it is
  const [held, setHeld] = useState(false);
  const shownEnded = ended && (held || cue != null || (tape.scene?.ended ?? true));
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
  // the clock's last ten seconds tick for the one who has to choose, sharper in the last three
  useEffect(() => { if (choosing && left > 0 && left <= 10) sfx("tick", { n: left }); }, [left, choosing]);
  useEffect(() => {
    if (left !== 0 || !waiting || !api.timeout || Date.now() - claimed.current < 5000) return;
    claimed.current = Date.now();
    api.timeout(row.id).then(next => next && onView(next), () => { /* not yet by the server's clock: asked again in a moment */ });
  }, [left, waiting, now]);
  /* a run's game: its player owes every choice (the computer answers inside the player's request), so no one waited to tell the
     server, and a game left by its player stood on 중계 forever. Whoever has it open, its player or a watcher, tells it (2026-11-09) */
  useEffect(() => {
    if (left !== 0 || row.kind !== "streak" || Date.now() - claimed.current < 5000) return;
    claimed.current = Date.now();
    expireStreakGame(row.id).catch(() => { /* not yet by the server's clock: asked again in a moment */ });
  }, [left, now]);
  // a link to where the replay stands, and from the side being watched
  const shareHere = async () => {
    const extra = { ...(cue != null ? { turn: String(shownTurn) } : {}), ...(!ownView && perspective !== "p1" ? { side: perspective } : {}) };
    let where;
    try { where = await replayWhere(); } catch (e) { say?.(e.message); return; }
    const how = await shareLink({ view: "battle", ...where, ...extra }, "YPL 배틀");
    if (how === "copied") say?.("링크를 복사했습니다.");
  };
  /* the end, said in the message box once the stage has played it: a battle that ended by a forfeit or the clock leaves no line of
     its own in the log, so without this the box would keep saying the last blow */
  const winnerName = names[row.winner], loserName = names[other(row.winner || "p1")];
  const endSay = !(ended && cue == null && !autoplay && !tape.playing && scene?.ended) ? ""
    : row.ended_by === "void" ? "이 배틀은 무효가 되었다."
    : row.winner === "tie" || !winnerName ? "승부가 나지 않았다."
    : row.ended_by === "forfeit" ? `${josa(loserName, "subject")} 기권했다. ${winnerName}의 승리!`
    : row.ended_by === "timeout" ? `${loserName}의 시간이 다 되었다. ${winnerName}의 승리!`
    : `${winnerName}의 승리!`;
  // the message box: the game's question while we choose, what we chose while the other player chooses
  const boxAsk = choosing ? ask : waiting && !tape.playing && chosenSay ? chosenSay : endSay;
  // a player's turn while the tab is in the background shows on the tab itself
  useEffect(() => {
    if (!choosing) return undefined;
    const base = document.title;
    const mark = () => { document.title = document.hidden ? `선택할 차례 | ${base}` : base; };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => { document.removeEventListener("visibilitychange", mark); document.title = base; };
  }, [choosing]);
  // closing the tab mid-battle runs the clock out: the browser asks first (a reload keeps the seat, so it only costs a question)
  const playing = Boolean(seat) && !ended && !local; // a battle with the computer comes back after a reload as it was
  useEffect(() => {
    if (!playing) return undefined;
    const ask = e => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [playing]);
  // the choices keep their place while the turn plays: the room they took stays, so nothing under them moves up and the page never jumps
  const consoleRef = useRef(null);
  useLayoutEffect(() => {
    const el = consoleRef.current;
    if (!el) return;
    if (choosing) { el.style.minHeight = ""; el.dataset.h = String(el.offsetHeight); }
    else el.style.minHeight = !ended && el.dataset.h ? `${el.dataset.h}px` : "";
  });
  /* the last moves the player was asked: while the turn plays and the other player chooses they stand where they were, locked, so the
     keys never leave and come back (feedback 2026-11-06: on a phone the console emptied each turn and the room under it jumped) */
  const lastAsked = useRef(null);
  if (choosing && request.active && !request.forceSwitch) lastAsked.current = request;
  // after a reload nothing was asked on this screen yet: the request standing now gives the keys (its moves off, without their PP)
  const lockedAsk = lastAsked.current || (request?.side && !request.teamPreview ? request : null);
  // our brought Pokémon, known before they come out (the strip shows the rest as shadows)
  const known = useRef([]);
  if (request?.side?.pokemon) known.current = request.side.pokemon.map(p => String(p.details).split(", ")[0]);
  const foe = other(perspective);
  // before the leads are sent out the stage is empty: the team preview stands in its place
  const started = Boolean(scene && [...scene.p1.active, ...scene.p2.active].some(Boolean));
  const nameAt = (side, slot) => { const m = scene?.[side]?.active?.[slot]; return m ? `${side === perspective ? "" : "상대 "}${nameOf(res, m.species)}` : "빈 자리"; };
  // the typing as it stands now (a Soak, a Roost, a Trick-or-Treat), not the species' own
  const typesAt = (side, slot) => { const m = scene?.[side]?.active?.[slot]; return m && !m.fainted ? currentTypes(res, m) : null; };
  const monAt = (side, slot) => scene?.[side]?.active?.[slot] || null;
  const foes = (scene?.[foe]?.active || []).map((m, slot) => (m && !m.fainted ? { slot, name: nameOf(res, m.species), types: currentTypes(res, m) } : null));
  /* what decides a move's own type beyond its entry: the weather and terrain, and whether Cloud Nine or Air Lock is out (our own
     abilities from the request, the foe's once announced) */
  const moveField = { weather: scene?.weather, fields: scene?.fields || [], suppressed: weatherSuppressed([...(request?.side?.pokemon || []).filter(p => p.active), ...(scene?.[foe]?.active || [])]) };
  // a player's own party as the engine brought it (moves, item, ability, stats): kept from the last request, so it stays open while the other player chooses
  const party = useRef(null);
  if (request?.side?.pokemon) party.current = request.side.pokemon;
  const pickCount = useRef(0);
  if (request?.teamPreview) pickCount.current = Math.min(request.maxChosenTeamSize || request.side.pokemon.length, request.side.pokemon.length);
  /* the six the team preview offered: the picks are places in it. The request after 선출 확정 holds only the ones brought, so the
     preview read against it found no Pokémon at a place past the third (2026-11-06: picking a fourth, fifth or sixth threw, the room
     guard drew the battle again, and a battle drawn again catches up without its opening, so the owner never saw it) */
  const previewParty = useRef(null);
  if (request?.teamPreview) previewParty.current = request.side.pokemon;
  // every move's full PP as the engine has told it for the Pokémon out, so a Pokémon on the bench shows what it has left too
  const maxpp = useRef({});
  for (const slot of request?.active || []) for (const m of slot.moves || []) if (m.maxpp != null) maxpp.current[m.id] = m.maxpp;
  const [picks, setPicks] = useState([]);
  const [partyOpen, setPartyOpen] = useState(false);
  const openParty = seat && party.current ? () => setPartyOpen(true) : null;
  const ownList = () => ownCards(res, party.current || [], {
    active: request?.active || [], maxpp: maxpp.current, field: moveField,
    used: Object.fromEntries((scene?.[perspective]?.roster || []).filter(m => m.name).map(m => [m.name, m.ppUsed])),
  });
  // the party beside the stage: a player reads the foe's shown set and their own whole one; a spectator reads both as shown
  const infoSides = !scene ? [] : ownView
    ? [{ key: "foe", label: `${names[foe]}의 파티`, cards: seenCards(res, scene[foe].roster, moveField) }, { key: "own", label: "내 파티", cards: ownList() }]
    : [perspective, foe].map(side => ({ key: side, label: `${names[side]}의 파티`, cards: seenCards(res, scene[side].roster, moveField) }));
  // on a wide screen the match takes the whole window: the page frame lets go of its 1200 for this view only
  useEffect(() => {
    const page = document.getElementById("ypl-main");
    page?.classList.add("page--battle");
    return () => page?.classList.remove("page--battle");
  }, []);
  const preview = tape.state.sides;
  const mon = species => ({ species, name: nameOf(res, species) });
  /* the end (DESIGN.md "Battle", After the battle): the result large, then what comes next as keys, 다시하기 first. On a wide screen
     the column beside the stage goes back to its top, so the result is in view. On a phone the page does not move (2026-11-06: it
     slid the stage up to the bar at every end, "화면이 움직일 이유가 없거든"): the result takes the moves' place right under the stage,
     and the stage was already brought into view when the last choice went */
  useEffect(() => {
    if (!shownEnded) return;
    document.querySelector(".bt-side")?.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
  }, [shownEnded]);
  // the other player asked for a rematch: the next battle waits with their name on it (docs/db/battle_rematch.sql)
  const [nextRow, setNextRow] = useState(null);
  useEffect(() => { if (row.rematch_id) readBattleRow(row.rematch_id).then(setNextRow, () => {}); }, [row.rematch_id]);
  const ownName = seat ? names[seat.side] : "";
  const offered = Boolean(seat && nextRow?.status === "waiting" && nextRow.p1_name !== ownName);
  /* going into the next battle from a finished one whose replay still plays (a reload opens an ended battle on its replay): the stage
     is put at its end first and the going in starts once it stands there, so the court goes dark on the battle's end and no replay
     keeps throwing behind it (2026-11-08) */
  const tapeNow = useRef(tape);
  tapeNow.current = tape;
  const settle = async () => {
    if (!autoplay && cue == null && !tape.playing) return;
    setHeld(true); setAutoplay(false); setCue(null); setEpoch(e => e + 1);
    const from = performance.now();
    do await new Promise(resolve => requestAnimationFrame(resolve));
    while ((tapeNow.current.playing || performance.now() - from < 50) && performance.now() - from < 800);
  };
  /* which game of a 연승 도전 run this is, as the wins before it: the seat keeps it from the game's opening, a watcher reads it from
     the run's games (runGames). It names the game in the head and lights its floor beside the turn, so the floor is read at every
     turn on a phone too, where the head keeps only one line (2026-11-09, the user: "매턴 몇번째 층인지 확인할 수 있게") */
  const [runAt, setRunAt] = useState(null);
  useEffect(() => {
    if (row.kind !== "streak" || seat?.game) return undefined;
    let on = true;
    runGames(row.run_id).then(ids => { const i = ids.indexOf(row.id); if (on && i >= 0) setRunAt(i); });
    return () => { on = false; };
  }, [row.id, row.run_id]);
  const gameAt = row.kind !== "streak" ? null : seat?.game ? seat.game - 1 : runAt;
  /* 중계 of a run (2026-11-09, the user: "연승 도전 같은 경우는 계속해서 볼 수 있게 해주고. 지기 전까지"): a won game stands on its
     end until its player opens the next one (다음 판), and the watcher goes into it as the player does, the court going dark and the
     floor called on it. A lost game ends the run and the watching with it; a run resting longer than ten minutes is let go */
  const following = !seat && ended && row.kind === "streak" && row.winner === "p1" && Boolean(row.run_id && onOpen);
  const [followed, setFollowed] = useState(false);
  useEffect(() => {
    if (!following || !shownEnded || !revealed) return undefined;
    let on = true, timer = null;
    const from = Date.now();
    const look = async () => {
      const ids = document.visibilityState === "visible" ? await runGames(row.run_id) : [];
      if (!on) return;
      const at = ids.indexOf(row.id), next = at >= 0 ? ids[at + 1] : null;
      if (next) {
        await settle();
        await enterBattle(next, floorCall(goingIn(".bt-main"), ".bt-main", at + 1)).catch(() => {});
        if (on) onOpen(next);
      } else if (Date.now() - from < 600_000) timer = setTimeout(look, 3000);
      else setFollowed(true);
    };
    void look();
    return () => { on = false; clearTimeout(timer); };
  }, [following, shownEnded, revealed, row.id]);
  // a watcher leaves for the 중계 tab, at any moment of the battle, not only at its end (2026-11-09)
  const leave = !seat && onOpen ? () => onOpen(null, null, "live") : onLeave;
  const [again, setAgain] = useState(false);
  const rematch = onRematch && (async () => { if (again) return; setAgain(true); try { await settle(); await onRematch(); } finally { setAgain(false); } });
  const endTitle = row.ended_by === "void" ? "무효" : row.winner === "tie" || !winnerName ? "무승부" : seat ? (row.winner === seat.side ? "승리" : "패배") : `${winnerName} 승리`;
  const endLine = [row.ended_by === "void" ? "운영진이 무효로 처리했습니다." : row.ended_by === "forfeit" ? `${loserName}의 기권으로 끝났습니다.` : row.ended_by === "timeout" ? `${loserName}의 시간이 다 되어 끝났습니다.` : `${names[perspective]} 대 ${names[foe]}, ${shownTurn}턴`, bracketLine].filter(Boolean).join(" ");
  /* one column on a phone: the head, the result, the stage (or the team preview), the replay, the choices, the party, the log.
     On a wide screen the stage stands on the left as large as the window allows, and everything else stands in a column beside it
     that scrolls on its own, so the stage never leaves the screen */
  return (
    <div className="bt-page bt-match" onPointerDown={e => { if (e.target.closest?.("button, summary, [role=button]")) sfx("select"); }}>
      <div className="bt-main">
        {/* a finished battle stands on its stage from the first moment, empty until the leads come out: its replay opens on the
            board saying who plays, never on the team preview (2026-11-07, the user: "처음에 선택 창이 미묘하게 보이는 문제") */}
        {started || ended
          ? <Stage scene={scene} stageRef={tape.stageRef} perspective={perspective} doubles={doubles} res={res} names={names} clock={left} mine={Boolean(seat && !waiting)} dark={Boolean(opening?.play)}
              said={tape.said} ask={boxAsk} known={ownView ? known.current : []} onParty={openParty} />
          : seat && previewParty.current
          ? <TeamPick res={res} foe={preview[foe].preview} foeName={names[foe]} pokemon={previewParty.current} count={pickCount.current}
              locked={!choosing || !request?.teamPreview} picks={picks} setPicks={setPicks} />
          : <div className="bt-preview">
              {[foe, perspective].map(side => <FoeSix key={side} res={res} species={preview[side].preview} title={`${names[side]}의 파티`} />)}
            </div>}
      </div>
      <div className="bt-side">
        {/* on a wide screen the team preview's sections open with a title; the column beside it opens with one too, so both start on one line */}
        {!started && !ended && <span className="bt-pv-title bt-side-title" aria-hidden="true">경기</span>}
        <div className={"pn bt-head" + (gameAt != null ? " floored" : "")}>
          {/* what this match is (an official one's event and round, a run's game) and, while it is played, how many are watching */}
          <span className="status t12">{ended ? "종료" : <><i className="lamp sig" aria-hidden="true" />{started ? "진행 중" : "선출 중"}</>}{official && <span className="dim">{labels[row.id] || "공식 경기"}</span>}{row.kind === "streak" && <span className="dim">{gameAt == null ? "연승 도전" : `연승 도전 ${gameWords(gameAt)}`}</span>}{!ended && watchers > 0 && <span className="dim bt-head-watch">{`관전 ${watchers}`}</span>}</span>
          <b className="bt-head-names">{`${names[perspective]} 대 ${names[foe]}`}</b>
          {/* the turn, announced in segment cells beside the names (it stood on the stadium's wall once, splitting the foe's plates) */}
          {gameAt != null && <span className="bt-head-turn bt-head-floor"><Seg value={String(streakFloor(gameAt))} h={32} cells={String(streakFloor(gameAt)).length} label={`${streakFloor(gameAt)}층`} /><span className="t15">층</span></span>}
          {started && <span className="bt-head-turn"><Seg value={String(Math.min(99, shownTurn)).padStart(2, "0")} h={32} cells={2} label={`${shownTurn}턴`} /><span className="t15">턴</span></span>}
        </div>
        {shownEnded && replay && replay.stops.length > 1 && <ReplayBar stops={replay.stops} at={at} playing={autoplay} onJump={jump} onStep={stepOn} onPlay={play}
          sound={sound} awake={awake} onSound={soundKey} />}
        {watching && started && liveStops && liveStops.stops.length > 1 && <ReplayBar stops={liveStops.stops} at={at} playing={autoplay} onJump={jump} onStep={stepOn} onPlay={play}
          sound={sound} awake={awake} onSound={soundKey} live={cue == null} onLive={() => jump(Infinity)} />}
        {shownEnded && <section className="bt-end" aria-label="배틀 결과">
          {/* a player reads their own result first (승리, 패배); anyone watching reads who won. A replay playing from its start
              keeps it until it reaches the end; the keys under it stand from the first, so the page can be left at any turn */}
          {revealed && <div className={"bt-end-head " + (seat && row.winner !== seat.side ? "pn" : "inv")}>
            <b className="bt-end-title">{endTitle}</b>
            <span className="bt-end-line">{endLine}</span>
          </div>}
          {offered && <div className="pn bt-end-offer"><i className="lamp" aria-hidden="true" /><span className="t15">{`${josa(names[foe], "subject")} 다시하기를 원합니다.`}</span></div>}
          {following && !followed && <div className="pn bt-waiting"><Busy h={32} /><span className="t15">다음 판을 기다리는 중…</span></div>}
          {streak ? <StreakEnd id={row.id} won={row.winner === seat?.side} {...streak} settle={settle} ours={(preview[perspective]?.preview || []).map(mon)} theirs={(preview[foe]?.preview || []).map(mon)} /> : (rematch || official || leave) && <Dock>
            <div className="bt-end-keys">
              {rematch ? <Button variant="main" icon="refresh" loading={again} onClick={rematch}>{offered ? "다시하기 수락" : "다시하기"}</Button>
                : official ? <Button variant="main" onClick={() => go?.("bracket", { eventId: row.event_id })}>대진표</Button> : null}
              {leave && <Button onClick={leave}>나가기</Button>}
            </div>
          </Dock>}
          {/* sharing what was just played, as keys under the two: the replay's link, and a board post that carries it. A battle with
              the computer has its replay too, by its record on the server (the file of the whole log is under 전체 기록) */}
          <div className="bt-end-more">
            <Button size="sm" onClick={shareHere}>리플레이 공유</Button>
            <Button size="sm" onClick={shareToBoard}>게시판에 공유</Button>
          </div>
        </section>}
        {!started && seat && previewParty.current && choosing && request?.teamPreview && <PickDock res={res} pokemon={previewParty.current} count={pickCount.current} picks={picks} setPicks={setPicks}
          onSend={send} toast={error ? <Toast error>{error}</Toast> : null} />}
        {/* the game asks only once the stage has played what came before: a choice never appears over a turn still on stage */}
        {seat && !ended && started && <div ref={consoleRef} className="bt-console">
          {choosing ? <Choices key={requestKey(view?.turn, request)} request={request} ghost={lastAsked.current} doubles={doubles} res={res} foes={foes} typesAt={typesAt} nameAt={nameAt} monAt={monAt}
            field={moveField} perspective={perspective} onSend={send} setAsk={setAsk} onAim={watch} toast={error ? <Toast error>{error}</Toast> : null} />
            : lockedAsk && <Choices key="locked" locked request={lockedAsk} doubles={doubles} res={res} foes={foes} typesAt={typesAt} nameAt={nameAt} monAt={monAt}
            field={moveField} perspective={perspective} onSend={send} setAsk={setAsk} />}
        </div>}
        {(waiting || (error && !request)) && <Dock toast={error && !choosing ? <Toast error>{error}</Toast> : null}>
          {waiting && <div className="pn bt-waiting"><Busy h={32} /><span className="t15">{local ? "컴퓨터가 계산하는 중…" : request?.teamPreview && view?.chosen ? "상대의 선출을 기다리는 중…" : "상대의 선택을 기다리는 중…"}</span></div>}
        </Dock>}
        {/* 기권 as a key of its own, right under the choices where the thumb is, in its own dark red so it is never taken for
            another key; it asks once before it goes (feedback 2026-11-06: the word at the page's foot was hard to find) */}
        {seat && !ended && <Button className="bt-forfeit" onClick={giveUp}>기권</Button>}
        {watching && leave && <Button className="bt-leave" onClick={leave}>나가기</Button>}
        {/* a game of a 연승 도전 run, for its player: what it has at stake, the streak riding on it and the floor (Streak.jsx). Under
            the choices and 기권, so on a phone it never pushes the moves away from the stage */}
        {row.kind === "streak" && seat && !ended && <StreakStake wins={seat.wins ?? 0} />}
        {/* a finished battle has its party beside the stage from the start: mounted with the first lead, it landed under the
            opening's board as a stop of its own (2026-11-07) */}
        {(started || (ended && scene)) && <TeamInfo key={ownView ? "seat" : `watch${perspective}`} res={res} sides={infoSides} />}
        <div className="bt-play">
          <Chips label="연출 속도" value={String(speed)} onChange={v => setSpeedChoice(Number(v))} options={SPEEDS.map(([v, label]) => [String(v), `연출 ${label}`])} />
          <Chips label="소리" value={sound ? "on" : ""} onChange={toggleSound} options={[["on", "소리"]]} />
        </div>
        {(!seat || ended) && <Chips label="시점" value={perspective} onChange={turnTo} options={[["p1", `${names.p1} 시점`], ["p2", `${names.p2} 시점`]]} />}
        {/* the other battles being played, so a watcher goes from one to the next without the lobby: the same event's first */}
        {others.length > 0 && <section className="bt-others" aria-labelledby="bt-others-h">
          <SectionHead id="bt-others-h" title="다른 중계" link="전체 보기" onLink={() => go?.("battle", { tab: "live" })} />
          <div className="stack">{others.map(r => <LiveCard key={r.id} res={res} row={r} label={labels[r.id]} onOpen={onOpen} />)}</div>
        </section>}
        {/* the whole log behind a key the size of a row, not a grey word */}
        <details className="bt-logbox">
          <summary className="pn bt-logkey"><span>전체 기록</span><Icon n="chev" size={20} /></summary>
          <Log lines={tape.lines} />
          {/* the whole log as a file, where the log itself is read */}
          {ended && log && <Button variant="link" className="bt-logsave" onClick={() => downloadReplay({ row, log, res, perspective, names })}>기록 내려받기</Button>}
        </details>
        <div className="bt-links">
          {!seat && !ended && !local && <Button variant="link" onClick={shareHere}>링크 공유</Button>}
          {official && !shownEnded && <Button variant="link" onClick={() => go?.("bracket", { eventId: row.event_id })}>대진표</Button>}
          <span className="t12 mute">배틀 엔진: Pokémon Showdown (MIT)</span>
        </div>
      </div>
      {partyOpen && party.current && <Modal title="내 파티" onClose={() => setPartyOpen(false)} className="wide">
        <div className="stack bt-cards sheet-cards">{ownList().map(({ key, ...c }) => <MonCard key={key} res={res} {...c} />)}</div>
      </Modal>}
    </div>
  );
}

/* ---------- choices: built from the request alone, as the engine asks ---------- */
const NEEDS_TARGET = { normal: "any", any: "any", adjacentFoe: "foe", adjacentAlly: "ally", adjacentAllyOrSelf: "allyOrSelf" };
const CATEGORY = { Physical: "물리", Special: "특수", Status: "변화" };
const EFF_WORD = { 4: "효과 매우 굉장 ×4", 2: "효과 굉장 ×2", .5: "효과 별로 ×½", .25: "효과 매우 별로 ×¼", 0: "효과 없음" };
const effClass = m => "bt-eff" + (m >= 2 ? " hard" : m === 0 ? " none" : "");

// each Mega Stone and the species it is for, from the Mega formes (Venusaurite → venusaur)
let stoneCache = null;
function megaStones(detail) {
  if (stoneCache?.detail !== detail) stoneCache = { detail, map: new Map(Object.values(detail?.pokedex || {}).filter(p => /^Mega/.test(p.forme) && p.requiredItem).map(p => [toID(p.requiredItem), toID(p.baseSpecies)])) };
  return stoneCache.map;
}
// the Mega forme a stone makes (Gardevoirite → Gardevoir-Mega), its ability and typing
const megaFormOf = (detail, item) => Object.values(detail?.pokedex || {}).find(p => /^Mega/.test(p.forme) && p.requiredItem && toID(p.requiredItem) === toID(item)) || null;

/* locked: the keys of a request already answered, shown dimmed while the turn plays; ghost: the last move request, whose keys stand
   locked over the bench in a forced switch, so the moves keep their place */
function Choices({ request, locked = false, ghost = null, doubles, res, foes, typesAt, nameAt, monAt, field, perspective, onSend, setAsk, onAim, toast }) {
  const side = request.side;
  const foeSide = side.id === "p1" ? "p2" : "p1";
  const [picks, setPicks] = useState([]);
  const [mega, setMega] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiming, setAiming] = useState(null);
  // Escape lets a move waiting for its target go, as tapping it again does
  useEffect(() => {
    if (aiming == null) return undefined;
    const off = e => { if (e.key === "Escape") setAiming(null); };
    window.addEventListener("keydown", off);
    return () => window.removeEventListener("keydown", off);
  }, [aiming]);
  // a new request mounts a new Choices (keyed by the turn and the request: the engine sets no rqid, a switch after a faint keeps the turn,
  // and a locked move can ask the very same thing two turns running), so nothing chosen for the last one carries over
  useEffect(() => () => { setAsk(""); }, []);
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
  // Revival Blessing: this place names a fainted Pokémon to bring back, not one to send in
  const reviving = !complete && revives(request, at);
  const question = request.teamPreview || complete ? ""
    : reviving ? "누구를 되살릴까?"
    : forced ? `${name(slots[at].details)} 대신 누구를 내보낼까?`
    : aimed ? `${name(slots[at].details)}의 ${moveName(aimed.id)}, 누구에게 쓸까?`
    : `${josa(name(slots[at].details), "topic")} 무엇을 할까?`;
  useEffect(() => { if (!locked) setAsk(question); }, [question, locked]);

  // the team preview is chosen on its own screen (TeamPick, battle/Sets.jsx)
  if (request.teamPreview) return null;

  const add = (text, said) => {
    const next = [...picks];
    while (next.length < at) next.push("pass");
    next[at] = text;
    next.said = [...(picks.said || []), said];
    setPicks(next);
    setAiming(null); setMega(false);
    // the last Pokémon's choice sends the turn at once; the ones before it wait for it
    let i = next.length; while (i < slots.length && passes(i)) i += 1;
    if (i >= slots.length) send(slots.map((_, k) => next[k] || "pass").join(", "), next.said.filter(Boolean).join(", "));
  };
  const reset = () => { setPicks([]); setMega(false); setAiming(null); };
  const switchedIn = new Set(picks.filter(p => p?.startsWith?.("switch")).map(p => Number(p.split(" ")[1]) - 1));

  /* sent (or on its way) or locked: the same keys stay where they stood, every one off, and the message box says what was chosen
     (feedback 2026-11-06: the keys gave way to a line of words and back each turn, so the spaces under them never held) */
  const frozen = locked || complete;
  const k = frozen ? (() => { let i = 0; while (i < slots.length - 1 && passes(i)) i += 1; return i; })() : at;
  const active = request.active?.[k];
  const who = name(slots[k].details);
  const trapped = !forced && active?.trapped;
  /* one Mega Evolution a battle. Its key stands over the moves from the first turn until it is spent (or its holder falls), off
     while the holder is not the one choosing, so it never comes and goes with each switch; in doubles, once the first takes it,
     the second's key is off */
  const stones = megaStones(res.detail);
  const holder = side.pokemon.find(p => stones.get(toID(p.item)) && toID(species(p.details)).startsWith(stones.get(toID(p.item))) && !String(p.condition).endsWith(" fnt"));
  const megaSpent = side.pokemon.some(p => /-Mega\b/.test(p.details));
  const megaTaken = picks.some(p => / mega$/.test(p || ""));
  const megaRow = active?.canMegaEvo || (holder && !megaSpent);
  const megaOpen = active?.canMegaEvo && !megaTaken && !frozen;
  // the bench: every brought Pokémon not out, one tap to send it in (Showdown keeps them under the moves)
  const bench = <Bench pokemon={side.pokemon} res={res} label={reviving ? "되살릴 포켓몬" : forced ? `${who} 대신 나갈 포켓몬` : trapped ? "교체할 수 없는 상태" : "교체"}
    pick={i => {
      if (frozen) return null;
      const mon = side.pokemon[i];
      const fainted = mon.condition.endsWith(" fnt");
      if (reviving) return !mon.active && fainted && !switchedIn.has(i) ? () => add(`switch ${i + 1}`, `${josa(name(mon.details), "object")} 되살린다`) : null;
      const free = !trapped && !mon.active && !fainted && !switchedIn.has(i);
      return free ? () => add(`switch ${i + 1}`, `${who} 대신 ${name(mon.details)}`) : null;
    }} />;
  /* the four keys, always four (a locked move, a recharge or Struggle asks one alone: the rest stand off beside it); off: all locked */
  const moveKeys = (entry, off) => <div className="stack bt-moves">
      {fourMoves(entry, slots[k]?.moves).map(({ move, i }) => {
        const data = res.detail.moves[move.id] || {};
        const type = typeOf(move);
        // every foe now out, in the order they stand; shown only when one of them is not ×1
        const marks = data.category && data.category !== "Status" ? foes.filter(Boolean).map(f => ({ f, m: effectiveness(type, f.types, move.id) })) : [];
        const shown = marks.some(x => x.m !== 1) ? marks : [];
        // two lines, every move alike, as a game's move key: the name and how it lands; its type, category and power, its accuracy and priority, and its PP
        const power = powerOf(move), moved = power !== (data.basePower || 0);
        const foot = [data.category !== "Status" && data.accuracy !== true && data.accuracy < 100 && `명중 ${data.accuracy}`,
          data.priority ? `우선도 ${data.priority > 0 ? "+" : ""}${data.priority}` : null, SPEED_POWER.has(move.id) && "스피드에 따라"].filter(Boolean).join(" ");
        return <button key={move.id} type="button" className={`bt-move type-${toID(type)}${aiming === i ? " on" : ""}${move.disabled ? " off" : ""}`} disabled={off || move.disabled || sending} onClick={() => choose(move, i)} aria-pressed={aiming === i}
          aria-label={`${moveName(move.id)}, ${res.text.types[type] || type}, ${CATEGORY[data.category] || ""}${power > 0 ? ` 위력 ${power}${moved && data.basePower > 0 ? `, 기본 ${data.basePower}` : ""}` : ""}, ${data.accuracy === true ? "필중" : `명중 ${data.accuracy}`}${move.pp != null ? `, PP ${move.pp} / ${move.maxpp}` : ""}${shown.map(x => `, ${doubles ? x.f.name + " " : ""}${EFF_WORD[x.m] || effLabel(x.m)}`).join("")}`}>
          <span className="bt-move-top">
            <b className="bt-move-name">{moveName(move.id)}</b>
            {shown.length > 0 && <span className="bt-effs" aria-hidden="true">{shown.map(x => <span key={x.f.slot} className={effClass(x.m)}>{effLabel(x.m)}</span>)}</span>}
          </span>
          <span className="bt-move-line" aria-hidden="true">
            <span className="bt-move-type">{res.text.types[type] || type}</span>
            {/* the power it goes out with now; lit when that is not its book power (feedback 2026-11-07: 어시스트파워, 웨더볼) */}
            <span className="bt-move-kind"><span>{CATEGORY[data.category] || ""}{power > 0 && !moved ? ` ${power}` : ""}</span>{power > 0 && moved && <b className="bt-move-pow">{power}</b>}{foot && <span>{foot}</span>}</span>
            {/* a move locked in (Outrage, a charging move) is asked without its PP */}
            <span className="bt-move-pp">{move.pp != null ? `${move.pp}/${move.maxpp}` : ""}</span>
          </span>
        </button>;
      })}
    </div>;
  /* the type a move goes out as for this Pokémon now (its ability, the weather, the terrain, its form: battleWords.js moveType); the key
     shows that type, its colour and its matchups */
  /* with 메가진화 checked the keys read as the Mega Pokémon will use them, its ability and typing (feedback 2026-11-07: a Mega with
     Pixilate kept its Normal moves Normal on the key) */
  const seen = monAt(side.id, k), megaForm = mega && megaFormOf(res.detail, slots[k].item);
  const user = { species: megaForm?.name || species(slots[k].details), ability: megaForm ? megaForm.abilities[0] : slots[k].ability, item: slots[k].item,
    types: megaForm ? megaForm.types : typesAt(side.id, k) || [], ...parseHP(slots[k].condition), boosts: seen?.boosts, volatiles: seen?.volatiles, hits: seen?.hits,
    fainted: side.pokemon.filter(p => String(p.condition).endsWith(" fnt")).length };
  const typeOf = move => moveType(move.id, res.detail.moves[move.id]?.type || "Normal", user, field);
  /* the power a move goes out with now (battleWords.js movePower): its user's HP, boosts and item, the weather and terrain, and, when
     one foe stands, that foe; Return and Frustration come with theirs in the request ("Return 102") */
  const lone = foes.filter(Boolean);
  const targetAt = (fieldSide, slot) => { const m = monAt(fieldSide, slot); return m && !m.fainted ? { ...m, types: currentTypes(res, m) } : null; };
  const powerOf = (move, target = lone.length === 1 ? targetAt(foeSide, lone[0].slot) : null) =>
    Number(/ (\d+)$/.exec(move.move || "")?.[1]) || movePower(move.id, res.detail.moves[move.id]?.basePower || 0, user, target, field);
  /* who a move can be aimed at (doubles): the places it reaches with someone standing there; an empty place is offered only when
     there is no one at all (Showdown's rule). null when it needs no target */
  const reach = (move, index) => {
    const want = doubles ? NEEDS_TARGET[move.target] : null;
    if (!want) return null;
    const data = res.detail.moves[move.id] || {}, type = typeOf(move), tail = mega ? " mega" : "";
    const label = `${who}${mega ? "(메가진화)" : ""}의 ${moveName(move.id)}`;
    const fits = (fieldSide, slot) => {
      const own = fieldSide === side.id;
      return want === "any" ? !(own && slot === at) : want === "foe" ? !own : want === "ally" ? own && slot !== at : own;
    };
    const standing = ["p1", "p2"].flatMap(s => [0, 1].filter(slot => fits(s, slot) && typesAt(s, slot)).map(slot => [s, slot]));
    const targeting = (fieldSide, slot) => {
      if (!fits(fieldSide, slot) || (standing.length && !typesAt(fieldSide, slot))) return null;
      const own = fieldSide === side.id;
      const types = typesAt(fieldSide, slot);
      const mark = types && data.category !== "Status" ? effectiveness(type, types, move.id) : null;
      // a power that turns on who it hits (로킥, 병상첨병) is said at each place
      const power = types ? powerOf(move, targetAt(fieldSide, slot)) : null;
      return { mark, power: power !== powerOf(move, null) ? power : null, onPick: () => add(`move ${index + 1} ${own ? -(slot + 1) : slot + 1}${tail}`, `${label}, ${nameAt(fieldSide, slot)}에게`) };
    };
    return { standing, targeting };
  };
  const choose = (move, index) => {
    const tail = mega ? " mega" : "";
    if (aiming === index) { setAiming(null); return; }
    const aim = reach(move, index);
    if (!aim) { add(`move ${index + 1}${tail}`, `${who}${mega ? "(메가진화)" : ""}의 ${moveName(move.id)}`); return; }
    // when only one is left (a lone foe for a move at foes, the partner for one at the ally), it goes there at once,
    // as the game does not ask a question with one answer
    if (aim.standing.length === 1) { aim.targeting(...aim.standing[0]).onPick(); return; }
    /* and when no one stands where it reaches (Helping Hand once the partner has fallen), it goes to its one empty place, where the
       game uses it and it fails. The picker drew that place as 빈 자리 with nothing to press, so the move could not be chosen, and a
       player left with only it could not choose at all (battle-fuzz, 2026-11-07) */
    if (!aim.standing.length) {
      const place = ["p1", "p2"].flatMap(s => [0, 1].map(slot => [s, slot])).find(([s, slot]) => aim.targeting(s, slot));
      if (place) { aim.targeting(...place).onPick(); return; }
    }
    // otherwise the moves give way to the targets, as Showdown and Champions ask: the field as it stands, foes over us
    setAiming(index);
    onAim?.();
  };
  /* Mega Evolution: a key the moves' width above them, set before a move is chosen, as the game asks for it first. Its emblem is
     the games' rainbow helix (public/brand/mega-evolution.png) as given; the key inverts while it is on */
  const megaKey = off => <button type="button" className={"bt-mega" + (mega ? " on" : "")} aria-pressed={mega} disabled={off} onClick={() => setMega(!mega)}>
      <img className="bt-mega-mark" src="/brand/mega-evolution.png" alt="" draggable="false" />
      <span className="bt-mega-say"><b>{`${active?.canMegaEvo || !holder ? who : name(holder.details)} 메가진화`}</b>{/* only why it cannot be pressed; on or off the key says by its own light (DESIGN.md "Composing a screen" 22) */}{
        mega || (active?.canMegaEvo && !megaTaken) ? null
        : <small>{active?.canMegaEvo ? "이번 턴에 이미 메가진화를 골랐습니다." : "나와 있을 때 켤 수 있습니다."}</small>}</span>
      <span className="bt-mega-tick" aria-hidden="true">{mega && <Icon n="check" size={20} />}</span>
    </button>;
  // a forced switch: the bench, under the last moves (and the Mega key) standing off where they were
  if (forced) return <div className="bt-choices">
    {megaRow && megaKey(true)}
    {moveKeys(ghost?.active?.[at] || null, true)}
    {bench}
    {picks.length > 0 && <div className="bt-tools"><Button variant="link" onClick={reset}>처음부터 다시 고르기</Button></div>}
    {toast && <Dock toast={toast} />}
  </div>;
  /* the target picker (doubles): the move keys give way to the field as the stage shows it, the foe's two over ours, each place its
     picture, name, HP and how the move lands there; a place the move cannot reach is muted; 돌아가기 brings the moves back
     (feedback 2026-11-06: rings drawn round the Pokémon on the stage read as dated) */
  if (aiming != null && aimed) {
    const aim = reach(aimed, aiming);
    const cell = (fieldSide, slot) => {
      const own = fieldSide === side.id, m = monAt(fieldSide, slot), t = aim?.targeting(fieldSide, slot);
      if (!m || m.fainted) return <div key={slot} className={"bt-target empty" + (own ? " own" : "")}><span className="t12 mute">빈 자리</span></div>;
      const hp = own ? `${m.hp}/${m.maxhp}` : `${Math.max(m.hp > 0 ? 1 : 0, Math.round(m.hp / (m.maxhp || 1) * 100))}%`;
      const nm = `${own ? "" : "상대 "}${nameOf(res, m.species)}`;
      return <button key={slot} type="button" className={"bt-target" + (own ? " own" : "")} disabled={!t || sending} onClick={t?.onPick}
        aria-label={`${nm}, HP ${hp}${t?.power ? `, 위력 ${t.power}` : ""}${t?.mark != null ? `, ${EFF_WORD[t.mark] || effLabel(t.mark)}` : ""}${own && slot === at ? ", 자신" : ""}`}>
        <img src={spriteUrl(m.species)} alt="" draggable="false" onError={onSpriteError()} />
        {/* the row says whose side it is (theirs over ours), so the name stands alone; the matchup sits by the HP */}
        <span className="bt-target-say"><b>{nameOf(res, m.species)}</b>
          <span className="bt-target-line">{own && slot === at ? "자신" : hp}{t?.power > 0 && <span className="bt-move-pow">{`위력 ${t.power}`}</span>}{t?.mark != null && <span className={effClass(t.mark)} aria-hidden="true">{effLabel(t.mark)}</span>}</span></span>
      </button>;
    };
    return <div className="bt-choices">
      <div className="bt-targets" role="group" aria-label={`${moveName(aimed.id)}의 대상`}>
        <div className="stack bt-target-row">{[0, 1].map(slot => cell(foeSide, slot))}</div>
        <div className="stack bt-target-row">{[0, 1].map(slot => cell(side.id, slot))}</div>
      </div>
      <Button onClick={() => setAiming(null)}>돌아가기</Button>
      {toast && <Dock toast={toast} />}
    </div>;
  }
  return <div className="bt-choices">
    {megaRow && megaKey(!megaOpen)}
    {moveKeys(active, frozen)}
    {picks.length > 0 && !frozen && <div className="bt-tools"><Button variant="link" onClick={reset}>처음부터 다시 고르기</Button></div>}
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
