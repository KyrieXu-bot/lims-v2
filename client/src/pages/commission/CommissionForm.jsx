import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import CustomerDetailModal from './CustomerDetailModal.jsx';
import OrderPartyDetailModal from './OrderPartyDetailModal.jsx';
import RealtimeEditableCell from './RealtimeEditableCell.jsx';
import SimpleFileUpload from '../../components/SimpleFileUpload.jsx';
import BatchFileUpload from '../../components/BatchFileUpload.jsx';
import ReadonlyNoteField from '../../components/ReadonlyNoteField.jsx';
import DetailViewLink from '../../components/DetailViewLink.jsx';
import { useSocket } from '../../hooks/useSocket.js';
import * as XLSX from 'xlsx';
import './CommissionForm.css';

// 服务加急选项常量，避免每次渲染创建新数组
const SERVICE_URGENCY_OPTIONS = [
  { value: 'normal', label: '不加急' },
  { value: 'urgent_1_5x', label: '加急1.5倍' },
  { value: 'urgent_2x', label: '特急2倍' }
];

const COLUMN_VISIBILITY_STORAGE_KEY = 'commission_form_column_visibility';

const TOGGLEABLE_COLUMNS = [
  { key: 'test_code', label: '项目编号' },
  { key: 'commissioner', label: '委托单位' },
  { key: 'contact', label: '联系人' },
  { key: 'department', label: '归属部门' },
  { key: 'price_original', label: '收费标准' },
  { key: 'price_note', label: '业务报价' },
  { key: 'quantity', label: '数量' },
  { key: 'assignee_name', label: '业务负责人' },
  { key: 'discount_rate', label: '折扣' },
  { key: 'customer_note', label: '客户备注' },
  { key: 'order_created_at', label: '收样日期' },
  { key: 'test_item_created_at', label: '开单日期' },
  { key: 'arrival_mode', label: '样品到达方式' },
  { key: 'sample_arrival_status', label: '样品是否已到' },
  { key: 'service_urgency', label: '服务加急' },
  { key: 'supervisor_name', label: '负责人' },
  { key: 'standard_price', label: '标准单价' },
  { key: 'technician_name', label: '测试人员' },
  { key: 'assignment_note', label: '指派备注' },
  { key: 'field_test_time', label: '现场测试时间' },
  { key: 'equipment_name', label: '检测设备' },
  { key: 'actual_sample_quantity', label: '计费数量' },
  { key: 'unit', label: '单位' },
  { key: 'work_hours', label: '测试工时' },
  { key: 'machine_hours', label: '测试机时' },
  { key: 'test_notes', label: '实验备注' },
  { key: 'line_total', label: '标准总价' },
  { key: 'final_unit_price', label: '测试总价' },
  { key: 'actual_delivery_date', label: '实际交付日期' },
  { key: 'business_note', label: '业务备注' },
  { key: 'unpaid_amount', label: '开票未到款金额' },
  { key: 'status', label: '项目状态' },
  { key: 'abnormal_condition', label: '异常情况' }
];

const DEFAULT_COLUMN_VISIBILITY = TOGGLEABLE_COLUMNS.reduce((acc, col) => {
  acc[col.key] = true;
  return acc;
}, {});

// 可折叠文本组件
const CollapsibleText = ({ text, maxLength = 50 }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!text || text.length <= maxLength) {
    return <span>{text}</span>;
  }
  
  return (
    <span>
      {isExpanded ? text : `${text.substring(0, maxLength)}...`}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          marginLeft: '5px',
          color: '#0066cc',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textDecoration: 'underline',
          fontSize: '12px'
        }}
      >
        {isExpanded ? '收起' : '展开'}
      </button>
    </span>
  );
};


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
  const [fieldTestDateFilter, setFieldTestDateFilter] = useState('');
  const [myItemsFilter, setMyItemsFilter] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [assigneeOptions, setAssigneeOptions] = useState([]);
  const [departmentOptions, setDepartmentOptions] = useState([]);
  const [selectedFileTestItem, setSelectedFileTestItem] = useState(null);
  const [showFileModal, setShowFileModal] = useState(false);
  const [isOrderPartyModalOpen, setIsOrderPartyModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [user, setUser] = useState(null);
  const [savingStatus, setSavingStatus] = useState({}); // 保存状态：{testItemId-field: 'saving'|'success'|'error'}
  const [selectedItems, setSelectedItems] = useState([]);
  const [showBatchUploadModal, setShowBatchUploadModal] = useState(false);
  const [deletingItems, setDeletingItems] = useState(new Set()); // 正在删除的项目ID集合
  const [showExportModal, setShowExportModal] = useState(false); // 导出弹框状态
  const operationColumnRef = useRef(null); // 操作列的引用
  const [selectAllLoading, setSelectAllLoading] = useState(false);
  const [copiedFieldTestTime, setCopiedFieldTestTime] = useState('');
  const [columnVisibility, setColumnVisibility] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          return { ...DEFAULT_COLUMN_VISIBILITY, ...parsed };
        }
      } catch (error) {
        console.warn('恢复列可见性失败:', error);
      }
    }
    return { ...DEFAULT_COLUMN_VISIBILITY };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch (error) {
      console.warn('保存列可见性失败:', error);
    }
  }, [columnVisibility]);

  useEffect(() => {
    fullSelectionCacheRef.current = null;
  }, [page, pageSize, searchQuery, statusFilter, departmentFilter, fieldTestDateFilter, myItemsFilter]);

  const isColumnVisible = (key) => columnVisibility[key] !== false;

  const isColumnApplicable = (key) => {
    if (key === 'department') {
      return user?.role === 'admin';
    }
    return true;
  };

  const applicableColumns = TOGGLEABLE_COLUMNS.filter(col => isColumnApplicable(col.key));

  const hiddenColumns = applicableColumns.filter(col => !isColumnVisible(col.key));

  const toggleColumnVisibility = (key) => {
    setColumnVisibility(prev => {
      const next = { ...prev, [key]: prev[key] === false ? true : false };
      return next;
    });
  };

  const getColumnCellClass = (key, baseClass = '') => {
    const classes = [baseClass];
    if (!isColumnVisible(key)) {
      classes.push('column-hidden-cell');
    }
    return classes.filter(Boolean).join(' ').trim();
  };

  const fullSelectionCacheRef = useRef(null);

  const fetchAllMatchingItems = async () => {
    if (fullSelectionCacheRef.current) {
      return fullSelectionCacheRef.current;
    }
    const totalCount = Math.max(total || 0, pageSize, 1000);
    const params = new URLSearchParams({
      q: searchQuery,
      page: '1',
      pageSize: totalCount.toString(),
    });
    if (statusFilter) params.append('status', statusFilter);
    if (departmentFilter) params.append('department_id', departmentFilter);
    if (fieldTestDateFilter) params.append('field_test_date', fieldTestDateFilter);
    if (myItemsFilter) params.append('my_items', 'true');

    const storedUser = JSON.parse(localStorage.getItem('lims_user') || 'null');
    const headers = {
      'Authorization': `Bearer ${storedUser?.token}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch(`/api/commission-form/commission-form?${params.toString()}`, { headers });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    const items = Array.isArray(result.data) ? result.data : [];
    const eligibleItems = user?.role === 'leader'
      ? items.filter(it => canLeaderEditItem(it))
      : items;
    fullSelectionCacheRef.current = eligibleItems;
    return eligibleItems;
  };

  const fetchAllMatchingItemIds = async () => {
    const items = await fetchAllMatchingItems();
    const ids = items.map(it => it.test_item_id).filter(Boolean);
    return Array.from(new Set(ids));
  };

  const getSelectedItemsData = async () => {
    if (selectedItems.length === 0) {
      return [];
    }
    const currentPageSelected = data.filter(item => selectedItems.includes(item.test_item_id));
    if (currentPageSelected.length === selectedItems.length) {
      return currentPageSelected;
    }
    const allItems = await fetchAllMatchingItems();
    return allItems.filter(item => selectedItems.includes(item.test_item_id));
  };

  const formatTestItemName = (item) => {
    const parts = [item?.category_name, item?.detail_name].filter(Boolean);
    return parts.join(' - ');
  };

  const renderColumnHeader = (key, label, baseClass) => {
    if (!isColumnApplicable(key)) return null;
    const isVisible = isColumnVisible(key);
    if (!isVisible) {
      return null;
    }
    const thClasses = [baseClass, 'toggleable-column-header'];
    return (
      <th className={thClasses.filter(Boolean).join(' ').trim()} data-column-key={key}>
        <div
          className="column-header"
          title={`隐藏${label}`}
        >
          <span className="column-label">{label}</span>
          <button
            type="button"
            className="column-toggle-btn"
            onClick={() => toggleColumnVisibility(key)}
            aria-label={`隐藏${label}`}
          >
            ▾
          </button>
        </div>
      </th>
    );
  };

  // 统一的字段权限控制
  const leaderDepartmentId = user?.department_id ? Number(user.department_id) : null;

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

  const canEditField = (field, item = null) => {
    const role = user?.role;
    if (!role) return false;
    if (role === 'admin') {
      return true;
    }
    if (role === 'leader') {
      return canLeaderEditItem(item);
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
      if (item && item.technician_name === user?.name) {
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
      // 直接使用fetch而不是通过api对象
      const params = new URLSearchParams({
        q: searchQuery,
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      
      if (statusFilter) params.append('status', statusFilter);
      if (departmentFilter) params.append('department_id', departmentFilter);
      if (fieldTestDateFilter) params.append('field_test_date', fieldTestDateFilter);
      if (myItemsFilter) params.append('my_items', 'true');

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
  }, [page, searchQuery, statusFilter, departmentFilter, fieldTestDateFilter, myItemsFilter]);

  // 监听实时数据更新
  useEffect(() => {
    const handleDataUpdate = (event) => {
      const data = event.detail;
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

  // 动态计算操作列宽度并更新文件管理列位置
  useEffect(() => {
    const updateFileColumnPosition = () => {
      // 尝试从表头获取宽度
      if (operationColumnRef.current) {
        const operationWidth = operationColumnRef.current.offsetWidth;
        if (operationWidth > 0) {
          // 设置CSS变量，供CSS使用
          document.documentElement.style.setProperty('--operation-column-width', `${operationWidth}px`);
          return;
        }
      }
      
      // 如果表头还没有渲染，尝试从第一个数据行获取
      const firstOperationCell = document.querySelector('.commission-form .data-table tbody td.fixed-right:last-child');
      if (firstOperationCell) {
        const operationWidth = firstOperationCell.offsetWidth;
        if (operationWidth > 0) {
          document.documentElement.style.setProperty('--operation-column-width', `${operationWidth}px`);
        }
      }
    };

    // 初始计算，延迟以确保DOM已渲染
    const initialTimeout = setTimeout(updateFileColumnPosition, 100);

    // 监听窗口大小变化
    const handleResize = () => {
      setTimeout(updateFileColumnPosition, 50);
    };

    window.addEventListener('resize', handleResize);
    
    // 使用ResizeObserver监听操作列宽度变化
    let resizeObserver = null;
    if (operationColumnRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateFileColumnPosition();
      });
      resizeObserver.observe(operationColumnRef.current);
    } else {
      // 如果表头还没渲染，监听整个表格的变化
      const table = document.querySelector('.commission-form .data-table');
      if (table) {
        resizeObserver = new ResizeObserver(() => {
          setTimeout(updateFileColumnPosition, 50);
        });
        resizeObserver.observe(table);
      }
    }

    // 监听数据变化，延迟更新以等待DOM渲染
    const dataTimeout = setTimeout(updateFileColumnPosition, 300);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      clearTimeout(initialTimeout);
      clearTimeout(dataTimeout);
    };
  }, [data, user, loading]);

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

  // 根据检测项目动态加载该部门下的组长或实验员
  const loadUsersForItem = async (item, type) => {
    if (!item) return [];

    const mapUsers = (users = []) => users.map(u => ({
      id: u.id ?? u.user_id ?? u.userId,
      name: u.name,
      account: u.account
    }));

    const storedUser = (() => {
      try {
        return JSON.parse(localStorage.getItem('lims_user') || 'null');
      } catch (error) {
        return null;
      }
    })();

    const departmentId = item.department_id ?? storedUser?.department_id ?? null;
    const groupId = item.group_id ?? storedUser?.group_id ?? null;

    try {
      if (type === 'supervisor') {
        let users = [];

        if (item.price_id) {
          try {
            const headers = api.authHeaders();
            const response = await fetch(`/api/users/by-price-id?price_id=${item.price_id}`, { headers });
            if (response.ok) {
              const data = await response.json();
              users = mapUsers(data.supervisors || []);
            }
          } catch (error) {
            console.warn('根据price_id加载负责人失败，将使用兜底方案:', error);
          }
        }

        if (!users.length) {
          users = await api.getAllSupervisors({ department_id: departmentId ?? undefined }).then(mapUsers);
        }

        if (users.length) {
          setAssigneeOptions(prev => {
            const merged = [...users];
            const ids = new Set(merged.map(u => u.id));
            prev.forEach(u => {
              if (!ids.has(u.id)) merged.push(u);
            });
            return merged;
          });
        }

        return users;
      }

      // type === 'technician'
      let users = [];

      if (item.price_id) {
        try {
          const headers = api.authHeaders();
          const response = await fetch(`/api/users/by-price-id?price_id=${item.price_id}`, { headers });
          if (response.ok) {
            const data = await response.json();
            users = mapUsers(data.technicians || []);
          }
        } catch (error) {
          console.warn('根据price_id加载实验员失败，将使用兜底方案:', error);
        }
      }

      // 直接根据部门加载实验员，不再使用group_id
      if (!users.length && departmentId) {
        try {
          users = await api.getAllEmployees({ department_id: departmentId }).then(mapUsers);
        } catch (error) {
          console.warn('根据department_id加载实验员失败:', error);
        }
      }

      // 如果还是没有，尝试使用当前用户的部门
      if (!users.length && storedUser?.department_id) {
        try {
          users = await api.getAllEmployees({ department_id: storedUser.department_id }).then(mapUsers);
        } catch (error) {
          console.warn('根据当前用户部门加载实验员失败:', error);
        }
      }

      const supervisorMatchesCurrentUser = (() => {
        if (!storedUser) return false;
        const supervisorId = item.supervisor_id ?? null;
        const supervisorName = item.supervisor_name ?? '';
        const currentUserId = storedUser.user_id ?? storedUser.id ?? storedUser.userId ?? null;
        if (supervisorId && currentUserId) {
          return String(supervisorId) === String(currentUserId);
        }
        if (supervisorName && storedUser.name) {
          return supervisorName === storedUser.name;
        }
        return false;
      })();

      if (storedUser && (storedUser.role === 'supervisor' || storedUser.role === 'leader') && supervisorMatchesCurrentUser) {
        const currentUserOption = {
          id: storedUser.user_id ?? storedUser.id ?? storedUser.userId,
          name: storedUser.name || storedUser.account || '',
          account: storedUser.account || ''
        };
        if (currentUserOption.id && currentUserOption.name && !users.some(u => String(u.id) === String(currentUserOption.id))) {
          users.unshift(currentUserOption);
        }
      }

      if (users.length) {
        setTechnicians(prev => {
          const merged = [...users];
          const ids = new Set(merged.map(u => u.id));
          prev.forEach(u => {
            if (!ids.has(u.id)) merged.push(u);
          });
          return merged;
        });
      }

      return users;
    } catch (error) {
      console.error('加载人员列表失败:', error);
      return [];
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
    setFieldTestDateFilter('');
    setMyItemsFilter(false);
    setPage(1);
  };

  const handleMyItems = () => {
    setMyItemsFilter(true);
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

  const handleOrderPartyClick = (orderId) => {
    if (!orderId) return;
    setSelectedOrderId(orderId);
    setIsOrderPartyModalOpen(true);
  };

  const closeOrderPartyModal = () => {
    setIsOrderPartyModalOpen(false);
    setSelectedOrderId(null);
  };

  const toggleFileView = (testItem) => {
    setSelectedFileTestItem(testItem);
    setShowFileModal(true);
  };

  const closeFileModal = () => {
    setShowFileModal(false);
    setSelectedFileTestItem(null);
  };

  const hasValue = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  };

  const toNumberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  };

  const hasPositiveNumber = (value) => {
    const num = toNumberOrNull(value);
    return num !== null && num > 0;
  };

  const formatNumberValue = (value) => {
    if (value === null || value === undefined || value === '') return '';
    const num = Number(value);
    if (Number.isFinite(num)) {
      return num % 1 === 0 ? `${num}` : num.toFixed(2);
    }
    return String(value);
  };

  const meetsApprovalFieldRequirements = (item) => {
    if (!item) return false;

    const responsibleFilled = hasValue(item.supervisor_id) || hasValue(item.supervisor_name);
    const standardPriceFilled = hasPositiveNumber(item.standard_price ?? item.unit_price);
    const testerFilled = hasValue(item.technician_id) || hasValue(item.technician_name);
    const fieldTestTimeFilled = hasValue(item.field_test_time);
    const equipmentFilled = hasValue(item.equipment_id) || hasValue(item.equipment_name);
    const quantityFilled = hasPositiveNumber(item.actual_sample_quantity);
    const unitFilled = hasValue(item.unit);
    const workHoursFilled = hasPositiveNumber(item.work_hours);
    const machineHoursFilled = hasPositiveNumber(item.machine_hours);
    const standardTotalFilled = hasPositiveNumber(item.line_total);

    return responsibleFilled &&
      standardPriceFilled &&
      testerFilled &&
      fieldTestTimeFilled &&
      equipmentFilled &&
      quantityFilled &&
      unitFilled &&
      workHoursFilled &&
      machineHoursFilled &&
      standardTotalFilled;
  };

  const getApprovalButtonAppearance = (item) => {
    const isCompleted = item.status === 'completed';
    const meetsRequirements = meetsApprovalFieldRequirements(item);
    if (isCompleted) {
      return {
        disabled: true,
        backgroundColor: '#d4edda',
        color: '#155724',
        borderColor: '#c3e6cb',
        cursor: 'not-allowed'
      };
    }
    if (!meetsRequirements || item.status === 'cancelled') {
      return {
        disabled: true,
        backgroundColor: '#fff3cd',
        color: '#856404',
        borderColor: '#ffeeba',
        cursor: 'not-allowed'
      };
    }
    return {
      disabled: false,
      backgroundColor: '#ffc107',
      color: '#000',
      borderColor: '#ffc107',
      cursor: 'pointer'
    };
  };

  // 审批（组长/室主任）
  const canApprove = (item) => {
    return meetsApprovalFieldRequirements(item) && item.status !== 'completed' && item.status !== 'cancelled';
  };

  const handleApprove = async (item) => {
    try {
      if (!meetsApprovalFieldRequirements(item)) {
        alert('请先完善负责人、标准单价、测试人员等审批所需信息');
        return;
      }
      // 校验原始数据是否存在
      const userLocal = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const params = new URLSearchParams({ category: 'raw_data', test_item_id: item.test_item_id, pageSize: '1' });
      const resp = await fetch(`/api/files?${params.toString()}`, { headers: { 'Authorization': `Bearer ${userLocal.token}` } });
      const dataResp = await resp.json();
      const hasRaw = (dataResp?.data || []).length > 0;
      if (!hasRaw) {
        alert('请先在"文件管理-实验原始数据"上传原始数据');
        return;
      }
      const rawFiles = (dataResp?.data || []).map(file => file.filename || file.original_name || file.filepath || '').filter(Boolean);

      const standardPriceValue = hasPositiveNumber(item.standard_price) ? item.standard_price : item.unit_price;
      const lines = [
        '是否进行审批操作？',
        '',
        `委托单号: ${item.order_id || ''}`,
        `检测项目: ${(item.category_name || '') && (item.detail_name || '') ? `${item.category_name} - ${item.detail_name}` : (item.category_name || item.detail_name || '')}`,
        `负责人: ${item.supervisor_name || ''}`,
        `测试人员: ${item.technician_name || ''}`,
        `标准单价: ${formatCurrency(standardPriceValue)}`,
        `计费数量: ${formatNumberValue(item.actual_sample_quantity)}`,
        `单位: ${item.unit || ''}`,
        `标准总价: ${formatCurrency(item.line_total)}`,
        `测试机时: ${formatNumberValue(item.machine_hours)}`,
        `测试工时: ${formatNumberValue(item.work_hours)}`,
        `现场测试时间: ${formatDateTime(item.field_test_time)}`,
        `交付的原始数据文件名字:\n${rawFiles.map(name => `  - ${name}`).join('\n')}`
      ];

      const confirmMessage = lines.join('\n');
      if (!window.confirm(confirmMessage)) {
        return;
      }
      // 设置状态为已完成
      const r = await fetch(`/api/test-items/${item.test_item_id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${userLocal.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      });
      if (!r.ok) throw new Error('审批失败');
      setData(prev => prev.map(x => x.test_item_id === item.test_item_id ? { ...x, status: 'completed' } : x));
    } catch (e) {
      alert(e.message || '审批失败');
    }
  };

  const handleCancel = async (item) => {
    if (!window.confirm('确定取消该检测项目吗？')) return;
    try {
      const userLocal = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const r = await fetch(`/api/test-items/${item.test_item_id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${userLocal.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });
      if (!r.ok) throw new Error('取消失败');
      setData(prev => prev.map(x => x.test_item_id === item.test_item_id ? { ...x, status: 'cancelled' } : x));
    } catch (e) {
      alert(e.message || '取消失败');
    }
  };

  // 暂停/继续
  const handleTogglePause = async (item) => {
    try {
      const userLocal = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const newValue = item.abnormal_condition ? null : '暂停';
      const r = await fetch(`/api/test-items/${item.test_item_id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${userLocal.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ abnormal_condition: newValue })
      });
      if (!r.ok) throw new Error('操作失败');
      setData(prev => prev.map(x => x.test_item_id === item.test_item_id ? { ...x, abnormal_condition: newValue } : x));
    } catch (e) {
      alert(e.message || '操作失败');
    }
  };

  // 处理单个项目选择
  const handleItemSelect = (testItemId, checked) => {
    const targetItem = data.find(x => x.test_item_id === testItemId);
    if (!targetItem) return;
    if (user?.role === 'leader' && !canLeaderEditItem(targetItem)) {
      return;
    }
    if (checked) {
      setSelectedItems(prev => [...prev, testItemId]);
    } else {
      setSelectedItems(prev => prev.filter(id => id !== testItemId));
    }
  };

  // 处理全选
  const handleSelectAll = async (e) => {
    const checked = e.target.checked;
    if (checked) {
      setSelectAllLoading(true);
      try {
        fullSelectionCacheRef.current = null;
        const allItems = await fetchAllMatchingItems();
        const allIds = allItems.map(item => item.test_item_id).filter(Boolean);
        setSelectedItems(Array.from(new Set(allIds)));
      } catch (error) {
        console.error('全选失败:', error);
        alert('全选失败，请稍后再试');
        setSelectedItems([]);
      } finally {
        setSelectAllLoading(false);
      }
    } else {
      setSelectedItems([]);
      fullSelectionCacheRef.current = null;
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

  // 导出功能
  const handleExport = () => {
    if (selectedItems.length === 0) {
      alert('请先选择要导出的检测项目');
      return;
    }
    setShowExportModal(true);
  };

  // 导出Excel功能
  const handleExportExcel = async () => {
    if (selectedItems.length === 0) {
      alert('请先选择要导出的检测项目');
      return;
    }

    try {
      // 获取选中的数据
      const selectedData = await getSelectedItemsData();
      
      // 准备Excel数据
      const excelData = selectedData.map((item, index) => ({
        '序号': index + 1,
        '委托单号': item.order_id || '',
        '收样日期': formatDate(item.order_created_at),
        '开单日期': formatDate(item.test_item_created_at),
        '委托单位': item.customer_commissioner_name || '',
        '委托方联系人': item.customer_contact_name || '',
        '业务负责人': item.assignee_name || '',
        '检测项目': `${item.category_name || ''} - ${item.detail_name || ''}`,
        '样品原号': item.original_no || '',
        '项目编号': item.test_code || '',
        '归属部门': item.department_name || '',
        '收费标准-最低报价': formatPriceRange(item.original_unit_price, item.minimum_price),
        '业务报价': item.price_note || '',
        '数量': item.quantity || '',
        '标准单价': formatCurrency(item.standard_price),
        '标准总价': formatCurrency(item.line_total),
        '折扣': formatPercentage(item.discount_rate),
        '客户备注': item.note || '',
        '样品到达方式': item.arrival_mode === 'on_site' ? '现场' : item.arrival_mode === 'delivery' ? '寄样' : '',
        '样品是否已到': item.sample_arrival_status === 'arrived' ? '已到' : item.sample_arrival_status === 'not_arrived' ? '未到' : '',
        '服务加急': item.service_urgency || '',
        '现场测试时间': item.field_test_time ? formatDateTime(item.field_test_time) : '',
        '检测设备': item.equipment_name || '',
        '负责人': item.supervisor_name || '',
        '测试人员': item.technician_name || '',
        '测试样品数量': item.actual_sample_quantity || '',
        '测试工时': item.work_hours || '',
        '测试机时': item.machine_hours || '',
        '实际交付日期': formatDate(item.actual_delivery_date),
        '业务备注': item.business_note || '',
        '指派备注': item.assignment_note || '',
        '开票未到款金额': formatCurrency(item.unpaid_amount),
        '项目状态': item.status === 'new' ? '新建' : 
                   item.status === 'assigned' ? '已分配' : 
                   item.status === 'running' ? '进行中' : 
                   item.status === 'completed' ? '已完成' : 
                   item.status === 'cancelled' ? '已取消' : 
                   item.status === 'outsource' ? '委外' : ''
      }));

      // 创建工作簿
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);

      // 设置列宽
      const colWidths = [
        { wch: 8 },   // 序号
        { wch: 15 },  // 委托单号
        { wch: 12 },  // 收样日期
        { wch: 12 },  // 开单日期
        { wch: 20 },  // 委托单位
        { wch: 12 },  // 委托方联系人
        { wch: 12 },  // 业务负责人
        { wch: 30 },  // 检测项目
        { wch: 15 },  // 样品原号
        { wch: 15 },  // 项目编号
        { wch: 12 },  // 归属部门
        { wch: 20 },  // 收费标准-最低报价
        { wch: 15 },  // 业务报价
        { wch: 8 },   // 数量
        { wch: 12 },  // 标准单价
        { wch: 12 },  // 标准总价
        { wch: 8 },   // 折扣
        { wch: 20 },  // 客户备注
        { wch: 12 },  // 样品到达方式
        { wch: 12 },  // 样品是否已到
        { wch: 10 },  // 服务加急
        { wch: 18 },  // 现场测试时间
        { wch: 15 },  // 检测设备
        { wch: 12 },  // 负责人
        { wch: 12 },  // 测试人员
        { wch: 12 },  // 测试样品数量
        { wch: 10 },  // 测试工时
        { wch: 10 },  // 测试机时
        { wch: 12 },  // 实际交付日期
        { wch: 20 },  // 业务备注
        { wch: 20 },  // 指派备注
        { wch: 15 },  // 开票未到款金额
        { wch: 10 }   // 项目状态
      ];
      ws['!cols'] = colWidths;

      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(wb, ws, '委托单登记表');

      // 生成文件名
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
      const fileName = `委托单登记表_${timestamp}.xlsx`;

      // 导出文件
      XLSX.writeFile(wb, fileName);

      setShowExportModal(false);
      alert(`Excel文件导出成功：${fileName}`);
    } catch (error) {
      console.error('导出Excel失败:', error);
      alert('导出Excel失败：' + error.message);
    }
  };

  // 导出委托单模板
  const handleExportOrderTemplate = async () => {
    try {
      const selectedData = await getSelectedItemsData();
      if (selectedData.length === 0) {
        alert('没有选中的检测项目数据');
        return;
      }

      // 检查委托单号是否一致
      const orderIds = [...new Set(selectedData.map(item => item.order_id))];
      if (orderIds.length > 1) {
        alert('请选择同一委托单下的项目！');
        return;
      }

      // 获取第一个检测项目的基本信息
      const firstItem = selectedData[0];
      
      // 构建完整的模板数据，参考lab-ordering-v2的结构
      const templateData = {
        // 基本信息
        order_num: firstItem.order_id,
        customer_name: firstItem.commissioner_name || firstItem.customer_commissioner_name || '',
        commissioner_name: firstItem.commissioner_name || firstItem.customer_commissioner_name || '',
        customer_contactName: firstItem.customer_contact_name || '',
        customer_address: firstItem.customer_address || '',
        customer_contactEmail: firstItem.customer_contact_email || '',
        customer_contactPhone: firstItem.customer_contact_phone || '',
        
        // 服务类型（默认正常）
        serviceType1Symbol: '☑',
        serviceType2Symbol: '☐',
        serviceType3Symbol: '☐',
        
        // 报告标识章（默认普通报告）
        reportSeals1Symbol: '☑',
        reportSeals2Symbol: '☐',
        reportSeals3Symbol: '☐',
        
        // 交付时间
        delivery_days_after_receipt: firstItem.delivery_days || '',
        
        // 其他信息
        sample_shipping_address: '',
        total_price: firstItem.total_price || '',
        other_requirements: firstItem.other_requirements || '',
        subcontractingNotAcceptedSymbol: '☐',
        
        // 发票类型（默认增值税普通发票）
        invoiceType1Symbol: '☑',
        invoiceType2Symbol: '☐',
        
        // 报告内容（默认中文报告）
        reportContent1Symbol: '☐',
        reportContent2Symbol: '☑',
        reportContent3Symbol: '☐',
        reportContent4Symbol: '☐',
        reportContent5Symbol: '☐',
        reportContent6Symbol: '☐',
        
        // 纸质版报告寄送地址
        paperReportType1Symbol: '☑',
        paperReportType2Symbol: '☐',
        paperReportType3Symbol: '☐',
        
        // 报告抬头
        headerType1Symbol: '☑',
        headerType2Symbol: '☐',
        
        // 报告版式
        reportForm1Symbol: '☑',
        reportForm2Symbol: '☐',
        
        // 报告附加信息
        report_additional_info: '',
        header_additional_info: '',
        
        // 样品处置
        sampleHandlingType1Symbol: '☑',
        sampleHandlingType2Symbol: '☐',
        sampleHandlingType3Symbol: '☐',
        sampleHandlingType4Symbol: '☐',
        returnOptionSameSymbol: '☑',
        returnOptionOtherSymbol: '☐',
        return_address: '',
        
        // 样品危险特性
        hazardSafetySymbol: '☑',
        hazardFlammabilitySymbol: '☐',
        hazardIrritationSymbol: '☐',
        hazardVolatilitySymbol: '☐',
        hazardFragileSymbol: '☐',
        hazardOtherSymbol: '☐',
        hazard_other: '',
        
        // 样品磁性
        magnetismNonMagneticSymbol: '☑',
        magnetismWeakMagneticSymbol: '☐',
        magnetismStrongMagneticSymbol: '☐',
        magnetismUnknownSymbol: '☐',
        
        // 样品导电性
        conductivityConductorSymbol: '☐',
        conductivitySemiconductorSymbol: '☐',
        conductivityInsulatorSymbol: '☑',
        conductivityUnknownSymbol: '☐',
        
        // 是否可破坏
        breakableYesSymbol: '☑',
        breakableNoSymbol: '☐',
        
        // 是否孤品
        brittleYesSymbol: '☐',
        brittleNoSymbol: '☑',
        
        // 业务员信息
        sales_name: firstItem.sales_name || '',
        sales_email: firstItem.sales_email || '',
        sales_phone: firstItem.sales_phone || '',
        
        // 检测项目列表
        testItems: selectedData.map((item, index) => ({
          idx: index + 1,
          sample_name: item.sample_name || '',
          material: item.material || '',
          sample_type: item.sample_type || '',
          sampleTypeLabel: getSampleTypeLabel(item.sample_type),
          original_no: item.original_no || '',
          test_item: formatTestItemName(item) || '',
          test_method: item.test_method || '',
          sample_preparation: item.sample_preparation,
          samplePrepYesSymbol: item.sample_preparation === 1 ? '☑' : '☐',
          samplePrepNoSymbol: item.sample_preparation === 0 ? '☑' : '☐',
          quantity: item.quantity || '',
          note: item.note || '',
          department_name: item.department_name || ''
        })),
        
        // 付款方信息
        payer_name: firstItem.payer_name || firstItem.customer_name || '',
        payer_address: firstItem.payer_address || '',
        payer_contactName: firstItem.payer_contact_name || firstItem.customer_contact_name || '',
        payer_contactEmail: firstItem.payer_contact_email || '',
        payer_contactPhone: firstItem.payer_contact_phone || '',
        payer_bankName: firstItem.payer_bank_name || '',
        payer_taxNumber: firstItem.payer_tax_number || '',
        payer_bankAccount: firstItem.payer_bank_account || ''
      };

      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch('/api/templates/generate-order-template', {
        method: 'POST',
        headers,
        body: JSON.stringify(templateData)
      });

      if (!response.ok) {
        throw new Error(`导出失败: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateData.order_num}-${templateData.customer_name}-${templateData.customer_contactName}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setShowExportModal(false);
      alert('委托单模板导出成功');
    } catch (error) {
      console.error('导出委托单模板失败:', error);
      alert('导出失败：' + error.message);
    }
  };

  // 获取样品类型标签
  const getSampleTypeLabel = (sampleType) => {
    const sampleTypeMap = { 1: '板材', 2: '棒材', 3: '粉末', 4: '液体', 5: '其他' };
    return sampleTypeMap[sampleType] || sampleType || '';
  };

  // 导出流转单模板
  const handleExportProcessTemplate = async () => {
    try {
      const selectedData = await getSelectedItemsData();
      if (selectedData.length === 0) {
        alert('没有选中的检测项目数据');
        return;
      }

      // 检查委托单号是否一致
      const orderIds = [...new Set(selectedData.map(item => item.order_id))];
      if (orderIds.length > 1) {
        alert('请选择同一委托单下的项目！');
        return;
      }

      const firstItem = selectedData[0];
      
      // 按部门分类检测项目
      const machiningItems = [];
      const mechanicsItems = [];
      const microItems = [];
      const physchemItems = [];
      
      selectedData.forEach((item, index) => {
        const row = {
          idx: index + 1,
          sample_code: `${firstItem.order_id}-${String(index + 1).padStart(3, '0')}`,
          test_item: formatTestItemName(item) || '',
          project_code: item.test_code || '',
          method: item.test_method || '',
          quantity: item.quantity || '',
          note: item.note || '',
          original_no: item.original_no || '',
          sample_name: item.sample_name || ''
        };
        
        // 根据部门ID分类
        if (item.test_code && item.test_code.startsWith('LX')) {
          machiningItems.push(row);
        } else {
          switch (String(item.department_id)) {
            case '3': mechanicsItems.push(row); break;
            case '1': microItems.push(row); break;
            case '2': physchemItems.push(row); break;
            default: break;
          }
        }
      });

      // 检查是否有对应部门
      const hasDept = (id) => selectedData.some(item => String(item.department_id) === String(id));
      
      // 获取当前日期
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const receiptDate = `${yyyy}-${mm}-${dd}`;

      // 构建完整的流转单数据
      const flowData = {
        order_num: firstItem.order_id,
        
        // 部门标识
        machiningCenterSymbol: machiningItems.length > 0 ? '☑' : '☐',
        mechanicsSymbol: mechanicsItems.length > 0 ? '☑' : '☐',
        microSymbol: hasDept(1) ? '☑' : '☐',
        physchemSymbol: hasDept(2) ? '☑' : '☐',
        
        // 收样日期
        sampleReceivedDate: receiptDate,
        
        // 表格显示控制
        showMechanicsTable: hasDept(3),
        showMicroTable: hasDept(1),
        showPhyschemTable: hasDept(2),
        
        // 报告内容
        reportContent1Symbol: '☐',
        reportContent2Symbol: '☑',
        reportContent3Symbol: '☐',
        reportContent6Symbol: '☐',
        
        // 报告标识章
        reportSeals1Symbol: '☑',
        reportSeals2Symbol: '☐',
        reportSeals3Symbol: '☐',
        
        // 报告版式
        reportForm1Symbol: '☑',
        reportForm2Symbol: '☐',
        
        // 报告抬头
        headerType1Symbol: '☑',
        headerType2Symbol: '☐',
        header_additional_info: '',
        
        // 服务类型
        serviceType1Symbol: '☑',
        serviceType2Symbol: '☐',
        serviceType3Symbol: '☐',
        delivery_days_after_receipt: firstItem.delivery_days || '',
        
        // 样品处置
        returnNoSymbol: '☑',
        returnPickupSymbol: '☐',
        returnMailSymbol: '☐',
        
        // 其他要求
        other_requirements: firstItem.other_requirements || '',
        
        // 样品危险特性
        hazardSafetySymbol: '☑ 无危险性',
        hazardFlammabilitySymbol: null,
        hazardIrritationSymbol: null,
        hazardVolatilitySymbol: null,
        hazardFragileSymbol: null,
        hazardOtherSymbol: null,
        
        // 样品磁性
        magnetismNonMagneticSymbol: '☑ 无磁',
        magnetismWeakMagneticSymbol: null,
        magnetismStrongMagneticSymbol: null,
        magnetismUnknownSymbol: null,
        
        // 样品导电性
        conductivityConductorSymbol: null,
        conductivitySemiconductorSymbol: null,
        conductivityInsulatorSymbol: '☑ 绝缘体',
        conductivityUnknownSymbol: null,
        
        // 是否可破坏
        breakableYesSymbol: '☑ 是',
        brittleYesSymbol: null,
        brittleNoSymbol: '☑ 否',
        
        // 项目负责人
        projectLeader: '',
        
        // 各部门检测项目
        machiningItems,
        mechanicsItems,
        microItems,
        physchemItems
      };

      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      const headers = {
        'Authorization': `Bearer ${user.token}`,
        'Content-Type': 'application/json'
      };

      const response = await fetch('/api/templates/generate-process-template', {
        method: 'POST',
        headers,
        body: JSON.stringify(flowData)
      });

      if (!response.ok) {
        throw new Error(`导出失败: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${flowData.order_num}_流转单.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setShowExportModal(false);
      alert('流转单模板导出成功');
    } catch (error) {
      console.error('导出流转单模板失败:', error);
      alert('导出失败：' + error.message);
    }
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

  // 复制检测项目
  const handleCopyTestItem = (item) => {
    // 构建复制数据的URL参数，排除ID相关字段
    const copyData = {
      order_id: item.order_id,
      category_name: item.category_name,
      detail_name: item.detail_name,
      sample_name: item.sample_name,
      material: item.material,
      sample_type: item.sample_type,
      original_no: item.original_no,
      test_code: item.test_code,
      standard_code: item.standard_code,
      department_id: item.department_id,
      group_id: item.group_id,
      unit_price: item.unit_price,
      discount_rate: item.discount_rate,
      final_unit_price: item.final_unit_price,
      line_total: item.line_total,
      quantity: item.quantity,
      machine_hours: item.machine_hours,
      work_hours: item.work_hours,
      is_add_on: 1, // 标记为加测
      is_outsourced: item.is_outsourced,
      seq_no: item.seq_no,
      sample_preparation: item.sample_preparation,
      note: item.note,
      // 不复制分配相关字段，让用户重新选择
      // current_assignee: item.current_assignee,
      // supervisor_id: item.supervisor_id,
      // technician_id: item.technician_id,
      equipment_id: item.equipment_id,
      arrival_mode: item.arrival_mode,
      sample_arrival_status: item.sample_arrival_status,
      actual_sample_quantity: item.actual_sample_quantity,
      // 不复制交付日期，让用户重新填写
      // actual_delivery_date: item.actual_delivery_date,   
      field_test_time: item.field_test_time,
      price_note: item.price_note,
      // 添加其他可能缺失的字段
      status: 'new' // 确保状态为新建
    };

    // 将数据编码为URL参数
    const params = new URLSearchParams();
    Object.keys(copyData).forEach(key => {
      if (copyData[key] !== null && copyData[key] !== undefined && copyData[key] !== '') {
        params.append(key, copyData[key]);
      }
    });

    // 跳转到新增页面，并传递复制数据
    navigate(`/test-items/new?copy=${encodeURIComponent(params.toString())}`);
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

      // 获取当前项，用于后续计算和合并
      const currentItem = data.find(x => x.test_item_id === testItemId) || {};
      let updateData = {};
      
      // 先设置基本字段值
      updateData[field] = value;
      
      // 特殊处理测试人员字段：需要保存technician_id而不是technician_name
      if (field === 'technician_name') {
        // 根据姓名找到对应的technician_id
        const technician = technicians.find(t => t.name === value);
        if (technician) {
          updateData.technician_id = technician.id;
          updateData.technician_name = value;
        } else {
          // 如果找不到对应的技术人员，清空technician_id
          updateData.technician_id = null;
          updateData.technician_name = value;
        }
        // 规则：测试人员有值 => 进行中；否则 => 已分配
        const hasTech = !!(value && value.trim());
        if (hasTech) {
          updateData.status = 'running';
        } else {
          updateData.status = currentItem.supervisor_name ? 'assigned' : 'assigned';
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
        // 规则：负责人有值 => 已分配；否则 => 新建（但若已有测试人员，则保持进行中）
        const hasSupervisor = !!(value && value.trim());
        if (currentItem.technician_name) {
          updateData.status = 'running';
        } else {
          updateData.status = hasSupervisor ? 'assigned' : 'new';
        }
      }
      
      // 特殊处理现场测试时间字段：需要转换datetime-local格式
      if (field === 'field_test_time') {
        if (value === '' || value === undefined || value === null) {
          updateData.field_test_time = null;
        } else {
          // datetime-local格式已经是MySQL DATETIME兼容的格式
          updateData.field_test_time = value;
        }
      }
      
      // 特殊处理discount_rate：验证输入范围并保存为十位数（如90表示90%）
      if (field === 'discount_rate') {
        if (value === '' || value === undefined || value === null) {
          updateData[field] = null;
        } else {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            throw new Error('折扣必须是数字');
          }
          if (numValue < 0 || numValue > 100) {
            throw new Error('折扣必须在0-100之间');
          }
          // 数据库存储的是十位数形式，如 90 表示 90%
          updateData[field] = numValue;
        }
      }
      
      // 特殊处理number类型字段：将空字符串转换为null，避免数据库错误
      // 注意：actual_sample_quantity 需要保留数字值，不能因为空字符串就设为null
      if (['line_total', 'machine_hours', 'work_hours', 'unit_price', 'quantity', 'final_unit_price'].includes(field)) {
        if (value === '' || value === undefined || value === null) {
          updateData[field] = null;
        } else {
          updateData[field] = Number(value);
        }
      }
      
      // 对于 actual_sample_quantity，需要确保数字值正确保存
      if (field === 'actual_sample_quantity') {
        if (value === '' || value === undefined || value === null) {
          updateData[field] = null;
        } else {
          // 确保是数字类型，即使是字符串数字也要转换
          const numValue = Number(value);
          updateData[field] = isNaN(numValue) ? null : numValue;
        }
      }
      
      // 对于 unit 字段，确保字符串值正确保存
      if (field === 'unit') {
        // unit 是字符串类型，空字符串应该保存为null
        // 确保值不为undefined
        if (value === '' || value === undefined || value === null) {
          updateData[field] = null;
        } else {
          updateData[field] = String(value); // 确保是字符串类型
        }
      }
      
      // 实时计算标准总价：当修改标准单价或计费数量时，自动计算 line_total = unit_price × actual_sample_quantity
      if (field === 'unit_price' || field === 'actual_sample_quantity') {
        // 获取最新的标准单价和计费数量值
        // 如果当前修改的是unit_price，使用新的value；否则使用currentItem中的值
        const unitPrice = field === 'unit_price' 
          ? (value === '' || value === undefined || value === null ? null : Number(value))
          : (currentItem.standard_price ? Number(currentItem.standard_price) : (currentItem.unit_price ? Number(currentItem.unit_price) : null));
        
        // 如果当前修改的是actual_sample_quantity，使用新的value；否则使用currentItem中的值
        const quantity = field === 'actual_sample_quantity'
          ? (value === '' || value === undefined || value === null ? null : Number(value))
          : (currentItem.actual_sample_quantity ? Number(currentItem.actual_sample_quantity) : null);
        
        // 计算标准总价
        if (unitPrice !== null && quantity !== null && !isNaN(unitPrice) && !isNaN(quantity) && unitPrice >= 0 && quantity >= 0) {
          const calculatedLineTotal = unitPrice * quantity;
          updateData.line_total = calculatedLineTotal;
        } else {
          // 如果任一值为空或无效，则标准总价也为空
          updateData.line_total = null;
        }
      }
      
      const response = await fetch(`/api/test-items/${testItemId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('保存失败:', response.status, errorText);
        throw new Error(`更新失败: ${response.status}`);
      }

      // 获取后端返回的完整更新数据
      const updatedItem = await response.json();

      // 更新本地数据
      setData(prevData => 
        prevData.map(item => {
          if (item.test_item_id === testItemId) {
            // 合并后端返回的数据，先复制原数据
            const merged = { ...item };
            
            // 首先，强制使用我们发送给后端的值来更新当前修改的字段
            // 这确保了即使后端返回的数据有问题，也能正确显示
            // updateData 中的值已经经过处理（数字类型已转换，空字符串已转为null等）
            // 注意：updateData 可能已经被特殊处理覆盖，需要检查原始的 updateData 对象
            const updateDataValue = updateData[field];
            
            if (updateDataValue !== undefined) {
              merged[field] = updateDataValue;
            } else if (updatedItem[field] !== undefined) {
              merged[field] = updatedItem[field];
            }
            // 如果 updateData 和 updatedItem 都 undefined，保留原值（已在 merged = { ...item } 中保留）
            
            // 然后更新其他后端返回的字段（但跳过已处理的当前字段）
            Object.keys(updatedItem).forEach(key => {
              // 跳过当前修改的字段（已经在上面处理了）
              if (key === field) {
                return;
              }
              
              // 跳过一些特殊字段，它们需要单独处理
              if (key === 'assignee_name' || key === 'supervisor_name' || key === 'technician_name') {
                return; // 这些字段由前端显示使用，但不应该覆盖
              }
              
              // 对于其他字段：
              // - 如果是 number 类型字段（如 actual_sample_quantity），0 也是有效值
              // - 如果后端返回的是有效值（包括 0 和 null，但不包括 undefined），则更新
              // - 如果后端返回 undefined，保留前端原值（已经在merged中保留了）
              if (updatedItem[key] !== undefined) {
                // 对于 number 类型，null 也应该更新（表示清空）
                // 对于其他类型，null 也应该更新
                merged[key] = updatedItem[key];
              }
              // 如果后端返回 undefined，保留前端原值
            });
            
            // 后端返回的是unit_price，但前端显示使用的是standard_price，需要同步映射
            if (updatedItem.unit_price !== undefined && updatedItem.unit_price !== null) {
              merged.standard_price = updatedItem.unit_price;
            }
            
            // 如果更新了标准单价或计费数量，重新计算标准总价（使用最新的值）
            if (field === 'unit_price' || field === 'actual_sample_quantity') {
              // 使用合并后的最新值进行计算
              const unitPrice = merged.standard_price || merged.unit_price;
              const quantity = merged.actual_sample_quantity;
              if (unitPrice !== null && unitPrice !== undefined && quantity !== null && quantity !== undefined) {
                const unitPriceNum = Number(unitPrice);
                const quantityNum = Number(quantity);
                if (!isNaN(unitPriceNum) && !isNaN(quantityNum)) {
                  merged.line_total = unitPriceNum * quantityNum;
                }
              }
            }
            return merged;
          }
          return item;
        })
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
    if (amount === null || amount === undefined || amount === '') return '';
    const n = Number(amount);
    if (Number.isFinite(n)) {
      return `¥${n.toFixed(2)}`;
    }
    // 非数字（例如来自价格表的字符串单价），原样返回
    return String(amount);
  };

  const formatPercentage = (rate) => {
    if (!rate) return '';
    // 数据库存储的是十位数（如90表示90%），直接显示即可
    return `${Number(rate).toFixed(1)}%`;
  };

  const formatPriceRange = (unitPrice, minimumPrice) => {
    const formattedUnit = formatCurrency(unitPrice);
    const formattedMinimum = formatCurrency(minimumPrice);
    if (formattedUnit && formattedMinimum) {
      return `${formattedUnit} - ${formattedMinimum}`;
    }
    if (formattedUnit) return formattedUnit;
    if (formattedMinimum) return formattedMinimum;
    return '';
  };

  const getRowClassNames = (item) => {
    const classes = [];
    const abnormal = item?.abnormal_condition ? String(item.abnormal_condition) : '';
    if (abnormal.includes('暂停')) {
      classes.push('row-paused');
    }
    if (item?.status === 'cancelled') {
      classes.push('row-cancelled');
    }
    if (item?.status === 'completed') {
      classes.push('row-completed');
    }
    return classes.join(' ');
  };

  const handleExportWH = async () => {
    try {
      if (selectedItems.length === 0) {
        alert('请先选择检测项目');
        return;
      }
      const selectedData = data.filter(item => selectedItems.includes(item.test_item_id));
      const uniqueOrders = Array.from(new Set(selectedData.map(it => it.order_id)));
      if (uniqueOrders.length !== 1) {
        alert('必须选择同一委托单号下的项目');
        return;
      }
      // 仅物化部门用户可见该功能；再次校验所选项目均为物化部门
      const nonWH = selectedData.find(it => String(it.department_id) !== '2');
      if (nonWH) {
        alert('仅支持物化部门(2)的项目导出物化报告');
        return;
      }

      const orderId = uniqueOrders[0];
      const blob = await api.generateWHReport({ order_id: orderId, test_item_ids: selectedItems });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${orderId}_物化报告.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (e) {
      alert(e.message || '导出失败');
    }
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

  const canCreateTestItem = user && ['admin', 'leader', 'supervisor', 'sales'].includes(user.role);

  const canCopyItem = (item) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'leader') return canLeaderEditItem(item);
    if (['supervisor', 'sales'].includes(user.role)) return true;
    return false;
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
                placeholder="搜索委托单号、客户名称、检测项目、委托方联系人..."
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <div className="search-buttons">
                <button onClick={handleSearch} className="btn btn-primary btn-small">搜索</button>
                {user?.department_id === 4 && (
                  <button 
                    onClick={handleMyItems} 
                    className="btn btn-info btn-small"
                    style={{ backgroundColor: myItemsFilter ? '#17a2b8' : '#6c757d', color: 'white' }}
                    title="筛选指派给我的项目"
                  >
                    我的
                  </button>
                )}
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
          {(user?.role === 'admin' || user?.role === 'viewer' || (user?.role === 'leader' && Number(user?.department_id) === 5)) && (
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
          <div className="filter-group">
            <label>现场测试时间:</label>
            <input
              type="date"
              value={fieldTestDateFilter}
              onChange={(e) => setFieldTestDateFilter(e.target.value)}
              placeholder="选择日期"
            />
          </div>
          <div className="filter-actions">
            {canCreateTestItem && (
              <button 
                onClick={() => navigate('/test-items/new')} 
                className="btn btn-info"
              >
                添加检测
              </button>
            )}
            <button 
              onClick={handleBatchUpload} 
              className="btn btn-success"
              disabled={selectedItems.length === 0}
            >
              一键上传 ({selectedItems.length})
            </button>
            <button 
              onClick={handleExport} 
              className="btn btn-primary"
              disabled={selectedItems.length === 0}
              style={{backgroundColor: '#007bff', color: 'white'}}
            >
              导出 ({selectedItems.length})
            </button>
            {user?.role === 'admin' && (
              <>
                <button 
                  onClick={handleBatchDelete} 
                  className="btn btn-danger"
                  disabled={selectedItems.length === 0}
                  style={{backgroundColor: '#dc3545', color: 'white'}}
                >
                  批量删除 ({selectedItems.length})
                </button>
                <button 
                  onClick={() => navigate('/orders/delete')} 
                  className="btn btn-danger"
                  style={{backgroundColor: '#dc3545', color: 'white'}}
                >
                  删除委托单
                </button>
              </>
            )}
          </div>
        </div>
        <div className="online-indicator">
          {isConnected ? `🟢 在线 (${getOnlineUserCount()} 人)` : '🔴 离线'}
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
            {hiddenColumns.length > 0 && (
              <div className="hidden-columns-bar">
                <span className="hidden-columns-label">已隐藏列:</span>
                {hiddenColumns.map(col => (
                  <button
                    key={col.key}
                    type="button"
                    className="hidden-column-chip"
                    onClick={() => toggleColumnVisibility(col.key)}
                    title={`显示${col.label}`}
                  >
                    {col.label} ▸
                  </button>
                ))}
              </div>
            )}
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="fixed-left-checkbox">
                      <input 
                        type="checkbox" 
                        checked={(() => {
                          const selectable = data.filter(item => {
                            if (user?.role === 'leader') {
                              return canLeaderEditItem(item);
                            }
                            return true;
                          });
                          if (selectable.length === 0) return false;
                          return selectable.every(item => selectedItems.includes(item.test_item_id));
                        })()}
                        onChange={handleSelectAll}
                        title="全选"
                        disabled={selectAllLoading}
                      />
                    </th>
                    <th className="pre-urgent-field fixed-left">委托单号</th>
                    <th className="pre-urgent-field fixed-left">检测项目</th>
                    {renderColumnHeader('test_code', '项目编号', 'pre-urgent-field narrow-col')}
                    {renderColumnHeader('commissioner', '委托单位', 'pre-urgent-field commissioner-col')}
                    {renderColumnHeader('contact', '联系人', 'pre-urgent-field narrow-col')}
                    {user?.role === 'admin' && renderColumnHeader('department', '归属部门', 'order-creator-field')}
                    {renderColumnHeader('price_original', '收费标准', 'order-creator-field price-original-col')}
                    {renderColumnHeader('price_note', '业务报价', 'order-creator-field price-note-col')}
                    {renderColumnHeader('quantity', '数量', 'order-creator-field quantity-col')}
                    {renderColumnHeader('assignee_name', '业务负责人', 'order-creator-field narrow-col')}
                    {renderColumnHeader('discount_rate', '折扣', 'order-creator-field discount-col')}
                    {renderColumnHeader('customer_note', '客户备注', 'order-creator-field note-col')}
                    {renderColumnHeader('order_created_at', '收样日期', 'order-creator-field narrow-col')}
                    {renderColumnHeader('test_item_created_at', '开单日期', 'order-creator-field narrow-col')}
                    {renderColumnHeader('arrival_mode', '样品到达方式', 'order-creator-field narrow-col')}
                    {renderColumnHeader('sample_arrival_status', '样品是否已到', 'order-creator-field narrow-col')}
                    {renderColumnHeader('service_urgency', '服务加急', 'order-creator-field narrow-col')}
                    {renderColumnHeader('supervisor_name', '负责人', 'lab-field narrow-col')}
                    {renderColumnHeader('standard_price', '标准单价', 'lab-field')}
                    {renderColumnHeader('technician_name', '测试人员', 'lab-field narrow-col')}
                    {renderColumnHeader('assignment_note', '指派备注', 'lab-field note-col')}
                    {renderColumnHeader('field_test_time', '现场测试时间', 'lab-field')}
                    {renderColumnHeader('equipment_name', '检测设备', 'lab-field')}
                    {renderColumnHeader('actual_sample_quantity', '计费数量', 'lab-field narrow-col')}
                    {renderColumnHeader('unit', '单位', 'lab-field narrow-col')}
                    {renderColumnHeader('work_hours', '测试工时', 'lab-field narrow-col')}
                    {renderColumnHeader('machine_hours', '测试机时', 'lab-field narrow-col')}
                    {renderColumnHeader('test_notes', '实验备注', 'lab-field note-col')}
                    {renderColumnHeader('line_total', '标准总价', 'lab-field narrow-col')}
                    {renderColumnHeader('final_unit_price', '测试总价', 'lab-field narrow-col')}
                    {renderColumnHeader('actual_delivery_date', '实际交付日期', 'lab-field')}
                    {renderColumnHeader('business_note', '业务备注', 'lab-field note-col')}
                    {renderColumnHeader('unpaid_amount', '开票未到款金额', 'lab-field')}
                    {renderColumnHeader('status', '项目状态', 'lab-field narrow-col')}
                    {renderColumnHeader('abnormal_condition', '异常情况', 'lab-field narrow-col')}
                    <th className="lab-field fixed-right narrow-col">文件管理</th>
                    <th className="fixed-right" ref={operationColumnRef}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item) => (
                    <tr key={item.test_item_id} className={getRowClassNames(item)}>
                      <td className="fixed-left-checkbox">
                        <input 
                          type="checkbox" 
                          checked={selectedItems.includes(item.test_item_id)}
                          onChange={(e) => handleItemSelect(item.test_item_id, e.target.checked)}
                          disabled={user?.role === 'leader' && !canLeaderEditItem(item)}
                        />
                      </td>
                      <td className="pre-urgent-field fixed-left">
                        <div className="order-id-wrapper">
                          <span className="order-id-text">{item.order_id}</span>
                          {item.status === 'completed' && (
                            <span className="status-icon status-icon-completed" title="已完成">&#10003;</span>
                          )}
                        </div>
                      </td>
                      <td className="pre-urgent-field fixed-left">
                        <div style={{fontSize: '12px', lineHeight: '1.3'}}>
                          <div>
                            <DetailViewLink 
                              text={`${item.category_name || ''} - ${item.detail_name || ''}`}
                              maxLength={50}
                              fieldName="检测项目"
                            />
                          </div>
                          <div>
                            <strong>样品原号:</strong>{' '}
                            <DetailViewLink 
                              text={item.original_no || ''}
                              maxLength={20}
                              fieldName="样品原号"
                            />
                          </div>
                        </div>
                      </td>
                      <td className={getColumnCellClass('test_code', 'pre-urgent-field narrow-col')} data-column-key="test_code">{item.test_code || ''}</td>
                      <td className={getColumnCellClass('commissioner', 'pre-urgent-field commissioner-col')} data-column-key="commissioner">
                        {item.customer_commissioner_name ? (
                          <span 
                            className="clickable-customer"
                            onClick={() => handleOrderPartyClick(item.order_id)}
                            title="点击查看委托单相关信息（委托方/付款方/客户）"
                          >
                            {item.customer_commissioner_name}
                          </span>
                        ) : ''}
                      </td>
                      <td className={getColumnCellClass('contact', 'pre-urgent-field narrow-col')} data-column-key="contact">
                        {item.customer_contact_name ? (
                          <span 
                            className="clickable-customer"
                            onClick={() => handleOrderPartyClick(item.order_id)}
                            title="点击查看委托单相关信息（委托方/付款方/客户）"
                          >
                            {item.customer_contact_name}
                          </span>
                        ) : ''}
                      </td>
                      {user?.role === 'admin' && <td className={getColumnCellClass('department', 'order-creator-field')} data-column-key="department">
                        {item.department_name || ''}
                      </td>}
                      <td className={getColumnCellClass('price_original', 'order-creator-field price-original-col')} data-column-key="price_original">
                        <div style={{fontSize: '12px', lineHeight: '1.3'}}>
                          <div style={{display: 'flex', gap: '4px'}}>
                            <strong style={{color: '#6c757d'}}>收费标准:</strong>
                            <DetailViewLink 
                              text={formatCurrency(item.original_unit_price)}
                              maxLength={15}
                              fieldName="收费标准"
                            />
                          </div>
                          <div style={{display: 'flex', gap: '4px'}}>
                            <strong style={{color: '#6c757d'}}>最低报价:</strong>
                            <DetailViewLink 
                              text={formatCurrency(item.minimum_price)}
                              maxLength={15}
                              fieldName="最低报价"
                            />
                          </div>
                        </div>
                      </td>
                      <td className={getColumnCellClass('price_note', 'order-creator-field price-note-col')} data-column-key="price_note">
                        {user?.role === 'admin' ? (
                          <div className="editable-field-container">
                            <RealtimeEditableCell
                              value={item.price_note}
                              type="textarea"
                              onSave={handleSaveEdit}
                              field="price_note"
                              testItemId={item.test_item_id}
                              placeholder="输入业务报价"
                              isFieldBeingEdited={isFieldBeingEdited}
                              getEditingUser={getEditingUser}
                              emitUserEditing={emitUserEditing}
                              emitUserStopEditing={emitUserStopEditing}
                            />
                            <SavingIndicator testItemId={item.test_item_id} field="price_note" />
                          </div>
                        ) : (
                          <ReadonlyNoteField text={item.price_note || ''} maxLength={50} fieldName="业务报价" />
                        )}
                      </td>
                      <td className={getColumnCellClass('quantity', 'order-creator-field quantity-col')} data-column-key="quantity">
                        {canEditField('quantity', item) ? (
                          <div className="editable-field-container">
                            <RealtimeEditableCell
                              value={item.quantity}
                              type="number"
                              onSave={handleSaveEdit}
                              field="quantity"
                              testItemId={item.test_item_id}
                              placeholder="输入数量"
                              isFieldBeingEdited={isFieldBeingEdited}
                              getEditingUser={getEditingUser}
                              emitUserEditing={emitUserEditing}
                              emitUserStopEditing={emitUserStopEditing}
                            />
                            <SavingIndicator testItemId={item.test_item_id} field="quantity" />
                          </div>
                        ) : (
                          <span className="readonly-field">{item.quantity || ''}</span>
                        )}
                      </td>
                      <td className={getColumnCellClass('assignee_name', 'order-creator-field narrow-col')} data-column-key="assignee_name">
                        {canEditField('assignee_name', item) ? (
                          <div className="editable-field-container">
                            <RealtimeEditableCell
                              value={item.assignee_name}
                              type="autocomplete"
                              options={assigneeOptions}
                              onSave={handleSaveEdit}
                              field="assignee_name"
                              testItemId={item.test_item_id}
                              placeholder="输入业务负责人姓名"
                              isFieldBeingEdited={isFieldBeingEdited}
                              getEditingUser={getEditingUser}
                              emitUserEditing={emitUserEditing}
                              emitUserStopEditing={emitUserStopEditing}
                            />
                            <SavingIndicator testItemId={item.test_item_id} field="assignee_name" />
                          </div>
                        ) : (
                          <span className="readonly-field">{item.assignee_name || ''}</span>
                        )}
                      </td>
                      <td className={getColumnCellClass('discount_rate', 'order-creator-field discount-col')} data-column-key="discount_rate">
                        <div className="editable-field-container">
                          <RealtimeEditableCell
                            value={item.discount_rate !== null && item.discount_rate !== undefined ? Number(item.discount_rate).toFixed(1) : ''}
                            type="number"
                            onSave={handleSaveEdit}
                            field="discount_rate"
                            testItemId={item.test_item_id}
                            placeholder="折扣(0-100)"
                            isFieldBeingEdited={isFieldBeingEdited}
                            getEditingUser={getEditingUser}
                            emitUserEditing={emitUserEditing}
                            emitUserStopEditing={emitUserStopEditing}
                            suffix="%"
                          />
                          <SavingIndicator testItemId={item.test_item_id} field="discount_rate" />
                        </div>
                      </td>
                      <td className={getColumnCellClass('customer_note', 'order-creator-field note-col')} data-column-key="customer_note">
                        {user?.role === 'admin' ? (
                          <div className="editable-field-container">
                            <RealtimeEditableCell
                              value={item.note}
                              type="textarea"
                              onSave={handleSaveEdit}
                              field="note"
                              testItemId={item.test_item_id}
                              placeholder="输入客户备注"
                              isFieldBeingEdited={isFieldBeingEdited}
                              getEditingUser={getEditingUser}
                              emitUserEditing={emitUserEditing}
                              emitUserStopEditing={emitUserStopEditing}
                            />
                            <SavingIndicator testItemId={item.test_item_id} field="note" />
                          </div>
                        ) : (
                          <DetailViewLink 
                            text={item.note || ''}
                            maxLength={30}
                            fieldName="客户备注"
                          />
                        )}
                      </td>
                      <td className={getColumnCellClass('order_created_at', 'order-creator-field narrow-col')} data-column-key="order_created_at">{formatDate(item.order_created_at)}</td>
                      <td className={getColumnCellClass('test_item_created_at', 'order-creator-field narrow-col')} data-column-key="test_item_created_at">{formatDate(item.test_item_created_at)}</td>
                      <td className={getColumnCellClass('arrival_mode', 'order-creator-field narrow-col')} data-column-key="arrival_mode">
                        {user?.role === 'admin' ? (
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
                        ) : (
                          <span className="readonly-field">
                            {item.arrival_mode === 'on_site' ? '现场' : item.arrival_mode === 'delivery' ? '寄样' : ''}
                          </span>
                        )}
                      </td>
                      <td className={getColumnCellClass('sample_arrival_status', 'order-creator-field narrow-col')} data-column-key="sample_arrival_status">
                        {user?.role === 'admin' ? (
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
                        ) : (
                          <span className="readonly-field">
                            {item.sample_arrival_status === 'arrived' ? '已到' : item.sample_arrival_status === 'not_arrived' ? '未到' : ''}
                          </span>
                        )}
                      </td>
                      <td className={getColumnCellClass('service_urgency', 'order-creator-field narrow-col')} data-column-key="service_urgency">
                        {canEditField('service_urgency', item) ? (
                          <div className="editable-field-container">
                            <RealtimeEditableCell
                              value={(() => {
                                if (item.service_urgency === '不加急') return 'normal';
                                if (item.service_urgency === '加急1.5倍') return 'urgent_1_5x';
                                if (item.service_urgency === '特急2倍') return 'urgent_2x';
                                return item.service_urgency || '';
                              })()}
                              type="select"
                              options={SERVICE_URGENCY_OPTIONS}
                              onSave={async (field, value, testItemId) => {
                                // 服务加急需要更新test_items的service_urgency字段
                                try {
                                  const userLocal = JSON.parse(localStorage.getItem('lims_user') || 'null');
                                  const response = await fetch(`/api/test-items/${testItemId}`, {
                                    method: 'PUT',
                                    headers: {
                                      'Authorization': `Bearer ${userLocal.token}`,
                                      'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ service_urgency: value })
                                  });
                                  if (!response.ok) {
                                    const errorData = await response.json().catch(() => ({ error: '未知错误' }));
                                    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
                                  }
                                  await response.json();
                                  const urgencyMap = {
                                    'normal': '不加急',
                                    'urgent_1_5x': '加急1.5倍',
                                    'urgent_2x': '特急2倍'
                                  };
                                  setData(prevData => 
                                    prevData.map(item => 
                                      item.test_item_id === testItemId 
                                        ? { ...item, service_urgency: urgencyMap[value] || value }
                                        : item
                                    )
                                  );
                                  setSavingStatus(prev => ({
                                    ...prev,
                                    [`${testItemId}-${field}`]: 'success'
                                  }));
                                } catch (error) {
                                  console.error('更新服务加急失败:', error);
                                  alert('更新服务加急失败: ' + (error.message || '未知错误'));
                                  setSavingStatus(prev => ({
                                    ...prev,
                                    [`${testItemId}-${field}`]: 'error'
                                  }));
                                  throw error;
                                }
                              }}
                              field="service_urgency"
                              testItemId={item.test_item_id}
                              placeholder="选择服务加急"
                              isFieldBeingEdited={isFieldBeingEdited}
                              getEditingUser={getEditingUser}
                              emitUserEditing={emitUserEditing}
                              emitUserStopEditing={emitUserStopEditing}
                            />
                            <SavingIndicator testItemId={item.test_item_id} field="service_urgency" />
                          </div>
                        ) : (
                          <span className="readonly-field">{item.service_urgency || ''}</span>
                        )}
                      </td>
                      <td className={getColumnCellClass('supervisor_name', 'lab-field narrow-col')} data-column-key="supervisor_name">
                        {canEditField('supervisor_name', item) ? (
                          <div className="editable-field-container">
                            <RealtimeEditableCell
                              value={item.supervisor_name}
                              type="autocomplete"
                              options={assigneeOptions}
                              loadOptions={() => loadUsersForItem(item, 'supervisor')}
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
                        ) : (
                          <span className="readonly-field">{item.supervisor_name || ''}</span>
                        )}
                      </td>
                      <td className={getColumnCellClass('standard_price', 'lab-field')} data-column-key="standard_price">
                        {canEditField('unit_price', item) ? (
                          <div className="editable-field-container">
                            <RealtimeEditableCell
                              value={item.standard_price}
                              type="number"
                              onSave={handleSaveEdit}
                              field="unit_price"
                              testItemId={item.test_item_id}
                              placeholder="输入标准单价"
                              isFieldBeingEdited={isFieldBeingEdited}
                              getEditingUser={getEditingUser}
                              emitUserEditing={emitUserEditing}
                              emitUserStopEditing={emitUserStopEditing}
                            />
                            <SavingIndicator testItemId={item.test_item_id} field="unit_price" />
                          </div>
                        ) : (
                          <span className="readonly-field">{formatCurrency(item.standard_price)}</span>
                        )}
                      </td>
                      <td className={getColumnCellClass('technician_name', 'lab-field narrow-col')} data-column-key="technician_name">
                        {canEditField('technician_name', item) ? (
                          <div className="editable-field-container">
                            <RealtimeEditableCell
                              value={item.technician_name}
                              type="autocomplete"
                              options={technicians}
                              loadOptions={() => loadUsersForItem(item, 'technician')}
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
                        ) : (
                          <span className="readonly-field">{item.technician_name || ''}</span>
                        )}
                      </td>
                      <td className={getColumnCellClass('assignment_note', 'lab-field note-col')} data-column-key="assignment_note">
                        <div className="editable-field-container">
                          {canEditField('assignment_note', item) ? (
                            <>
                              <RealtimeEditableCell
                                value={item.assignment_note}
                                type="textarea"
                                onSave={handleSaveEdit}
                                field="assignment_note"
                                testItemId={item.test_item_id}
                                placeholder="输入指派备注"
                                isFieldBeingEdited={isFieldBeingEdited}
                                getEditingUser={getEditingUser}
                                emitUserEditing={emitUserEditing}
                                emitUserStopEditing={emitUserStopEditing}
                              />
                              <SavingIndicator testItemId={item.test_item_id} field="assignment_note" />
                            </>
                          ) : (
                            <DetailViewLink text={item.assignment_note || ''} maxLength={30} fieldName="指派备注" />
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('field_test_time', 'lab-field')} data-column-key="field_test_time">
                        <div className="editable-field-container">
                          {canEditField('field_test_time', item) ? (
                            <>
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
                                copiedValue={copiedFieldTestTime}
                                onCopyValue={setCopiedFieldTestTime}
                              />
                              <SavingIndicator testItemId={item.test_item_id} field="field_test_time" />
                            </>
                          ) : (
                            <span className="readonly-field">{item.field_test_time || ''}</span>
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('equipment_name', 'lab-field')} data-column-key="equipment_name">
                        <div className="editable-field-container">
                          {canEditField('equipment_name', item) ? (
                            <>
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
                            </>
                          ) : (
                            <span className="readonly-field">{item.equipment_name || ''}</span>
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('actual_sample_quantity', 'lab-field narrow-col')} data-column-key="actual_sample_quantity">
                        <div className="editable-field-container">
                          {canEditField('actual_sample_quantity', item) ? (
                            <>
                              <RealtimeEditableCell
                                value={item.actual_sample_quantity}
                                type="number"
                                onSave={handleSaveEdit}
                                field="actual_sample_quantity"
                                testItemId={item.test_item_id}
                                placeholder="计费数量"
                                isFieldBeingEdited={isFieldBeingEdited}
                                getEditingUser={getEditingUser}
                                emitUserEditing={emitUserEditing}
                                emitUserStopEditing={emitUserStopEditing}
                              />
                              <SavingIndicator testItemId={item.test_item_id} field="actual_sample_quantity" />
                            </>
                          ) : (
                            <span className="readonly-field">{item.actual_sample_quantity ?? ''}</span>
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('unit', 'lab-field narrow-col')} data-column-key="unit">
                        <div className="editable-field-container">
                          {canEditField('unit', item) ? (
                            <>
                              <RealtimeEditableCell
                                value={item.unit}
                                type="select"
                                options={[
                                  { value: '机时', label: '机时' },
                                  { value: '样品数', label: '样品数' },
                                  { value: '元素', label: '元素' },
                                  { value: '点位', label: '点位' }
                                ]}
                                onSave={handleSaveEdit}
                                field="unit"
                                testItemId={item.test_item_id}
                                placeholder="单位"
                                isFieldBeingEdited={isFieldBeingEdited}
                                getEditingUser={getEditingUser}
                                emitUserEditing={emitUserEditing}
                                emitUserStopEditing={emitUserStopEditing}
                              />
                              <SavingIndicator testItemId={item.test_item_id} field="unit" />
                            </>
                          ) : (
                            <span className="readonly-field">{item.unit || ''}</span>
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('work_hours', 'lab-field narrow-col')} data-column-key="work_hours">
                        <div className="editable-field-container">
                          {(!canEditField('work_hours', item) || (item.status === 'completed' && !['admin','leader'].includes(user?.role))) ? (
                            <span className="readonly-field">{item.work_hours ?? ''}</span>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('machine_hours', 'lab-field narrow-col')} data-column-key="machine_hours">
                        <div className="editable-field-container">
                          {(!canEditField('machine_hours', item) || (item.status === 'completed' && !['admin','leader'].includes(user?.role))) ? (
                            <span className="readonly-field">{item.machine_hours ?? ''}</span>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('test_notes', 'lab-field note-col')} data-column-key="test_notes">
                        <div className="editable-field-container">
                          {canEditField('test_notes', item) ? (
                            <>
                              <RealtimeEditableCell
                                value={item.test_notes}
                                type="textarea"
                                onSave={handleSaveEdit}
                                field="test_notes"
                                testItemId={item.test_item_id}
                                placeholder="实验备注"
                                isFieldBeingEdited={isFieldBeingEdited}
                                getEditingUser={getEditingUser}
                                emitUserEditing={emitUserEditing}
                                emitUserStopEditing={emitUserStopEditing}
                              />
                              <SavingIndicator testItemId={item.test_item_id} field="test_notes" />
                            </>
                          ) : (
                            <DetailViewLink text={item.test_notes || ''} maxLength={30} fieldName="实验备注" />
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('line_total', 'lab-field narrow-col')} data-column-key="line_total">
                        <span className="readonly-field">{formatCurrency(item.line_total)}</span>
                      </td>
                      <td className={getColumnCellClass('final_unit_price', 'lab-field narrow-col')} data-column-key="final_unit_price">
                        <div className="editable-field-container">
                          {canEditField('final_unit_price', item) ? (
                            <>
                              <RealtimeEditableCell
                                value={item.final_unit_price}
                                type="number"
                                onSave={handleSaveEdit}
                                field="final_unit_price"
                                testItemId={item.test_item_id}
                                placeholder="测试总价"
                                isFieldBeingEdited={isFieldBeingEdited}
                                getEditingUser={getEditingUser}
                                emitUserEditing={emitUserEditing}
                                emitUserStopEditing={emitUserStopEditing}
                              />
                              <SavingIndicator testItemId={item.test_item_id} field="final_unit_price" />
                            </>
                          ) : (
                            <span className="readonly-field">{formatCurrency(item.final_unit_price)}</span>
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('actual_delivery_date', 'lab-field')} data-column-key="actual_delivery_date">
                        <span className="readonly-field">{formatDate(item.actual_delivery_date)}</span>
                      </td>
                      <td className={getColumnCellClass('business_note', 'lab-field note-col')} data-column-key="business_note">
                        <div className="editable-field-container">
                          {canEditField('business_note', item) ? (
                            <>
                              <RealtimeEditableCell
                                value={item.business_note}
                                type="textarea"
                                onSave={handleSaveEdit}
                                field="business_note"
                                testItemId={item.test_item_id}
                                placeholder="输入业务备注"
                                isFieldBeingEdited={isFieldBeingEdited}
                                getEditingUser={getEditingUser}
                                emitUserEditing={emitUserEditing}
                                emitUserStopEditing={emitUserStopEditing}
                              />
                              <SavingIndicator testItemId={item.test_item_id} field="business_note" />
                            </>
                          ) : (
                            <DetailViewLink text={item.business_note || ''} maxLength={30} fieldName="业务备注" />
                          )}
                        </div>
                      </td>
                      <td className={getColumnCellClass('unpaid_amount', 'lab-field')} data-column-key="unpaid_amount">{item.unpaid_amount || ''}</td>
                      <td className={getColumnCellClass('status', 'lab-field narrow-col')} data-column-key="status">
                        <span className={`status status-${item.status}`}>
                          {item.status === 'new' && '新建'}
                          {item.status === 'assigned' && '已分配'}
                          {item.status === 'running' && '进行中'}
                          {item.status === 'completed' && '已完成'}
                          {item.status === 'cancelled' && '已取消'}
                          {item.status === 'outsource' && '委外'}
                        </span>
                      </td>
                      <td className={getColumnCellClass('abnormal_condition', 'lab-field narrow-col')} data-column-key="abnormal_condition">
                        <span className="readonly-field">{item.abnormal_condition || ''}</span>
                      </td>
                      <td className="lab-field fixed-right narrow-col">
                        <button 
                          className="btn-file" 
                          onClick={() => toggleFileView(item)}
                          title="文件管理"
                        >
                          📁
                        </button>
                      </td>
                      <td className="fixed-right" style={{whiteSpace: 'nowrap'}}>
                        <div style={{display: 'flex', gap: '4px', alignItems: 'center', width: 'fit-content'}}>
                          <button 
                            className="btn btn-success"
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
                          {/* 只有admin、supervisor、leader角色显示其他操作 */}
                          {(user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'leader') && (
                            <>
                            {/* 组长和室主任可以审批 */}
                            {(user?.role === 'supervisor' || user?.role === 'leader') && (() => {
                              const approvalAppearance = getApprovalButtonAppearance(item);
                              return (
                                <button 
                                  className="btn"
                                  onClick={() => handleApprove(item)}
                                  title="审批为已完成"
                                  disabled={approvalAppearance.disabled}
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '11px',
                                    minWidth: 'auto',
                                    backgroundColor: approvalAppearance.backgroundColor,
                                    color: approvalAppearance.color,
                                    border: `1px solid ${approvalAppearance.borderColor}`,
                                    lineHeight: '1.2',
                                    cursor: approvalAppearance.cursor,
                                    boxShadow: 'none'
                                  }}
                                >
                                  审批
                                </button>
                              );
                            })()}
                            {/* 组长（supervisor）不可以编辑，管理员和室主任可以编辑 */}
                            {(user?.role === 'admin' || user?.role === 'leader') && (
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
                            )}
                            {canCopyItem(item) && (
                              <button 
                                className="btn btn-info"
                                onClick={() => handleCopyTestItem(item)}
                                title="复制加测"
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '11px',
                                  minWidth: 'auto',
                                  backgroundColor: '#17a2b8',
                                  color: '#fff',
                                  border: '1px solid #17a2b8',
                                  lineHeight: '1.2'
                                }}
                              >
                                复制
                              </button>
                            )}
                            {(user?.role === 'supervisor' || user?.role === 'leader') && (
                              <button
                                className="btn btn-secondary"
                                onClick={() => handleTogglePause(item)}
                                title={item.abnormal_condition ? '继续测试' : '暂停测试'}
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '11px',
                                  minWidth: 'auto',
                                  lineHeight: '1.2'
                                }}
                              >
                                {item.abnormal_condition ? '继续' : '暂停'}
                              </button>
                            )}
                            {/* 组长（supervisor）不可以删除，管理员和室主任可以删除 */}
                            {(user?.role === 'admin' || user?.role === 'leader') && (
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
                            )}
                            {user?.role === 'admin' && (
                              <button 
                                className="btn btn-secondary"
                                onClick={() => handleCancel(item)}
                                title="取消此项目"
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '11px',
                                  minWidth: 'auto',
                                  lineHeight: '1.2'
                                }}
                              >
                                取消
                              </button>
                            )}
                            </>
                          )}
                        </div>
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
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="btn-secondary"
                  title="首页"
                >
                  首页
                </button>
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
                <button
                  onClick={() => setPage(Math.ceil(total / pageSize))}
                  disabled={page >= Math.ceil(total / pageSize)}
                  className="btn-secondary"
                  title="末页"
                >
                  末页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 订单关联方信息模态框（委托方/付款方/客户） */}
      <OrderPartyDetailModal
        isOpen={isOrderPartyModalOpen}
        onClose={closeOrderPartyModal}
        orderId={selectedOrderId}
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
                  // 文件上传成功后的回调
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
                  setShowBatchUploadModal(false);
                  setSelectedItems([]);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 导出模态框 */}
      {showExportModal && (
        <div className="file-modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="file-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="file-modal-header">
              <h3>导出模板 - 已选择 {selectedItems.length} 个检测项目</h3>
              <button className="close-button" onClick={() => setShowExportModal(false)}>×</button>
            </div>
            <div className="file-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px' }}>
                <button 
                  className="btn btn-success" 
                  style={{ padding: '10px 20px', fontSize: '14px', backgroundColor: '#28a745', color: 'white' }}
                  onClick={handleExportExcel}
                >
                  导出Excel
                </button>
                {user?.role === 'admin' && (
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '10px 20px', fontSize: '14px' }}
                    onClick={handleExportOrderTemplate}
                  >
                    导出委托单模板
                  </button>
                )}
                {user?.role === 'admin' && (
                  <button 
                    className="btn btn-info" 
                    style={{ padding: '10px 20px', fontSize: '14px' }}
                    onClick={handleExportProcessTemplate}
                  >
                    导出流转单模板
                  </button>
                )}
                {user?.role !== 'admin' ? null : null}
                {(() => {
                  if (String(user?.department_id) === '2') return true;
                  const selectedData = data.filter(item => selectedItems.includes(item.test_item_id));
                  if (selectedData.length === 0) return false;
                  return selectedData.every(it => String(it.department_id) === '2');
                })() && (
                  <button 
                    className="btn btn-warning" 
                    style={{ padding: '10px 20px', fontSize: '14px', backgroundColor: '#f0ad4e', color: 'white' }}
                    onClick={handleExportWH}
                  >
                    检测报告（物化）
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionForm;
