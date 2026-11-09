/* 연승 도전 (docs/BATTLE_STREAK.md 8장, DESIGN.md "Layout and pages" 연승 도전): the battle page's tab, what a game of a run has at
   stake while it is played, and what it says when it ends. A run climbs floors of seven games, the seventh the floor's master
   (src/services/streak.js). The tab stands as the lobby stands (the arena with the computer the run meets next on its floor, the key
   under it), and beside it the run itself: its streak lit at 84, the floor it stands on, the floors it climbs, and the month's board.
   Its games are played as any server battle (BattleRoom), and the battle function answers as the computer; what a game's answer says
   of the run is kept with the seat (battleService.js). Going into a game is the lobby's going in: the court goes dark while the game
   and its pictures are read (BattlePage.jsx enterBattle), and the game's floor is called on the dark court before it lights. */
import React, { useEffect, useState } from "react";
import Button from "../../components/common/Button.jsx";
import Seg from "../../components/common/Seg.jsx";
import { Counter, Dock, Mon, Podium, Row, SectionHead, Toast } from "../../components/common/Board.jsx";
import StandTable from "../../components/common/StandTable.jsx";
import { siteConfirm } from "../../components/common/SiteDialog.jsx";
import { GoogleMark } from "../../components/layout/SiteHeader.jsx";
import { currentStreakGame, keepStreakStart, readBattleRow, readSeat, streakNextGame } from "../../services/battleService.js";
import { VISITOR_EVENT, myPlayerLink, readStreakBoard, signInWithGoogle, startStreakRun, visitorSignedIn } from "../../services/visitorAuth.js";
import { LEVELS } from "../../services/cpuLevels.js";
import { STREAK_LEVELS, STREAK_STEP, floorGame, gameWords, streakFloor, streakFresh, streakLevel, streakMaster } from "../../services/streak.js";
import { onSpriteError, spriteUrl } from "../../services/teamBuilderCore.js";
import { banner } from "./stageFx.js";
import { LobbyArena, LobbyStage } from "./Stage.jsx";

// the board's months are the run's months in KST, as the database counts them: "2026-11-01"
const monthOf = back => {
  const kst = new Date(Date.now() + 9 * 3600e3);
  let y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1 - back;
  if (m < 1) { m += 12; y -= 1; }
  return { key: `${y}-${String(m).padStart(2, "0")}-01`, label: `${m}월` };
};
/* the floors a run climbs, each the games it stands for (1~7판, 8~14판, 15판부터) and its master, whose 난이도's Pokémon stands on the
   floor under the word 주인 (streak.js: a floor is one 난이도, its master included: 폴리곤, 폴리곤2, 폴리곤Z) */
const STEPS = STREAK_LEVELS.map((id, i) => ({
  id, floor: i + 1, master: id,
  games: i < STREAK_LEVELS.length - 1 ? `${i * STREAK_STEP + 1}~${(i + 1) * STREAK_STEP}판` : `${i * STREAK_STEP + 1}판부터`,
}));
// the month's board, read once at a game's end to know whether the run is the account's best this month (null while read or when it cannot be)
function useBoard() {
  const [board, setBoard] = useState(null);
  useEffect(() => { let on = true; readStreakBoard().then(rows => on && setBoard(rows), () => {}); return () => { on = false; }; }, []);
  return board;
}

/* the floor a run stands on: its seven games as cells on the seam, said by light alone (DESIGN.md "Composing a screen" 22): the won
   ones inverted, the one being played lit with the amber lamp before its number (a live thing), the next one lit while the run rests,
   the rest off; the seventh is 주인, the floor's master. The number, with its lamp, stands at the cell's centre. wins: the games won
   so far; playing: whether the game after them is on now */
export function FloorCells({ wins, playing = false }) {
  const floor = streakFloor(wins), now = floorGame(wins);
  return <div className="stack streak-floor" role="list" aria-label={`${floor}층, 일곱 판 가운데 ${now - 1}판 이김`}>
    {Array.from({ length: STREAK_STEP }, (_, i) => {
      const n = i + 1, won = n < now, here = n === now;
      return <span key={n} role="listitem" className={(won ? "inv" : "pn") + " streak-cell" + (!won && !here ? " off" : "")}
        aria-label={`${n === STREAK_STEP ? "층의 주인" : `${n}번째 판`}${won ? ", 이김" : here ? (playing ? ", 지금" : ", 다음") : ""}`}>
        {here && playing && <i className="lamp sig" aria-hidden="true" />}
        <b className="t12">{n === STREAK_STEP ? "주인" : String(n)}</b>
      </span>;
    })}
  </div>;
}

/* a game of the run, beside it while it is played: which game it is, the streak riding on it lit at 32 with its unit, and the floor
   joined under it. No sentence says what is at stake; the number and the floor do (DESIGN.md "Composing a screen" 22). A floor's
   master inverts. wins: the games won before it */
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

// this visitor's account, kept current as they sign in and out: undefined while read, null signed out, else { requested_name, status }
function useAccount() {
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

/* going into a game of a run: when the court has gone dark, its plate says which floor and game comes before the team preview lights
   (DESIGN.md "Battle", 연승 도전), 1층 1번째 판, and the seventh as a scene of its own, 1층의 주인. wins: the wins before the game gone
   into; null (a game being played, gone back into) calls nothing */
export const floorWords = wins => (streakMaster(wins) ? `${streakFloor(wins)}층의 주인` : gameWords(wins));
export const floorCall = (dark, scope, wins) => (wins == null ? dark
  : dark.then(() => banner(document.querySelector(`${scope} .bs-stage`), floorWords(wins))).catch(() => {}));

/* the run lit: its streak at 84 (this device's run while it goes on, else the month's best of the account; dark when there is none),
   the floor the run stands on, then the floors, the one it stands on inverted. No line explains the rule; the floors show it */
function RunBoard({ run, best, approved, step }) {
  const value = run ? run.wins : approved && best != null ? best : null;
  const label = run ? "진행 중인 도전" : approved ? "이번 달 내 최고 기록" : "연승 도전";
  return <div className="stack">
    <div className="pn streak-hero">
      <span className="t12 dim streak-hero-label">{run && <i className="lamp sig" aria-hidden="true" />}{label}</span>
      <span className="streak-hero-board"><Seg value={value == null ? "" : String(value)} h={84} cells={2} label={value == null ? "" : `${value}연승`} /><span className="t20">연승</span></span>
    </div>
    {run && <FloorCells wins={run.wins} playing={run.playing} />}
    <div className="stack streak-ladder" role="list" aria-label="층">
      {STEPS.map(({ id, floor, master, games }, i) => <div key={id} role="listitem" className={(i === step ? "inv" : "pn") + " stand streak-step"}
        aria-label={`${floor}층 ${games}, ${LEVELS[id].label}, 주인 ${LEVELS[master].label}${i === step ? ", 지금 층" : ""}`}>
        <b className="t15">{`${floor}층`}</b>
        <span className="t12 dim">{games}</span>
        <span className="t12 dim">주인</span>
        <i className="floor" aria-hidden="true" />
        <Mon src={spriteUrl(LEVELS[master].species)} onError={onSpriteError()} />
      </div>)}
    </div>
  </div>;
}

export function StreakOpen({ res, onOpen, go, tabs, enter, goingIn, standUp }) {
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
  const wins = run?.wins ?? 0;
  const step = Math.min(STREAK_LEVELS.length - 1, streakFloor(wins) - 1);
  const level = LEVELS[streakLevel(wins)];
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
  const keys = account === undefined ? <Button variant="main" loading>연승 도전 시작</Button>
    : account === null ? <Button variant="main" onClick={() => signInWithGoogle("", window.location.href.split("#")[0])}><GoogleMark />구글 로그인</Button>
    : !approved ? <Button variant="main" disabled={account.status === "pending"} onClick={() => go?.("records")}>{account.status === "pending" ? "이름 확인 중" : "트레이너 이름 정하기"}</Button>
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
          <LobbyArena res={res} foe="컴퓨터" foeNote={streakMaster(wins) ? `${level.label}, 층의 주인` : level.label}
            ours={<span className="bt-who"><b className={"bt-trainer" + (approved ? "" : " mute")}>{approved ? account.requested_name : "나"}</b><span className="bt-who-note">{run ? gameWords(wins) : "랜덤 파티"}</span></span>}>
            <LobbyStage key={round} leads={[]} doubles={false} random foeLead={level.species} label={`경기장, 상대 ${level.label}, 랜덤 파티는 배틀이 열리면 정해집니다.`} />
          </LobbyArena>
          <Dock toast={error ? <Toast error>{error}</Toast> : note ? <Toast>{note}</Toast> : null}>
            <div className="bt-end-keys">{keys}</div>
          </Dock>
        </div>
        <div className="bt-lobby-set streak-side">
          <section aria-labelledby="streak-run">
            <SectionHead id="streak-run" title="연승 도전" />
            <RunBoard run={run} best={rows ? mine?.wins ?? 0 : null} approved={approved} step={step} />
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

/* the swap after a won game within a floor: one of ours for one of the party just beaten, each chosen by a tap on its six (the one
   chosen inverted), or neither; with both chosen the main key says 바꾸고 다음 판, which is all the swap says of itself. species: that
   party's six, { species, name } */
function SwapSix({ label, species, value, onChange }) {
  return <section className="streak-swap-side" aria-label={label}>
    <span className="t12 dim">{label}</span>
    <div className="stack bt-foe-six">
      {species.map(({ species: s, name }) => <button key={s} type="button" className={"bt-foe-cell streak-swap-cell" + (value === s ? " inv" : "")} aria-pressed={value === s}
        onClick={() => onChange(value === s ? "" : s)}>
        <img src={spriteUrl(s)} alt="" draggable="false" onError={onSpriteError()} />
        <b>{name}</b>
      </button>)}
    </div>
  </section>;
}

/* The end of a game of a run, for its player: the run's wins lit (이번 달 내 최고 기록 when it is the month's best now), and after a
   win the floor with the games won inverted and the computer of the next game on its floor, so the next game is a step of its own
   (DESIGN.md "Composing a screen" 14); a floor's master inverts. Within a floor the party goes on and one of the party just beaten may
   be taken for one of ours; a floor's master beaten, the next floor brings a new party. The run rests after a win until 다음 판 opens
   the next game, so 나가기 loses nothing; after a loss 다시 도전 starts a new run. Both go in as the lobby does, from this stage.
   ours, theirs: the two parties' species, as the team preview showed them (none after a reload: then there is no swap) */
export function StreakEnd({ id, won, onOpen, onOut, enter, goingIn, standUp, settle = async () => {}, ours = [], theirs = [] }) {
  const seat = readSeat(id);
  const board = useBoard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [give, setGive] = useState("");
  const [take, setTake] = useState("");
  const wins = seat?.wins ?? 0;
  const resting = won && !seat?.ended;
  const level = LEVELS[streakLevel(wins)];
  const master = streakMaster(wins);
  const best = Boolean(board?.find(r => r.mine && wins > 0 && r.wins === wins));
  // ponytail: the species are matched by name; a party with two forms of one species cannot be drawn (one of each species)
  const swapping = resting && !streakFresh(wins) && ours.length === 6 && theirs.length === 6;
  const swap = swapping && give && take ? { give, take } : null;
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
    } catch (e) { await dark; standUp(); setError(e.message); setBusy(false); }
  };
  return <>
    <div className="stack streak-end">
      <Counter label={best ? "이번 달 내 최고 기록" : "이번 도전"} value={wins} after={<span className="t15">연승</span>} />
      {resting && <div className={(master ? "inv" : "pn") + " stand streak-next"} role="img" aria-label={`다음 상대 ${level.label}${master ? ", 층의 주인" : ""}`}>
        <span className="t12 dim">{gameWords(wins)}</span>
        <b className="t15">{level.label}</b>
        <i className="floor" aria-hidden="true" />
        <Mon src={spriteUrl(level.species)} onError={onSpriteError()} />
      </div>}
    </div>
    {resting && <FloorCells wins={wins} />}
    {swapping && <section className="stack streak-swap" aria-label="교환">
      <SwapSix label="내 파티" species={ours} value={give} onChange={setGive} />
      <SwapSix label="상대 파티" species={theirs} value={take} onChange={setTake} />
    </section>}
    <Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <div className="bt-end-keys">
        {resting ? <Button variant="main" loading={busy} onClick={() => goInto(() => streakNextGame(id, swap), wins)}>{swap ? "바꾸고 다음 판" : "다음 판"}</Button>
          : <Button variant="main" icon="refresh" loading={busy} onClick={() => goInto(async () => keepStreakStart(await startStreakRun()), 0)}>다시 도전</Button>}
        <Button onClick={onOut} disabled={busy}>나가기</Button>
      </div>
    </Dock>
  </>;
}
