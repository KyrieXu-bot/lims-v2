import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import React from 'react';

export default function SettlementManagement() {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSettlement, setEditingSettlement] = useState(null);
  const [editForm, setEditForm] = useState({
    invoice_amount: '',
    received_amount: '',
    received_date: '',
    payment_status: '未到款',
    remarks: '',
    customer_name: '',
    customer_id: '',
    customer_nature: '',
    assignee_id: ''
  });
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const customerInputRef = useRef(null);

  useEffect(() => {
    loadSettlements();
    loadAssigneeOptions();
  }, []);

  async function loadAssigneeOptions() {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch('/api/settlements/assignees', { headers });
      if (response.ok) {
        const data = await response.json();
        setAssigneeOptions(data);
      }
    } catch (e) {
      console.error('加载业务人员列表失败:', e);
    }
  }

  async function loadSettlements() {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch('/api/settlements', { headers });
      if (!response.ok) {
        throw new Error('加载失败');
      }
      const data = await response.json();
      setSettlements(data);
    } catch (e) {
      alert('加载失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(settlement) {
    setEditingSettlement(settlement);
    setEditForm({
      invoice_amount: settlement.invoice_amount || '',
      received_amount: settlement.received_amount || '',
      received_date: formatDateForInput(settlement.received_date),
      payment_status: settlement.payment_status || '未到款',
      remarks: settlement.remarks || '',
      customer_name: settlement.display_customer_name || settlement.customer_name || '',
      customer_id: settlement.customer_id || '',
      customer_nature: settlement.customer_nature || '',
      assignee_id: settlement.assignee_id || ''
    });
    setCustomerSearchQuery(settlement.display_customer_name || settlement.customer_name || '');
    setCustomerSearchResults([]);
    setShowCustomerDropdown(false);
  }

  function handleCancelEdit() {
    setEditingSettlement(null);
    setEditForm({
      invoice_amount: '',
      received_amount: '',
      received_date: '',
      payment_status: '未到款',
      remarks: '',
      customer_name: '',
      customer_id: '',
      customer_nature: '',
      assignee_id: ''
    });
    setCustomerSearchQuery('');
    setCustomerSearchResults([]);
    setShowCustomerDropdown(false);
  }

  // 客户模糊查询
  async function searchCustomers(query) {
    if (!query || query.trim() === '') {
      setCustomerSearchResults([]);
      setShowCustomerDropdown(false);
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`/api/settlements/customers/search?q=${encodeURIComponent(query)}`, { headers });
      if (response.ok) {
        const data = await response.json();
        setCustomerSearchResults(data);
        setShowCustomerDropdown(data.length > 0);
      }
    } catch (error) {
      console.error('搜索客户失败:', error);
      setCustomerSearchResults([]);
      setShowCustomerDropdown(false);
    }
  }

  // 选择客户
  function handleSelectCustomer(customer) {
    setEditForm({
      ...editForm,
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      customer_nature: customer.customer_nature || customer.nature || editForm.customer_nature
    });
    setCustomerSearchQuery(customer.customer_name);
    setShowCustomerDropdown(false);
    setCustomerSearchResults([]);
  }

  // 计算下拉框位置
  function calculateDropdownPosition() {
    if (customerInputRef.current) {
      const rect = customerInputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }

  // 处理客户名称输入变化
  function handleCustomerNameChange(value) {
    setCustomerSearchQuery(value);
    setEditForm({
      ...editForm,
      customer_name: value,
      customer_id: '' // 清空customer_id，表示自定义客户
    });
    if (value.trim()) {
      searchCustomers(value);
      // 延迟计算位置，确保输入框已渲染
      setTimeout(calculateDropdownPosition, 0);
    } else {
      setCustomerSearchResults([]);
      setShowCustomerDropdown(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingSettlement) return;

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const updateData = {};
      if (editForm.invoice_amount !== undefined && editForm.invoice_amount !== '') {
        updateData.invoice_amount = parseFloat(editForm.invoice_amount);
      }
      if (editForm.received_amount !== '') {
        updateData.received_amount = parseFloat(editForm.received_amount);
      }
      if (editForm.received_date !== '') {
        // 确保日期格式为 YYYY-MM-DD（input[type="date"] 返回的已经是正确格式，但为了安全还是转换一下）
        const dateStr = formatDateForInput(editForm.received_date);
        if (dateStr) {
          updateData.received_date = dateStr;
        }
      } else if (editForm.received_date === '') {
        // 如果清空了日期，设置为 null
        updateData.received_date = null;
      }
      if (editForm.payment_status) {
        updateData.payment_status = editForm.payment_status;
      }
      if (editForm.remarks !== undefined) {
        updateData.remarks = editForm.remarks;
      }
      if (editForm.customer_name !== undefined) {
        updateData.customer_name = editForm.customer_name;
      }
      // 如果选择了客户，更新customer_id；如果没选择（直接输入），customer_id设为null
      if (editForm.customer_id) {
        updateData.customer_id = parseInt(editForm.customer_id);
      } else if (editForm.customer_name !== undefined) {
        // 如果客户名称有变化且没有选择客户，则customer_id设为null
        updateData.customer_id = null;
      }
      if (editForm.customer_nature !== undefined) {
        updateData.customer_nature = editForm.customer_nature;
      }
      if (editForm.assignee_id !== undefined) {
        updateData.assignee_id = editForm.assignee_id;
      }

      const response = await fetch(`/api/settlements/${editingSettlement.settlement_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '更新失败');
      }

      alert('更新成功');
      handleCancelEdit();
      loadSettlements();
    } catch (e) {
      alert('更新失败: ' + e.message);
    }
  }

  function getPaymentStatusColor(status) {
    const colorMap = {
      '未到款': '#dc3545',
      '已到款': '#28a745',
      '部分到款': '#ffc107'
    };
    return colorMap[status] || '#6c757d';
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN');
  }

  // 将日期转换为 YYYY-MM-DD 格式（用于 input[type="date"]）
  function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      // 如果已经是 YYYY-MM-DD 格式，直接返回
      if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
      }
      return '';
    }
  }

  function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') return '-';
    return `¥${Number(amount).toFixed(2)}`;
  }

  async function handleDelete(settlementId) {
    if (!window.confirm('确定要删除这条结算记录吗？此操作不可恢复。')) {
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`/api/settlements/${settlementId}`, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '删除失败');
      }

      alert('删除成功');
      loadSettlements();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  }

  // 检查用户权限
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  if (user?.role !== 'admin') {
    return (
      <div>
        <h2>费用结算</h2>
        <div style={{ padding: '20px', textAlign: 'center', color: '#dc3545' }}>
          您没有权限访问此页面，仅管理员可以使用。
        </div>
      </div>
    );
  }

  if (loading) return <div>加载中...</div>;

  return (
    <div>
      <h2>费用结算</h2>

      {/* 下拉框使用 fixed 定位，避免被表格裁剪 */}
      {showCustomerDropdown && customerSearchResults.length > 0 && (
        <div style={{
          position: 'fixed',
          top: `${dropdownPosition.top}px`,
          left: `${dropdownPosition.left}px`,
          width: `${dropdownPosition.width || 150}px`,
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 10000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          {customerSearchResults.map(customer => (
            <div
              key={customer.customer_id}
              onMouseDown={(e) => {
                e.preventDefault(); // 防止触发 onBlur
                handleSelectCustomer(customer);
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #eee'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f0f0f0'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
            >
              <div style={{ fontWeight: 'bold' }}>{customer.customer_name}</div>
              {(customer.customer_nature || customer.nature) && (
                <div style={{ fontSize: '12px', color: '#666' }}>性质: {customer.customer_nature || customer.nature}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="table-container" style={{ marginTop: '20px' }}>
        <table className="table">
          <thead>
            <tr>
              <th>票号</th>
              <th>开票日期</th>
              <th>委托单号组</th>
              <th>客户名称</th>
              <th>开票金额</th>
              <th>到账金额</th>
              <th>到账日期</th>
              <th>备注</th>
              <th>业务人员</th>
              <th>企业性质</th>
              <th>到款情况</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {settlements.length === 0 ? (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: '20px' }}>
                  暂无结算记录
                </td>
              </tr>
            ) : (
              settlements.map(settlement => (
                <tr key={settlement.settlement_id}>
                  {editingSettlement?.settlement_id === settlement.settlement_id ? (
                    <>
                      <td>{settlement.invoice_number || '-'}</td>
                      <td>{formatDate(settlement.invoice_date)}</td>
                      <td>{settlement.order_ids}</td>
                      <td style={{ position: 'relative', overflow: 'visible' }}>
                        <input
                          ref={customerInputRef}
                          type="text"
                          className="input"
                          value={customerSearchQuery}
                          onChange={(e) => handleCustomerNameChange(e.target.value)}
                          onFocus={() => {
                            calculateDropdownPosition();
                            if (customerSearchQuery && customerSearchResults.length > 0) {
                              setShowCustomerDropdown(true);
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => setShowCustomerDropdown(false), 200);
                          }}
                          placeholder="输入客户名称搜索或直接输入"
                          style={{ width: '150px', padding: '4px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input"
                          value={editForm.invoice_amount}
                          onChange={(e) => setEditForm({ ...editForm, invoice_amount: e.target.value })}
                          placeholder="开票金额"
                          step="0.01"
                          min="0"
                          style={{ width: '120px', padding: '4px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input"
                          value={editForm.received_amount}
                          onChange={(e) => setEditForm({ ...editForm, received_amount: e.target.value })}
                          placeholder="到账金额"
                          step="0.01"
                          min="0"
                          style={{ width: '120px', padding: '4px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="input"
                          value={editForm.received_date}
                          onChange={(e) => setEditForm({ ...editForm, received_date: e.target.value })}
                          style={{ width: '150px', padding: '4px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="input"
                          value={editForm.remarks}
                          onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                          placeholder="备注"
                          style={{ width: '150px', padding: '4px' }}
                        />
                      </td>
                      <td>
                        <select
                          className="input"
                          value={editForm.assignee_id}
                          onChange={(e) => setEditForm({ ...editForm, assignee_id: e.target.value })}
                          style={{ width: '120px', padding: '4px' }}
                        >
                          <option value="">请选择</option>
                          {assigneeOptions.map(assignee => (
                            <option key={assignee.user_id} value={assignee.user_id}>
                              {assignee.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="input"
                          value={editForm.customer_nature || ''}
                          onChange={(e) => setEditForm({ ...editForm, customer_nature: e.target.value })}
                          style={{ width: '120px', padding: '4px' }}
                        >
                          <option value="">请选择</option>
                          <option value="集萃体系">集萃体系</option>
                          <option value="高校">高校</option>
                          <option value="第三方检测机构">第三方检测机构</option>
                          <option value="其他企业">其他企业</option>
                          <option value="个人">个人</option>
                          <option value="研究所">研究所</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className="input"
                          value={editForm.payment_status}
                          onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })}
                          style={{ width: '120px', padding: '4px' }}
                        >
                          <option value="未到款">未到款</option>
                          <option value="已到款">已到款</option>
                          <option value="部分到款">部分到款</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleSaveEdit}
                          style={{ marginRight: '5px' }}
                        >
                          保存
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={handleCancelEdit}
                        >
                          取消
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{settlement.invoice_number || '-'}</td>
                      <td>{formatDate(settlement.invoice_date)}</td>
                      <td>{settlement.order_ids}</td>
                      <td>{settlement.display_customer_name || settlement.customer_name || '-'}</td>
                      <td>{formatCurrency(settlement.invoice_amount)}</td>
                      <td>{formatCurrency(settlement.received_amount)}</td>
                      <td>{formatDate(settlement.received_date)}</td>
                      <td>{settlement.remarks || '-'}</td>
                      <td>{settlement.assignee_name || '-'}</td>
                      <td>{settlement.customer_nature || '-'}</td>
                      <td>
                        <span
                          style={{
                            color: getPaymentStatusColor(settlement.payment_status),
                            fontWeight: 'bold'
                          }}
                        >
                          {settlement.payment_status}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleEdit(settlement)}
                          style={{ marginRight: '5px' }}
                        >
                          编辑
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(settlement.settlement_id)}
                        >
                          删除
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



