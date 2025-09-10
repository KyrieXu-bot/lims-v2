import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function Customers() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const navigate = useNavigate();

  async function load() {
    try {
      const res = await api.listCustomers({ q, page, pageSize, is_active: isActiveFilter });
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
      <h2>客户库</h2>
      <div className="toolbar">
        <input className="input" placeholder="搜索（税号、名称、省份、电话号码）..." value={q} onChange={e=>{setPage(1);setQ(e.target.value)}}/>
        <select className="input" style={{maxWidth:160}} value={isActiveFilter} onChange={e=>{setPage(1);setIsActiveFilter(e.target.value)}}>
          <option value="">所有</option>
          <option value="1">启用</option>
          <option value="0">禁用</option>
        </select>
        <button className="btn" onClick={()=>navigate('/customers/new')}>+ 新增</button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th><th>姓名</th><th>税号</th><th>省份</th><th>电话号码</th><th>银行账户</th><th>性质</th><th>规模</th><th>客户分级</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.customer_id}>
              <td>{it.customer_id}</td>
              <td>{it.customer_name}<div style={{fontSize:12,color:'#666'}}>{it.address}</div></td>
              <td>{it.tax_id}</td>
              <td>{it.province}</td>
              <td>{it.phone}</td>
              <td>{it.bank_name}<div style={{fontSize:12,color:'#666'}}>{it.bank_account}</div></td>
              <td>{it.nature}</td>
              <td>{it.scale}</td>
              <td>{it.grade}</td>
              <td>{it.is_active ? <span className="badge">启用</span> : <span className="badge">禁用</span>}</td>
              <td className="actions">
                <button className="btn" onClick={()=>navigate(`/customers/${it.customer_id}`)}>编辑</button>
                <button className="btn" onClick={async ()=>{ if (confirm('Delete?')) { await api.deleteCustomer(it.customer_id); load(); }}}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{marginTop:12, display:'flex', gap:8}}>
        <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
        <div>Page {page} / {totalPages}</div>
        <button className="btn" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>下一页</button>
      </div>
    </div>
  )
}
