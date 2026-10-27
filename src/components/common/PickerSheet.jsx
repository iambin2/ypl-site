import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";

/* 긴 목록에서 하나를 고르는 시트(M6의 긴 목록판): 검색 하나와 같은 모양의 행(제목, 회색 한 줄, 오른쪽 값).
   폰은 바텀시트, 데스크톱은 가운데 창. 고를 수 없는 항목은 이유(sub)와 함께 흐리게 남는다.
   검색창에서 위아래 화살표로 행을 옮기고 엔터로 고른다(고를 수 없는 행은 건너뛴다).
   item: { value, label, sub?, search?, match?(query), img?, badges?, trailing?, disabled? } */
const compact = text => String(text || "").toLowerCase().replace(/\s+/g, "");

export default function PickerSheet({ title, placeholder, items, selected, onPick, onClose, emptyText = "검색 결과가 없습니다." }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(-1);
  const listRef = useRef(null);
  const shown = useMemo(() => {
    const q = compact(query);
    if (!q) return items;
    return items.filter(item => item.match ? item.match(query) : compact(item.search ?? item.label).includes(q));
  }, [items, query]);
  useEffect(() => { listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" }); }, [cursor]);
  const pick = item => { onPick(item.value); onClose(); };
  const step = dir => {
    for (let i = 1; i <= shown.length; i++) {
      const next = ((cursor < 0 && dir < 0 ? 0 : cursor) + dir * i + shown.length) % shown.length;
      if (!shown[next].disabled) return setCursor(next);
    }
  };
  const onKeyDown = event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      step(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter" && shown[cursor] && !shown[cursor].disabled) {
      event.preventDefault();
      pick(shown[cursor]);
    }
  };
  const fine = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
  return (
    <Modal title={title} onClose={onClose}>
      <div className="tb-search-row pick-search">
        <span className="search-input-icon" aria-hidden="true"><Icon n="search" size={18} /></span>
        <input value={query} onChange={event => { setQuery(event.target.value); setCursor(event.target.value ? 0 : -1); }} onKeyDown={onKeyDown}
          placeholder={placeholder} aria-label={placeholder} autoComplete="off" autoFocus={fine}
          role="combobox" aria-expanded="true" aria-controls="pick-list" aria-activedescendant={cursor >= 0 ? `pick-opt-${cursor}` : undefined} />
        {query && <button type="button" className="tb-clear" onClick={() => { setQuery(""); setCursor(-1); }} aria-label="검색어 지우기"><Icon n="x" size={14} /></button>}
      </div>
      <div className="pick-list" id="pick-list" role="listbox" aria-label={title} ref={listRef}>
        {shown.map((item, index) => (
          <button type="button" key={item.value || "none"} id={`pick-opt-${index}`} role="option" aria-selected={item.value === selected} disabled={item.disabled}
            className={"pick-row press" + (item.value === selected ? " sel" : "") + (index === cursor ? " cursor" : "")} onClick={() => pick(item)}>
            {item.img !== undefined && (item.img ? <img src={item.img} alt="" loading="lazy" decoding="async" onError={event => { event.currentTarget.style.visibility = "hidden"; }} /> : <span className="pick-blank" />)}
            <span className="pick-copy"><strong>{item.label}</strong>{item.sub && <small>{item.sub}</small>}</span>
            {item.badges}
            {item.trailing != null && <em className="pick-trail">{item.trailing}</em>}
            {item.value === selected && <Icon n="check" size={18} className="check" />}
          </button>
        ))}
        {!shown.length && <p className="tb-pool-empty">{emptyText}</p>}
      </div>
    </Modal>
  );
}

/* 시트를 여는 칸: 드롭다운과 같은 알약 모양에 값, 오른쪽에 타입 점(있으면)과 지우기 단추. */
export function PickField({ label, value, placeholder, typeId, typeLabel, onOpen, onClear, disabled = false }) {
  return (
    <div className="pick-field">
      <button type="button" className={"dd-btn" + (value ? "" : " ph")} onClick={onOpen} disabled={disabled} aria-label={label}>
        <span>{value || placeholder}</span>
        {typeLabel ? <span className={`pick-type type-${typeId}`}>{typeLabel}</span> : !onClear || !value ? <Icon n="chev" size={16} className="dd-chev" /> : null}
      </button>
      {value && onClear && !disabled && <button type="button" className="tb-clear pick-clear" aria-label={`${label} 지우기`} onClick={onClear}><Icon n="x" size={14} /></button>}
    </div>
  );
}
