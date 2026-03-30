import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',  // 添加这一行，使用相对路径
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.NODE_ENV === 'production' 
          ? 'http://192.168.9.46:3004' 
          : 'http://localhost:3001',
        changeOrigin: true
      },
      '/socket.io': {
        target: process.env.NODE_ENV === 'production' 
          ? 'http://192.168.9.46:3004' 
          : 'http://localhost:3001',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild', // 使用 esbuild（Vite 默认，更快）
    rollupOptions: {
      // 不可将 @capacitor/* 设为 external：Capacitor App 加载的是 dist 里的 ES 模块，
      // WebView 无法解析裸说明符 "import from '@capacitor/core'"，会白屏。
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          utils: ['xlsx', 'docxtemplater', 'pizzip']
        }
      }
    }
  }
})
