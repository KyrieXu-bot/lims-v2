import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import React from 'react';
import DetailViewLink from '../../components/DetailViewLink.jsx';
import './SettlementManagement.css';

const DEPARTMENT_ALLOCATION_COLUMNS = [
  { key: 'dept_1_amount', label: '显微结构表征' },
  { key: 'dept_2_amount', label: '物化性能分析' },
  { key: 'dept_3_amount', label: '力学性能测试' },
  { key: 'dept_5_amount', label: '委外' },
  { key: 'dept_6_amount', label: '化学分析' },
  { key: 'dept_7_amount', label: '技术支持' }
];

export default function SettlementManagement() {
  const [settlements, setSettlements] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [loading, setLoading] = useState(true);
  const [editingSettlement, setEditingSettlement] = useState(null);
  const [editForm, setEditForm] = useState({
    invoice_number: '',
    invoice_date: '',
    invoice_amount: '',
    received_amount: '',
    received_date: '',
    payment_status: '未到款',
    remarks: '',
    customer_name: '',
    customer_id: '',
    customer_nature: '',
    payer_id: '',
    assignee_id: ''
  });
  const [showPrepaymentModal, setShowPrepaymentModal] = useState(false);
  const [prepaymentForm, setPrepaymentForm] = useState({
    payer_id: '',
    prepayment_type: 'normal',
    invoice_number: '',
    invoice_date: '',
    invoice_amount: '',
    gift_amount: '',
    prepayment_total_amount: '',
    received_amount: '',
    received_date: '',
    payment_status: '已到款',
    remarks: ''
  });
  const [payerOptions, setPayerOptions] = useState([]);
  const [prepaymentPayerQuery, setPrepaymentPayerQuery] = useState('');
  const [prepaymentPayerResults, setPrepaymentPayerResults] = useState([]);
  const [showPrepaymentPayerDropdown, setShowPrepaymentPayerDropdown] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [settlementFilters, setSettlementFilters] = useState({
    keyword: '',
    settlement_type: '',
    payment_status: '',
    approval_status: '',
    created_start: '',
    created_end: ''
  });
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const customerInputRef = useRef(null);

  useEffect(() => {
    loadAssigneeOptions();
    loadPayerOptions();
  }, []);

  useEffect(() => {
    loadSettlements();
  }, [page, settlementFilters]);

  async function loadPayerOptions() {
    try {
      const data = await api.getPayerOptions();
      setPayerOptions(data);
    } catch (e) {
      console.error('加载付款方列表失败:', e);
    }
  }

  function formatPayerLabel(payer) {
    if (!payer) return '';
    return payer.label || `${payer.contact_name || ''}${payer.customer_name ? ` (${payer.customer_name})` : ''}`;
  }

  async function searchPrepaymentPayers(query) {
    const keyword = String(query || '').trim();
    if (!keyword) {
      setPrepaymentPayerResults([]);
      setShowPrepaymentPayerDropdown(false);
      return;
    }

    try {
      const data = await api.listPayers({ q: keyword, page: 1, pageSize: 20, is_active: 1 });
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const normalized = rows.map((payer) => ({
        ...payer,
        label: formatPayerLabel(payer)
      }));
      setPrepaymentPayerResults(normalized);
      setShowPrepaymentPayerDropdown(normalized.length > 0);
    } catch (e) {
      console.error('搜索付款方失败:', e);
      setPrepaymentPayerResults([]);
      setShowPrepaymentPayerDropdown(false);
    }
  }

  function handlePrepaymentPayerInput(value) {
    setPrepaymentPayerQuery(value);
    setPrepaymentForm({ ...prepaymentForm, payer_id: '' });
    searchPrepaymentPayers(value);
  }

  function handleSelectPrepaymentPayer(payer) {
    setPrepaymentPayerQuery(formatPayerLabel(payer));
    setPrepaymentForm({ ...prepaymentForm, payer_id: payer.payer_id });
    setPrepaymentPayerResults([]);
    setShowPrepaymentPayerDropdown(false);
  }

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
      const data = await api.getSettlements({
        q: settlementFilters.keyword,
        page,
        pageSize,
        settlement_type: settlementFilters.settlement_type,
        payment_status: settlementFilters.payment_status,
        approval_status: settlementFilters.approval_status,
        created_start: settlementFilters.created_start,
        created_end: settlementFilters.created_end
      });
      const rows = Array.isArray(data) ? data : (data.data || []);
      setSettlements(rows);
      setTotal(Array.isArray(data) ? rows.length : Number(data.total || 0));
    } catch (e) {
      alert('加载失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function updateSettlementFilter(key, value) {
    setPage(1);
    setSettlementFilters(prev => ({ ...prev, [key]: value }));
  }

  function handleEdit(settlement) {
    // 检查编辑权限
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    const canEdit = user?.role === 'admin' || (user?.role === 'leader' && Number(user?.department_id) === 5);
    if (!canEdit) {
      alert('您没有权限编辑结算记录');
      return;
    }
    
    setEditingSettlement(settlement);
    setEditForm({
      invoice_number: settlement.invoice_number || '',
      invoice_date: formatDateForInput(settlement.invoice_date),
      invoice_amount: settlement.invoice_amount || '',
      received_amount: settlement.received_amount || '',
      received_date: formatDateForInput(settlement.received_date),
      payment_status: settlement.payment_status || '未到款',
      remarks: settlement.remarks || '',
      customer_name: settlement.display_customer_name || settlement.customer_name || '',
      customer_id: settlement.customer_id || '',
      customer_nature: settlement.customer_nature || '',
      payer_id: settlement.payer_id || '',
      assignee_id: settlement.assignee_id || ''
    });
    setCustomerSearchQuery(settlement.display_customer_name || settlement.customer_name || '');
    setCustomerSearchResults([]);
    setShowCustomerDropdown(false);
  }

  function handleCancelEdit() {
    setEditingSettlement(null);
    setEditForm({
      invoice_number: '',
      invoice_date: '',
      invoice_amount: '',
      received_amount: '',
      received_date: '',
      payment_status: '未到款',
      remarks: '',
      customer_name: '',
      customer_id: '',
      customer_nature: '',
      payer_id: '',
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

    // 检查编辑权限
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    const canEdit = user?.role === 'admin' || (user?.role === 'leader' && Number(user?.department_id) === 5);
    if (!canEdit) {
      alert('您没有权限编辑结算记录');
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const updateData = {};
      updateData.invoice_number = editForm.invoice_number || null;
      if (editForm.invoice_date !== '') {
        const dateStr = formatDateForInput(editForm.invoice_date);
        if (dateStr) {
          updateData.invoice_date = dateStr;
        }
      } else if (editForm.invoice_date === '') {
        updateData.invoice_date = null;
      }
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
      if (editForm.payer_id !== undefined) {
        updateData.payer_id = editForm.payer_id || null;
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
      window.dispatchEvent(new CustomEvent('commission-form-refetch-request'));
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

  function getSettlementTypeText(settlement) {
    if (settlement?.settlement_type === 'prepayment') return '预存充值';
    if (settlement?.settlement_type === 'invoice' && settlement?.settlement_method === 'prepaid') return '预存抵扣';
    return '开票结算';
  }

  function getApprovalStatusText(status) {
    const map = {
      pending: '待审批',
      approved: '已通过',
      rejected: '已退回'
    };
    return map[status] || '待审批';
  }

  function getApprovalStatusColor(status) {
    const map = {
      pending: '#f0ad4e',
      approved: '#28a745',
      rejected: '#dc3545'
    };
    return map[status] || '#6c757d';
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

  async function handleDelete(settlement) {
    if (!canDeleteSettlement(settlement)) {
      alert('您没有权限删除结算记录');
      return;
    }

    if (!window.confirm('确定要删除这条结算记录吗？此操作不可恢复。')) {
      return;
    }

    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`/api/settlements/${settlement.settlement_id}`, {
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

  async function handleCreatePrepayment() {
    const selectedPayer = payerOptions.find(p => String(p.payer_id) === String(prepaymentForm.payer_id));
    if (!selectedPayer) {
      alert('请选择付款方');
      return;
    }
    if (!prepaymentForm.invoice_number) {
      alert('预存充值必须先填写发票票号');
      return;
    }
    const amount = Number(prepaymentForm.invoice_amount);
    if (!prepaymentForm.invoice_date || !Number.isFinite(amount) || amount <= 0) {
      alert('请填写有效的预存金额和开票日期');
      return;
    }

    const giftAmount = Number(prepaymentForm.gift_amount || 0);
    const prepaymentTotalAmount = prepaymentForm.prepayment_total_amount === ''
      ? amount + (Number.isFinite(giftAmount) ? giftAmount : 0)
      : Number(prepaymentForm.prepayment_total_amount);
    if (!Number.isFinite(giftAmount) || giftAmount < 0 || !Number.isFinite(prepaymentTotalAmount) || prepaymentTotalAmount < amount) {
      alert('请检查赠送金额和预存总额');
      return;
    }

    try {
      await api.createSettlement({
        settlement_type: 'prepayment',
        payer_id: prepaymentForm.payer_id,
        prepayment_type: prepaymentForm.prepayment_type || 'normal',
        customer_id: selectedPayer.customer_id || null,
        customer_name: selectedPayer.customer_name || null,
        invoice_number: prepaymentForm.invoice_number,
        invoice_date: prepaymentForm.invoice_date,
        invoice_amount: amount,
        gift_amount: giftAmount,
        prepayment_total_amount: prepaymentTotalAmount,
        received_amount: prepaymentForm.received_amount ? Number(prepaymentForm.received_amount) : amount,
        received_date: prepaymentForm.received_date || prepaymentForm.invoice_date,
        payment_status: prepaymentForm.payment_status || '已到款',
        remarks: prepaymentForm.remarks || null
      });
      alert('预存充值流水已创建，等待管理员审批');
      setShowPrepaymentModal(false);
      setPrepaymentForm({
        payer_id: '',
        prepayment_type: 'normal',
        invoice_number: '',
        invoice_date: '',
        invoice_amount: '',
        gift_amount: '',
        prepayment_total_amount: '',
        received_amount: '',
        received_date: '',
        payment_status: '已到款',
        remarks: ''
      });
      setPrepaymentPayerQuery('');
      setPrepaymentPayerResults([]);
      setShowPrepaymentPayerDropdown(false);
      loadSettlements();
    } catch (e) {
      alert('创建预存充值流水失败: ' + e.message);
    }
  }

  async function handleApproval(settlement, action) {
    const actionText = action === 'approved' ? '审批通过' : '审批退回';
    if (!window.confirm(`确定要${actionText}这条流水吗？`)) return;
    try {
      await api.approveSettlement(settlement.settlement_id, { action });
      alert(`${actionText}成功`);
      loadSettlements();
    } catch (e) {
      alert(`${actionText}失败: ` + e.message);
    }
  }

  // 检查用户权限
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  // 管理员、部门ID为5的室主任或业务员可以访问
  const canAccessSettlement = () => {
    if (user?.role === 'admin') return true;
    if (user?.role === 'leader' && Number(user?.department_id) === 5) return true;
    if (user?.role === 'sales') return true;
    return false;
  };

  // 检查用户是否有权限编辑结算相关功能（业务员只能查看，不能编辑）
  const canEditSettlement = () => {
    if (user?.role === 'admin') return true;
    if (user?.role === 'leader' && Number(user?.department_id) === 5) return true;
    return false;
  };

  const canDeleteSettlement = (settlement) => {
    if (canEditSettlement()) return true;
    return user?.role === 'sales' &&
      settlement?.settlement_type === 'invoice' &&
      !settlement?.invoice_number &&
      settlement?.approval_status !== 'approved';
  };

  const canApproveSettlement = () => {
    return user?.role === 'admin' && String(user?.user_id) === 'JC0061';
  };

  const renderSettlementActions = (settlement) => {
    if (editingSettlement?.settlement_id === settlement.settlement_id) {
      return (
        <div className="settlement-action-buttons">
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSaveEdit}
          >
            保存
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleCancelEdit}
          >
            取消
          </button>
        </div>
      );
    }

    if (!canEditSettlement() && !canDeleteSettlement(settlement)) {
      return <span style={{ color: '#999' }}>仅查看</span>;
    }

    return (
      <div className="settlement-action-buttons">
        {canEditSettlement() && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => handleEdit(settlement)}
          >
            编辑
          </button>
        )}
        {canDeleteSettlement(settlement) && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => handleDelete(settlement)}
          >
            删除
          </button>
        )}
        {canApproveSettlement() && settlement.approval_status === 'pending' && (
          <button
            className="btn btn-success btn-sm"
            onClick={() => handleApproval(settlement, 'approved')}
          >
            审批通过
          </button>
        )}
        {canApproveSettlement() && settlement.approval_status === 'pending' && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleApproval(settlement, 'rejected')}
          >
            退回
          </button>
        )}
      </div>
    );
  };

  const renderInvoiceNumber = (invoiceNumber) => {
    if (!invoiceNumber) return '-';
    return String(invoiceNumber)
      .split('-')
      .map(part => part.trim())
      .filter(Boolean)
      .map((part, index) => (
        <div className="settlement-invoice-line" key={`${part}-${index}`}>
          {part}
        </div>
      ));
  };

  const renderSettlementSerial = (settlement) => {
    const serial = settlement.settlement_serial_number || settlement.prepayment_serial_number;
    if (!serial) return '-';
    if (!settlement.settlement_serial_number) return serial;
    return (
      <Link
        to={`/commission-form?settlement_serial=${encodeURIComponent(settlement.settlement_serial_number)}`}
        className="settlement-serial-link"
      >
        {settlement.settlement_serial_number}
      </Link>
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!canAccessSettlement()) {
    return (
      <div>
        <h2>费用结算</h2>
        <div style={{ padding: '20px', textAlign: 'center', color: '#dc3545' }}>
          您没有权限访问此页面，仅管理员、特定部门领导和业务员可以使用。
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2>费用结算</h2>

      <div className="settlements-toolbar">
        <div className="settlements-filter-group">
          <div className="settlements-filter-item settlements-search-item">
            <label>搜索:</label>
            <input
              className="input settlements-search-input"
              value={settlementFilters.keyword}
              onChange={(e) => updateSettlementFilter('keyword', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (page !== 1) {
                    setPage(1);
                  } else {
                    loadSettlements();
                  }
                }
              }}
              placeholder="流水号 / 票号 / 委托单号组 / 付款方 / 客户名称"
            />
            <button
              className="btn btn-primary settlements-search-button"
              onClick={() => {
                if (page !== 1) {
                  setPage(1);
                } else {
                  loadSettlements();
                }
              }}
            >
              搜索
            </button>
          </div>
          <div className="settlements-filter-item">
            <label>开票类型:</label>
            <select
              className="input settlements-filter-select"
              value={settlementFilters.settlement_type}
              onChange={(e) => updateSettlementFilter('settlement_type', e.target.value)}
            >
              <option value="">全部类型</option>
              <option value="invoice">开票结算</option>
              <option value="prepaid">预存抵扣</option>
              <option value="prepayment">预存充值</option>
            </select>
          </div>
          <div className="settlements-filter-item">
            <label>到款情况:</label>
            <select
              className="input settlements-filter-select"
              value={settlementFilters.payment_status}
              onChange={(e) => updateSettlementFilter('payment_status', e.target.value)}
            >
              <option value="">全部到款</option>
              <option value="未到款">未到款</option>
              <option value="部分到款">部分到款</option>
              <option value="已到款">已到款</option>
            </select>
          </div>
          <div className="settlements-filter-item">
            <label>审批情况:</label>
            <select
              className="input settlements-filter-select"
              value={settlementFilters.approval_status}
              onChange={(e) => updateSettlementFilter('approval_status', e.target.value)}
            >
              <option value="">全部审批</option>
              <option value="pending">待审批</option>
              <option value="approved">已通过</option>
              <option value="rejected">已退回</option>
            </select>
          </div>
          <div className="settlements-filter-item">
            <label>创建时间:</label>
            <input
              type="date"
              className="input settlements-filter-date"
              value={settlementFilters.created_start}
              onChange={(e) => updateSettlementFilter('created_start', e.target.value)}
            />
            <span className="settlements-filter-date-separator">至</span>
            <input
              type="date"
              className="input settlements-filter-date"
              value={settlementFilters.created_end}
              onChange={(e) => updateSettlementFilter('created_end', e.target.value)}
            />
          </div>
          {(settlementFilters.keyword || settlementFilters.settlement_type || settlementFilters.payment_status || settlementFilters.approval_status || settlementFilters.created_start || settlementFilters.created_end) && (
            <button
              className="btn btn-secondary settlements-filter-reset"
              onClick={() => {
                setPage(1);
                setSettlementFilters({
                  keyword: '',
                  settlement_type: '',
                  payment_status: '',
                  approval_status: '',
                  created_start: '',
                  created_end: ''
                });
              }}
            >
              重置
            </button>
          )}
        </div>
        <button className="btn btn-primary settlements-prepayment-btn" onClick={() => setShowPrepaymentModal(true)}>
          新增预存充值
        </button>
      </div>

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

      {showPrepaymentModal && (
        <div className="file-modal-overlay" onClick={() => setShowPrepaymentModal(false)}>
          <div className="file-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h3>新增预存充值</h3>
              <button className="close-button" onClick={() => setShowPrepaymentModal(false)}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'center' }}>
              <label>付款方</label>
              <div className="settlements-payer-search">
                <input
                  className="input"
                  value={prepaymentPayerQuery}
                  onChange={(e) => handlePrepaymentPayerInput(e.target.value)}
                  onFocus={() => {
                    if (prepaymentPayerResults.length > 0) {
                      setShowPrepaymentPayerDropdown(true);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowPrepaymentPayerDropdown(false), 160);
                  }}
                  placeholder="输入付款方名称或客户名称搜索"
                />
                {showPrepaymentPayerDropdown && prepaymentPayerResults.length > 0 && (
                  <div className="settlements-payer-dropdown">
                    {prepaymentPayerResults.map((payer) => (
                      <button
                        type="button"
                        key={payer.payer_id}
                        className="settlements-payer-option"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectPrepaymentPayer(payer)}
                      >
                        <span className="settlements-payer-option-main">{payer.contact_name || '-'}</span>
                        <span className="settlements-payer-option-sub">{payer.customer_name || '-'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label>预存类型</label>
              <select
                className="input"
                value={prepaymentForm.prepayment_type}
                onChange={(e) => setPrepaymentForm({ ...prepaymentForm, prepayment_type: e.target.value })}
              >
                <option value="normal">正常预存</option>
                <option value="paper_award">论文奖励</option>
              </select>

              <label>发票票号</label>
              <input
                className="input"
                value={prepaymentForm.invoice_number}
                onChange={(e) => setPrepaymentForm({ ...prepaymentForm, invoice_number: e.target.value })}
                placeholder="预存充值审批前必须填写"
              />

              <label>开票日期</label>
              <input
                className="input"
                type="date"
                value={prepaymentForm.invoice_date}
                onChange={(e) => setPrepaymentForm({ ...prepaymentForm, invoice_date: e.target.value })}
              />

              <label>预存金额</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={prepaymentForm.invoice_amount}
                onChange={(e) => setPrepaymentForm({
                  ...prepaymentForm,
                  invoice_amount: e.target.value,
                  received_amount: prepaymentForm.received_amount || e.target.value,
                  prepayment_total_amount: Number(e.target.value || 0) + Number(prepaymentForm.gift_amount || 0)
                })}
              />

              <label>赠送金额</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={prepaymentForm.gift_amount}
                onChange={(e) => setPrepaymentForm({
                  ...prepaymentForm,
                  gift_amount: e.target.value,
                  prepayment_total_amount: Number(prepaymentForm.invoice_amount || 0) + Number(e.target.value || 0)
                })}
              />

              <label>预存总额</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={prepaymentForm.prepayment_total_amount}
                onChange={(e) => setPrepaymentForm({ ...prepaymentForm, prepayment_total_amount: e.target.value })}
              />

              <label>到账金额</label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                value={prepaymentForm.received_amount}
                onChange={(e) => setPrepaymentForm({ ...prepaymentForm, received_amount: e.target.value })}
              />

              <label>到账日期</label>
              <input
                className="input"
                type="date"
                value={prepaymentForm.received_date}
                onChange={(e) => setPrepaymentForm({ ...prepaymentForm, received_date: e.target.value })}
              />

              <label>到款情况</label>
              <select
                className="input"
                value={prepaymentForm.payment_status}
                onChange={(e) => setPrepaymentForm({ ...prepaymentForm, payment_status: e.target.value })}
              >
                <option value="已到款">已到款</option>
                <option value="部分到款">部分到款</option>
                <option value="未到款">未到款</option>
              </select>

              <label>备注</label>
              <input
                className="input"
                value={prepaymentForm.remarks}
                onChange={(e) => setPrepaymentForm({ ...prepaymentForm, remarks: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setShowPrepaymentModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreatePrepayment}>创建预存流水</button>
            </div>
          </div>
        </div>
      )}

      <div className="table-container settlements-table-container" style={{ marginTop: '20px' }}>
        <div className="settlements-table-info">
          <span>共 {total} 条记录，每页 {pageSize} 条</span>
          <div className="settlements-pagination">
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              首页
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
            >
              上一页
            </button>
            <span className="settlements-page-info">
              第 {page} 页，共 {totalPages} 页
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            >
              下一页
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              末页
            </button>
          </div>
        </div>
        <div className="settlements-table-scroll">
        <table className={`table settlements-table ${editingSettlement ? 'settlements-table-editing' : ''}`}>
          <thead>
            <tr>
              <th>流水号</th>
              <th>票号</th>
              <th>类型</th>
              <th>开票日期</th>
              <th>委托单号组</th>
              <th>付款方</th>
              <th>客户名称</th>
              <th>开票金额</th>
              <th>到账金额</th>
              {DEPARTMENT_ALLOCATION_COLUMNS.map((col) => (
                <th key={col.key} className="settlements-dept-col">{col.label}</th>
              ))}
              <th>到账日期</th>
              <th>备注</th>
              <th>业务人员</th>
              <th>企业性质</th>
              <th>到款情况</th>
              <th>审批状态</th>
              <th className="settlements-action-col">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="22" style={{ textAlign: 'center', padding: '20px' }}>
                  加载中...
                </td>
              </tr>
            ) : settlements.length === 0 ? (
              <tr>
                <td colSpan="22" style={{ textAlign: 'center', padding: '20px' }}>
                  暂无匹配的结算记录
                </td>
              </tr>
            ) : (
              settlements.map(settlement => (
                <tr
                  key={settlement.settlement_id}
                  className={editingSettlement?.settlement_id === settlement.settlement_id ? 'settlement-row-editing' : ''}
                >
                  {editingSettlement?.settlement_id === settlement.settlement_id ? (
                    <>
                      <td>{renderSettlementSerial(settlement)}</td>
                      <td>
                        <input
                          type="text"
                          className="input"
                          value={editForm.invoice_number}
                          onChange={(e) => setEditForm({ ...editForm, invoice_number: e.target.value })}
                          placeholder="票号"
                          style={{ width: '130px', padding: '4px' }}
                        />
                      </td>
                      <td>{getSettlementTypeText(settlement)}</td>
                      <td>
                        <input
                          type="date"
                          className="input"
                          value={editForm.invoice_date}
                          onChange={(e) => setEditForm({ ...editForm, invoice_date: e.target.value })}
                          style={{ width: '150px', padding: '4px' }}
                        />
                      </td>
                      <td className="settlement-detail-cell">
                        <DetailViewLink
                          text={settlement.order_ids || ''}
                          maxLength={18}
                          fieldName="委托单号组"
                          className="settlement-detail-link"
                        />
                      </td>
                      <td>
                        <select
                          className="input"
                          value={editForm.payer_id || ''}
                          onChange={(e) => setEditForm({ ...editForm, payer_id: e.target.value })}
                          style={{ width: '160px', padding: '4px' }}
                        >
                          <option value="">请选择</option>
                          {payerOptions.map(payer => (
                            <option key={payer.payer_id} value={payer.payer_id}>
                              {payer.label}
                            </option>
                          ))}
                        </select>
                      </td>
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
                      {DEPARTMENT_ALLOCATION_COLUMNS.map((col) => (
                        <td key={col.key} className="settlement-money-cell settlements-dept-col">
                          {formatCurrency(settlement[col.key] || 0)}
                        </td>
                      ))}
                      <td>
                        <input
                          type="date"
                          className="input"
                          value={editForm.received_date}
                          onChange={(e) => setEditForm({ ...editForm, received_date: e.target.value })}
                          style={{ width: '170px', padding: '4px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="input"
                          value={editForm.remarks}
                          onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                          placeholder="备注"
                          style={{ width: '180px', padding: '4px' }}
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
                        <span style={{ color: getApprovalStatusColor(settlement.approval_status), fontWeight: 'bold' }}>
                          {getApprovalStatusText(settlement.approval_status)}
                        </span>
                      </td>
                      <td className="settlements-action-col">{renderSettlementActions(settlement)}</td>
                    </>
                  ) : (
                    <>
                      <td>{renderSettlementSerial(settlement)}</td>
                      <td className="settlement-invoice-cell">{renderInvoiceNumber(settlement.invoice_number)}</td>
                      <td>{getSettlementTypeText(settlement)}</td>
                      <td>{formatDate(settlement.invoice_date)}</td>
                      <td className="settlement-detail-cell">
                        <DetailViewLink
                          text={settlement.order_ids || ''}
                          maxLength={18}
                          fieldName="委托单号组"
                          className="settlement-detail-link"
                        />
                      </td>
                      <td className="settlement-detail-cell">
                        <DetailViewLink
                          text={settlement.payer_contact_name ? `${settlement.payer_contact_name} (${settlement.payer_customer_name || ''})` : ''}
                          maxLength={14}
                          fieldName="付款方"
                          className="settlement-detail-link"
                        />
                      </td>
                      <td className="settlement-detail-cell">
                        <DetailViewLink
                          text={settlement.display_customer_name || settlement.customer_name || ''}
                          maxLength={12}
                          fieldName="客户名称"
                          className="settlement-detail-link"
                        />
                      </td>
                      <td className="settlement-money-cell">{formatCurrency(settlement.invoice_amount)}</td>
                      <td className="settlement-money-cell">{formatCurrency(settlement.received_amount)}</td>
                      {DEPARTMENT_ALLOCATION_COLUMNS.map((col) => (
                        <td key={col.key} className="settlement-money-cell settlements-dept-col">
                          {formatCurrency(settlement[col.key] || 0)}
                        </td>
                      ))}
                      <td>{formatDate(settlement.received_date)}</td>
                      <td className="settlement-detail-cell settlement-remarks-cell">
                        <DetailViewLink
                          text={settlement.remarks || ''}
                          maxLength={24}
                          fieldName="备注"
                          className="settlement-detail-link"
                        />
                      </td>
                      <td className="settlement-detail-cell">
                        <DetailViewLink
                          text={settlement.assignee_name || ''}
                          maxLength={8}
                          fieldName="业务人员"
                          className="settlement-detail-link"
                        />
                      </td>
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
                        <span
                          style={{
                            color: getApprovalStatusColor(settlement.approval_status),
                            fontWeight: 'bold'
                          }}
                        >
                          {getApprovalStatusText(settlement.approval_status)}
                        </span>
                      </td>
                      <td className="settlements-action-col">{renderSettlementActions(settlement)}</td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
