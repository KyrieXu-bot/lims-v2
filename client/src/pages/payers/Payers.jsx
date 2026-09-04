import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { api } from '../../api.js';
import '../PartyManagement.css';

export default function Payers() {
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const canManage = user?.role === 'admin';
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedPayerIds, setSelectedPayerIds] = useState([]);
  const [selectedPayerMap, setSelectedPayerMap] = useState({});
  const [exporting, setExporting] = useState(false);
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
  const currentPageIds = items.map(it => String(it.payer_id));
  const currentPageAllSelected = items.length > 0 && currentPageIds.every(id => selectedPayerIds.includes(id));

  function formatCurrency(value) {
    const amount = Number(value || 0);
    return `¥${amount.toFixed(2)}`;
  }

  function togglePayerSelection(payer, checked) {
    const id = String(payer.payer_id);
    setSelectedPayerIds(prev => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter(x => x !== id);
    });
    setSelectedPayerMap(prev => {
      const next = { ...prev };
      if (checked) {
        next[id] = payer;
      } else {
        delete next[id];
      }
      return next;
    });
  }

  function toggleCurrentPageSelection(e) {
    const checked = e.target.checked;
    if (checked) {
      setSelectedPayerIds(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.add(id));
        return Array.from(next);
      });
      setSelectedPayerMap(prev => {
        const next = { ...prev };
        items.forEach(item => {
          next[String(item.payer_id)] = item;
        });
        return next;
      });
      return;
    }
    setSelectedPayerIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    setSelectedPayerMap(prev => {
      const next = { ...prev };
      currentPageIds.forEach(id => {
        delete next[id];
      });
      return next;
    });
  }

  function buildExportRow(payer) {
    return {
      'ID': payer.payer_id,
      '付款人': payer.contact_name || '',
      '客户': payer.customer_name || '',
      '电话号码': payer.contact_phone || '',
      '预存余额': Number(payer.prepaid_balance || 0),
      '未结算汇总': Number(payer.unsettled_amount || 0),
      '已申请汇总': Number(payer.applied_amount || 0),
      '已开票汇总': Number(payer.invoiced_amount || 0),
      '已到账汇总': Number(payer.received_amount || 0),
      '当前余额': Number(payer.current_balance || 0),
      '付款期限 (天)': payer.payment_term_days ?? '',
      '折扣 (%)': payer.discount_rate ?? '',
      '业务员': payer.owner_user_id ? `${payer.owner_name || ''}（${payer.owner_user_id}）` : '',
      '状态': payer.is_active ? '启用' : '禁用'
    };
  }

  async function handleExportExcel() {
    if (selectedPayerIds.length === 0) {
      alert('请先选择要导出的付款人');
      return;
    }

    try {
      setExporting(true);
      const selectedRows = selectedPayerIds.map(id => selectedPayerMap[id]).filter(Boolean);
      if (selectedRows.length === 0) {
        alert('未找到可导出的付款人数据，请重新选择后再试');
        return;
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(selectedRows.map(buildExportRow));
      ws['!cols'] = [
        { wch: 10 },
        { wch: 16 },
        { wch: 26 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 12 },
        { wch: 18 },
        { wch: 10 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, '付款人');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
      XLSX.writeFile(wb, `付款人_${timestamp}.xlsx`);
    } catch (error) {
      console.error('导出付款人Excel失败:', error);
      alert('导出Excel失败：' + error.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="party-management-page payers-page">
      <h2 className="party-page-title">付款人</h2>
      <div className="toolbar party-toolbar">
        <input className="input" placeholder="搜索（付款人、客户、电话号码）..." value={q} onChange={e=>{setPage(1);setQ(e.target.value)}}/>
        <select className="input" style={{maxWidth:160}} value={isActiveFilter} onChange={e=>{setPage(1);setIsActiveFilter(e.target.value)}}>
          <option value="">所有</option>
          <option value="1">启用</option>
          <option value="0">禁用</option>
        </select>
        {canManage && <button className="btn party-button party-button-primary" onClick={()=>navigate('/payers/new')}>+ 新增</button>}
        <button
          className="btn party-button"
          style={{ marginLeft: 'auto' }}
          onClick={handleExportExcel}
          disabled={exporting || selectedPayerIds.length === 0}
        >
          {exporting ? '导出中...' : `导出Excel${selectedPayerIds.length ? `（${selectedPayerIds.length}）` : ''}`}
        </button>
      </div>
      <div className="party-table-wrap">
      <table className="table party-table" style={{minWidth: 1760}}>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={currentPageAllSelected}
                onChange={toggleCurrentPageSelection}
                disabled={items.length === 0}
                title="全选当前页"
              />
            </th>
            <th>ID</th><th>付款人</th><th>客户</th><th>电话号码</th><th>预存余额</th><th>未结算汇总</th><th>已申请汇总</th><th>已开票汇总</th><th>已到账汇总</th><th>当前余额</th><th>付款期限 (天)</th><th>折扣 (%)</th><th>业务员</th><th>状态</th>{canManage && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.payer_id}>
              <td>
                <input
                  type="checkbox"
                  checked={selectedPayerIds.includes(String(it.payer_id))}
                  onChange={(e) => togglePayerSelection(it, e.target.checked)}
                />
              </td>
              <td>{it.payer_id}</td>
              <td>{it.contact_name}</td>
              <td>{it.customer_name}</td>
              <td>{it.contact_phone}</td>
              <td>{formatCurrency(it.prepaid_balance)}</td>
              <td>{formatCurrency(it.unsettled_amount)}</td>
              <td>{formatCurrency(it.applied_amount)}</td>
              <td>{formatCurrency(it.invoiced_amount)}</td>
              <td>{formatCurrency(it.received_amount)}</td>
              <td className={Number(it.current_balance || 0) < 0 ? 'party-balance-negative' : 'party-balance-normal'}>
                {formatCurrency(it.current_balance)}
              </td>
              <td>{it.payment_term_days}</td>
              <td>{it.discount_rate !== null && it.discount_rate !== undefined ? `${it.discount_rate}%` : ''}</td>
              <td>{it.owner_user_id ? `${it.owner_name||''}（${it.owner_user_id}）` : ''}</td>
              <td>{it.is_active ? <span className="party-status">启用</span> : <span className="party-status party-status-inactive">禁用</span>}</td>
              {canManage && <td className="party-actions">
                <button className="btn party-button btn-sm" onClick={()=>navigate(`/payers/${it.payer_id}/ledger`)}>查看流水</button>
                <button className="btn party-button btn-sm" onClick={()=>navigate(`/payers/${it.payer_id}`)}>编辑</button>
                <button className="btn party-button btn-sm" onClick={async ()=>{ if (confirm('确认删除该付款人吗？')) { await api.deletePayer(it.payer_id); load(); }}}>删除</button>
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="party-pagination">
        <button className="btn party-button" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button>
        <div>页 {page} / {totalPages}</div>
        <button className="btn party-button" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>下一页</button>
      </div>
    </div>
  )
}
