import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";

export default function Dropdown({ value, onChange, options = [], placeholder, className, disabled = false, ariaLabel, width }){
  const [open,setOpen]=useState(false); const ref=useRef(null);
  useEffect(()=>{ if(!open)return; const h=(e)=>{ if(ref.current&&!ref.current.contains(e.target))setOpen(false); }; const k=(e)=>{ if(e.key==="Escape")setOpen(false); };
    document.addEventListener("mousedown",h); document.addEventListener("keydown",k); return ()=>{document.removeEventListener("mousedown",h);document.removeEventListener("keydown",k);}; },[open]);
  useEffect(()=>{ if(disabled) setOpen(false); },[disabled]);
  const sel=options.find(o=>o.value===value);
  return (<div className={"dd"+(open?" open":"")+(className?" "+className:"")} ref={ref} style={width ? { width } : undefined}>
    <button type="button" className={"dd-btn"+(sel?"":" ph")} onClick={()=>setOpen(o=>!o)} disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}>
      <span>{sel?sel.label:(placeholder||"선택")}</span>
      <svg className="dd-chev" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    {open&&<div className="dd-menu" role="listbox" aria-label={ariaLabel}>{options.length===0&&<div className="dd-none">항목 없음</div>}
      {options.map(o=>(<button type="button" key={o.value} className={"dd-opt"+(o.value===value?" sel":"")} onClick={()=>{onChange(o.value);setOpen(false);}} disabled={Boolean(o.disabled)} role="option" aria-selected={o.value===value}>{o.label}{o.value===value&&<span className="dd-tick"><Icon n="check" size={15}/></span>}</button>))}
    </div>}
  </div>);
}
