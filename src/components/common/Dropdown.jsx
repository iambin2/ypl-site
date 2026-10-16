import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useExitAnimation } from "./Modal.jsx";
import Modal from "./Modal.jsx";
import { MenuItems } from "./Menu.jsx";
import { EASE_IN, desktop } from "./motion.js";

/* 메뉴는 열릴 때처럼 닫힐 때도 움직인다(떠 있는 층의 공통 규칙). */
function DropdownMenu({ children, ariaLabel }){
  const ref=useRef(null);
  useExitAnimation(ref,{ inPlace:true, exit:node=>[node.animate([{opacity:1,transform:"none"},{opacity:0,transform:"scale(.96)"}],{duration:150,easing:EASE_IN,fill:"forwards"})] });
  return <div className="dd-menu glass-l3" role="listbox" aria-label={ariaLabel} ref={ref}>{children}</div>;
}

/* M6: 데스크톱은 칸 아래로 커지며 열리는 글래스 메뉴, 폰은 같은 항목이 바텀시트로 올라온다. */
export default function Dropdown({ value, onChange, options = [], placeholder, className, disabled = false, ariaLabel, width }){
  const [open,setOpen]=useState(false); const [sheet,setSheet]=useState(false); const ref=useRef(null); const btnRef=useRef(null);
  useEffect(()=>{ if(!open||sheet)return; const h=(e)=>{ if(ref.current&&!ref.current.contains(e.target))setOpen(false); }; const k=(e)=>{ if(e.key==="Escape"){setOpen(false);btnRef.current?.focus();} };
    document.addEventListener("mousedown",h); document.addEventListener("keydown",k); return ()=>{document.removeEventListener("mousedown",h);document.removeEventListener("keydown",k);}; },[open,sheet]);
  useEffect(()=>{ if(disabled) setOpen(false); },[disabled]);
  /* 데스크톱 메뉴는 열리면 고른 항목에 포커스를 두고, 위아래 화살표로 옮기며 엔터(버튼 기본 동작)로 고른다. */
  const opts=()=>[...(ref.current?.querySelectorAll(".dd-opt:not(:disabled)")||[])];
  useEffect(()=>{ if(open&&!sheet){ const list=opts(); (list.find(b=>b.classList.contains("sel"))||list[0])?.focus(); } },[open,sheet]);
  const onKeyDown=(e)=>{
    if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
    e.preventDefault();
    if(!open){ if(!disabled) toggle(); return; }
    const list=opts(); if(!list.length)return;
    const i=list.indexOf(document.activeElement), d=e.key==="ArrowDown"?1:-1;
    list[i<0?(d>0?0:list.length-1):(i+d+list.length)%list.length].focus();
  };
  const sel=options.find(o=>o.value===value);
  const toggle=()=>{ if(!open) setSheet(!desktop()); setOpen(o=>!o); };
  const pick=(v)=>{ onChange(v); setOpen(false); btnRef.current?.focus(); };
  return (<div className={"dd"+(open?" open":"")+(className?" "+className:"")} ref={ref} style={width ? { width } : undefined} onKeyDown={onKeyDown}>
    <button type="button" ref={btnRef} className={"dd-btn"+(sel?"":" ph")} onClick={toggle} disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}>
      <span>{sel?sel.label:(placeholder||"선택")}</span>
      <Icon n="chev" size={16} className="dd-chev" />
    </button>
    {open&&sheet&&<Modal title={ariaLabel||placeholder||"선택"} onClose={()=>setOpen(false)}>
      {options.length===0?<p className="dd-none">항목 없음</p>
        :<MenuItems role="listbox" items={options.map(o=>({key:o.value,label:o.label,current:o.value===value,disabled:Boolean(o.disabled),onSelect:()=>onChange(o.value)}))} onPick={()=>setOpen(false)}/>}
    </Modal>}
    {open&&!sheet&&<DropdownMenu ariaLabel={ariaLabel}>{options.length===0&&<div className="dd-none">항목 없음</div>}
      {options.map(o=>(<button type="button" key={o.value} className={"dd-opt"+(o.value===value?" sel":"")} onClick={()=>pick(o.value)} disabled={Boolean(o.disabled)} role="option" aria-selected={o.value===value}>{o.label}{o.value===value&&<span className="dd-tick"><Icon n="check" size={16}/></span>}</button>))}
    </DropdownMenu>}
  </div>);
}
