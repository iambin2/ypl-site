import React, { useState } from "react";
import { Facts, Icon, Poster, Reveal, Segmented } from "../components/index.js";
import { displaySeasonLabel } from "../services/seasonLabel.js";

/* 그룹 이름이 이미 종류를 말하므로 항목 이름에서 접미사를 덜어낸다. */
function shortName(name, key) {
  if (key === "type") return String(name).replace(/\s*엑스퍼트$/, "");
  if (key === "region") return String(name).replace(/\s*엘리트$/, "");
  return name;
}

/* ============================== TITLES ==============================
   분류는 세그먼트, 고른 분류는 리드 타일(달성 수가 포스터 숫자) 아래 인셋 목록. */
export default function TitlesPage({ data, admin, setModal }) {
  const groups = data.titleGroups || [];
  const [openKey, setOpenKey] = useState(groups.length ? groups[0].key : null);
  const g = groups.find(x => x.key === openKey) || groups[0];

  const totalTitles = groups.reduce((n, x) => n + (x.items || []).length, 0);
  const totalDone = groups.reduce(
    (n, x) => n + (x.items || []).filter(it => (it.holders || []).length > 0).length, 0);

  const genOf = name => String(name).replace(/\s*챔피언$/, "");
  const shortSeason = displaySeasonLabel;
  const championSeason = name => {
    const c = (data.champions || []).find(x => genOf(x.gen) === genOf(name));
    return c ? shortSeason(c.slabel || ("시즌 " + c.season)) : "";
  };
  const lastGen = (() => {
    const sorted = [...(data.champions || [])].sort((a, b) => (a.season || 0) - (b.season || 0));
    return sorted.length ? genOf(sorted[sorted.length - 1].gen) : null;
  })();

  const items = g ? (g.items || []) : [];
  const done = items.filter(it => (it.holders || []).length > 0).length;
  const rate = g && (g.key === "type" || g.key === "region" || g.key === "champion");
  const holderCount = new Set(items.flatMap(it => it.holders || [])).size;
  const Row = admin ? "button" : "div";
  const edit = it => admin ? () => setModal({ type: "title", groupKey: g.key, item: it }) : undefined;

  return (<section className="sec">
    <Reveal className="sec-head">
      <div>
        <h2>칭호</h2>
        <p className="sub">특정 조건을 달성한 트레이너에게 주는 명예의 기록입니다. 아직 주인이 없는 칭호는 흐리게 표시됩니다.</p>
      </div>
    </Reveal>

    {groups.length > 1 && <Segmented className="tt-seg" value={g?.key} onChange={setOpenKey} ariaLabel="칭호 분류"
      options={groups.map(x => [x.key, x.name])} />}

    {g && <div className="tt-view swap" key={g.key}>
      <section className="rc-lead sq" aria-labelledby="tt-group-name">
        <h3 className="rc-lead-title" id="tt-group-name">{g.name}</h3>
        <div className="rc-lead-figs">
          {rate
            ? <Poster label="달성" value={done} unit={`/ ${items.length}`} />
            : <Poster label="칭호" value={items.length} unit="개" />}
          <Facts items={[["보유 트레이너", `${holderCount}명`], ["전체 부여", `${totalDone} / ${totalTitles}`]]} />
        </div>
        {g.desc && <p className="rc-lead-note">{g.desc}</p>}
        {admin && <button className="ypl-btn ypl-btn--lead-tonal ypl-btn--sm press tt-add"
          onClick={() => setModal({ type: "title", groupKey: g.key })}>
          <Icon n="plus" size={13} />칭호 추가
        </button>}
      </section>

      <ul className="ypl-group sq">
        {items.map(it => {
          const holders = it.holders || [];
          if (g.key === "champion") {
            const gen = genOf(it.name);
            const now = gen === lastGen;
            const season = championSeason(it.name);
            return (
              <li key={it.id}>
                <Row className={"ypl-row" + (holders.length ? "" : " tt-off")} onClick={edit(it)}>
                  <span>
                    <span className="ypl-row__title">{holders[0] || "미달성"}</span>
                    <span className="ypl-row__meta">{gen}{season ? `, ${season}` : ""}</span>
                  </span>
                  {now && <span className="ypl-chip ypl-chip--ink">현 챔피언</span>}
                </Row>
              </li>
            );
          }
          return (
            <li key={it.id}>
              <Row className={"ypl-row tt-row" + (holders.length ? "" : " tt-off")} onClick={edit(it)}>
                <span className="ypl-row__title">{shortName(it.name, g.key)}</span>
                <span className="tt-who">{holders.length ? holders.join(", ") : "미달성"}</span>
              </Row>
            </li>
          );
        })}
      </ul>
    </div>}
  </section>);
}
