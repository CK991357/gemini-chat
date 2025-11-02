import { viteCommonjs } from '@originjs/vite-plugin-commonjs';
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
  
  resolve: {
    alias: [
      // ==================================================================
      // 🎯 最终解决方案 v2：使用更稳健的路径别名
      // 我们直接将别名指向包名本身，让 Node.js 的解析算法来找到正确的入口。
      // ==================================================================
      { find: 'langchain', replacement: 'langchain' },
      { find: '@langchain/core', replacement: '@langchain/core' },
      { find: '@langchain/openai', replacement: '@langchain/openai' },
      { find: 'zod', replacement: 'zod' },
    ],
  },

  build: {
    outDir: 'dist',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});