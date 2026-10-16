import React from "react";
import { BrandMark } from "../layout/SiteHeader.jsx";

/* L1: 사이트 공용 로딩. 글 대신 Wing Y 가 흐리게 자리를 잡고, 그 위로 빛이 한 줄 지나간다(카드 위 shimmer 와 같은 빛).
   빨리 끝나는 로딩에서는 깜빡이지 않게 잠깐 기다렸다 나타난다. small 은 카드나 목록 안의 자리. */
export default function Loader({ small = false, label = "불러오는 중" }) {
  const size = small ? 28 : 48;
  return (
    <div className={"y-loader" + (small ? " sm" : "")} role="status" aria-label={label}>
      <span className="y-loader-mark" aria-hidden="true">
        <BrandMark size={size} />
        <span className="y-loader-light" />
      </span>
    </div>
  );
}
