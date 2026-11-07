import React, { useEffect, useMemo, useState } from "react";
import Seg from "../../components/common/Seg.jsx";
import Empty from "../../components/common/Empty.jsx";
import Loader from "../../components/common/Loader.jsx";
import { Chips, Counter } from "../../components/common/Board.jsx";
import { createBattleReader } from "../../services/battleLog.js";
import { isDoubles } from "../../services/battleService.js";
import { listLiveBoards } from "../../services/battleWatch.js";
import { listNormalizedBracketRuntimes } from "../../services/normalizedCompetitionService.js";
import { freshRead } from "../../services/readCache.js";
import { matchStage } from "../../services/recordsAnalytics.js";
import { readStreakBoard } from "../../services/visitorAuth.js";
import { Roster, rosterSaid, sceneOf } from "./Stage.jsx";

/* 중계 (DESIGN.md "Battle", 중계, 2026-11-07): every battle being played now, on a page of its own beside 방 목록. A match is shown,
   not listed: each is the arena's own frame without its stage, a head (the amber lamp, what it is, the turn) over the two strips,
   the foe's side on top and the first player's under it, each Pokémon on its floor lit as the strips light it (out lit, bench dim,
   not shown yet muted, fainted grey). The official matches come first, then the 연승 도전 games, then friendly battles; the first
   official match leads, across the page. The list is read again every 15 seconds while the page is in view, as 방 목록 is. */
const KINDS = [["all", "전체"], ["official", "공식"], ["streak", "연승 도전"], ["friendly", "친선"]];
const FORMATS = [["all", "전체"], ["singles", "싱글"], ["doubles", "더블"]];
const ORDER = { official: 0, streak: 1, friendly: 2 };
const KIND_WORD = { official: "공식 경기", streak: "연승 도전", friendly: "친선" };

export function useLiveBoards(wanted = true) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!wanted) return undefined;
    let on = true;
    const read = () => { if (document.visibilityState === "visible") listLiveBoards().then(r => on && setRows(r)); };
    read();
    const t = setInterval(read, 15000);
    return () => { on = false; clearInterval(t); };
  }, [wanted]);
  return rows;
}

// the two sides as the strips show them, read from the public log (no hidden set reaches it)
function sidesOf(res, row) {
  const reader = createBattleReader({ text: res.text, moves: res.detail.moves, pokedex: res.detail.pokedex, perspective: "p1" });
  for (const line of String(row.spectator_log || "").split("\n")) { try { reader.read(line); } catch { /* a line it cannot read is left out */ } }
  const scene = sceneOf(reader.state);
  const side = id => scene[id].roster.map(m => ({
    species: m.species, status: m.status,
    light: m.fainted ? "off" : m.out ? "lit" : !m.seen ? "mute" : "dim",
    share: m.fainted ? 0 : !m.seen ? null : m.maxhp ? m.hp / m.maxhp : 1,
  }));
  return { p1: side("p1"), p2: side("p2"), turn: scene.turn || row.turn || 0 };
}

/* what each match is, for its head's grey line: an official match's event and round (the bracket as the brackets page reads it), a
   run's game (the month's board names the live runs with their battle). Read only when such a match is on the list; a read that
   fails leaves the line with the format alone. */
export function useLabels(rows) {
  const [labels, setLabels] = useState({});
  const official = (rows || []).filter(r => r.kind === "official").map(r => r.id).join();
  const streak = (rows || []).filter(r => r.kind === "streak").map(r => r.id).join();
  useEffect(() => {
    let on = true;
    const said = {};
    Promise.all([
      official && freshRead("brackets", listNormalizedBracketRuntimes).then(list => {
        for (const r of rows.filter(x => x.kind === "official")) {
          const b = (list || []).map(x => x.bracket).find(x => x?.eventId === r.event_id);
          const stage = b && matchStage(b, r.source_node_key);
          if (b) said[r.id] = [b.name, stage].filter(Boolean).join(" ");
        }
      }),
      streak && readStreakBoard().then(board => {
        for (const x of board || []) if (x.battle_id) said[x.battle_id] = `${x.wins + 1}번째 판`;
      }),
    ].map(p => Promise.resolve(p).catch(() => null))).then(() => { if (on) setLabels(said); });
    return () => { on = false; };
  }, [official, streak]);
  return labels;
}
const context = (row, label) => [label, isDoubles(row.format_id) ? "더블" : "싱글"].filter(Boolean).join(", ");

export function LiveCard({ res, row, label, lead = false, onOpen }) {
  const { p1, p2, turn } = useMemo(() => sidesOf(res, row), [res, row]);
  const strip = (name, list, foe) => <div className={"bt-strip" + (foe ? " foe" : " own")}>
    <span className="bt-strip-row"><b className="bt-trainer">{name}</b><Roster list={list} slots={6} label={`${name}의 파티, ${rosterSaid(res, list)}`} /></span>
  </div>;
  return <button type="button" className={"bt-arena bt-live" + (lead ? " bt-live-lead" : "")} onClick={() => onOpen(row.id)}
    aria-label={`${KIND_WORD[row.kind] || ""} ${row.p1_name} 대 ${row.p2_name}, ${turn}턴, 관전`}>
    <span className="bt-live-head">
      <i className="lamp sig" aria-hidden="true" />
      <span className="bt-live-say"><b>{KIND_WORD[row.kind] || "친선"}</b><span>{context(row, label)}</span></span>
      {turn > 0 && <span className="bt-head-turn"><Seg value={String(Math.min(99, turn)).padStart(2, "0")} h={32} cells={2} label={`${turn}턴`} /><span className="t12 dim">턴</span></span>}
    </span>
    {strip(row.p2_name, p2, true)}
    {strip(row.p1_name, p1, false)}
  </button>;
}

export function LiveHall({ res, rows, onOpen }) {
  const [kind, setKind] = useState("all");
  const [format, setFormat] = useState("all");
  const all = [...(rows || [])].sort((a, b) => (ORDER[a.kind] ?? 3) - (ORDER[b.kind] ?? 3) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const list = all.filter(r => (kind === "all" || r.kind === kind) && (format === "all" || (format === "doubles") === isDoubles(r.format_id)));
  const count = n => (rows ? String(n) : null);
  const labels = useLabels(rows);
  return <>
    <div className="stack bt-hall-counts">
      <Counter label="진행 중" value={count(all.length)} cells={2} lamp={all.length > 0 ? "sig" : false} />
      <Counter label="공식 경기" value={count(all.filter(r => r.kind === "official").length)} cells={2} />
      <Counter label="연승 도전" value={count(all.filter(r => r.kind === "streak").length)} cells={2} />
    </div>
    <div className="bt-hall-filters">
      {[["종류", kind, setKind, KINDS], ["형식", format, setFormat, FORMATS]].map(([label, value, set, options]) =>
        <span key={label} className="bt-hall-filter"><span className="t12 dim" aria-hidden="true">{label}</span><Chips value={value} onChange={set} label={label} options={options} /></span>)}
    </div>
    {!rows ? <Loader />
      : !list.length ? (all.length
        ? <Empty title="조건에 맞는 배틀이 없습니다." desc="조건을 바꿔 보세요." />
        : <Empty title="지금 진행 중인 배틀이 없습니다." desc="배틀이 시작되면 여기에 나오고, 누구나 지켜볼 수 있습니다." />)
      : <div className="stack bt-live-list">
        {list.map((r, i) => <LiveCard key={r.id} res={res} row={r} label={labels[r.id]} lead={i === 0 && r.kind === "official"} onOpen={onOpen} />)}
      </div>}
  </>;
}
