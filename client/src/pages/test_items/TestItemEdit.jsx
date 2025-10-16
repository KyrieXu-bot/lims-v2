import React, { useEffect, useState } from 'react';
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
  const navigate = useNavigate();

  // 样品类型映射
  const typeMappings = { 
    sampleType: { '板材': 1, '棒材': 2, '粉末': 3, '液体': 4, '其他': 5 } 
  };

  useEffect(()=>{
    if (!isNew) api.getTestItem(id).then(data => {
      // 规范化样品到达状态为英文枚举
      let s = data.sample_arrival_status;
      if (s === '已到') s = 'arrived';
      if (s === '未到') s = 'not_arrived';
      setIt({ ...data, sample_arrival_status: s });
    }).catch(e=>alert(e.message));
    // 加载价格表选项
    api.listPrice({ pageSize: 1000 }).then(res => setPriceOptions(res.data)).catch(e => console.error(e));
    // 加载所有委托单数据用于本地搜索
    loadAllOrders();
    loadPayers();
    loadDepartments();
    loadLabGroups();
  }, [id]);

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
      console.log('付款方API返回:', res);
      setPayers(Array.isArray(res) ? res : (res.data || []));
    } catch (error) {
      console.error('加载付款方数据失败:', error);
    }
  };

  // 加载部门数据
  const loadDepartments = async () => {
    try {
      const res = await api.listDepartments({ pageSize: 1000 });
      console.log('部门API返回:', res);
      setDepartments(Array.isArray(res) ? res : (res.data || []));
    } catch (error) {
      console.error('加载部门数据失败:', error);
    }
  };

  // 加载实验室组数据
  const loadLabGroups = async () => {
    try {
      const res = await api.listLabGroups({ pageSize: 1000 });
      console.log('实验室组API返回:', res);
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
    };
  }, [searchTimeout]);

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

  // 选择委托单号
  const selectOrder = async (order) => {
    setSelectedOrder(order);
    setIt({...it, order_id: order.order_id});
    setShowOrderSuggestions(false);
    
    // 获取该委托单的完整信息，包括payer_id
    try {
      console.log('选择的委托单:', order);
      const orderDetail = await api.getOrder(order.order_id);
      console.log('委托单详情:', orderDetail);
      
      if (orderDetail.payer_id) {
        console.log('委托单的付款方ID:', orderDetail.payer_id);
        const payer = payers.find(p => p.payer_id === orderDetail.payer_id);
        console.log('找到的付款方:', payer);
        if (payer) {
          setIt(prev => ({...prev, discount_rate: payer.discount_rate || 0}));
          console.log('已设置折扣率:', payer.discount_rate);
        } else {
          console.log('未找到对应的付款方');
        }
      } else {
        console.log('委托单没有付款方ID');
      }
    } catch (error) {
      console.error('获取委托单详情失败:', error);
    }
  };

  // 选择价格项目
  const selectPriceItem = (priceItem) => {
    console.log('选择的价格项目:', priceItem);
    console.log('可用的部门数据:', departments);
    console.log('可用的实验室组数据:', labGroups);
    
    setSelectedPrice(priceItem);
    setIt(prev => ({
      ...prev,
      price_id: priceItem.price_id,
      category_name: priceItem.category_name,
      detail_name: priceItem.detail_name,
      test_code: priceItem.test_code,
      is_outsourced: priceItem.is_outsourced,
      unit_price: priceItem.unit_price
    }));
    
    // 根据选择的项目自动填充部门和组别信息
    if (priceItem.department_id) {
      console.log('价格项目的部门ID:', priceItem.department_id, typeof priceItem.department_id);
      console.log('所有部门数据:', departments);
      const department = departments.find(d => d.department_id == priceItem.department_id);
      console.log('找到的部门:', department);
      if (department) {
        setIt(prev => ({...prev, department_id: priceItem.department_id}));
        console.log('已设置部门ID:', priceItem.department_id);
      }
    } else {
      console.log('价格项目没有部门ID');
    }
    
    if (priceItem.group_id) {
      console.log('价格项目的小组ID:', priceItem.group_id, typeof priceItem.group_id);
      console.log('所有实验室组数据:', labGroups);
      const labGroup = labGroups.find(g => g.group_id == priceItem.group_id);
      console.log('找到的实验室组:', labGroup);
      if (labGroup) {
        setIt(prev => ({...prev, group_id: priceItem.group_id}));
        console.log('已设置小组ID:', priceItem.group_id);
        
        // 注意：lab_groups表中没有supervisor_id字段
        // 如果需要自动填充负责人，需要其他方式获取组长信息
      }
    } else {
      console.log('价格项目没有小组ID');
    }
    
    setShowPriceModal(false);
  };

  async function onSubmit(e) {
    e.preventDefault();
    if (!it.order_id) return alert('委托单号必填');
    if (!it.category_name) return alert('大类必填');
    if (!it.detail_name) return alert('细项必填');
    const payload = { ...it };
    if (payload.unit_price !== undefined && payload.unit_price !== null && payload.unit_price !== '') payload.unit_price = Number(payload.unit_price);
    if (payload.discount_rate !== undefined && payload.discount_rate !== null && payload.discount_rate !== '') payload.discount_rate = Number(payload.discount_rate);
    if (payload.final_unit_price !== undefined && payload.final_unit_price !== null && payload.final_unit_price !== '') payload.final_unit_price = Number(payload.final_unit_price);
    if (payload.line_total !== undefined && payload.line_total !== null && payload.line_total !== '') payload.line_total = Number(payload.line_total);
    if (payload.machine_hours !== undefined && payload.machine_hours !== null && payload.machine_hours !== '') payload.machine_hours = Number(payload.machine_hours);
    if (payload.work_hours !== undefined && payload.work_hours !== null && payload.work_hours !== '') payload.work_hours = Number(payload.work_hours);
    if (payload.quantity !== undefined && payload.quantity !== null && payload.quantity !== '') payload.quantity = Number(payload.quantity);
    
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
            <div style={{position: 'relative'}}>
              <input 
                className="input" 
                value={it.order_id || ''} 
                onChange={e => {
                  const value = e.target.value;
                  setIt({...it, order_id: value});
                  searchOrders(value);
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
              onClick={() => setShowPriceModal(true)}
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
          <Field label="标准号" value={it.standard_code} onChange={v=>setIt({...it, standard_code:v})} disabled={isView} />
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
            <label>价格备注</label>
            <textarea 
              className="input" 
              rows="2" 
              value={it.price_note || ''} 
              onChange={e => setIt({...it, price_note: e.target.value})} 
              disabled={isView}
              placeholder="输入价格相关备注信息"
            />
          </div>
          <div>
            <label>折扣率%</label>
            <input 
              className="input" 
              value={it.discount_rate || ''} 
              disabled 
              style={{background: '#f5f5f5'}}
            />
          </div>
          <Field label="折后单价" value={it.final_unit_price} onChange={v=>setIt({...it, final_unit_price:v})} disabled={isView} />
          <Field label="行小计" value={it.line_total} onChange={v=>setIt({...it, line_total:v})} disabled={isView} />
          <Field label="机时" value={it.machine_hours} onChange={v=>setIt({...it, machine_hours:v})} disabled={isView} />
          <Field label="工时" value={it.work_hours} onChange={v=>setIt({...it, work_hours:v})} disabled={isView} />
          <div>
            <label>是否加测</label>
            <input className="input" value="是" disabled style={{background: '#f5f5f5'}} />
            <input type="hidden" value={1} />
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
          <Field label="当前执行人工号" value={it.current_assignee} onChange={v=>setIt({...it, current_assignee:v})} disabled={isView} />
          <Field label="负责人工号" value={it.supervisor_id} onChange={v=>setIt({...it, supervisor_id:v})} disabled={isView} />
          <Field label="实验员工号" value={it.technician_id} onChange={v=>setIt({...it, technician_id:v})} disabled={isView} />
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
        <div>
          <label>样品预处理</label>
          <textarea className="input" rows="2" value={it.sample_preparation||''} onChange={e=>setIt({...it, sample_preparation:e.target.value})} disabled={isView}></textarea>
        </div>
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
                      api.listPrice({ q: query, pageSize: 100 }).then(res => setPriceOptions(res.data));
                    } else {
                      api.listPrice({ pageSize: 1000 }).then(res => setPriceOptions(res.data));
                    }
                  }}
                />
              </div>
              
              <div className="price-table-container">
                <table className="price-table">
                  <thead>
                    <tr>
                      <th>选择</th>
                      <th>大类</th>
                      <th>细项</th>
                      <th>代码</th>
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
                        <td>¥{price.unit_price}</td>
                        <td>
                          <span className={`price-outsource-badge ${price.is_outsourced ? 'outsourced' : 'internal'}`}>
                            {price.is_outsourced ? '是' : '否'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
