import React, { useEffect, useMemo, useState } from "react";
import { Dropdown, Facts, Icon, Pager, Poster, Reveal, Segmented, StandTable, sitePrompt } from "../components/index.js";
import { buildRecordsSnapshot, displayRecordMeta, displayTeamName } from "../services/recordsAnalytics.js";
import { buildNormalizedRecordsProjection } from "../services/normalizedRecordsProjection.js";
import { spriteUrl } from "../services/teamBuilderCore.js";
import { loadRecordsPokemonDirectory } from "../services/recordsPokemon.js";
import { buildIndividualPartyPreviewRows, buildTeamPartyPreviewRows } from "../services/recordsPresentation.js";
import {
  fetchNormalizedRecordsSnapshot,
  normalizedRecordsReadEnabled,
} from "../services/normalizedRecordsService.js";
import { syncTournamentRounds } from "../services/recordSync.js";

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

/* ============================== RECORDS ============================== */
export default function RecordsPage({ data, admin, setModal, save }) {
  const [tab, setTab] = useState("trainer");
  const normalizedEnabled = normalizedRecordsReadEnabled();
  const [normalizedRead, setNormalizedRead] = useState({ loading: normalizedEnabled, data: null, error: null });
  const [pokemonDirectory, setPokemonDirectory] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!normalizedEnabled) {
      setNormalizedRead({ loading: false, data: null, error: null });
      return () => { cancelled = true; };
    }

    setNormalizedRead((current) => ({ ...current, loading: true, error: null }));
    fetchNormalizedRecordsSnapshot()
      .then((next) => {
        if (!cancelled) setNormalizedRead({ loading: false, data: next, error: null });
      })
      .catch((error) => {
        console.error("normalized Records read failed", error);
        if (!cancelled) setNormalizedRead({ loading: false, data: null, error });
      });
    return () => { cancelled = true; };
  }, [normalizedEnabled, reloadKey]);

  useEffect(() => {
    if (!normalizedEnabled) return undefined;
    let cancelled = false;
    loadRecordsPokemonDirectory()
      .then((directory) => {
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

  return (
    <section className="sec">
      <Reveal className="sec-head">
        <h2>기록</h2>
        <p className="sub">YPL의 대회 성적과 저장된 대진표를 바탕으로 트레이너, 대회, 포켓몬 기록을 한곳에 정리합니다.</p>
      </Reveal>

      {normalizedRead.loading && (
        <div className="records-read-state sq">공식 기록을 불러오는 중입니다.</div>
      )}
      {normalizedRead.error && (
        <div className="records-read-state sq is-error" role="alert">
          <span>공식 기록을 읽지 못해 아래에는 기존 기록만 표시됩니다. 다시 시도해 주세요.</span>
          <button type="button" className="ypl-btn ypl-btn--sm ypl-btn--tonal press" onClick={() => setReloadKey((value) => value + 1)}>다시 시도</button>
        </div>
      )}

      <Reveal className="records-main-tabs">
        <Segmented
          value={tab}
          onChange={setTab}
          ariaLabel="기록 보기"
          options={[["trainer", "트레이너"], ["tour", "대회"], ["pokemon", "포켓몬"], ["rank", "랭킹"]]}
        />
      </Reveal>

      <div className="swap" key={tab}>
        {tab === "trainer" && <TrainerView snapshot={snapshot} />}
        {tab === "tour" && <TournamentArchiveView snapshot={snapshot} data={data} admin={admin} setModal={setModal} />}
        {tab === "pokemon" && <PokemonView snapshot={snapshot} />}
        {tab === "rank" && <RankingHub snapshot={snapshot} data={data} admin={admin} setModal={setModal} save={save} />}
      </div>
    </section>
  );
}

/* ============================== TRAINERS ============================== */
function TrainerView({ snapshot }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(snapshot.trainers[0]?.key || snapshot.trainers[0]?.name || "");
  const [season, setSeason] = useState("");
  const [histPage, setHistPage] = useState(1);

  const visible = snapshot.trainers.filter((t) => t.name.includes(query.trim()));
  const currentKey = snapshot.profiles[selected]
    ? selected
    : visible[0]?.key || visible[0]?.name || snapshot.trainers[0]?.key || snapshot.trainers[0]?.name;
  const profile = currentKey ? snapshot.profiles[currentKey] : null;

  if (!profile) return <EmptyTile title="트레이너 기록이 없습니다." />;

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
  const genLabel = (g) => `${String(g || "").replace(/\s*챔피언\s*$/, "")} 챔피언`;
  const shownTitles = new Set(profile.champions.map((c) => genLabel(c.gen)));
  const restTitles = profile.titles.filter((t) => !shownTitles.has(t.name));
  const historyRows = history.slice().sort(compareHistoryRecency).slice((histCur - 1) * HIST_PER_PAGE, histCur * HIST_PER_PAGE);

  return (
    <div className="rc-layout">
      <aside className="rc-rail sq" aria-label="트레이너 목록">
        <RailSearch value={query} onChange={setQuery} placeholder="트레이너 검색" count={`${visible.length}명`} />
        <div className="rc-rail-scroll">
          {visible.map((trainer) => {
            const on = (trainer.key || trainer.name) === currentKey;
            return (
              <button
                key={trainer.key || trainer.name}
                className={"rc-rail-row" + (on ? " on" : "")}
                aria-pressed={on}
                onClick={() => { setSelected(trainer.key || trainer.name); setHistPage(1); }}
              >
                <span className="ypl-row__title">{trainer.name}</span>
                <span className="ypl-row__meta">우승 {trainer.wins}, 준우승 {trainer.runnerUps}, 4강 {trainer.top4}</span>
              </button>
            );
          })}
          {!visible.length && <p className="rc-rail-none">검색 결과가 없습니다.</p>}
        </div>
      </aside>

      <div className="rc-profile">
        <section className="rc-lead sq" aria-labelledby="rc-trainer-name">
          <div className="rc-lead-head">
          <h3 className="rc-lead-title" id="rc-trainer-name">{profile.name}</h3>
          <Dropdown
            className="dd--lead"
            value={season}
            onChange={(value) => { setSeason(value); setHistPage(1); }}
            ariaLabel="시즌 필터"
            options={[{ value: "", label: "전체 기록" }, ...snapshot.seasons.map((name) => ({ value: name, label: name }))]}
          />
          </div>
          <div className="rc-lead-figs">
            <Poster label="우승" value={championships} unit="회" />
            <Facts items={[["참가", `${history.length}회`], ["준우승", `${runnerUps}회`], ["4강", `${top4}회`]]} />
          </div>
          {(profile.champions.length > 0 || restTitles.length > 0) && (
            <div className="rc-lead-chips">
              {profile.champions.map((c, i) => <span key={`c${i}`} className="ypl-chip ypl-chip--lead">{genLabel(c.gen)}</span>)}
              {restTitles.map((title, i) => <span key={`t${i}`} className="ypl-chip ypl-chip--lead">{title.name}</span>)}
            </div>
          )}
        </section>

        <section className="rc-sec" aria-labelledby="rc-hist-h">
          <div className="rc-sech"><h4 id="rc-hist-h">대회 이력</h4><span>최근 순으로 {history.length}건</span></div>
          {history.length ? (
            <ul className="ypl-group sq">
              {historyRows.map((event) => {
                const teamName = displayTeamName(event.teamName);
                const rule = displayRecordMeta(event.rule);
                const label = event.resultLabel || placementLabel(event.placement, event.team);
                const meta = [event.season, teamName, rule].filter(Boolean).join(", ");
                return (
                  <li key={`${event.id}:${event.playerId || profile.playerId || profile.key}:${event.placement}`}>
                    <div className="ypl-row rc-hist-row">
                      <span className="rc-hist-main">
                        <span className="ypl-row__title">{event.championSeries
                          ? "챔피언스 시리즈"
                          : event.eventName || `${event.tournamentName}${event.round ? ` ${event.round}회` : ""}`}</span>
                        {meta && <span className="ypl-row__meta">{meta}</span>}
                      </span>
                      <span className="rc-hist-end">
                        <span className={"rc-place" + (event.placement === "win" ? " win" : "")}>{label}</span>
                        <span className="ypl-row__end">{event.date}</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyTile title="확인 가능한 대회 기록이 없습니다." />}
          <Pager page={histCur} pages={histPages} onGo={setHistPage} />
        </section>

        <section className="rc-sec" aria-labelledby="rc-fav-h">
          <div className="rc-sech"><h4 id="rc-fav-h">엔트리 기록</h4><span>자주 쓴 포켓몬</span></div>
          {favorites.length ? (
            <CountList items={favorites.slice(0, 6)} />
          ) : (
            <EmptyTile title="저장된 우승 엔트리가 없습니다." desc="대진표에서 결과를 확정하면 이곳에 자동으로 표시됩니다." />
          )}
        </section>
      </div>
    </div>
  );
}

/* ---- shared pieces of the records views ---- */
function EmptyTile({ title, desc }) {
  return <div className="ypl-empty sq"><b>{title}</b>{desc && <p>{desc}</p>}</div>;
}

function RailSearch({ value, onChange, placeholder, count }) {
  return (
    <div className="rc-search">
      <div className="records-search-field">
        <span className="search-input-icon" aria-hidden="true"><Icon n="search" size={16}/></span>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </div>
      <span className="tnum">{count}</span>
    </div>
  );
}

function CountList({ items }) {
  return (
    <ul className="ypl-group sq">
      {items.map((item) => (
        <li key={item.name}><div className="ypl-row"><span className="ypl-row__title">{item.name}</span><span className="ypl-row__end">{item.entries}회</span></div></li>
      ))}
    </ul>
  );
}

/* ============================== TOURNAMENT ARCHIVE ============================== */
function NameChips({ list, kind }) {
  return <>{(list || []).map((n, i) => <span key={i} className={"r2-name " + (kind || "")}>{n}</span>)}</>;
}

function PartySprite({ pokemon, spriteName }) {
  const [failed, setFailed] = useState(false);
  if (!spriteName || failed) {
    return <span className="records-party-sprite-fallback" title={`${pokemon} 이미지를 불러오지 못했습니다.`}>{pokemon}</span>;
  }
  return (
    <img
      src={spriteUrl(spriteName)}
      alt=""
      title={pokemon}
      onError={() => setFailed(true)}
    />
  );
}

function PartySprites({ roster }) {
  if (!roster?.pokemon?.length) return null;
  return (
    <span className="records-party-sprites" aria-label={`${roster.owner}의 공식 파티`}>
      {roster.pokemon.map((pokemon, index) => (
        <PartySprite
          key={`${roster.snapshotId || roster.id}:${index}`}
          pokemon={pokemon}
          spriteName={roster.spriteNames ? roster.spriteNames[index] : pokemon}
        />
      ))}
    </span>
  );
}

function TournamentArchiveView({ snapshot, data, admin, setModal }) {
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
  const [openRoundKey, setOpenRoundKey] = useState(null);
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
    const rl = championSeries ? "" : r.round ? (/^\d+$/.test(String(r.round)) ? String(r.round) + "회" : r.round) : "";
    const runnerUps = Array.isArray(r.ru) ? r.ru : split(r.ru);
    const rule = displayRecordMeta(r.rule);
    const partyRows = r.team ? buildTeamPartyPreviewRows(r) : buildIndividualPartyPreviewRows(r);
    const toggleable = r.source === "normalized" && partyRows.length > 0;
    const expanded = openRoundKey === key;
    const toggle = () => setOpenRoundKey((current) => current === key ? null : key);
    const championshipEmphasis = championSeries && r.championshipPhase !== "qualifier";
    const individualResults = () => (
      <div className="r2-res">
        {[
          ["win", "우승", partyRows.filter((row) => row.placement === "win")],
          ["ru", "준우승", partyRows.filter((row) => row.placement === "ru")],
          ["sf", "4강", partyRows.filter((row) => row.placement === "sf")],
        ].map(([placement, label, rows]) => rows.length > 0 && (
          <React.Fragment key={placement}>
            <span className={"r2-rk" + (placement === "win" ? " gold" : "")}>{label}</span>
            {rows.map((row) => <span key={`${row.placement}:${row.name}`} className={"r2-name" + (placement === "win" ? " win" : "")}>{row.name}</span>)}
          </React.Fragment>
        ))}
      </div>
    );
    return (
      <li className={"round2" + (championshipEmphasis ? " champ" : "")} key={key}>
        <div className="r2-date num">{r.date}</div>
        <div className="r2-main">
          {toggleable && !r.team ? (
            <button type="button" className="records-round-toggle" aria-expanded={expanded} onClick={toggle}>
              <div className="records-round-summary">
                {(showCompetition || rl || rule || r.team || championshipEmphasis || r.season) && <span className="r2-head">
                  {showCompetition && <span className="r2-rule">{tour.label}</span>}
                  {rl && <span className="r2-round">{rl}</span>}
                  {r.season && <span className="r2-season">{r.season}</span>}
                  {championshipEmphasis && <span className="r2-champ">챔피언스 시리즈</span>}
                  {r.team && <span className="r2-mode">팀전</span>}
                  {rule && <span className="r2-rule">{rule}</span>}
                </span>}
                {individualResults()}
              </div>
              <span className="records-round-chevron" aria-hidden="true"><svg viewBox="0 0 12 8"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            </button>
          ) : <>
          {(showCompetition || rl || rule || r.team || championshipEmphasis || r.season) && <div className="r2-head">
            {showCompetition && <span className="r2-rule">{tour.label}</span>}
            {rl && <span className="r2-round">{rl}</span>}
            {r.season && <span className="r2-season">{r.season}</span>}
            {championshipEmphasis && <span className="r2-champ">챔피언스 시리즈</span>}
            {r.team && <span className="r2-mode">팀전</span>}
            {rule && <span className="r2-rule">{rule}</span>}
          </div>}
          {!r.team && individualResults()}
          {r.team && <div className="r2-res">
            <span className="r2-rk gold">우승</span>
            {r.win && <span className="r2-name win">{r.team ? displayTeamName(r.win) : r.win}</span>}
            {r.winMembers && r.winMembers.length > 0 && <NameChips list={r.winMembers} kind="mem" />}
            {(runnerUps.length > 0 || (r.ruMembers && r.ruMembers.length > 0)) && <>
              <span className="r2-rk">준우승</span>
              {r.team
                ? (runnerUps[0] && <span className="r2-name">{displayTeamName(runnerUps[0])}</span>)
                : runnerUps.map((name, index) => (
                    <React.Fragment key={`${name}:${index}`}>
                      <span className="r2-name">{name}</span>
                    </React.Fragment>
                  ))}
              {r.ruMembers && r.ruMembers.length > 0 && <NameChips list={r.ruMembers} kind="mem" />}
            </>}
            {(r.sf || []).length > 0 && <>
              <span className="r2-rk">4강</span>
              {r.team
                ? r.sf.map((nm, k) => (
                    <React.Fragment key={k}>
                      {nm && <span className="r2-name">{displayTeamName(nm)}</span>}
                      {(r.sfMembers || [])[k] && r.sfMembers[k].length > 0 && <NameChips list={r.sfMembers[k]} kind="mem" />}
                    </React.Fragment>
                  ))
                : r.sf.map((name, index) => (
                    <React.Fragment key={`${name}:${index}`}>
                      <span className="r2-name">{name}</span>
                    </React.Fragment>
                  ))}
            </>}
          </div>}</>}
          {toggleable && r.team && (
            <button type="button" className="records-round-toggle" aria-expanded={expanded} onClick={toggle}>
              <span className="records-round-summary">팀원별 공식 파티</span>
              <span className="records-round-chevron" aria-hidden="true"><svg viewBox="0 0 12 8"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            </button>
          )}
          {toggleable && expanded && (
            <div className="records-round-detail">
              <div className="records-round-party-list">
                {partyRows.map((row, index) => (
                  <div className="records-round-party-row" key={`${row.placement}:${row.name}:${index}`}>
                    <span className={"r2-rk" + (row.placement === "win" ? " gold" : "")}>{row.label}</span>
                    <div>
                      <span className={"r2-name" + (row.placement === "win" ? " win" : "")}>{row.name}</span>
                      {row.teamName && <div className="r2-season">{displayTeamName(row.teamName)}</div>}
                    </div>
                    {row.roster?.pokemon?.length
                      ? <PartySprites roster={row.roster} />
                      : <span className="records-party-missing">파티 미제출</span>}
                  </div>
                ))}
              </div>
            </div>
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

  if (!otours.length) return <EmptyTile title="대회 기록이 없습니다." />;

  return (<>
    <div className="rc-filter">
      <Segmented
        value={selectedTour ? selectedTour.key : "all"}
        onChange={setCategory}
        ariaLabel="대회 종류"
        options={[["all", "전체"], ...otours.map((tour) => [tour.key, tour.label])]}
      />
    </div>

    {selectedTour ? (
      <div className="swap" key={category}>
        <div className="rc-sech">
          <h4>{selectedTour.label}</h4>
          <span className="tnum">{(selectedTour.rounds || []).length}회</span>
          {admin && selectedTour.legacy && <button className="btn btn-primary btn-sm ed-pencil" onClick={openRoundEditor}>회차 편집</button>}
        </div>
        <ul className="ypl-group sq rc-rounds">
          {sortRounds(selectedTour.rounds).map((r, i) => renderRound(selectedTour, r, r.id || i, false))}
        </ul>
      </div>
    ) : (
      <>
        <div className="records-toolbar">
          <div className="records-search-field">
            <span className="search-input-icon" aria-hidden="true"><Icon n="search" size={16}/></span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="대회명, 시즌, 룰, 입상자 검색" aria-label="대회 기록 검색" />
          </div>
          <span className="tnum">전체 {allRows.length}회차</span>
        </div>
        {allRows.length ? (
          <ul className="ypl-group sq rc-rounds swap">
            {allRows.map(({ tour, round, key }) => renderRound(tour, round, key, true))}
          </ul>
        ) : <EmptyTile title="검색과 맞는 대회 기록이 없습니다." />}
      </>
    )}
  </>);
}

/* ============================== POKEMON ============================== */
function PokemonView({ snapshot }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(snapshot.pokemon[0]?.name || "");
  const normalized = query.trim().toLowerCase();

  const visible = snapshot.pokemon.filter((p) => p.name.toLowerCase().includes(normalized));
  const currentName = snapshot.pokemon.some((p) => p.name === selected) ? selected : visible[0]?.name || snapshot.pokemon[0]?.name;
  const current = snapshot.pokemon.find((p) => p.name === currentName);

  if (!current) {
    return <EmptyTile title="기록에 연결된 파티 엔트리가 없습니다." desc="대진표의 파티 엔트리가 저장되면 자동으로 집계됩니다." />;
  }

  return (
    <div className="rc-layout">
      <aside className="rc-rail sq" aria-label="포켓몬 목록">
        <RailSearch value={query} onChange={setQuery} placeholder="포켓몬 검색" count={`${visible.length}종`} />
        <div className="rc-rail-scroll">
          {visible.map((pokemon, index) => {
            const on = pokemon.name === currentName;
            return (
              <button
                key={pokemon.name}
                className={"rc-rail-row rc-rail-row--rank" + (on ? " on" : "")}
                aria-pressed={on}
                onClick={() => setSelected(pokemon.name)}
              >
                <span className="rc-rail-n tnum">{index + 1}</span>
                <span className="ypl-row__title">{pokemon.name}</span>
                <span className="ypl-row__end">{pokemon.entries}회</span>
              </button>
            );
          })}
          {!visible.length && <p className="rc-rail-none">검색 결과가 없습니다.</p>}
        </div>
      </aside>

      <div className="rc-profile">
        <section className="rc-lead sq" aria-labelledby="rc-pokemon-name">
          <h3 className="rc-lead-title" id="rc-pokemon-name">{current.name}</h3>
          <div className="rc-lead-figs">
            <Poster label="등록 엔트리" value={current.entries} unit="회" />
            <Facts items={[["엔트리 채용률", `${current.entryRate.toFixed(1)}%`], ["사용 트레이너", `${current.trainerCount}명`], ["우승 엔트리", `${current.wins}회`]]} />
          </div>
          <p className="rc-lead-note">
            채용률은 저장된 파티 엔트리 {snapshot.rosters.length}개를 기준으로 계산합니다.
            실제 경기 선출 여부는 기록하지 않으므로 포켓몬 승률은 표시하지 않습니다.
          </p>
        </section>

        <div className="rc-two">
          <section className="rc-sec" aria-labelledby="rc-pk-tr-h">
            <div className="rc-sech"><h4 id="rc-pk-tr-h">많이 등록한 트레이너</h4></div>
            <CountList items={current.trainers.slice(0, 8)} />
          </section>
          <section className="rc-sec" aria-labelledby="rc-pk-pt-h">
            <div className="rc-sech"><h4 id="rc-pk-pt-h">함께 많이 등록된 포켓몬</h4></div>
            {current.partners.length
              ? <CountList items={current.partners.slice(0, 8)} />
              : <EmptyTile title="동반 엔트리 기록이 없습니다." />}
          </section>
        </div>

        {current.champions.length > 0 && (
          <section className="rc-sec" aria-labelledby="rc-pk-ch-h">
            <div className="rc-sech"><h4 id="rc-pk-ch-h">역대 챔피언 엔트리</h4><span>명예의 전당 기록</span></div>
            <ul className="ypl-group sq">
              {current.champions.map((item, index) => (
                <li key={`${item.gen}:${index}`}>
                  <div className="ypl-row">
                    <span className="ypl-row__title rc-crown"><Icon n="crown" size={16}/>{item.gen} {item.name}</span>
                    <span className="ypl-row__end">{item.season}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/* ============================== RANKING HUB ============================== */
function RankingHub({ snapshot, data, admin, setModal, save }) {
  const [sub, setSub] = useState("rank");
  return (
    <>
      <div className="rc-filter">
        <Segmented value={sub} onChange={setSub} ariaLabel="랭킹 보기" options={[["rank", "누적 랭킹"], ["season", "시즌별 성적"]]} />
      </div>
      <p className="rc-note">
        누적 랭킹과 시즌별 성적은 이전 기록에서 넘어온 점수에 대회마다 얻은 점수를 더해 매깁니다.
        등수별 점수는 마스터 리그, 파이컵 라이트처럼 대회 종류에 따라 다를 수 있습니다.
      </p>
      {sub === "rank" ? (
        <RankView rankings={snapshot.ranking?.series || data.rankings || []} data={data} admin={admin} setModal={setModal} save={save} />
      ) : (
        <SeasonView seasons={snapshot.ranking?.seasons || data.seasons || []} data={data} admin={admin} setModal={setModal} save={save} />
      )}
    </>
  );
}

function RankView({ rankings, data, admin, setModal, save }) {
  const eras = rankings || [];
  const legacyEras = data.rankings || [];
  const normalizedMode = eras.some((row) => row.source === "normalized");
  const [sel, setSel] = useState(eras[0]?.key);
  const era = eras.find((e) => e.key === sel) || eras[0];
  const addEra = async () => {
    const name = (await sitePrompt({ title: "누적 랭킹 탭 추가", label: "탭 이름", placeholder: "예: 클래식", confirmLabel: "추가" })) || "";
    if (!name) return;
    const key = "r_" + uid();
    save({ ...data, rankings: [...legacyEras, { key, label: name, rows: [] }] });
    setSel(key);
  };

  if (!era) {
    return (
      <>
        {admin && !normalizedMode && <div className="rc-filter"><button className="ypl-btn ypl-btn--sm ypl-btn--tonal press" onClick={addEra}>+ 랭킹 탭 추가</button></div>}
        <EmptyTile title="랭킹 기록이 없습니다." />
      </>
    );
  }

  return (
    <>
      <div className="rc-filter">
        <Segmented value={era.key} onChange={setSel} ariaLabel="랭킹 종류" options={eras.map((e) => [e.key, e.label])} />
        {admin && !normalizedMode && <button className="ypl-btn ypl-btn--sm ypl-btn--tonal press" onClick={addEra}>+ 추가</button>}
      </div>
      <div className="rc-rank swap" key={sel}>
        <RankLead rows={era.rows} chip={era.label} />
        {admin && era.source !== "normalized" && (
          <div className="rc-admin">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setModal({
                type: "standings",
                title: era.label + " 랭킹",
                rows: era.rows,
                build: (rows) => ({ ...data, rankings: legacyEras.map((x) => x.key === era.key ? { ...x, rows } : x) }),
              })}
            >
              이 시기 랭킹 수정
            </button>
          </div>
        )}
        <StandTable rows={era.rows} from={2} />
      </div>
    </>
  );
}

function SeasonView({ seasons, data, admin, setModal, save }) {
  seasons = seasons || [];
  const legacySeasons = data.seasons || [];
  const normalizedMode = seasons.some((row) => row.source === "normalized");
  const [sel, setSel] = useState(
    normalizedMode ? 0 : Math.max(0, seasons.length - 1)
  );

  useEffect(() => {
    setSel(normalizedMode ? 0 : Math.max(0, seasons.length - 1));
  }, [normalizedMode, seasons.length]);
  const addSeason = async () => {
    const name = (await sitePrompt({ title: "시즌 추가", label: "시즌 이름", placeholder: "예: YPL 시즌 3", confirmLabel: "추가" })) || "";
    if (!name) return;
    save({ ...data, seasons: [...legacySeasons, { name, rows: [] }] });
    setSel(seasons.length);
  };
  const s = seasons[sel];

  if (!s) {
    return (
      <>
        {admin && !normalizedMode && <div className="rc-filter"><button className="ypl-btn ypl-btn--sm ypl-btn--tonal press" onClick={addSeason}>+ 시즌 추가</button></div>}
        <EmptyTile title="시즌 성적이 없습니다." />
      </>
    );
  }

  const hasNote = s.rows.some((r) => r.note);
  const ordered = normalizedMode
    ? seasons.map((x, i) => ({ x, i }))
    : [...seasons.map((x, i) => ({ x, i }))].reverse();

  return (
    <>
      <div className="rc-filter">
        <Segmented value={sel} onChange={setSel} ariaLabel="시즌" options={ordered.map(({ x, i }) => [i, x.name])} />
        {admin && !normalizedMode && <button className="ypl-btn ypl-btn--sm ypl-btn--tonal press" onClick={addSeason}>+ 추가</button>}
      </div>
      <div className="rc-rank swap" key={sel}>
        <RankLead rows={s.rows} chip={s.name} />
        {admin && s.source !== "normalized" && (
          <div className="rc-admin">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setModal({
                type: "standings",
                title: s.name,
                rows: s.rows,
                build: (rows) => ({ ...data, seasons: legacySeasons.map((x) => x.name === s.name ? { ...x, rows } : x) }),
              })}
            >
              {s.name} 성적 수정
            </button>
          </div>
        )}
        <StandTable rows={s.rows} showNote={hasNote} from={2} />
      </div>
    </>
  );
}

/* the ranking's lead tile: the leader, and their points as the screen's poster numeral */
function RankLead({ rows, chip }) {
  const leader = [...(rows || [])].sort((a, b) => (b.points || 0) - (a.points || 0))[0];
  if (!leader) return null;
  return (
    <section className="rc-lead sq" aria-label={`${chip} 1위`}>
      <span className="ypl-chip ypl-chip--lead rc-lead-chip">{chip} 1위</span>
      <h3 className="rc-lead-title">{leader.name}</h3>
      <div className="rc-lead-figs">
        <Poster label="포인트" value={(leader.points || 0).toLocaleString("ko-KR")} unit="점" />
        <Facts items={[["우승", `${leader.win || 0}회`], ["준우승", `${leader.ru || 0}회`], ["4강", `${leader.top4 || 0}회`], ...(leader.note ? [["비고", leader.note]] : [])]} />
      </div>
    </section>
  );
}
