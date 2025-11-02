import { defineConfig } from 'vite';

export default defineConfig({
  // 🎯 关键修改 1：将 Vite 的根目录指向 'src'
  // 这会告诉 Vite，index.html 和所有源码都在 'src' 文件夹里。
  root: 'src',

  publicDir: '../public', // public 目录相对于 root ('src') 的位置

  server: {
    port: 5173,
    // 代理配置保持不变，因为它依然有效
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },

  build: {
    // 🎯 关键修改 2：确保构建输出目录在项目根目录下
    // 'outDir' 是相对于 'root' 的，所以我们需要用 '../' 回到上一级。
    outDir: '../dist',
    // 清空输出目录，确保每次构建都是干净的
    emptyOutDir: true,
  },
});