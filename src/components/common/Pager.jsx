import React from "react";
import Icon from "./Icon.jsx";

export default function Pager({ page, pages, onGo }){
  if(pages<=1) return null;
  const span=2; let lo=Math.max(1,page-span), hi=Math.min(pages,page+span);
  if(page<=span) hi=Math.min(pages,1+span*2);
  if(page>pages-span) lo=Math.max(1,pages-span*2);
  const win=[]; for(let p=lo;p<=hi;p++) win.push(p);
  return (<nav className="pager" aria-label="페이지">
    <button className="pg-btn" onClick={()=>onGo(page-1)} disabled={page<=1} aria-label="이전 페이지"><Icon n="chevl" size={16}/></button>
    {lo>1&&<><button className="pg-btn" onClick={()=>onGo(1)}>1</button>{lo>2&&<span className="pg-dots">…</span>}</>}
    {win.map(p=>(<button key={p} className={"pg-btn"+(p===page?" on":"")} onClick={()=>onGo(p)}>{p}</button>))}
    {hi<pages&&<>{hi<pages-1&&<span className="pg-dots">…</span>}<button className="pg-btn" onClick={()=>onGo(pages)}>{pages}</button></>}
    <button className="pg-btn" onClick={()=>onGo(page+1)} disabled={page>=pages} aria-label="다음 페이지"><Icon n="chevr" size={16}/></button>
  </nav>);
}
