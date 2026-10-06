import React from "react";

/* 보조 필터(법전 Segmented의 ypl-pill): 시즌이나 리그처럼 한 단계 아래의 고르기. */
export default function Pills({ value, onChange, options, ariaLabel }) {
  return (
    <div className="ypl-pills" role="group" aria-label={ariaLabel}>
      {options.map(([key, label]) => (
        <button key={key} type="button" className="ypl-pill press" aria-pressed={key === value} onClick={() => onChange(key)}>{label}</button>
      ))}
    </div>
  );
}
