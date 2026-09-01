import React from "react";
import "./beta-notice.css";

/* 새로 도입한 기능이 시험 운영 중임을 알리는 배너. */
export default function BetaNotice({ title, children }) {
  return (
    <div className="beta-note" role="note">
      <span className="beta-note-tag">BETA</span>
      <div className="beta-note-body">
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}
