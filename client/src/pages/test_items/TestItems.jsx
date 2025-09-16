import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function TestItems() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
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
  useEffect(()=>{ load(); }, [q, page, status]);

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
        <button className="btn" onClick={()=>navigate('/test-items/new')}>+ 新增</button>
        <button className="btn" onClick={()=>{
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
                      <th>ID</th><th>细项</th><th>代码</th><th>执行部门</th><th>执行小组</th><th>数量</th><th>单价</th><th>状态</th><th>执行人</th><th>负责人</th><th>实验员</th><th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(it => (
                      <tr key={it.test_item_id}>
                        <td>{it.test_item_id}</td>
                        <td>{it.detail_name}</td>
                        <td>{it.test_code}</td>
                        <td>{it.department_id}</td>
                        <td>{it.group_id}</td>
                        <td>{it.quantity}</td>
                        <td>{it.unit_price}</td>
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
                        <td className="actions">
                          <button className="btn" onClick={()=>navigate(`/test-items/${it.test_item_id}`)}>编辑</button>
                          <button className="btn" onClick={async ()=>{ if (confirm('Delete?')) { await api.deleteTestItem(it.test_item_id); load(); }}}>删除</button>
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
      <div style={{marginTop:12, display:'flex', gap:8}}>
        <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
        <div>页 {page} / {totalPages}</div>
        <button className="btn" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>下一页</button>
      </div>
    </div>
  )
}


