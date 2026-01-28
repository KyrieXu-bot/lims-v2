import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { useSocket } from '../../hooks/useSocket.js';
import MobileFileUpload from '../../components/mobile/MobileFileUpload.jsx';
import Toast from '../../components/Toast.jsx';
import './MobileCommissionForm.css';

const MobileCommissionForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // 初始化searchQuery：优先从URL参数、location.state或sessionStorage获取
  // 使用函数形式初始化，确保在组件挂载时执行
  const getInitialSearchQuery = () => {
    try {
      // 检查URL参数
      const urlParams = new URLSearchParams(location.search);
      const urlSearchQuery = urlParams.get('q') || urlParams.get('search');
      
      // 检查location.state
      const stateSearchQuery = location.state?.searchQuery;
      
      // 检查sessionStorage
      const savedSearchQuery = sessionStorage.getItem('mobile_commission_notification_search');
      
      // 优先使用URL参数，其次使用location.state，最后使用sessionStorage
      const initialQuery = urlSearchQuery || stateSearchQuery || savedSearchQuery || '';
      
      if (initialQuery) {
        console.log('初始化searchQuery:', initialQuery, '来源:', urlSearchQuery ? 'URL' : stateSearchQuery ? 'state' : 'sessionStorage');
      }
      
      return initialQuery;
    } catch (error) {
      console.error('获取初始searchQuery失败:', error);
      return '';
    }
  };
  
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState(getInitialSearchQuery);
  const [statusFilter, setStatusFilter] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const pageSize = 100;
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  const { socket } = useSocket('commission-form');
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const initialSearchQuery = getInitialSearchQuery();
  const hasInitializedFromState = useRef(!!initialSearchQuery); // 如果初始值不为空，标记为已初始化
  const NOTIFICATION_SEARCH_KEY = 'mobile_commission_notification_search';

  // 获取委托单数据（初始加载或重置）
  const fetchData = async (reset = true) => {
    if (reset) {
      setLoading(true);
      loadingRef.current = true;
      setPage(1);
    } else {
      setLoadingMore(true);
      loadingMoreRef.current = true;
    }
    
    try {
      // 构建状态参数（支持多个状态筛选）
      const statusParams = statusFilter.length > 0 ? statusFilter : undefined;
      const currentPage = reset ? 1 : page;
      
      // 使用 api 方法，它会自动使用正确的 API_BASE URL
      const result = await api.getCommissionFormData({
        q: searchQuery,
        page: currentPage,
        pageSize: pageSize,
        status: statusParams // 传递数组，支持多个状态筛选
      });

      const newData = result.data || [];
      const newTotal = result.total || 0;
      
      if (reset) {
        setData(newData);
        setPage(1);
      } else {
        setData(prevData => [...prevData, ...newData]);
        setPage(prev => prev + 1);
      }
      
      setTotal(newTotal);
      const currentDataLength = reset ? newData.length : data.length + newData.length;
      const hasMoreData = currentDataLength < newTotal;
      setHasMore(hasMoreData);
      hasMoreRef.current = hasMoreData;
    } catch (error) {
      console.error('获取数据失败:', error);
      if (reset) {
        alert('获取数据失败: ' + error.message);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
      loadingMoreRef.current = false;
    }
  };

  // 同步ref
  useEffect(() => {
    loadingMoreRef.current = loadingMore;
    hasMoreRef.current = hasMore;
    loadingRef.current = loading;
  }, [loadingMore, hasMore, loading]);

  // 加载更多数据
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || loadingRef.current) return;
    
    loadingMoreRef.current = true;
    setLoadingMore(true);
    
    try {
      const statusParams = statusFilter.length > 0 ? statusFilter : undefined;
      const nextPage = page + 1;
      const result = await api.getCommissionFormData({
        q: searchQuery,
        page: nextPage,
        pageSize: pageSize,
        status: statusParams
      });

      const newData = result.data || [];
      const newTotal = result.total || 0;
      
      setData(prevData => {
        const updatedData = [...prevData, ...newData];
        const hasMoreData = updatedData.length < newTotal;
        hasMoreRef.current = hasMoreData;
        setHasMore(hasMoreData);
        return updatedData;
      });
      setTotal(newTotal);
      setPage(nextPage);
    } catch (error) {
      console.error('加载更多数据失败:', error);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [page, searchQuery, statusFilter]);

  // 滚动监听
  useEffect(() => {
    const handleScroll = () => {
      // 检查是否滚动到底部（距离底部100px时开始加载）
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      if (scrollTop + windowHeight >= documentHeight - 100) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMore]);

  // 处理从通知跳转过来的情况：清理URL参数和sessionStorage
  // 注意：searchQuery已经在初始化时从URL参数/sessionStorage设置了，这里只需要清理
  useEffect(() => {
    // 检查URL参数
    const urlParams = new URLSearchParams(location.search);
    const urlSearchQuery = urlParams.get('q') || urlParams.get('search');
    
    // 检查location.state
    const stateSearchQuery = location.state?.searchQuery;
    
    // 检查sessionStorage
    const savedSearchQuery = sessionStorage.getItem(NOTIFICATION_SEARCH_KEY);
    
    // 如果URL参数存在，清除它（searchQuery已经在初始化时设置了）
    if (urlSearchQuery && hasInitializedFromState.current) {
      console.log('清除URL参数，searchQuery已设置:', urlSearchQuery);
      // 延迟清除，确保fetchData已经执行
      setTimeout(() => {
        navigate(location.pathname, { replace: true });
      }, 500);
    }
    
    // 如果location.state存在，清除它
    if (stateSearchQuery && hasInitializedFromState.current) {
      setTimeout(() => {
        navigate(location.pathname, { replace: true, state: null });
      }, 1000);
    }
    
    // 清除sessionStorage（延迟清除，确保fetchData已经执行）
    if (savedSearchQuery && hasInitializedFromState.current) {
      setTimeout(() => {
        sessionStorage.removeItem(NOTIFICATION_SEARCH_KEY);
      }, 2000);
    }
  }, [location.search, location.state, navigate, location.pathname]);

  // 初始加载或搜索/筛选变化时重置数据
  useEffect(() => {
    if (user?.token) {
      // 添加调试日志，帮助排查问题
      console.log('触发fetchData，searchQuery:', searchQuery, 'statusFilter:', statusFilter);
      fetchData(true);
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
      'waiting_review': 'status-waiting-review',
      'report_uploaded': 'status-report-uploaded',
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
      'waiting_review': '待审核',
      'report_uploaded': '待传数据',
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
          
          {/* 加载更多提示 */}
          {loadingMore && (
            <div className="mobile-loading-more">
              <div className="mobile-loading-spinner"></div>
              <span>加载中...</span>
            </div>
          )}
          
          {/* 没有更多数据提示 */}
          {!hasMore && data.length > 0 && (
            <div className="mobile-no-more">
              已加载全部 {total} 条数据
            </div>
          )}
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
  const [showToast, setShowToast] = useState(false);
  const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
  
  // 选项列表状态
  const [technicianOptions, setTechnicianOptions] = useState([]);
  const [supervisorOptions, setSupervisorOptions] = useState([]);
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // 计算组长部门ID
  const leaderDepartmentId = user?.department_id ? Number(user.department_id) : null;

  // 加载选项列表
  useEffect(() => {
    const loadOptions = async () => {
      if (!item) return;
      
      setLoadingOptions(true);
      try {
        // 确保departmentId是数字类型
        const departmentId = item.department_id ? Number(item.department_id) : (user?.department_id ? Number(user.department_id) : null);
        
        // 加载测试人员选项
        if (departmentId) {
          try {
            const technicians = await api.getAllEmployees({ department_id: departmentId });
            setTechnicianOptions(technicians.map(t => ({
              value: t.name,
              label: t.name,
              id: t.user_id || t.id
            })));
          } catch (error) {
            console.error('加载测试人员列表失败:', error);
          }
        }
        
        // 加载负责人选项（也需要按部门过滤）
        try {
          const supervisors = await api.getAllSupervisors({ department_id: departmentId });
          setSupervisorOptions(supervisors.map(s => ({
            value: s.name,
            label: s.name,
            id: s.user_id || s.id
          })));
        } catch (error) {
          console.error('加载负责人列表失败:', error);
        }
        
        // 加载业务负责人选项（所有用户）
        try {
          const users = await api.listAllUsers({ is_active: 1 });
          setAssigneeOptions(users.map(u => ({
            value: u.name,
            label: u.name,
            id: u.user_id || u.id
          })));
        } catch (error) {
          console.error('加载业务负责人列表失败:', error);
        }
        
        // 加载设备选项
        if (departmentId) {
          try {
            const equipment = await api.getEquipmentByDepartment(departmentId);
            setEquipmentOptions(equipment.map(e => ({
              value: e.equipment_name,
              label: e.equipment_name,
              id: e.equipment_id || e.id
            })));
          } catch (error) {
            console.error('加载设备列表失败:', error);
          }
        }
      } catch (error) {
        console.error('加载选项失败:', error);
      } finally {
        setLoadingOptions(false);
      }
    };
    
    loadOptions();
  }, [item?.test_item_id, item?.department_id, user?.department_id]);
  
  // 当item变化时，更新formData
  useEffect(() => {
    if (item) {
      setFormData(item);
    }
  }, [item?.test_item_id]);

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
      
      // 构建更新数据
      let updateData = {};
      
      // 特殊处理测试人员字段：需要保存technician_id而不是technician_name
      if (field === 'technician_name') {
        const technician = technicianOptions.find(t => t.value === value);
        if (technician) {
          updateData.technician_id = technician.id;
          updateData.technician_name = value;
        } else {
          updateData.technician_id = null;
          updateData.technician_name = value;
        }
        // 规则：测试人员有值 => 进行中；否则 => 已分配
        const hasTech = !!(value && value.trim());
        if (hasTech) {
          updateData.status = 'running';
        } else {
          updateData.status = formData.supervisor_name ? 'assigned' : 'assigned';
        }
      }
      // 特殊处理检测设备字段：需要保存equipment_id而不是equipment_name
      else if (field === 'equipment_name') {
        const equipment = equipmentOptions.find(e => e.value === value);
        if (equipment) {
          updateData.equipment_id = equipment.id;
          updateData.equipment_name = value;
        } else {
          updateData.equipment_id = null;
          updateData.equipment_name = value;
        }
      }
      // 特殊处理业务负责人字段：需要保存current_assignee而不是assignee_name
      else if (field === 'assignee_name') {
        const assignee = assigneeOptions.find(a => a.value === value);
        if (assignee) {
          updateData.current_assignee = assignee.id;
          updateData.assignee_name = value;
        } else {
          updateData.current_assignee = null;
          updateData.assignee_name = value;
        }
      }
      // 特殊处理负责人字段：需要保存supervisor_id而不是supervisor_name
      else if (field === 'supervisor_name') {
        const supervisor = supervisorOptions.find(s => s.value === value);
        if (supervisor) {
          updateData.supervisor_id = supervisor.id;
          updateData.supervisor_name = value;
        } else {
          updateData.supervisor_id = null;
          updateData.supervisor_name = value;
        }
        // 规则：负责人有值 => 已分配；否则 => 新建（但若已有测试人员，则保持进行中）
        const hasSupervisor = !!(value && value.trim());
        if (formData.technician_name) {
          updateData.status = 'running';
        } else {
          updateData.status = hasSupervisor ? 'assigned' : 'new';
        }
      }
      // 其他字段直接保存
      else {
        updateData[field] = value;
      }
      
      await api.updateTestItem(item.test_item_id, updateData);
      // 更新 formData 中的其他字段（如状态等自动更新的字段）
      if (Object.keys(updateData).length > 0) {
        setFormData(prev => ({ ...prev, ...updateData }));
      }
      // 显示保存成功提示
      setShowToast(true);
      if (onUpdate) onUpdate();
    } catch (error) {
      alert('保存失败: ' + error.message);
      // 恢复原值
      setFormData(formData);
    } finally {
      setSaving(false);
    }
  };

  // 状态映射函数
  const getStatusLabel = (status) => {
    const statusMap = {
      'new': '新建',
      'assigned': '已分配',
      'running': '进行中',
      'waiting_review': '待审核',
      'report_uploaded': '待传数据',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    return statusMap[status] || status || '-';
  };

  const renderField = (label, field, type = 'text', options = null) => {
    const isEditable = canEditField(field);
    const value = formData[field] || '';
    
    // 对于状态字段，在只读模式下显示中文标签
    const displayValue = !isEditable && field === 'status' ? getStatusLabel(value) : value;

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
          <div className="mobile-form-readonly">{displayValue || '-'}</div>
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
              {renderField('负责人', 'supervisor_name', 'select', supervisorOptions)}
              {renderField('业务负责人', 'assignee_name', 'select', assigneeOptions)}
              {renderField('状态', 'status', 'select', [
                { value: 'new', label: '新建' },
                { value: 'assigned', label: '已分配' },
                { value: 'running', label: '进行中' },
                { value: 'waiting_review', label: '待审核' },
                { value: 'report_uploaded', label: '待传数据' },
                { value: 'completed', label: '已完成' },
                { value: 'cancelled', label: '已取消' }
              ])}
            </div>
          )}

          {activeTab === 'test' && (
            <div className="mobile-detail-section">
              {renderField('测试人员', 'technician_name', 'select', technicianOptions)}
              {renderField('检测设备', 'equipment_name', 'select', equipmentOptions)}
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
              <MobileFileUpload
                testItemId={formData.test_item_id}
                orderId={formData.order_id}
                userRole={user?.role}
                businessConfirmed={formData.business_confirmed}
                currentAssignee={formData.current_assignee}
                enableUpload={true}
                onFileUploaded={() => {
                  // 文件上传后可以刷新数据
                  if (onUpdate) onUpdate();
                }}
              />
            </div>
          )}
        </div>

        {(saving || loadingOptions) && (
          <div className="mobile-saving-indicator">
            {loadingOptions ? '加载选项...' : '保存中...'}
          </div>
        )}
      </div>
      
      {/* 保存成功提示 */}
      {showToast && (
        <Toast 
          message="保存成功" 
          duration={2000}
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
};

export default MobileCommissionForm;







