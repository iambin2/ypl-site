import React, { useState } from "react";
import { Counter, Row, SectionHead, TabsLine } from "../components/common/Board.jsx";
import Button from "../components/common/Button.jsx";
import Modal from "../components/common/Modal.jsx";
import { Medal, MedalBoard, usePartnerType } from "../components/TitleFaces.jsx";
import { displaySeasonLabel, generationText } from "../services/seasonLabel.js";
import { REGIONS, TITLE_TYPES, championMedal, generationOfTitle, ownMedal, partnerMedal, regionMedal, regionOfTitle, titleCounts, typeMedal, typeOfTitle } from "../services/titleLooks.js";

/* ============================== TITLES ==============================
   (DESIGN.md "Titles and hall of fame", 2026-11-13) 모든 칭호는 메달이고, 칭호 페이지는 채워 갈 메달 도감이다.
   챔피언은 금메달, 타입은 그 문양, 지방은 그 풍경, 파트너는 발자국, 그 밖은 고른 색과 장식. 주인이 없는 칭호는 새겨지지 않은 빈 메달이다.
   메달을 누르면 그 칭호의 시트(메달과 주인들)가 열리고, 관리자 모드에서는 편집기가 열린다. */
const holdersOf = item => item?.holders || [];
const COLS = { champion: [6, 3], type: [9, 3], region: [10, 5] };

/* the medals of one group, in the board's order */
function groupMedals(group, items, open, champions, partnerType) {
  const medal = (item, extra) => ({ key: item?.id || extra.key, item, on: holdersOf(item).length > 0, n: holdersOf(item).length, onClick: item ? open(item) : undefined, ...extra });
  if (group.key === "champion") {
    const hung = items.map(item => ({ item, gen: generationOfTitle(item.name) })).filter(x => x.gen).sort((a, b) => a.gen - b.gen);
    const reign = Math.max(0, ...hung.filter(x => holdersOf(x.item).length).map(x => x.gen));
    const seasonOf = gen => { const c = (champions || []).find(x => generationText(x.gen) === `${gen}대`); return c ? displaySeasonLabel(c.slabel || ("시즌 " + c.season)) : ""; };
    return hung.map(({ item, gen }) => {
      const who = holdersOf(item).join(", "), season = seasonOf(gen), now = gen === reign;
      return medal(item, { key: `g${gen}`, n: 0, name: who || `${gen}대`, big: true, sub: now ? "현 챔피언" : season, reign: now, spec: championMedal(gen, season),
        label: `${gen}대 챔피언 ${who || "없음"}${season ? `, ${season}` : ""}${now ? ", 현 챔피언" : ""}` });
    });
  }
  if (group.key === "type") {
    const by = new Map(items.map(item => [typeOfTitle(item.name), item]));
    return TITLE_TYPES.map(t => medal(by.get(t.id), { key: t.id, name: t.korean, spec: typeMedal(t.id), label: `${t.korean} 엑스퍼트${holdersOf(by.get(t.id)).length ? `, ${holdersOf(by.get(t.id)).join(", ")}` : ", 없음"}` }));
  }
  if (group.key === "region") {
    const by = new Map(items.map(item => [regionOfTitle(item.name), item]));
    return REGIONS.map(([r]) => medal(by.get(r), { key: r, name: r, spec: regionMedal(r), label: `${r} 엘리트${holdersOf(by.get(r)).length ? `, ${holdersOf(by.get(r)).join(", ")}` : ", 없음"}` }));
  }
  if (group.key === "partner") {
    /* 파트너는 거꾸로 적힌다: 항목의 이름이 트레이너, holders 가 포켓몬. 같은 포켓몬은 메달 하나에 그 트레이너들이 함께 선다. */
    const by = new Map();
    items.forEach(item => holdersOf(item).forEach(p => { const g = by.get(p) || { item, trainers: [] }; g.trainers.push(item.name); by.set(p, g); }));
    return [...by].map(([p, g]) => ({ key: p, item: g.item, on: true, n: g.trainers.length, name: p, onClick: open(g.item),
      spec: partnerType ? partnerMedal(partnerType(p)) : null, label: `${g.trainers.join(", ")}의 파트너 ${p}` }));
  }
  return items.map(item => medal(item, { key: item.name, name: item.name, spec: ownMedal(item), label: `${item.name}${holdersOf(item).length ? `, ${holdersOf(item).join(", ")}` : ", 없음"}` }));
}

/* 칭호의 시트: 그 칭호의 메달과 조건, 주인 수, 주인을 받은 순서대로. 이름을 누르면 그 트레이너의 기록. */
function TitleSheet({ group, item, spec, go, onClose }) {
  const holders = holdersOf(item);
  const partner = group.key === "partner";
  const title = partner ? `${item.name}의 파트너` : item.name;
  return <Modal title={title} hint={item.desc || group.desc} className="tl-sheet" onClose={onClose}>
    {!partner && spec && <div className="tl-sheet-face"><Medal spec={spec} off={!holders.length} /></div>}
    <section className="tl-sheet-sec">
      <SectionHead title={partner ? `파트너 ${holders.length}` : `주인 ${holders.length}명`} />
      {holders.length ? <div className="stack">
        {holders.map((name, i) => partner
          ? <Row key={name} title={name} />
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
  const partnerType = usePartnerType();
  const g = groups.find(x => x.key === openKey) || groups[0];
  const counts = titleCounts(groups);
  const items = g ? (g.items || []) : [];
  const medals = g ? groupMedals(g, items, item => () => open(item), data.champions, partnerType) : [];
  // 관리자 모드에서는 칭호가 편집기의 문이고, 그 밖에서는 칭호 시트의 문이다
  function open(item) {
    if (admin) { setModal({ type: "title", groupKey: g.key, item }); return; }
    setSheet({ group: g, item, spec: medals.find(m => m.item === item)?.spec });
  }
  // 타입과 지방 판에 자리가 없는 항목(운영자가 더한 이름)은 제 메달로 뒤에 선다
  const strays = g?.key === "type" ? items.filter(item => !typeOfTitle(item.name)) : g?.key === "region" ? items.filter(item => !regionOfTitle(item.name)) : [];

  return (<section className="tt">
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
        <MedalBoard medals={medals} cols={COLS[g.key] || [6, 3]} label={g.name} className={g.key === "champion" ? "tl-champs" : ""} />
        {strays.length > 0 && <MedalBoard medals={groupMedals({ key: "own" }, strays, item => () => open(item))} cols={[6, 3]} label={`${g.name} 그 밖`} />}
      </div>
    </div>}
    {sheet && <TitleSheet {...sheet} go={go} onClose={() => setSheet(null)} />}
  </section>);
}
