import React from "react";

export default function AdminModeBar() {
  return (
    <div className="admin-bar" role="status">
      <div className="admin-bar-in"><i aria-hidden="true" /><b>관리자 모드</b><span>각 섹션에서 추가, 수정, 삭제할 수 있습니다.</span></div>
    </div>
  );
}
