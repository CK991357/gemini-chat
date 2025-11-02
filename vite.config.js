import { viteCommonjs } from '@originjs/vite-plugin-commonjs'; // 🆕 导入插件
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.', 
  publicDir: 'public', 
  
  plugins: [
    viteCommonjs(), // 🆕 使用插件
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
  // 🎯 关键修改：添加 optimizeDeps 配置
  // 这会告诉 Vite 在启动时预先处理这些复杂的包，以避免解析错误。
  // ==================================================================
  optimizeDeps: {
    include: [
      'langchain',
      '@langchain/core',
      '@langchain/openai',
      'zod'
    ],
  },

  build: {
    outDir: 'dist', 
    // 🆕 新增：帮助处理 CommonJS 依赖
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});