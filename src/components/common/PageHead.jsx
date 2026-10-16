import React from "react";
import Icon from "./Icon.jsx";

/* 페이지 머리: 디스플레이 크기의 제목 한 줄, 설명 한 줄(E3). 제목 위에 영문 눈썹 라벨을 두지 않는다(E5).
   제목과 첫 내용 사이는 24px(간격 법칙). aside 는 제목 오른쪽(시즌 선택 등), children 은 설명 아래의 관리 버튼 자리. */
export default function PageHead({ plain, silver, desc, aside, children }) {
  const title = [plain, silver].filter(Boolean).join(" ");
  return (
    <header className="ypl-head">
      <div className="ypl-head-row">
        <h1 className="display ypl-head-h">{title}</h1>
        {aside}
      </div>
      {desc && <p className="callout ypl-head-desc">{desc}</p>}
      {children}
    </header>
  );
}

/* 섹션 머리: 제목 한 줄, 오른쪽에 조용한 링크. 내용까지 16px. */
export function SectionHead({ id, plain, silver, more }) {
  return (
    <div className="ypl-sech">
      <div>
        <h2 className="headline" id={id}>{[plain, silver].filter(Boolean).join(" ")}</h2>
      </div>
      {more && <button type="button" className="ypl-more press" onClick={more[1]}>{more[0]}<Icon n="chevr" size={14} /></button>}
    </div>
  );
}
