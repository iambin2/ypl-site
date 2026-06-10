import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// 페이지 기본 여백 제거 + 배경색(앱 내부에서 다시 칠하지만 깜빡임 방지)
const base = document.createElement("style");
base.textContent = "html,body,#root{margin:0;padding:0;min-height:100%;background:#F6FAFE;}";
document.head.appendChild(base);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
