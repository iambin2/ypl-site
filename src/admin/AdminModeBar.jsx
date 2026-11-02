import React from "react";

/* 관리자 모드는 모든 화면에서 탭 바 바로 위의 40 반전 띠다: 바탕색 램프, 관리자 모드, 오른쪽 끝에 로그아웃. */
export default function AdminModeBar({ onLogout }) {
  return (
    <div className="admin-dock" role="status">
      <i className="lamp" aria-hidden="true" /><b>관리자 모드</b>
      {onLogout && <button type="button" className="admin-dock-out" onClick={onLogout}>로그아웃</button>}
    </div>
  );
}
