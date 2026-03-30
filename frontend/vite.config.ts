import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import viteCompression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // gzip 压缩：对大型 GeoJSON 等静态资源效果显著（通常压缩比 70-80%）
    viteCompression({
      algorithm: 'gzip',
      threshold: 10240,   // 仅压缩 >10KB 的文件
      ext: '.gz',
    }),
  ],
  server: {
    proxy: {
      // 将 /api/* 代理到 trajectory_lab Flask 服务
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
  esbuild: {
    // 【性能优化 P1-C】仅在生产环境去除 console/debugger，避免开发期丢失调试信息
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    // 【性能优化 P1-C】面向现代浏览器编译，利用原生语法减少 polyfill 体积
    target: 'es2022',
    rollupOptions: {
      output: {
        // 核心：基于包特性的手动分包策略 (Manual Chunks)
        manualChunks: (id) => {
          // React 及其生态包，这类包更新低频且多页通用
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'react-vendor';
          }
          // 地理底层引擎引擎及相关包装器（体积巨大，往往数 Mb）
          if (id.includes('node_modules/deck.gl') || id.includes('node_modules/@deck.gl') || id.includes('node_modules/maplibre-gl') || id.includes('node_modules/react-map-gl')) {
            return 'map-vendor';
          }
          // 图表渲染引擎包
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) {
            return 'chart-vendor';
          }
          // D3 计算模块和其余所有的第三方轮子
          if (id.includes('node_modules/d3-')) {
            return 'd3-vendor';
          }
        }
      }
    }
  }
}))
