import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import CustomerDetailModal from './CustomerDetailModal.jsx';
import RealtimeEditableCell from './RealtimeEditableCell.jsx';
import SimpleFileUpload from '../../components/SimpleFileUpload.jsx';
import BatchFileUpload from '../../components/BatchFileUpload.jsx';
import { useSocket } from '../../hooks/useSocket.js';
import './CommissionForm.css';

const CommissionForm = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [selectedFileTestItem, setSelectedFileTestItem] = useState(null);
  const [showFileModal, setShowFileModal] = useState(false);
  const [user, setUser] = useState(null);
  const [savingStatus, setSavingStatus] = useState({}); // 保存状态：{testItemId-field: 'saving'|'success'|'error'}
  const [selectedItems, setSelectedItems] = useState([]); // 选中的检测项目ID列表
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  const [deletingItems, setDeletingItems] = useState(new Set()); // 正在删除的项目ID集合
  
  // WebSocket连接
  const {
    isConnected,
    onlineUsers,
    emitDataUpdate,
    emitUserEditing,
    emitUserStopEditing,
    getOnlineUserCount,
    isFieldBeingEdited,
    getEditingUser
  } = useSocket('commission-form');

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('开始获取委托单登记表数据...');
      
      // 直接使用fetch而不是通过api对象
      const params = new URLSearchParams({
        q: searchQuery,
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      
      if (statusFilter) params.append('status', statusFilter);
      if (departmentFilter) params.append('department_id', departmentFilter);

      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch(`/api/commission-form/commission-form?${params.toString()}`, { headers });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setData(data.data);
      setTotal(data.total);
    } catch (error) {
      console.error('获取委托单登记表数据失败:', error);
      console.error('错误详情:', error.message);
      console.error('错误堆栈:', error.stack);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchTechnicians();
    fetchEquipmentOptions();
    fetchAssigneeOptions();
    fetchDepartmentOptions();
    // 获取当前用户信息
    const currentUser = JSON.parse(localStorage.getItem('lims_user') || 'null');
    setUser(currentUser);
  }, [page, searchQuery, statusFilter, departmentFilter]);

  // 监听实时数据更新
  useEffect(() => {
    const handleDataUpdate = (event) => {
      const data = event.detail;
      console.log('收到实时数据更新:', data);
      setData(prevData => 
        prevData.map(item => 
          item.test_item_id === data.testItemId 
            ? { ...item, [data.field]: data.value }
            : item
        )
      );
    };

    window.addEventListener('realtime-data-update', handleDataUpdate);
    
    return () => {
      window.removeEventListener('realtime-data-update', handleDataUpdate);
    };
  }, []);

  const fetchTechnicians = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch('/api/users/technicians', { headers });
      if (response.ok) {
        const data = await response.json();
        setTechnicians(data);
      }
    } catch (error) {
      console.error('获取测试人员列表失败:', error);
    }
  };

  const fetchEquipmentOptions = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch('/api/commission-form/equipment-options', { headers });
      if (response.ok) {
        const data = await response.json();
        setEquipmentOptions(data);
      }
    } catch (error) {
      console.error('获取设备列表失败:', error);
    }
  };

  const fetchAssigneeOptions = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch('/api/commission-form/assignee-options', { headers });
      if (response.ok) {
        const data = await response.json();
        setAssigneeOptions(data);
      }
    } catch (error) {
      console.error('获取负责人列表失败:', error);
    }
  };

  const fetchDepartmentOptions = async () => {
    try {
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch('/api/commission-form/department-options', { headers });
      if (response.ok) {
        const data = await response.json();
        setDepartmentOptions(data);
      }
    } catch (error) {
      console.error('获取部门列表失败:', error);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleReset = () => {
    setSearchQuery('');
    setStatusFilter('');
    setDepartmentFilter('');
    setPage(1);
  };

  const handleCustomerClick = async (customerId) => {
    if (!customerId) return;
    
    try {
      const customer = await api.getCustomer(customerId);
      setSelectedCustomer(customer);
      setIsModalOpen(true);
    } catch (error) {
      console.error('获取客户详细信息失败:', error);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
  };

  const toggleFileView = (testItem) => {
    setSelectedFileTestItem(testItem);
    setShowFileModal(true);
  };

  const closeFileModal = () => {
    setShowFileModal(false);
    setSelectedFileTestItem(null);
  };

  // 处理单个项目选择
  const handleItemSelect = (testItemId, checked) => {
    if (checked) {
      setSelectedItems(prev => [...prev, testItemId]);
    } else {
      setSelectedItems(prev => prev.filter(id => id !== testItemId));
    }
  };

  // 处理全选
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(data.map(item => item.test_item_id));
    } else {
      setSelectedItems([]);
    }
  };

  // 批量上传文件
  const handleBatchUpload = () => {
    if (selectedItems.length === 0) {
      alert('请先选择要上传文件的检测项目');
      return;
    }
    setShowBatchUploadModal(true);
  };

  // 删除单个检测项目
  const handleDeleteItem = async (testItemId) => {
    if (!window.confirm('确定要删除这个检测项目吗？删除后将无法恢复，包括所有相关的分配、委外、样品等信息。')) {
      return;
    }
    
    try {
      setDeletingItems(prev => new Set(prev).add(testItemId));
      await api.deleteTestItem(testItemId);
      
      // 从本地数据中移除
      setData(prev => prev.filter(item => item.test_item_id !== testItemId));
      setTotal(prev => prev - 1);
      
      alert('检测项目删除成功');
    } catch (error) {
      alert('删除失败：' + error.message);
    } finally {
      setDeletingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(testItemId);
        return newSet;
      });
    }
  };

  // 批量删除检测项目
  const handleBatchDelete = async () => {
    if (selectedItems.length === 0) {
      alert('请先选择要删除的检测项目');
      return;
    }
    
    if (!window.confirm(`确定要删除选中的 ${selectedItems.length} 个检测项目吗？删除后将无法恢复，包括所有相关的分配、委外、样品等信息。`)) {
      return;
    }
    
    try {
      setDeletingItems(new Set(selectedItems));
      
      // 并行删除所有选中的项目
      await Promise.all(selectedItems.map(id => api.deleteTestItem(id)));
      
      // 从本地数据中移除
      setData(prev => prev.filter(item => !selectedItems.includes(item.test_item_id)));
      setTotal(prev => prev - selectedItems.length);
      setSelectedItems([]);
      
      alert(`成功删除 ${selectedItems.length} 个检测项目`);
    } catch (error) {
      alert('批量删除失败：' + error.message);
    } finally {
      setDeletingItems(new Set());
    }
  };


  const handleSaveEdit = async (field, value, testItemId) => {
    const statusKey = `${testItemId}-${field}`;
    
    try {
      // 设置保存中状态
      setSavingStatus(prev => ({ ...prev, [statusKey]: 'saving' }));
      
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      let updateData = { [field]: value };
      
      // 特殊处理测试人员字段：需要保存technician_id而不是technician_name
      if (field === 'technician_name') {
        // 根据姓名找到对应的technician_id
        const technician = technicians.find(t => t.name === value);
        if (technician) {
          updateData = { 
            technician_id: technician.id,
            technician_name: value 
          };
        } else {
          // 如果找不到对应的技术人员，清空technician_id
          updateData = { 
            technician_id: null,
            technician_name: value 
          };
        }
      }
      
      // 特殊处理检测设备字段：需要保存equipment_id而不是equipment_name
      if (field === 'equipment_name') {
        // 根据设备名称找到对应的equipment_id
        const equipment = equipmentOptions.find(e => e.name === value);
        if (equipment) {
          updateData = { 
            equipment_id: equipment.id,
            equipment_name: value 
          };
        } else {
          // 如果找不到对应的设备，清空equipment_id
          updateData = { 
            equipment_id: null,
            equipment_name: value 
          };
        }
      }
      
      // 特殊处理业务负责人字段：需要保存current_assignee而不是assignee_name
      if (field === 'assignee_name') {
        // 根据姓名找到对应的user_id
        const assignee = assigneeOptions.find(a => a.name === value);
        if (assignee) {
          updateData = { 
            current_assignee: assignee.id,
            assignee_name: value 
          };
        } else {
          // 如果找不到对应的负责人，清空current_assignee
          updateData = { 
            current_assignee: null,
            assignee_name: value 
          };
        }
      }
      
      // 特殊处理负责人字段：需要保存supervisor_id而不是supervisor_name
      if (field === 'supervisor_name') {
        // 根据姓名找到对应的user_id
        const supervisor = assigneeOptions.find(a => a.name === value);
        if (supervisor) {
          updateData = { 
            supervisor_id: supervisor.id,
            supervisor_name: value 
          };
        } else {
          // 如果找不到对应的负责人，清空supervisor_id
          updateData = { 
            supervisor_id: null,
            supervisor_name: value 
          };
        }
      }
      
      // 特殊处理现场测试时间字段：需要转换datetime-local格式
      if (field === 'field_test_time') {
        if (value === '' || value === undefined || value === null) {
          updateData = { field_test_time: null };
        } else {
          // datetime-local格式已经是MySQL DATETIME兼容的格式
          updateData = { field_test_time: value };
        }
      }
      
      const response = await fetch(`/api/test-items/${testItemId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error(`更新失败: ${response.status}`);
      }

      // 更新本地数据
      setData(prevData => 
        prevData.map(item => 
          item.test_item_id === testItemId 
            ? { ...item, ...updateData }
            : item
        )
      );

      // 发送实时更新通知
      emitDataUpdate(field, value, testItemId);

      // 设置保存成功状态
      setSavingStatus(prev => ({ ...prev, [statusKey]: 'success' }));
      
      // 2秒后清除成功状态
      setTimeout(() => {
        setSavingStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[statusKey];
          return newStatus;
        });
      }, 2000);

      console.log('更新成功:', field, value);
    } catch (error) {
      console.error('保存编辑失败:', error);
      // 设置保存失败状态
      setSavingStatus(prev => ({ ...prev, [statusKey]: 'error' }));
      
      // 3秒后清除错误状态
      setTimeout(() => {
        setSavingStatus(prev => {
          const newStatus = { ...prev };
          delete newStatus[statusKey];
          return newStatus;
        });
      }, 3000);
      
      throw error;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('zh-CN');
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const formatCurrency = (amount) => {
    if (!amount) return '';
    return `¥${Number(amount).toFixed(2)}`;
  };

  const formatPercentage = (rate) => {
    if (!rate) return '';
    return `${(Number(rate) * 100).toFixed(1)}%`;
  };

  // 保存状态指示器组件
  const SavingIndicator = ({ testItemId, field }) => {
    const statusKey = `${testItemId}-${field}`;
    const status = savingStatus[statusKey];
    
    if (!status) return null;
    
    return (
      <span className={`saving-indicator saving-${status}`}>
        {status === 'saving' && '💾 保存中...'}
        {status === 'success' && '✅ 保存成功'}
        {status === 'error' && '❌ 保存失败'}
      </span>
    );
  };

  return (
    <div className="commission-form">
      {/* 搜索和筛选区域 - 首行 */}
      <div className="filters">
        <div className="filter-row">
          <div className="filter-group search-group">
            <label>搜索:</label>
            <div className="search-input-container">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索委托单号、客户名称、检测项目..."
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <div className="search-buttons">
                <button onClick={handleSearch} className="btn btn-primary btn-small">搜索</button>
                <button onClick={handleReset} className="btn btn-secondary btn-small">重置</button>
              </div>
            </div>
          </div>
          <div className="filter-group">
            <label>状态:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">全部状态</option>
              <option value="new">新建</option>
              <option value="assigned">已分配</option>
              <option value="running">进行中</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
              <option value="outsource">委外</option>
            </select>
          </div>
          {user?.role === 'admin' && (
            <div className="filter-group">
              <label>部门:</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="">全部部门</option>
                {departmentOptions.map(dept => (
                  <option key={dept.department_id} value={dept.department_id}>
                    {dept.department_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="filter-actions">
            <button 
              onClick={() => navigate('/test-items/new')} 
              className="btn btn-info"
            >
              添加检测
            </button>
            <button 
              onClick={handleBatchUpload} 
              className="btn btn-success"
              disabled={selectedItems.length === 0}
            >
              一键上传 ({selectedItems.length})
            </button>
            {user?.role === 'admin' && (
              <button 
                onClick={handleBatchDelete} 
                className="btn btn-danger"
                disabled={selectedItems.length === 0}
                style={{backgroundColor: '#dc3545', color: 'white'}}
              >
                批量删除 ({selectedItems.length})
              </button>
            )}
          </div>
          <div className="online-indicator">
            {isConnected ? `🟢 在线 (${getOnlineUserCount()} 人)` : '🔴 离线'}
          </div>
        </div>
      </div>

      {/* 数据表格 */}
      <div className="table-container">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : (
          <>
            <div className="table-info">
              共 {total} 条记录，当前第 {page} 页
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <input 
                        type="checkbox" 
                        checked={data.length > 0 && data.every(item => selectedItems.includes(item.test_item_id))}
                        onChange={handleSelectAll}
                        title="全选"
                      />
                    </th>
                    <th className="order-creator-field">委托单号</th>
                    <th className="order-creator-field">收样日期</th>
                    <th className="order-creator-field">开单日期</th>
                    <th className="order-creator-field">委托单位</th>
                    <th className="order-creator-field">业务负责人</th>
                    <th className="order-creator-field">检测项目</th>
                    <th className="order-creator-field">项目编号</th>
                    <th className="order-creator-field">归属部门</th>
                    <th className="order-creator-field">收费标准</th>
                    <th className="order-creator-field">价格备注</th>
                    <th className="order-creator-field">标准价</th>
                    <th className="order-creator-field">折扣</th>
                    <th className="order-creator-field">备注</th>
                    <th className="order-creator-field">样品到达方式</th>
                    <th className="order-creator-field">样品是否已到</th>
                    <th className="order-creator-field">服务加急</th>
                    <th className="lab-field">现场测试时间</th>
                    <th className="lab-field">检测设备</th>
                    <th className="lab-field">负责人</th>
                    <th className="lab-field">测试人员</th>
                    <th className="lab-field">数量</th>
                    <th className="lab-field">测试样品数量</th>
                    <th className="lab-field">测试工时</th>
                    <th className="lab-field">测试机时</th>
                    <th className="lab-field">实际交付日期</th>
                    <th className="lab-field">开票未到款金额</th>
                    <th className="lab-field">项目状态</th>
                    <th className="lab-field">文件管理</th>
                    {user?.role === 'admin' && <th>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.test_item_id}>
                      <td>
                        <input 
                          type="checkbox" 
                          checked={selectedItems.includes(item.test_item_id)}
                          onChange={(e) => handleItemSelect(item.test_item_id, e.target.checked)}
                        />
                      </td>
                      <td className="order-creator-field">{item.order_id}</td>
                      <td className="order-creator-field">{formatDate(item.order_created_at)}</td>
                      <td className="order-creator-field">{formatDate(item.test_item_created_at)}</td>
                      <td className="order-creator-field">
                        {item.customer_name ? (
                          <span 
                            className="clickable-customer" 
                            onClick={() => handleCustomerClick(item.customer_id)}
                            title="点击查看客户详细信息"
                          >
                            {item.customer_name}
                          </span>
                        ) : ''}
                      </td>
                      <td className="order-creator-field">
                        <span className="readonly-field">{item.assignee_name || ''}</span>
                      </td>
                      <td className="order-creator-field">{item.test_item_name || ''}</td>
                      <td className="order-creator-field">{item.test_code || ''}</td>
                      <td className="order-creator-field">{item.department_name || ''}</td>
                      <td className="order-creator-field">{formatCurrency(item.unit_price)}</td>
                      <td className="order-creator-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.price_note}
                            type="textarea"
                            onSave={handleSaveEdit}
                            field="price_note"
                            testItemId={item.test_item_id}
                            placeholder="输入价格备注"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="price_note" />
                        </div>
                      </td>
                      <td className="order-creator-field">{formatCurrency(item.standard_price)}</td>
                      <td className="order-creator-field">{formatPercentage(item.discount_rate)}</td>
                      <td className="order-creator-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.note}
                            type="textarea"
                            onSave={handleSaveEdit}
                            field="note"
                            testItemId={item.test_item_id}
                            placeholder="输入备注信息"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="note" />
                        </div>
                      </td>
                      <td className="order-creator-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.arrival_mode}
                            type="select"
                            options={[
                              { value: '', label: '请选择' },
                              { value: 'on_site', label: '现场' },
                              { value: 'delivery', label: '寄样' }
                            ]}
                            onSave={handleSaveEdit}
                            field="arrival_mode"
                            testItemId={item.test_item_id}
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="arrival_mode" />
                        </div>
                      </td>
                      <td className="order-creator-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.sample_arrival_status}
                            type="select"
                            options={[
                              { value: '', label: '请选择' },
                              { value: 'arrived', label: '已到' },
                              { value: 'not_arrived', label: '未到' }
                            ]}
                            onSave={handleSaveEdit}
                            field="sample_arrival_status"
                            testItemId={item.test_item_id}
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="sample_arrival_status" />
                        </div>
                      </td>
                      <td className="order-creator-field">{item.service_urgency || ''}</td>
                      <td className="lab-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.field_test_time}
                            type="datetime-local"
                            onSave={handleSaveEdit}
                            field="field_test_time"
                            testItemId={item.test_item_id}
                            placeholder="选择现场测试时间"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="field_test_time" />
                        </div>
                      </td>
                      <td className="lab-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.equipment_name}
                            type="autocomplete"
                            options={equipmentOptions}
                            onSave={handleSaveEdit}
                            field="equipment_name"
                            testItemId={item.test_item_id}
                            placeholder="输入设备名称"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="equipment_name" />
                        </div>
                      </td>
                      <td className="lab-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.supervisor_name}
                            type="autocomplete"
                            options={assigneeOptions}
                            onSave={handleSaveEdit}
                            field="supervisor_name"
                            testItemId={item.test_item_id}
                            placeholder="输入负责人姓名"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="supervisor_name" />
                        </div>
                      </td>
                      <td className="lab-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.technician_name}
                            type="autocomplete"
                            options={technicians}
                            onSave={handleSaveEdit}
                            field="technician_name"
                            testItemId={item.test_item_id}
                            placeholder="输入测试人员姓名"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="technician_name" />
                        </div>
                      </td>
                      <td className="lab-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.quantity}
                            type="number"
                            onSave={handleSaveEdit}
                            field="quantity"
                            testItemId={item.test_item_id}
                            placeholder="数量"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="quantity" />
                        </div>
                      </td>
                      <td className="lab-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.actual_sample_quantity}
                            type="number"
                            onSave={handleSaveEdit}
                            field="actual_sample_quantity"
                            testItemId={item.test_item_id}
                            placeholder="样品数量"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="actual_sample_quantity" />
                        </div>
                      </td>
                      <td className="lab-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.work_hours}
                            type="number"
                            onSave={handleSaveEdit}
                            field="work_hours"
                            testItemId={item.test_item_id}
                            placeholder="工时"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="work_hours" />
                        </div>
                      </td>
                      <td className="lab-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.machine_hours}
                            type="number"
                            onSave={handleSaveEdit}
                            field="machine_hours"
                            testItemId={item.test_item_id}
                            placeholder="机时"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="machine_hours" />
                        </div>
                      </td>
                      <td className="lab-field">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.actual_delivery_date}
                            type="date"
                            onSave={handleSaveEdit}
                            field="actual_delivery_date"
                            testItemId={item.test_item_id}
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="actual_delivery_date" />
                        </div>
                      </td>
                      <td className="lab-field">{item.unpaid_amount || ''}</td>
                      <td className="lab-field">
                        <span className={`status status-${item.status}`}>
                          {item.status === 'new' && '新建'}
                          {item.status === 'assigned' && '已分配'}
                          {item.status === 'running' && '进行中'}
                          {item.status === 'completed' && '已完成'}
                          {item.status === 'cancelled' && '已取消'}
                          {item.status === 'outsource' && '委外'}
                        </span>
                      </td>
                      <td className="lab-field">
                        <button 
                          className="btn-file" 
                          onClick={() => toggleFileView(item)}
                          title="文件管理"
                        >
                          📁
                        </button>
                      </td>
                      {user?.role === 'admin' && (
                        <td style={{minWidth: '180px', whiteSpace: 'nowrap'}}>
                          <div style={{display: 'flex', gap: '2px', alignItems: 'center'}}>
                            <button 
                              className="btn btn-info"
                              onClick={() => navigate(`/test-items/${item.test_item_id}?view=1`)}
                              title="查看检测项目"
                              style={{
                                padding: '2px 6px',
                                fontSize: '11px',
                                minWidth: 'auto',
                                lineHeight: '1.2'
                              }}
                            >
                              查看
                            </button>
                            <button 
                              className="btn btn-warning"
                              onClick={() => navigate(`/test-items/${item.test_item_id}`)}
                              title="编辑检测项目"
                              style={{
                                padding: '2px 6px',
                                fontSize: '11px',
                                minWidth: 'auto',
                                backgroundColor: '#ffc107',
                                color: '#000',
                                border: '1px solid #ffc107',
                                lineHeight: '1.2'
                              }}
                            >
                              编辑
                            </button>
                            <button 
                              className="btn-delete" 
                              onClick={() => handleDeleteItem(item.test_item_id)}
                              disabled={deletingItems.has(item.test_item_id)}
                              title="删除检测项目"
                              style={{
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                cursor: deletingItems.has(item.test_item_id) ? 'not-allowed' : 'pointer',
                                opacity: deletingItems.has(item.test_item_id) ? 0.6 : 1,
                                fontSize: '11px',
                                minWidth: 'auto',
                                lineHeight: '1.2'
                              }}
                            >
                              {deletingItems.has(item.test_item_id) ? '删除中...' : '删除'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {total > pageSize && (
              <div className="pagination">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="btn-secondary"
                >
                  上一页
                </button>
                <span className="page-info">
                  第 {page} 页，共 {Math.ceil(total / pageSize)} 页
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= Math.ceil(total / pageSize)}
                  className="btn-secondary"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 客户详细信息模态框 */}
      <CustomerDetailModal
        customer={selectedCustomer}
        isOpen={isModalOpen}
        onClose={closeModal}
      />

      {/* 文件管理模态框 */}
      {showFileModal && selectedFileTestItem && (
        <div className="file-modal-overlay" onClick={closeFileModal}>
          <div className="file-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="file-modal-header">
              <h3>文件管理 - 检测项目 #{selectedFileTestItem.test_item_id}</h3>
              <button className="close-button" onClick={closeFileModal}>×</button>
            </div>
            <div className="file-modal-body">
              <SimpleFileUpload
                testItemId={selectedFileTestItem.test_item_id}
                orderId={selectedFileTestItem.order_id}
                userRole={user?.role}
                onFileUploaded={() => {
                  console.log('文件上传成功');
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 批量上传模态框 */}
      {showBatchUploadModal && (
        <div className="file-modal-overlay" onClick={() => setShowBatchUploadModal(false)}>
          <div className="file-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="file-modal-header">
              <h3>批量上传文件 - 已选择 {selectedItems.length} 个检测项目</h3>
              <button className="close-button" onClick={() => setShowBatchUploadModal(false)}>×</button>
            </div>
            <div className="file-modal-body">
              <BatchFileUpload
                testItemIds={selectedItems}
                userRole={user?.role}
                onFileUploaded={() => {
                  console.log('批量文件上传成功');
                  setShowBatchUploadModal(false);
                  setSelectedItems([]);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionForm;
