import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',

  // 告诉 Vite 所有的资源都从根目录 / 开始引用
  base: '/',

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    // 移除 rollupOptions，让 Vite 自动处理所有内部模块
  },
});