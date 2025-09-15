import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function TestItems() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
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

  return (
    <div>
      <h2>检测项目处理</h2>
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
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th><th>委托单号</th><th>大类</th><th>细项</th><th>代码</th><th>执行部门</th><th>执行小组</th><th>数量</th><th>单价</th><th>状态</th><th>执行人</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.test_item_id}>
              <td>{it.test_item_id}</td>
              <td>{it.order_id}</td>
              <td>{it.category_name}</td>
              <td>{it.detail_name}</td>
              <td>{it.test_code}</td>
              <td>{it.department_id}</td>
              <td>{it.group_id}</td>
              <td>{it.quantity}</td>
              <td>{it.unit_price}</td>
              <td>{it.status}</td>
              <td>{it.current_assignee ? `${it.assignee_name||''}（${it.current_assignee}）` : ''}</td>
              <td className="actions">
                <button className="btn" onClick={()=>navigate(`/test-items/${it.test_item_id}`)}>编辑</button>
                <button className="btn" onClick={async ()=>{ if (confirm('Delete?')) { await api.deleteTestItem(it.test_item_id); load(); }}}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{marginTop:12, display:'flex', gap:8}}>
        <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
        <div>页 {page} / {totalPages}</div>
        <button className="btn" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>下一页</button>
      </div>
    </div>
  )
}


