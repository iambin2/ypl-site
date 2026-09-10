import React, { useState } from "react";
import { Reveal, Icon } from "../components/index.js";

/* 칭호 그룹 아이콘 — 데이터의 이모지 대신 사이트 아이콘 세트를 쓴다. */
const GROUP_ICON = { champion: "crown", type: "bolt", region: "map", partner: "handshake", etc: "medal", event: "spark" };

/* 타입 색 — 사이트의 포켓몬 타입 색과 같은 값 */
const TYPE_COLOR = {
  "노말": "#9FA19F", "불꽃": "#E62829", "물": "#2980EF", "전기": "#C9A000", "풀": "#3FA129",
  "얼음": "#2FB8DD", "격투": "#FF8000", "독": "#9141CB", "땅": "#915121", "비행": "#5F9FE0",
  "에스퍼": "#EF4179", "벌레": "#91A119", "바위": "#8F8A5A", "고스트": "#704170",
  "드래곤": "#5060E1", "악": "#624D4E", "강철": "#60A1B8", "페어리": "#D855D8",
};

/* 그룹 이름이 이미 종류를 말하므로 항목 이름에서 접미사를 덜어낸다. */
function shortName(name, key) {
  if (key === "type") return String(name).replace(/\s*엑스퍼트$/, "");
  if (key === "region") return String(name).replace(/\s*엘리트$/, "");
  return name;
}

/* ============================== TITLES ==============================
   빽빽한 한 판 대신 왼쪽 분류 레일 + 오른쪽 상세.                        */
export default function TitlesPage({ data, admin, setModal }) {
  const groups = data.titleGroups || [];
  const [openKey, setOpenKey] = useState(groups.length ? groups[0].key : null);
  const g = groups.find(x => x.key === openKey) || groups[0];

  const totalTitles = groups.reduce((n, x) => n + (x.items || []).length, 0);
  const totalDone = groups.reduce(
    (n, x) => n + (x.items || []).filter(it => (it.holders || []).length > 0).length, 0);

  const genOf = name => String(name).replace(/\s*챔피언$/, "");
  const shortSeason = label => String(label || "")
    .replace(/^CLASSIC SEASON\s*/i, "Classic S")
    .replace(/^YPL SEASON\s*/i, "YPL S")
    .replace(/^SEASON\s*/i, "Season ");
  const championSeason = name => {
    const c = (data.champions || []).find(x => genOf(x.gen) === genOf(name));
    return c ? shortSeason(c.slabel || ("SEASON " + c.season)) : "";
  };
  const lastGen = (() => {
    const sorted = [...(data.champions || [])].sort((a, b) => (a.season || 0) - (b.season || 0));
    return sorted.length ? genOf(sorted[sorted.length - 1].gen) : null;
  })();

  const items = g ? (g.items || []) : [];
  const done = items.filter(it => (it.holders || []).length > 0).length;
  const edit = it => admin ? () => setModal({ type: "title", groupKey: g.key, item: it }) : undefined;

  return (<section className="sec">
    <Reveal className="sec-head">
      <div>
        <h2>칭호</h2>
        <p className="sub">특정 조건을 달성한 트레이너에게 주어지는 명예의 기록. 아직 주인이 없는 칭호는 흐리게 표시됩니다.</p>
      </div>
      <div className="y-page-aside">
        <span className="y-chip y-chip-ghost">
          부여됨 <b className="tnum" style={{ marginLeft: 4, color: "var(--t-1)" }}>{totalDone}</b>&thinsp;/&thinsp;{totalTitles}
        </span>
      </div>
    </Reveal>

    <div className="tt">
      <aside className="y-plate tt-rail">
        {groups.map(x => {
          const xi = x.items || [];
          const xd = xi.filter(it => (it.holders || []).length > 0).length;
          const rate = x.key === "type" || x.key === "region" || x.key === "champion";
          return (
            <button key={x.id} className={"tt-cat" + (x.key === openKey ? " on" : "")}
              onClick={() => setOpenKey(x.key)}>
              <span className="tt-cat-ic"><Icon n={GROUP_ICON[x.key] || "medal"} size={16} /></span>
              <span className="tt-cat-main">
                <b>{x.name}</b>
                {x.desc && <span>{x.desc}</span>}
              </span>
              <span className="tt-cat-n tnum">{rate ? `${xd} / ${xi.length}` : xi.length}</span>
            </button>
          );
        })}
      </aside>

      {g && <section className="tt-detail">
        <div className="y-plate">
          <div className="tt-dhead">
            <div>
              <h3 className="y-t2">{g.name}</h3>
              {g.desc && <p className="y-sm" style={{ marginTop: 7 }}>{g.desc}</p>}
            </div>
            <div className="tt-meter">
              <div className="tt-meter-k">
                <span className="y-micro">달성</span>
                <span className="tnum">{done}&thinsp;/&thinsp;{items.length}</span>
              </div>
              <div className="tt-meter-track">
                <i style={{ "--fill": items.length ? done / items.length : 0 }} />
              </div>
            </div>
            {admin && <button className="y-btn y-btn-secondary tt-add"
              onClick={() => setModal({ type: "title", groupKey: g.key })}>
              <Icon n="plus" size={13} />칭호 추가
            </button>}
          </div>

          {g.key === "champion" && <div className="tt-champs">
            {items.map(it => {
              const gen = genOf(it.name);
              const now = gen === lastGen;
              return (
                <div className={"tt-champ" + (now ? " now" : "")} key={it.id} onClick={edit(it)}>
                  <span className="g">{gen}{now ? " · 현" : ""}</span>
                  <span className="nm">{(it.holders || [])[0] || "미달성"}</span>
                  <span className="s">{championSeason(it.name)}</span>
                </div>
              );
            })}
          </div>}

          {g.key !== "champion" && <div className="tt-table">
            {items.map(it => {
              const holders = it.holders || [];
              const empty = holders.length === 0;
              const label = shortName(it.name, g.key);
              const dot = g.key === "type" ? TYPE_COLOR[label] : null;
              return (
                <div className={"tt-row" + (empty ? " off" : "")} key={it.id} onClick={edit(it)}>
                  <i className="tt-dot" style={dot ? { background: dot } : undefined} />
                  <b>{label}</b>
                  <span className="who">{empty ? "미달성" : holders.join(" · ")}</span>
                </div>
              );
            })}
          </div>}
        </div>
      </section>}
    </div>
  </section>);
}
