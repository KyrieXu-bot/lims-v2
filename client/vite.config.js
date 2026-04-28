import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const skipHtml5Qrcode =
  process.env.VITE_BUILD_SKIP_HTML5_QRCODE === '1' ||
  process.env.VITE_BUILD_SKIP_HTML5_QRCODE === 'true'

/** 与 SKIP_HTML5 同开的 Web 离线构建别名（缺少部分 @capacitor/* 时 Rollup 可解析）。 */
const mobileNativeAliases = skipHtml5Qrcode
  ? {
      'html5-qrcode': path.resolve(__dirname, 'src/shims/html5-qrcode-stub.js'),
      '@capacitor/camera': path.resolve(
        __dirname,
        'src/shims/capacitor-camera-stub.js'
      ),
      '@capacitor/core': path.resolve(
        __dirname,
        'src/shims/capacitor-core-stub.js'
      ),
      '@capacitor/share': path.resolve(
        __dirname,
        'src/shims/capacitor-share-stub.js'
      ),
      '@capacitor/filesystem': path.resolve(
        __dirname,
        'src/shims/capacitor-filesystem-stub.js'
      ),
      '@capawesome/capacitor-file-picker': path.resolve(
        __dirname,
        'src/shims/capawesome-file-picker-stub.js'
      ),
    }
  : {}

export default defineConfig({
  base: './',  // 添加这一行，使用相对路径
  resolve: {
    alias: mobileNativeAliases,
  },
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
