/* 연승 도전 (docs/BATTLE_STREAK.md 8장, DESIGN.md "Layout and pages" 연승 도전): the battle page's tab, what a game of a run has at
   stake while it is played, and what it says when it ends. A run climbs floors of five games, the fifth the floor's gatekeeper
   (src/services/streak.js), and the run is shown as the tower itself (tower.js; 2026-11-10, the user: the lift's hall was "너무
   단순해. 전광판 숫자만 반복되는 느낌"): the tab's stage is the tower seen from its foot, beside it the run's streak; going into a
   game is a scene on that tower, in through the door of the game. Its games are played as any server battle (BattleRoom), and the battle function answers as the computer; what a game's
   answer says of the run is kept with the seat (battleService.js). No gatekeeper is drawn before its game (2026-11-09, the user:
   "실루엣들이 뭔가 어정쩡하게 있다"): a gatekeeper's game is told by inverted doors and the floor's last game, and the gatekeeper is
   met on the team preview. */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Modal from "../../components/common/Modal.jsx";
import Button from "../../components/common/Button.jsx";
import Icon from "../../components/common/Icon.jsx";
import Seg from "../../components/common/Seg.jsx";
import { Bang, Chips, Counter, Dock, Podium, Row, SectionHead, Toast } from "../../components/common/Board.jsx";
import StandTable from "../../components/common/StandTable.jsx";
import { siteConfirm } from "../../components/common/SiteDialog.jsx";
import { GoogleMark } from "../../components/layout/SiteHeader.jsx";
import { currentStreakGame, keepStreakDraft, keepStreakStart, readBattleRow, readSeat, readStreakDraft, streakNextGame, viewBattle, warmBattle } from "../../services/battleService.js";
import { VISITOR_EVENT, myPlayerLink, pickStreakDraft, readDailyBoard, readStreakBoard, signInWithGoogle, startStreakRun, visitorSignedIn } from "../../services/visitorAuth.js";
import { STREAK_LIVES, STREAK_STEP, floorGame, floorType, gameWords, streakFloor, streakMaster, swapTier } from "../../services/streak.js";
import { toID } from "../../services/battleLog.js";
import { nameOf, typesOf } from "./Stage.jsx";
import { DUR, climb } from "../../components/common/motion.js";
import { onSpriteError, spriteUrl } from "../../services/teamBuilderCore.js";
import { standTower, towerDive, towerDrop, towerShow } from "./tower.js";
import { MonCard } from "./Sets.jsx";

// the board's months are the run's months in KST, as the database counts them: "2026-11-01"
const monthOf = back => {
  const kst = new Date(Date.now() + 9 * 3600e3);
  let y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1 - back;
  if (m < 1) { m += 12; y -= 1; }
  return { key: `${y}-${String(m).padStart(2, "0")}-01`, label: `${m}월` };
};
// the month's board, read once at a game's end to know whether the run is the account's best this month (null while read or when it cannot be)
function useBoard(daily = false) {
  const [board, setBoard] = useState(null);
  useEffect(() => { let on = true; (daily ? readDailyBoard() : readStreakBoard()).then(rows => on && setBoard(rows), () => {}); return () => { on = false; }; }, [daily]);
  return board;
}

/* 연승 도전 shows no 난이도 anywhere (2026-11-09, the user: "난이도 표기 자체를 연승 도전에서는 없애자"): the computer still plays each
   floor at its own (streak.js streakLevel), but the screens say only the floor and its games */

/* a floor's five games as one bar cut on the seam (the tower draws the same as a floor's five doors, tower.js): won lit, the game being played the
   amber lamp's colour, the next one while the run rests at .382, a lost one muted, the rest an unlit bar's light. at: the game, 1 to 5 */
export function TrackBar({ at, playing = false, lost = false, mini = false }) {
  return <span className={"streak-track-bar" + (mini ? " mini" : "")} aria-hidden="true">
    {Array.from({ length: STREAK_STEP }, (_, i) => <i key={i} data-step={i + 1} className={i + 1 < at ? "won" : i + 1 === at ? (lost ? "lost" : playing ? "now" : "next") : ""} />)}
  </span>;
}
/* the run's lamps (DESIGN.md 도전의 탑, The run's lamps, 2026-11-10): three, lit while left and its housing once out, at the right
   end of the line that names the game. lives: the lamps left; none drawn while the database does not say them (before the lamps'
   SQL has run a run still ends on its first lost game) */
export function RunLamps({ lives }) {
  if (lives == null) return null;
  return <span className="streak-lamps" role="img" aria-label={`남은 램프 ${lives}개`}>
    {Array.from({ length: STREAK_LIVES }, (_, i) => <i key={i} className={"lamp" + (i < lives ? "" : " unlit")} />)}
  </span>;
}
/* the floor as its number in segments and its track. wins: the games won; lost: the run ended on the next game */
function FloorTrack({ wins, lost = false, playing = false }) {
  const floor = streakFloor(wins), at = floorGame(wins);
  return <span className="streak-track" role="img" aria-label={`${floor}층, ${STREAK_STEP}판 가운데 ${at - 1}판 이김`}>
    <Seg value={String(floor)} h={32} cells={String(floor).length} label="" />
    <TrackBar at={at} lost={lost} playing={playing} />
  </span>;
}

/* the tower on the tab (tower.js): the stage's place holds the run's own scene, the round tower at night with the floor the run will
   go to, its path lit as far as the run has come, the run's party on that floor's balcony and the month's other climbers at their
   floors. Pressing the key plays the going in on this very picture. party: species; climbers: { name, wins, live } */
function TowerHall({ wins, live, climbers = null }) {
  const ref = useRef(null);
  const floor = streakFloor(wins), at = floorGame(wins);
  const key = `${floor}|${at}|${live}|${JSON.stringify(climbers || [])}`;
  useLayoutEffect(() => {
    const el = ref.current, draw = () => standTower(el, { floor, at, live, climbers });
    draw();
    const seen = new ResizeObserver(draw);
    seen.observe(el);
    return () => seen.disconnect();
  }, [key]);
  return <div ref={ref} className="tw tw-hall" role="img" aria-label={`${floor}층 ${gameWords(wins)}`} />;
}

/* the opening draft (2026-11-11, docs/BATTLE_STREAK.md 13장): six rows, the tiers strongest first, each three candidates as a team
   preview shows a Pokémon (its picture, name, types and item), one chosen in each row, inverted. A second Mega stands off once one
   is chosen. Its info key opens the whole set. Nothing explains it: the six rows and the key's count say it (rule 22) */
function DraftBoard({ res, draft, picks, onPick }) {
  const [info, setInfo] = useState(null);
  const megaTaken = draft.some((row, i) => row.find(c => c.species === picks[i])?.mega);
  return <section className="streak-draft" aria-labelledby="streak-draft-title">
    <div className="stack streak-draft-rows">
      <div className="pn streak-trades-title"><b id="streak-draft-title">파티 고르기</b><span className="t12 dim">{picks.filter(Boolean).length} / {draft.length}</span></div>
      {draft.map((row, i) => <div key={i} className="stack streak-draft-row" role="radiogroup" aria-label={`${i + 1}번째 줄`}>
        {row.map(c => {
          const on = picks[i] === c.species, off = !on && c.mega && megaTaken;
          return <span key={c.species} className={"streak-draft-cell" + (on ? " inv" : " pn") + (off ? " off" : "")}>
            <button type="button" className="streak-draft-key" role="radio" aria-checked={on} aria-disabled={off || undefined} onClick={() => { if (!off) onPick(i, c.species); }}>
              <img src={spriteUrl(c.species)} alt="" draggable="false" onError={onSpriteError()} />
              <b>{nameOf(res, c.species)}</b>
              <span className="streak-draft-types">{typesOf(res, c.species).map(t => <span key={t} className={`tb-type type-${toID(t)}`}>{res.text.types[t] || t}</span>)}</span>
            </button>
            <button type="button" className="streak-trade-info" onClick={() => setInfo(c)} aria-label={`${nameOf(res, c.species)} 세트 보기`}><b className="bt-i" aria-hidden="true">i</b></button>
          </span>;
        })}
      </div>)}
    </div>
    {info && <Modal label="설명" className="bt-tipsheet" onClose={() => setInfo(null)}>
      <div className="bt-tip"><MonCard res={res} species={info.species} ability={info.ability} item={info.item} moves={info.moves.map(id => ({ id, pp: "" }))} explain /></div>
    </Modal>}
  </section>;
}

/* the doors to the next game (2026-11-11, 13장): two doors, each with the six behind it as a team preview shows them (the even foe
   and the strong one, which lights a lamp again and lets the trade reach a tier up when beaten), or one shut door, the gatekeeper's.
   The floor's type stands on the strip over them. One is chosen, inverted; the key goes through it */
export function DoorPick({ res, wins, doors, value, onChange }) {
  if (!doors?.length) return null;
  const type = floorType(streakFloor(wins));
  const word = { even: "보통 상대", hard: "강한 상대", gate: "수문장" };
  /* no strip of its own over the doors (2026-11-11: with it the break ran past a phone's stage and the trades lost their last row):
     each door names itself and carries the floor's type at its right */
  const chip = <span className={`tb-type type-${toID(type)}`}>{res?.text?.types?.[type] || type}</span>;
  return <section className="streak-doors" aria-label="다음 상대">
    <div className={"stack streak-door-row" + (doors.length === 1 ? " one" : "")} role="radiogroup" aria-label="다음 상대">
      {doors.map((d, i) => <button key={d.kind} type="button" role="radio" aria-checked={value === i} onClick={() => onChange(i)}
        className={"streak-door" + (value === i || d.kind === "gate" ? " inv" : " pn")}>
        <span className="streak-door-head"><b>{word[d.kind]}{d.kind === "hard" && <span className="streak-door-gain" aria-label="이기면 램프 하나와 승급"><i className="lamp" />+</span>}</b>{chip}</span>
        {d.species.length > 0 && <span className="streak-door-six">{d.species.map(s => <img key={s} src={spriteUrl(s)} alt={nameOf(res, s)} draggable="false" onError={onSpriteError()} />)}</span>}
      </button>)}
    </div>
  </section>;
}

/* a game of a run, beside it while it is played (the menu): which game, the streak riding on it lit at 32 with its unit, and the
   floor's track joined under it. A floor's gatekeeper inverts. wins: the games won before it */
export function StreakStake({ wins, lives = null }) {
  const master = streakMaster(wins);
  return <div className="stack streak-stake">
    <div className={(master ? "inv" : "pn") + " streak-stake-head"}>
      <span className="t12 dim streak-named">{gameWords(wins)}<RunLamps lives={lives} /></span>
      <span className="streak-stake-board"><Seg value={String(wins)} h={32} cells={2} label={`${wins}연승`} /><span className="t15">연승</span></span>
    </div>
    <div className="pn streak-stake-track"><FloorTrack wins={wins} playing /></div>
  </div>;
}

/* the stake on a run's team preview (DESIGN.md 연승 도전, Floors and the stake, 2026-11-09): a band over the foe's six, the game and
   the streak riding on it, inverted on a gatekeeper's game, where the gatekeeper's cell among the six inverts with it (battle.css) */
export function StreakBand({ wins, lives = null }) {
  const master = streakMaster(wins);
  return <div className={(master ? "inv" : "pn") + " streak-band"}>
    <b className="t15 streak-named">{gameWords(wins)}<RunLamps lives={lives} /></b>
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

/* this device's run, read again from its game: playing (a game on), resting (the game ended and the run goes on: won, or lost with a
   lamp left; the next game not yet opened), or none (null). A game that ended while its player was away (the clock) has told its
   seat nothing, so the seat asks once (viewBattle keeps the run's answer) */
function useRun(daily = false) {
  const [run, setRun] = useState(null);
  useEffect(() => {
    setRun(null);
    let on = true;
    const id = currentStreakGame(daily);
    const seat = id && readSeat(id);
    if (!seat) return undefined;
    const of = (s, playing) => ({ id, wins: s.wins ?? 0, lives: s.lives, game: s.game ?? (s.wins ?? 0) + 1, playing, party: s.party || null, doors: playing ? null : s.doors || null });
    readBattleRow(id).then(async row => {
      if (row?.status === "active") { if (on) setRun(of(seat, true)); return; }
      if (row?.status !== "ended") return;
      if (typeof seat.won !== "boolean") await viewBattle(id).catch(() => {});
      const told = readSeat(id);
      if (on && typeof told?.won === "boolean" && !told.ended) setRun({ ...of(told, false), again: !told.won });
    }, () => {});
    return () => { on = false; };
  }, [daily]);
  return run;
}

/* going into a game of a run is a scene on the tower (tower.js): it switches on over the stage the key was pressed under (on the tab
   it already stands), the game just won lights and the lamp steps on, or the lift rises a floor after a gatekeeper, all while the
   game is made and read; then the view goes in through the lamp's door, which shuts as two doors, and the next screen parts them
   (BattlePage.jsx useMatchLit). wins: the wins before the game gone into; null (a game being played, gone back into) plays nothing.
   again: a lost game gone into again, where no door was won.
   Returns shown (the tower has been read, and the court is dark) and leave (in through the door while the screen goes out; with
   no scene, the screen's own going out, leaveNow) */
export const floorCall = (dark, scope, wins, leaveNow = async () => {}, again = false) => {
  if (wins == null) return { shown: dark, leave: leaveNow };
  const shown = towerShow(document.querySelector(`${scope} .tw-hall`) || document.querySelector(`${scope} .bt-stagebox`), {
    floor: streakFloor(wins), at: floorGame(wins), climbing: !again && wins > 0 && floorGame(wins) === 1, master: streakMaster(wins), again,
  });
  return { shown: Promise.all([dark, shown]).catch(() => {}), leave: towerDive };
};

/* the run lit: its streak at 84 (this device's run while it goes on, else the month's best of the account; dark when there is none).
   No line explains the rule; the tower beside it shows it */
function RunBoard({ run, best, approved, leader = null, month = "", daily = false }) {
  // with no run of its own, the month's first place stands lit instead of dark cells that read as 88 (2026-11-09)
  const lead = !run && !approved && leader;
  const value = run ? run.wins : approved && best != null ? best : lead ? leader.wins : null;
  const label = run ? gameWords(run.wins) : approved ? (daily ? "오늘 내 기록" : "이번 달 내 최고 기록") : lead ? `${daily ? "오늘" : month} 1위 ${leader.trainer_name}` : daily ? "오늘의 탑" : "도전의 탑";
  return <div className="pn streak-hero">
    <span className="t12 dim streak-named"><span className="streak-hero-label">{run && <i className="lamp sig" aria-hidden="true" />}{label}</span>{run && <RunLamps lives={run.lives} />}</span>
    <span className="streak-hero-board"><Seg value={value == null ? "" : String(value)} h={84} cells={value == null ? 1 : 2} label={value == null ? "" : `${value}연승`} /><span className="t20">연승</span></span>
  </div>;
}

export function StreakOpen({ res, onOpen, go, tabs, enter, goingIn, standUp, leaveNow = async () => {}, onPractice = null }) {
  const account = useAccount();
  /* the two kinds of run (2026-11-11, 13장): the month's, ranked by the month, and 오늘의 탑, once a day, the same tower for everyone
     that day, ranked by the day. One of each may go on at once */
  const [kind, setKind] = useState("month");
  const daily = kind === "day";
  const run = useRun(daily);
  const [draft, setDraft] = useState(() => readStreakDraft(false));
  const [picks, setPicks] = useState([]);
  const [door, setDoor] = useState(0);
  // the hall stands again (in place of the draft) while the first game is gone into, so the going in plays on the tower
  const [entering, setEntering] = useState(false);
  const [back, setBack] = useState(0);
  const [board, setBoard] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // a refusal after the court went dark stands it up again, lit
  const [round, setRound] = useState(0);
  const month = monthOf(back), other = monthOf(back ? 0 : 1);
  useEffect(() => { setDraft(readStreakDraft(daily)); setPicks([]); setDoor(0); setError(""); }, [daily]);
  useEffect(() => {
    let on = true;
    setBoard(undefined);
    (daily ? readDailyBoard() : readStreakBoard(back ? month.key : undefined)).then(rows => on && setBoard(rows), () => on && setBoard(false));
    return () => { on = false; };
  }, [back, daily, account?.status]);
  const approved = account?.status === "approved";
  useWarm(approved);
  const wins = run?.wins ?? 0;
  const rows = Array.isArray(board) ? board : null;
  const mine = back ? null : rows?.find(r => r.mine);
  // the draft waits only while no run of its kind is on (a run started on another device leaves this one's stale)
  const drafting = approved && !run && draft?.draft?.length ? draft.draft : null;
  const doneToday = daily && !run && !drafting && Boolean(mine);
  // going in, as the lobby does: the court goes dark while the game is made and read, then its screen lights
  const goInto = async (make, next, again = false) => {
    if (busy) return;
    setBusy(true); setError("");
    const dark = goingIn(".bt-lobby-main");
    const ride = floorCall(dark, ".bt-lobby-main", next, leaveNow, again);
    try {
      const made = await make();
      await enter(made.id, ride.shown);
      await ride.leave();
      onOpen(made.id);
    } catch (e) {
      await dark;
      towerDrop(); standUp(); setError(e.message); setBusy(false); setEntering(false); setRound(n => n + 1);
    }
  };
  // a run begins with its draft (no game yet, so nothing goes dark): the candidates stand in the tower's place
  const start = async () => {
    if (busy) return;
    if (run && !(await siteConfirm({ title: "새로 도전할까요?", body: `진행 중인 도전은 ${run.wins}연승으로 끝납니다.`, confirmLabel: "새로 도전" }))) return;
    setBusy(true); setError("");
    try {
      const made = await startStreakRun(daily);
      keepStreakDraft(made, daily);
      setDraft(made); setPicks([]);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  // the draft picked: the tower stands again with the party on its balcony, and the first game is gone into on it
  const depart = () => {
    flushSync(() => setEntering(true));
    goInto(async () => keepStreakStart(await pickStreakDraft(picks, daily)), 0);
  };
  const resume = () => goInto(run.playing ? async () => ({ id: run.id }) : () => streakNextGame(run.id, null, door), run.playing ? null : run.wins, Boolean(run?.again));
  /* until the account can play, a battle with the computer stands beside the key, so a first visitor plays at once instead of waiting
     on a sign-in and an operator (DESIGN.md 연승 도전, 2026-11-09) */
  const practice = onPractice && <Button onClick={onPractice}>컴퓨터와 연습</Button>;
  const left = drafting ? drafting.length - picks.filter(Boolean).length : 0;
  const keys = account === undefined ? <Button variant="main" loading>도전 시작</Button>
    : account === null ? <><Button variant="main" onClick={() => signInWithGoogle("", window.location.href.split("#")[0])}><GoogleMark />구글 로그인</Button>{practice}</>
    : !approved ? <><Button variant="main" disabled={account.status === "pending"} onClick={() => go?.("records", { tab: "trainer", me: "1" })}>{account.status === "pending" ? "이름 확인 중" : "트레이너 이름 정하기"}</Button>{practice}</>
    : drafting ? <Button variant="main" icon={left ? "check" : undefined} disabled={left > 0} onClick={depart} loading={busy}>{left ? `${left}마리 더 고르기` : "출발"}</Button>
    : run ? <><Button variant="main" onClick={resume} loading={busy}>이어서 하기</Button>{!daily && <Button onClick={start} disabled={busy}>새로 도전</Button>}</>
    : doneToday ? <Button variant="main" disabled>오늘 도전 완료</Button>
    : <Button variant="main" onClick={start} loading={busy}>{daily ? "오늘의 탑 시작" : "도전 시작"}</Button>;
  /* what the key cannot say by itself: why it waits. Signed out it says nothing: the key is 구글 로그인 and the month's board beside it
     shows the names it keeps (2026-11-10, the user: no sentence where the form already says it). Only a name waiting on the operators
     needs the sentence, as a grey line in the dock over the key that waits, never as a slab */
  const note = account && !approved && account.status === "pending" ? "운영진이 트레이너 이름을 확인하면 도전할 수 있습니다." : "";
  // the board as the home's and the records' ranking reads it; a live run opens its game to watch
  const placed = rows?.map(r => ({ rank: r.place, name: r.trainer_name, points: r.wins, live: r.live, open: r.live && r.battle_id ? () => onOpen(r.battle_id) : null }));
  // the other climbers on the tower: this board's names but one's own (one's own run is the path)
  const climbers = !back && rows ? rows.filter(r => !r.mine).slice(0, 12).map(r => ({ name: r.trainer_name, wins: r.wins, live: r.live })) : null;
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      {tabs}
      <div className="bt-lobby">
        <div className="bt-lobby-main">
          <div className="streak-scene">
            {drafting && !entering
              ? <DraftBoard res={res} draft={drafting} picks={picks} onPick={(i, sp) => setPicks(p => { const n = [...p]; n[i] = n[i] === sp ? undefined : sp; return n; })} />
              : <TowerHall key={`${kind}${round}`} wins={wins} live={Boolean(run?.playing)} climbers={climbers} />}
            {!(drafting && !entering) && <div className="streak-mode"><Chips value={kind} onChange={setKind} label="도전 종류" options={[["month", "이번 달"], ["day", "오늘의 탑"]]} /></div>}
          </div>
          {run && !run.playing && run.doors && <DoorPick res={res} wins={run.wins} doors={run.doors} value={door} onChange={setDoor} />}
          <Dock toast={error ? <Toast error>{error}</Toast> : null}>
            {note && <p className="t12 dim bt-gate-line">{note}</p>}
            <div className="bt-end-keys">{keys}</div>
          </Dock>
        </div>
        <div className="bt-lobby-set streak-side">
          {/* the side opens as 배틀 열기's does, with a label over its first panel, so the two tabs' arenas start on one line
              (2026-11-09, the user: "연승도전과 배틀열기의 위 여백이 다른데") */}
          <section className="q" aria-labelledby="streak-run-label">
            <span className="q-label t12 dim" id="streak-run-label">{daily ? "오늘의 탑" : "내 도전"}</span>
            <RunBoard run={run} best={rows ? mine?.wins ?? 0 : null} approved={approved} leader={!back ? rows?.[0] : null} month={month.label} daily={daily} />
          </section>
          <section aria-labelledby="streak-board">
            {daily ? <SectionHead id="streak-board" title="오늘 순위" />
              : <SectionHead id="streak-board" title={`${month.label} 순위`} link={`${other.label} 보기`} onLink={() => setBack(b => (b ? 0 : 1))} />}
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

/* the swap after a won game within a floor (rebuilt 2026-11-09 second round, the user: "내 파티 상대 파티도 이거 텍스트가 붕 떠
   있어서 직관적이지도 않고, 사실 매 판 끝날 때마다 가장 중요한 요소인데 다음 판과 같은 맥락에서 아래로 한참 내려야 있어"): a table
   of trades. Every party is balanced one Pokémon a tier (partyBalance.js), so a swap is tier for tier: each row is one tier, ours on the
   left and theirs on the right, so a row reads as the trade it is, and 내 파티 and 상대 파티 are the cells of the table's head row, never
   words floating over it. A tap on either side of a row chooses the row, both inverted; a side that would bring a second species
   stands off and its info says why. Each side carries its info key at its right end (its set, the foe's as far as the game showed
   it). Under the table 새 파티 뽑기 is a key of the row's height: on, our side goes to ? and theirs off. ours, theirs: { species, name }
   in tier order */
const OFF_WHY = "같은 포켓몬이 둘이 되어 바꿀 수 없습니다.";
function SwapTable({ ours, theirs, chosen, matchOurs, matchTheirs, onPick, blocked = [], onInfo = null, up = false }) {
  const whyOf = (mine, s) => blocked.find(b => (mine ? b.give : b.take) === s)?.why || OFF_WHY;
  const side = (mine, { species: s, name }) => {
    const off = !(mine ? matchTheirs(s) : matchOurs(s));
    const on = chosen.has(`${mine ? "give" : "take"}:${s}`);
    const info = `swap:${mine ? "own" : "foe"}:${s}:${off ? whyOf(mine, s) : ""}`;
    return <span key={`${mine ? "o" : "t"}${s}`} className={"streak-trade" + (mine ? " ours" : " theirs") + (on ? " inv" : " pn") + (off ? " off" : "")}>
      <button type="button" className="streak-trade-key" aria-pressed={on} aria-disabled={off || undefined} data-info={info}
        onClick={() => { if (!off) onPick(mine, s); }} aria-label={`${mine ? "내" : "상대"} ${name}${off ? ", 바꿀 수 없음" : ""}`}>
        <img src={spriteUrl(s)} alt="" draggable="false" onError={onSpriteError()} />
        <b>{name}</b>
      </button>
      {onInfo && <button type="button" className="streak-trade-info" onClick={() => onInfo(info)} aria-label={`${name} 세트 보기`}><b className="bt-i" aria-hidden="true">i</b></button>}
    </span>;
  };
  /* read without pressing anything (2026-11-10, the user: "직접 눌러보지 않아도 화면만 보고 아 매 판 끝날 때마다 포켓몬을 바꿀 수
     있구나! 하고 알게 해줘"): the table's name stands as its own top strip across it (포켓몬 교환; the same day, as a label over it, the
     user: "다른 건 전부 네모 안에 있는데 이것만 날 것 텍스트라"), and between the two sides of every row stands the trade's own mark,
     two arrows passing each other, lit on the row chosen; the head row's middle carries it too */
  const chosenRow = i => chosen.has(`give:${ours[i]?.species}`);
  return <section className="streak-swap" aria-labelledby="streak-swap-title">
    <div className="stack streak-trades" role="table">
      <div className="pn streak-trades-title"><b id="streak-swap-title">{up ? "포켓몬 교환 승급" : "포켓몬 교환"}</b>
        {/* the last refusal, lit where the table is read: the strip keeps its height, so nothing moves */}
        {blocked.length > 0 && <span key={blocked.length} className="streak-trades-note" role="alert"><Bang /><span>{blocked.at(-1).why}</span></span>}</div>
      <span className="pn streak-trades-head" role="columnheader">내 파티</span>
      <span className="pn streak-trades-mark" aria-hidden="true"><Icon n="swap" size={20} /></span>
      <span className="pn streak-trades-head" role="columnheader">상대 파티</span>
      {ours.map((m, i) => <React.Fragment key={m.species}>{side(true, m)}
        <span className={(chosenRow(i) ? "inv" : "pn") + " streak-trades-mark"} aria-hidden="true"><Icon n="swap" size={20} /></span>
        {theirs[i] && side(false, theirs[i])}</React.Fragment>)}
    </div>
  </section>;
}

/* The end of a game of a run, for its player. The break between games stands in the stage's place (stage: the stage box), where the
   eye already is and where there is room, so nothing is scrolled to (2026-11-09 second round): its head is the run's count (switching
   from the last count to the new one as a score does) beside the next game, named, with its floor's track and its gatekeeper waiting at
   the end (inverted when the next game is the gatekeeper's); under it the trades. After a loss the head is the count and the run's place
   on the month's board, and the track shows where it fell. The deck keeps only the result and the keys (다음 판 or 다시 도전, and
   나가기). Playing the replay puts the break away (away) and the stage shows it; back at the end it lights again. The run rests after a
   win until 다음 판 opens the next game, so 나가기 loses nothing. ours, theirs: the two parties' species, as the team preview showed
   them (none after a reload: then there is no swap) */
export function StreakEnd({ id, won, res = null, onOpen, onOut, enter, goingIn, standUp, leaveNow = async () => {}, settle = async () => {}, onInfo = null, stage = null, away = false, ours: ourSix = [], theirs: theirSix = [] }) {
  const seat = readSeat(id);
  const board = useBoard(Boolean(seat?.daily));
  // the door to the next game, the even one unless chosen (2026-11-11)
  const [door, setDoor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // the swap chosen, { give, take }: one a game (2026-11-10, the user: "한 라운드에 한 포켓몬만 바꿀 수 있게 해줘"); kept as a list for the server's shape
  const [pairs, setPairs] = useState([]);
  // pairs the server refused (an item the party already holds can only be seen there): their rows stand off, the rest stay chosen
  const [blocked, setBlocked] = useState([]);
  const wins = seat?.wins ?? 0;
  /* the run goes on: after a win, and after a lost game the seat has been told of (its answer, or its view read again) while a lamp
     is left. A lost game not yet told of (the clock, before the view comes back) stands as the run's end until it is */
  const resting = !seat?.ended && (won || typeof seat?.won === "boolean");
  const lives = seat?.lives;
  const master = streakMaster(wins);
  const best = Boolean(board?.find(r => r.mine && wins > 0 && r.wins === wins));
  const place = board?.find(r => r.mine && wins > 0)?.place ?? null;
  const [shown, setShown] = useState(resting && won && wins > 0 ? wins - 1 : wins);
  const box = useRef(null);
  useWarm(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(wins), DUR.light);
    const el = box.current;
    // the game just won brightens in its new light, then the next one lights (motion.js climb)
    if (el && resting && won) climb(el.querySelector(`[data-step="${floorGame(wins) - 1}"]`), el.querySelector(`[data-step="${floorGame(wins)}"]`));
    return () => clearTimeout(timer);
  }, [wins, resting, stage]);
  // each six in tier order, so a pair of one tier is a row (SwapTable)
  const byTier = list => [...list].sort((a, b) => (swapTier(a.species) ?? 9) - (swapTier(b.species) ?? 9));
  const ours = byTier(ourSix), theirs = byTier(theirSix);
  // ponytail: the species are matched by name; a party with two forms of one species cannot be drawn (one of each species)
  // every won game offers its trade, a gatekeeper's too: the party a run started with goes all the way up (2026-11-10)
  const swapping = resting && won && ours.length === 6 && theirs.length === 6;
  // after a gatekeeper or a strong door the trade reaches a tier up: theirs one tier stronger for ours (13장)
  const reach = won ? Number(seat?.reach) || 0 : 0;
  /* a lost game's recap (패배 복기, 2026-11-10): the sets it was lost to, whole, as the cards a party is read on. The replay's keys
     stand in the deck under it as after every game */
  const recap = !won && res && seat?.foe?.length ? seat.foe : null;
  // tier for tier when the tiers are measured; any for any otherwise (as before the balance)
  const tiered = swapping && swapTier(ours[0].species) != null;
  // a match never brings a second species into our party (the screen sees species; the items the server settles, streak.js swapParty)
  const kind = s => String(s).split("-")[0];
  const fits = (mine, foe) => !ours.some(o => o.species !== mine && kind(o.species) === kind(foe));
  const matchIn = side => s => {
    // the match offered first is the promotion when the trade reaches up: ours a tier under theirs; else the same tier
    const t = swapTier(s), want = side === ours ? [t + reach, t] : [t - reach, t];
    const found = !tiered ? side[0]?.species || "" : want.map(w => side.find(o => swapTier(o.species) === w)?.species).find(Boolean) || "";
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
    // one pair: choosing another row moves the choice there
    setPairs([pair]);
  };
  const swap = swapping && pairs.length ? pairs : null;
  const goInto = async (make, next) => {
    if (busy) return;
    setBusy(true); setError("");
    // a replay still playing is put at its end first, so the court goes dark on the game's end (BattlePage.jsx Arena settle)
    await settle();
    const dark = goingIn(".bt-main");
    const ride = floorCall(dark, ".bt-main", next, leaveNow, resting && !won);
    try {
      const made = await make();
      await enter(made.id, ride.shown);
      await ride.leave();
      onOpen(made.id);
    } catch (e) {
      await dark; towerDrop(); standUp(); setBusy(false);
      /* a refused pair stands off and is let go, and the trade table says why on its own title strip, where the eye already is; a toast
         standing in the deck's flow pushed 다음 판 down and broke the end's row (2026-11-10, the user: "왜곡이 생겨"). The other pairs
         stay chosen. Without a named pair the toast says it, all are let go, and the key says 다음 판 again */
      if (e.pair?.give && e.pair?.take) { setBlocked(b => [...b, { ...e.pair, why: e.message }]); setPairs(p => p.filter(x => x.give !== e.pair.give)); }
      else { setError(e.message); setPairs([]); }
    }
  };
  const brk = <section ref={box} className={"streak-break" + (away ? " away" : "")} aria-label={resting ? "다음 판" : "도전 끝"}>
    <div className="stack streak-break-head">
      <Counter label={best ? "이번 달 내 최고 기록" : "이번 도전"} value={shown} after={<span className="t15">연승</span>} />
      {resting
        ? <div className={(master ? "inv" : "pn") + " streak-next"} role="img" aria-label={`다음 판 ${gameWords(wins)}`}>
            <b className="t15 streak-named">{gameWords(wins)}<RunLamps lives={lives} /></b>
            <FloorTrack wins={wins} />
          </div>
        /* a lost run: its place on the month's board as a counter of the same size beside the streak (the two stood at 84 and 116,
           the place's panel holding the track under it); the floor it fell on stays in the head's window */
        : place != null ? <Counter label={`${monthOf(0).label} 순위`} value={place} after={<span className="t15">위</span>} />
        : <div className="pn streak-next"><b className="t15 streak-named">{gameWords(wins)}<RunLamps lives={lives} /></b><FloorTrack wins={wins} lost /></div>}
    </div>
    {recap && <div className="stack streak-recap" role="group" aria-label="상대 파티">
      <span className="pn streak-trades-title"><b>상대 파티</b></span>
      {recap.map(m => <MonCard key={m.species} res={res} species={m.species} ability={m.ability} item={m.item || null} moves={(m.moves || []).map(name => ({ id: name, pp: "" }))} compact />)}
    </div>}
    {/* a lost run stands as a scene of its own: the floors it climbed as a tower, the highest on top, then the month's first three */}
    {!resting && <div className="stack streak-tower" role="img" aria-label={`${streakFloor(wins)}층 ${gameWords(wins)}에서 끝났습니다.`}>
      {Array.from({ length: Math.min(streakFloor(wins), 5) }, (_, i) => streakFloor(wins) - i).map(f => <span key={f} className="pn streak-tower-floor">
        <Seg value={String(f)} h={32} cells={String(streakFloor(wins)).length} label="" />
        <TrackBar at={f < streakFloor(wins) ? STREAK_STEP + 1 : floorGame(wins)} lost={f === streakFloor(wins)} />
      </span>)}
    </div>}
    {!resting && board?.length > 0 && <section className="streak-break-board" aria-labelledby="streak-end-board">
      <SectionHead id="streak-end-board" title={`${monthOf(0).label} 순위`} />
      <StandTable rows={board.slice(0, 3).map(r => ({ rank: r.place, name: r.trainer_name, points: r.wins, live: r.live }))} placed unit="연승" head="연승" />
    </section>}
    {resting && <DoorPick res={res} wins={wins} doors={seat?.doors} value={door} onChange={setDoor} />}
    {swapping && <SwapTable ours={ours} theirs={theirs} up={reach > 0}
      chosen={new Set(pairs.flatMap(p => [`give:${p.give}`, `take:${p.take}`]))}
      matchTheirs={matchIn(theirs)} matchOurs={matchIn(ours)} onPick={pick} blocked={blocked} onInfo={onInfo} />}
  </section>;
  return <>
    {stage && createPortal(brk, stage)}
    <Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <div className="bt-end-keys">
        {resting ? <Button variant="main" loading={busy} onClick={() => goInto(() => streakNextGame(id, swap, door), wins)}>{!won ? "이어서 하기" : swap ? "바꾸고 다음 판" : "다음 판"}</Button>
          /* a new run begins with its draft, on the tab (2026-11-11); 오늘의 탑 is once a day, so its end has no 다시 도전 */
          : !seat?.daily && <Button variant="main" icon="refresh" loading={busy} onClick={async () => {
            setBusy(true);
            try { keepStreakDraft(await startStreakRun(false), false); onOut(); } catch (e) { setError(e.message); setBusy(false); }
          }}>다시 도전</Button>}
        <Button onClick={onOut} disabled={busy}>나가기</Button>
      </div>
    </Dock>
  </>;
}
