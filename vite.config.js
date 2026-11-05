import { copyFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function productionVersionPlugin() {
  const githubSha = String(process.env.GITHUB_SHA || "").trim();
  const configuredBuildId = String(process.env.VITE_BUILD_ID || "").trim();
  const buildId = githubSha || configuredBuildId || `local-${Date.now().toString(36)}`;
  let base = "/";

  return {
    name: "ypl-production-version",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml() {
      const currentVersion = JSON.stringify(buildId).replace(/</g, "\\u003c");
      const versionPath = JSON.stringify(`${base}version.json`).replace(/</g, "\\u003c");
      return [{
        tag: "script",
        injectTo: "head-prepend",
        children: `(() => {
  const currentVersion = ${currentVersion};
  globalThis.__YPL_BUILD__ = currentVersion;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const versionUrl = new URL(${versionPath}, location.origin);
  versionUrl.searchParams.set("ts", Date.now().toString());

  fetch(versionUrl, { cache: "no-store", signal: controller.signal })
    .then(response => response.ok ? response.json() : null)
    .then(payload => {
      const latestVersion = typeof payload?.version === "string" ? payload.version.trim() : "";
      if (!latestVersion || latestVersion === currentVersion) return;

      const nextUrl = new URL(location.href);
      if (nextUrl.searchParams.get("__ypl_v") === latestVersion) return;
      nextUrl.searchParams.set("__ypl_v", latestVersion);
      location.replace(nextUrl.href);
    })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
})();`,
      }];
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ version: buildId }, null, 2)}\n`,
      });
    },
    // GitHub Pages는 없는 주소에 404.html을 준다. 앱이 그대로 떠서 main.jsx가 StatusPage를 보여 준다.
    closeBundle() {
      copyFileSync("dist/index.html", "dist/404.html");
    },
  };
}

export default defineConfig(({ command }) => {
  const isProductionBuild = command === "build";

  return {
    // 커스텀 도메인 league.pokeyonsei.com 의 루트에서 서비스합니다.
    // 도메인을 떼고 iambin2.github.io/ypl-site/ 로 돌아가면 "/ypl-site/" 로 되돌리세요.
    base: "/",
    plugins: [react(), isProductionBuild && productionVersionPlugin()].filter(Boolean),
  };
});
