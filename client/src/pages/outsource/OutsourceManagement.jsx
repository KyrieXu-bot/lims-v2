import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function OutsourceManagement() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState({});

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    try {
      setLoading(true);
      const data = await api.getOutsourceItems();
      setItems(data);
    } catch (e) {
      alert('加载失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(item) {
    setEditingItem(item);
    setModalData({
      outsource_supplier: item.outsource_supplier || '',
      outsource_contact: item.outsource_contact || '',
      outsource_phone: item.outsource_phone || '',
      outsource_price: item.outsource_price || '',
      outsource_status: item.outsource_status || 'pending'
    });
    setShowModal(true);
  }

  async function saveOutsourceInfo() {
    try {
      await api.updateOutsourceInfo(editingItem.test_item_id, modalData);
      alert('委外信息更新成功');
      setShowModal(false);
      loadItems();
    } catch (e) {
      alert('更新失败: ' + e.message);
    }
  }

  async function uploadReport(item) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.doc,.docx';
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          // 这里应该实现文件上传逻辑
          const reportPath = `/uploads/outsource/${item.test_item_id}_${file.name}`;
          await api.uploadOutsourceReport(item.test_item_id, reportPath);
          alert('报告上传成功');
          loadItems();
        } catch (e) {
          alert('上传失败: ' + e.message);
        }
      }
    };
    fileInput.click();
  }

  async function updateTrackingNumber(item) {
    const trackingNumber = prompt('请输入寄回快递单号:', item.return_tracking_number || '');
    if (trackingNumber !== null) {
      try {
        await api.updateTrackingNumber(item.test_item_id, trackingNumber);
        alert('快递单号更新成功');
        loadItems();
      } catch (e) {
        alert('更新失败: ' + e.message);
      }
    }
  }

  async function completeOutsource(item) {
    if (confirm('确定要完成这个委外检测吗？')) {
      try {
        await api.completeOutsource(item.test_item_id);
        alert('委外检测完成');
        loadItems();
      } catch (e) {
        alert('完成失败: ' + e.message);
      }
    }
  }

  function getStatusText(status) {
    const statusMap = {
      'pending': '待处理',
      'in_progress': '进行中',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    return statusMap[status] || status;
  }

  function getStatusColor(status) {
    const colorMap = {
      'pending': '#ffc107',
      'in_progress': '#17a2b8',
      'completed': '#28a745',
      'cancelled': '#dc3545'
    };
    return colorMap[status] || '#6c757d';
  }

  if (loading) return <div>加载中...</div>;

  return (
    <div>
      <h2>委外管理</h2>
      
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>JC号</th>
              <th>客户名称</th>
              <th>委托人</th>
              <th>付款人</th>
              <th>测试项目</th>
              <th>数量</th>
              <th>单价</th>
              <th>供应商</th>
              <th>对接人</th>
              <th>联系电话</th>
              <th>委外价格</th>
              <th>状态</th>
              <th>报告</th>
              <th>快递单号</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.test_item_id}>
                <td>{item.order_id}</td>
                <td>{item.customer_name}</td>
                <td>{item.commissioner_name}</td>
                <td>{item.payer_name}</td>
                <td>{item.detail_name}</td>
                <td>{item.quantity}</td>
                <td>{item.unit_price}</td>
                <td>{item.outsource_supplier || '-'}</td>
                <td>{item.outsource_contact || '-'}</td>
                <td>{item.outsource_phone || '-'}</td>
                <td>{item.outsource_price || '-'}</td>
                <td>
                  <span className="badge" style={{
                    backgroundColor: getStatusColor(item.outsource_status),
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px'
                  }}>
                    {getStatusText(item.outsource_status)}
                  </span>
                </td>
                <td>
                  {item.outsource_report_path ? (
                    <a href={item.outsource_report_path} target="_blank" rel="noopener noreferrer">
                      查看报告
                    </a>
                  ) : (
                    <button className="btn btn-sm btn-info" onClick={() => uploadReport(item)}>
                      上传报告
                    </button>
                  )}
                </td>
                <td>
                  {item.return_tracking_number || (
                    <button className="btn btn-sm btn-warning" onClick={() => updateTrackingNumber(item)}>
                      填写单号
                    </button>
                  )}
                </td>
                <td>
                  <div className="actions-buttons">
                    <button className="btn btn-sm btn-primary" onClick={() => openEditModal(item)}>
                      编辑
                    </button>
                    {item.outsource_status === 'completed' && (
                      <button className="btn btn-sm btn-success" onClick={() => completeOutsource(item)}>
                        完成
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 编辑委外信息模态框 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>编辑委外信息</h3>
            <div className="form-group">
              <label>供应商名称:</label>
              <input 
                type="text" 
                value={modalData.outsource_supplier}
                onChange={e => setModalData({...modalData, outsource_supplier: e.target.value})}
                className="input"
              />
            </div>
            <div className="form-group">
              <label>对接人:</label>
              <input 
                type="text" 
                value={modalData.outsource_contact}
                onChange={e => setModalData({...modalData, outsource_contact: e.target.value})}
                className="input"
              />
            </div>
            <div className="form-group">
              <label>联系电话:</label>
              <input 
                type="text" 
                value={modalData.outsource_phone}
                onChange={e => setModalData({...modalData, outsource_phone: e.target.value})}
                className="input"
              />
            </div>
            <div className="form-group">
              <label>委外价格:</label>
              <input 
                type="number" 
                step="0.01"
                value={modalData.outsource_price}
                onChange={e => setModalData({...modalData, outsource_price: e.target.value})}
                className="input"
              />
            </div>
            <div className="form-group">
              <label>状态:</label>
              <select 
                value={modalData.outsource_status}
                onChange={e => setModalData({...modalData, outsource_status: e.target.value})}
                className="input"
              >
                <option value="pending">待处理</option>
                <option value="in_progress">进行中</option>
                <option value="completed">已完成</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={saveOutsourceInfo}>
                保存
              </button>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .table-container {
          overflow-x: auto;
          margin-top: 20px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          min-width: 1200px;
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
        }
        .modal {
          background: white;
          padding: 20px;
          border-radius: 8px;
          min-width: 400px;
          max-width: 500px;
        }
        .form-group {
          margin-bottom: 15px;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
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
