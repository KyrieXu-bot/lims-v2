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

export default function TestItemEdit() {
  const { id } = useParams();
  const location = useLocation();
  const isNew = id === 'new';
  const isView = new URLSearchParams(location.search).get('view') === '1';
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
    category_name: '',
    detail_name: '',
    sample_name: '',
    material: '',
    sample_type: '',
    original_no: '',
    test_code: '',
    standard_code: '',
    department_id: '',
    group_id: '',
    unit_price: '',
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
    price_note: ''
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

  // 样品类型映射
  const typeMappings = { 
    sampleType: { '板材': 1, '棒材': 2, '粉末': 3, '液体': 4, '其他': 5 } 
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
      }).catch(e=>alert(e.message));
    } else {
      // 检查是否有复制数据
      const copyParam = new URLSearchParams(location.search).get('copy');
      if (copyParam) {
        try {
          const copyData = new URLSearchParams(decodeURIComponent(copyParam));
          const copyObj = {};
          for (const [key, value] of copyData.entries()) {
            // 处理数字类型字段
            if (['quantity', 'unit_price', 'discount_rate', 'final_unit_price', 'line_total', 
                 'machine_hours', 'work_hours', 'is_add_on', 'is_outsourced', 'department_id', 
                 'group_id', 'supervisor_id', 'technician_id', 'equipment_id', 'actual_sample_quantity'].includes(key)) {
              if (value === '' || value === null || value === undefined) {
                copyObj[key] = '';
              } else {
                const numValue = key.includes('is_') ? parseInt(value, 10) : parseFloat(value);
                // 确保解析后的值不是NaN
                copyObj[key] = isNaN(numValue) ? '' : numValue;
              }
            } else {
              copyObj[key] = value;
            }
          }
          setIt(prev => ({ ...prev, ...copyObj }));
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
    if (!it.order_id) return alert('委托单号必填');
    if (!it.category_name) return alert('大类必填');
    if (!it.detail_name) return alert('细项必填');
    
    const payload = { ...it };
    
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
    // 确保 is_add_on 和 is_outsourced 是数字类型（0 或 1）
    if (payload.is_add_on !== undefined && payload.is_add_on !== null) {
      payload.is_add_on = Number(payload.is_add_on) === 1 ? 1 : 0;
    }
    if (payload.is_outsourced !== undefined && payload.is_outsourced !== null) {
      payload.is_outsourced = Number(payload.is_outsourced) === 1 ? 1 : 0;
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
      <h2>{isNew ? '新增检测项目' : (isView ? `查看检测项目 #${id}` : `编辑检测项目 #${id}`)}</h2>
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
            <label>样品类型</label>
            <select 
              className="input" 
              value={it.sample_type || ''} 
              onChange={e=>setIt({...it, sample_type: e.target.value})} 
              disabled={isView}
            >
              <option value="">请选择样品类型</option>
              {Object.entries(typeMappings.sampleType).map(([name, value]) => (
                <option key={value} value={name}>{name}</option>
              ))}
            </select>
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
          <Field label="单价" value={it.unit_price} onChange={v=>setIt({...it, unit_price:v})} disabled={isView} />
          <div>
            <label>业务报价</label>
            <input 
              type="number"
              className="input" 
              value={it.price_note !== null && it.price_note !== undefined ? it.price_note : ''} 
              onChange={e => {
                const val = e.target.value;
                setIt({...it, price_note: val === '' ? null : Number(val)});
              }} 
              disabled={isView}
              placeholder="输入业务报价"
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label>折扣率% (0-100)</label>
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
          <Field label="折后单价" value={it.final_unit_price} onChange={v=>setIt({...it, final_unit_price:v})} disabled={isView} />
          <Field label="行小计" value={it.line_total} onChange={v=>setIt({...it, line_total:v})} disabled={isView} />
          <Field label="机时" value={it.machine_hours} onChange={v=>setIt({...it, machine_hours:v})} disabled={isView} />
          <Field label="工时" value={it.work_hours} onChange={v=>setIt({...it, work_hours:v})} disabled={isView} />
          <div>
            <label>是否加测</label>
            <input 
              className="input" 
              value={it.is_add_on === 1 || it.is_add_on === '1' ? '是' : '否'} 
              disabled 
              style={{background: '#f5f5f5'}} 
            />
            <input type="hidden" name="is_add_on" value={it.is_add_on !== undefined && it.is_add_on !== null ? it.is_add_on : 1} />
          </div>
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
          <Field label="顺序号" value={it.seq_no} onChange={v=>setIt({...it, seq_no:v})} />
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
                value={it.supervisor_id || ''} 
                onChange={e => {
                  const value = e.target.value;
                  const newStatus = updateStatusBasedOnAssignment(value, it.technician_id);
                  setIt(prev => ({
                    ...prev, 
                    supervisor_id: value,
                    status: newStatus
                  }));
                  searchSupervisors(value);
                }}
                onFocus={() => searchSupervisors('')}
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
          {!isView && <button className="btn" type="submit">保存</button>}
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
