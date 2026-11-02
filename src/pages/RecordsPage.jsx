import React, { useEffect, useMemo, useState } from "react";
import { Dropdown, Empty, ErrorNote, Icon, ListSearch, Loader, Modal, Pager, StandTable, sitePrompt } from "../components/index.js";
import { Chips, Counter, Mon, Row, SectionHead, TabsLine } from "../components/common/Board.jsx";
import { loadChampions, seenChampions } from "../components/home/homeFacts.js";
import TeamSheet, { rosterSheet, useTeamDisplay } from "../components/common/TeamSheet.jsx";
import { buildRecordsSnapshot, displayRecordMeta, displayTeamName } from "../services/recordsAnalytics.js";
import { formatDate } from "../services/dateFormat.js";
import { buildNormalizedRecordsProjection } from "../services/normalizedRecordsProjection.js";
import { ALIGNMENTS, abilityName, itemName, moveName, natureName, spriteUrl } from "../services/teamBuilderCore.js";
import { loadRecordsPokemonDirectory } from "../services/recordsPokemon.js";
import { buildHallOfFameArtworkLookup, resolveHallOfFameArtwork } from "../services/hallOfFamePresentation.js";
import { freshRead, peekRead } from "../services/readCache.js";
import { buildIndividualPartyPreviewRows, buildTeamPartyPreviewRows, pokemonSamples, sampleUsage } from "../services/recordsPresentation.js";
import {
  fetchNormalizedRecordsSnapshot,
  normalizedRecordsReadEnabled,
} from "../services/normalizedRecordsService.js";
import { syncTournamentRounds } from "../services/recordSync.js";
import { leagueTitle, recordRoundTitle } from "../services/eventName.js";
import { generationText } from "../services/seasonLabel.js";
import Button from "../components/common/Button.jsx";

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
    <Modal title={`${roster.owner}의 ${set ? "샘플" : "파티"}`} hint={[rosterTitle(roster), formatDate(roster.date)].filter(Boolean).join(", ")} className="rc-sheet" onClose={onClose}>
      {!detailed && <>
        <div className="rc-six">{rosterParty(roster).map((m, i) => <span className="pn stand rc-cell" key={i}><Mon src={m.img} /><span className="floor rc-band t12">{m.name}</span></span>)}</div>
        <p className="rc-lead-note">이 파티는 포켓몬 구성만 기록되어 있습니다.</p>
      </>}
      {detailed && display === "error" && <ErrorNote>배틀 데이터를 불러오지 못해 세부 샘플을 보여 줄 수 없습니다.</ErrorNote>}
      {detailed && !display && <Loader small />}
      {detailed && sheet.length > 0 && <TeamSheet sheet={sheet} />}
      <div className="modal-actions"><Button variant="primary" onClick={() => onTrainer(roster.owner)}>{roster.owner} 기록 보기</Button></div>
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
  useEffect(() => { let live = true; loadChampions(data).then((rows) => { if (live) setChampions(rows); }).catch(() => {}); return () => { live = false; }; }, [data]);
  const dated = (snapshot.archives || []).map((a) => String(a.date || "").match(/\d+/g)).filter((n) => n?.length >= 2).sort((a, b) => (a[0] + a[1].padStart(2, "0")).localeCompare(b[0] + b[1].padStart(2, "0")));
  const since = dated[0] ? `${dated[0][0]}년 ${+dated[0][1]}월부터` : "";

  return (
    <section className="rc">
      <header className="rc-head"><h1 className="t32">기록</h1>{since && <span className="t12 dim">{since}</span>}</header>
      <div className="stack rc-counts">
        <Counter label="대회" value={normalizedRead.loading ? null : (snapshot.archives || []).length} unit="회" cells={(snapshot.archives || []).length >= 100 ? 3 : 2} />
        <Counter label="트레이너" value={normalizedRead.loading ? null : snapshot.trainers.length} unit="명" cells={snapshot.trainers.length >= 100 ? 3 : 2} />
        <Counter label="챔피언" value={champions ? champions.length : null} unit="명" />
      </div>
      {normalizedRead.error && (
        <ErrorNote onRetry={() => setReloadKey((value) => value + 1)}>공식 기록을 읽지 못해 아래에는 기존 기록만 표시됩니다. 다시 시도해 주세요.</ErrorNote>
      )}
      <div className="rc-tabs"><TabsLine value={tab} onChange={setTab} label="기록 보기" options={RECORD_TABS} /></div>

      <div className="swap rc-body" key={tab}>
        {normalizedRead.loading ? <Loader small /> : <>
        {tab === "trainer" && <TrainerView snapshot={snapshot} onOpen={openTrainer} />}
        {tab === "tour" && <TournamentArchiveView snapshot={snapshot} data={data} admin={admin} setModal={setModal} onParty={setParty} />}
        {tab === "pokemon" && <PokemonView snapshot={snapshot} onParty={setParty} />}
        {tab === "rank" && <RankingHub snapshot={snapshot} data={data} admin={admin} setModal={setModal} save={save} onName={openTrainer} />}
        </>}
      </div>
      {sheet && (() => {
        const profile = profileOf(snapshot, sheet.key);
        return profile ? (
          <Modal label={`${profile.name} 기록`} className="rc-sheet" onClose={closeTrainer} fly={sheet.from ? { from: sheet.from, selector: ".rc-name" } : undefined}>
            <TrainerProfile snapshot={snapshot} profile={profile} onParty={setParty} />
          </Modal>
        ) : null;
      })()}
      {party && <PartySheet open={party} onClose={() => setParty(null)} onTrainer={(name) => { setParty(null); openTrainer(name); }} />}
    </section>
  );
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
          {rows.map((trainer, i) => (
            <Row key={trainer.key || trainer.name} className={"rc-tr" + (i === 0 && !query.trim() ? " inv" : "")}
              lead={<span className="num t12">{snapshot.trainers.indexOf(trainer) + 1}</span>} title={trainer.name}
              value={<span className="rc-three">{[trainer.wins, trainer.runnerUps, trainer.top4].map((v, k) => <span key={k} className={"num" + (v ? "" : " mute")}>{v}</span>)}</span>}
              onClick={(e) => onOpen(trainer.key || trainer.name, e.currentTarget.querySelector(".row-main b"))}
              label={`${trainer.name}, 우승 ${trainer.wins} 준우승 ${trainer.runnerUps} 4강 ${trainer.top4}`} />
          ))}
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
      <section aria-labelledby="rc-trainer-name">
        <div className="rc-who">
          <h3 className="t32 rc-name" id="rc-trainer-name">{profile.name}</h3>
          <Dropdown
            value={season}
            onChange={(value) => { setSeason(value); setHistPage(1); }}
            ariaLabel="시즌 필터"
            options={[{ value: "", label: "전체 기록" }, ...snapshot.seasons.map((name) => ({ value: name, label: name }))]}
          />
        </div>
        <div className="stack rc-counts">
          <Counter label="우승" value={championships} unit="회" />
          <Counter label="준우승" value={runnerUps} unit="회" />
          <Counter label="4강" value={top4} unit="회" />
        </div>
        <p className="t12 dim reg rc-joined">참가 <span className="num">{history.length}</span>회</p>
        {(profile.champions.length > 0 || restTitles.length > 0) && (<>
          <p className="t12 dim rc-chips-label">칭호</p>
          <div className="chips rc-titles">
            {profile.champions.map((c, i) => <span key={`c${i}`} className="inv">{genLabel(c.gen)}</span>)}
            {restTitles.map((title, i) => <span key={`t${i}`} className="pn">{title.name}</span>)}
          </div>
        </>)}
      </section>

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

      {parties.length > 0 && <section className="rc-sec" aria-labelledby="rc-party-h">
        <SectionHead id="rc-party-h" title={`사용한 파티 ${parties.length}개`} />
        <div className="stack">
          {(allParties ? parties : parties.slice(0, 4)).map((roster) => (
            <Row key={roster.id || roster.snapshotId} title={rosterTitle(roster)} line={[formatDate(roster.date), roster.team && displayTeamName(roster.teamName), (roster.pokemon || []).join(", ")].filter(Boolean).join(", ")} onClick={() => onParty({ roster })} label={`${rosterTitle(roster)} 파티 보기`} />
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

/* ---- shared pieces of the records views ---- */

/* 포켓몬의 횟수: 그림이 있으면 바닥 띠 위에 선 여섯 칸, 없으면 줄 */
function CountList({ items, sprites }) {
  const sprite = (name) => pictureOf(name, sprites.find((p) => p.name === name)?.spriteName);
  if (sprites) return (
    <div className="rc-six">
      {items.map((item) => <span className="pn stand rc-cell" key={item.name}><Mon src={sprite(item.name)} /><span className="floor rc-band"><b className="t12">{item.name}</b><span className="t12 dim num">{item.entries}회</span></span></span>)}
    </div>
  );
  return (
    <div className="stack">
      {items.map((item) => <Row key={item.name} title={item.name} value={<span className="t15 num">{item.entries}<span className="t12 dim">회</span></span>} />)}
    </div>
  );
}

/* ============================== TOURNAMENT ARCHIVE ============================== */
function NameChips({ list, kind }) {
  return <>{(list || []).map((n, i) => <span key={i} className={"r2-name " + (kind || "")}>{n}</span>)}</>;
}

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
    /* 순위마다 한 줄: 이름표 열 뒤에 이름. 팀전은 팀마다 줄을 나눈다. */
    const resultLines = (lines) => (
      <div className="r2-res">
        {lines.map(([placement, label, entries]) => entries.map((entry, k) => (
          <div className="r2-line" key={`${placement}:${k}`}>
            <span className={"r2-rk" + (placement === "win" ? " gold" : "")}>{k === 0 ? label : ""}</span>
            <span className="r2-names">
              {entry.names.map((name, n) => <span key={`${name}:${n}`} className={"r2-name" + (placement === "win" ? " win" : "")}>{name}</span>)}
              {entry.members?.length > 0 && <NameChips list={entry.members} kind="mem" />}
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
          {toggleable && !r.team ? (
            <button type="button" className="records-round-toggle" aria-expanded={expanded} onClick={toggle}>
              <div className="records-round-summary">
                {head}
                {individualResults()}
              </div>
              <span className="records-round-chevron" aria-hidden="true"><Icon n="chev" size={16} /></span>
            </button>
          ) : <>
          {head}
          {!r.team && individualResults()}
          {r.team && teamResults()}</>}
          {toggleable && r.team && (
            <button type="button" className="records-round-toggle" aria-expanded={expanded} onClick={toggle}>
              <span className="records-round-summary">팀원별 공식 파티</span>
              <span className="records-round-chevron" aria-hidden="true"><Icon n="chev" size={16} /></span>
            </button>
          )}
          {toggleable && expanded && (
            <ul className="records-round-detail stack">
              {partyRows.map((row, index) => {
                const roster = row.roster?.pokemon?.length ? row.roster : null;
                const line = [row.label, row.teamName && displayTeamName(row.teamName), !roster && "파티 미제출"].filter(Boolean).join(", ");
                return <li key={`${row.placement}:${row.name}:${index}`}>
                  <Row title={row.name} line={[line, roster && (roster.pokemon || []).join(", ")].filter(Boolean).join(", ")} onClick={roster ? () => onParty({ roster }) : undefined} label={roster ? `${row.name} 파티 보기` : undefined} />
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

  return (<>
    <Chips value={selectedTour ? selectedTour.key : "all"} onChange={setCategory} label="대회 종류"
      options={[["all", `전체 ${(snapshot.archives || []).length}`], ...otours.map((tour) => [tour.key, `${tour.label} ${(tour.rounds || []).length}`])]} />

    {selectedTour ? (
      <div className="swap" key={category}>
        {admin && selectedTour.legacy && <div className="rc-admin"><Button variant="second" onClick={openRoundEditor}>회차 편집</Button></div>}
        <ul className="stack rc-rounds">
          {sortRounds(selectedTour.rounds).map((r, i) => renderRound(selectedTour, r, r.id || i, false))}
        </ul>
      </div>
    ) : (
      <>
        <div className="rc-list-search"><ListSearch q={query} setQ={setQuery} placeholder="대회명, 시즌, 룰, 입상자, 포켓몬 검색" count={allRows.length} /></div>
        {allRows.length ? (
          <ul className="stack rc-rounds swap">
            {allRows.map(({ tour, round, key }) => renderRound(tour, round, key, true))}
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

function PokemonSheet({ snapshot, pokemon, rank, onClose, onParty }) {
  const samples = useMemo(() => pokemonSamples(snapshot.rosters, pokemon.name), [snapshot.rosters, pokemon.name]);
  const usage = useMemo(() => sampleUsage(samples), [samples]);
  const display = useTeamDisplay(samples.length > 0);
  const detail = display && display !== "error" ? display.detailData : null;
  const line = (rows, name) => rows.slice(0, 3).map((row) => `${name(row.id)} ${row.rate}%`).join(", ");
  const natureOf = (id) => natureName(ALIGNMENTS.find((a) => a.id === id));
  const [more, setMore] = useState(false);
  return (
    <Modal label={`${pokemon.name} 기록`} className="rc-sheet" onClose={onClose}>
      <div className="rc-profile">
        <section aria-labelledby="rc-pokemon-name">
          <div className="pn stand rc-mon-lead">
            <span className="rc-mon-who"><h3 className="t20" id="rc-pokemon-name">{pokemon.name}</h3><span className="t12 dim">{rank}위</span></span>
            <Mon src={pictureOf(pokemon.name, pokemon.spriteName)} />
            <i className="floor" aria-hidden="true" />
          </div>
          <div className="stack rc-counts">
            <Counter label="등록 엔트리" value={pokemon.entries} unit="회" cells={pokemon.entries >= 100 ? 3 : 2} />
            <Counter label="사용 트레이너" value={pokemon.trainerCount} unit="명" cells={pokemon.trainerCount >= 100 ? 3 : 2} />
            <Counter label="우승 엔트리" value={pokemon.wins} unit="회" />
          </div>
          <p className="t12 dim reg rc-joined">채용률 <span className="num">{pokemon.entryRate.toFixed(1)}%</span></p>
        </section>
        <p className="t12 dim reg rc-lead-note">
          채용률은 저장된 파티 엔트리 {snapshot.rosters.length}개를 기준으로 계산합니다.
          실제 경기 선출 여부는 기록하지 않으므로 포켓몬 승률은 표시하지 않습니다.
        </p>

        {samples.length > 0 && <section className="rc-sec" aria-labelledby="rc-pk-use-h">
          <SectionHead id="rc-pk-use-h" title="많이 쓴 구성 (샘플 {samples.length}개 기준)" />
          {detail ? <dl className="sc-facts rc-usage">
            <div><dt>도구</dt><dd>{line(usage.items, (id) => itemName(detail, id))}</dd></div>
            <div><dt>특성</dt><dd>{line(usage.abilities, abilityName)}</dd></div>
            <div><dt>성격</dt><dd>{line(usage.natures, natureOf)}</dd></div>
            <div><dt>기술</dt><dd>{usage.moves.slice(0, 6).map((row) => `${moveName(detail, row.id)} ${row.rate}%`).join(", ")}</dd></div>
          </dl> : display === "error" ? <ErrorNote>배틀 데이터를 불러오지 못해 구성을 보여 줄 수 없습니다.</ErrorNote> : <Loader small />}
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
          <CountList items={pokemon.trainers.slice(0, 8)} />
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
