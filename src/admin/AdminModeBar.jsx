import React from "react";

/* 관리자 모드는 모든 화면에서 탭 바 바로 위의 40 반전 띠다: 바탕색 램프, 관리자 모드, 오른쪽 끝에 운영(운영진의 한 곳, AdminPage)과
   로그아웃. 운영 화면에서는 운영이 빠진다. */
export default function AdminModeBar({ onLogout, onDesk }) {
  return (
    <div className="admin-dock" role="status">
      <i className="lamp" aria-hidden="true" /><b>관리자 모드</b>
      {onDesk && <button type="button" className="admin-dock-out admin-dock-desk" onClick={onDesk}>운영</button>}
      {onLogout && <button type="button" className="admin-dock-out" onClick={onLogout}>로그아웃</button>}
    </div>
  );
}
