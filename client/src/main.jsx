import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import App from './App.jsx'

// 初始化 Capacitor（在原生环境中必须初始化）
// 这会确保 Capacitor.isNativePlatform() 能正确工作
if (Capacitor.isNativePlatform()) {
  console.log('运行在原生平台:', Capacitor.getPlatform())
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
