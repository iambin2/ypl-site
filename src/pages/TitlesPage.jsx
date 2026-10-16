import React, { useState } from "react";
import { Icon, PageHead, Segmented } from "../components/index.js";
import { displaySeasonLabel } from "../services/seasonLabel.js";

/* 그룹 이름이 이미 종류를 말하므로 항목 이름에서 접미사를 덜어낸다. */
function shortName(name, key) {
  if (key === "type") return String(name).replace(/\s*엑스퍼트$/, "");
  if (key === "region") return String(name).replace(/\s*엘리트$/, "");
  return name;
}

/* ============================== TITLES ==============================
   분류는 세그먼트, 고른 분류는 리드 카드(달성 수가 실버 점수) 아래 유리 목록. */
export default function TitlesPage({ data, admin, setModal, go }) {
  const groups = data.titleGroups || [];
  const [openKey, setOpenKey] = useState(groups.length ? groups[0].key : null);
  const g = groups.find(x => x.key === openKey) || groups[0];

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
  const Row = admin ? "button" : "div";
  const edit = it => admin ? () => setModal({ type: "title", groupKey: g.key, item: it }) : undefined;
  // 보유자 이름을 누르면 그 트레이너의 기록 시트가 열린다. 관리자 모드에서는 행 전체가 편집 버튼이라 글자로 둔다.
  const who = name => admin || !go ? name
    : <button type="button" className="rc-name-link" onClick={() => go("records", { trainer: name })}>{name}</button>;
  const whoList = names => names.map((name, i) => <React.Fragment key={name + i}>{i > 0 && ", "}{who(name)}</React.Fragment>);

  return (<section className="sec">
    <PageHead plain="칭호" desc="특정 조건을 달성한 트레이너에게 주는 명예의 기록입니다." />

    {groups.length > 1 && <Segmented className="tt-seg" value={g?.key} onChange={setOpenKey} ariaLabel="칭호 분류"
      options={groups.map(x => [x.key, x.name])} />}

    {g && <div className="tt-view">
      <section className="rc-lead" aria-labelledby="tt-group-name">
        {/* 숫자를 늘어놓는 장식 칸 대신 이 분류가 무엇인지와 얼마나 채워졌는지를 한 문장으로 */}
        <div className="rc-lead-who">
          <h3 className="rc-lead-title" id="tt-group-name">{g.name}</h3>
          {g.desc && <span className="rc-lead-sub">{g.desc}</span>}
          <span className="caption">{rate ? `칭호 ${items.length}개 중 ${done}개에 주인이 있습니다.` : `칭호 ${items.length}개`}</span>
        </div>
        {admin && <button className="ypl-btn ypl-btn--glass ypl-btn--sm press tt-add"
          onClick={() => setModal({ type: "title", groupKey: g.key })}>
          <Icon n="plus" size={16} />칭호 추가
        </button>}
      </section>

      <ul className="ypl-group swap" key={g.key}>
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
                    <span className="ypl-row__title">{holders[0] ? who(holders[0]) : "미달성"}</span>
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
                <span className="tt-who">{holders.length ? whoList(holders) : "미달성"}</span>
              </Row>
            </li>
          );
        })}
      </ul>
    </div>}
  </section>);
}
