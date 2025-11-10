import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import './DetailViewLink.css';

/**
 * 详情查看链接组件
 * 用于显示可点击的文本，如果内容过长则截断并显示省略号，点击后查看完整内容
 * @param {string} text - 要显示的文本
 * @param {number} maxLength - 最大显示长度，超过后截断（默认30）
 * @param {string} fieldName - 字段名称（用于Modal标题）
 * @param {string} className - 额外的CSS类名
 */
const DetailViewLink = ({ text = '', maxLength = 30, fieldName = '详情', className = '' }) => {
  const [showModal, setShowModal] = useState(false);

  // 将text转换为字符串，处理null、undefined等值
  const textStr = text != null ? String(text) : '';
  
  // 如果没有文本，直接返回空
  if (!textStr || textStr.trim() === '') {
    return <span className={`detail-view-empty ${className}`}>-</span>;
  }

  const shouldTruncate = textStr.length > maxLength;
  const displayText = shouldTruncate ? textStr.substring(0, maxLength) : textStr;

  const handleCopy = () => {
    navigator.clipboard.writeText(textStr).then(() => {
      alert('已复制到剪贴板');
    }).catch(() => {
      // 降级方案：使用临时textarea
      const textarea = document.createElement('textarea');
      textarea.value = textStr;
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        alert('已复制到剪贴板');
      } catch (err) {
        alert('复制失败，请手动复制');
      }
      document.body.removeChild(textarea);
    });
  };

  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setShowModal(true);
  };

  return (
    <>
      <span 
        className={`detail-view-link ${className} ${shouldTruncate ? 'detail-view-truncated' : ''}`}
        onClick={handleClick}
        title="点击查看完整内容"
        style={{ cursor: 'pointer' }}
      >
        {displayText}
        {shouldTruncate && <span className="detail-view-ellipsis">...</span>}
      </span>

      {/* 完整内容Modal - 使用Portal渲染到body下 */}
      {showModal && createPortal(
        <div className="detail-view-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="detail-view-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="detail-view-modal-header">
              <h3>{fieldName}</h3>
              <button className="detail-view-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="detail-view-modal-body">
              <pre className="detail-view-content">{textStr}</pre>
            </div>
            <div className="detail-view-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                关闭
              </button>
              <button className="btn btn-primary" onClick={handleCopy}>
                复制内容
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default DetailViewLink;

