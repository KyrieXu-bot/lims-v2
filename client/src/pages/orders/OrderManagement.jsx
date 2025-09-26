import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function OrderManagement() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState([]);
  const [showDetails, setShowDetails] = useState(false);
  const [orderType, setOrderType] = useState('internal'); // internal or outsource
  const [stats, setStats] = useState({});

  useEffect(() => {
    loadOrders();
    loadStats();
  }, []);

  async function loadOrders() {
    try {
      setLoading(true);
      const data = await api.getOrders();
      setOrders(data);
    } catch (e) {
      alert('加载失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const data = await api.getOrderStats();
      setStats(data);
    } catch (e) {
      console.error('加载统计失败:', e.message);
    }
  }

  async function showOrderDetails(order, type) {
    try {
      setSelectedOrder(order);
      setOrderType(type);
      setLoading(true);
      
      let details;
      if (type === 'internal') {
        details = await api.getInternalOrderDetails(order.order_id);
      } else {
        details = await api.getOutsourceOrderDetails(order.order_id);
      }
      
      setOrderDetails(details);
      setShowDetails(true);
    } catch (e) {
      alert('加载详情失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateSettlementStatus(orderId, status) {
    try {
      await api.updateSettlementStatus(orderId, status);
      alert('结算状态更新成功');
      loadOrders();
    } catch (e) {
      alert('更新失败: ' + e.message);
    }
  }

  function getSettlementStatusText(status) {
    const statusMap = {
      'unpaid': '未付款',
      'paid': '已付款',
      'partial': '部分付款'
    };
    return statusMap[status] || status;
  }

  function getSettlementStatusColor(status) {
    const colorMap = {
      'unpaid': '#dc3545',
      'paid': '#28a745',
      'partial': '#ffc107'
    };
    return colorMap[status] || '#6c757d';
  }

  if (loading && !showDetails) return <div>加载中...</div>;

  return (
    <div>
      <h2>委托单管理</h2>
      
      {/* 统计信息 */}
      <div className="stats-container">
        <div className="stat-card">
          <h4>总委托单数</h4>
          <p>{stats.total_orders || 0}</p>
        </div>
        <div className="stat-card">
          <h4>内部检测项目</h4>
          <p>{stats.internal_items || 0}</p>
        </div>
        <div className="stat-card">
          <h4>委外检测项目</h4>
          <p>{stats.outsource_items || 0}</p>
        </div>
        <div className="stat-card">
          <h4>内部金额</h4>
          <p>¥{Number(stats.internal_amount || 0).toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <h4>委外金额</h4>
          <p>¥{Number(stats.outsource_amount || 0).toFixed(2)}</p>
        </div>
        <div className="stat-card">
          <h4>已付款</h4>
          <p>{stats.paid_orders || 0}</p>
        </div>
        <div className="stat-card">
          <h4>未付款</h4>
          <p>{stats.unpaid_orders || 0}</p>
        </div>
      </div>

      {/* 委托单列表 */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>JC号</th>
              <th>客户名称</th>
              <th>委托人</th>
              <th>付款人</th>
              <th>总金额</th>
              <th>折扣后金额</th>
              <th>检测项目数</th>
              <th>总数量</th>
              <th>委外项目</th>
              <th>结算状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order.order_id}>
                <td>{order.order_id}</td>
                <td>{order.customer_name}</td>
                <td>{order.commissioner_name}</td>
                <td>{order.payer_name}</td>
                <td>¥{Number(order.total_amount || 0).toFixed(2)}</td>
                <td>¥{Number(order.discounted_amount || 0).toFixed(2)}</td>
                <td>{order.test_item_count || 0}</td>
                <td>{order.total_quantity || 0}</td>
                <td>
                  {order.outsource_count > 0 ? (
                    <div>
                      <span className="badge" style={{
                        backgroundColor: '#ffc107',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '11px'
                      }}>
                        {order.outsource_count}项
                      </span>
                      <div style={{fontSize: '11px', color: '#666', marginTop: '2px'}}>
                        {order.outsource_items || ''}
                      </div>
                    </div>
                  ) : (
                    <span style={{color: '#999'}}>无</span>
                  )}
                </td>
                <td>
                  <span className="badge" style={{
                    backgroundColor: getSettlementStatusColor(order.settlement_status),
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px'
                  }}>
                    {getSettlementStatusText(order.settlement_status)}
                  </span>
                </td>
                <td>{new Date(order.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="actions-buttons">
                    <button 
                      className="btn btn-sm btn-primary" 
                      onClick={() => showOrderDetails(order, 'internal')}
                    >
                      内部详情
                    </button>
                    <button 
                      className="btn btn-sm btn-info" 
                      onClick={() => showOrderDetails(order, 'outsource')}
                    >
                      委外详情
                    </button>
                    <select 
                      className="btn btn-sm btn-secondary"
                      value={order.settlement_status}
                      onChange={e => updateSettlementStatus(order.order_id, e.target.value)}
                    >
                      <option value="unpaid">未付款</option>
                      <option value="partial">部分付款</option>
                      <option value="paid">已付款</option>
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 委托单详情模态框 */}
      {showDetails && (
        <div className="modal-overlay" onClick={() => setShowDetails(false)}>
          <div className="modal large-modal" onClick={e => e.stopPropagation()}>
            <h3>
              {orderType === 'internal' ? '内部委托详情' : '委外委托详情'} - {selectedOrder?.order_id}
            </h3>
            
            {loading ? (
              <div>加载中...</div>
            ) : (
              <div className="details-container">
                <div className="order-info">
                  <h4>委托单信息</h4>
                  <div className="info-grid">
                    <div><strong>JC号:</strong> {selectedOrder?.order_id}</div>
                    <div><strong>客户名称:</strong> {selectedOrder?.customer_name}</div>
                    <div><strong>委托人:</strong> {selectedOrder?.commissioner_name}</div>
                    <div><strong>付款人:</strong> {selectedOrder?.payer_name}</div>
                    <div><strong>总金额:</strong> ¥{Number(selectedOrder?.total_amount || 0).toFixed(2)}</div>
                    <div><strong>折扣后金额:</strong> ¥{Number(selectedOrder?.discounted_amount || 0).toFixed(2)}</div>
                    <div><strong>结算状态:</strong> {getSettlementStatusText(selectedOrder?.settlement_status)}</div>
                  </div>
                </div>

                <div className="items-table">
                  <h4>检测项目详情</h4>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>项目ID</th>
                        <th>细项</th>
                        <th>代码</th>
                        <th>数量</th>
                        <th>单价</th>
                        {orderType === 'internal' && <th>折扣后单价</th>}
                        <th>状态</th>
                        {orderType === 'internal' && <th>执行人</th>}
                        {orderType === 'internal' && <th>负责人</th>}
                        {orderType === 'internal' && <th>实验员</th>}
                        {orderType === 'outsource' && <th>供应商</th>}
                        {orderType === 'outsource' && <th>对接人</th>}
                        {orderType === 'outsource' && <th>联系电话</th>}
                        {orderType === 'outsource' && <th>委外价格</th>}
                        {orderType === 'outsource' && <th>委外状态</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {orderDetails.map(item => (
                        <tr key={item.test_item_id}>
                          <td>{item.test_item_id}</td>
                          <td>{item.detail_name}</td>
                          <td>{item.test_code}</td>
                          <td>{item.quantity}</td>
                          <td>¥{Number(item.unit_price || 0).toFixed(2)}</td>
                          {orderType === 'internal' && (
                            <td>¥{Number(item.discounted_unit_price || 0).toFixed(2)}</td>
                          )}
                          <td>
                            <span className="badge status-badge">
                              {item.status}
                            </span>
                          </td>
                          {orderType === 'internal' && (
                            <>
                              <td>{item.supervisor_name || '-'}</td>
                              <td>{item.supervisor_name || '-'}</td>
                              <td>{item.technician_name || '-'}</td>
                            </>
                          )}
                          {orderType === 'outsource' && (
                            <>
                              <td>{item.outsource_supplier || '-'}</td>
                              <td>{item.outsource_contact || '-'}</td>
                              <td>{item.outsource_phone || '-'}</td>
                              <td>¥{Number(item.outsource_price || 0).toFixed(2)}</td>
                              <td>
                                <span className="badge" style={{
                                  backgroundColor: item.outsource_status === 'completed' ? '#28a745' : '#ffc107',
                                  color: 'white',
                                  padding: '2px 6px',
                                  borderRadius: '3px'
                                }}>
                                  {item.outsource_status || 'pending'}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDetails(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .stats-container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 15px;
          margin-bottom: 30px;
        }
        .stat-card {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          text-align: center;
          border: 1px solid #dee2e6;
        }
        .stat-card h4 {
          margin: 0 0 10px 0;
          font-size: 14px;
          color: #6c757d;
        }
        .stat-card p {
          margin: 0;
          font-size: 24px;
          font-weight: bold;
          color: #495057;
        }
        .table-container {
          overflow-x: auto;
          margin-top: 20px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1000px;
        }
        .table th,
        .table td {
          border: 1px solid #dee2e6;
          padding: 8px 12px;
          text-align: left;
        }
        .table th {
          background: #f8f9fa;
          font-weight: 600;
        }
        .table tbody tr:hover {
          background: #f8f9fa;
        }
        .actions-buttons {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .actions-buttons .btn {
          font-size: 12px;
          padding: 4px 8px;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal {
          background: white;
          padding: 20px;
          border-radius: 8px;
          min-width: 400px;
          max-width: 90vw;
          max-height: 90vh;
          overflow-y: auto;
        }
        .large-modal {
          min-width: 800px;
          max-width: 95vw;
        }
        .details-container {
          margin-top: 20px;
        }
        .order-info {
          margin-bottom: 30px;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 8px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 10px;
          margin-top: 10px;
        }
        .items-table {
          overflow-x: auto;
        }
        .items-table .table {
          min-width: 800px;
        }
        .status-badge {
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 11px;
          background: #6c757d;
          color: white;
        }
        .modal-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 20px;
        }
      `}</style>
    </div>
  );
}
