import React, { useState } from "react";
import { Counter, Mon, Row, SectionHead, TabsLine } from "../components/common/Board.jsx";
import Button from "../components/common/Button.jsx";
import Modal from "../components/common/Modal.jsx";
import Seg from "../components/common/Seg.jsx";
import { Emblem, InkPic, TitleDefs, useDesk, useTitleArtwork } from "../components/TitleFaces.jsx";
import { displaySeasonLabel, generationText } from "../services/seasonLabel.js";
import { spriteUrlForSlug } from "../services/teamBuilderCore.js";
import { REGION_COVERS, TITLE_TYPES, generationOfTitle, regionOfTitle, titleCounts, typeOfTitle } from "../services/titleLooks.js";

/* ============================== TITLES ==============================
   (DESIGN.md "Titles and hall of fame", 2026-11-12) 칭호는 줄이 아니라 저마다의 얼굴로 선다: 타입은 그 색의 칸,
   지방은 표지 포켓몬, 파트너는 그 포켓몬, 챔피언은 금빛 레일의 배너, 그 밖은 문장과 이름판. 주인이 없는 칭호는 꺼져 있다.
   칭호를 누르면 그 칭호의 시트(문장과 주인들)가 열리고, 관리자 모드에서는 편집기가 열린다. */
const holdersOf = item => item?.holders || [];
const names = list => list.join(", ");
/* a board stays a full rectangle ("Composing a screen" 12): the columns that divide the count, and the last cell takes what is left */
const colsFor = (n, desk) => !desk ? 2 : [4, 3, 2].find(c => n % c === 0 && n >= c) || (n > 4 ? 4 : Math.max(1, n));
const fill = (i, n, cols) => { const rest = n % cols; return i === n - 1 && rest ? { gridColumn: `span ${cols - rest + 1}` } : undefined; };

function ChampionBanners({ items, champions, open }) {
  const desk = useDesk();
  const hung = items.map(item => ({ item, gen: generationOfTitle(item.name) })).filter(x => x.gen).sort((a, b) => a.gen - b.gen);
  const reign = Math.max(0, ...hung.filter(x => holdersOf(x.item).length).map(x => x.gen));
  const seasonOf = gen => {
    const c = (champions || []).find(x => generationText(x.gen) === `${gen}대`);
    return c ? displaySeasonLabel(c.slabel || ("시즌 " + c.season)) : "";
  };
  return <div className="tl-rafters">
    <i className="tl-rail" aria-hidden="true" />
    <div className="tl-banners" style={{ "--n": hung.length }}>
      {hung.map(({ item, gen }) => {
        const now = gen === reign, who = names(holdersOf(item)), season = seasonOf(gen);
        return <button type="button" key={item.id || gen} className={"tl-banner" + (now ? " inv reign" : " pn") + (who ? "" : " off")} onClick={open(item)}
          aria-label={`${gen}대 챔피언 ${who || "없음"}${season ? `, ${season}` : ""}${now ? ", 현 챔피언" : ""}`}>
          <i className="tl-cap" aria-hidden="true" />
          <span className="counter-board tl-banner-gen">
            {now ? <Seg value={String(gen)} h={desk ? 120 : 40} cells={gen >= 10 ? 2 : 1} label={`${gen}대`} />
              : <Seg value={String(gen)} h={desk ? 84 : 32} cells={gen >= 10 ? 2 : 1} label={`${gen}대`} />}
            <span className={desk ? "t20" : "t12"}>대</span>
          </span>
          <b className={"tl-banner-name " + (desk ? (now ? "t32" : "t20") : (now ? "t20" : "t15"))}>{who}</b>
          <span className="t12 tl-banner-foot">{now ? "현 챔피언" : desk ? season : season.replace(/^.*?(시즌 \d+)$/, "$1")}</span>
        </button>;
      })}
    </div>
  </div>;
}

function TypeBoard({ items, open }) {
  const byType = new Map(items.map(item => [typeOfTitle(item.name), item]));
  return <div className="stack tl-types">
    {TITLE_TYPES.map(type => {
      const item = byType.get(type.id), holders = holdersOf(item), on = holders.length > 0;
      return <button type="button" key={type.id} className={`tl-type type-${type.id}` + (on ? " on" : " pn")} onClick={item ? open(item) : undefined}
        disabled={!item} aria-label={`${type.korean} 엑스퍼트${on ? `, ${names(holders)}` : ", 없음"}`}>
        <span className="tl-type-top">
          <b className="t15 tl-type-name">{type.korean}</b>
          <Seg value={on ? String(holders.length) : ""} h={32} cells={1} label={`${holders.length}명`} />
        </span>
        <span className="t12 tl-holders">{names(holders)}</span>
      </button>;
    })}
  </div>;
}

function RegionBoard({ items, open }) {
  const byRegion = new Map(items.map(item => [regionOfTitle(item.name), item]));
  return <div className="stack tl-regions">
    {REGION_COVERS.map(([region, slug]) => {
      const item = byRegion.get(region), holders = holdersOf(item), on = holders.length > 0;
      return <button type="button" key={region} className={"pn stand tl-region" + (on ? "" : " off")} onClick={item ? open(item) : undefined}
        disabled={!item} aria-label={`${region} 엘리트${on ? `, ${names(holders)}` : ", 없음"}`}>
        <i className="floor" aria-hidden="true" />
        <span className="tl-region-who"><b className="t15">{region}</b>{on && <span className="t12 dim">{names(holders)}</span>}</span>
        <Mon src={spriteUrlForSlug(slug)} className={on ? "" : "sil"} />
      </button>;
    })}
  </div>;
}

/* 파트너는 거꾸로 적힌다: 항목의 이름이 트레이너, holders 가 포켓몬. 포켓몬 하나가 칸 하나. */
function PartnerBoard({ items, open, art }) {
  const desk = useDesk();
  const cells = items.flatMap(item => holdersOf(item).map(pokemon => ({ item, pokemon })));
  const cols = colsFor(cells.length, desk);
  return <div className="stack tl-partners" style={{ "--cols": cols }}>
    {cells.map(({ item, pokemon }, i) =>
      <button type="button" key={`${item.id}-${pokemon}`} className="pn stand tl-partner" style={fill(i, cells.length, cols)} onClick={open(item)} aria-label={`${item.name}의 파트너 ${pokemon}`}>
        <i className="floor" aria-hidden="true" />
        <span className="tl-partner-who"><b className="t15">{pokemon}</b><span className="t12 dim">{item.name}</span></span>
        <Mon src={art(pokemon)} />
      </button>)}
  </div>;
}

function OwnBoard({ items, open, art }) {
  const desk = useDesk();
  const cols = colsFor(items.length, desk);
  return <div className="stack tl-owns" style={{ "--cols": cols }}>
    {items.map((item, i) => {
      const holders = holdersOf(item), on = holders.length > 0;
      return <button type="button" key={item.id || item.name} className={"tl-own" + (on ? " on" : " off")} style={fill(i, items.length, cols)} onClick={open(item)}
        aria-label={`${item.name}${on ? `, ${names(holders)}` : ", 없음"}`}>
        <Emblem item={item} on={on} art={art} />
        <span className="pn tl-plate">
          <span className="tl-plate-words">
            <b className="t15 tl-own-name">{item.name}</b>
            {item.desc && <span className="t12 dim reg">{item.desc}</span>}
            <span className="t12 tl-own-holders">{names(holders)}</span>
          </span>
          <span className="counter-board tl-own-count"><Seg value={on ? String(holders.length) : ""} h={32} cells={holders.length >= 10 ? 2 : 1} label={`${holders.length}명`} /><span className="t15">명</span></span>
        </span>
      </button>;
    })}
  </div>;
}

/* 칭호의 시트: 그 칭호의 얼굴과 조건, 주인 수, 주인을 받은 순서대로. 이름을 누르면 그 트레이너의 기록. */
function TitleSheet({ group, item, art, go, onClose }) {
  const holders = holdersOf(item);
  const partner = group.key === "partner";
  const type = group.key === "type" ? typeOfTitle(item.name) : null;
  const region = group.key === "region" ? regionOfTitle(item.name) : null;
  const cover = region && REGION_COVERS.find(([r]) => r === region)?.[1];
  const face = group.key === "champion" ? null
    : type ? <span className={`tl-emblem type-${type}`}><span className="tl-band"><b className="t32 tl-logo">{TITLE_TYPES.find(t => t.id === type)?.korean}</b></span></span>
      : cover ? <span className="tl-emblem tl-cover"><span className="tl-band"><span className="tl-band-stand"><InkPic src={spriteUrlForSlug(cover)} off={!holders.length} /></span></span></span>
        : partner ? null : <Emblem item={item} on={holders.length > 0} art={art} />;
  const title = partner ? `${item.name}의 파트너` : item.name;
  return <Modal title={title} hint={item.desc || group.desc} className="tl-sheet" onClose={onClose}>
    {face && <div className="tl-sheet-face">{face}</div>}
    <section className="tl-sheet-sec">
      <SectionHead title={partner ? `파트너 ${holders.length}` : `주인 ${holders.length}명`} />
      {holders.length ? <div className="stack">
        {holders.map((name, i) => partner
          ? <Row key={name} lead={<span className="tl-ord stand"><Mon src={art(name)} /></span>} title={name} />
          : <Row key={name} lead={<span className="tl-ord"><span className="num t20">{i + 1}</span><span className="t12 dim">호</span></span>} title={name}
            onClick={go ? () => { onClose(); go("records", { trainer: name }); } : undefined} label={`${i + 1}호 ${name}, 기록 보기`} />)}
      </div> : <div className="ypl-empty"><b>아직 주인이 없습니다.</b></div>}
    </section>
  </Modal>;
}

export default function TitlesPage({ data, admin, setModal, go }) {
  const groups = data.titleGroups || [];
  const [openKey, setOpenKey] = useState(groups.length ? groups[0].key : null);
  const [sheet, setSheet] = useState(null);
  const art = useTitleArtwork();
  const g = groups.find(x => x.key === openKey) || groups[0];
  const counts = titleCounts(groups);
  const items = g ? (g.items || []) : [];
  // 관리자 모드에서는 칭호가 편집기의 문이고, 그 밖에서는 칭호 시트의 문이다
  const open = item => () => admin ? setModal({ type: "title", groupKey: g.key, item }) : setSheet({ group: g, item });
  const known = g ? ["champion", "type", "region", "partner"].includes(g.key) : false;
  // 타입과 지방 판에 자리가 없는 항목(운영자가 더한 이름)은 문장으로 뒤에 선다
  const strays = g?.key === "type" ? items.filter(item => !typeOfTitle(item.name)) : g?.key === "region" ? items.filter(item => !regionOfTitle(item.name)) : [];

  return (<section className="tt">
    <TitleDefs />
    <header className="tt-head"><h1 className="t32">칭호</h1></header>
    <div className="stack tl-counts">
      <Counter label="칭호" value={counts.total} unit="개" />
      <Counter label="주인 있는 칭호" value={counts.owned} unit="개" />
      <Counter label="주인 없는 칭호" value={counts.empty} unit="개" />
    </div>
    {groups.length > 1 && <div className="tt-tabs"><TabsLine value={g?.key} onChange={setOpenKey} label="칭호 분류" options={groups.map(x => [x.key, x.name])} /></div>}

    {g && <div className="swap" key={g.key}>
      {admin && <div className="tt-add"><Button variant="second" onClick={() => setModal({ type: "title", groupKey: g.key })}>칭호 추가</Button></div>}
      <div className="stack tl-board">
        {g.desc && <div className="pn tl-rule"><span className="t12 dim">조건</span><b className="t15">{g.desc}</b></div>}
        {g.key === "champion" && <ChampionBanners items={items} champions={data.champions} open={open} />}
        {g.key === "type" && <TypeBoard items={items} open={open} />}
        {g.key === "region" && <RegionBoard items={items} open={open} />}
        {g.key === "partner" && <PartnerBoard items={items} open={open} art={art} />}
        {!known && <OwnBoard items={items} open={open} art={art} />}
        {strays.length > 0 && <OwnBoard items={strays} open={open} art={art} />}
      </div>
    </div>}
    {sheet && <TitleSheet {...sheet} art={art} go={go} onClose={() => setSheet(null)} />}
  </section>);
}
