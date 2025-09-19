import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

// 扫码操作弹窗组件
function BarcodeScanModal({ operation, onClose, onSuccess, user }) {
  const [barcode, setBarcode] = useState('');
  const [labType, setLabType] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // 根据department_id映射到实验室类型
  const getLabTypeFromDepartment = (departmentId) => {
    // 根据实际的department_id映射规则来设置
    // 可以根据实际的部门ID进行调整
    const mapping = {
      '1': 'microscopy',  // 物化部门
      '2': 'physical_chemistry',          // 显微部门  
      '3': 'mechanics',           // 力学部门
      '4': 'physical_chemistry',  // 如果还有其他物化相关部门
      '5': 'microscopy',          // 如果还有其他显微相关部门
      '6': 'mechanics'            // 如果还有其他力学相关部门
    };
    return mapping[departmentId] || '';
  };

  // 根据实验室类型获取中文名称
  const getLabTypeName = (type) => {
    const names = {
      'mechanics': '力学实验室',
      'microscopy': '显微实验室',
      'physical_chemistry': '物化实验室'
    };
    return names[type] || type;
  };

  // 初始化实验室类型
  useEffect(() => {
    if (operation === 'receive' && user && user.department_id) {
      const mappedLabType = getLabTypeFromDepartment(user.department_id);
      if (mappedLabType) {
        setLabType(mappedLabType);
        console.log(`用户部门ID: ${user.department_id}, 映射到实验室类型: ${mappedLabType}`);
      } else {
        console.warn(`未找到部门ID ${user.department_id} 对应的实验室类型映射`);
      }
    }
  }, [operation, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!barcode.trim()) {
      alert('请扫描或输入条码');
      return;
    }

    try {
      setLoading(true);
      let result;
      
      switch (operation) {
        case 'receive':
          if (!labType) {
            alert('请选择实验室类型');
            return;
          }
          result = await api.receiveSample({ barcode, lab_type: labType, notes });
          break;
        case 'testing-completed':
          result = await api.completeTesting({ barcode, notes });
          break;
        case 'return':
          result = await api.returnSample({ barcode, notes });
          break;
        default:
          throw new Error('未知操作');
      }
      
      alert(result.message);
      onSuccess();
    } catch (e) {
      alert('操作失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (operation) {
      case 'receive': return '样品接收';
      case 'testing-completed': return '检测完成';
      case 'return': return '样品回收';
      default: return '扫码操作';
    }
  };

  const getPlaceholder = () => {
    switch (operation) {
      case 'receive': return '扫描或输入test_item_id';
      case 'testing-completed': return '扫描或输入条码';
      case 'return': return '扫描或输入条码';
      default: return '扫描或输入条码';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000
    }}>
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '8px',
        minWidth: '400px',
        maxWidth: '600px'
      }}>
        <h3>{getTitle()}</h3>
        
        <form onSubmit={handleSubmit}>
          {operation === 'receive' && (
            <div style={{ marginBottom: '16px' }}>
              <label>实验室类型 *</label>
              {user && user.role === 'admin' ? (
                // 管理员可以选择任意实验室
                <select 
                  className="input" 
                  value={labType} 
                  onChange={e => setLabType(e.target.value)}
                  required
                >
                  <option value="">请选择实验室</option>
                  <option value="mechanics">力学实验室</option>
                  <option value="microscopy">显微实验室</option>
                  <option value="physical_chemistry">物化实验室</option>
                </select>
              ) : (
                // 其他角色根据department_id自动选择，只读显示
                <div>
                  {labType ? (
                    <>
                      <input 
                        className="input" 
                        value={getLabTypeName(labType)} 
                        readOnly
                        style={{ backgroundColor: '#f8f9fa', color: '#6c757d' }}
                      />
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                        根据您的部门自动选择：{getLabTypeName(labType)}
                      </div>
                    </>
                  ) : (
                    <>
                      <input 
                        className="input" 
                        value="未找到对应的实验室类型" 
                        readOnly
                        style={{ backgroundColor: '#f8f9fa', color: '#dc3545' }}
                      />
                      <div style={{ fontSize: '12px', color: '#dc3545', marginTop: '4px' }}>
                        您的部门ID ({user?.department_id}) 未配置实验室类型映射，请联系管理员
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          
          <div style={{ marginBottom: '16px' }}>
            <label>条码扫描 *</label>
            <input 
              className="input" 
              type="text" 
              value={barcode} 
              onChange={e => setBarcode(e.target.value)}
              placeholder={getPlaceholder()}
              autoFocus
              required
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              请使用扫码枪扫描或手动输入条码
            </div>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <label>备注</label>
            <textarea 
              className="input" 
              rows="3"
              value={notes} 
              onChange={e => setNotes(e.target.value)}
              placeholder="请输入备注信息（可选）"
            />
          </div>
          
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
              disabled={loading}
            >
              取消
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading}
            >
              {loading ? '处理中...' : '确认'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SampleManagement() {
  const [samples, setSamples] = useState([]);
  const [groupedSamples, setGroupedSamples] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [labType, setLabType] = useState('');
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanOperation, setScanOperation] = useState('');
  const [viewMode, setViewMode] = useState('grouped'); // 'grouped' or 'list'
  const [user, setUser] = useState(null);
  const pageSize = 20;
  const navigate = useNavigate();

  async function load() {
    try {
      if (viewMode === 'grouped') {
        const res = await api.getSampleTrackingGrouped({ q, lab_type: labType });
        setGroupedSamples(res);
      } else {
        const res = await api.listSampleTracking({ q, page, pageSize, status, lab_type: labType });
        setSamples(res.data);
        setTotal(res.total);
      }
    } catch (e) {
      alert(e.message);
    }
  }
  
  useEffect(() => { 
    // 获取当前用户信息
    const userData = JSON.parse(localStorage.getItem('lims_user') || 'null');
    setUser(userData);
    load(); 
  }, [q, page, status, labType, viewMode]);

  const totalPages = Math.max(1, Math.ceil(total/pageSize));

  // 分组数据：按委托单号和大类分组
  const groupedItems = samples.reduce((acc, item) => {
    const key = `${item.order_id}-${item.category_name}`;
    if (!acc[key]) {
      acc[key] = {
        order_id: item.order_id,
        category_name: item.category_name,
        lab_type: item.lab_type,
        items: []
      };
    }
    acc[key].items.push(item);
    return acc;
  }, {});

  const toggleGroup = (key) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  const getStatusColor = (status) => {
    const colors = {
      'received': '#17a2b8',
      'testing_completed': '#ffc107',
      'returned': '#28a745'
    };
    return colors[status] || '#6c757d';
  };

  const getStatusText = (status) => {
    const texts = {
      'received': '已接收',
      'testing_completed': '检测完成',
      'returned': '已回收'
    };
    return texts[status] || status;
  };

  const getLabTypeText = (labType) => {
    const texts = {
      'mechanics': '力学',
      'microscopy': '显微',
      'physical_chemistry': '物化'
    };
    return texts[labType] || labType;
  };

  const openScanModal = (operation) => {
    setScanOperation(operation);
    setShowScanModal(true);
  };

  return (
    <div>
      <h2>样品管理</h2>
      
      <div className="toolbar">
        <input 
          className="input" 
          placeholder="搜索（委托单号/样品名称/材质/原号）..." 
          value={q} 
          onChange={e=>{setPage(1);setQ(e.target.value)}}
        />
        
        <select 
          className="input" 
          style={{maxWidth:150}} 
          value={labType} 
          onChange={e=>{setPage(1);setLabType(e.target.value)}}
        >
          <option value="">所有实验室</option>
          <option value="mechanics">力学实验室</option>
          <option value="microscopy">显微实验室</option>
          <option value="physical_chemistry">物化实验室</option>
        </select>
        
        {viewMode === 'list' && (
          <select 
            className="input" 
            style={{maxWidth:150}} 
            value={status} 
            onChange={e=>{setPage(1);setStatus(e.target.value)}}
          >
            <option value="">所有状态</option>
            <option value="received">已接收</option>
            <option value="testing_completed">检测完成</option>
            <option value="returned">已回收</option>
          </select>
        )}
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`btn ${viewMode === 'grouped' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('grouped')}
          >
            分组视图
          </button>
          <button 
            className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('list')}
          >
            列表视图
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button 
            className="btn btn-success" 
            onClick={() => openScanModal('receive')}
          >
            📥 样品接收
          </button>
          <button 
            className="btn btn-warning" 
            onClick={() => openScanModal('testing-completed')}
          >
            ✅ 检测完成
          </button>
          <button 
            className="btn btn-info" 
            onClick={() => openScanModal('return')}
          >
            📤 样品回收
          </button>
        </div>
      </div>

      {viewMode === 'grouped' ? (
        <div className="grouped-items">
          {groupedSamples.map((group, index) => (
            <div key={`${group.order_id}-${group.category_name}`} className="group-container">
              <div 
                className="group-header" 
                onClick={() => toggleGroup(`${group.order_id}-${group.category_name}`)}
                style={{
                  background: '#f5f5f5',
                  padding: '12px 16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 'bold'
                }}
              >
                <div>
                  <span style={{fontSize: '16px', color: '#333'}}>
                    {group.order_id} - {group.category_name}
                  </span>
                  <span style={{marginLeft: '16px', fontSize: '14px', color: '#666'}}>
                    {getLabTypeText(group.lab_type)} | {group.item_count} 项
                  </span>
                </div>
                <div style={{fontSize: '18px', color: '#666'}}>
                  {expandedGroups.has(`${group.order_id}-${group.category_name}`) ? '▼' : '▶'}
                </div>
              </div>
              
              {expandedGroups.has(`${group.order_id}-${group.category_name}`) && (
                <div className="group-content" style={{marginLeft: '20px', marginBottom: '20px'}}>
                  <div style={{ padding: '12px', background: '#f8f9fa', borderRadius: '4px' }}>
                    <p style={{ margin: '4px 0', fontSize: '13px' }}>
                      状态: {group.statuses} | 
                      首次接收: {group.first_received ? new Date(group.first_received).toLocaleString() : '-'} | 
                      最后更新: {group.last_updated ? new Date(group.last_updated).toLocaleString() : '-'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>委托单号</th><th>大类</th><th>样品名称</th><th>材质</th><th>原号</th>
                <th>实验室</th><th>状态</th><th>接收人</th><th>接收时间</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {samples.map(sample => (
                <tr key={sample.tracking_id}>
                  <td>{sample.order_id}</td>
                  <td>{sample.category_name}</td>
                  <td>{sample.sample_name || '-'}</td>
                  <td>{sample.material || '-'}</td>
                  <td>{sample.original_no || '-'}</td>
                  <td>{getLabTypeText(sample.lab_type)}</td>
                  <td>
                    <span className="badge" style={{
                      backgroundColor: getStatusColor(sample.current_status),
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px'
                    }}>
                      {getStatusText(sample.current_status)}
                    </span>
                  </td>
                  <td>{sample.received_by_name || '-'}</td>
                  <td>{sample.received_at ? new Date(sample.received_at).toLocaleString() : '-'}</td>
                  <td>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => navigate(`/sample-tracking/${sample.tracking_id}`)}
                    >
                      详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="pagination">
          <button className="btn btn-secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
          <div className="text-muted">第 {page} 页，共 {totalPages} 页</div>
          <button className="btn btn-secondary" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>下一页</button>
        </div>
      )}

      {/* 扫码操作弹窗 */}
      {showScanModal && (
        <BarcodeScanModal 
          operation={scanOperation}
          user={user}
          onClose={() => setShowScanModal(false)}
          onSuccess={() => {
            setShowScanModal(false);
            load();
          }}
        />
      )}
    </div>
  )
}
