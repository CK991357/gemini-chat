import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',

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
    // ==================================================================
    // 🎯 关键修复：简化构建配置
    // ==================================================================
    rollupOptions: {
      // 确保不排除任何需要的包
      external: [],
    },
  },

  optimizeDeps: {
    // ==================================================================
    // 🎯 关键修复：显式包含 LangChain 相关包进行预构建
    // ==================================================================
    include: [
      'langchain',
      '@langchain/core', 
      '@langchain/openai',
      'zod'
    ],
    // 强制预构建这些包
    force: true
  },
});