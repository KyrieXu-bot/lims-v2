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
      // 将 Capacitor 相关模块标记为 external
      // 这些模块只在原生环境中需要，Web 构建时不需要打包
      external: (id) => {
        return id.startsWith('@capacitor/');
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          utils: ['xlsx', 'docxtemplater', 'pizzip']
        }
      }
    }
  }
})
