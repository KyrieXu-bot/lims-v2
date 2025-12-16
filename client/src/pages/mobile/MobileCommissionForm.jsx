import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useSocket } from '../../hooks/useSocket.js';
import SimpleFileUpload from '../../components/SimpleFileUpload.jsx';
import './MobileCommissionForm.css';

const MobileCommissionForm = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const { socket } = useSocket('commission-form');

  // 获取委托单数据
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        page: '1',
        pageSize: '50'
      });
      
      if (statusFilter.length > 0) {
        statusFilter.forEach(status => params.append('status', status));
      }

      const response = await fetch(`/api/commission-form/commission-form?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        setData(result.data || []);
      }
    } catch (error) {
      console.error('获取数据失败:', error);
      alert('获取数据失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.token) {
      fetchData();
    }
  }, [searchQuery, statusFilter]);

  // 监听实时更新
  useEffect(() => {
    if (!socket) return;

    const handleDataUpdate = (data) => {
      setData(prevData =>
        prevData.map(item =>
          item.test_item_id === data.testItemId
            ? { ...item, [data.field]: data.value }
            : item
        )
      );
    };

    socket.on('data-updated', handleDataUpdate);
    return () => {
      socket.off('data-updated', handleDataUpdate);
    };
  }, [socket]);

  // 打开详情/编辑页面
  const handleItemClick = (item) => {
    setSelectedItem(item);
    setShowDetailModal(true);
  };

  // 状态筛选
  const statusOptions = [
    { value: 'new', label: '新建' },
    { value: 'assigned', label: '已分配' },
    { value: 'running', label: '进行中' },
    { value: 'completed', label: '已完成' },
    { value: 'cancelled', label: '已取消' }
  ];

  const toggleStatusFilter = (status) => {
    setStatusFilter(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const getStatusBadgeClass = (status) => {
    const statusMap = {
      'new': 'status-new',
      'assigned': 'status-assigned',
      'running': 'status-running',
      'completed': 'status-completed',
      'cancelled': 'status-cancelled'
    };
    return statusMap[status] || '';
  };

  const getStatusLabel = (status) => {
    const statusMap = {
      'new': '新建',
      'assigned': '已分配',
      'running': '进行中',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    return statusMap[status] || status;
  };

  return (
    <div className="mobile-commission-form">
      {/* 搜索栏 */}
      <div className="mobile-search-bar">
        <input
          type="text"
          placeholder="搜索项目编号、委托单位..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mobile-search-input"
        />
      </div>

      {/* 状态筛选 */}
      <div className="mobile-status-filters">
        {statusOptions.map(option => (
          <button
            key={option.value}
            className={`mobile-status-filter-btn ${statusFilter.includes(option.value) ? 'active' : ''}`}
            onClick={() => toggleStatusFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="mobile-loading">加载中...</div>
      ) : data.length === 0 ? (
        <div className="mobile-empty">暂无数据</div>
      ) : (
        <div className="mobile-commission-list">
          {data.map(item => (
            <div
              key={item.test_item_id}
              className="mobile-commission-card"
              onClick={() => handleItemClick(item)}
            >
              <div className="mobile-card-header">
                <div className="mobile-card-title">
                  <span className="mobile-test-code">{item.order_id_display || item.order_id || '未编号'}</span>
                  <span className={`mobile-status-badge ${getStatusBadgeClass(item.status)}`}>
                    {getStatusLabel(item.status)}
                  </span>
                </div>
              </div>
              
              <div className="mobile-card-body">
                {item.customer_name && (
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">委托单位:</span>
                    <span className="mobile-card-value">{item.customer_name}</span>
                  </div>
                )}
                {item.detail_name && (
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">检测项目:</span>
                    <span className="mobile-card-value">{item.detail_name}</span>
                  </div>
                )}
                {item.supervisor_name && (
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">负责人:</span>
                    <span className="mobile-card-value">{item.supervisor_name}</span>
                  </div>
                )}
                {item.technician_name && (
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">测试人员:</span>
                    <span className="mobile-card-value">{item.technician_name}</span>
                  </div>
                )}
                {item.final_unit_price !== null && item.final_unit_price !== undefined && (
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">测试总价:</span>
                    <span className="mobile-card-value mobile-price">¥{Number(item.final_unit_price).toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 详情/编辑模态框 */}
      {showDetailModal && selectedItem && (
        <MobileCommissionDetail
          item={selectedItem}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedItem(null);
          }}
          onUpdate={fetchData}
        />
      )}
    </div>
  );
};

// 详情/编辑组件
const MobileCommissionDetail = ({ item, onClose, onUpdate }) => {
  const [formData, setFormData] = useState(item);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('basic'); // basic, test, notes, files
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');

  // 计算组长部门ID
  const leaderDepartmentId = user?.department_id ? Number(user.department_id) : null;

  // 组长权限检查函数
  const canLeaderEditItem = (item) => {
    if (!item) {
      return leaderDepartmentId === 5;
    }
    const itemDept = Number(item.department_id);
    if (leaderDepartmentId === 5) {
      return itemDept === 5;
    }
    if (leaderDepartmentId !== null) {
      return itemDept === leaderDepartmentId;
    }
    return false;
  };

  // 根据角色确定可编辑字段（与浏览器版本同步）
  const canEditField = (field) => {
    const role = user?.role;
    if (!role) return false;
    if (formData && formData.status === 'cancelled') {
      return false;
    }
    if (role === 'admin') {
      return true;
    }
    if (role === 'leader') {
      return canLeaderEditItem(formData);
    }
    if (role === 'sales') {
      return ['final_unit_price', 'business_note'].includes(field);
    }
    if (role === 'employee') {
      return [
        'technician_name', 'field_test_time', 'equipment_name',
        'actual_sample_quantity', 'unit', 'work_hours', 'machine_hours',
        'test_notes'
      ].includes(field);
    }
    if (role === 'supervisor') {
      const baseFields = [
        'supervisor_name', 'unit_price', 'technician_name', 'assignment_note',
        'field_test_time', 'equipment_name'
      ];
      // 如果组长将自己分配为实验员，则额外允许编辑计费数量、单位、机时、工时、价格
      if (formData && formData.technician_name === user?.name) {
        const extendedFields = [
          ...baseFields,
          'actual_sample_quantity', 'unit', 'work_hours', 'machine_hours', 'final_unit_price'
        ];
        return extendedFields.includes(field);
      }
      return baseFields.includes(field);
    }
    return false;
  };

  const handleFieldChange = async (field, value) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);

    // 实时保存
    try {
      setSaving(true);
      await api.updateTestItem(item.test_item_id, { [field]: value });
      if (onUpdate) onUpdate();
    } catch (error) {
      alert('保存失败: ' + error.message);
      // 恢复原值
      setFormData(formData);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (label, field, type = 'text', options = null) => {
    const isEditable = canEditField(field);
    const value = formData[field] || '';

    return (
      <div className="mobile-form-field">
        <label className="mobile-form-label">{label}</label>
        {isEditable ? (
          type === 'select' && options ? (
            <select
              className="mobile-form-input"
              value={value}
              onChange={(e) => handleFieldChange(field, e.target.value)}
            >
              <option value="">请选择</option>
              {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : type === 'textarea' ? (
            <textarea
              className="mobile-form-input mobile-form-textarea"
              value={value}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              placeholder={`请输入${label}`}
              rows={4}
            />
          ) : (
            <input
              type={type}
              className="mobile-form-input"
              value={value}
              onChange={(e) => handleFieldChange(field, e.target.value)}
              placeholder={`请输入${label}`}
            />
          )
        ) : (
          <div className="mobile-form-readonly">{value || '-'}</div>
        )}
      </div>
    );
  };

  return (
    <div className="mobile-detail-modal">
      <div className="mobile-detail-overlay" onClick={onClose} />
      <div className="mobile-detail-content">
        <div className="mobile-detail-header">
          <h2>委托单详情</h2>
          <button className="mobile-detail-close" onClick={onClose}>✕</button>
        </div>

        <div className="mobile-detail-tabs">
          <button
            className={`mobile-detail-tab ${activeTab === 'basic' ? 'active' : ''}`}
            onClick={() => setActiveTab('basic')}
          >
            基本信息
          </button>
          <button
            className={`mobile-detail-tab ${activeTab === 'test' ? 'active' : ''}`}
            onClick={() => setActiveTab('test')}
          >
            检测信息
          </button>
          <button
            className={`mobile-detail-tab ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            备注信息
          </button>
          <button
            className={`mobile-detail-tab ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            附件管理
          </button>
        </div>

        <div className="mobile-detail-body">
          {activeTab === 'basic' && (
            <div className="mobile-detail-section">
              <div className="mobile-form-field">
                <label className="mobile-form-label">委托单号</label>
                <div className="mobile-form-readonly">
                  {formData.order_id_display || formData.order_id || '-'}
                </div>
              </div>
              {renderField('委托单位', 'customer_name')}
              {renderField('检测项目', 'detail_name')}
              {renderField('项目编号', 'test_code')}
              {renderField('负责人', 'supervisor_name')}
              {renderField('业务负责人', 'assignee_name')}
              {renderField('状态', 'status', 'select', [
                { value: 'new', label: '新建' },
                { value: 'assigned', label: '已分配' },
                { value: 'running', label: '进行中' },
                { value: 'completed', label: '已完成' }
              ])}
            </div>
          )}

          {activeTab === 'test' && (
            <div className="mobile-detail-section">
              {renderField('测试人员', 'technician_name')}
              {renderField('检测设备', 'equipment_name')}
              {renderField('现场测试时间', 'field_test_time', 'datetime-local')}
              {renderField('计费数量', 'actual_sample_quantity', 'number')}
              {renderField('单位', 'unit')}
              {renderField('测试工时', 'work_hours', 'number')}
              {renderField('测试机时', 'machine_hours', 'number')}
              {renderField('测试总价', 'final_unit_price', 'number')}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="mobile-detail-section">
              {renderField('指派备注', 'assignment_note', 'textarea')}
              {renderField('实验备注', 'test_notes', 'textarea')}
              {renderField('业务备注', 'business_note', 'textarea')}
              {renderField('客户备注', 'customer_note', 'textarea')}
            </div>
          )}

          {activeTab === 'files' && (
            <div className="mobile-detail-section">
              <SimpleFileUpload
                testItemId={formData.test_item_id}
                orderId={formData.order_id}
                userRole={user?.role}
                businessConfirmed={formData.business_confirmed}
                currentAssignee={formData.current_assignee}
                enableUpload={false}
                onFileUploaded={() => {
                  // 文件上传后可以刷新数据
                  if (onUpdate) onUpdate();
                }}
              />
            </div>
          )}
        </div>

        {saving && (
          <div className="mobile-saving-indicator">保存中...</div>
        )}
      </div>
    </div>
  );
};

export default MobileCommissionForm;





