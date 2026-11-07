/* 연승 도전 (docs/BATTLE_STREAK.md 8장): the battle page's tab, and what a game of a run says when it ends.
   The tab stands as the lobby stands (the arena with the computer of the next 난이도 on its floor, the key under it, the record and
   the month's board beside it), since a run is a battle with the computer. Its games are played as any server battle (BattleRoom),
   and the battle function answers as the computer; what a game's answer says of the run is kept with the seat (battleService.js). */
import React, { useEffect, useState } from "react";
import Button from "../../components/common/Button.jsx";
import { Chips, Counter, Dock, Mon, Podium, Row, Toast } from "../../components/common/Board.jsx";
import StandTable from "../../components/common/StandTable.jsx";
import { siteConfirm } from "../../components/common/SiteDialog.jsx";
import { GoogleMark } from "../../components/layout/SiteHeader.jsx";
import { currentStreakGame, keepStreakStart, readBattleRow, readSeat } from "../../services/battleService.js";
import { VISITOR_EVENT, myPlayerLink, readStreakBoard, signInWithGoogle, startStreakRun, visitorSignedIn } from "../../services/visitorAuth.js";
import { LEVELS } from "../../services/cpuLevels.js";
import { STREAK_STEP, streakLevel } from "../../services/streak.js";
import { onSpriteError, spriteUrl } from "../../services/teamBuilderCore.js";
import { LobbyArena, LobbyStage } from "./Stage.jsx";

// the board's months are the run's months in KST, as the database counts them: "2026-11-01"
const monthKey = back => {
  const kst = new Date(Date.now() + 9 * 3600e3);
  let y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1 - back;
  if (m < 1) { m += 12; y -= 1; }
  return `${y}-${String(m).padStart(2, "0")}-01`;
};
const MONTHS = [[0, "이번 달"], [1, "지난달"]];
// which game of the run this is, said in words while it is played (연승 도전 3번째 판); the seat keeps it from the game's opening
export const streakGameLine = seat => (seat?.game ? `연승 도전 ${seat.game}번째 판` : "연승 도전");

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

export function StreakOpen({ res, onOpen, go, tabs }) {
  const account = useAccount();
  const [month, setMonth] = useState(0);
  const [board, setBoard] = useState(undefined);
  const [resume, setResume] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let on = true;
    setBoard(undefined);
    readStreakBoard(month ? monthKey(month) : undefined).then(rows => on && setBoard(rows), () => on && setBoard(false));
    return () => { on = false; };
  }, [month, account?.status]);
  // this device's run still being played: its game is offered again (이어서 하기), so a reload never loses a run
  useEffect(() => {
    const id = currentStreakGame();
    if (!id || !readSeat(id)) return;
    readBattleRow(id).then(row => { if (row?.status === "active") setResume({ id, wins: readSeat(id)?.wins ?? 0 }); }, () => {});
  }, []);
  const approved = account?.status === "approved";
  const wins = resume?.wins ?? 0;
  const level = LEVELS[streakLevel(wins)];
  const rows = Array.isArray(board) ? board : null;
  const mine = rows?.find(r => r.mine);
  const start = async () => {
    if (busy) return;
    if (resume && !(await siteConfirm({ title: "새로 도전할까요?", body: `진행 중인 도전은 ${resume.wins}연승으로 끝납니다.`, confirmLabel: "새로 도전" }))) return;
    setBusy(true); setError("");
    try { onOpen(keepStreakStart(await startStreakRun()).id); } catch (e) { setError(e.message); setBusy(false); }
  };
  const back = window.location.href.split("#")[0];
  const keys = account === undefined ? <Button variant="main" loading>연승 도전 시작</Button>
    : account === null ? <Button variant="main" onClick={() => signInWithGoogle("", back)}><GoogleMark />구글 로그인</Button>
    : !approved ? <Button variant="main" disabled={account.status === "pending"} onClick={() => go?.("records")}>{account.status === "pending" ? "이름 확인 중" : "트레이너 이름 정하기"}</Button>
    : resume ? <><Button variant="main" onClick={() => onOpen(resume.id)}>이어서 하기</Button><Button onClick={start} loading={busy}>새로 도전</Button></>
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
            ours={<span className="bt-who"><b className={"bt-trainer" + (approved ? "" : " mute")}>{approved ? account.requested_name : "나"}</b><span className="bt-who-note">{resume ? `${wins}연승 중` : "랜덤 파티"}</span></span>}>
            <LobbyStage leads={[]} doubles={false} random foeLead={level.species} label={`경기장, 상대 ${level.label}, 랜덤 파티는 배틀이 열리면 정해집니다.`} />
          </LobbyArena>
          <Dock toast={error ? <Toast error>{error}</Toast> : note ? <Toast>{note}</Toast> : null}>
            <div className="bt-end-keys">{keys}</div>
          </Dock>
        </div>
        <div className="bt-lobby-set">
          <div className="q">
            <span className="q-label t12 dim">연승 도전</span>
            <p className="t15 streak-rule">{`랜덤 파티로 컴퓨터와 이어서 싸웁니다. ${STREAK_STEP}판마다 상대가 한 단계 강해지고, 한 번 지면 도전이 끝납니다. 이긴 판 수가 그달의 기록입니다.`}</p>
          </div>
          {approved && <Counter label="이번 달 내 최고 기록" value={rows ? mine?.wins ?? 0 : null} after={<span className="t15">연승</span>} />}
          <div className="q">
            <span className="q-label t12 dim">순위</span>
            <Chips label="순위의 달" value={month} onChange={setMonth} options={MONTHS} />
            {board === undefined ? <Podium rows={null} />
              : !rows ? <Row title="순위를 불러오지 못했습니다." line="잠시 뒤 다시 시도해 주세요." />
              : !rows.length ? <Row title="아직 기록이 없습니다." line="1연승부터 순위에 오릅니다." />
              : <StandTable rows={placed} placed open unit="연승" head="연승" />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* The end of a game of a run, for its player: the run's wins lit, and after a win the next 난이도's computer on its floor, so the
   next game is a step of its own (DESIGN.md "Composing a screen" 14). 다음 판 goes on; after a loss 다시 도전 starts a new run. */
export function StreakEnd({ id, onOpen, onBoard }) {
  const seat = readSeat(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wins = seat?.wins ?? 0;
  const next = seat?.next || null;
  const level = LEVELS[streakLevel(wins)];
  const again = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { onOpen(keepStreakStart(await startStreakRun()).id); } catch (e) { setError(e.message); setBusy(false); }
  };
  return <>
    <div className="stack streak-end">
      <Counter label="이번 도전" value={wins} after={<span className="t15">연승</span>} />
      {next && <div className="pn stand streak-next" role="img" aria-label={`다음 상대 ${level.label}`}>
        <span className="t12 dim">다음 상대</span>
        <b className="t15">{level.label}</b>
        <i className="floor" aria-hidden="true" />
        <Mon src={spriteUrl(level.species)} onError={onSpriteError()} />
      </div>}
    </div>
    <Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <div className="bt-end-keys">
        {next ? <Button variant="main" onClick={() => onOpen(next)}>다음 판</Button> : <Button variant="main" icon="refresh" loading={busy} onClick={again}>다시 도전</Button>}
        <Button onClick={onBoard}>연승 순위</Button>
      </div>
    </Dock>
  </>;
}
