import React, { useState } from 'react';
import Toast from './Toast';
import './ReadonlyNoteField.css';

/**
 * 只读备注字段组件
 * 用于显示不能编辑但需要查看完整内容的长文本
 * @param {string} text - 要显示的文本
 * @param {number} maxLength - 最大显示长度，超过后截断
 * @param {string} fieldName - 字段名称（用于Modal标题）
 */
const ReadonlyNoteField = ({ text = '', maxLength = 50, fieldName = '备注' }) => {
  const [showModal, setShowModal] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // 如果没有文本，直接返回空
  if (!text || text.trim() === '') {
    return <span className="readonly-field-empty">-</span>;
  }

  const shouldTruncate = text.length > maxLength;
  const displayText = shouldTruncate ? text.substring(0, maxLength) : text;

  const handleCopy = async () => {
    try {
      // 优先使用现代 Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setShowToast(true);
        return;
      }
    } catch (err) {
      console.warn('Clipboard API failed, trying fallback:', err);
    }

    // 降级方案：使用临时textarea
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.setAttribute('readonly', '');
      document.body.appendChild(textarea);
      
      // 对于iOS Safari，需要设置可编辑
      if (navigator.userAgent.match(/ipad|iphone/i)) {
        textarea.contentEditable = true;
        textarea.readOnly = false;
        const range = document.createRange();
        range.selectNodeContents(textarea);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        textarea.setSelectionRange(0, 999999);
      } else {
        textarea.select();
        textarea.setSelectionRange(0, 999999);
      }
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        setShowToast(true);
      } else {
        alert('复制失败，请手动复制');
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
      alert('复制失败，请手动复制');
    }
  };

  return (
    <>
      <span className="readonly-field-note">
        {displayText}
        {shouldTruncate && (
          <>
            <span className="readonly-note-ellipsis">...</span>
            <button
              className="readonly-note-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setShowModal(true);
              }}
              title="点击查看完整内容"
            >
              查看更多
            </button>
          </>
        )}
      </span>

      {/* 完整内容Modal */}
      {showModal && (
        <div className="readonly-note-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="readonly-note-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="readonly-note-modal-header">
              <h3>{fieldName}</h3>
              <button className="readonly-note-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="readonly-note-modal-body">
              <pre className="readonly-note-content">{text}</pre>
            </div>
            <div className="readonly-note-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                关闭
              </button>
              <button className="btn btn-primary" onClick={handleCopy}>
                复制内容
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast提示 */}
      {showToast && (
        <Toast 
          message="复制成功" 
          duration={2000} 
          onClose={() => setShowToast(false)} 
        />
      )}
    </>
  );
};

export default ReadonlyNoteField;


