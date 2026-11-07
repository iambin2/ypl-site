/* 연승 도전 (docs/BATTLE_STREAK.md 8장, DESIGN.md "Layout and pages" 연승 도전): the battle page's tab, and what a game of a run says
   when it ends. The tab stands as the lobby stands (the arena with the computer the run meets next on its floor, the key under it),
   and beside it the run itself: its streak lit at 84, the ladder of the three computers it climbs, and the month's board. Its games
   are played as any server battle (BattleRoom), and the battle function answers as the computer; what a game's answer says of the
   run is kept with the seat (battleService.js). Going into a game is the lobby's going in: the court goes dark while the game and its
   pictures are read (BattlePage.jsx enterBattle). */
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
import { STREAK_LEVELS, STREAK_STEP, streakLevel } from "../../services/streak.js";
import { onSpriteError, spriteUrl } from "../../services/teamBuilderCore.js";
import { LobbyArena, LobbyStage } from "./Stage.jsx";

// the board's months are the run's months in KST, as the database counts them: "2026-11-01"
const monthOf = back => {
  const kst = new Date(Date.now() + 9 * 3600e3);
  let y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1 - back;
  if (m < 1) { m += 12; y -= 1; }
  return { key: `${y}-${String(m).padStart(2, "0")}-01`, label: `${m}월` };
};
// which game of the run this is, said in words while it is played (연승 도전 3번째 판); the seat keeps it from the game's opening
export const streakGameLine = seat => (seat?.game ? `연승 도전 ${seat.game}번째 판` : "연승 도전");
// the ladder: each 난이도 and the games it stands for (1~7판, 8~14판, 15판부터)
const STEPS = STREAK_LEVELS.map((id, i) => ({ id, games: i < STREAK_LEVELS.length - 1 ? `${i * STREAK_STEP + 1}~${(i + 1) * STREAK_STEP}판` : `${i * STREAK_STEP + 1}판부터` }));

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

/* the run lit: its streak at 84 (this device's run while it goes on, else the month's best of the account; dark when there is none),
   with the rule it keeps as its grey line, then the ladder, the step the run stands on inverted */
function RunBoard({ run, best, approved, step }) {
  const value = run ? run.wins : approved && best != null ? best : null;
  const label = run ? "진행 중인 도전" : approved ? "이번 달 내 최고 기록" : "연승 도전";
  return <div className="stack">
    <div className="pn streak-hero">
      <span className="t12 dim streak-hero-label">{run && <i className="lamp sig" aria-hidden="true" />}{label}</span>
      <span className="streak-hero-board"><Seg value={value == null ? "" : String(value)} h={84} cells={2} label={value == null ? "" : `${value}연승`} /><span className="t20">연승</span></span>
      <span className="t12 dim">한 번 지면 도전이 끝나고, 이긴 판 수가 그달의 기록입니다.</span>
    </div>
    <div className="stack streak-ladder" role="list" aria-label="난이도 계단">
      {STEPS.map(({ id, games }, i) => {
        const level = LEVELS[id];
        return <div key={id} role="listitem" className={(i === step ? "inv" : "pn") + " stand streak-step"} aria-label={`${games} ${level.label}${i === step ? ", 다음 상대" : ""}`}>
          <span className="t12 dim">{games}</span>
          <b className="t15">{level.label}</b>
          <i className="floor" aria-hidden="true" />
          <Mon src={spriteUrl(level.species)} onError={onSpriteError()} />
        </div>;
      })}
    </div>
  </div>;
}

export function StreakOpen({ res, onOpen, go, tabs, enter, goingIn }) {
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
  const step = STREAK_LEVELS.indexOf(streakLevel(run?.wins ?? 0));
  const level = LEVELS[STREAK_LEVELS[step]];
  const rows = Array.isArray(board) ? board : null;
  const mine = back ? null : rows?.find(r => r.mine);
  // going in, as the lobby does: the court goes dark while the game is made and read, then its screen lights
  const goInto = async make => {
    if (busy) return;
    setBusy(true); setError("");
    const dark = goingIn(".bt-lobby-main");
    try {
      const made = await make();
      await enter(made.id, dark);
      onOpen(made.id);
    } catch (e) {
      await dark;
      setError(e.message); setBusy(false); setRound(n => n + 1);
    }
  };
  const start = async () => {
    if (run && !(await siteConfirm({ title: "새로 도전할까요?", body: `진행 중인 도전은 ${run.wins}연승으로 끝납니다.`, confirmLabel: "새로 도전" }))) return;
    goInto(async () => keepStreakStart(await startStreakRun()));
  };
  const resume = () => goInto(run.playing ? async () => ({ id: run.id }) : () => streakNextGame(run.id));
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
          <LobbyArena res={res} foe="컴퓨터" foeNote={level.label}
            ours={<span className="bt-who"><b className={"bt-trainer" + (approved ? "" : " mute")}>{approved ? account.requested_name : "나"}</b><span className="bt-who-note">{run ? `${run.game}번째 판` : "랜덤 파티"}</span></span>}>
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
              : !rows.length ? <Row title="아직 기록이 없습니다." line="1연승부터 순위에 오릅니다." />
              : <StandTable rows={placed} placed open unit="연승" head="연승" />}
          </section>
        </div>
      </div>
    </div>
  );
}

/* The end of a game of a run, for its player: the run's wins lit, and after a win the computer of the next 난이도 on its floor, so the
   next game is a step of its own (DESIGN.md "Composing a screen" 14). The run rests after a win until 다음 판 opens the next game, so
   나가기 loses nothing; after a loss 다시 도전 starts a new run. Both go in as the lobby does, from this stage. */
export function StreakEnd({ id, won, onOpen, onOut, enter, goingIn }) {
  const seat = readSeat(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wins = seat?.wins ?? 0;
  const resting = won && !seat?.ended;
  const level = LEVELS[streakLevel(wins)];
  const goInto = async make => {
    if (busy) return;
    setBusy(true); setError("");
    const dark = goingIn(".bt-main");
    try {
      const made = await make();
      await enter(made.id, dark);
      onOpen(made.id);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return <>
    <div className="stack streak-end">
      <Counter label="이번 도전" value={wins} after={<span className="t15">연승</span>} />
      {resting && <div className="pn stand streak-next" role="img" aria-label={`다음 상대 ${level.label}`}>
        <span className="t12 dim">다음 상대</span>
        <b className="t15">{level.label}</b>
        <i className="floor" aria-hidden="true" />
        <Mon src={spriteUrl(level.species)} onError={onSpriteError()} />
      </div>}
    </div>
    <Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <div className="bt-end-keys">
        {resting ? <Button variant="main" loading={busy} onClick={() => goInto(() => streakNextGame(id))}>다음 판</Button>
          : <Button variant="main" icon="refresh" loading={busy} onClick={() => goInto(async () => keepStreakStart(await startStreakRun()))}>다시 도전</Button>}
        <Button onClick={onOut} disabled={busy}>나가기</Button>
      </div>
    </Dock>
  </>;
}
