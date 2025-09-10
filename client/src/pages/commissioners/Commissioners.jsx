import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function Commissioners() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const navigate = useNavigate();

  async function load() {
    try {
      const res = await api.listCommissioners({ q, page, pageSize, is_active: isActiveFilter });
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
      <h2>委托人</h2>
      <div className="toolbar">
        <input className="input" placeholder="搜索（委托人、付款人、客户、电话号码）..." value={q} onChange={e=>{setPage(1);setQ(e.target.value)}}/>
        <select className="input" style={{maxWidth:160}} value={isActiveFilter} onChange={e=>{setPage(1);setIsActiveFilter(e.target.value)}}>
          <option value="">所有</option>
          <option value="1">启用</option>
          <option value="0">禁用</option>
        </select>
        <button className="btn" onClick={()=>navigate('/commissioners/new')}>+ 新增</button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th><th>委托人</th><th>付款人</th><th>客户</th><th>电话号码</th><th>Email</th><th>状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.commissioner_id}>
              <td>{it.commissioner_id}</td>
              <td>{it.contact_name}</td>
              <td>{it.payer_contact}</td>
              <td>{it.customer_name}</td>
              <td>{it.contact_phone}</td>
              <td>{it.email}</td>
              <td>{it.is_active ? <span className="badge">启用</span> : <span className="badge">禁用</span>}</td>
              <td className="actions">
                <button className="btn" onClick={()=>navigate(`/commissioners/${it.commissioner_id}`)}>编辑</button>
                <button className="btn" onClick={async ()=>{ if (confirm('Delete?')) { await api.deleteCommissioner(it.commissioner_id); load(); }}}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{marginTop:12, display:'flex', gap:8}}>
        <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
        <div>页 {page} / {totalPages}</div>
        <button className="btn" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next</button>
      </div>
    </div>
  )
}
