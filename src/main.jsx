import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

/* 페이지 기본 여백 제거 + 첫 배경색.
   React 가 붙기 전까지 보이는 색이므로, 저장된 테마를 먼저 읽는다.
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
const base = document.createElement("style");
base.textContent =
  `html,body,#root{margin:0;padding:0;min-height:100%;background:${bootDark ? "#0A0D13" : "#F4F5F8"};}`;
document.head.appendChild(base);
document.documentElement.style.colorScheme = bootDark ? "dark" : "light";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
