import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { api } from '../../api.js';

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
  const [it, setIt] = useState({ quantity: 1, status: 'new', is_add_on: 1, is_outsourced: 0, machine_hours: 0, work_hours: 0, arrival_mode: '', sample_arrival_status: '' });
  const [orderSuggestions, setOrderSuggestions] = useState([]);
  const [showOrderSuggestions, setShowOrderSuggestions] = useState(false);
  const [priceOptions, setPriceOptions] = useState([]);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const navigate = useNavigate();

  useEffect(()=>{
    if (!isNew) api.getTestItem(id).then(setIt).catch(e=>alert(e.message));
    // 加载价格表选项
    api.listPrice({ pageSize: 1000 }).then(res => setPriceOptions(res.data)).catch(e => console.error(e));
  }, [id]);

  // 搜索委托单号
  const searchOrders = async (query) => {
    if (query.length < 2) {
      setOrderSuggestions([]);
      setShowOrderSuggestions(false);
      return;
    }
    try {
      const res = await api.listOrders({ q: query, pageSize: 20 });
      setOrderSuggestions(res.data);
      setShowOrderSuggestions(true);
    } catch (e) {
      console.error('搜索委托单失败:', e);
    }
  };

  // 选择委托单号
  const selectOrder = (order) => {
    setIt({...it, order_id: order.order_id});
    setShowOrderSuggestions(false);
    // 获取该委托单的折扣率
    if (order.payer_id) {
      api.getPayer(order.payer_id).then(payer => {
        setIt(prev => ({...prev, discount_rate: payer.discount_rate || 0}));
      }).catch(e => console.error('获取折扣率失败:', e));
    }
  };

  // 选择价格项目
  const selectPriceItem = (priceItem) => {
    setIt(prev => ({
      ...prev,
      price_id: priceItem.price_id,
      category_name: priceItem.category_name,
      detail_name: priceItem.detail_name,
      test_code: priceItem.test_code,
      is_outsourced: priceItem.is_outsourced,
      unit_price: priceItem.unit_price
    }));
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
    navigate('/test-items');
  }

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
              {showOrderSuggestions && orderSuggestions.length > 0 && (
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
          
          <Field label="引用价格ID" value={it.price_id} onChange={v=>setIt({...it, price_id:v})} disabled={isView} />
          <Field label="大类 *" value={it.category_name} onChange={v=>setIt({...it, category_name:v})} disabled={isView} />
          <Field label="细项 *" value={it.detail_name} onChange={v=>setIt({...it, detail_name:v})} disabled={isView} />
          <Field label="样品名称" value={it.sample_name} onChange={v=>setIt({...it, sample_name:v})} disabled={isView} />
          <Field label="材质" value={it.material} onChange={v=>setIt({...it, material:v})} disabled={isView} />
          <Field label="样品类型" value={it.sample_type} onChange={v=>setIt({...it, sample_type:v})} disabled={isView} />
          <Field label="原始编号" value={it.original_no} onChange={v=>setIt({...it, original_no:v})} disabled={isView} />
          <Field label="代码" value={it.test_code} onChange={v=>setIt({...it, test_code:v})} disabled={isView} />
          <Field label="标准号" value={it.standard_code} onChange={v=>setIt({...it, standard_code:v})} disabled={isView} />
          <Field label="执行部门ID" value={it.department_id} onChange={v=>setIt({...it, department_id:v})} disabled={isView} />
          <Field label="执行小组ID" value={it.group_id} onChange={v=>setIt({...it, group_id:v})} disabled={isView} />
          <Field label="数量" value={it.quantity} onChange={v=>setIt({...it, quantity:v})} disabled={isView} />
          <Field label="单价" value={it.unit_price} onChange={v=>setIt({...it, unit_price:v})} disabled={isView} />
          <Field label="折扣率%" value={it.discount_rate} onChange={v=>setIt({...it, discount_rate:v})} disabled={isView} />
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
            <select className="input" value={it.is_outsourced ?? 0} onChange={e=>setIt({...it, is_outsourced:Number(e.target.value)})} disabled={isView}>
              <option value={0}>否</option>
              <option value={1}>是</option>
            </select>
          </div>
          <Field label="顺序号" value={it.seq_no} onChange={v=>setIt({...it, seq_no:v})} />
          <div>
            <label>状态</label>
            <select className="input" value={it.status || 'new'} onChange={e=>setIt({...it, status:e.target.value})} disabled={isView}>
              <option value="new">新建</option>
              <option value="assigned">已分配</option>
              <option value="running">进行中</option>
              <option value="waiting_review">待审核</option>
              <option value="report_uploaded">已传报告</option>
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
              <option value="已到">已到</option>
              <option value="未到">未到</option>
              <option value="部分到达">部分到达</option>
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
          <button className="btn" type="button" onClick={()=>navigate('/test-items')}>{isView ? '返回' : '取消'}</button>
        </div>
      </form>

      {/* 价格表选择模态框 */}
      {showPriceModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000
        }}>
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            maxWidth: '800px',
            maxHeight: '80vh',
            overflow: 'auto',
            width: '90%'
          }}>
            <h3>选择价格项目</h3>
            <div style={{marginBottom: '16px'}}>
              <input 
                className="input" 
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
            <table className="table" style={{fontSize: '14px'}}>
              <thead>
                <tr>
                  <th>选择</th><th>大类</th><th>细项</th><th>代码</th><th>单价</th><th>委外</th>
                </tr>
              </thead>
              <tbody>
                {priceOptions.map(price => (
                  <tr key={price.price_id}>
                    <td>
                      <button 
                        type="button" 
                        className="btn" 
                        onClick={() => selectPriceItem(price)}
                        style={{padding: '4px 8px', fontSize: '12px'}}
                      >
                        选择
                      </button>
                    </td>
                    <td>{price.category_name}</td>
                    <td>{price.detail_name}</td>
                    <td>{price.test_code}</td>
                    <td>{price.unit_price}</td>
                    <td>{price.is_outsourced ? '是' : '否'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{marginTop: '16px', textAlign: 'right'}}>
              <button 
                className="btn" 
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


