import React from "react";
import Icon from "../components/common/Icon.jsx";

/* O2: 관리자 모드는 하단에 떠 있는 글래스 바로 표시한다. 폰에서는 탭 바 바로 위. */
export default function AdminModeBar({ onLogout }) {
  return (
    <div className="admin-dock glass" role="status">
      <i className="live-dot" aria-hidden="true" /><b>관리자 모드</b>
      <span className="admin-dock-note">각 섹션에서 추가, 수정, 삭제할 수 있습니다.</span>
      {onLogout && <button type="button" className="admin-dock-out press" onClick={onLogout}><Icon n="logout" size={16} />로그아웃</button>}
    </div>
  );
}
