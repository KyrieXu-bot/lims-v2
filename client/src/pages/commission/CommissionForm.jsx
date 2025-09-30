import React, { useState, useEffect } from 'react';
import { api } from '../../api.js';
import CustomerDetailModal from './CustomerDetailModal.jsx';
import RealtimeEditableCell from './RealtimeEditableCell.jsx';
import SimpleFileUpload from '../../components/SimpleFileUpload.jsx';
import { useSocket } from '../../hooks/useSocket.js';
import './CommissionForm.css';

const CommissionForm = () => {
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
      console.log('获取数据成功:', data);
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
          <div className="filter-group">
            <label>搜索:</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索委托单号、客户名称、检测项目..."
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
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
              <option value="in_progress">进行中</option>
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
            <button onClick={handleSearch} className="btn-primary">搜索</button>
            <button onClick={handleReset} className="btn-secondary">重置</button>
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
                    <th>委托单号</th>
                    <th>收样日期</th>
                    <th>开单日期</th>
                    <th>委托单位</th>
                    <th>业务负责人</th>
                    <th>开票未到款金额</th>
                    <th>检测项目</th>
                    <th>项目编号</th>
                    <th>归属部门</th>
                    <th>收费标准</th>
                    <th>标准价</th>
                    <th>折扣</th>
                    <th>服务加急</th>
                    <th>现场测试时间</th>
                    <th>备注</th>
                    <th>检测设备</th>
                    <th>测试人员</th>
                    <th>测试样品数量</th>
                    <th>测试工时</th>
                    <th>测试机时</th>
                    <th>实际交付日期</th>
                    <th>项目状态</th>
                    <th>文件管理</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.test_item_id}>
                      <td>{item.order_id}</td>
                      <td>{formatDate(item.order_created_at)}</td>
                      <td>{formatDate(item.test_item_created_at)}</td>
                      <td>
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
                      <td>
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.assignee_name}
                            type="autocomplete"
                            options={assigneeOptions}
                            onSave={handleSaveEdit}
                            field="assignee_name"
                            testItemId={item.test_item_id}
                            placeholder="输入负责人姓名"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="assignee_name" />
                        </div>
                      </td>
                      <td>{item.unpaid_amount || ''}</td>
                      <td>{item.test_item_name || ''}</td>
                      <td>{item.test_code || ''}</td>
                      <td>{item.department_id || ''}</td>
                      <td>{formatCurrency(item.standard_price)}</td>
                      <td>{formatCurrency(item.unit_price)}</td>
                      <td>{formatPercentage(item.discount_rate)}</td>
                      <td>{item.service_urgency || ''}</td>
                      <td>
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
                      <td>
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
                      <td>
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
                      <td>
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
                      <td>
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
                      <td>
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
                      <td>
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
                      <td>
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
                      <td>
                        <span className={`status status-${item.status}`}>
                          {item.status === 'new' && '新建'}
                          {item.status === 'assigned' && '已分配'}
                          {item.status === 'in_progress' && '进行中'}
                          {item.status === 'completed' && '已完成'}
                          {item.status === 'cancelled' && '已取消'}
                          {item.status === 'outsource' && '委外'}
                        </span>
                      </td>
                      <td>
                        <button 
                          className="btn-file" 
                          onClick={() => toggleFileView(item)}
                          title="文件管理"
                        >
                          📁
                        </button>
                      </td>
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
    </div>
  );
};

export default CommissionForm;
