import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import './TestItemEdit.css';

function Field({label, value, onChange, type='text', disabled=false}) {
  return (
    <div>
      <label>{label}</label>
      <input className="input" value={value||''} type={type} onChange={e=>onChange(e.target.value)} disabled={disabled} />
    </div>
  )
}

/** 是否加测：1=普通加测 2=复制加测 */
function isAddOnTestItemFlag(v) {
  const n = Number(v);
  return n === 1 || n === 2;
}

function formatIsAddOnDisplay(v) {
  const n = Number(v);
  if (n === 2) return '复制加测';
  if (n === 1) return '普通加测';
  return '否';
}

const ORDER_UNIT_OPTIONS = [
  { value: '样品数', label: '样品数' },
  { value: '机时', label: '机时' },
  { value: '点位', label: '点位' },
  { value: '次', label: '次' },
  { value: '图', label: '图' },
  { value: '天', label: '天' },
  { value: '元素', label: '元素' },
  { value: '曲线', label: '曲线' }
];

export default function TestItemEdit() {
  const { id } = useParams();
  const location = useLocation();
  const isNew = id === 'new';
  const isView = new URLSearchParams(location.search).get('view') === '1';
  const isAddonRequest = new URLSearchParams(location.search).get('addon_request') === '1';
  const hasCopyParam = !!new URLSearchParams(location.search).get('copy');
  // 仅“复制加测申请”（addon_request=1&copy=）时业务报价只读；管理员直接“复制加测”（仅 copy=）允许编辑
  const isFromCopyAddonRequest = isAddonRequest && hasCopyParam;
  const [it, setIt] = useState({ 
    quantity: 1, 
    status: 'new', 
    is_add_on: 1, 
    is_outsourced: 0, 
    machine_hours: 0, 
    work_hours: 0, 
    arrival_mode: '', 
    sample_arrival_status: 'not_arrived',
    order_id: '',
    price_id: '',
    category_name: '',
    detail_name: '',
    sample_name: '',
    material: '',
    sample_type: '',
    // 当选择“其他”样品类型时，用于承载用户手填的真实类型
    sample_type_other: '',
    original_no: '',
    test_code: '',
    standard_code: '',
    department_id: '',
    group_id: '',
    unit_price: '',
    unit: '',
    discount_rate: '',
    final_unit_price: '',
    line_total: '',
    seq_no: '',
    sample_preparation: '',
    note: '',
    current_assignee: '',
    supervisor_id: '',
    technician_id: '',
    equipment_id: '',
    check_notes: '',
    test_notes: '',
    actual_sample_quantity: '',
    actual_delivery_date: '',
    field_test_time: '',
    price_note: '',
    addon_reason: '',
    service_urgency: 'normal',
    addon_target: ''
  });
  const [orderSuggestions, setOrderSuggestions] = useState([]);
  const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);
  const [priceOptions, setPriceOptions] = useState([]);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [allOrders, setAllOrders] = useState([]); // 存储所有委托单数据
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [payers, setPayers] = useState([]); // 存储付款方数据
  const [departments, setDepartments] = useState([]); // 存储部门数据
  const [labGroups, setLabGroups] = useState([]); // 存储实验室组数据
  const [selectedOrder, setSelectedOrder] = useState(null); // 选中的委托单
  const [selectedPrice, setSelectedPrice] = useState(null); // 选中的价格项目
  const [businessStaffSuggestions, setBusinessStaffSuggestions] = useState([]);
  const [showBusinessStaffSuggestions, setShowBusinessStaffSuggestions] = useState(false);
  const [supervisorSuggestions, setSupervisorSuggestions] = useState([]);
  const [showSupervisorSuggestions, setShowSupervisorSuggestions] = useState(false);
  const [supervisorDisplayText, setSupervisorDisplayText] = useState(''); // 存储负责人显示文本（工号或姓名）
  const [employeeSuggestions, setEmployeeSuggestions] = useState([]);
  const [showEmployeeSuggestions, setShowEmployeeSuggestions] = useState(false);
  const [userSearchTimeout, setUserSearchTimeout] = useState(null);
  const orderInputWrapperRef = useRef(null);
  const businessInputWrapperRef = useRef(null);
  const supervisorInputWrapperRef = useRef(null);
  const employeeInputWrapperRef = useRef(null);
  const navigate = useNavigate();
  const currentUser = React.useMemo(() => {
    try {
      const storedUser = localStorage.getItem('lims_user');
      return storedUser ? JSON.parse(storedUser) : {};
    } catch (error) {
      console.warn('解析用户信息失败:', error);
      return {};
    }
  }, []);
  const roleCode = String(currentUser?.role || '').toLowerCase();
  // 加测申请页（非复制预填）或管理员新建：业务报价、折扣率必填
  const addonBizPriceDiscountRequired = isAddonRequest && isNew && !isFromCopyAddonRequest;
  const adminCreateBizPriceDiscountRequired = isNew && roleCode === 'admin';
  const bizPriceDiscountRequired = addonBizPriceDiscountRequired || adminCreateBizPriceDiscountRequired;

  // 样品类型映射
  const typeMappings = { 
    sampleType: { '板材': 1, '棒材': 2, '粉末': 3, '液体': 4, '其他': 5 } 
  };
  const reverseSampleType = Object.entries(typeMappings.sampleType).reduce((acc, [label, code]) => {
    acc[String(code)] = label;
    return acc;
  }, {});
  const knownSampleTypeLabels = Object.keys(typeMappings.sampleType);
  const getSampleTypeUiModel = (rawValue) => {
    const raw = rawValue == null ? '' : String(rawValue).trim();
    if (!raw) return { mode: 'select', selectValue: '', otherInputValue: '' };

    // 兼容后端可能存的 1-5 枚举
    if (/^\d+$/.test(raw)) {
      const label = reverseSampleType[raw] || '';
      if (!label) return { mode: 'otherInput', selectValue: '', otherInputValue: raw };
      if (label === '其他') return { mode: 'otherInput', selectValue: '', otherInputValue: '' };
      return { mode: 'select', selectValue: label, otherInputValue: '' };
    }

    // 兼容后端可能存的中文枚举
    if (knownSampleTypeLabels.includes(raw)) {
      if (raw === '其他') return { mode: 'otherInput', selectValue: '', otherInputValue: '' };
      return { mode: 'select', selectValue: raw, otherInputValue: '' };
    }

    // 兼容“其他”的手填文本（通常已经被写回 sample_type）
    return { mode: 'otherInput', selectValue: '', otherInputValue: raw };
  };

  useEffect(()=>{
    if (!isNew) {
      api.getTestItem(id).then(async data => {
        // 规范化样品到达状态为英文枚举
        let s = data.sample_arrival_status;
        if (s === '已到') s = 'arrived';
        if (s === '未到') s = 'not_arrived';
        
        // 如果检测项目没有折扣率，尝试从委托单获取
        if ((!data.discount_rate || data.discount_rate === 0) && data.order_id) {
          try {
            const orderDetail = await api.getOrder(data.order_id);
            if (orderDetail.discount_rate) {
              data.discount_rate = orderDetail.discount_rate;
            }
          } catch (error) {
            console.log('获取委托单折扣率失败:', error);
          }
        }
        
        setIt({ ...data, sample_arrival_status: s });
        
        // 如果有负责人ID，需要查找并显示负责人信息
        if (data.supervisor_id) {
          try {
            const supervisorIdStr = String(data.supervisor_id);
            // 先尝试使用部门ID查找
            let departmentIdForQuery = data.department_id || currentUser?.department_id || undefined;
            let users = await api.getAllSupervisors({ q: '', department_id: departmentIdForQuery });
            let supervisor = users.find(u => String(u.user_id) === supervisorIdStr);
            
            // 如果没找到，且没有指定部门，尝试不传部门ID（可能跨部门）
            if (!supervisor && !departmentIdForQuery) {
              users = await api.getAllSupervisors({ q: '' });
              supervisor = users.find(u => String(u.user_id) === supervisorIdStr);
            }
            
            // 如果还是没找到，尝试使用 supervisor_id 作为搜索词
            if (!supervisor) {
              users = await api.getAllSupervisors({ q: supervisorIdStr, department_id: departmentIdForQuery });
              supervisor = users.find(u => String(u.user_id) === supervisorIdStr);
            }
            
            if (supervisor) {
              // 显示工号，如果没有工号则显示姓名
              setSupervisorDisplayText(supervisor.account || supervisor.name || '');
            } else if (data.supervisor_name) {
              // 如果找不到用户，但有姓名，则显示姓名
              setSupervisorDisplayText(data.supervisor_name);
            }
          } catch (error) {
            console.error('加载负责人信息失败:', error);
            // 如果加载失败，但有姓名，则显示姓名
            if (data.supervisor_name) {
              setSupervisorDisplayText(data.supervisor_name);
            }
          }
        }
      }).catch(e=>alert(e.message));
    } else {
      // 检查是否有复制数据
      const copyParam = new URLSearchParams(location.search).get('copy');
      if (copyParam) {
        try {
          const copyData = new URLSearchParams(decodeURIComponent(copyParam));
          const copyObj = {};
          // 只预填“输入框中可见的字段”；其它字段即使 URL 里带了也不回填（避免出现总价/计费数量不一致）
          const ignoredCopyKeys = new Set([
            'actual_sample_quantity', // 计费数量（本页面不让预填）
            'line_total',             // 标准总价（非输入框）
            'final_unit_price',      // 测试总价（非输入框）
            'lab_price',             // 实验室报价（非输入框）
            'equipment_id',          // 未在输入框中展示/编辑
            'seq_no',                // 序号字段未在输入框中展示/编辑
            'field_test_time',       // 非输入框字段
            'machine_hours',
            'work_hours'
          ]);
          for (const [key, value] of copyData.entries()) {
            if (ignoredCopyKeys.has(key)) continue;
            // 处理数字类型字段
            // supervisor_id 和 technician_id 可能是字符串类型的ID，不应该用 parseFloat 处理
            if (['price_id', 'quantity', 'unit_price', 'discount_rate',
                 'machine_hours', 'work_hours', 'is_add_on', 'is_outsourced', 'department_id',
                 'group_id', 'equipment_id'].includes(key)) {
              if (value === '' || value === null || value === undefined) {
                copyObj[key] = '';
              } else {
                const numValue = key.includes('is_') ? parseInt(value, 10) : parseFloat(value);
                // 确保解析后的值不是NaN
                copyObj[key] = isNaN(numValue) ? '' : numValue;
              }
            } else if (key === 'supervisor_id' || key === 'technician_id') {
              // supervisor_id 和 technician_id 可能是字符串或数字，保持原值
              copyObj[key] = value;
            } else {
              copyObj[key] = value;
            }
          }
          setIt(prev => ({ ...prev, ...copyObj }));
          
          // 如果复制数据包含 supervisor_id，需要根据ID查找用户信息并显示
          if (copyObj.supervisor_id) {
            const loadSupervisorInfo = async () => {
              try {
                const supervisorIdStr = String(copyObj.supervisor_id);
                // 先尝试使用部门ID查找
                let departmentIdForQuery = copyObj.department_id || currentUser?.department_id || undefined;
                let users = await api.getAllSupervisors({ q: '', department_id: departmentIdForQuery });
                let supervisor = users.find(u => String(u.user_id) === supervisorIdStr);
                
                // 如果没找到，且没有指定部门，尝试不传部门ID（可能跨部门）
                if (!supervisor && !departmentIdForQuery) {
                  users = await api.getAllSupervisors({ q: '' });
                  supervisor = users.find(u => String(u.user_id) === supervisorIdStr);
                }
                
                // 如果还是没找到，尝试使用 supervisor_id 作为搜索词
                if (!supervisor) {
                  users = await api.getAllSupervisors({ q: supervisorIdStr, department_id: departmentIdForQuery });
                  supervisor = users.find(u => String(u.user_id) === supervisorIdStr);
                }
                
                if (supervisor) {
                  // 显示工号，如果没有工号则显示姓名
                  setSupervisorDisplayText(supervisor.account || supervisor.name || '');
                } else {
                  console.warn('未找到负责人信息:', { 
                    supervisor_id: copyObj.supervisor_id, 
                    department_id: departmentIdForQuery,
                    availableUsers: users.map(u => ({ user_id: u.user_id, name: u.name, account: u.account }))
                  });
                }
              } catch (error) {
                console.error('加载负责人信息失败:', error);
              }
            };
            loadSupervisorInfo();
          }
        } catch (error) {
          console.error('解析复制数据失败:', error);
        }
      }
    }
    // 加载价格表选项
    api.listPrice({ pageSize: 1000 })
      .then(res => setPriceOptions(res.data || []))
      .catch(e => {
        console.error('加载价格表选项失败:', e);
        setPriceOptions([]);
      });
    // 加载所有委托单数据用于本地搜索
    loadAllOrders();
    loadPayers();
    loadDepartments();
    loadLabGroups();
  }, [id, location.search]);

  // 加载所有委托单数据
  const loadAllOrders = async () => {
    try {
      const res = await api.listOrders({ pageSize: 1000 });
      setAllOrders(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error('加载委托单数据失败:', e);
    }
  };

  // 加载付款方数据
  const loadPayers = async () => {
    try {
      const res = await api.listPayers({ pageSize: 1000 });
      setPayers(Array.isArray(res) ? res : (res.data || []));
    } catch (error) {
      console.error('加载付款方数据失败:', error);
    }
  };

  // 加载部门数据
  const loadDepartments = async () => {
    try {
      const res = await api.listDepartments({ pageSize: 1000 });
      setDepartments(Array.isArray(res) ? res : (res.data || []));
    } catch (error) {
      console.error('加载部门数据失败:', error);
    }
  };

  // 加载实验室组数据
  const loadLabGroups = async () => {
    try {
      const res = await api.listLabGroups({ pageSize: 1000 });
      setLabGroups(Array.isArray(res) ? res : (res.data || []));
    } catch (error) {
      console.error('加载实验室组数据失败:', error);
    }
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      if (userSearchTimeout) {
        clearTimeout(userSearchTimeout);
      }
    };
  }, [searchTimeout, userSearchTimeout]);

  // 搜索委托单号 - 本地模糊搜索
  const searchOrders = (query) => {
    // 清除之前的定时器
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (query.length < 2) {
      setOrderSuggestions([]);
      setShowOrderSuggestions(false);
      return;
    }

    // 防抖处理，300ms后执行搜索
    const timeout = setTimeout(() => {
      const filtered = allOrders.filter(order => {
        const orderId = (order.order_id || '').toLowerCase();
        const customerName = (order.customer_name || '').toLowerCase();
        const searchQuery = query.toLowerCase();
        
        return orderId.includes(searchQuery) || customerName.includes(searchQuery);
      }).slice(0, 20); // 限制显示前20个结果

      setOrderSuggestions(filtered);
      setShowOrderSuggestions(true);
    }, 300);

    setSearchTimeout(timeout);
  };

  const autoFillFromOrder = useCallback(async (orderId) => {
    const trimmedOrderId = (orderId || '').trim();
    if (!trimmedOrderId) {
      return;
    }

    try {
      const orderDetail = await api.getOrder(trimmedOrderId);
      if (!orderDetail) return;
      setSelectedOrder(orderDetail);

      // 1) 先根据委托单信息预填业务员工号和折扣
      setIt(prev => {
        const next = { ...prev };
        if (orderDetail.created_by) {
          next.current_assignee = orderDetail.created_by;
        }
        if (orderDetail.discount_rate !== undefined && orderDetail.discount_rate !== null) {
          next.discount_rate = orderDetail.discount_rate;
        } else if (orderDetail.payer_id) {
          const payer = payers.find(p => p.payer_id === orderDetail.payer_id);
          if (payer && payer.discount_rate !== undefined && payer.discount_rate !== null) {
            next.discount_rate = payer.discount_rate;
          }
        }
        return next;
      });

      // 2) 再根据该委托单下的第一条检测项目，预填样品到达方式和样品是否已到
      try {
        const firstItemArrival = await api.getFirstTestItemArrivalByOrder(trimmedOrderId);
        if (firstItemArrival) {
          setIt(prev => ({
            ...prev,
            arrival_mode: firstItemArrival.arrival_mode || prev.arrival_mode || '',
            sample_arrival_status: firstItemArrival.sample_arrival_status || prev.sample_arrival_status || ''
          }));
        }
      } catch (err) {
        console.warn('根据委托单获取检测项目样品到达信息失败，无法预填样品到达信息:', err);
      }
      setShowBusinessStaffSuggestions(false);
    } catch (error) {
      console.warn('自动获取委托单信息失败:', error);
    }
  }, [payers]);

  // 搜索业务员
  const searchBusinessStaff = (query) => {
    if (userSearchTimeout) {
      clearTimeout(userSearchTimeout);
    }

    if (query.length < 1) {
      setBusinessStaffSuggestions([]);
      setShowBusinessStaffSuggestions(false);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const users = await api.getBusinessStaff({ q: query });
        setBusinessStaffSuggestions(users);
        setShowBusinessStaffSuggestions(true);
      } catch (error) {
        console.error('搜索业务员失败:', error);
        setBusinessStaffSuggestions([]);
        setShowBusinessStaffSuggestions(false);
      }
    }, 300);

    setUserSearchTimeout(timeout);
  };

  // 搜索组长
  const searchSupervisors = (query) => {
    if (userSearchTimeout) {
      clearTimeout(userSearchTimeout);
    }

    const departmentIdForQuery = it?.department_id ?? currentUser?.department_id ?? undefined;

    const timeout = setTimeout(async () => {
      try {
        const searchQuery = (query || '').trim();
        const users = await api.getAllSupervisors({ q: searchQuery, department_id: departmentIdForQuery });
        setSupervisorSuggestions(users);
        setShowSupervisorSuggestions(true);
      } catch (error) {
        console.error('搜索组长失败:', error);
        setSupervisorSuggestions([]);
        setShowSupervisorSuggestions(false);
      }
    }, 300);

    setUserSearchTimeout(timeout);
  };

  // 搜索实验员
  const searchEmployees = (query) => {
    if (userSearchTimeout) {
      clearTimeout(userSearchTimeout);
    }

    const departmentIdForQuery = it?.department_id ?? currentUser?.department_id ?? undefined;

    const timeout = setTimeout(async () => {
      try {
        const searchQuery = (query || '').trim();
        const users = await api.getAllEmployees({ q: searchQuery, department_id: departmentIdForQuery });
        setEmployeeSuggestions(users);
        setShowEmployeeSuggestions(true);
      } catch (error) {
        console.error('搜索实验员失败:', error);
        setEmployeeSuggestions([]);
        setShowEmployeeSuggestions(false);
      }
    }, 300);

    setUserSearchTimeout(timeout);
  };

  // 选择业务员
  const selectBusinessStaff = (user) => {
    setIt({...it, current_assignee: user.user_id});
    setShowBusinessStaffSuggestions(false);
  };

  // 根据负责人和组员选择自动更新状态
  const updateStatusBasedOnAssignment = (supervisorId, technicianId) => {
    if (supervisorId && technicianId) {
      // 既有组长又有组员，状态为进行中
      return 'running';
    } else if (supervisorId) {
      // 只有组长，状态为已分配
      return 'assigned';
    } else {
      // 都没有，保持原状态或新建
      return it.status || 'new';
    }
  };

  // 选择组长
  const selectSupervisor = (user) => {
    const newSupervisorId = user.user_id;
    const newStatus = updateStatusBasedOnAssignment(newSupervisorId, it.technician_id);
    setIt(prev => ({
      ...prev, 
      supervisor_id: newSupervisorId,
      status: newStatus
    }));
    // 设置显示文本为工号，如果没有工号则显示姓名
    setSupervisorDisplayText(user.account || user.name || '');
    setShowSupervisorSuggestions(false);
  };

  // 选择实验员
  const selectEmployee = (user) => {
    const newTechnicianId = user.user_id;
    const newStatus = updateStatusBasedOnAssignment(it.supervisor_id, newTechnicianId);
    setIt(prev => ({
      ...prev, 
      technician_id: newTechnicianId,
      status: newStatus
    }));
    setShowEmployeeSuggestions(false);
  };

  useEffect(() => {
    const handleDocumentMouseDown = (event) => {
      if (orderInputWrapperRef.current && !orderInputWrapperRef.current.contains(event.target)) {
        setShowOrderSuggestions(false);
      }
      if (businessInputWrapperRef.current && !businessInputWrapperRef.current.contains(event.target)) {
        setShowBusinessStaffSuggestions(false);
      }
      if (supervisorInputWrapperRef.current && !supervisorInputWrapperRef.current.contains(event.target)) {
        setShowSupervisorSuggestions(false);
      }
      if (employeeInputWrapperRef.current && !employeeInputWrapperRef.current.contains(event.target)) {
        setShowEmployeeSuggestions(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowOrderSuggestions(false);
        setShowBusinessStaffSuggestions(false);
        setShowSupervisorSuggestions(false);
        setShowEmployeeSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 选择委托单号
  const selectOrder = async (order) => {
    setSelectedOrder(order);
    setIt(prev => ({ ...prev, order_id: order.order_id }));
    setShowOrderSuggestions(false);
    await autoFillFromOrder(order.order_id);
  };

  // 选择价格项目
  const selectPriceItem = async (priceItem) => {

    
    setSelectedPrice(priceItem);
    // 仅在价格表单价为数值时预填到检测项目的数值单价字段
    const numericUnitPrice = Number(priceItem.unit_price);
    const prefillOrderUnit = priceItem.unit !== null && priceItem.unit !== undefined ? String(priceItem.unit).trim() : '';
    setIt(prev => {
      const departmentId = priceItem.department_id ?? null;
      const groupId = priceItem.group_id ?? null;
      const newStatus = updateStatusBasedOnAssignment('', prev.technician_id);
      const next = {
        ...prev,
        price_id: priceItem.price_id,
        category_name: priceItem.category_name,
        detail_name: priceItem.detail_name,
        test_code: priceItem.test_code,
        standard_code: priceItem.standard_code || '',
        is_outsourced: priceItem.is_outsourced,
        unit_price: Number.isFinite(numericUnitPrice) ? numericUnitPrice : prev.unit_price,
        unit: prefillOrderUnit,
        department_id: departmentId,
        group_id: groupId,
        supervisor_id: '',
        status: newStatus
      };
      return next;
    });
    
    setShowPriceModal(false);

    if (priceItem.group_id) {
      try {
        const supervisor = await api.getSupervisorByGroup(priceItem.group_id);
        if (supervisor && supervisor.user_id) {
          setIt(prev => {
            const newStatus = updateStatusBasedOnAssignment(supervisor.user_id, prev.technician_id);
            return {
              ...prev,
              supervisor_id: supervisor.user_id,
              status: newStatus,
              group_id: priceItem.group_id
            };
          });
          setShowSupervisorSuggestions(false);
        } else {
          console.log('该小组未找到负责人');
          setIt(prev => {
            const newStatus = updateStatusBasedOnAssignment('', prev.technician_id);
            return {
              ...prev,
              supervisor_id: '',
              status: newStatus
            };
          });
        }
      } catch (error) {
        console.warn('根据group_id获取负责人失败:', error);
        setIt(prev => {
          const newStatus = updateStatusBasedOnAssignment('', prev.technician_id);
          return {
            ...prev,
            supervisor_id: '',
            status: newStatus
          };
        });
      }
    } else {
      setIt(prev => {
        const newStatus = updateStatusBasedOnAssignment('', prev.technician_id);
        return {
          ...prev,
          supervisor_id: '',
          status: newStatus,
          group_id: null
        };
      });
      setShowSupervisorSuggestions(false);
    }
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (isAddonRequest && roleCode === 'sales') {
      return alert('业务员暂无加测申请权限，请联系组长或实验室提交');
    }
    if (!it.order_id) return alert('委托单号必填');
    if (!it.category_name) return alert('大类必填');
    if (!it.detail_name) return alert('细项必填');
    if (!it.unit || String(it.unit).trim() === '') return alert('下单单位必填');
    
    // 验证加测原因：如果是加测项目，必须填写加测原因
    if ((isAddonRequest || isAddOnTestItemFlag(it.is_add_on)) && (!it.addon_reason || it.addon_reason.trim() === '')) {
      return alert('加测原因必填，请选择加测原因');
    }
    
    const payload = { ...it };

    // 管理员新建 或 提交加测申请（非复制预填）：业务报价与折扣率必填
    if (bizPriceDiscountRequired) {
      const pn = payload.price_note;
      if (pn === undefined || pn === null || pn === '') {
        return alert('业务报价必填');
      }
      const priceNum = Number(pn);
      if (Number.isNaN(priceNum) || priceNum < 0) {
        return alert('业务报价须为不小于0的数字');
      }
      const dr = payload.discount_rate;
      if (dr === undefined || dr === null || dr === '') {
        return alert('折扣率必填');
      }
      const discountNum = Number(dr);
      if (Number.isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
        return alert('折扣率须为0～100之间的数字');
      }
    }

    // 验证并规范化样品类型：加测时必须填写
    if (isAddonRequest || isAddOnTestItemFlag(it.is_add_on)) {
      if (!payload.sample_type || String(payload.sample_type).trim() === '') {
        return alert('样品类型必填');
      }

      const st = String(payload.sample_type).trim();
      const isOther = st === '其他' || st === '5';
      if (isOther) {
        const otherText = (payload.sample_type_other || '').trim();
        if (!otherText) {
          return alert('其他样品类型必填，请手动输入');
        }
        // 提交给后端的 sample_type 存真实输入内容
        payload.sample_type = otherText;
      }
    }

    // 兜底：若未显式选择价格项目但有大类/细项，尝试自动匹配并回填 price_id
    if (!payload.price_id && payload.category_name && payload.detail_name) {
      const normalizedCategory = String(payload.category_name).trim().toLowerCase();
      const normalizedDetail = String(payload.detail_name).trim().toLowerCase();
      const normalizedTestCode = payload.test_code ? String(payload.test_code).trim().toLowerCase() : '';
      const normalizedStandardCode = payload.standard_code ? String(payload.standard_code).trim().toLowerCase() : '';

      const candidates = (priceOptions || []).filter(price => {
        const sameCategory = String(price.category_name || '').trim().toLowerCase() === normalizedCategory;
        const sameDetail = String(price.detail_name || '').trim().toLowerCase() === normalizedDetail;
        return sameCategory && sameDetail;
      });

      if (candidates.length === 1) {
        payload.price_id = candidates[0].price_id;
        if ((!payload.unit || String(payload.unit).trim() === '') && candidates[0].unit) {
          payload.unit = String(candidates[0].unit).trim();
        }
      } else if (candidates.length > 1) {
        const precise = candidates.find(price =>
          normalizedTestCode &&
          normalizedStandardCode &&
          String(price.test_code || '').trim().toLowerCase() === normalizedTestCode &&
          String(price.standard_code || '').trim().toLowerCase() === normalizedStandardCode
        );
        if (precise?.price_id) {
          payload.price_id = precise.price_id;
          if ((!payload.unit || String(payload.unit).trim() === '') && precise.unit) {
            payload.unit = String(precise.unit).trim();
          }
        }
      }
    }

    // 权限校验：管理员新增检测、或实验室用户提交加测申请时
    // 若已填写实验员工号但未填写单价，则禁止提交
    const isAdminCreate = isNew && roleCode === 'admin';
    const isLabAddonRequest = isAddonRequest && isNew;
    const hasTechnicianAssigned = payload.technician_id !== undefined
      && payload.technician_id !== null
      && String(payload.technician_id).trim() !== '';
    const hasUnitPrice = payload.unit_price !== undefined
      && payload.unit_price !== null
      && String(payload.unit_price).trim() !== ''
      && !Number.isNaN(Number(payload.unit_price));
    if ((isAdminCreate || isLabAddonRequest) && hasTechnicianAssigned && !hasUnitPrice) {
      return alert('需要先填写单价，才能指派对应的测试人员');
    }
    
    // 验证和转换折扣率
    if (payload.discount_rate !== undefined && payload.discount_rate !== null && payload.discount_rate !== '') {
      const discountRate = Number(payload.discount_rate);
      if (isNaN(discountRate)) {
        return alert('折扣率必须是数字');
      }
      if (discountRate < 0 || discountRate > 100) {
        return alert('折扣率必须在0-100之间');
      }
      payload.discount_rate = discountRate;
    }
    
    if (payload.unit_price !== undefined && payload.unit_price !== null && payload.unit_price !== '') payload.unit_price = Number(payload.unit_price);
    if (payload.final_unit_price !== undefined && payload.final_unit_price !== null && payload.final_unit_price !== '') payload.final_unit_price = Number(payload.final_unit_price);
    if (payload.line_total !== undefined && payload.line_total !== null && payload.line_total !== '') payload.line_total = Number(payload.line_total);
    if (payload.machine_hours !== undefined && payload.machine_hours !== null && payload.machine_hours !== '') payload.machine_hours = Number(payload.machine_hours);
    if (payload.work_hours !== undefined && payload.work_hours !== null && payload.work_hours !== '') payload.work_hours = Number(payload.work_hours);
    if (payload.quantity !== undefined && payload.quantity !== null && payload.quantity !== '') payload.quantity = Number(payload.quantity);
    if (payload.price_id !== undefined && payload.price_id !== null && payload.price_id !== '') payload.price_id = Number(payload.price_id);
    // 确保 is_add_on 为 0/1/2，is_outsourced 为 0/1
    if (payload.is_add_on !== undefined && payload.is_add_on !== null) {
      const n = Number(payload.is_add_on);
      payload.is_add_on = n === 2 ? 2 : (n === 1 ? 1 : 0);
    }
    if (payload.is_outsourced !== undefined && payload.is_outsourced !== null) {
      payload.is_outsourced = Number(payload.is_outsourced) === 1 ? 1 : 0;
    }
    
    // 如果是加测申请模式，提交到加测申请API
    if (isAddonRequest && isNew) {
      try {
        const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
        if (!user || !user.token) {
          alert('用户未登录');
          return;
        }

        const response = await fetch('/api/addon-requests', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            order_id: payload.order_id,
            test_item_data: payload,
            note: payload.note || ''
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '提交加测申请失败');
        }

        const result = await response.json();
        alert('加测申请已提交，等待管理员审核');
        navigate('/commission-form');
      } catch (error) {
        alert('提交加测申请失败：' + error.message);
      }
      return;
    }
    
    if (isNew) await api.createTestItem(payload);
    else await api.updateTestItem(id, payload);
    navigate('/commission-form');
  }

  // 删除检测项目
  const handleDelete = async () => {
    if (!window.confirm('确定要删除这个检测项目吗？删除后将无法恢复，包括所有相关的分配、委外、样品等信息。')) {
      return;
    }
    
    try {
      await api.deleteTestItem(id);
      alert('检测项目删除成功');
      navigate('/commission-form');
    } catch (error) {
      alert('删除失败：' + error.message);
    }
  };

  return (
    <div style={{maxWidth: 1000}}>
      <h2>{isAddonRequest && isNew ? '加测申请' : (isNew ? '新增检测项目' : (isView ? `查看检测项目 #${id}` : `编辑检测项目 #${id}`))}</h2>
      <form onSubmit={onSubmit}>
        <div className="grid-3">
          <div>
            <label>委托单号 *</label>
            <div style={{position: 'relative'}} ref={orderInputWrapperRef}>
              <input 
                className="input" 
                value={it.order_id || ''} 
                onChange={e => {
                  const value = e.target.value;
                  setSelectedOrder(null);
                  setIt(prev => ({ ...prev, order_id: value }));
                  searchOrders(value);
                }}
                onBlur={() => {
                  const trimmedOrderId = (it.order_id || '').trim();
                  if (trimmedOrderId && (!selectedOrder || selectedOrder.order_id !== trimmedOrderId)) {
                    autoFillFromOrder(trimmedOrderId);
                  }
                }}
                placeholder="输入委托单号，如 JC09"
                disabled={isView}
              />
              {showOrderSuggestions && orderSuggestions && orderSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid #ddd',
                  borderTop: 'none',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 1000
                }}>
                  {orderSuggestions.map(order => (
                    <div 
                      key={order.order_id}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #eee'
                      }}
                      onMouseDown={() => selectOrder(order)}
                      onMouseEnter={e => e.target.style.background = '#f5f5f5'}
                      onMouseLeave={e => e.target.style.background = 'white'}
                    >
                      <div style={{fontWeight: 'bold'}}>{order.order_id}</div>
                      <div style={{fontSize: '12px', color: '#666'}}>{order.customer_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <div>
            <label>选择项目</label>
            <button 
              type="button" 
              className="btn" 
              onClick={async () => {
                setShowPriceModal(true);
                // 确保在打开模态框时加载价格数据
                try {
                  const res = await api.listPrice({ pageSize: 1000 });
                  setPriceOptions(res.data || []);
                } catch (e) {
                  console.error('加载价格数据失败:', e);
                  setPriceOptions([]);
                }
              }}
              style={{width: '100%'}}
              disabled={isView}
            >
              选择价格项目
            </button>
          </div>
          
          <Field label="大类 *" value={it.category_name} onChange={v=>setIt({...it, category_name:v})} disabled={isView} />
          <Field label="细项 *" value={it.detail_name} onChange={v=>setIt({...it, detail_name:v})} disabled={isView} />
          <Field label="样品名称" value={it.sample_name} onChange={v=>setIt({...it, sample_name:v})} disabled={isView} />
          <Field label="材质" value={it.material} onChange={v=>setIt({...it, material:v})} disabled={isView} />
          <div>
            <label>
              样品类型{(isAddonRequest || isAddOnTestItemFlag(it.is_add_on)) ? ' *' : ''}
            </label>
            {(() => {
              const ui = getSampleTypeUiModel(it.sample_type);
              if (ui.mode === 'otherInput') {
                return (
                  <input
                    className="input"
                    value={it.sample_type_other || ui.otherInputValue || ''}
                    onChange={e => setIt({ ...it, sample_type: e.target.value, sample_type_other: e.target.value })}
                    disabled={isView}
                    placeholder="请输入其他样品类型"
                  />
                );
              }

              return (
                <select
                  className="input"
                  value={ui.selectValue || ''}
                  onChange={e => {
                    const v = e.target.value;
                    setIt(prev => ({
                      ...prev,
                      sample_type: v,
                      sample_type_other: v === '其他' ? '' : '',
                    }));
                  }}
                  disabled={isView}
                >
                  <option value="">请选择样品类型</option>
                  {Object.entries(typeMappings.sampleType).map(([name, value]) => (
                    <option key={value} value={name}>{name}</option>
                  ))}
                </select>
              );
            })()}
          </div>
          <Field label="原始编号" value={it.original_no} onChange={v=>setIt({...it, original_no:v})} disabled={isView} />
          <Field label="代码" value={it.test_code} onChange={v=>setIt({...it, test_code:v})} disabled={isView} />
          <Field label="检测标准" value={it.standard_code} onChange={v=>setIt({...it, standard_code:v})} disabled={isView} />
          <div>
            <label>执行部门</label>
            <input 
              className="input" 
              value={departments.find(d => d.department_id === it.department_id)?.department_name || ''} 
              disabled 
              style={{background: '#f5f5f5'}}
            />
          </div>
          <div>
            <label>执行小组</label>
            <input 
              className="input" 
              value={labGroups.find(g => g.group_id === it.group_id)?.group_name || ''} 
              disabled 
              style={{background: '#f5f5f5'}}
            />
          </div>
          <Field label="数量" value={it.quantity} onChange={v=>setIt({...it, quantity:v})} disabled={isView} />
          <div>
            <label>下单单位 *</label>
            <select
              className="input"
              value={it.unit || ''}
              onChange={e => setIt({ ...it, unit: e.target.value })}
              disabled={isView}
            >
              <option value="">请选择下单单位</option>
              {ORDER_UNIT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <Field label="单价" value={it.unit_price} onChange={v=>setIt({...it, unit_price:v})} disabled={isView} />
          <div>
            <label>业务报价{bizPriceDiscountRequired ? ' *' : ''}</label>
            <input 
              type="number"
              className="input" 
              value={it.price_note !== null && it.price_note !== undefined ? it.price_note : ''} 
              onChange={e => {
                const val = e.target.value;
                setIt({...it, price_note: val === '' ? null : Number(val)});
              }} 
              disabled={isView || isFromCopyAddonRequest}
              placeholder="输入业务报价"
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label>折扣率% (0～100){bizPriceDiscountRequired ? ' *' : ''}</label>
            <input 
              className="input" 
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={(() => {
                const rate = it.discount_rate;
                if (rate === undefined || rate === null || rate === '') return '';
                // 数据库存储的是十位数（如90表示90%），直接显示即可
                return Number(rate);
              })()} 
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') {
                  setIt({...it, discount_rate: ''});
                } else {
                  const numVal = Number(val);
                  if (!isNaN(numVal) && numVal >= 0 && numVal <= 100) {
                    setIt({...it, discount_rate: numVal});
                  }
                }
              }}
              disabled={isView}
              placeholder="输入0-100的折扣率"
            />
          </div>
          <div>
            <label>是否加测</label>
            <input 
              className="input" 
              value={formatIsAddOnDisplay(it.is_add_on)} 
              disabled 
              style={{background: '#f5f5f5'}} 
            />
            <input type="hidden" name="is_add_on" value={it.is_add_on !== undefined && it.is_add_on !== null ? it.is_add_on : 1} />
          </div>
          {(isAddonRequest || isAddOnTestItemFlag(it.is_add_on)) && (
            <div>
              <label>是否加急</label>
              <select
                className="input"
                value={it.service_urgency || 'normal'}
                onChange={e => setIt({ ...it, service_urgency: e.target.value })}
                disabled={isView}
              >
                <option value="normal">正常</option>
                <option value="urgent_1_5x">1.5倍加急</option>
                <option value="urgent_2x">2倍加急</option>
              </select>
            </div>
          )}
          {(isAddonRequest || isAddOnTestItemFlag(it.is_add_on)) && (
            <div>
              <label>加测原因</label>
              <select 
                className="input" 
                value={it.addon_reason || ''} 
                onChange={e => setIt({...it, addon_reason: e.target.value})} 
                disabled={isView}
              >
                <option value="">请选择加测原因</option>
                <option value="增加样品">增加样品</option>
                <option value="增加测试人员">增加测试人员</option>
                <option value="样品评估不足">样品评估不足</option>
                <option value="增加测试时段">增加测试时段</option>
                <option value="更换设备">更换设备</option>
                <option value="客户原因">客户原因</option>
              </select>
            </div>
          )}
          {(isAddonRequest || isAddOnTestItemFlag(it.is_add_on)) && (
            <div>
              <label>加测对象</label>
              <select 
                className="input" 
                value={it.addon_target || ''} 
                onChange={e => setIt({...it, addon_target: e.target.value})} 
                disabled={isView}
              >
                <option value="">请选择加测对象</option>
                <option value="sales">业务员</option>
                <option value="employee">实验员</option>
              </select>
            </div>
          )}
          <div>
            <label>是否委外</label>
            <select className="input" value={it.is_outsourced ?? 0} onChange={e=>{
              const isOutsourced = Number(e.target.value);
              setIt({...it, is_outsourced: isOutsourced, test_code: isOutsourced ? 'OS001' : it.test_code});
            }} disabled={isView}>
              <option value={0}>否</option>
              <option value={1}>是</option>
            </select>
          </div>
          {it.is_outsourced === 1 && (
            <div>
              <label>委外检测项目 *</label>
              <input 
                className="input" 
                value={it.detail_name || ''} 
                onChange={e => setIt({...it, detail_name: e.target.value})} 
                placeholder="请输入委外检测项目名称"
                disabled={isView}
              />
            </div>
          )}
          <div>
            <label>状态</label>
            <select className="input" value={it.status || 'new'} onChange={e=>setIt({...it, status:e.target.value})} disabled={isView}>
              <option value="new">新建</option>
              <option value="assigned">已分配</option>
              <option value="running">进行中</option>
              <option value="waiting_review">待审核</option>
              <option value="report_uploaded">待传数据</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <div>
            <label>业务员工号</label>
          <div style={{position: 'relative'}} ref={businessInputWrapperRef}>
              <input 
                className="input" 
                value={it.current_assignee || ''} 
                onChange={e => {
                  const value = e.target.value;
                  setIt({...it, current_assignee: value});
                  searchBusinessStaff(value);
                }}
                placeholder="输入业务员姓名或工号"
                disabled={isView}
              />
              {showBusinessStaffSuggestions && businessStaffSuggestions && businessStaffSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid #ddd',
                  borderTop: 'none',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 1000
                }}>
                  {businessStaffSuggestions.map(user => (
                    <div 
                      key={user.user_id}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #eee'
                      }}
                      onMouseDown={() => selectBusinessStaff(user)}
                      onMouseEnter={e => e.target.style.background = '#f5f5f5'}
                      onMouseLeave={e => e.target.style.background = 'white'}
                    >
                      <div style={{fontWeight: 'bold'}}>{user.name}</div>
                      <div style={{fontSize: '12px', color: '#666'}}>{user.account}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label>负责人工号</label>
          <div style={{position: 'relative'}} ref={supervisorInputWrapperRef}>
              <input 
                className="input" 
                value={supervisorDisplayText} 
                onChange={e => {
                  const value = e.target.value;
                  setSupervisorDisplayText(value);
                  // 如果输入框被清空，也清空 supervisor_id
                  if (!value) {
                    const newStatus = updateStatusBasedOnAssignment('', it.technician_id);
                    setIt(prev => ({
                      ...prev, 
                      supervisor_id: '',
                      status: newStatus
                    }));
                  }
                  searchSupervisors(value);
                }}
                onFocus={() => searchSupervisors(supervisorDisplayText || '')}
                placeholder="输入组长姓名或工号"
                disabled={isView}
              />
              {showSupervisorSuggestions && supervisorSuggestions && supervisorSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid #ddd',
                  borderTop: 'none',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 1000
                }}>
                  {supervisorSuggestions.map(user => (
                    <div 
                      key={user.user_id}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #eee'
                      }}
                      onMouseDown={() => selectSupervisor(user)}
                      onMouseEnter={e => e.target.style.background = '#f5f5f5'}
                      onMouseLeave={e => e.target.style.background = 'white'}
                    >
                      <div style={{fontWeight: 'bold'}}>{user.name}</div>
                      <div style={{fontSize: '12px', color: '#666'}}>{user.account}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label>实验员工号</label>
          <div style={{position: 'relative'}} ref={employeeInputWrapperRef}>
              <input 
                className="input" 
                value={it.technician_id || ''} 
                onChange={e => {
                  const value = e.target.value;
                  const newStatus = updateStatusBasedOnAssignment(it.supervisor_id, value);
                  setIt(prev => ({
                    ...prev, 
                    technician_id: value,
                    status: newStatus
                  }));
                  searchEmployees(value);
                }}
                onFocus={() => searchEmployees('')}
                placeholder="输入实验员姓名或工号"
                disabled={isView}
              />
              {showEmployeeSuggestions && employeeSuggestions && employeeSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid #ddd',
                  borderTop: 'none',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 1000
                }}>
                  {employeeSuggestions.map(user => (
                    <div 
                      key={user.user_id}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #eee'
                      }}
                      onMouseDown={() => selectEmployee(user)}
                      onMouseEnter={e => e.target.style.background = '#f5f5f5'}
                      onMouseLeave={e => e.target.style.background = 'white'}
                    >
                      <div style={{fontWeight: 'bold'}}>{user.name}</div>
                      <div style={{fontSize: '12px', color: '#666'}}>{user.account}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <label>样品到达方式</label>
            <select className="input" value={it.arrival_mode || ''} onChange={e=>setIt({...it, arrival_mode:e.target.value})} disabled={isView}>
              <option value="">请选择</option>
              <option value="on_site">现场</option>
              <option value="delivery">寄样</option>
            </select>
          </div>
          <div>
            <label>样品是否已到</label>
            <select className="input" value={it.sample_arrival_status || ''} onChange={e=>setIt({...it, sample_arrival_status:e.target.value})} disabled={isView}>
              <option value="">请选择</option>
              <option value="arrived">已到</option>
              <option value="not_arrived">未到</option>
            </select>
          </div>
        </div>
        {/* <div>
          <label>样品预处理</label>
          <textarea className="input" rows="2" value={it.sample_preparation||''} onChange={e=>setIt({...it, sample_preparation:e.target.value})} disabled={isView}></textarea>
        </div> */}
        <div>
          <label>备注</label>
          <textarea className="input" rows="2" value={it.note||''} onChange={e=>setIt({...it, note:e.target.value})} disabled={isView}></textarea>
        </div>
        <div style={{display:'flex', gap:8}}>
          {!isView && <button className="btn" type="submit">{isAddonRequest && isNew ? '提交申请' : '保存'}</button>}
          {!isNew && !isView && (
            <button 
              className="btn" 
              type="button" 
              onClick={handleDelete}
              style={{backgroundColor: '#dc3545', color: 'white'}}
            >
              删除
            </button>
          )}
          <button className="btn" type="button" onClick={()=>navigate('/commission-form')}>{isView ? '返回' : '取消'}</button>
        </div>
      </form>

      {/* 价格表选择模态框 */}
      {showPriceModal && (
        <div className="price-modal-overlay" onClick={() => setShowPriceModal(false)}>
          <div className="price-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="price-modal-header">
              <h3>选择价格项目</h3>
              <button 
                className="price-modal-close" 
                onClick={() => setShowPriceModal(false)}
                title="关闭"
              >
                ×
              </button>
            </div>
            
            <div className="price-modal-body">
              <div className="price-search-container">
                <input 
                  className="price-search-input" 
                  placeholder="搜索价格项目..."
                  onChange={e => {
                    const query = e.target.value;
                    if (query.length >= 2) {
                      api.listPrice({ q: query, pageSize: 100 })
                        .then(res => setPriceOptions(res.data || []))
                        .catch(e => {
                          console.error('搜索价格项目失败:', e);
                          setPriceOptions([]);
                        });
                    } else {
                      api.listPrice({ pageSize: 1000 })
                        .then(res => setPriceOptions(res.data || []))
                        .catch(e => {
                          console.error('加载价格项目失败:', e);
                          setPriceOptions([]);
                        });
                    }
                  }}
                />
              </div>
              
              <div className="price-table-container">
                {priceOptions.length > 0 ? (
                  <table className="price-table">
                    <thead>
                      <tr>
                        <th>选择</th>
                        <th>大类</th>
                        <th>细项</th>
                        <th>代码</th>
                        <th>检测标准</th>
                        <th>单价</th>
                        <th>委外</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceOptions.map(price => (
                        <tr key={price.price_id}>
                          <td>
                            <button 
                              type="button" 
                              className="price-select-btn" 
                              onClick={() => selectPriceItem(price)}
                            >
                              选择
                            </button>
                          </td>
                          <td>{price.category_name}</td>
                          <td>{price.detail_name}</td>
                          <td>{price.test_code}</td>
                          <td>{price.standard_code || '-'}</td>
                          <td>{price.unit_price}</td>
                          <td>
                            <span className={`price-outsource-badge ${price.is_outsourced ? 'outsourced' : 'internal'}`}>
                              {price.is_outsourced ? '是' : '否'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                    暂无价格数据，请检查权限或联系管理员
                  </div>
                )}
              </div>
            </div>
            
            <div className="price-modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowPriceModal(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
