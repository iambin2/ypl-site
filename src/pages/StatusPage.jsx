import React, { useEffect } from "react";
import { Bang } from "../components/common/Board.jsx";
import Button from "../components/common/Button.jsx";
import Seg from "../components/common/Seg.jsx";
import { BrandMark, Wordmark } from "../components/layout/SiteHeader.jsx";

const HOME = import.meta.env.BASE_URL;
const LINKS = [["공지", "news"], ["대진표", "bracket"]];

/* 앱 바깥에 서는 화면: 없는 주소(404)와 앱 전체의 오류(500). 셸을 믿을 수 없는 순간이라 갈 곳은 보통 링크다.
   주소가 /ypl-site/ 로 돌아와야 하므로 새로 불러오는 것이 맞다. (DESIGN.md "Errors and empty")
   없는 주소는 판에 404를 켜고, 오류는 ! 칸과 문장 뒤에 새로고침 하나를 둔다. 아래에 지름길 둘. */
export default function StatusPage({ title, desc, onRetry }) {
  useEffect(() => { document.title = `${title} | YPL`; }, [title]);
  return (
    <>
      <header className="topbar">
        <a className="brand" href={HOME} aria-label="YPL 홈으로">
          <span className="brand-logo"><BrandMark /></span><Wordmark />
        </a>
      </header>
      <main className="page status-page">
        {onRetry
          ? <p className="status-label t12"><Bang />오류</p>
          : <><p className="status-label t12 dim"><i className="lamp" aria-hidden="true" />찾는 페이지</p><div className="status-board"><Seg value="404" h={120} cells={3} label="404" /></div></>}
        <h1 className={(onRetry ? "t32" : "t20") + " status-title"}>{title}</h1>
        {desc && <p className="read dim status-desc">{desc}</p>}
        <div className="status-go">
          {onRetry ? <Button variant="main" onClick={onRetry}>새로고침</Button> : <Button variant="main" href={HOME}>홈으로</Button>}
          <div className="stack status-links">
            {onRetry && <Button variant="second" href={HOME}>홈</Button>}
            {LINKS.map(([label, view]) => <Button variant="second" key={view} href={`${HOME}?view=${view}`}>{label}</Button>)}
          </div>
        </div>
      </main>
    </>
  );
}
