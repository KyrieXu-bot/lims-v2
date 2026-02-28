import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import './OrderTransferChainModal.css';

const OrderTransferChainModal = ({ orderId, onClose, onSearchOrder }) => {
  const [loading, setLoading] = useState(true);
  const [chainData, setChainData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchChain = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getOrderTransferChain(orderId);
        setChainData(data);
      } catch (err) {
        setError(err.message || '获取转单链路失败');
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchChain();
    }
  }, [orderId]);

  const handleOrderClick = (clickedOrderId) => {
    // 如果点击的是原单号或其他单号，自动搜索该单号
    if (clickedOrderId !== orderId) {
      // 调用父组件传入的搜索回调函数
      if (onSearchOrder) {
        onSearchOrder(clickedOrderId);
      }
      onClose();
    }
  };

  if (!orderId) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content order-transfer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>转单链路</h3>
          <button className="modal-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>加载中...</p>
            </div>
          )}
          
          {error && (
            <div className="error-state">
              <p className="error-message">❌ {error}</p>
            </div>
          )}
          
          {!loading && !error && chainData && (
            <div className="transfer-chain-content">
              <div className="chain-info">
                <p className="info-text">
                  <strong>当前单号：</strong>
                  <span className="highlight-order">{chainData.currentOrderId}</span>
                </p>
                {chainData.chain.length > 1 && (
                  <p className="info-text">
                    <strong>根单号：</strong>
                    <span className="root-order">{chainData.rootOrderId}</span>
                  </p>
                )}
              </div>

              <div className="chain-visualization">
                <h4>转单链路：</h4>
                <div className="chain-flow">
                  {chainData.chain.map((orderIdInChain, index) => (
                    <React.Fragment key={orderIdInChain}>
                      <div 
                        className={`chain-node ${orderIdInChain === chainData.currentOrderId ? 'current' : ''}`}
                        onClick={() => handleOrderClick(orderIdInChain)}
                        title={orderIdInChain === chainData.currentOrderId ? '当前单号' : '点击查看此单号'}
                      >
                        <div className="node-label">
                          {index === 0 ? '原单号' : `转单 ${index}`}
                        </div>
                        <div className="node-order-id">
                          {orderIdInChain}
                        </div>
                        {orderIdInChain === chainData.currentOrderId && (
                          <div className="current-badge">当前</div>
                        )}
                      </div>
                      {index < chainData.chain.length - 1 && (
                        <div className="chain-arrow">→</div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {chainData.history && chainData.history.length > 0 && (
                <div className="transfer-history">
                  <h4>转单历史：</h4>
                  <div className="history-list">
                    {chainData.history.map((record) => (
                      <div key={record.history_id} className="history-item">
                        <div className="history-main">
                          <span 
                            className="history-from clickable-order-id" 
                            onClick={() => handleOrderClick(record.previous_order_id)}
                            title="点击搜索此单号"
                          >
                            {record.previous_order_id}
                          </span>
                          <span className="history-arrow">→</span>
                          <span 
                            className="history-to clickable-order-id" 
                            onClick={() => handleOrderClick(record.order_id)}
                            title="点击搜索此单号"
                          >
                            {record.order_id}
                          </span>
                        </div>
                        <div className="history-meta">
                          <span className="history-date">
                            {new Date(record.transfer_date).toLocaleDateString('zh-CN')}
                          </span>
                          <span className="history-creator">
                            操作人：{record.creator_name || record.created_by}
                          </span>
                        </div>
                        {record.note && (
                          <div className="history-note">
                            备注：{record.note}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default OrderTransferChainModal;
