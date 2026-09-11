import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    // 하이브리드 앱 전환 시 Capacitor 의 webDir 로 그대로 쓰인다.
    outDir: "build",
    sourcemap: true,
  },
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
