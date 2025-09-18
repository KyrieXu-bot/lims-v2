import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

// 批量分配弹窗组件
function BatchAssignModal({ selectedItems, user, onClose, onSuccess }) {
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    loadAssigneeOptions();
  }, []);

  const loadAssigneeOptions = async () => {
    try {
      setLoadingOptions(true);
      let options = [];
          
      if (user.role === 'leader') {
        
        if (!user.department_id) {
          // 临时解决方案：通过group_id查询department_id
          console.log('department_id不存在，尝试通过group_id查询');
          const departmentId = await api.getDepartmentIdByGroupId(user.group_id);
          if (departmentId) {
            options = await api.getSupervisorsByDepartment(departmentId);
          } else {
            alert('无法确定部门信息，请联系管理员设置department_id');
            return;
          }
        } else {
          options = await api.getSupervisorsByDepartment(user.department_id);
        }
      } else if (user.role === 'supervisor') {
        // 组长：获取该小组的所有实验员
        options = await api.getEmployeesByGroup(user.group_id);
      }
      
      setAssigneeOptions(options);
    } catch (e) {
      alert('获取分配选项失败: ' + e.message);
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAssignee) {
      alert('请选择分配对象');
      return;
    }

    try {
      setLoading(true);
      const newStatus = user.role === 'leader' ? 'assigned' : 'running';
      const assignField = user.role === 'leader' ? 'supervisor_id' : 'technician_id';
      
      await api.batchAssignTestItems({
        testItemIds: selectedItems,
        [assignField]: selectedAssignee,
        status: newStatus
      });
      
      alert('批量分配成功');
      onSuccess();
    } catch (e) {
      alert('批量分配失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (user.role === 'leader') return '批量分配给组长';
    if (user.role === 'supervisor') return '批量分配给实验员';
    return '批量分配';
  };

  const getAssigneeLabel = () => {
    if (user.role === 'leader') return '选择组长';
    if (user.role === 'supervisor') return '选择实验员';
    return '选择分配对象';
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
        <p>已选择 {selectedItems.length} 个项目进行分配</p>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label>{getAssigneeLabel()}</label>
            {loadingOptions ? (
              <div>加载中...</div>
            ) : (
              <select 
                className="input" 
                value={selectedAssignee} 
                onChange={e => setSelectedAssignee(e.target.value)}
                required
              >
                <option value="">请选择</option>
                {assigneeOptions.map(option => (
                  <option key={option.user_id} value={option.user_id}>
                    {option.name} ({option.account})
                  </option>
                ))}
              </select>
            )}
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
              disabled={loading || !selectedAssignee}
            >
              {loading ? '分配中...' : '确认分配'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TestItems() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [showBatchAssignModal, setShowBatchAssignModal] = useState(false);
  const [user, setUser] = useState(null);
  const pageSize = 20;
  const navigate = useNavigate();

  async function load() {
    try {
      const res = await api.listTestItems({ q, page, pageSize, status });
      setItems(res.data);
      setTotal(res.total);
    } catch (e) {
      alert(e.message);
      navigate('/login');
    }
  }
  
  useEffect(()=>{ 
    // 获取当前用户信息
    const userData = JSON.parse(localStorage.getItem('lims_user') || 'null');
    setUser(userData);
    load(); 
  }, [q, page, status]);

  const totalPages = Math.max(1, Math.ceil(total/pageSize));

  // 分组数据：按委托单号和大类分组
  const groupedItems = items.reduce((acc, item) => {
    const key = `${item.order_id}-${item.category_name}`;
    if (!acc[key]) {
      acc[key] = {
        order_id: item.order_id,
        category_name: item.category_name,
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
      'new': '#6c757d',
      'assigned': '#17a2b8',
      'running': '#ffc107',
      'waiting_review': '#fd7e14',
      'report_uploaded': '#20c997',
      'completed': '#28a745',
      'cancelled': '#dc3545'
    };
    return colors[status] || '#6c757d';
  };

  const getStatusText = (status) => {
    const texts = {
      'new': '新建',
      'assigned': '已分配',
      'running': '进行中',
      'waiting_review': '待审核',
      'report_uploaded': '已传报告',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    return texts[status] || status;
  };

  const getArrivalModeText = (mode) => {
    const texts = {
      'on_site': '现场',
      'delivery': '寄样'
    };
    return texts[mode] || mode || '-';
  };

  const getSampleArrivalStatusText = (status) => {
    // 如果已经是中文，直接返回；如果是英文，则转换
    const texts = {
      'arrived': '已到',
      'not_arrived': '未到',
      'partial_arrived': '部分到达',
      '已到': '已到',
      '未到': '未到',
      '部分到达': '部分到达'
    };
    return texts[status] || status || '-';
  };

  // 多选框相关函数
  const toggleItemSelection = (itemId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const toggleGroupSelection = (groupItems) => {
    const groupItemIds = groupItems.map(item => item.test_item_id);
    const allSelected = groupItemIds.every(id => selectedItems.has(id));
    
    const newSelected = new Set(selectedItems);
    if (allSelected) {
      // 取消选择该组所有项目
      groupItemIds.forEach(id => newSelected.delete(id));
    } else {
      // 选择该组所有项目
      groupItemIds.forEach(id => newSelected.add(id));
    }
    setSelectedItems(newSelected);
  };

  const selectAll = () => {
    const allItemIds = items.map(item => item.test_item_id);
    setSelectedItems(new Set(allItemIds));
  };

  const clearSelection = () => {
    setSelectedItems(new Set());
  };

  // 检查是否有选中的项目
  const hasSelectedItems = selectedItems.size > 0;

  // 检查当前用户是否可以批量分配
  const canBatchAssign = user && (user.role === 'leader' || user.role === 'supervisor');

  // 角色权限与动作
  const canEdit = (user && (user.role === 'admin' || user.role === 'leader'));
  const canDelete = canEdit;

  const canReview = (item) => user && user.role === 'supervisor' && item.status === 'waiting_review';
  const canAssignSingle = (item) => user && user.role === 'supervisor' && item.status === 'assigned';
  const canCompleteBySupervisor = (item) => user && user.role === 'supervisor' && item.status === 'running' && item.supervisor_id === user.user_id;
  const canCompleteByEmployee = (item) => user && user.role === 'employee' && item.status === 'running';
  const canDeliverBySales = (item) => user && user.role === 'sales' && item.status === 'report_uploaded';
  const canTransfer = (item) => user && user.role === 'admin' && item.sample_arrival_status === 'not_arrived';

  async function handleUpdateStatus(id, status) {
    await api.updateTestItem(id, { status });
    load();
  }

  async function handleTransfer(id) {
    if (confirm('确定要将样品状态改为已到吗？流转后其他角色将能看到此项目。')) {
      await api.updateTestItem(id, { sample_arrival_status: 'arrived' });
      load();
    }
  }

  function openAssignForOne(id) {
    setSelectedItems(new Set([id]));
    setShowBatchAssignModal(true);
  }

  return (
    <div>
      <h2>检测项目处理</h2>
      <style>{`
        .grouped-items .group-header:hover {
          background: #e9ecef !important;
        }
        .grouped-items .group-content .table {
          margin: 0;
          border: 1px solid #dee2e6;
        }
        .grouped-items .group-content .table th {
          background: #f8f9fa;
          font-size: 13px;
          padding: 8px 12px;
        }
        .grouped-items .group-content .table td {
          padding: 8px 12px;
          font-size: 13px;
        }
        .grouped-items .group-content .table tbody tr:hover {
          background: #f8f9fa;
        }
        .status-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          color: white;
          font-weight: 500;
        }
      `}</style>
      <div className="toolbar">
        <input className="input" placeholder="搜索（大类/细项/代码/委托单号）..." value={q} onChange={e=>{setPage(1);setQ(e.target.value)}}/>
        <select className="input" style={{maxWidth:200}} value={status} onChange={e=>{setPage(1);setStatus(e.target.value)}}>
          <option value="">所有状态</option>
          <option value="new">新建</option>
          <option value="assigned">已分配</option>
          <option value="running">进行中</option>
          <option value="waiting_review">待审核</option>
          <option value="report_uploaded">已传报告</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
        <button className="btn btn-primary" onClick={()=>navigate('/test-items/new')}>+ 新增项目</button>
        {canBatchAssign && (
          <>
            <button className="btn btn-secondary" onClick={selectAll}>全选</button>
            <button className="btn btn-secondary" onClick={clearSelection}>取消选择</button>
            <button 
              className={`btn ${hasSelectedItems ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowBatchAssignModal(true)}
              disabled={!hasSelectedItems}
            >
              批量分配 ({selectedItems.size})
            </button>
          </>
        )}
        <button className="btn btn-secondary" onClick={()=>{
          const allKeys = Object.keys(groupedItems);
          if (expandedGroups.size === allKeys.length) {
            setExpandedGroups(new Set());
          } else {
            setExpandedGroups(new Set(allKeys));
          }
        }}>
          {expandedGroups.size === Object.keys(groupedItems).length ? '全部收起' : '全部展开'}
        </button>
      </div>
      <div className="grouped-items">
        {Object.entries(groupedItems).map(([key, group]) => (
          <div key={key} className="group-container">
            <div 
              className="group-header" 
              onClick={() => toggleGroup(key)}
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
                  ({group.items.length} 项)
                </span>
              </div>
              <div style={{fontSize: '18px', color: '#666'}}>
                {expandedGroups.has(key) ? '▼' : '▶'}
              </div>
            </div>
            
            {expandedGroups.has(key) && (
              <div className="group-content" style={{marginLeft: '20px', marginBottom: '20px'}}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>
                        {canBatchAssign && (
                          <input 
                            type="checkbox" 
                            checked={group.items.every(item => selectedItems.has(item.test_item_id))}
                            onChange={() => toggleGroupSelection(group.items)}
                          />
                        )}
                      </th>
                      <th>ID</th><th>细项</th><th>代码</th><th>执行部门</th><th>执行小组</th><th>数量</th><th>单价</th><th>到达方式</th><th>样品状态</th><th>状态</th><th>执行人</th><th>负责人</th><th>实验员</th><th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(it => (
                      <tr key={it.test_item_id}>
                        <td>
                          {canBatchAssign && (
                            <input 
                              type="checkbox" 
                              checked={selectedItems.has(it.test_item_id)}
                              onChange={() => toggleItemSelection(it.test_item_id)}
                            />
                          )}
                        </td>
                        <td>{it.test_item_id}</td>
                        <td>{it.detail_name}</td>
                        <td>{it.test_code}</td>
                        <td>{it.department_id}</td>
                        <td>{it.group_id}</td>
                        <td>{it.quantity}</td>
                        <td>{it.unit_price}</td>
                        <td>{getArrivalModeText(it.arrival_mode)}</td>
                        <td>{getSampleArrivalStatusText(it.sample_arrival_status)}</td>
                        <td>
                          <span className={`badge status-${it.status}`} style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            backgroundColor: getStatusColor(it.status),
                            color: 'white'
                          }}>
                            {getStatusText(it.status)}
                          </span>
                        </td>
                        <td>{it.current_assignee ? `${it.assignee_name||''}（${it.current_assignee}）` : ''}</td>
                        <td>{it.supervisor_id ? `${it.supervisor_name||''}（${it.supervisor_id}）` : ''}</td>
                        <td>{it.technician_id ? `${it.technician_name||''}（${it.technician_id}）` : ''}</td>
                        <td className="actions" style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                          {/* 查看：所有人都有，使用编辑页只读方式，可后续实现。暂以编辑替代查看入口 */}
                          <button className="btn btn-secondary btn-sm" onClick={()=>navigate(`/test-items/${it.test_item_id}?view=1`)}>查看</button>

                          {/* 编辑：管理员、室主任 */}
                          {canEdit && (
                            <button className="btn btn-primary btn-sm" onClick={()=>navigate(`/test-items/${it.test_item_id}`)}>编辑</button>
                          )}

                          {/* 删除：管理员、室主任 */}
                          {canDelete && (
                            <button className="btn btn-danger btn-sm" onClick={async ()=>{ if (confirm('确定要删除这个检测项目吗？')) { await api.deleteTestItem(it.test_item_id); load(); }}}>删除</button>
                          )}

                          {/* 审核：组长，状态=待审核 */}
                          {canReview(it) && (
                            <button className="btn btn-primary btn-sm" onClick={()=>handleUpdateStatus(it.test_item_id, 'report_uploaded')}>审核通过</button>
                          )}

                          {/* 指派：组长，状态=已分配（打开单项分配弹窗）*/}
                          {canAssignSingle(it) && (
                            <button className="btn btn-primary btn-sm" onClick={()=>openAssignForOne(it.test_item_id)}>指派</button>
                          )}

                          {/* 完成：组长，状态=进行中 且 指派给自己 */}
                          {canCompleteBySupervisor(it) && (
                            <button className="btn btn-success btn-sm" onClick={()=>handleUpdateStatus(it.test_item_id, 'completed')}>完成</button>
                          )}

                          {/* 完成：实验员，状态=进行中 */}
                          {canCompleteByEmployee(it) && (
                            <button className="btn btn-success btn-sm" onClick={()=>handleUpdateStatus(it.test_item_id, 'completed')}>完成</button>
                          )}

                          {/* 交付：业务员，状态=已传报告 */}
                          {canDeliverBySales(it) && (
                            <button className="btn btn-info btn-sm" onClick={()=>handleUpdateStatus(it.test_item_id, 'completed')}>交付</button>
                          )}

                          {/* 流转：管理员，样品状态=未到 */}
                          {canTransfer(it) && (
                            <button className="btn btn-warning btn-sm" onClick={()=>handleTransfer(it.test_item_id)}>流转</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="pagination">
        <button className="btn btn-secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
        <div className="text-muted">第 {page} 页，共 {totalPages} 页</div>
        <button className="btn btn-secondary" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>下一页</button>
      </div>

      {/* 批量分配弹窗 */}
      {showBatchAssignModal && (
        <BatchAssignModal 
          selectedItems={Array.from(selectedItems)}
          user={user}
          onClose={() => setShowBatchAssignModal(false)}
          onSuccess={() => {
            setShowBatchAssignModal(false);
            setSelectedItems(new Set());
            load();
          }}
        />
      )}
    </div>
  )
}


