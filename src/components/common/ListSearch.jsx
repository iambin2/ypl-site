import React from "react";
import Icon from "./Icon.jsx";

export default function ListSearch({ q, setQ, placeholder, count }){
  return (<div className="list-tools">
    <div className="lsearch">
      <span className="ls-ico" aria-hidden="true"><Icon n="search" size={15}/></span>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder={placeholder} aria-label="검색"/>
      {q&&<button className="ls-clear" onClick={()=>setQ("")} aria-label="검색어 지우기"><Icon n="x" size={12}/></button>}
    </div>
    {q&&<span className="list-count">{count}건</span>}
  </div>);
}
