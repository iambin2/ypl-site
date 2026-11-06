import React, { useEffect, useMemo, useState } from "react";
import { Dropdown, Empty, ErrorNote, Icon, ListSearch, Loader, Modal, Pager, StandTable, sitePrompt } from "../components/index.js";
import { Chips, Counter, Mon, Row, SectionHead, TabsLine, useArrival } from "../components/common/Board.jsx";
import { loadChampions, seenChampions } from "../components/home/homeFacts.js";
import TeamSheet, { rosterSheet, useTeamDisplay } from "../components/common/TeamSheet.jsx";
import { buildRecordsSnapshot, displayRecordMeta, displayTeamName } from "../services/recordsAnalytics.js";
import { formatDate } from "../services/dateFormat.js";
import { buildNormalizedRecordsProjection } from "../services/normalizedRecordsProjection.js";
import { ALIGNMENTS, STAT_KEYS, STAT_LABELS, TYPE_KO, abilityName, dexRecord, itemName, moveName, natureName, spriteUrl } from "../services/teamBuilderCore.js";
import { loadRecordsPokemonDirectory } from "../services/recordsPokemon.js";
import { buildHallOfFameArtworkLookup, resolveHallOfFameArtwork } from "../services/hallOfFamePresentation.js";
import { freshRead, peekRead } from "../services/readCache.js";
import { buildIndividualPartyPreviewRows, buildTeamPartyPreviewRows, pokemonSamples, sampleUsage, trainerLeague } from "../services/recordsPresentation.js";
import {
  fetchNormalizedRecordsSnapshot,
  normalizedRecordsReadEnabled,
} from "../services/normalizedRecordsService.js";
import { syncTournamentRounds } from "../services/recordSync.js";
import { leagueTitle, recordRoundTitle } from "../services/eventName.js";
import { generationText } from "../services/seasonLabel.js";
import Button from "../components/common/Button.jsx";
import Seg from "../components/common/Seg.jsx";
import { battleHref, endedByLine, listOfficialBattleLogs, listPlayerBattles } from "../services/battleService.js";
import { battleUsage, toID as battleId } from "../services/battleLog.js";
import { GoogleMark } from "../components/layout/SiteHeader.jsx";
import { VISITOR_EVENT, accountsReady, decideLinkRequest, listLinkRequests, myPlayerLink, requestPlayerLink, signInWithGoogle, signOutVisitor, takePendingLink, visitorSignedIn } from "../services/visitorAuth.js";

/* 사이트 배틀로 치른 공식 경기(DESIGN.md "Battle"): 트레이너의 배틀 이력과 포켓몬의 실제 선출, 선봉, 승률.
   끝난 공식 배틀의 로그는 한 번만 읽어 둔다. */
let officialUsage = null;
const loadOfficialUsage = () => (officialUsage ||= listOfficialBattleLogs().then(battleUsage, () => new Map()));

function TrainerBattles({ playerIds }) {
  const [rows, setRows] = useState(null);
  const key = playerIds.join(",");
  useEffect(() => { let on = true; listPlayerBattles(playerIds).then(list => { if (on) setRows(list); }); return () => { on = false; }; }, [key]);
  if (!rows?.length) return null;
  return <section className="rc-sec" aria-labelledby="rc-battle-h">
    <SectionHead id="rc-battle-h" title={`공식 배틀 ${rows.length}판`} />
    <div className="stack">
      {rows.map(b => {
        const mine = playerIds.includes(b.p1_player_id) ? "p1" : "p2";
        const won = b.winner === mine;
        const result = b.winner === "tie" ? "무승부" : won ? "승리" : "패배";
        return <Row key={b.id} title={`상대 ${mine === "p1" ? b.p2_name : b.p1_name}`}
          line={[formatDate(b.updated_at), `${b.turn}턴`, endedByLine(b)].filter(Boolean).join(", ")}
          value={<span className={"rc-place t12" + (won ? " inv" : " dim")}>{result}</span>}
          label={`상대 ${mine === "p1" ? b.p2_name : b.p1_name}, ${result}, 리플레이 보기`}
          onClick={() => { window.location.search = battleHref(b.id); }} />;
      })}
    </div>
  </section>;
}

// a Pokémon's official battles: counted under the form it is sent out as, so a Mega counts with its base form
function useBattleUsage(dex) {
  const [usage, setUsage] = useState(null);
  useEffect(() => { let on = true; loadOfficialUsage().then(map => { if (on) setUsage(map); }); return () => { on = false; }; }, []);
  if (!usage || !dex) return null;
  const ids = [battleId(dex.name), dex.baseSpecies && /mega/i.test(dex.forme || "") ? battleId(dex.baseSpecies) : null].filter(Boolean);
  return ids.map(id => usage.get(id)).find(Boolean) || null;
}

const uid = () => Math.random().toString(36).slice(2, 9);

const placementLabel = (p, team = false) => {
  if (p === "win") return team ? "팀 우승" : "우승";
  if (p === "ru") return team ? "팀 준우승" : "준우승";
  if (p === "sf") return team ? "팀 4강" : "4강";
  return "참가";
};

const compareHistoryRecency = (a, b) => {
  const aApplied = String(a?.recordAppliedAt || "");
  const bApplied = String(b?.recordAppliedAt || "");

  // recordAppliedAt is authoritative for normalized records. Legacy rows do
  // not have that field, so compare them by their display date instead of
  // permanently pushing them below every normalized result.
  if (
    a?.source === "normalized" &&
    b?.source === "normalized" &&
    aApplied &&
    bApplied &&
    aApplied !== bApplied
  ) {
    return aApplied < bApplied ? 1 : -1;
  }

  const aDate = String(a?.date || "");
  const bDate = String(b?.date || "");
  if (aDate !== bDate) return aDate < bDate ? 1 : -1;

  const roundDelta = Number(b?.round || 0) - Number(a?.round || 0);
  if (roundDelta) return roundDelta;

  return String(a?.id || "").localeCompare(String(b?.id || ""));
};

const RECORD_TABS = [["trainer", "트레이너"], ["tour", "대회"], ["pokemon", "포켓몬"], ["rank", "랭킹"]];
// 옛 기록은 포켓몬을 한글 이름으로만 안다. 전당과 같은 사전으로 그림을 찾는다.
let artwork = new Map();
const pictureOf = (name, spriteName) => spriteName ? spriteUrl(spriteName) : resolveHallOfFameArtwork({ name }, artwork);
const rosterParty = (roster) => (roster.pokemon || []).map((name, i) => ({ name, img: pictureOf(name, roster.spriteNames?.[i]) }));
const rosterTitle = (roster) => roster.championSeries ? "챔피언스 시리즈" : roster.eventName || recordRoundTitle(roster.tournamentName, roster.round);
const hasSets = (roster) => (roster.sets || []).some((set) => set?.move_1_id);

/* 파티 또는 샘플 한 벌: 공식 제출본을 팀 시트로 되살린다. 세부 값이 없는 옛 파티는 포켓몬 이름까지만 있다. */
function PartySheet({ open, onClose, onTrainer }) {
  const { roster, set } = open;
  const detailed = hasSets(roster);
  const display = useTeamDisplay(detailed);
  const sheet = rosterSheet(roster, display, set);
  return (
    // a party is six and takes the content's width; a sample is one case, which keeps the sheet's own 576 instead of leaving the right empty
    <Modal title={`${roster.owner}의 ${set ? "샘플" : "파티"}`} hint={[rosterTitle(roster), formatDate(roster.date)].filter(Boolean).join(", ")} className={"rc-sheet" + (set ? "" : " wide")} onClose={onClose}>
      {!detailed && <>
        <div className="rc-six">{rosterParty(roster).map((m, i) => <span className="pn stand rc-cell" key={i}><Mon src={m.img} /><span className="floor rc-band t12">{m.name}</span></span>)}</div>
        <p className="rc-lead-note">이 파티는 포켓몬 구성만 기록되어 있습니다.</p>
      </>}
      {detailed && display === "error" && <ErrorNote>배틀 데이터를 불러오지 못해 세부 샘플을 보여 줄 수 없습니다.</ErrorNote>}
      {detailed && !display && <Loader small />}
      {detailed && sheet.length > 0 && <TeamSheet sheet={sheet} />}
      <div className="modal-actions"><Button variant="main" onClick={() => onTrainer(roster.owner)}>{roster.owner} 기록 보기</Button></div>
    </Modal>
  );
}

/* ============================== RECORDS ============================== */
// The Pokémon directory comes from files that only change with a deploy, so one load serves the visit.
let directorySeen = null;
export default function RecordsPage({ data, admin, setModal, save }) {
  const [tab, setTabState] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get("tab");
    return RECORD_TABS.some(([key]) => key === asked) ? asked : "trainer";
  });
  // 어느 탭인지 주소에 남는다: 새로고침과 공유가 같은 탭으로 돌아온다.
  const setTab = (next) => {
    setTabState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  };
  // 파티 시트도 페이지 하나가 연다. 대회, 트레이너, 포켓몬이 같은 시트를 쓴다.
  const [party, setParty] = useState(null);
  // 트레이너 시트는 페이지 하나가 연다. 목록, 랭킹 표, 그리고 다른 페이지에서 온 ?trainer=<이름> 링크가 같은 시트를 쓴다.
  const [sheet, setSheet] = useState(() => {
    const name = new URLSearchParams(window.location.search).get("trainer");
    return name ? { key: name, from: null } : null;
  });
  const openTrainer = (key, from = null) => setSheet({ key, from });
  const closeTrainer = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("trainer")) { url.searchParams.delete("trainer"); window.history.replaceState(window.history.state, "", url); }
    setSheet(null);
  };
  const normalizedEnabled = normalizedRecordsReadEnabled();
  // 다시 들어오면 지난 조회 결과로 바로 그리고, 새 조회가 끝나면 바뀐 경우에만 다시 그린다(관리자는 늘 새 결과만).
  const [normalizedRead, setNormalizedRead] = useState(() => {
    const seen = normalizedEnabled && !admin ? peekRead("records") : undefined;
    return { loading: normalizedEnabled && !seen, data: seen || null, error: null };
  });
  const [pokemonDirectory, setPokemonDirectory] = useState(directorySeen);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!normalizedEnabled) {
      setNormalizedRead({ loading: false, data: null, error: null });
      return () => { cancelled = true; };
    }

    setNormalizedRead((current) => current.data && !current.error ? current : { ...current, loading: true, error: null });
    freshRead("records", fetchNormalizedRecordsSnapshot, admin ? 0 : 60000)
      .then((next) => {
        if (!cancelled) setNormalizedRead((current) => current.data === next && !current.loading && !current.error ? current : { loading: false, data: next, error: null });
      })
      .catch((error) => {
        console.error("normalized Records read failed", error);
        if (!cancelled) setNormalizedRead({ loading: false, data: null, error });
      });
    return () => { cancelled = true; };
  }, [normalizedEnabled, reloadKey]);

  useEffect(() => {
    if (!normalizedEnabled || directorySeen) return undefined;
    let cancelled = false;
    loadRecordsPokemonDirectory()
      .then((directory) => {
        directorySeen = directory;
        artwork = buildHallOfFameArtworkLookup(directory);
        if (!cancelled) setPokemonDirectory(directory);
      })
      .catch((error) => console.warn("Records Pokémon localization unavailable", error));
    return () => { cancelled = true; };
  }, [normalizedEnabled]);

  const snapshot = useMemo(
    () => normalizedRead.data
      ? buildNormalizedRecordsProjection(data, normalizedRead.data, pokemonDirectory)
      : buildRecordsSnapshot(data),
    [data, normalizedRead.data, pokemonDirectory]
  );

  // 판의 세 숫자: 트레이너, 대회, 챔피언. 챔피언은 홈과 같은 명예의 전당 읽기를 쓴다.
  const [champions, setChampions] = useState(seenChampions);
  useEffect(() => { let live = true; loadChampions(data, admin).then((rows) => { if (live) setChampions(rows); }).catch(() => {}); return () => { live = false; }; }, [data]);
  const dated = (snapshot.archives || []).map((a) => String(a.date || "").match(/\d+/g)).filter((n) => n?.length >= 2).sort((a, b) => (a[0] + a[1].padStart(2, "0")).localeCompare(b[0] + b[1].padStart(2, "0")));
  const since = dated[0] ? `${dated[0][0]}년 ${+dated[0][1]}월부터` : "";

  const arrived = useArrival(!normalizedRead.loading);
  return (
    <section className="rc">
      <header className="rc-head"><h1 className="t32">기록</h1>{since && <span className="t12 dim">{since}</span>}</header>
      <div className="stack rc-counts">
        <Counter label="대회" value={normalizedRead.loading ? null : (snapshot.archives || []).length} unit="회" cells={(snapshot.archives || []).length >= 100 ? 3 : 2} />
        <Counter label="트레이너" value={normalizedRead.loading ? null : snapshot.trainers.length} unit="명" cells={snapshot.trainers.length >= 100 ? 3 : 2} />
        <Counter label="역대 챔피언" value={champions ? champions.length : null} unit="대" />
      </div>
      {normalizedRead.error && (
        <ErrorNote onRetry={() => setReloadKey((value) => value + 1)}>공식 기록을 읽지 못해 아래에는 기존 기록만 표시됩니다. 다시 시도해 주세요.</ErrorNote>
      )}
      <div className="rc-tabs"><TabsLine value={tab} onChange={setTab} label="기록 보기" options={RECORD_TABS} /></div>

      <div className="swap rc-body" key={tab} ref={arrived}>
        {normalizedRead.loading ? <Loader small /> : <>
        {tab === "trainer" && admin && <LinkRequests />}
        {tab === "trainer" && <TrainerView snapshot={snapshot} onOpen={openTrainer} />}
        {tab === "tour" && <TournamentArchiveView snapshot={snapshot} data={data} admin={admin} setModal={setModal} onParty={setParty} />}
        {tab === "pokemon" && <PokemonView snapshot={snapshot} onParty={setParty} />}
        {tab === "rank" && <RankingHub snapshot={snapshot} data={data} admin={admin} setModal={setModal} save={save} onName={openTrainer} />}
        </>}
      </div>
      {sheet && (() => {
        const profile = profileOf(snapshot, sheet.key);
        return profile ? (
          <Modal title={profile.name} hint={trainerHint(profile)} className="rc-sheet wide" onClose={closeTrainer}>
            <TrainerProfile snapshot={snapshot} profile={profile} onParty={setParty} />
          </Modal>
        ) : null;
      })()}
      {party && <PartySheet open={party} onClose={() => setParty(null)} onTrainer={(name) => { setParty(null); openTrainer(name); }} />}
    </section>
  );
}

/* 트레이너 시트의 머리 아래 한 줄: 참가 횟수와 가진 챔피언 세대 */
function trainerHint(profile) {
  return [trainerLeague(profile) === "master" ? "마스터" : "루키", `참가 ${profile.history.length}회`, ...profile.champions.map((c) => `${generationText(c.gen)} 챔피언`)].join(", ");
}

/* 이름이나 키로 트레이너 기록을 찾는다. 다른 페이지의 링크는 이름만 알고 있다. */
function profileOf(snapshot, key) {
  const profiles = snapshot.profiles || {};
  return profiles[key] || Object.values(profiles).find((p) => p.name === key) || null;
}

/* ============================== TRAINERS ==============================
   N3: 트레이너 목록에서 한 사람을 누르면 그 사람의 기록이 시트로 올라온다(폰 바텀시트, 데스크톱 가운데 창).
   주소는 바뀌지 않는다. */
const LIST_SHOWN = 20;

function TrainerView({ snapshot, onOpen }) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);

  const visible = snapshot.trainers.filter((t) => t.name.includes(query.trim()));
  if (!snapshot.trainers.length) return <Empty title="트레이너 기록이 없습니다." desc="대회 결과가 확정되면 이곳에 표시됩니다." />;
  const rows = all || query.trim() ? visible : visible.slice(0, LIST_SHOWN);

  return (
    <div className="rc-list">
      <ListSearch q={query} setQ={setQuery} placeholder="트레이너 검색" count={visible.length} />
      {visible.length ? (<>
        {/* 성적 이름은 머리줄에 한 번만. 성적은 같은 폭의 세 칸에 세워 위아래 사람끼리 바로 비교된다. 첫 줄, 기록의 주인은 반전된다. */}
        <div className="rc-th t12 mute" aria-hidden="true"><span>#</span><span>트레이너</span><span>우승</span><span>준우승</span><span>4강</span></div>
        <div className="stack rc-table">
          {rows.map((trainer, i) => {
            // 리그는 이름 뒤 한 단어로: 마스터는 밝게, 루키는 어둡게 (trainerLeague, 트레이너 시트의 머리와 같은 기준)
            const master = trainerLeague(profileOf(snapshot, trainer.key || trainer.name)) === "master";
            const league = master ? "마스터" : "루키";
            return (
              <Row key={trainer.key || trainer.name} className={"rc-tr" + (i === 0 && !query.trim() ? " inv" : "")}
                lead={<span className="num t12">{snapshot.trainers.indexOf(trainer) + 1}</span>}
                title={<>{trainer.name}<span className={"unit rc-league" + (master ? " lit" : "")}>{league}</span></>}
                value={<span className="rc-three">{[trainer.wins, trainer.runnerUps, trainer.top4].map((v, k) => <span key={k} className={"num" + (v ? "" : " mute")}>{v}</span>)}</span>}
                onClick={(e) => onOpen(trainer.key || trainer.name, e.currentTarget.querySelector(".row-main b"))}
                label={`${trainer.name}, ${league}, 우승 ${trainer.wins} 준우승 ${trainer.runnerUps} 4강 ${trainer.top4}`} />
            );
          })}
        </div>
      </>) : <Empty title="검색 결과가 없습니다." desc="다른 이름으로 검색해 주세요." />}
      {!all && !query.trim() && visible.length > LIST_SHOWN && (
        <div className="rc-more"><Button variant="second" onClick={() => setAll(true)}>{visible.length}명 전체 보기</Button></div>
      )}
    </div>
  );
}

function TrainerProfile({ snapshot, profile, onParty }) {
  const [season, setSeason] = useState("");
  const [histPage, setHistPage] = useState(1);
  const [allParties, setAllParties] = useState(false);

  const seasonMatch = (value) => !season || value === season;
  const placements = profile.placements.filter((p) => seasonMatch(p.season));
  const history = profile.history.filter((p) => seasonMatch(p.season));
  const HIST_PER_PAGE = 12;
  const histPages = Math.max(1, Math.ceil(history.length / HIST_PER_PAGE));
  const histCur = Math.min(histPage, histPages);
  const rosters = profile.rosters.filter((r) => seasonMatch(r.season));

  const countablePlacements = placements.filter((p) => p.team !== true);
  const championships = countablePlacements.filter((p) => p.placement === "win").length;
  const runnerUps = countablePlacements.filter((p) => p.placement === "ru").length;
  const top4 = countablePlacements.filter((p) => p.placement === "sf").length;
  const favoriteMap = new Map();
  for (const roster of rosters) {
    for (const pokemon of new Set(roster.pokemon || [])) {
      favoriteMap.set(pokemon, (favoriteMap.get(pokemon) || 0) + 1);
    }
  }
  const favorites = [...favoriteMap.entries()]
    .map(([name, entries]) => ({ name, entries }))
    .sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name, "ko"));

  /* 챔피언 칩과 칭호 목록이 같은 항목을 각각 그리고 있었다.
     (예: "초대 챔피언"이 champions 에서 한 번, titles 에서 또 한 번)
     챔피언 칩이 이미 덮는 이름은 칭호 목록에서 뺀다.
     c.gen 이 레거시는 "초대", 정규화 행은 "6대 챔피언"으로 들어와
     그대로 붙이면 "6대 챔피언 챔피언"이 된다. 접미사를 한 번만 붙인다. */
  const genLabel = (g) => `${generationText(g)} 챔피언`;
  const shownTitles = new Set(profile.champions.map((c) => genLabel(c.gen)));
  const restTitles = profile.titles.filter((t) => !shownTitles.has(t.name) && !(/챔피언\s*$/.test(t.name) && shownTitles.has(genLabel(t.name))));
  const historyRows = history.slice().sort(compareHistoryRecency).slice((histCur - 1) * HIST_PER_PAGE, histCur * HIST_PER_PAGE);
  const parties = rosters.slice().sort(compareHistoryRecency);
  const rosterOf = (event) => rosters.find((roster) => event.eventId && roster.eventId === event.eventId);

  return (
    <div className="rc-profile">
      {/* the party sheet's order: the facts first, then what the trainer did, top to bottom, one column that only scrolls down */}
      <div className="stack rc-counts">
        <Counter label="우승" value={championships} unit="회" />
        <Counter label="준우승" value={runnerUps} unit="회" />
        <Counter label="4강" value={top4} unit="회" />
      </div>
      {snapshot.seasons.length > 0 && <div className="rc-seasons"><Chips label="시즌" value={season} onChange={(value) => { setSeason(value); setHistPage(1); }}
        options={[["", "전체 기록"], ...snapshot.seasons.map((name) => [name, name])]} /></div>}
      {(profile.champions.length > 0 || restTitles.length > 0) && <section className="rc-sec" aria-labelledby="rc-title-h">
        <SectionHead id="rc-title-h" title="칭호" />
        <div className="chips rc-titles">
          {profile.champions.map((c, i) => <span key={`c${i}`} className="inv">{genLabel(c.gen)}</span>)}
          {restTitles.map((title, i) => <span key={`t${i}`} className="pn">{title.name}</span>)}
        </div>
      </section>}

      <section className="rc-sec" aria-labelledby="rc-hist-h">
        <SectionHead id="rc-hist-h" title="최근 대회" />
        {history.length ? (
          <div className="stack">
            {historyRows.map((event) => {
              const teamName = displayTeamName(event.teamName);
              const rule = displayRecordMeta(event.rule);
              const label = event.resultLabel || placementLabel(event.placement, event.team);
              const meta = [formatDate(event.date), event.season, teamName, rule].filter(Boolean).join(", ");
              const roster = rosterOf(event);
              return <Row key={`${event.id}:${event.playerId || profile.playerId || profile.key}:${event.placement}`}
                title={event.championSeries ? "챔피언스 시리즈" : event.eventName || recordRoundTitle(event.tournamentName, event.round)}
                line={meta || undefined}
                value={<span className={"rc-place t12" + (event.placement === "win" ? " inv" : " dim")}>{label}</span>}
                onClick={roster ? () => onParty({ roster }) : undefined} />;
            })}
          </div>
        ) : <Empty title="확인 가능한 대회 기록이 없습니다." desc="대회 결과가 확정되면 이곳에 표시됩니다." />}
        <div className="rc-pager"><Pager page={histCur} pages={histPages} onGo={setHistPage} /></div>
      </section>

      <TrainerLink profile={profile} />

      <TrainerBattles playerIds={[...new Set([profile.playerId, ...profile.history.map(event => event.playerId)].filter(Boolean))]} />

      {parties.length > 0 && <section className="rc-sec" aria-labelledby="rc-party-h">
        <SectionHead id="rc-party-h" title={`사용한 파티 ${parties.length}개`} />
        <div className="stack">
          {(allParties ? parties : parties.slice(0, 4)).map((roster) => (
            <button type="button" key={roster.id || roster.snapshotId} className="pn rc-party-row" onClick={() => onParty({ roster })} aria-label={`${rosterTitle(roster)} 파티 보기, ${(roster.pokemon || []).join(", ")}`}>
              <span className="rc-party-who"><b className="t15">{rosterTitle(roster)}</b><span className="t12 dim">{[formatDate(roster.date), roster.team && displayTeamName(roster.teamName)].filter(Boolean).join(", ")}</span></span>
              <span className="rc-party-six" aria-hidden="true">{rosterParty(roster).map((m, k) => <span className="stand rc-party-mon" key={k}><i className="floor" /><Mon src={m.img} /></span>)}</span>
            </button>
          ))}
        </div>
        {!allParties && parties.length > 4 && <div className="rc-more"><Button variant="second" onClick={() => setAllParties(true)}>{parties.length}개 전체 보기</Button></div>}
      </section>}

      <section className="rc-sec" aria-labelledby="rc-fav-h">
        <SectionHead id="rc-fav-h" title="자주 쓴 포켓몬" />
        {favorites.length ? (
          <CountList items={favorites.slice(0, 6)} sprites={snapshot.pokemon} />
        ) : (
          <Empty title="저장된 우승 엔트리가 없습니다." desc="대진표에서 결과를 확정하면 이곳에 자동으로 표시됩니다." />
        )}
      </section>
    </div>
  );
}

/* ---- 내 기록 연결 (docs/db/player_accounts.sql): 구글 계정으로 이 기록을 내 기록으로 연결해 달라고 요청한다. 운영진이 승인해야
   이어지고, 그 SQL이 실행되기 전에는 아무것도 보이지 않는다. 승인된 계정은 공지의 신청서에서 이름 없이 신청하고, 그 이름은 그 계정만
   쓴다. 파티 제출과 배틀은 지금처럼 이름과 비밀번호로 된다. ---- */
const LINK_STATE = { pending: "운영진 확인을 기다리는 중입니다.", approved: "내 기록으로 연결되었습니다.", rejected: "연결 요청이 거절되었습니다." };
function TrainerLink({ profile }) {
  const [ready, setReady] = useState(false);
  const [link, setLink] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [signedIn, setSignedIn] = useState(visitorSignedIn);
  // signing out from the top bar empties this section too
  useEffect(() => { const sync = () => { setSignedIn(visitorSignedIn()); setLink(undefined); }; window.addEventListener(VISITOR_EVENT, sync); return () => window.removeEventListener(VISITOR_EVENT, sync); }, []);
  useEffect(() => { let on = true; accountsReady().then((ok) => { if (on) setReady(ok); }); return () => { on = false; }; }, []);
  useEffect(() => {
    if (!ready || !signedIn) return undefined;
    let on = true;
    (async () => {
      try {
        // back from Google with this trainer asked for: the request goes now
        if (takePendingLink() === profile.name) await requestPlayerLink(profile.name);
        const mine = await myPlayerLink();
        if (on) setLink(mine);
      } catch (error) {
        if (!on) return;
        if (error.signedOut) setSignedIn(false);
        setNote(error.message); setLink(null);
      }
    })();
    return () => { on = false; };
  }, [ready, signedIn, profile.name]);
  if (!ready || !profile.playerId) return null;
  const back = `${window.location.origin}${window.location.pathname}?view=records&tab=trainer&trainer=${encodeURIComponent(profile.name)}`;
  const ask = async () => {
    setBusy(true); setNote("");
    try { await requestPlayerLink(profile.name); setLink(await myPlayerLink()); } catch (error) { setNote(error.message); }
    setBusy(false);
  };
  const mine = link && link.player_id === profile.playerId;
  return (
    <section className="rc-sec" aria-labelledby="rc-link-h">
      <SectionHead id="rc-link-h" title="내 기록 연결" />
      <div className="stack">
        {!signedIn
          ? <Row title="구글 계정으로 연결" line="운영진이 확인한 뒤 이 기록이 내 계정과 이어집니다." value={<Button variant="second" size="sm" onClick={() => signInWithGoogle(profile.name, back)}><GoogleMark />구글 로그인</Button>} />
          : link === undefined ? <Row title="연결 상태를 확인하는 중입니다." />
          : mine ? <Row title={LINK_STATE[link.status] || ""} line={link.email || undefined} />
          : <Row title="내 기록으로 연결 요청" line={link ? `지금은 ${link.requested_name} 기록에 요청되어 있습니다.` : "운영진이 확인한 뒤 연결됩니다."}
              value={<Button variant="second" size="sm" loading={busy} onClick={ask}>요청</Button>} />}
      </div>
      {note && <p className="t12 dim">{note}</p>}
      {signedIn && <div className="rc-more"><Button variant="link" onClick={() => { signOutVisitor(); setSignedIn(false); setLink(undefined); }}>구글 로그아웃</Button></div>}
    </section>
  );
}
// 운영진: 연결 요청을 승인하거나 거절한다. 요청이 없으면 아무것도 보이지 않는다.
function LinkRequests() {
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState("");
  const load = () => accountsReady().then((ok) => (ok ? listLinkRequests() : [])).then(setRows, (error) => setNote(error.message));
  useEffect(() => { load(); }, []);
  const pending = rows.filter((row) => row.status === "pending");
  if (!pending.length && !note) return null;
  const decide = async (row, approve) => { try { await decideLinkRequest(row.auth_user_id, approve); load(); } catch (error) { setNote(error.message); } };
  return (
    <section className="rc-sec" aria-labelledby="rc-linkreq-h">
      <SectionHead id="rc-linkreq-h" title={`기록 연결 요청 ${pending.length}`} />
      <div className="stack">
        {pending.map((row) => <Row key={row.auth_user_id} title={row.requested_name} line={[row.player_id ? "기록 있음" : "이름으로 받은 신청 있음", row.account_name, row.email, formatDate(row.requested_at)].filter(Boolean).join(", ")}
          value={<span className="rc-link-keys"><Button variant="second" size="sm" onClick={() => decide(row, true)}>승인</Button><Button variant="link" onClick={() => decide(row, false)}>거절</Button></span>} />)}
      </div>
      {note && <p className="t12 dim">{note}</p>}
    </section>
  );
}

/* ---- shared pieces of the records views ---- */

/* 포켓몬의 횟수: 그림이 있으면 바닥 띠 위에 선 여섯 칸, 없으면 줄 */
function CountList({ items, sprites }) {
  const sprite = (name) => pictureOf(name, sprites.find((p) => p.name === name)?.spriteName);
  return (
    <div className="rc-six">
      {items.map((item) => <span className="pn stand rc-cell" key={item.name}><Mon src={sprite(item.name)} /><span className="floor rc-band"><b className="t12">{item.name}</b><span className="t12 dim num">{item.entries}회</span></span></span>)}
    </div>
  );
}

/* ============================== TOURNAMENT ARCHIVE ============================== */

function TournamentArchiveView({ snapshot, data, admin, setModal, onParty }) {
  const legacyTours = data.tournaments || [];
  const archiveKeys = [...new Set((snapshot.archives || []).map((row) => row.tournamentKey).filter(Boolean))];
  const keys = [
    ...legacyTours.map((tour) => tour.key).filter((key) => archiveKeys.includes(key)),
    ...archiveKeys.filter((key) => !legacyTours.some((tour) => tour.key === key)),
  ];
  const tours = keys.map((key) => {
    const legacy = legacyTours.find((tour) => tour.key === key);
    const first = (snapshot.archives || []).find((row) => row.tournamentKey === key);
    return {
      key,
      label: legacy?.label || first?.tournamentName || first?.eventName || key,
      color: legacy?.color || first?.color || "#A1A1A6",
      rounds: (snapshot.archives || []).filter((row) => row.tournamentKey === key),
      legacy,
    };
  });
  const rank = (t) => {
    const label = t.label || "";
    return label.includes("마스터") ? 0 : label.includes("루키") ? 1 : label.includes("라이트") ? 2 : label.includes("클래식") ? 3 : 4;
  };
  const otours = [...tours].sort((a, b) => rank(a) - rank(b));
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  // 대회는 여러 개를 함께 펼쳐 비교할 수 있다. 하나를 연다고 다른 것이 닫히지 않는다.
  const [openRounds, setOpenRounds] = useState(() => new Set());
  const selectedTour = category === "all" ? null : tours.find((x) => x.key === category) || otours[0];
  const split = (value) => String(value || "").split("/").map((x) => x.trim()).filter(Boolean);

  const sortRounds = (rounds) => [...(rounds || [])].sort((a, b) => {
    if ((a.date || "") !== (b.date || "")) return (a.date || "") < (b.date || "") ? 1 : -1;
    const ca = a.champ ? 1 : 0;
    const cb = b.champ ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return (parseInt(b.round) || 0) - (parseInt(a.round) || 0);
  });

  const roundMatches = (tour, round) => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return [
      tour.label,
      round.eventName,
      round.date,
      round.round,
      round.season,
      round.rule,
      round.win,
      round.ru,
      ...(round.winMembers || []),
      ...(round.ruMembers || []),
      ...(round.sf || []),
      ...((round.sfMembers || []).flat ? (round.sfMembers || []).flat() : []),
      ...(round.rosters || []).flatMap((roster) => roster.pokemon || []),
    ].join(" ").toLowerCase().includes(normalized);
  };

  const openRoundEditor = () => {
    if (!selectedTour?.legacy) return;
    setModal({
      type: "rounds",
      title: selectedTour.label,
      rounds: selectedTour.legacy.rounds,
      seasons: (data.seasons || []).map((season) => season.name),
      build: (rounds) => syncTournamentRounds(data, selectedTour.key, rounds),
    });
  };

  const renderRound = (tour, r, key, showCompetition = false) => {
    const championSeries = Boolean(r.championSeries || r.champ);
    const runnerUps = Array.isArray(r.ru) ? r.ru : split(r.ru);
    const rule = displayRecordMeta(r.rule);
    const partyRows = r.team ? buildTeamPartyPreviewRows(r) : buildIndividualPartyPreviewRows(r);
    const toggleable = r.source === "normalized" && partyRows.length > 0;
    const expanded = openRounds.has(key);
    const toggle = () => setOpenRounds((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
    const championshipEmphasis = championSeries && r.championshipPhase !== "qualifier";
    // 대회 이름은 다른 화면과 같은 조립 이름("37회 파이컵 팀전 리전 워즈")을 쓴다. 이름이 이미 말한 것은 회색 줄에서 뺀다.
    // 챔피언스 시리즈는 회차를 쓰지 않는다(트레이너 이력과 같은 규칙). 예전 기록은 회차와 리그로 이름을 짓는다.
    const rl = championSeries ? "" : r.round ? (/^\d+$/.test(String(r.round)) ? String(r.round) + "회" : r.round) : "";
    const title = championSeries ? "챔피언스 시리즈" : r.eventName || (rl ? `${rl} ${leagueTitle(tour.label)}` : leagueTitle(tour.label));
    const meta = [formatDate(r.date), r.season, championshipEmphasis && "챔피언스 시리즈", r.team && "팀전", rule]
      .filter((part, i, all) => part && !title.includes(part) && all.indexOf(part) === i).join(", ");
    const head = <span className="r2-head"><span className="r2-title">{title}</span>{meta && <span className="r2-meta">{meta}</span>}</span>;
    /* 순위마다 한 줄의 띠: 왼쪽은 순위의 칸(우승은 반전, 준우승은 켜짐, 4강은 흐림), 오른쪽은 이름(우승은 20). 팀전은 팀마다 줄을 나눈다. */
    const resultLines = (lines) => (
      <div className="r2-res">
        {lines.map(([placement, label, entries]) => entries.map((entry, k) => (
          <div className={"r2-line " + placement} key={`${placement}:${k}`}>
            <span className={"r2-rk" + (placement === "win" ? " inv" : "")}>{k === 0 ? label : ""}</span>
            <span className="r2-names">
              {entry.names.map((name, n) => <span key={`${name}:${n}`} className={"r2-name" + (placement === "win" ? " win" : "")}>{name}</span>)}
              {/* a team's members always take the line under its name, as a grey line with commas, so no strip wraps differently */}
              {entry.members?.length > 0 && <span className="r2-mems">{entry.members.join(", ")}</span>}
            </span>
          </div>
        )))}
      </div>
    );
    const individualResults = () => resultLines([
      ["win", "우승", partyRows.filter((row) => row.placement === "win")],
      ["ru", "준우승", partyRows.filter((row) => row.placement === "ru")],
      ["sf", "4강", partyRows.filter((row) => row.placement === "sf")],
    ].filter(([, , rows]) => rows.length > 0).map(([placement, label, rows]) => [placement, label, [{ names: rows.map((row) => row.name) }]]));
    const teamResults = () => resultLines([
      ["win", "우승", [{ names: r.win ? [displayTeamName(r.win)] : [], members: r.winMembers }]],
      ["ru", "준우승", (runnerUps.length > 0 || r.ruMembers?.length > 0) ? [{ names: runnerUps[0] ? [displayTeamName(runnerUps[0])] : [], members: r.ruMembers }] : []],
      ["sf", "4강", (r.sf || []).map((nm, k) => ({ names: nm ? [displayTeamName(nm)] : [], members: (r.sfMembers || [])[k] }))],
    ]);
    return (
      <li className={"pn round2" + (championshipEmphasis ? " champ" : "")} key={key}>
        <div className="r2-main">
          {head}
          {!r.team && individualResults()}
          {r.team && teamResults()}
          {/* one way to open the parties for every event: a line that names what it opens */}
          {toggleable && (
            <button type="button" className="records-round-toggle" aria-expanded={expanded} onClick={toggle}>
              <span className="records-round-summary">{r.team ? "팀원별 공식 파티" : "입상자별 공식 파티"}</span>
              <span className="records-round-chevron" aria-hidden="true"><Icon n="chev" size={16} /></span>
            </button>
          )}
          {toggleable && expanded && (
            <ul className="records-round-detail stack">
              {partyRows.map((row, index) => {
                const roster = row.roster?.pokemon?.length ? row.roster : null;
                const line = [row.label, row.teamName && displayTeamName(row.teamName), !roster && "파티 미제출"].filter(Boolean).join(", ");
                // 파티는 이름 대신 여섯 마리의 그림으로 읽는다. 이름은 읽는 사람을 위해 라벨에 남긴다.
                const Box = roster ? "button" : "div";
                return <li key={`${row.placement}:${row.name}:${index}`}>
                  <Box {...(roster ? { type: "button", onClick: () => onParty({ roster }), "aria-label": `${row.name} 파티 보기, ${(roster.pokemon || []).join(", ")}` } : {})} className="pn rc-party-row">
                    <span className="rc-party-who"><b className="t15">{row.name}</b><span className="t12 dim">{line}</span></span>
                    {roster && <span className="rc-party-six" aria-hidden="true">{rosterParty(roster).map((m, k) => <span className="stand rc-party-mon" key={k}><i className="floor" /><Mon src={m.img} /></span>)}</span>}
                  </Box>
                </li>;
              })}
            </ul>
          )}
        </div>
      </li>
    );
  };

  const allRows = otours.flatMap((tour) =>
    sortRounds(tour.rounds)
      .filter((round) => roundMatches(tour, round))
      .map((round, index) => ({ tour, round, key: `${tour.key}:${round.id || index}` }))
  ).sort((a, b) => {
    if ((a.round.date || "") !== (b.round.date || "")) return (a.round.date || "") < (b.round.date || "") ? 1 : -1;
    return (parseInt(b.round.round) || 0) - (parseInt(a.round.round) || 0);
  });

  if (!otours.length) return <Empty title="대회 기록이 없습니다." desc="대회 결과가 확정되면 이곳에 표시됩니다." />;

  /* 59개 대회가 같은 블록으로 이어지지 않도록 시즌마다 장을 나눈다: 시즌 이름 20과 그 시즌의 대회 수를 32의 세그먼트로.
     시즌이 없는 옛 기록은 연도로 묶는다. items 는 이미 최신순이다. */
  const chapterOf = (round) => {
    const year = String(round.date || "").match(/\d{4}/)?.[0];
    return round.season || (year ? `${year}년` : "");
  };
  const withChapters = (items, roundOf, render) => {
    const counts = new Map();
    items.forEach((item) => { const c = chapterOf(roundOf(item)); counts.set(c, (counts.get(c) || 0) + 1); });
    let last = null;
    return items.flatMap((item, i) => {
      const c = chapterOf(roundOf(item));
      const head = c && c !== last ? [<li className="rc-chapter" data-rise key={`chapter:${c}:${i}`}>
        <h3 className="t20">{c}</h3>
        <span className="rc-chapter-n"><Seg value={String(counts.get(c))} h={32} cells={2} label={`${counts.get(c)}회`} /><span className="t15">회</span></span>
      </li>] : [];
      last = c;
      return [...head, render(item)];
    });
  };

  return (<>
    <Chips value={selectedTour ? selectedTour.key : "all"} onChange={setCategory} label="대회 종류"
      options={[["all", `전체 ${(snapshot.archives || []).length}`], ...otours.map((tour) => [tour.key, `${tour.label} ${(tour.rounds || []).length}`])]} />

    {selectedTour ? (
      <div className="swap" key={category}>
        {admin && selectedTour.legacy && <div className="rc-admin"><Button variant="second" onClick={openRoundEditor}>회차 편집</Button></div>}
        <ul className="stack rc-rounds">
          {withChapters(sortRounds(selectedTour.rounds).map((r, i) => [r, r.id || i]), ([r]) => r, ([r, key]) => renderRound(selectedTour, r, key, false))}
        </ul>
      </div>
    ) : (
      <>
        <div className="rc-list-search"><ListSearch q={query} setQ={setQuery} placeholder="대회명, 시즌, 룰, 입상자, 포켓몬 검색" count={allRows.length} /></div>
        {allRows.length ? (
          <ul className="stack rc-rounds swap">
            {withChapters(allRows, (row) => row.round, ({ tour, round, key }) => renderRound(tour, round, key, true))}
          </ul>
        ) : <Empty title="검색 결과가 없습니다." desc="다른 이름으로 검색해 주세요." />}
      </>
    )}
  </>);
}

/* ============================== POKEMON ============================== */
/* 포켓몬은 도감처럼 카드로 고른다. 카드를 누르면 많이 쓴 구성과, 누가 어느 대회에서 어떤 샘플을 썼는지가 열린다. */
function PokemonView({ snapshot, onParty }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  const normalized = query.trim().toLowerCase();

  const visible = snapshot.pokemon.filter((p) => p.name.toLowerCase().includes(normalized));
  const current = open ? snapshot.pokemon.find((p) => p.name === open) : null;
  const rankOf = (pokemon) => snapshot.pokemon.findIndex((p) => p.entries === pokemon.entries) + 1;

  if (!snapshot.pokemon.length) {
    return <Empty title="기록에 연결된 파티 엔트리가 없습니다." desc="대진표의 파티 엔트리가 저장되면 자동으로 집계됩니다." />;
  }
  const rows = all || normalized ? visible : visible.slice(0, LIST_SHOWN);

  return (
    <div className="rc-list">
      <ListSearch q={query} setQ={setQuery} placeholder="포켓몬 검색" count={visible.length} />
      {visible.length ? (
        <div className="rc-mons">
          {rows.map((pokemon) => (
            <button type="button" className="pn stand rc-mon" key={pokemon.name} onClick={() => setOpen(pokemon.name)} aria-label={`${pokemon.name}, ${rankOf(pokemon)}위, ${pokemon.entries}회 등록`}>
              <span className="rc-mon-rank num t12 dim">{rankOf(pokemon)}</span>
              <Mon src={pictureOf(pokemon.name, pokemon.spriteName)} />
              <span className="floor rc-band"><b className="t15">{pokemon.name}</b><span className="t12 dim num">{pokemon.entries}회</span></span>
            </button>
          ))}
        </div>
      ) : <Empty title="검색 결과가 없습니다." desc="다른 이름으로 검색해 주세요." />}
      {!all && !normalized && visible.length > LIST_SHOWN && (
        <div className="rc-more"><Button variant="second" onClick={() => setAll(true)}>{visible.length}종 전체 보기</Button></div>
      )}
      {current && <PokemonSheet snapshot={snapshot} pokemon={current} rank={rankOf(current)} onClose={() => setOpen(null)} onParty={onParty} />}
    </div>
  );
}

/* A figure read as a bar on its track, the calculator's bar (DESIGN.md "Records"): the name (a move's type tag before it), the bar, the
   figure. share is 0 to 1. In a ranking the sole leader inverts, as the record holder does. */
function BarRow({ name, tag, note, share, value, top = false, keyed = false }) {
  return (
    <div className={(top ? "inv" : "pn") + " rc-bar" + (keyed ? " keyed" : "")}>
      <span className="rc-bar-name">{tag}<b className="t15">{name}</b>{note && <span className="t12 dim reg">{note}</span>}</span>
      <span className="tb-bar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.min(1, Math.max(0, share))})` }} /></span>
      <b className="t15 num rc-bar-fig">{value}</b>
    </div>
  );
}
const typeTag = (type) => type ? <span className={`tb-type type-${type.toLowerCase()}`}>{TYPE_KO[type] || type}</span> : null;
/* a ranking as bars: its label, then the rows ([{ key, name, tag, note, count, rate }], most first); columns runs them down two columns */
function BarGroup({ label, rows, total, unit = "%", columns = 1 }) {
  const lead = rows.length > 1 && rows[0].count > rows[1].count;
  return (
    <div className="rc-group">
      <div className="tb-subhead"><span className="t12 dim">{label}</span></div>
      <div className={"stack rc-bars" + (columns > 1 ? " two" : "")} style={{ "--rows": Math.ceil(rows.length / columns) }}>
        {rows.map((row, i) => <BarRow key={row.key} name={row.name} tag={row.tag} note={row.note} share={row.count / total}
          value={unit === "%" ? `${row.rate}%` : `${row.count}${unit}`} top={lead && i === 0} />)}
      </div>
    </div>
  );
}

/* The Pokémon sheet (2026-11-04): the Pokémon is its subject, so it stands large on its panel with its rank lit beside it and its types
   on its floor; four counters read the record; then the statistics as bars: its base stats, the points the samples gave it, and the
   moves, items, abilities and natures they chose. The samples and parties follow as doors. */
function PokemonSheet({ snapshot, pokemon, rank, onClose, onParty }) {
  const samples = useMemo(() => pokemonSamples(snapshot.rosters, pokemon.name), [snapshot.rosters, pokemon.name]);
  const usage = useMemo(() => sampleUsage(samples), [samples]);
  const display = useTeamDisplay(true);
  const detail = display && display !== "error" ? display.detailData : null;
  const dex = detail && pokemon.spriteName ? dexRecord(detail, { name: pokemon.spriteName }) : null;
  // the points each sample gave, averaged per stat (the party sheet's model, so a mega or a form reads as it was saved)
  const spread = useMemo(() => {
    if (!detail || !samples.length) return null;
    const rows = samples.map(({ roster, set }) => rosterSheet(roster, display, set)[0]).filter(Boolean);
    return rows.length ? { n: rows.length, avg: STAT_KEYS.map((key, k) => rows.reduce((sum, row) => sum + row.stats[k].sp, 0) / rows.length) } : null;
  }, [samples, display]);
  const named = (rows, read) => rows.map((row) => ({ ...row, key: row.id, ...read(row.id) }));
  const effect = (a) => a?.plus ? `${STAT_LABELS[a.plus]}↑ ${STAT_LABELS[a.minus]}↓` : "보정 없음";
  const [more, setMore] = useState(false);
  const total = dex ? STAT_KEYS.reduce((sum, key) => sum + (dex.baseStats?.[key] || 0), 0) : 0;
  const trainers = pokemon.trainers.slice(0, 8).map((t) => ({ key: t.name, name: t.name, count: t.entries }));
  const battle = useBattleUsage(dex);
  return (
    <Modal title={pokemon.name} hint={dex ? `${dex.name}, 전국도감 ${String(dex.num).padStart(4, "0")}` : undefined} className="rc-sheet wide" onClose={onClose}>
      <div className="rc-profile">
        <div className="rc-pk-top">
          <div className="pn stand rc-pk-stage">
            <span className="rc-pk-rank">
              <span className="t12 dim">채용 순위</span>
              <span className="counter-board"><Seg value={String(rank)} h={84} cells={rank >= 100 ? 3 : 2} label={`채용 ${rank}위`} /><span className="t20">위</span></span>
            </span>
            <span className="floor rc-pk-floor">{dex && dex.types.map((type) => <React.Fragment key={type}>{typeTag(type)}</React.Fragment>)}</span>
            <Mon src={pictureOf(pokemon.name, pokemon.spriteName)} />
          </div>
          <div className="stack rc-pk-counts">
            <Counter label="채용률" value={Math.round(pokemon.entryRate)} unit="%" cells={pokemon.entryRate >= 99.5 ? 3 : 2} after={<span className="t15">%</span>} />
            <Counter label="등록 엔트리" value={pokemon.entries} unit="회" cells={pokemon.entries >= 100 ? 3 : 2} after={<span className="t15">회</span>} />
            <Counter label="사용 트레이너" value={pokemon.trainerCount} unit="명" cells={pokemon.trainerCount >= 100 ? 3 : 2} after={<span className="t15">명</span>} />
            <Counter label="우승 엔트리" value={pokemon.wins} unit="회" after={<span className="t15">회</span>} />
          </div>
        </div>
        <p className="t12 dim reg rc-lead-note">
          채용률 {pokemon.entryRate.toFixed(1)}%는 저장된 파티 엔트리 {snapshot.rosters.length}개를 기준으로 계산합니다.
          {battle ? " 아래의 선출, 선봉, 승률은 사이트 배틀로 치른 공식 경기만 셉니다." : " 실제 경기 선출은 사이트 배틀로 치른 공식 경기만 기록되며, 아직 이 포켓몬의 기록은 없습니다."}
        </p>

        {battle && <section className="rc-sec" aria-labelledby="rc-pk-bt-h">
          <SectionHead id="rc-pk-bt-h" title="공식 배틀" />
          <div className="stack rc-counts">
            <Counter label="선출" value={battle.picked} unit="판" cells={battle.picked >= 100 ? 3 : 2} after={<span className="t15">판</span>} />
            <Counter label="선봉" value={battle.leads} unit="판" cells={battle.leads >= 100 ? 3 : 2} after={<span className="t15">판</span>} />
            <Counter label="승률" value={Math.round(battle.wins / battle.picked * 100)} unit="%" cells={battle.wins === battle.picked ? 3 : 2} after={<span className="t15">%</span>} />
          </div>
        </section>}

        {dex && <section className="rc-sec" aria-labelledby="rc-pk-st-h">
          <SectionHead id="rc-pk-st-h" title="능력치" />
          <div className="rc-pk-cols" style={{ "--n": spread ? 2 : 1 }}>
            <div className="rc-group">
              <div className="tb-subhead"><span className="t12 dim">종족값</span><b className="t12">합계 {total}</b></div>
              <div className="stack">{STAT_KEYS.map((key) => <BarRow key={key} keyed name={STAT_LABELS[key]} share={(dex.baseStats?.[key] || 0) / 200} value={dex.baseStats?.[key] ?? ""} />)}</div>
            </div>
            {spread && <div className="rc-group">
              <div className="tb-subhead"><span className="t12 dim">평균 능력 포인트 (샘플 {spread.n}개)</span><b className="t12">한 능력 최대 32</b></div>
              <div className="stack">{STAT_KEYS.map((key, k) => <BarRow key={key} keyed name={STAT_LABELS[key]} share={spread.avg[k] / 32} value={Math.round(spread.avg[k] * 10) / 10} />)}</div>
            </div>}
          </div>
        </section>}

        {samples.length > 0 && <section className="rc-sec" aria-labelledby="rc-pk-use-h">
          <SectionHead id="rc-pk-use-h" title={`많이 쓴 구성 (샘플 ${samples.length}개 기준)`} />
          {detail ? <div className="rc-pk-use">
            <BarGroup label="기술" columns={2} total={usage.total} rows={named(usage.moves.slice(0, 8), (id) => ({ name: moveName(detail, id), tag: typeTag(detail.moves?.[id]?.type) }))} />
            <div className="rc-pk-cols" style={{ "--n": 3 }}>
              <BarGroup label="도구" total={usage.total} rows={named(usage.items.slice(0, 3), (id) => ({ name: itemName(detail, id) }))} />
              <BarGroup label="특성" total={usage.total} rows={named(usage.abilities.slice(0, 3), (id) => ({ name: abilityName(id) }))} />
              <BarGroup label="성격" total={usage.total} rows={named(usage.natures.slice(0, 3), (id) => {
                const a = ALIGNMENTS.find((x) => x.id === id);
                return { name: natureName(a), note: effect(a) };
              })} />
            </div>
          </div> : display === "error" ? <ErrorNote>배틀 데이터를 불러오지 못해 구성을 보여 줄 수 없습니다.</ErrorNote> : <Loader small />}
        </section>}

        {samples.length > 0 && <section className="rc-sec" aria-labelledby="rc-pk-sm-h">
          <SectionHead id="rc-pk-sm-h" title="사용한 샘플" />
          <div className="stack">
            {(more ? samples : samples.slice(0, 8)).map(({ roster, set }) => (
              <Row key={roster.id} title={roster.owner} line={[formatDate(roster.date), rosterTitle(roster), ...(detail ? [set.item_id && itemName(detail, set.item_id), set.ability_id && abilityName(set.ability_id)] : [])].filter(Boolean).join(", ")} onClick={() => onParty({ roster, set })} />
            ))}
          </div>
          {!more && samples.length > 8 && <div className="rc-more"><Button variant="second" onClick={() => setMore(true)}>{samples.length}개 전체 보기</Button></div>}
        </section>}

        <section className="rc-sec" aria-labelledby="rc-pk-tr-h">
          <SectionHead id="rc-pk-tr-h" title="많이 등록한 트레이너" />
          <BarGroup label={`등록 엔트리 ${pokemon.entries}회 중`} unit="회" total={pokemon.entries} rows={trainers} />
        </section>
        <section className="rc-sec" aria-labelledby="rc-pk-pt-h">
          <SectionHead id="rc-pk-pt-h" title="함께 많이 등록된 포켓몬" />
          {pokemon.partners.length
            ? <CountList items={pokemon.partners.slice(0, 8)} sprites={snapshot.pokemon} />
            : <Empty title="동반 엔트리 기록이 없습니다." desc="파티 엔트리가 저장되면 이곳에 표시됩니다." />}
        </section>

        {pokemon.champions.length > 0 && (
          <section className="rc-sec" aria-labelledby="rc-pk-ch-h">
            <SectionHead id="rc-pk-ch-h" title="역대 챔피언 엔트리" />
            <div className="stack">
              {pokemon.champions.map((item, index) => <Row key={`${item.gen}:${index}`} title={`${generationText(item.gen)} ${item.name}`} line={item.season} />)}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

/* ============================== RANKING HUB ==============================
   컨트롤은 하나: [현재 시즌 | 누적 랭킹] 과 지난 기록 목록(지난 시즌, 클래식 누적).
   처음에는 현재 시즌을 보여 준다. 시즌 중인 회원이 궁금한 것은 이번 시즌 순위다. */
function RankingHub({ snapshot, data, admin, setModal, save, onName }) {
  const seasons = snapshot.ranking?.seasons || data.seasons || [];
  const eras = snapshot.ranking?.series || data.rankings || [];
  const normalizedMode = seasons.some((row) => row.source === "normalized") || eras.some((row) => row.source === "normalized");
  // 정규화 기록은 최신 시즌이 맨 앞, 예전 기록은 맨 뒤에 있다.
  const seasonOrder = (normalizedMode ? seasons.map((x, i) => i) : seasons.map((x, i) => i).reverse());
  const current = seasonOrder[0];
  const views = [
    ...seasonOrder.map((i) => ({ id: `s:${i}`, label: seasons[i].name, season: seasons[i] })),
    ...eras.map((era, i) => ({ id: `e:${era.key}`, label: i === 0 ? "누적 랭킹" : `${era.label} 누적`, era })),
  ];
  const primary = [views.find((v) => v.id === `s:${current}`), views.find((v) => v.era)].filter(Boolean);
  const past = views.filter((v) => !primary.includes(v));
  const [sel, setSel] = useState(null);
  const view = views.find((v) => v.id === sel) || primary[0];
  const options = [...primary, ...(view && !primary.includes(view) ? [view] : [])].map((v) => [v.id, v.label]);

  const addEra = async () => {
    const name = (await sitePrompt({ title: "누적 랭킹 탭 추가", label: "탭 이름", placeholder: "예: 클래식", confirmLabel: "추가" })) || "";
    if (!name) return;
    const key = "r_" + uid();
    save({ ...data, rankings: [...(data.rankings || []), { key, label: name, rows: [] }] });
    setSel(`e:${key}`);
  };
  const addSeason = async () => {
    const name = (await sitePrompt({ title: "시즌 추가", label: "시즌 이름", placeholder: "예: YPL 시즌 3", confirmLabel: "추가" })) || "";
    if (!name) return;
    save({ ...data, seasons: [...(data.seasons || []), { name, rows: [] }] });
    setSel(`s:${seasons.length}`);
  };

  return (
    <>
      <div className="rc-season">
        {views.length > 0 && <Dropdown value={view?.id || ""} ariaLabel="시즌" onChange={setSel} options={views.map((v) => ({ value: v.id, label: v.label }))} />}
        {admin && !normalizedMode && <div className="stack rc-admin-two">
          <Button variant="second" onClick={addSeason}>시즌 추가</Button>
          <Button variant="second" onClick={addEra}>누적 탭 추가</Button>
        </div>}
      </div>
      {!view ? <Empty title="랭킹 기록이 없습니다." desc="대회 결과가 확정되면 이곳에 표시됩니다." />
        : view.era ? <RankView era={view.era} data={data} admin={admin} setModal={setModal} onName={onName} />
        : <SeasonView s={view.season} data={data} admin={admin} setModal={setModal} onName={onName} />}
      <p className="t12 dim reg rc-note">
        누적 랭킹과 시즌 성적은 이전 기록에서 넘어온 점수에 대회마다 얻은 점수를 더해 매깁니다.
        포인트는 마스터 리그와 마스터 리그 팀전에서만 쌓입니다. 파이컵 라이트와 루키 리그에는 포인트가 없습니다.
      </p>
    </>
  );
}

function RankView({ era, data, admin, setModal, onName }) {
  const legacyEras = data.rankings || [];
  const [open, setOpen] = useState(false);
  return (
    <div className="rc-rank">
      {admin && era.source !== "normalized" && (
        <div className="rc-admin"><Button variant="second" onClick={() => setModal({
          type: "standings", title: era.label + " 랭킹", rows: era.rows,
          build: (rows) => ({ ...data, rankings: legacyEras.map((x) => x.key === era.key ? { ...x, rows } : x) }),
        })}>이 시기 랭킹 수정</Button></div>
      )}
      <StandTable rows={era.rows} total={era.rows.length} onName={onName} open={open} onMore={() => setOpen(true)} />
    </div>
  );
}

function SeasonView({ s, data, admin, setModal, onName }) {
  const legacySeasons = data.seasons || [];
  const [open, setOpen] = useState(false);
  return (
    <div className="rc-rank">
      {admin && s.source !== "normalized" && (
        <div className="rc-admin"><Button variant="second" onClick={() => setModal({
          type: "standings", title: s.name, rows: s.rows,
          build: (rows) => ({ ...data, seasons: legacySeasons.map((x) => x.name === s.name ? { ...x, rows } : x) }),
        })}>{s.name} 성적 수정</Button></div>
      )}
      {s.rows.length ? <StandTable rows={s.rows} total={s.rows.length} onName={onName} open={open} onMore={() => setOpen(true)} />
        : <Empty title={`${s.name} 성적은 아직 없습니다.`} desc="대회 결과가 확정되면 이곳에 표시됩니다." />}
    </div>
  );
}
