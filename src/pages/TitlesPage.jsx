import React, { useState } from "react";
import { Row, TabsLine } from "../components/common/Board.jsx";
import Button from "../components/common/Button.jsx";
import { displaySeasonLabel, generationText } from "../services/seasonLabel.js";

/* 그룹 이름이 이미 종류를 말하므로 항목 이름에서 접미사를 덜어낸다. */
function shortName(name, key) {
  if (key === "type") return String(name).replace(/\s*엑스퍼트$/, "");
  if (key === "region") return String(name).replace(/\s*엘리트$/, "");
  return name;
}

/* ============================== TITLES ==============================
   (DESIGN.md "Titles and hall of fame") 분류는 페이지 탭, 칭호는 줄이다.
   역대 챔피언은 세대를 숫자로 앞에 세우고 현 챔피언의 줄만 반전된다. 주인이 없는 칭호는 흐린 줄로 미달성을 말한다. */
export default function TitlesPage({ data, admin, setModal, go }) {
  const groups = data.titleGroups || [];
  const [openKey, setOpenKey] = useState(groups.length ? groups[0].key : null);
  const g = groups.find(x => x.key === openKey) || groups[0];

  const genOf = name => generationText(name);
  const championSeason = name => {
    const c = (data.champions || []).find(x => genOf(x.gen) === genOf(name));
    return c ? displaySeasonLabel(c.slabel || ("시즌 " + c.season)) : "";
  };
  const lastGen = (() => {
    const sorted = [...(data.champions || [])].sort((a, b) => (a.season || 0) - (b.season || 0));
    return sorted.length ? genOf(sorted[sorted.length - 1].gen) : null;
  })();

  const items = g ? (g.items || []) : [];
  const done = items.filter(it => (it.holders || []).length > 0).length;
  const champion = g?.key === "champion";
  const rows = champion ? [...items].sort((a, b) => (parseInt(genOf(b.name)) || 0) - (parseInt(genOf(a.name)) || 0)) : items;
  // 보유자 이름을 누르면 그 트레이너의 기록 시트가 열린다. 관리자 모드에서는 줄 전체가 편집 버튼이라 글자로 둔다.
  const who = name => admin || !go ? name
    : <button type="button" className="rc-name-link" onClick={() => go("records", { trainer: name })}>{name}</button>;
  const whoList = names => names.map((name, i) => <React.Fragment key={name + i}>{i > 0 && ", "}{who(name)}</React.Fragment>);

  return (<section className="tt">
    <header className="tt-head"><h1 className="t32">칭호</h1>{g && <span className="t12 dim">주인 <span className="num">{done} / {items.length}</span></span>}</header>
    {groups.length > 1 && <div className="tt-tabs"><TabsLine value={g?.key} onChange={setOpenKey} label="칭호 분류" options={groups.map(x => [x.key, x.name])} /></div>}

    {g && <div className="swap" key={g.key}>
      {g.desc && <p className="t12 dim reg tt-desc">{g.desc}</p>}
      {admin && <div className="tt-add"><Button variant="second" onClick={() => setModal({ type: "title", groupKey: g.key })}>칭호 추가</Button></div>}
      <div className="stack tt-rows">
        {rows.map(it => {
          const holders = it.holders || [];
          const edit = admin ? () => setModal({ type: "title", groupKey: g.key, item: it }) : undefined;
          if (champion) {
            const gen = genOf(it.name), n = parseInt(gen) || null, season = championSeason(it.name), reigning = gen === lastGen;
            const name = holders.join(", ");
            return <Row key={it.id} className={"row--2" + (reigning ? " inv" : "")}
              lead={<span className="tt-gen"><span className="num t20">{n ?? gen}</span>{n && <span className="t12 dim">대</span>}</span>}
              title={name || "미달성"} line={season ? `${season} 우승` : undefined}
              value={reigning ? <span className="t12">현 챔피언</span> : undefined}
              onClick={edit || (!admin && go && holders.length === 1 ? () => go("records", { trainer: holders[0] }) : undefined)}
              label={`${gen} 챔피언 ${name}`} />;
          }
          return <Row key={it.id} className={"row--2" + (holders.length ? "" : " tt-off")} title={shortName(it.name, g.key)}
            line={holders.length ? whoList(holders) : "미달성"} onClick={edit} label={admin ? `${it.name} 수정` : undefined} />;
        })}
      </div>
    </div>}
  </section>);
}
