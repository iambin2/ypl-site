import React, { useEffect } from "react";
import Button from "../components/common/Button.jsx";
import PageHead from "../components/common/PageHead.jsx";
import { BrandMark, Wordmark } from "../components/layout/SiteHeader.jsx";

const HOME = import.meta.env.BASE_URL;
const LINKS = [["공지", "news"], ["대진표", "bracket"], ["기록", "records"]];

/* 앱 바깥에 서는 화면: 없는 주소(404)와 앱 전체의 오류(500). 셸을 믿을 수 없는 순간이라 갈 곳은 보통 링크다.
   주소가 /ypl-site/ 로 돌아와야 하므로 새로 불러오는 것이 맞다. */
export default function StatusPage({ title, desc, onRetry }) {
  useEffect(() => { document.title = `${title} | YPL`; }, [title]);
  return (
    <>
      <header className="topbar">
        <a className="brand" href={HOME} aria-label="YPL 홈으로">
          <span className="brand-logo"><BrandMark /></span><Wordmark />
        </a>
      </header>
      <main className="page">
        <PageHead plain={title} desc={desc} />
        <div className="status-links">
          {onRetry && <Button variant="primary" onClick={onRetry}>새로고침</Button>}
          <Button variant={onRetry ? "secondary" : "primary"} href={HOME}>홈</Button>
          {LINKS.map(([label, view]) => <Button key={view} href={`${HOME}?view=${view}`}>{label}</Button>)}
        </div>
      </main>
    </>
  );
}
