/* 연승 도전 (docs/BATTLE_STREAK.md 8장, DESIGN.md "Layout and pages" 연승 도전): the battle page's tab, what a game of a run has at
   stake while it is played, and what it says when it ends. A run climbs floors of five games, the fifth the floor's
   gatekeeper, a Mega fixed for each floor (src/services/streak.js), drawn as five steps rising to it and the floors as a tower. The tab stands as the lobby stands (the arena with the computer the run meets next on its floor, the key
   under it), and beside it the run itself: its streak lit at 84, the floor it stands on, the floors it climbs, and the month's board.
   Its games are played as any server battle (BattleRoom), and the battle function answers as the computer; what a game's answer says
   of the run is kept with the seat (battleService.js). Going into a game is the lobby's going in: the court goes dark while the game
   and its pictures are read (BattlePage.jsx enterBattle), and the game's floor is called on the dark court before it lights. */
import React, { useEffect, useRef, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Icon from "../../components/common/Icon.jsx";
import Seg from "../../components/common/Seg.jsx";
import { Counter, Dock, Mon, Podium, Row, SectionHead, Toast } from "../../components/common/Board.jsx";
import StandTable from "../../components/common/StandTable.jsx";
import { siteConfirm } from "../../components/common/SiteDialog.jsx";
import { GoogleMark } from "../../components/layout/SiteHeader.jsx";
import { currentStreakGame, keepStreakStart, readBattleRow, readSeat, streakNextGame, warmBattle } from "../../services/battleService.js";
import { VISITOR_EVENT, myPlayerLink, readStreakBoard, signInWithGoogle, startStreakRun, visitorSignedIn } from "../../services/visitorAuth.js";
import { STREAK_STEP, floorGame, gameWords, gatekeeperOf, streakFloor, streakFresh, streakMaster, swapTier } from "../../services/streak.js";
import { DUR, climb } from "../../components/common/motion.js";
import { onSpriteError, spriteUrl } from "../../services/teamBuilderCore.js";
import { floorPlate } from "./stageFx.js";
import { LobbyArena, LobbyStage } from "./Stage.jsx";

// the board's months are the run's months in KST, as the database counts them: "2026-11-01"
const monthOf = back => {
  const kst = new Date(Date.now() + 9 * 3600e3);
  let y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1 - back;
  if (m < 1) { m += 12; y -= 1; }
  return { key: `${y}-${String(m).padStart(2, "0")}-01`, label: `${m}월` };
};
// the month's board, read once at a game's end to know whether the run is the account's best this month (null while read or when it cannot be)
function useBoard() {
  const [board, setBoard] = useState(null);
  useEffect(() => { let on = true; readStreakBoard().then(rows => on && setBoard(rows), () => {}); return () => { on = false; }; }, []);
  return board;
}

/* 연승 도전 shows no 난이도 anywhere (2026-11-09, the user: "난이도 표기 자체를 연승 도전에서는 없애자"): the computer still plays each
   floor at its own (streak.js streakLevel), but the screens say only the floor, its steps and its gatekeeper */

/* a floor's gatekeeper (streak.js GATEKEEPERS, 2026-11-09): a floor passed shows its Mega as it is, the floor stood on its Mega as a
   silhouette in the board's dim light, and a floor above, or one whose gatekeeper is drawn at random, a ?. The silhouette is the
   sprite's own shape as a mask, so it stands where the picture would, feet at the bottom of its box */
function Keeper({ floor, state }) {
  const keeper = gatekeeperOf(floor);
  if (state === "done" && keeper) return <Mon src={spriteUrl(keeper.form)} onError={onSpriteError()} />;
  if (state === "here" && keeper) {
    const mask = `url("${spriteUrl(keeper.form)}")`;
    return <i className="mon streak-shadow" aria-hidden="true" style={{ WebkitMaskImage: mask, maskImage: mask }} />;
  }
  return <i className="streak-unknown" aria-hidden="true">?</i>;
}

/* the steps of a floor as a glyph, for the battle's head and the floor's call on the stage: five bars rising, lit up to the game
   being played (the ones won half lit), the rest off, so a number beside it reads as a floor without the word 층 (2026-11-09, the
   user: "층이랑 턴이라고 텍스트로 명시하지 않더라도 직관적으로 사용자가 그 의미를 알아낼 수 있도록"). at: the game, 1 to 5 */
export function StairGlyph({ at }) {
  return <span className="streak-glyph" aria-hidden="true">
    {Array.from({ length: STREAK_STEP }, (_, i) => <i key={i} className={i + 1 < at ? "won" : i + 1 === at ? "here" : ""} />)}
  </span>;
}

/* a step of a floor (2026-11-09, the user: "진짜 층을 올라간다는 느낌을 어디에서도 받을 수 없어"): the five games of a floor rise as stairs,
   one height of the law each (32, 44, 52, 64, 84), so the floor's gatekeeper stands highest, its Mega on the top step as a silhouette
   (or ?) with no word (the same day: "텍스트로 명시하지 않더라도 사용자가 직관적으로 아 뭔가 보스구나! 하고 알아차리기만 하면 돼"):
   the tallest step and a shape in shadow say it. Said by light alone (DESIGN.md "Composing a screen" 22): won inverted, the game being
   played lit with the amber lamp, the next one lit while the run rests, the rest off. state: won, here or off */
function Step({ n, floor, state, playing }) {
  const master = n === STREAK_STEP;
  const lamp = state === "here" && playing && <i className="lamp sig" aria-hidden="true" />;
  return <span role="listitem" data-step={n} className={(state === "won" ? "inv" : "pn") + " streak-cell" + (state === "off" ? " off" : "") + (master ? " stand streak-master" : "")}
    aria-label={`${master ? "수문장" : `${n}번째 판`}${state === "won" ? ", 이김" : state === "here" ? (playing ? ", 지금" : ", 다음") : ""}`}>
    {master ? <><i className="floor" aria-hidden="true" /><Keeper floor={floor} state={state === "won" ? "done" : "here"} />{lamp}</> : <>{lamp}<b className="t12">{String(n)}</b></>}
  </span>;
}
const steps = (floor, now, playing) => Array.from({ length: STREAK_STEP }, (_, i) =>
  <Step key={i} n={i + 1} floor={floor} playing={playing} state={i + 1 < now ? "won" : i + 1 === now ? "here" : "off"} />);

/* the floor a run stands on, as its stairs on the seam. wins: the games won so far; playing: whether the game after them is on now;
   done: the floor just finished, every step won (the end of a gatekeeper's game) */
export function FloorCells({ wins, playing = false, done = false, boxRef }) {
  const floor = done ? streakFloor(wins - 1) : streakFloor(wins), now = done ? STREAK_STEP + 1 : floorGame(wins);
  return <div ref={boxRef} className="stack streak-floor" role="list" aria-label={`${floor}층, ${STREAK_STEP}판 가운데 ${now - 1}판 이김`}>
    {steps(floor, now, playing)}
  </div>;
}

/* the floors as a tower, the highest on top: the floor above off, the floor the run stands on as its stairs, the floor under it won
   (inverted). Each floor leads with its number alone in segments (the tower says it is a floor; no word beside the digits), and a
   floor not stood on holds its gatekeeper at its centre: passed, the Mega itself; above, ?. Three floors always (1층 at the foot
   with 2층 and 3층 over it before a run), so the tower never changes height. Every row shares one grid, the lead the golden major of
   a step, so the floors' numbers stand in one column */
export function FloorTower({ wins, playing = false, boxRef }) {
  const floor = streakFloor(wins), top = Math.max(floor + 1, 3);
  return <div ref={boxRef} className="stack streak-tower" role="list" aria-label={`${floor}층, ${STREAK_STEP}판 가운데 ${floorGame(wins) - 1}판 이김`}>
    {[top, top - 1, top - 2].map(f => {
      const state = f < floor ? "done" : f === floor ? "here" : "off";
      const tone = (state === "done" ? "inv" : "pn") + (state === "off" ? " off" : "");
      return <React.Fragment key={f}>
        <span data-floor={f} className={tone + " streak-tower-lead"} aria-hidden="true">
          <Seg value={String(f)} h={32} cells={String(f).length} label={`${f}층`} />
        </span>
        {state === "here" ? steps(f, floorGame(wins), playing)
          : <span role="listitem" data-floor={f} className={tone + " stand streak-tower-body"} aria-label={`${f}층${state === "done" ? ", 올라옴" : ""}`}>
            <i className="floor" aria-hidden="true" />
            <Keeper floor={f} state={state} />
            {/* a floor passed is done as the board marks a done step: inverted with its check, at the row's right end */}
            {state === "done" && <span className="streak-cleared"><Icon n="check" size={24} /></span>}
          </span>}
      </React.Fragment>;
    })}
  </div>;
}

/* a game of the run, beside it while it is played: which game it is, the streak riding on it lit at 32 with its unit, and the floor
   joined under it. No sentence says what is at stake; the number and the floor do (DESIGN.md "Composing a screen" 22). A floor's
   gatekeeper inverts. wins: the games won before it */
export function StreakStake({ wins }) {
  const master = streakMaster(wins);
  return <div className="stack streak-stake">
    <div className={(master ? "inv" : "pn") + " streak-stake-head"}>
      <span className="t12 dim">{gameWords(wins)}</span>
      <span className="streak-stake-board"><Seg value={String(wins)} h={32} cells={2} label={`${wins}연승`} /><span className="t15">연승</span></span>
    </div>
    <FloorCells wins={wins} playing />
  </div>;
}

/* the stake on a run's team preview (DESIGN.md 연승 도전, Floors and the stake, 2026-11-09): a band over the foe's six, the game and
   the streak riding on it, inverted on a gatekeeper's game, where the gatekeeper's cell among the six inverts with it (battle.css) */
export function StreakBand({ wins }) {
  const master = streakMaster(wins);
  return <div className={(master ? "inv" : "pn") + " streak-band"}>
    <b className="t15">{gameWords(wins)}</b>
    <span className="streak-stake-board"><Seg value={String(wins)} h={32} cells={2} label={`${wins}연승`} /><span className="t15">연승</span></span>
  </div>;
}

/* the battle function kept warm while a key that calls it stands (연승 도전 시작, 이어서 하기, 다음 판, 다시 도전), as a battle room
   keeps it warm while its player thinks: a run started on a cold worker waited 3.9 s against 1.1 s warm (2026-11-09). A worker
   lives about 75 seconds, so every 45 while the page is in view */
function useWarm(on) {
  useEffect(() => {
    if (!on) return undefined;
    const warm = () => { if (document.visibilityState === "visible") void warmBattle(); };
    warm();
    const timer = setInterval(warm, 45_000);
    return () => clearInterval(timer);
  }, [on]);
}

// this visitor's account, kept current as they sign in and out: undefined while read, null signed out, else { requested_name, status }
export function useAccount() {
  const [account, setAccount] = useState(undefined);
  useEffect(() => {
    const read = () => (visitorSignedIn() ? myPlayerLink().then(a => setAccount(a || { status: "none" }), () => setAccount(null)) : setAccount(null));
    read();
    window.addEventListener(VISITOR_EVENT, read);
    return () => window.removeEventListener(VISITOR_EVENT, read);
  }, []);
  return account;
}

// this device's run, read again from its game: playing (a game on), resting (won, the next game not yet opened), or none (null)
function useRun() {
  const [run, setRun] = useState(null);
  useEffect(() => {
    const id = currentStreakGame();
    const seat = id && readSeat(id);
    if (!seat) return;
    readBattleRow(id).then(row => {
      if (row?.status === "active") setRun({ id, wins: seat.wins ?? 0, game: seat.game ?? (seat.wins ?? 0) + 1, playing: true });
      else if (row?.status === "ended" && seat.won && !seat.ended) setRun({ id, wins: seat.wins ?? 0, game: (seat.wins ?? 0) + 1, playing: false });
    }, () => {});
  }, []);
  return run;
}

/* going into a game of a run: when the court has gone dark, the floor is called on it as an elevator calls it before the team preview
   lights (DESIGN.md "Battle", 연승 도전): the floor's number in segments and beside it the floor's five steps, lit up to this game, no
   word on it (2026-11-09, the user: "2층 1번재 판이라는 팝업 자체도 그렇게 감각적이고 심미성이 뛰어나진 않은 것 같아"); a
   gatekeeper's plate inverts. A floor's first game after its gatekeeper shows the floor below, its steps all climbed, and switches to
   the new one. wins: the wins before the game gone into; null (a game being played, gone back into) calls nothing */
export const floorCall = (dark, scope, wins) => (wins == null ? dark
  : dark.then(() => floorPlate(document.querySelector(`${scope} .bs-stage`), {
    floor: streakFloor(wins), at: floorGame(wins), climbing: wins > 0 && floorGame(wins) === 1, master: streakMaster(wins),
  })).catch(() => {}));

/* the run lit: its streak at 84 (this device's run while it goes on, else the month's best of the account; dark when there is none),
   then the tower it climbs, the floor it stands on as its stairs. No line explains the rule; the floors show it */
function RunBoard({ run, best, approved, leader = null, month = "" }) {
  // with no run of its own, the month's first place stands lit instead of dark cells that read as 88 (2026-11-09)
  const lead = !run && !approved && leader;
  const value = run ? run.wins : approved && best != null ? best : lead ? leader.wins : null;
  const label = run ? "진행 중인 도전" : approved ? "이번 달 내 최고 기록" : lead ? `${month} 1위 ${leader.trainer_name}` : "연승 도전";
  return <div className="stack">
    <div className="pn streak-hero">
      <span className="t12 dim streak-hero-label">{run && <i className="lamp sig" aria-hidden="true" />}{label}</span>
      <span className="streak-hero-board"><Seg value={value == null ? "" : String(value)} h={84} cells={value == null ? 1 : 2} label={value == null ? "" : `${value}연승`} /><span className="t20">연승</span></span>
    </div>
    <FloorTower wins={run?.wins ?? 0} playing={Boolean(run?.playing)} />
  </div>;
}

export function StreakOpen({ res, onOpen, go, tabs, enter, goingIn, standUp, onPractice = null }) {
  const account = useAccount();
  const run = useRun();
  const [back, setBack] = useState(0);
  const [board, setBoard] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // a refusal after the court went dark stands it up again, lit
  const [round, setRound] = useState(0);
  const month = monthOf(back), other = monthOf(back ? 0 : 1);
  useEffect(() => {
    let on = true;
    setBoard(undefined);
    readStreakBoard(back ? month.key : undefined).then(rows => on && setBoard(rows), () => on && setBoard(false));
    return () => { on = false; };
  }, [back, account?.status]);
  const approved = account?.status === "approved";
  useWarm(approved);
  const wins = run?.wins ?? 0;
  const rows = Array.isArray(board) ? board : null;
  const mine = back ? null : rows?.find(r => r.mine);
  // going in, as the lobby does: the court goes dark while the game is made and read, then its screen lights
  const goInto = async (make, next) => {
    if (busy) return;
    setBusy(true); setError("");
    const dark = goingIn(".bt-lobby-main");
    try {
      const made = await make();
      await enter(made.id, floorCall(dark, ".bt-lobby-main", next));
      onOpen(made.id);
    } catch (e) {
      await dark;
      standUp(); setError(e.message); setBusy(false); setRound(n => n + 1);
    }
  };
  const start = async () => {
    if (run && !(await siteConfirm({ title: "새로 도전할까요?", body: `진행 중인 도전은 ${run.wins}연승으로 끝납니다.`, confirmLabel: "새로 도전" }))) return;
    goInto(async () => keepStreakStart(await startStreakRun()), 0);
  };
  const resume = () => goInto(run.playing ? async () => ({ id: run.id }) : () => streakNextGame(run.id), run.playing ? null : run.wins);
  /* until the account can play, a battle with the computer stands beside the key, so a first visitor plays at once instead of waiting
     on a sign-in and an operator (DESIGN.md 연승 도전, 2026-11-09) */
  const practice = onPractice && <Button onClick={onPractice}>컴퓨터와 연습</Button>;
  const keys = account === undefined ? <Button variant="main" loading>연승 도전 시작</Button>
    : account === null ? <><Button variant="main" onClick={() => signInWithGoogle("", window.location.href.split("#")[0])}><GoogleMark />구글 로그인</Button>{practice}</>
    : !approved ? <><Button variant="main" disabled={account.status === "pending"} onClick={() => go?.("records")}>{account.status === "pending" ? "이름 확인 중" : "트레이너 이름 정하기"}</Button>{practice}</>
    : run ? <><Button variant="main" onClick={resume} loading={busy}>이어서 하기</Button><Button onClick={start} disabled={busy}>새로 도전</Button></>
    : <Button variant="main" onClick={start} loading={busy}>연승 도전 시작</Button>;
  // what the key cannot say by itself: why an account is needed, or why it waits
  const note = account === null ? "순위에 이름이 남아 Google 계정으로 도전합니다."
    : account && !approved ? (account.status === "pending" ? "운영진이 트레이너 이름을 확인하면 도전할 수 있습니다." : "기록에서 트레이너 이름을 정하면 도전할 수 있습니다.") : "";
  // the board as the home's and the records' ranking reads it; a live run opens its game to watch
  const placed = rows?.map(r => ({ rank: r.place, name: r.trainer_name, points: r.wins, live: r.live, open: r.live && r.battle_id ? () => onOpen(r.battle_id) : null }));
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      {tabs}
      <div className="bt-lobby">
        <div className="bt-lobby-main">
          <LobbyArena res={res} foe="컴퓨터" foeNote=""
            ours={<span className="bt-who"><b className={"bt-trainer" + (approved ? "" : " mute")}>{approved ? account.requested_name : "나"}</b><span className="bt-who-note">{run ? gameWords(wins) : "랜덤 파티"}</span></span>}>
            <LobbyStage key={round} leads={[]} doubles={false} random label="경기장, 양쪽 파티는 배틀이 열리면 정해집니다." />
          </LobbyArena>
          <Dock toast={error ? <Toast error>{error}</Toast> : note ? <Toast>{note}</Toast> : null}>
            <div className="bt-end-keys">{keys}</div>
          </Dock>
        </div>
        <div className="bt-lobby-set streak-side">
          <section aria-labelledby="streak-run">
            <SectionHead id="streak-run" title="연승 도전" />
            <RunBoard run={run} best={rows ? mine?.wins ?? 0 : null} approved={approved} leader={!back ? rows?.[0] : null} month={month.label} />
          </section>
          <section aria-labelledby="streak-board">
            <SectionHead id="streak-board" title={`${month.label} 순위`} link={`${other.label} 보기`} onLink={() => setBack(b => (b ? 0 : 1))} />
            {board === undefined ? <Podium rows={null} />
              : !rows ? <Row title="순위를 불러오지 못했습니다." line="잠시 뒤 다시 시도해 주세요." />
              : !rows.length ? <Row title="아직 기록이 없습니다." />
              : <StandTable rows={placed} placed open unit="연승" head="연승" />}
          </section>
        </div>
      </div>
    </div>
  );
}

/* the swap after a won game within a floor: ours for the party just beaten. Every party is balanced one Pokémon a tier
   (partyBalance.js), so a swap is tier for tier, and the form shows it (2026-11-09: the pairs could not be seen and an off cell said
   nothing): our six over theirs, each in tier order, so a pair is a column. A tap on either cell of a column chooses the column, both
   inverted; a column that would bring a second species stands off. Each cell tells its set by a long press (a pointer on a desktop),
   the foe's as far as the game showed it, and an off cell says why. The head of our six offers 새로 뽑기, a new party for the next
   game: our six go to bare floors as the lobby shows a random party, and the key says 새 파티로 다음 판 (2026-11-09, the user: "포켓몬
   리스트를 좀 더 자주 바꿀 수 있다든가"). ours, theirs: { species, name }; match: a species' match on the other side, "" when none */
const OFF_WHY = "같은 포켓몬이 둘이 되어 바꿀 수 없습니다.";
function SwapColumns({ ours, theirs, chosen, matchOurs, matchTheirs, onPick, link, fresh, blocked = [] }) {
  // why a cell is off: the server's word for a pair it refused, else a second species
  const whyOf = (mine, s) => blocked.find(b => (mine ? b.give : b.take) === s)?.why || OFF_WHY;
  const cell = (mine, { species: s, name }) => {
    const off = fresh ? !mine : !(mine ? matchTheirs(s) : matchOurs(s));
    const on = chosen.has(`${mine ? "give" : "take"}:${s}`);
    if (mine && fresh) return <span key={`o${s}`} className="stand streak-swap-cell bare"><i className="floor" aria-hidden="true" /><i className="bt-bare" aria-hidden="true">?</i></span>;
    return <button key={`${mine ? "o" : "t"}${s}`} type="button" className={"stand streak-swap-cell" + (on ? " inv" : " pn") + (off ? " off" : "")} aria-pressed={on}
      aria-disabled={off || undefined} onClick={() => { if (!off) onPick(mine, s); }} aria-label={`${mine ? "내" : "상대"} ${name}${off ? ", 바꿀 수 없음" : ""}`}
      data-info={`swap:${mine ? "own" : "foe"}:${s}:${off && !fresh ? whyOf(mine, s) : ""}`}>
      <i className="floor" aria-hidden="true"><b>{name}</b></i>
      <Mon src={spriteUrl(s)} draggable="false" onError={onSpriteError()} />
    </button>;
  };
  return <section className="stack streak-swap" aria-label="교환">
    <span className="streak-swap-head"><span className="t12 dim">내 파티</span>{link}</span>
    <div className="stack streak-swap-grid">
      {ours.map(m => cell(true, m))}
      {theirs.map(m => cell(false, m))}
    </div>
    <span className="t12 dim">상대 파티</span>
  </section>;
}

/* The end of a game of a run, for its player: the run's wins lit (이번 달 내 최고 기록 when it is the month's best now), switching from
   the last count to the new one as a score does, and after a win the next step: within a floor its stairs, the step just won
   brightening in its new light and the next one rising into place; a floor's gatekeeper beaten, the tower, the floor just cleared
   brightening inverted and the new floor and the one over it rising in (motion.js climb). Beside the count the computer of the next
   game on its floor (DESIGN.md "Composing a screen" 14); a floor's gatekeeper inverts. Within a floor the party goes on, and one of the
   party just beaten may be taken tier for tier, as many pairs as wished, or a new party drawn; a new floor brings a new party. The run rests after a win until
   다음 판 opens the next game, so 나가기 loses nothing; after a loss 다시 도전 starts a new run. Both go in as the lobby does, from this
   stage. ours, theirs: the two parties' species, as the team preview showed them (none after a reload: then there is no swap) */
export function StreakEnd({ id, won, onOpen, onOut, enter, goingIn, standUp, settle = async () => {}, ours: ourSix = [], theirs: theirSix = [] }) {
  const seat = readSeat(id);
  const board = useBoard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // the swaps chosen, { give, take } each: as many as there are tiers (2026-11-09, the user: "포켓몬 교체를 좀 더 자주 하면 재밌을 것 같네")
  const [pairs, setPairs] = useState([]);
  // pairs the server refused (an item the party already holds can only be seen there): their columns stand off, the rest stay chosen
  const [blocked, setBlocked] = useState([]);
  const [fresh, setFresh] = useState(false);
  const wins = seat?.wins ?? 0;
  const resting = won && !seat?.ended;
  const master = streakMaster(wins);
  const climbed = resting && wins > 0 && floorGame(wins) === 1;
  const best = Boolean(board?.find(r => r.mine && wins > 0 && r.wins === wins));
  const place = board?.find(r => r.mine && wins > 0)?.place ?? null;
  const [shown, setShown] = useState(resting && wins > 0 ? wins - 1 : wins);
  const box = useRef(null);
  useWarm(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(wins), DUR.light);
    const el = box.current;
    if (el && resting) {
      const floor = streakFloor(wins), at = sel => [...el.querySelectorAll(sel)];
      if (climbed) climb(at(`[data-floor="${floor - 1}"]`), [...at(`[data-floor="${floor}"], [data-step]`), ...at(`[data-floor="${floor + 1}"]`)]);
      else climb(at(`[data-step="${floorGame(wins) - 1}"]`), at(`[data-step="${floorGame(wins)}"]`));
    }
    return () => clearTimeout(timer);
  }, [wins, resting]);
  // each six in tier order, so a pair of one tier is a column (SwapColumns)
  const byTier = list => [...list].sort((a, b) => (swapTier(a.species) ?? 9) - (swapTier(b.species) ?? 9));
  const ours = byTier(ourSix), theirs = byTier(theirSix);
  // ponytail: the species are matched by name; a party with two forms of one species cannot be drawn (one of each species)
  const swapping = resting && !streakFresh(wins) && ours.length === 6 && theirs.length === 6;
  // tier for tier when the tiers are measured; any for any otherwise (as before the balance)
  const tiered = swapping && swapTier(ours[0].species) != null;
  // a match never brings a second species into our party (the screen sees species; the items the server settles, streak.js swapParty)
  const kind = s => String(s).split("-")[0];
  const fits = (mine, foe) => !ours.some(o => o.species !== mine && kind(o.species) === kind(foe));
  const matchIn = side => s => {
    const found = !tiered ? side[0]?.species || "" : side.find(o => swapTier(o.species) === swapTier(s))?.species || "";
    const pair = side === theirs ? { give: s, take: found } : { give: found, take: s };
    if (blocked.some(b => b.give === pair.give && b.take === pair.take)) return "";
    return found && (side === theirs ? fits(s, found) : fits(found, s)) ? found : "";
  };
  // a tap chooses a Pokémon and its match on the other side as one pair, or lets go of the pair it is in; pairs of other tiers stay
  const pick = (mine, s) => {
    if (pairs.some(p => (mine ? p.give : p.take) === s)) { setPairs(pairs.filter(p => (mine ? p.give : p.take) !== s)); return; }
    const other = matchIn(mine ? theirs : ours)(s);
    if (!other) return;
    const pair = mine ? { give: s, take: other } : { give: other, take: s };
    setPairs([...(tiered ? pairs.filter(p => p.give !== pair.give && p.take !== pair.take) : []), pair]);
  };
  const swap = fresh ? "reroll" : swapping && pairs.length ? pairs : null;
  const goInto = async (make, next) => {
    if (busy) return;
    setBusy(true); setError("");
    // a replay still playing is put at its end first, so the court goes dark on the game's end (BattlePage.jsx Arena settle)
    await settle();
    const dark = goingIn(".bt-main");
    try {
      const made = await make();
      await enter(made.id, floorCall(dark, ".bt-main", next));
      onOpen(made.id);
    } catch (e) {
      await dark; standUp(); setError(e.message); setBusy(false);
      // a refused pair stands off and is let go; the other pairs stay chosen. Without a named pair, all are let go, so the key says
      // 다음 판 again instead of asking the same twice
      if (e.pair?.give && e.pair?.take) { setBlocked(b => [...b, { ...e.pair, why: e.message }]); setPairs(p => p.filter(x => x.give !== e.pair.give)); }
      else setPairs([]);
    }
  };
  return <>
    <div className="stack streak-end">
      <Counter label={best ? "이번 달 내 최고 기록" : "이번 도전"} value={shown} after={<span className="t15">연승</span>} />
      {/* a lost run ends as a scene of its own (2026-11-09): beside its streak, its place on the month's board */}
      {!resting && place != null && <Counter label={`${monthOf(0).label} 순위`} value={place} after={<span className="t15">위</span>} />}
      {/* the next game, named, with what is known of its opponent: before a gatekeeper its silhouette (? past the fixed floors),
          before any other game a ?, since its party is drawn when it opens */}
      {resting && <div className={(master ? "inv" : "pn") + " stand streak-next"} role="img" aria-label={`다음 판 ${gameWords(wins)}`}>
        <b className="t15">{gameWords(wins)}</b>
        <i className="floor" aria-hidden="true" />
        <Keeper floor={streakFloor(wins)} state={master ? "here" : "off"} />
      </div>}
    </div>
    {resting ? (climbed ? <FloorTower wins={wins} boxRef={box} /> : <FloorCells wins={wins} boxRef={box} />) : wins > 0 && <FloorTower wins={wins} boxRef={box} />}
    {swapping && <SwapColumns ours={ours} theirs={theirs} fresh={fresh} chosen={new Set(pairs.flatMap(p => [`give:${p.give}`, `take:${p.take}`]))}
      matchTheirs={matchIn(theirs)} matchOurs={matchIn(ours)} onPick={pick} blocked={blocked}
      link={<Button variant="link" onClick={() => { setFresh(f => !f); setPairs([]); }} aria-pressed={fresh}>{fresh ? "그대로 두기" : "새로 뽑기"}</Button>} />}
    <Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <div className="bt-end-keys">
        {resting ? <Button variant="main" loading={busy} onClick={() => goInto(() => streakNextGame(id, swap), wins)}>{fresh ? "새 파티로 다음 판" : swap ? "바꾸고 다음 판" : "다음 판"}</Button>
          : <Button variant="main" icon="refresh" loading={busy} onClick={() => goInto(async () => keepStreakStart(await startStreakRun()), 0)}>다시 도전</Button>}
        <Button onClick={onOut} disabled={busy}>나가기</Button>
      </div>
    </Dock>
  </>;
}
