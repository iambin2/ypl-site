import { centreInk } from "./components/common/inkCentre.js";
import React, { Component } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import { isUnknownPath } from "./services/appRouting.js";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/pages.css";
import "./styles/records.css";
import "./styles/bracket.css";
import "./styles/team-builder.css";
import "./styles/calculator.css";
import "./styles/admin.css";

/* 저장된 테마를 React 보다 먼저 <html> 에 건다.
   (이 한 줄이 없으면 밤에 들어온 사람은 흰 화면이 한 번 번쩍인 뒤 어두워진다.) */
/* 처음 방문하면 다크로 연다(스코어보드). 라이트를 고른 사람만 라이트. */
function bootTheme() {
  try { return localStorage.getItem("ypl-theme") !== "light"; } catch (e) { return true; }
}
const bootDark = bootTheme();
document.documentElement.dataset.theme = bootDark ? "dark" : "light";
document.documentElement.style.colorScheme = bootDark ? "dark" : "light";

/* 페이지 안의 오류는 LazyContent가 받고, 여기에는 셸까지 무너진 경우만 온다. */
class AppBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <StatusPage title="화면을 표시하지 못했습니다." desc="새로고침해 주세요. 계속되면 운영진에게 알려 주세요." onRetry={() => window.location.reload()} />;
  }
}

// 스프라이트는 어디에 놓이든 잉크의 중앙으로 선다. load 는 올라오지 않아 잡는 단계에서 듣는다. 홈의 B면은 모서리에 서는 그림이다.
document.addEventListener("load", e => { if (e.target.matches?.('img[src*="/sprites/pokemon/"]:not(.hm-b img)')) centreInk(e.target); }, true);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isUnknownPath(window.location.pathname, import.meta.env.BASE_URL)
      ? <StatusPage title="페이지를 찾을 수 없습니다." desc="삭제되었거나 주소가 잘못되었습니다." />
      : <AppBoundary><App /></AppBoundary>}
  </React.StrictMode>
);
