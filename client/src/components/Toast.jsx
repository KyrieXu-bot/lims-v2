import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Toast.css';

/**
 * Toast提示组件
 * 显示在屏幕中央的提示消息，自动消失
 * @param {string} message - 提示消息
 * @param {number} duration - 显示时长（毫秒），默认2000
 * @param {function} onClose - 关闭回调
 */
const Toast = ({ message = '', duration = 2000, onClose }) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose?.();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  if (!message) return null;

  return createPortal(
    <div className="toast-overlay">
      <div className="toast-content">
        {message}
      </div>
    </div>,
    document.body
  );
};

export default Toast;

