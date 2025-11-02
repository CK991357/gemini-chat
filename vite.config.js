import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
import path from 'path'; // 🆕 导入 Node.js 的 path 模块
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',

  plugins: [
    viteCommonjs(),
  ],

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  
  // ==================================================================
  // 🎯 最终解决方案：使用 resolve.alias 强制指定路径
  // 这会直接告诉 Vite 去哪里找这些包，绕过有问题的自动解析。
  // = a=================================================================
  resolve: {
    alias: {
      'langchain': path.resolve(__dirname, 'node_modules/langchain/dist/index.js'),
      '@langchain/core': path.resolve(__dirname, 'node_modules/@langchain/core/dist/index.js'),
      '@langchain/openai': path.resolve(__dirname, 'node_modules/@langchain/openai/dist/index.js'),
      'zod': path.resolve(__dirname, 'node_modules/zod/lib/index.js'),
    },
  },

  build: {
    outDir: 'dist',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});