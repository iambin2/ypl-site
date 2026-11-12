import React, { useEffect, useState, useSyncExternalStore } from "react";
import Seg from "./common/Seg.jsx";
import { Mon } from "./common/Board.jsx";
import { centreInk } from "./common/inkCentre.js";
import { loadHallOfFameArtworkLookup, resolveHallOfFameArtwork } from "../services/hallOfFamePresentation.js";
import { spriteUrlForSlug } from "../services/teamBuilderCore.js";
import { REGION_COVERS, TITLE_TYPES, regionOfTitle, titleLook, typeOfTitle } from "../services/titleLooks.js";

/* ============================== 칭호의 얼굴 (DESIGN.md "Titles and hall of fame") ==============================
   칭호 페이지, 칭호 시트, 트레이너 시트가 같은 얼굴을 쓴다. 문장은 메달이라 그 안의 포켓몬은 바닥이 아니라 잉크의 중심에 선다. */

const DESK = "(min-width: 860px)";
const deskNow = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(DESK).matches);
const onDesk = fn => { const m = typeof window !== "undefined" && window.matchMedia?.(DESK); m?.addEventListener("change", fn); return () => m?.removeEventListener("change", fn); };
export const useDesk = () => useSyncExternalStore(onDesk, deskNow, () => false);

/* 한국어 포켓몬 이름의 그림: 명예의 전당이 쓰는 도감 조회를 함께 쓴다. 읽기 전에는 빈 칸. */
export function useTitleArtwork() {
  const [lookup, setLookup] = useState(null);
  useEffect(() => { let on = true; loadHallOfFameArtworkLookup().then(map => on && setLookup(map), () => {}); return () => { on = false; }; }, []);
  return name => (lookup && name ? resolveHallOfFameArtwork({ name }, lookup) : "");
}

/* 꺼진 칭호의 실루엣(칸보다 한 단계 밝은 판의 색)과, 메가진화 문양을 제 색 위에 흰색으로 세우는 두 필터 */
export function TitleDefs() {
  return <svg className="tl-defs" aria-hidden="true" width="0" height="0" focusable="false">
    <filter id="tl-sil" colorInterpolationFilters="sRGB"><feFlood className="tl-sil-flood" /><feComposite in2="SourceAlpha" operator="in" /></filter>
    <filter id="tl-onlight" colorInterpolationFilters="sRGB">
      <feComponentTransfer in="SourceAlpha" result="solid"><feFuncA type="linear" slope="4" /></feComponentTransfer>
      <feFlood className="tl-light-flood" /><feComposite in2="solid" operator="in" />
    </filter>
  </svg>;
}

/* a picture centred by its ink in its box (a medal, not a floor) */
export function InkPic({ src, off = false }) {
  if (!src) return null;
  return <img className={"tl-pic" + (off ? " sil" : "")} src={src} alt="" decoding="async"
    ref={el => { if (el?.complete && el.naturalWidth) centreInk(el); }} onLoad={e => centreInk(e.currentTarget)} />;
}

/* 문장: 띠 1~3개(여럿이면 색상환을 따라 녹아 이어진다), 띠마다 그림 하나, 또는 메가진화 문양 */
export function Emblem({ item, on, art, className = "" }) {
  const look = titleLook(item);
  const mega = look.mark === "mega";
  const n = Math.max(1, look.bands.length);
  const melt = mega ? " tl-paint-mega" : n > 1 ? ` tl-melt n${n}` : "";
  const band = i => look.bands[i] ? `var(--type-${look.bands[i]})` : undefined;
  const style = mega || n < 2 ? undefined : { "--c1": band(0), "--c2": band(1), "--c3": band(2) };
  return <span className={"tl-emblem" + melt + (look.bands.length === 1 && !mega ? ` type-${look.bands[0]}` : "") + (on ? "" : " off") + (className ? " " + className : "")} style={style} aria-hidden="true">
    {mega ? <span className="tl-band"><img className="tl-mark" src="/brand/mega-evolution.png" alt="" /></span>
      : look.bands.map((id, i) => <span key={id + i} className="tl-band">{look.mons[i] && <span className="tl-band-stand"><InkPic src={art(look.mons[i])} off={!on} /></span>}</span>)}
  </span>;
}

/* the champions' small banner: its gold cap, its generation in gold, 챔피언 on its floor */
export function ChampionBadge({ generation }) {
  return <span className="pn tl-mbadge tl-mchamp" role="img" aria-label={`${generation}대 챔피언`}>
    <span className="counter-board"><Seg value={String(generation)} h={32} cells={generation >= 10 ? 2 : 1} label={`${generation}대`} /><span className="t15">대</span></span>
    <i className="tl-mname t12">챔피언</i>
  </span>;
}

/* 트레이너 시트의 칭호: 고유한 칭호의 작은 칸들, 그다음 타입 18칸과 지방 10칸의 판. 켠 칸만 켜진다. */
export function TrainerTitles({ champions = [], titles = [] }) {
  const art = useTitleArtwork();
  const mine = key => titles.filter(title => title.key === key);
  const types = new Set(mine("type").map(title => typeOfTitle(title.name)).filter(Boolean));
  const regions = new Set(mine("region").map(title => regionOfTitle(title.name)).filter(Boolean));
  const own = titles.filter(title => !["type", "region", "champion"].includes(title.key));
  return <div className="tl-mine">
    <TitleDefs />
    {(champions.length > 0 || own.length > 0) && <div className="stack tl-mregions">
      {champions.map(generation => <ChampionBadge key={`c${generation}`} generation={generation} />)}
      {own.map((title, i) => title.key === "partner"
        ? <span key={`p${i}`} className="pn tl-mbadge tl-mown" role="img" aria-label={title.name}>
          <span className="tl-memblem"><span className="tl-mpic"><InkPic src={art(title.pokemon)} /></span></span>
          <i className="tl-mname t12">{title.pokemon}</i>
        </span>
        : <span key={`t${i}`} className="pn tl-mbadge tl-mown" role="img" aria-label={title.name}>
          <Emblem item={title} on art={art} className="tl-memblem" />
          <i className="tl-mname t12">{title.name}</i>
        </span>)}
    </div>}
    <div className="stack tl-mtypes" role="list" aria-label="타입 엑스퍼트">
      {TITLE_TYPES.map(type => <span key={type.id} role="listitem" className={`tl-mtype type-${type.id}` + (types.has(type.id) ? " on" : "")}
        aria-label={`${type.korean} 엑스퍼트${types.has(type.id) ? "" : ", 없음"}`}>{type.korean}</span>)}
    </div>
    <div className="stack tl-mregions" role="list" aria-label="지방 엘리트">
      {REGION_COVERS.map(([region, slug]) => <span key={region} role="listitem" className={"pn stand tl-mregion" + (regions.has(region) ? "" : " off")}
        aria-label={`${region} 엘리트${regions.has(region) ? "" : ", 없음"}`}>
        <i className="floor t12" aria-hidden="true">{region}</i>
        <Mon src={spriteUrlForSlug(slug)} className={regions.has(region) ? "" : "sil"} />
      </span>)}
    </div>
  </div>;
}
