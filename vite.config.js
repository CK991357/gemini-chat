import { defineConfig } from 'vite';

export default defineConfig({
  // 告诉 Vite 项目的根目录在哪里，以及 index.html 在哪里
  // 因为我们将 index.html 移到根目录，所以这里是 '.'
  root: '.', 
  
  // 告诉 Vite 哪些文件夹里的资源是纯静态的，不需要处理，直接复制
  // 我们将把您现有的 lib 文件夹放在这里
  publicDir: 'public', 
  
  server: {
    // 设置开发服务器端口
    port: 5173, 
    // 关键：设置 API 代理
    // 这会将前端开发服务器收到的 /api/* 请求，转发给正在运行的 Cloudflare Worker 开发服务器
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787', // 这是 `wrangler dev` 默认启动的地址
        changeOrigin: true,
      },
    },
  },

  build: {
    // 告诉 Vite 构建输出的目录名
    outDir: 'dist', 
  },
});