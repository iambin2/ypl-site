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
  };
}

export default defineConfig(({ command }) => {
  const isProductionBuild = command === "build";

  return {
    // GitHub Pages 프로젝트 저장소 경로 — 저장소 이름과 반드시 동일해야 합니다.
    // 저장소 이름을 바꾸면 이 값도 "/새이름/" 으로 바꾸세요.
    base: "/ypl-site/",
    plugins: [react(), isProductionBuild && productionVersionPlugin()].filter(Boolean),
    // 이미지(움짤)가 많아 청크 경고 한도를 올려둡니다.
    build: { chunkSizeWarningLimit: 4000 },
  };
});
