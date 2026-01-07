import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'

// 防止移动端首次加载时页面被放大
// 确保页面加载后缩放比例为1.0
if (typeof window !== 'undefined') {
  // 设置viewport以确保初始缩放正确
  const setViewportScale = () => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }
  };
  
  // 页面加载时设置
  setViewportScale();
  
  // 监听DOMContentLoaded事件
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setViewportScale);
  }
  
  // 防止iOS Safari在输入框获得焦点时自动缩放
  // 通过确保输入框字体大小至少16px来解决（已在CSS中处理）
  // 这里添加额外的保护措施
  const preventZoom = () => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // 确保缩放比例始终为1.0
      setTimeout(() => {
        meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
      }, 100);
    }
  };
  
  // 在窗口加载完成后执行
  window.addEventListener('load', preventZoom);
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
