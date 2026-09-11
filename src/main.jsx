import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/shell.css";
import "./styles/pages.css";
import "./styles/records.css";
import "./styles/bracket.css";
import "./styles/team-builder.css";
import "./styles/admin.css";

/* 저장된 테마를 React 보다 먼저 <html> 에 건다.
   (이 한 줄이 없으면 밤에 들어온 사람은 흰 화면이 한 번 번쩍인 뒤 어두워진다.) */
function bootTheme() {
  try {
    const saved = localStorage.getItem("ypl-theme");
    if (saved === "dark") return true;
    if (saved === "light") return false;
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  } catch (e) { return false; }
}
const bootDark = bootTheme();
document.documentElement.dataset.theme = bootDark ? "dark" : "light";
document.documentElement.style.colorScheme = bootDark ? "dark" : "light";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
