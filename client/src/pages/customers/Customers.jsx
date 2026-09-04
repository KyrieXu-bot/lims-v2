import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import CustomerRequestModal from '../../components/CustomerRequestModal.jsx';
import '../PartyManagement.css';

export default function Customers() {
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const canManage = user?.role === 'admin';
  const canDirectCreate = canManage || user?.user_id === 'JC0089';
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const pageSize = 20;
  const navigate = useNavigate();

  // 检查用户权限
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    if (!user || (user.role !== 'admin' && user.role !== 'sales' && user.user_id !== 'JC0089')) {
      navigate('/test-items');
      return;
    }
  }, [navigate]);

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
    <div className="party-management-page customers-page">
      <h2 className="party-page-title">客户管理</h2>
      <div className="toolbar party-toolbar">
        <input className="input" placeholder="搜索（税号、名称、省份、电话号码）..." value={q} onChange={e=>{setPage(1);setQ(e.target.value)}}/>
        <select className="input" style={{maxWidth:160}} value={isActiveFilter} onChange={e=>{setPage(1);setIsActiveFilter(e.target.value)}}>
          <option value="">所有</option>
          <option value="1">启用</option>
          <option value="0">禁用</option>
        </select>
        <button className="btn party-button party-button-primary" onClick={()=>canDirectCreate ? navigate('/customers/new') : setShowRequestModal(true)}>+ 新增</button>
      </div>
      <div className="party-table-wrap">
      <table className="table party-table" style={{minWidth: 1260}}>
        <thead>
          <tr>
            <th>ID</th><th>姓名</th><th>税号</th><th>省份</th><th>电话号码</th><th>银行账户</th><th>性质</th><th>规模</th><th>合作时间</th><th>状态</th>{canManage && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.customer_id}>
              <td>{it.customer_id}</td>
              <td>{it.customer_name}<div className="party-subtext">{it.address}</div></td>
              <td>{it.tax_id}</td>
              <td>{it.province}</td>
              <td>{it.phone}</td>
              <td>{it.bank_name}<div className="party-subtext">{it.bank_account}</div></td>
              <td>{it.nature}</td>
              <td>{it.scale}</td>
              <td>{it.cooperation_time}</td>
              <td>{it.is_active ? <span className="party-status">启用</span> : <span className="party-status party-status-inactive">禁用</span>}</td>
              {canManage && <td className="party-actions">
                <button className="btn party-button btn-sm" onClick={()=>navigate(`/customers/${it.customer_id}`)}>编辑</button>
                <button className="btn party-button btn-sm" onClick={async ()=>{ if (confirm('确认删除该客户吗？')) { await api.deleteCustomer(it.customer_id); load(); }}}>删除</button>
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="party-pagination">
        <button className="btn party-button" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
        <div>第 {page} / {totalPages} 页</div>
        <button className="btn party-button" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>下一页</button>
      </div>
      {showRequestModal && <CustomerRequestModal onClose={() => setShowRequestModal(false)} />}
    </div>
  )
}
