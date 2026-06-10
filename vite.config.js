import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages 프로젝트 저장소 경로 — 저장소 이름과 반드시 동일해야 합니다.
  // 저장소 이름을 바꾸면 이 값도 "/새이름/" 으로 바꾸세요.
  base: "/ypl-site/",
  plugins: [react()],
  // 이미지(움짤)가 많아 청크 경고 한도를 올려둡니다.
  build: { chunkSizeWarningLimit: 4000 },
});
