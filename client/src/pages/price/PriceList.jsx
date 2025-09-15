import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

export default function PriceList() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const navigate = useNavigate();

  async function load() {
    try {
      const res = await api.listPrice({ q, page, pageSize, is_active: isActiveFilter });
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
      <h2>检测项目（价格表）</h2>
      <div className="toolbar">
        <input className="input" placeholder="搜索（大类/细项/代码/标准）..." value={q} onChange={e=>{setPage(1);setQ(e.target.value)}}/>
        <select className="input" style={{maxWidth:160}} value={isActiveFilter} onChange={e=>{setPage(1);setIsActiveFilter(e.target.value)}}>
          <option value="">所有</option>
          <option value="1">启用</option>
          <option value="0">禁用</option>
        </select>
        <button className="btn" onClick={()=>navigate('/price/new')}>+ 新增</button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>ID</th><th>大类</th><th>细项</th><th>检测代码</th><th>标准号</th><th>单价</th><th>委外</th><th>状态</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.price_id}>
              <td>{it.price_id}</td>
              <td>{it.category_name}</td>
              <td>{it.detail_name}</td>
              <td>{it.test_code}</td>
              <td>{it.standard_code}</td>
              <td>{it.unit_price}</td>
              <td>{it.is_outsourced ? '是' : '否'}</td>
              <td>{it.is_active ? <span className="badge">启用</span> : <span className="badge">禁用</span>}</td>
              <td className="actions">
                <button className="btn" onClick={()=>navigate(`/price/${it.price_id}`)}>编辑</button>
                <button className="btn" onClick={async ()=>{ if (confirm('Delete?')) { await api.deletePrice(it.price_id); load(); }}}>删除</button>
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


