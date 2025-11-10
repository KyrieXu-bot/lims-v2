import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function Payers() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const navigate = useNavigate();

  // 检查用户权限
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    if (!user || (user.role !== 'admin' && user.role !== 'sales')) {
      navigate('/test-items');
      return;
    }
  }, [navigate]);

  async function load() {
    try {
      const res = await api.listPayers({ q, page, pageSize, is_active: isActiveFilter });
      setItems(res.data);
      setTotal(res.total);
    } catch (e) {
      alert(e.message);
      navigate('/login');
    }
  }
  useEffect(()=>{ load(); }, [q, page, isActiveFilter]);

  const totalPages = Math.max(1, Math.ceil(total/pageSize));

  return (
    <div>
      <h2>付款人</h2>
      <div className="toolbar">
        <input className="input" placeholder="搜索（付款人、客户、电话号码）..." value={q} onChange={e=>{setPage(1);setQ(e.target.value)}}/>
        <select className="input" style={{maxWidth:160}} value={isActiveFilter} onChange={e=>{setPage(1);setIsActiveFilter(e.target.value)}}>
          <option value="">所有</option>
          <option value="1">启用</option>
          <option value="0">禁用</option>
        </select>
        <button className="btn" onClick={()=>navigate('/payers/new')}>+ 新增</button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th><th>付款人</th><th>客户</th><th>电话号码</th><th>付款期限 (天)</th><th>折扣 (%)</th><th>业务员</th><th>状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.payer_id}>
              <td>{it.payer_id}</td>
              <td>{it.contact_name}</td>
              <td>{it.customer_name}</td>
              <td>{it.contact_phone}</td>
              <td>{it.payment_term_days}</td>
              <td>{it.discount_rate !== null && it.discount_rate !== undefined ? `${it.discount_rate}%` : ''}</td>
              <td>{it.owner_user_id ? `${it.owner_name||''}（${it.owner_user_id}）` : ''}</td>
              <td>{it.is_active ? <span className="badge">启用</span> : <span className="badge">禁用</span>}</td>
              <td className="actions">
                <button className="btn" onClick={()=>navigate(`/payers/${it.payer_id}`)}>编辑</button>
                <button className="btn" onClick={async ()=>{ if (confirm('Delete?')) { await api.deletePayer(it.payer_id); load(); }}}>删除</button>
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
