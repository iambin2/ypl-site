import React from "react";
import { Reveal, Icon } from "../components/index.js";

/* 칭호 그룹 아이콘 — 데이터의 이모지 대신 사이트 아이콘 세트를 쓴다. */
const GROUP_ICON = { champion:"crown", type:"bolt", region:"map", partner:"handshake", etc:"medal", event:"spark" };

/* 타입 색 — 사이트의 포켓몬 타입 색과 같은 값 */
const TYPE_COLOR = {
  "노말":"#9FA19F","불꽃":"#E62829","물":"#2980EF","전기":"#C9A000","풀":"#3FA129",
  "얼음":"#2FB8DD","격투":"#FF8000","독":"#9141CB","땅":"#915121","비행":"#5F9FE0",
  "에스퍼":"#EF4179","벌레":"#91A119","바위":"#8F8A5A","고스트":"#704170",
  "드래곤":"#5060E1","악":"#624D4E","강철":"#60A1B8","페어리":"#D855D8",
};

/* 그룹 이름이 이미 종류를 말하므로 항목 이름에서 접미사를 덜어낸다. */
function shortName(name, key) {
  if (key === "type") return String(name).replace(/\s*엑스퍼트$/, "");
  if (key === "region") return String(name).replace(/\s*엘리트$/, "");
  return name;
}

/* ============================== TITLES ============================== */
export default function TitlesPage({ data, admin, setModal }) {
  const groups = data.titleGroups || [];
  const totalTitles = groups.reduce((n, g) => n + (g.items || []).length, 0);
  const genOf = name => String(name).replace(/\s*챔피언$/, "");
  /* 카드 폭에 맞게 시즌 라벨을 줄인다. CLASSIC SEASON 1 → Classic S1 */
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

  return (<section className="sec">
    <Reveal className="sec-head tt-head">
      <div className="tt-headmain">
        <h2>칭호</h2>
        <p className="sub">특정 조건을 달성한 트레이너에게 주어지는 명예의 칭호 목록입니다. 달성자가 없는 칭호는 회색으로 표시됩니다.</p>
      </div>
      <div className="tt-sum">
        <div><b className="tnum">{totalTitles}</b><span>부여된 칭호</span></div>
        <div><b className="tnum">{groups.length}</b><span>카테고리</span></div>
      </div>
    </Reveal>

    {groups.map(g => {
      const items = g.items || [];
      const done = items.filter(it => (it.holders || []).length > 0).length;
      const showRate = g.key === "type" || g.key === "region";
      return (
        <section className={"tgroup tg-" + g.key} key={g.id}>
          <Reveal className="tg-head">
            <span className="ic-box"><Icon n={GROUP_ICON[g.key] || "medal"} size={19} /></span>
            <div className="tg-headmain">
              <h3>{g.name}<small className="tnum">{items.length}</small></h3>
              {g.desc && <p>{g.desc}</p>}
              {showRate && <span className="tg-rate tnum">{done} / {items.length} 달성</span>}
              {admin && <button className="btn btn-ghost btn-sm tg-add" onClick={() => setModal({ type: "title", groupKey: g.key })}>칭호 추가</button>}
            </div>
          </Reveal>

          {g.key === "champion" && <div className="tg-champs">
            {items.map(it => {
              const gen = genOf(it.name);
              const now = gen === lastGen;
              return (
                <div className={"tg-champ" + (now ? " now" : "")} key={it.id}
                  onClick={admin ? () => setModal({ type: "title", groupKey: g.key, item: it }) : undefined}>
                  {now && <span className="cr"><Icon n="crown" size={15} /></span>}
                  <span className="g">{gen}{now ? " · 현재" : ""}</span>
                  <span className="nm">{(it.holders || [])[0] || "미달성"}</span>
                  <span className="s">{championSeason(it.name)}</span>
                </div>
              );
            })}
          </div>}

          {g.key === "event" && <div className="tg-chips">
            {items.map(it => (
              <span className={"tg-chip" + ((it.holders || []).length ? "" : " none")} key={it.id}
                onClick={admin ? () => setModal({ type: "title", groupKey: g.key, item: it }) : undefined}>
                <b>{it.name}</b><small>{(it.holders || []).join(" · ") || "미달성"}</small>
              </span>
            ))}
          </div>}

          {g.key !== "champion" && g.key !== "event" && <div className="tg-ledger">
            {items.map(it => {
              const holders = it.holders || [];
              const empty = holders.length === 0;
              const label = shortName(it.name, g.key);
              const dot = g.key === "type" ? TYPE_COLOR[label] : null;
              return (
                <div className={"tg-row" + (empty ? " none" : "")} key={it.id}
                  onClick={admin ? () => setModal({ type: "title", groupKey: g.key, item: it }) : undefined}>
                  <span className="k">
                    {dot && <i className="ty" style={{ background: dot }} />}
                    <span className="nm">{label}</span>
                    {it.desc && <small>{it.desc}</small>}
                  </span>
                  <span className="v">
                    {empty ? "미달성"
                      : g.key === "etc"
                        ? holders.map((h, j) => <span className="chip" key={j}>{h}</span>)
                        : holders.map((h, j) => <span className="p" key={j}>{h}</span>)}
                  </span>
                </div>
              );
            })}
          </div>}
        </section>
      );
    })}
  </section>);
}
