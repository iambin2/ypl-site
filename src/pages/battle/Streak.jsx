/* 연승 도전 (docs/BATTLE_STREAK.md 8장, DESIGN.md "Layout and pages" 연승 도전): the battle page's tab, what a game of a run has at
   stake while it is played, and what it says when it ends. A run climbs floors of five games, the fifth the floor's gatekeeper
   (src/services/streak.js), and it climbs them by lift (2026-11-09, the user: "엘리베이터 컨셉으로"): the tab's stage is the lift's
   hall, its doors shut with the floor lit on them, beside it the run's streak and the floor keys; going into a game rides the lift
   (lift.js). Its games are played as any server battle (BattleRoom), and the battle function answers as the computer; what a game's
   answer says of the run is kept with the seat (battleService.js). No gatekeeper is drawn before its game (2026-11-09, the user:
   "실루엣들이 뭔가 어정쩡하게 있다"): a gatekeeper's game is told by inverted doors and the floor's last game, and the gatekeeper is
   met on the team preview. */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "../../components/common/Button.jsx";
import Icon from "../../components/common/Icon.jsx";
import Seg from "../../components/common/Seg.jsx";
import { Bang, Counter, Dock, Podium, Row, SectionHead, Toast } from "../../components/common/Board.jsx";
import StandTable from "../../components/common/StandTable.jsx";
import { siteConfirm } from "../../components/common/SiteDialog.jsx";
import { GoogleMark } from "../../components/layout/SiteHeader.jsx";
import { currentStreakGame, keepStreakStart, readBattleRow, readSeat, streakNextGame, warmBattle } from "../../services/battleService.js";
import { VISITOR_EVENT, myPlayerLink, readStreakBoard, signInWithGoogle, startStreakRun, visitorSignedIn } from "../../services/visitorAuth.js";
import { STREAK_STEP, floorGame, gameWords, streakFloor, streakMaster, swapTier } from "../../services/streak.js";
import { DUR, climb } from "../../components/common/motion.js";
import { onSpriteError, spriteUrl } from "../../services/teamBuilderCore.js";
import { liftClose, liftDrop, liftMarkup } from "./lift.js";
import { LobbyArena } from "./Stage.jsx";

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
   floor at its own (streak.js streakLevel), but the screens say only the floor and its games */

/* a floor's five games as one bar cut on the seam (the lift's doors draw the same in lift.js): won lit, the game being played the
   amber lamp's colour, the next one while the run rests at .382, a lost one muted, the rest an unlit bar's light. at: the game, 1 to 5 */
export function TrackBar({ at, playing = false, lost = false, mini = false }) {
  return <span className={"streak-track-bar" + (mini ? " mini" : "")} aria-hidden="true">
    {Array.from({ length: STREAK_STEP }, (_, i) => <i key={i} data-step={i + 1} className={i + 1 < at ? "won" : i + 1 === at ? (lost ? "lost" : playing ? "now" : "next") : ""} />)}
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

/* the lift's hall on the tab: the stage's place holds the lift's doors, shut, with the floor the run will go to lit on them (the same
   markup the lift rides in, lift.js), so pressing the key carries this very picture into the game */
function LiftHall({ wins, live }) {
  const floor = streakFloor(wins), at = floorGame(wins);
  return <div className={"lift-hall" + (streakMaster(wins) ? " inv" : "")} role="img" aria-label={`${floor}층 ${gameWords(wins)}`}
    dangerouslySetInnerHTML={{ __html: liftMarkup({ floor, at, live }) }} />;
}

/* the floor keys, as a lift's panel (2026-11-09): eight floors on the seam, the floor stood on inverted, the floors passed lit, the floors
   above muted; past the eighth floor the panel follows the run */
function FloorKeys({ wins }) {
  const floor = streakFloor(wins), first = floor <= 8 ? 1 : floor - 6;
  return <div className="stack streak-keys" role="img" aria-label={`${floor}층`}>
    {Array.from({ length: 8 }, (_, i) => first + i).map(f =>
      <span key={f} className={f === floor ? "inv" : "pn" + (f > floor ? " up" : "")}><Seg value={String(f)} h={32} cells={String(f).length} label="" /></span>)}
  </div>;
}

/* a game of a run, beside it while it is played (the menu): which game, the streak riding on it lit at 32 with its unit, and the
   floor's track joined under it. A floor's gatekeeper inverts. wins: the games won before it */
export function StreakStake({ wins }) {
  const master = streakMaster(wins);
  return <div className="stack streak-stake">
    <div className={(master ? "inv" : "pn") + " streak-stake-head"}>
      <span className="t12 dim">{gameWords(wins)}</span>
      <span className="streak-stake-board"><Seg value={String(wins)} h={32} cells={2} label={`${wins}연승`} /><span className="t15">연승</span></span>
    </div>
    <div className="pn streak-stake-track"><FloorTrack wins={wins} playing /></div>
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

/* going into a game of a run is a ride in the lift (lift.js): the doors shut over the stage the key was pressed under (from the tab
   the hall's doors stand shut already) and the floor of the game gone into lights on them while the game is made and read; the next
   screen opens them (BattlePage.jsx useMatchLit). A floor's first game after its gatekeeper climbs: the floor left switches to the new
   one on the doors. wins: the wins before the game gone into; null (a game being played, gone back into) rides nothing */
export const floorCall = (dark, scope, wins) => (wins == null ? dark
  : Promise.all([dark, liftClose(document.querySelector(`${scope} .lift-hall`) || document.querySelector(`${scope} .bt-stagebox`), {
    floor: streakFloor(wins), at: floorGame(wins), climbing: wins > 0 && floorGame(wins) === 1, master: streakMaster(wins),
    shut: Boolean(document.querySelector(`${scope} .lift-hall`)),
  })]).catch(() => {}));

/* the run lit: its streak at 84 (this device's run while it goes on, else the month's best of the account; dark when there is none),
   then the tower it climbs, the floor it stands on as its stairs. No line explains the rule; the floors show it */
function RunBoard({ run, best, approved, leader = null, month = "" }) {
  // with no run of its own, the month's first place stands lit instead of dark cells that read as 88 (2026-11-09)
  const lead = !run && !approved && leader;
  const value = run ? run.wins : approved && best != null ? best : lead ? leader.wins : null;
  const label = run ? "진행 중인 도전" : approved ? "이번 달 내 최고 기록" : lead ? `${month} 1위 ${leader.trainer_name}` : "도전의 탑";
  return <div className="stack">
    <div className="pn streak-hero">
      <span className="t12 dim streak-hero-label">{run && <i className="lamp sig" aria-hidden="true" />}{label}</span>
      <span className="streak-hero-board"><Seg value={value == null ? "" : String(value)} h={84} cells={value == null ? 1 : 2} label={value == null ? "" : `${value}연승`} /><span className="t20">연승</span></span>
    </div>
    <FloorKeys wins={run?.wins ?? 0} />
  </div>;
}

export function StreakOpen({ res, onOpen, go, tabs, enter, goingIn, standUp, leaveNow = async () => {}, onPractice = null }) {
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
      await leaveNow();
      onOpen(made.id);
    } catch (e) {
      await dark;
      liftDrop(); standUp(); setError(e.message); setBusy(false); setRound(n => n + 1);
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
  const keys = account === undefined ? <Button variant="main" loading>도전 시작</Button>
    : account === null ? <><Button variant="main" onClick={() => signInWithGoogle("", window.location.href.split("#")[0])}><GoogleMark />구글 로그인</Button>{practice}</>
    : !approved ? <><Button variant="main" disabled={account.status === "pending"} onClick={() => go?.("records", { tab: "trainer", me: "1" })}>{account.status === "pending" ? "이름 확인 중" : "트레이너 이름 정하기"}</Button>{practice}</>
    : run ? <><Button variant="main" onClick={resume} loading={busy}>이어서 하기</Button><Button onClick={start} disabled={busy}>새로 도전</Button></>
    : <Button variant="main" onClick={start} loading={busy}>도전 시작</Button>;
  /* what the key cannot say by itself: why it waits. Signed out it says nothing: the key is 구글 로그인 and the month's board beside it
     shows the names it keeps (2026-11-10, the user: no sentence where the form already says it; the line stood as a slab over the
     run's counter on a phone's first screen, and as a second white bar under the key on a desktop) */
  /* signed in without a name the key says it too (트레이너 이름 정하기, which leads to 내 기록 찾기); only a name waiting on the
     operators needs the sentence, and it stands as a grey line in the dock over the key that waits, never as a slab (2026-11-10:
     for the three signed-in states the slab was still there, over the lower half of the counter) */
  const note = account && !approved && account.status === "pending" ? "운영진이 트레이너 이름을 확인하면 도전할 수 있습니다." : "";
  // the board as the home's and the records' ranking reads it; a live run opens its game to watch
  const placed = rows?.map(r => ({ rank: r.place, name: r.trainer_name, points: r.wins, live: r.live, open: r.live && r.battle_id ? () => onOpen(r.battle_id) : null }));
  return (
    <div className="bt-page">
      <h1 className="t32">배틀</h1>
      {tabs}
      <div className="bt-lobby">
        <div className="bt-lobby-main">
          <LobbyArena res={res} foe="컴퓨터" foeNote=""
            ours={<span className="bt-who"><b className={"bt-trainer" + (approved ? "" : " mute")}>{approved ? account.requested_name : "나"}</b><span className={"bt-who-note" + (run ? "" : " idle")}>{run ? gameWords(wins) : "랜덤 파티"}</span></span>}>
            <LiftHall key={round} wins={wins} live={Boolean(run?.playing)} />
          </LobbyArena>
          <Dock toast={error ? <Toast error>{error}</Toast> : null}>
            {note && <p className="t12 dim bt-gate-line">{note}</p>}
            <div className="bt-end-keys">{keys}</div>
          </Dock>
        </div>
        <div className="bt-lobby-set streak-side">
          {/* the side opens as 배틀 열기's does, with a label over its first panel, so the two tabs' arenas start on one line
              (2026-11-09, the user: "연승도전과 배틀열기의 위 여백이 다른데") */}
          <section className="q" aria-labelledby="streak-run-label">
            <span className="q-label t12 dim" id="streak-run-label">내 도전</span>
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

/* the swap after a won game within a floor (rebuilt 2026-11-09 second round, the user: "내 파티 상대 파티도 이거 텍스트가 붕 떠
   있어서 직관적이지도 않고, 사실 매 판 끝날 때마다 가장 중요한 요소인데 다음 판과 같은 맥락에서 아래로 한참 내려야 있어"): a table
   of trades. Every party is balanced one Pokémon a tier (partyBalance.js), so a swap is tier for tier: each row is one tier, ours on the
   left and theirs on the right, so a row reads as the trade it is, and 내 파티 and 상대 파티 are the cells of the table's head row, never
   words floating over it. A tap on either side of a row chooses the row, both inverted; a side that would bring a second species
   stands off and its info says why. Each side carries its info key at its right end (its set, the foe's as far as the game showed
   it). Under the table 새 파티 뽑기 is a key of the row's height: on, our side goes to ? and theirs off. ours, theirs: { species, name }
   in tier order */
const OFF_WHY = "같은 포켓몬이 둘이 되어 바꿀 수 없습니다.";
function SwapTable({ ours, theirs, chosen, matchOurs, matchTheirs, onPick, blocked = [], onInfo = null }) {
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
      <div className="pn streak-trades-title"><b id="streak-swap-title">포켓몬 교환</b>
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
export function StreakEnd({ id, won, onOpen, onOut, enter, goingIn, standUp, leaveNow = async () => {}, settle = async () => {}, onInfo = null, stage = null, away = false, ours: ourSix = [], theirs: theirSix = [] }) {
  const seat = readSeat(id);
  const board = useBoard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // the swap chosen, { give, take }: one a game (2026-11-10, the user: "한 라운드에 한 포켓몬만 바꿀 수 있게 해줘"); kept as a list for the server's shape
  const [pairs, setPairs] = useState([]);
  // pairs the server refused (an item the party already holds can only be seen there): their rows stand off, the rest stay chosen
  const [blocked, setBlocked] = useState([]);
  const wins = seat?.wins ?? 0;
  const resting = won && !seat?.ended;
  const master = streakMaster(wins);
  const best = Boolean(board?.find(r => r.mine && wins > 0 && r.wins === wins));
  const place = board?.find(r => r.mine && wins > 0)?.place ?? null;
  const [shown, setShown] = useState(resting && wins > 0 ? wins - 1 : wins);
  const box = useRef(null);
  useWarm(true);
  useEffect(() => {
    const timer = setTimeout(() => setShown(wins), DUR.light);
    const el = box.current;
    // the game just won brightens in its new light, then the next one lights (motion.js climb)
    if (el && resting) climb(el.querySelector(`[data-step="${floorGame(wins) - 1}"]`), el.querySelector(`[data-step="${floorGame(wins)}"]`));
    return () => clearTimeout(timer);
  }, [wins, resting, stage]);
  // each six in tier order, so a pair of one tier is a row (SwapTable)
  const byTier = list => [...list].sort((a, b) => (swapTier(a.species) ?? 9) - (swapTier(b.species) ?? 9));
  const ours = byTier(ourSix), theirs = byTier(theirSix);
  // ponytail: the species are matched by name; a party with two forms of one species cannot be drawn (one of each species)
  // every won game offers its trade, a gatekeeper's too: the party a run started with goes all the way up (2026-11-10)
  const swapping = resting && ours.length === 6 && theirs.length === 6;
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
    try {
      const made = await make();
      await enter(made.id, floorCall(dark, ".bt-main", next));
      await leaveNow();
      onOpen(made.id);
    } catch (e) {
      await dark; liftDrop(); standUp(); setBusy(false);
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
            <b className="t15">{gameWords(wins)}</b>
            <FloorTrack wins={wins} />
          </div>
        /* a lost run: its place on the month's board as a counter of the same size beside the streak (the two stood at 84 and 116,
           the place's panel holding the track under it); the floor it fell on stays in the head's window */
        : place != null ? <Counter label={`${monthOf(0).label} 순위`} value={place} after={<span className="t15">위</span>} />
        : <div className="pn streak-next"><b className="t15">{gameWords(wins)}</b><FloorTrack wins={wins} lost /></div>}
    </div>
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
    {swapping && <SwapTable ours={ours} theirs={theirs}
      chosen={new Set(pairs.flatMap(p => [`give:${p.give}`, `take:${p.take}`]))}
      matchTheirs={matchIn(theirs)} matchOurs={matchIn(ours)} onPick={pick} blocked={blocked} onInfo={onInfo} />}
  </section>;
  return <>
    {stage && createPortal(brk, stage)}
    <Dock toast={error ? <Toast error>{error}</Toast> : null}>
      <div className="bt-end-keys">
        {resting ? <Button variant="main" loading={busy} onClick={() => goInto(() => streakNextGame(id, swap), wins)}>{swap ? "바꾸고 다음 판" : "다음 판"}</Button>
          : <Button variant="main" icon="refresh" loading={busy} onClick={() => goInto(async () => keepStreakStart(await startStreakRun()), 0)}>다시 도전</Button>}
        <Button onClick={onOut} disabled={busy}>나가기</Button>
      </div>
    </Dock>
  </>;
}
