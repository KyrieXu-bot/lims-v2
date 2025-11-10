import { useState } from 'react';
import { api } from '../../api';

export default function OrderDelete() {
  const [orderId, setOrderId] = useState('');
  const [orderInfo, setOrderInfo] = useState(null);
  const [testItems, setTestItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 查询委托单信息
  async function fetchOrderInfo() {
    if (!orderId.trim()) {
      setError('请输入委托单号');
      setOrderInfo(null);
      setTestItems([]);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const order = await api.getOrder(orderId.trim());
      setOrderInfo(order);
      
      // 获取检测项目列表
      const items = await api.listTestItems({ order_id: orderId.trim(), pageSize: 1000 });
      setTestItems(items.data || items || []);
    } catch (e) {
      setError('委托单不存在或查询失败: ' + e.message);
      setOrderInfo(null);
      setTestItems([]);
    } finally {
      setLoading(false);
    }
  }

  // 删除委托单
  async function handleDelete() {
    if (!orderInfo || !orderId.trim()) {
      setError('请先查询并确认委托单信息');
      return;
    }

    const confirmed = window.confirm(
      `确定要删除委托单 ${orderId} 吗？\n\n` +
      `此操作将删除委托单及其所有关联数据，包括：\n` +
      `- 检测项目 (test_items)\n` +
      `- 分配记录 (assignments)\n` +
      `- 委外信息 (outsource_info)\n` +
      `- 样品信息 (samples)\n` +
      `- 报告设置 (reports)\n` +
      `- 样品处置信息 (sample_handling)\n` +
      `- 样品要求 (sample_requirements)\n` +
      `- 样品追踪 (sample_tracking)\n` +
      `- 附件文件 (project_files)\n\n` +
      `此操作不可恢复！`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      setError('');
      setSuccess('');
      await api.deleteOrder(orderId.trim());
      setSuccess(`委托单 ${orderId} 及其关联数据已成功删除`);
      setOrderInfo(null);
      setTestItems([]);
      setOrderId('');
    } catch (e) {
      setError('删除失败: ' + e.message);
    } finally {
      setDeleting(false);
    }
  }

  // 处理回车键查询
  function handleKeyPress(e) {
    if (e.key === 'Enter') {
      fetchOrderInfo();
    }
  }

  return (
    <div className="order-delete-container">
      <h2>删除委托单</h2>
      
      <div className="delete-form">
        <div className="form-group">
          <label htmlFor="orderId">委托单号</label>
          <div className="input-group">
            <input
              id="orderId"
              type="text"
              className="form-control"
              placeholder="请输入委托单号（如：JC2504001）"
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setOrderInfo(null);
                setTestItems([]);
                setError('');
                setSuccess('');
              }}
              onKeyPress={handleKeyPress}
              disabled={deleting}
            />
            <button
              className="btn btn-primary"
              onClick={fetchOrderInfo}
              disabled={loading || deleting || !orderId.trim()}
            >
              {loading ? '查询中...' : '查询'}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger">
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            {success}
          </div>
        )}

        {orderInfo && (
          <div className="order-info-card">
            <h3>委托单信息确认</h3>
            
            {/* 检测项目列表 - 放在开头 */}
            {testItems.length > 0 && (
              <div className="test-items-section">
                <h4>检测项目 ({testItems.length}项)</h4>
                <div className="test-items-list">
                  {testItems.map((item, index) => (
                    <div key={item.test_item_id || index} className="test-item">
                      <span className="test-item-number">{index + 1}.</span>
                      <span className="test-item-name">{item.detail_name || item.category_name || '-'}</span>
                      {item.test_code && (
                        <span className="test-item-code">({item.test_code})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 委托单基本信息 */}
            <div className="info-grid">
              <div className="info-item">
                <strong>委托单号:</strong> {orderInfo.order_id}
              </div>
              <div className="info-item">
                <strong>客户名称:</strong> {orderInfo.customer_name || '-'}
              </div>
              <div className="info-item">
                <strong>委托人:</strong> {orderInfo.commissioner_name || '-'}
              </div>
              <div className="info-item">
                <strong>付款人:</strong> {orderInfo.payer_name || '-'}
              </div>
              <div className="info-item">
                <strong>总价:</strong> ¥{Number(orderInfo.total_price || 0).toFixed(2)}
              </div>
              <div className="info-item">
                <strong>结算状态:</strong> {
                  orderInfo.settlement_status === 'paid' ? '已付款' :
                  orderInfo.settlement_status === 'partial' ? '部分付款' :
                  '未付款'
                }
              </div>
              <div className="info-item">
                <strong>创建时间:</strong> {new Date(orderInfo.created_at).toLocaleString()}
              </div>
            </div>
            
            <div className="warning-box">
              <strong>⚠️ 警告：</strong>
              <p>删除委托单将同时删除以下所有关联数据：</p>
              <ul>
                <li>检测项目 (test_items)</li>
                <li>分配记录 (assignments)</li>
                <li>委外信息 (outsource_info)</li>
                <li>样品信息 (samples)</li>
                <li>报告设置 (reports)</li>
                <li>样品处置信息 (sample_handling)</li>
                <li>样品要求 (sample_requirements)</li>
                <li>样品追踪 (sample_tracking)</li>
                <li>附件文件 (project_files)</li>
              </ul>
              <p><strong>此操作不可恢复！</strong></p>
            </div>

            <div className="action-buttons">
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setOrderInfo(null);
                  setTestItems([]);
                  setOrderId('');
                  setError('');
                  setSuccess('');
                }}
                disabled={deleting}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .order-delete-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }

        .order-delete-container h2 {
          margin-bottom: 30px;
          color: #dc3545;
        }

        .delete-form {
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          color: #495057;
        }

        .input-group {
          display: flex;
          gap: 10px;
        }

        .input-group .form-control {
          flex: 1;
          padding: 10px;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-size: 16px;
        }

        .input-group .form-control:focus {
          outline: none;
          border-color: #80bdff;
          box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
        }

        .input-group .btn {
          padding: 10px 20px;
          white-space: nowrap;
        }

        .alert {
          padding: 12px 16px;
          border-radius: 4px;
          margin-bottom: 20px;
        }

        .alert-danger {
          background-color: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }

        .alert-success {
          background-color: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
        }

        .order-info-card {
          margin-top: 30px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #dee2e6;
        }

        .order-info-card h3 {
          margin-top: 0;
          margin-bottom: 20px;
          color: #495057;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
          margin-bottom: 25px;
        }

        .info-item {
          padding: 10px;
          background: white;
          border-radius: 4px;
          border: 1px solid #dee2e6;
        }

        .info-item strong {
          color: #6c757d;
          margin-right: 8px;
        }

        .test-items-section {
          margin-bottom: 25px;
          padding: 15px;
          background: white;
          border-radius: 4px;
          border: 1px solid #dee2e6;
        }

        .test-items-section h4 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #495057;
          font-size: 16px;
        }

        .test-items-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 300px;
          overflow-y: auto;
          padding-right: 5px;
        }

        .test-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #f8f9fa;
          border-radius: 4px;
          border-left: 3px solid #007bff;
        }

        .test-item-number {
          color: #6c757d;
          font-weight: 600;
          min-width: 24px;
        }

        .test-item-name {
          flex: 1;
          color: #495057;
          font-weight: 500;
        }

        .test-item-code {
          color: #6c757d;
          font-size: 13px;
        }

        .warning-box {
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
          padding: 15px;
          margin-bottom: 20px;
        }

        .warning-box strong {
          color: #856404;
          display: block;
          margin-bottom: 10px;
        }

        .warning-box p {
          margin: 8px 0;
          color: #856404;
        }

        .warning-box ul {
          margin: 10px 0;
          padding-left: 20px;
          color: #856404;
        }

        .warning-box li {
          margin: 5px 0;
        }

        .action-buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-danger {
          background-color: #dc3545;
          color: white;
        }

        .btn-danger:hover:not(:disabled) {
          background-color: #c82333;
        }

        .btn-secondary {
          background-color: #6c757d;
          color: white;
        }

        .btn-secondary:hover:not(:disabled) {
          background-color: #5a6268;
        }

        .btn-primary {
          background-color: #007bff;
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background-color: #0056b3;
        }
      `}</style>
    </div>
  );
}

