import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import './AddonRequestModal.css';

const Field = ({label, value, onChange, type='text', disabled=false}) => {
  return (
    <div>
      <label>{label}</label>
      <input className="input" value={value||''} type={type} onChange={e=>onChange(e.target.value)} disabled={disabled} />
    </div>
  );
};

const AddonRequestModal = ({ requestId, onClose, onApprove }) => {
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testItemData, setTestItemData] = useState({});
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [labGroups, setLabGroups] = useState([]);
  const [priceOptions, setPriceOptions] = useState([]);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [businessStaffSuggestions, setBusinessStaffSuggestions] = useState([]);
  const [showBusinessStaffSuggestions, setShowBusinessStaffSuggestions] = useState(false);
  const [supervisorSuggestions, setSupervisorSuggestions] = useState([]);
  const [showSupervisorSuggestions, setShowSupervisorSuggestions] = useState(false);
  const [supervisorDisplayText, setSupervisorDisplayText] = useState('');
  const [businessStaffDisplayText, setBusinessStaffDisplayText] = useState('');
  const [employeeDisplayText, setEmployeeDisplayText] = useState('');
  const [employeeSuggestions, setEmployeeSuggestions] = useState([]);
  const [showEmployeeSuggestions, setShowEmployeeSuggestions] = useState(false);
  const businessInputWrapperRef = useRef(null);
  const supervisorInputWrapperRef = useRef(null);
  const employeeInputWrapperRef = useRef(null);

  const typeMappings = { 
    sampleType: { '板材': 1, '棒材': 2, '粉末': 3, '液体': 4, '其他': 5 } 
  };

  useEffect(() => {
    // 获取当前用户信息
    const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
    setCurrentUser(user);
    
    loadRequest();
    loadDepartments();
    loadLabGroups();
  }, [requestId]);

  useEffect(() => {
    const handleDocumentMouseDown = (event) => {
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
    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
    };
  }, []);

  const loadRequest = async () => {
    try {
      setLoading(true);
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        alert('用户未登录');
        onClose();
        return;
      }

      const response = await fetch(`/api/addon-requests/${requestId}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (!response.ok) {
        throw new Error('加载申请失败');
      }

      const data = await response.json();
      setRequest(data);
      const itemData = data.test_item_data || {};
      setTestItemData(itemData);
      
      // 设置负责人显示文本
      if (itemData.supervisor_id) {
        try {
          const supervisors = await api.getAllSupervisors({ q: itemData.supervisor_id });
          const supervisor = supervisors.find(s => s.user_id === itemData.supervisor_id);
          if (supervisor) {
            const name = supervisor.name || '';
            const account = supervisor.account || supervisor.user_id || '';
            setSupervisorDisplayText(account ? `${name}(${account})` : name || supervisor.user_id);
          } else {
            setSupervisorDisplayText(itemData.supervisor_id);
          }
        } catch (e) {
          setSupervisorDisplayText(itemData.supervisor_id);
        }
      }
      
      // 设置业务员显示文本
      if (itemData.current_assignee) {
        try {
          const businessStaff = await api.getBusinessStaff({ q: itemData.current_assignee });
          const user = businessStaff.find(u => u.user_id === itemData.current_assignee);
          if (user) {
            const name = user.name || '';
            const account = user.account || user.user_id || '';
            setBusinessStaffDisplayText(account ? `${name}(${account})` : name || user.user_id);
          } else {
            setBusinessStaffDisplayText(itemData.current_assignee);
          }
        } catch (e) {
          setBusinessStaffDisplayText(itemData.current_assignee);
        }
      }
      
      // 设置实验员显示文本
      if (itemData.technician_id) {
        try {
          const employees = await api.getAllEmployees({ q: itemData.technician_id });
          const employee = employees.find(e => e.user_id === itemData.technician_id);
          if (employee) {
            const name = employee.name || '';
            const account = employee.account || employee.user_id || '';
            setEmployeeDisplayText(account ? `${name}(${account})` : name || employee.user_id);
          } else {
            setEmployeeDisplayText(itemData.technician_id);
          }
        } catch (e) {
          setEmployeeDisplayText(itemData.technician_id);
        }
      }
    } catch (error) {
      console.error('加载申请失败:', error);
      alert('加载申请失败：' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const res = await api.listDepartments({ pageSize: 1000 });
      setDepartments(Array.isArray(res) ? res : (res.data || []));
    } catch (error) {
      console.error('加载部门失败:', error);
      setDepartments([]);
    }
  };

  const loadLabGroups = async () => {
    try {
      const res = await api.listLabGroups({ pageSize: 1000 });
      setLabGroups(Array.isArray(res) ? res : (res.data || []));
    } catch (error) {
      console.error('加载实验小组失败:', error);
      setLabGroups([]);
    }
  };

  const searchBusinessStaff = async (query) => {
    try {
      const users = await api.getAllBusinessStaff({ q: query });
      setBusinessStaffSuggestions(users);
      setShowBusinessStaffSuggestions(true);
    } catch (error) {
      console.error('搜索业务员失败:', error);
    }
  };

  const searchSupervisors = async (query) => {
    try {
      const users = await api.getAllSupervisors({ q: query });
      setSupervisorSuggestions(users);
      setShowSupervisorSuggestions(true);
    } catch (error) {
      console.error('搜索负责人失败:', error);
    }
  };

  const searchEmployees = async (query) => {
    try {
      const users = await api.getAllEmployees({ q: query });
      setEmployeeSuggestions(users);
      setShowEmployeeSuggestions(true);
    } catch (error) {
      console.error('搜索实验员失败:', error);
    }
  };

  const selectBusinessStaff = (user) => {
    setTestItemData(prev => ({...prev, current_assignee: user.user_id}));
    const name = user.name || '';
    const account = user.account || user.user_id || '';
    setBusinessStaffDisplayText(account ? `${name}(${account})` : name || user.user_id);
    setShowBusinessStaffSuggestions(false);
  };

  const selectSupervisor = (user) => {
    setTestItemData(prev => ({
      ...prev,
      supervisor_id: user.user_id
    }));
    const name = user.name || '';
    const account = user.account || user.user_id || '';
    setSupervisorDisplayText(account ? `${name}(${account})` : name || user.user_id);
    setShowSupervisorSuggestions(false);
  };

  const selectEmployee = (user) => {
    setTestItemData(prev => ({
      ...prev,
      technician_id: user.user_id
    }));
    const name = user.name || '';
    const account = user.account || user.user_id || '';
    setEmployeeDisplayText(account ? `${name}(${account})` : name || user.user_id);
    setShowEmployeeSuggestions(false);
  };

  const selectPriceItem = (priceItem) => {
    const numericUnitPrice = Number(priceItem.unit_price);
    setTestItemData(prev => ({
      ...prev,
      price_id: priceItem.price_id,
      category_name: priceItem.category_name,
      detail_name: priceItem.detail_name,
      test_code: priceItem.test_code,
      standard_code: priceItem.standard_code || '',
      is_outsourced: priceItem.is_outsourced,
      unit_price: Number.isFinite(numericUnitPrice) ? numericUnitPrice : prev.unit_price,
      department_id: priceItem.department_id,
      group_id: priceItem.group_id
    }));
    setShowPriceModal(false);
  };

  const handleApprove = async () => {
    if (!window.confirm('确定要同意此加测申请并创建检测项目吗？')) {
      return;
    }

    // 验证加测原因：如果是加测项目，必须填写加测原因
    if ((testItemData.is_add_on === 1 || testItemData.is_add_on === '1') && (!testItemData.addon_reason || testItemData.addon_reason.trim() === '')) {
      alert('加测原因必填，请选择加测原因');
      return;
    }

    try {
      setSaving(true);
      const user = JSON.parse(localStorage.getItem('lims_user') || 'null');
      if (!user || !user.token) {
        alert('用户未登录');
        return;
      }

      const response = await fetch(`/api/addon-requests/${requestId}/approve`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          test_item_data: testItemData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '同意申请失败');
      }

      const result = await response.json();
      alert('加测申请已通过，检测项目已创建');
      onApprove && onApprove(result);
      onClose();
    } catch (error) {
      console.error('同意申请失败:', error);
      alert('同意申请失败：' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setTestItemData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 判断是否应该禁用表单字段：申请已通过或用户不是管理员
  const isFormDisabled = request?.status === 'approved' || currentUser?.role !== 'admin';

  if (loading) {
    return (
      <div className="addon-request-modal-overlay" onClick={onClose}>
        <div className="addon-request-modal" onClick={(e) => e.stopPropagation()}>
          <div className="addon-request-modal-header">
            <h2>加测申请详情</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="addon-request-modal-body">
            <div style={{ textAlign: 'center', padding: '40px' }}>加载中...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!request) {
    return null;
  }

  return (
    <div className="addon-request-modal-overlay" onClick={onClose}>
      <div className="addon-request-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="addon-request-modal-header">
          <h2>加测申请详情</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="addon-request-modal-body">
          <div className="request-info">
            <div className="info-row">
              <span className="info-label">申请人：</span>
              <span className="info-value">{request.applicant_name || request.applicant_id}</span>
            </div>
            <div className="info-row">
              <span className="info-label">委托单号：</span>
              <span className="info-value">{request.order_id_display || request.order_id || '未知'}</span>
            </div>
            {request.commissioner_name && (
              <div className="info-row">
                <span className="info-label">委托方名称：</span>
                <span className="info-value">{request.commissioner_name}</span>
              </div>
            )}
            {request.commissioner_contact_name && (
              <div className="info-row">
                <span className="info-label">联系人：</span>
                <span className="info-value">{request.commissioner_contact_name}</span>
              </div>
            )}
            <div className="info-row">
              <span className="info-label">申请时间：</span>
              <span className="info-value">{new Date(request.created_at).toLocaleString('zh-CN')}</span>
            </div>
            {request.note && (
              <div className="info-row">
                <span className="info-label">申请备注：</span>
                <span className="info-value">{request.note}</span>
              </div>
            )}
          </div>

          <div className="test-item-form">
            <h3>检测项目信息{request.status === 'approved' ? '（已通过）' : '（可修改）'}</h3>
            <div className="grid-3">
              <div>
                <label>委托单号 *</label>
                <input 
                  className="input" 
                  value={testItemData.order_id || ''} 
                  onChange={e => updateField('order_id', e.target.value)}
                  placeholder="输入委托单号"
                  disabled={isFormDisabled}
                />
              </div>
              
              <div>
                <label>选择项目</label>
                <button 
                  type="button" 
                  className="btn" 
                  onClick={async () => {
                    setShowPriceModal(true);
                    try {
                      const res = await api.listPrice({ pageSize: 1000 });
                      setPriceOptions(res.data || []);
                    } catch (e) {
                      console.error('加载价格数据失败:', e);
                      setPriceOptions([]);
                    }
                  }}
                  style={{width: '100%'}}
                  disabled={isFormDisabled}
                >
                  选择价格项目
                </button>
              </div>
              
              <Field label="大类 *" value={testItemData.category_name} onChange={v=>updateField('category_name', v)} disabled={isFormDisabled} />
              <Field label="细项 *" value={testItemData.detail_name} onChange={v=>updateField('detail_name', v)} disabled={isFormDisabled} />
              <Field label="样品名称" value={testItemData.sample_name} onChange={v=>updateField('sample_name', v)} disabled={isFormDisabled} />
              <Field label="材质" value={testItemData.material} onChange={v=>updateField('material', v)} disabled={isFormDisabled} />
              <div>
                <label>样品类型</label>
                <select 
                  className="input" 
                  value={testItemData.sample_type || ''} 
                  onChange={e=>updateField('sample_type', e.target.value)}
                  disabled={isFormDisabled}
                >
                  <option value="">请选择样品类型</option>
                  {Object.entries(typeMappings.sampleType).map(([name, value]) => (
                    <option key={value} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <Field label="原始编号" value={testItemData.original_no} onChange={v=>updateField('original_no', v)} disabled={isFormDisabled} />
              <Field label="代码" value={testItemData.test_code} onChange={v=>updateField('test_code', v)} disabled={isFormDisabled} />
              <Field label="检测标准" value={testItemData.standard_code} onChange={v=>updateField('standard_code', v)} disabled={isFormDisabled} />
              <div>
                <label>执行部门</label>
                <input 
                  className="input" 
                  value={departments.find(d => d.department_id === testItemData.department_id)?.department_name || ''} 
                  disabled 
                  style={{background: '#f5f5f5'}}
                />
              </div>
              <div>
                <label>执行小组</label>
                <input 
                  className="input" 
                  value={labGroups.find(g => g.group_id === testItemData.group_id)?.group_name || ''} 
                  disabled 
                  style={{background: '#f5f5f5'}}
                />
              </div>
              <Field label="数量" value={testItemData.quantity} onChange={v=>updateField('quantity', v)} disabled={isFormDisabled} />
              <Field label="单价" value={testItemData.unit_price} onChange={v=>updateField('unit_price', v)} disabled={isFormDisabled} />
              <div>
                <label>业务报价</label>
                <input 
                  type="number"
                  className="input" 
                  value={testItemData.price_note !== null && testItemData.price_note !== undefined ? testItemData.price_note : ''} 
                  onChange={e => {
                    const val = e.target.value;
                    updateField('price_note', val === '' ? null : Number(val));
                  }} 
                  placeholder="输入业务报价"
                  min="0"
                  step="0.01"
                  disabled={isFormDisabled}
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
                    const rate = testItemData.discount_rate;
                    if (rate === undefined || rate === null || rate === '') return '';
                    return Number(rate);
                  })()} 
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      updateField('discount_rate', '');
                    } else {
                      const numVal = Number(val);
                      if (!isNaN(numVal) && numVal >= 0 && numVal <= 100) {
                        updateField('discount_rate', numVal);
                      }
                    }
                  }}
                  placeholder="输入0-100的折扣率"
                  disabled={isFormDisabled}
                />
              </div>
              <div>
                <label>是否加测</label>
                <input 
                  className="input" 
                  value={testItemData.is_add_on === 1 || testItemData.is_add_on === '1' ? '是' : '否'} 
                  disabled 
                  style={{background: '#f5f5f5'}} 
                />
              </div>
              {(testItemData.is_add_on === 1 || testItemData.is_add_on === '1') && (
                <div>
                  <label>加测原因</label>
                  <select 
                    className="input" 
                    value={testItemData.addon_reason || ''} 
                    onChange={e => updateField('addon_reason', e.target.value)}
                    disabled={isFormDisabled}
                  >
                    <option value="">请选择加测原因</option>
                    <option value="增加样品">增加样品</option>
                    <option value="增加测试人员">增加测试人员</option>
                    <option value="样品评估不足">样品评估不足</option>
                    <option value="增加测试时段">增加测试时段</option>
                    <option value="更换设备">更换设备</option>
                  </select>
                </div>
              )}
              <div>
                <label>是否委外</label>
                <select className="input" value={testItemData.is_outsourced ?? 0} onChange={e=>{
                  const isOutsourced = Number(e.target.value);
                  updateField('is_outsourced', isOutsourced);
                  if (isOutsourced) {
                    updateField('test_code', 'OS001');
                  }
                }} disabled={isFormDisabled}>
                  <option value={0}>否</option>
                  <option value={1}>是</option>
                </select>
              </div>
              {testItemData.is_outsourced === 1 && (
                <div>
                  <label>委外检测项目 *</label>
                  <input 
                    className="input" 
                    value={testItemData.detail_name || ''} 
                    onChange={e => updateField('detail_name', e.target.value)} 
                    placeholder="请输入委外检测项目名称"
                    disabled={isFormDisabled}
                  />
                </div>
              )}
              <div>
                <label>状态</label>
                <select className="input" value={testItemData.status || 'new'} onChange={e=>updateField('status', e.target.value)} disabled={isFormDisabled}>
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
                    value={businessStaffDisplayText} 
                    onChange={e => {
                      const value = e.target.value;
                      setBusinessStaffDisplayText(value);
                      if (!value) {
                        updateField('current_assignee', '');
                      }
                      searchBusinessStaff(value);
                    }}
                    onFocus={() => searchBusinessStaff(businessStaffDisplayText || '')}
                    placeholder="输入业务员姓名或工号"
                    disabled={isFormDisabled}
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
                      if (!value) {
                        updateField('supervisor_id', '');
                      }
                      searchSupervisors(value);
                    }}
                    onFocus={() => searchSupervisors(supervisorDisplayText || '')}
                    placeholder="输入组长姓名或工号"
                    disabled={isFormDisabled}
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
                    value={employeeDisplayText} 
                    onChange={e => {
                      const value = e.target.value;
                      setEmployeeDisplayText(value);
                      if (!value) {
                        updateField('technician_id', '');
                      }
                      searchEmployees(value);
                    }}
                    onFocus={() => searchEmployees(employeeDisplayText || '')}
                    placeholder="输入实验员姓名或工号"
                    disabled={isFormDisabled}
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
                <select className="input" value={testItemData.arrival_mode || ''} onChange={e=>updateField('arrival_mode', e.target.value)} disabled={isFormDisabled}>
                  <option value="">请选择</option>
                  <option value="on_site">现场</option>
                  <option value="delivery">寄样</option>
                </select>
              </div>
              <div>
                <label>样品是否已到</label>
                <select className="input" value={testItemData.sample_arrival_status || ''} onChange={e=>updateField('sample_arrival_status', e.target.value)} disabled={isFormDisabled}>
                  <option value="">请选择</option>
                  <option value="arrived">已到</option>
                  <option value="not_arrived">未到</option>
                </select>
              </div>
              <div>
                <label>服务加急</label>
                <select className="input" value={testItemData.service_urgency || 'normal'} onChange={e=>updateField('service_urgency', e.target.value)} disabled={isFormDisabled}>
                  <option value="normal">不加急</option>
                  <option value="urgent_1_5x">加急1.5倍</option>
                  <option value="urgent_2x">特急2倍</option>
                </select>
              </div>
              <div>
                <label>备注</label>
                <textarea className="input" rows="2" value={testItemData.note||''} onChange={e=>updateField('note', e.target.value)} disabled={isFormDisabled}></textarea>
              </div>
            </div>
          </div>
        </div>
        <div className="addon-request-modal-footer">
          {request.status === 'approved' ? (
            // 如果申请已通过，只显示关闭按钮
            <button className="btn btn-secondary" onClick={onClose}>
              关闭
            </button>
          ) : currentUser?.role === 'admin' ? (
            // 如果申请未通过且用户是管理员，显示取消和同意按钮
            <>
              <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleApprove} disabled={saving}>
                {saving ? '处理中...' : '同意并加测'}
              </button>
            </>
          ) : (
            // 如果申请未通过且用户不是管理员，只显示关闭按钮
            <button className="btn btn-secondary" onClick={onClose}>
              关闭
            </button>
          )}
        </div>
      </div>

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
  );
};

export default AddonRequestModal;
