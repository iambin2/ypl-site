import { centreInk } from "./components/common/inkCentre.js";
import React, { Component } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import { isUnknownPath, isUnknownView } from "./services/appRouting.js";
import { captureVisitorSession } from "./services/visitorAuth.js";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/board.css";
import "./styles/home.css";
import "./styles/news.css";
import "./styles/brackets.css";
import "./styles/more.css";
import "./styles/hall.css";
import "./styles/posts.css";
import "./styles/pages.css";
import "./styles/records.css";
import "./styles/records-board.css";
import "./styles/bracket.css";
import "./styles/team-builder.css";
import "./styles/builder.css";
import "./styles/calculator.css";
import "./styles/battle.css";
import "./styles/battle-stage.css";
import "./styles/streak.css";
import "./styles/admin.css";

/* 저장된 테마를 React 보다 먼저 <html> 에 건다.
   (이 한 줄이 없으면 밤에 들어온 사람은 흰 화면이 한 번 번쩍인 뒤 어두워진다.) */
/* 처음 방문하면 다크로 연다(스코어보드). 라이트를 고른 사람만 라이트, 기기 설정을 고른 사람은 기기를 따른다. */
function bootTheme() {
  try {
    const t = localStorage.getItem("ypl-theme");
    return t === "system" ? !matchMedia("(prefers-color-scheme: light)").matches : t !== "light";
  } catch (e) { return true; }
}
const bootDark = bootTheme();
document.documentElement.dataset.theme = bootDark ? "dark" : "light";
document.documentElement.style.colorScheme = bootDark ? "dark" : "light";

/* 아이폰과 아이패드의 사파리는 글자가 16px보다 작은 입력 칸에 초점이 가면 화면을 확대하고 되돌리지 않는다(이 사이트의 칸은 15).
   maximum-scale=1을 주면 그 자동 확대만 없어지고 두 손가락 확대는 그대로 된다. 안드로이드에서는 두 손가락 확대까지 막히므로
   iOS에만 건다. (2026-11-10, 코드로 찾은 것이라 실제 아이폰에서 확인이 필요하다.) */
if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !/maximum-scale/.test(viewport.content)) viewport.content += ", maximum-scale=1";
}

/* 페이지 안의 오류는 LazyContent가 받고, 여기에는 셸까지 무너진 경우만 온다. */
class AppBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <StatusPage title="화면을 표시하지 못했습니다." desc="새로고침해 주세요. 계속되면 운영진에게 알려 주세요." onRetry={() => {
      // the crash may be in the browser's own copy of the site's data, which a reload would draw again: it is let go first
      try { localStorage.removeItem("ypl-seen-site"); } catch { /* the reload reads again anyway */ }
      window.location.reload();
    }} />;
  }
}

// 스프라이트는 어디에 놓이든 잉크의 중앙으로 선다. load 는 올라오지 않아 잡는 단계에서 듣는다. 홈의 B면은 모서리에 서는 그림이다.
document.addEventListener("load", e => { if (e.target.matches?.('img[src*="/sprites/pokemon/"]:not(.mon)')) centreInk(e.target); }, true);

// a return from Google sign-in leaves its tokens after # in the address: kept on the device and cleared from the address first
captureVisitorSession();
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isUnknownPath(window.location.pathname, import.meta.env.BASE_URL) || isUnknownView(window.location.search)
      ? <StatusPage title="페이지를 찾을 수 없습니다." desc="삭제되었거나 주소가 잘못되었습니다." />
      : <AppBoundary><App /></AppBoundary>}
  </React.StrictMode>
);
