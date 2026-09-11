import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** 스모크 테스트를 노드에서 돌리기 위한 SSR 번들 설정. 배포 빌드와는 무관하다. */
export default defineConfig({
  plugins: [react()],
  build: {
    ssr: 'smoke/render.tsx',
    outDir: 'smoke/dist',
    emptyOutDir: true,
    minify: false,
  },
});
