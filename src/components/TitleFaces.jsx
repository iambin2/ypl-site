import React, { useEffect, useState, useSyncExternalStore } from "react";
import Seg from "./common/Seg.jsx";
import { medalDrawn, medalUrl } from "./titleMedal.js";
import { loadRecordsPokemonDirectory } from "../services/recordsPokemon.js";
import { REGIONS, TITLE_TYPES, championMedal, ownMedal, partnerMedal, regionMedal, regionOfTitle, typeMedal, typeOfTitle } from "../services/titleLooks.js";

/* ============================== 칭호의 메달 (DESIGN.md "Titles and hall of fame") ==============================
   칭호 페이지, 칭호 시트, 트레이너 시트가 같은 메달과 같은 판을 쓴다. */

const DESK = "(min-width: 860px)";
const deskNow = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(DESK).matches);
const onDesk = fn => { const m = typeof window !== "undefined" && window.matchMedia?.(DESK); m?.addEventListener("change", fn); return () => m?.removeEventListener("change", fn); };
export const useDesk = () => useSyncExternalStore(onDesk, deskNow, () => false);

/* the theme a medal is lit in: its room is the board's ground, so a medal is drawn again when the theme turns */
const groundNow = () => typeof document === "undefined" ? "" : document.documentElement.dataset.theme || "";
const onGround = fn => { const o = new MutationObserver(fn); o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] }); return () => o.disconnect(); };
const useGround = () => useSyncExternalStore(onGround, groundNow, () => "");

/* a partner's medal takes its Pokémon's first type: read from the records' Pokémon directory, once */
let partnerTypes = null;
export function usePartnerType() {
  const [map, setMap] = useState(partnerTypes);
  useEffect(() => {
    if (partnerTypes) return;
    let on = true;
    loadRecordsPokemonDirectory().then(directory => {
      const m = new Map();
      for (const record of directory.values()) if (record.displayName && record.type && !m.has(record.displayName)) m.set(record.displayName, record.type);
      partnerTypes = m;
      if (on) setMap(m);
    }, () => { if (on) setMap(new Map()); });
    return () => { on = false; };
  }, []);
  return map ? name => map.get(name) || "normal" : null;
}

/* one medal: nothing until it is drawn, then it is there (a medal switches on, it does not arrive) */
export function Medal({ spec, off = false }) {
  const ground = useGround(), key = JSON.stringify(spec) + off + ground;
  const [drawn, setDrawn] = useState(() => (spec ? { key, src: medalDrawn(spec, off) } : { key, src: "" }));
  useEffect(() => {
    if (!spec) return;
    const ready = medalDrawn(spec, off);
    if (ready) { setDrawn({ key, src: ready }); return; }
    let on = true;
    medalUrl(spec, off).then(src => on && setDrawn({ key, src }));
    return () => { on = false; };
  }, [key]);
  const src = drawn.key === key ? drawn.src : "";
  return <span className="tl-medal" aria-hidden="true">{src && <img src={src} alt="" decoding="async" />}</span>;
}

/* a board of medals, each its name under it; a short last row is closed with empty panels so the board stays a rectangle */
export function MedalBoard({ medals, cols, className = "", label }) {
  const desk = useDesk();
  const n = desk ? cols[0] : cols[1], empty = (n - medals.length % n) % n;
  return <div className={"stack tl-board-medals " + className} style={{ "--cols": n }} role="list" aria-label={label}>
    {medals.map(m => {
      const body = <>
        <Medal spec={m.spec} off={!m.on} />
        <span className="tl-name"><b className={m.big ? "t20" : ""}>{m.name}</b>{m.n > 1 && <i>×{m.n}</i>}</span>
        {m.sub && <span className={"t12 tl-sub" + (m.reign ? " reign" : "")}>{m.sub}</span>}
      </>;
      const cls = "pn tl-cell" + (m.on ? "" : " off");
      return m.onClick
        ? <button type="button" key={m.key} role="listitem" className={cls} onClick={m.onClick} aria-label={m.label || m.name}>{body}</button>
        : <span key={m.key} role="listitem" className={cls} aria-label={m.label || m.name}>{body}</span>;
    })}
    {Array.from({ length: empty }, (_, i) => <span key={"e" + i} className="pn tl-cell" aria-hidden="true" />)}
  </div>;
}

/* 트레이너 시트의 칭호: 가진 메달(챔피언 먼저), 그다음 타입 18개와 지방 10개의 판. 가진 것만 새겨지고, 판 머리에 몇 개를 가졌는지. */
export function TrainerTitles({ champions = [], titles = [] }) {
  const partnerType = usePartnerType();
  const mine = key => titles.filter(title => title.key === key);
  const types = new Set(mine("type").map(title => typeOfTitle(title.name)).filter(Boolean));
  const regions = new Set(mine("region").map(title => regionOfTitle(title.name)).filter(Boolean));
  const own = titles.filter(title => !["type", "region", "champion"].includes(title.key));
  const held = [
    ...champions.map(c => ({ key: `c${c.gen}`, on: true, name: `${c.gen}대 챔피언`, spec: championMedal(c.gen, c.season) })),
    ...own.map((title, i) => title.key === "partner"
      ? { key: `p${i}`, on: true, name: title.pokemon, label: `${title.pokemon}의 파트너`, spec: partnerType ? partnerMedal(partnerType(title.pokemon)) : null }
      : { key: `t${i}`, on: true, name: title.name, spec: ownMedal(title) }),
  ];
  const head = (label, n, of) => <div className="tl-mhead"><span className="t12 dim">{label}</span>
    <span className="counter-board"><Seg value={String(n)} h={32} cells={2} label={`${of}개 중 ${n}개`} /><span className="t15">/ {of}</span></span></div>;
  return <div className="tl-mine">
    {held.length > 0 && <MedalBoard medals={held} cols={[9, 6]} label="가진 칭호" />}
    {head("타입 엑스퍼트", types.size, TITLE_TYPES.length)}
    <MedalBoard cols={[9, 6]} label="타입 엑스퍼트" medals={TITLE_TYPES.map(t => ({ key: t.id, on: types.has(t.id), name: t.korean, label: `${t.korean} 엑스퍼트${types.has(t.id) ? "" : ", 없음"}`, spec: typeMedal(t.id) }))} />
    {head("지방 엘리트", regions.size, REGIONS.length)}
    <MedalBoard cols={[10, 5]} label="지방 엘리트" medals={REGIONS.map(([r]) => ({ key: r, on: regions.has(r), name: r, label: `${r} 엘리트${regions.has(r) ? "" : ", 없음"}`, spec: regionMedal(r) }))} />
  </div>;
}
