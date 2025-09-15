import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';

function Field({label, value, onChange, type='text'}) {
  return (
    <div>
      <label>{label}</label>
      <input className="input" value={value||''} type={type} onChange={e=>onChange(e.target.value)} />
    </div>
  )
}

export default function TestItemEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const [it, setIt] = useState({ quantity: 1, status: 'new', is_add_on: 0, is_outsourced: 0, machine_hours: 0, work_hours: 0 });
  const navigate = useNavigate();

  useEffect(()=>{
    if (!isNew) api.getTestItem(id).then(setIt).catch(e=>alert(e.message));
  }, [id]);

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
      <h2>{isNew ? '新增检测项目' : `编辑检测项目 #${id}`}</h2>
      <form onSubmit={onSubmit}>
        <div className="grid-3">
          <Field label="委托单号 *" value={it.order_id} onChange={v=>setIt({...it, order_id:v})} />
          <Field label="引用价格ID" value={it.price_id} onChange={v=>setIt({...it, price_id:v})} />
          <Field label="大类 *" value={it.category_name} onChange={v=>setIt({...it, category_name:v})} />
          <Field label="细项 *" value={it.detail_name} onChange={v=>setIt({...it, detail_name:v})} />
          <Field label="样品名称" value={it.sample_name} onChange={v=>setIt({...it, sample_name:v})} />
          <Field label="材质" value={it.material} onChange={v=>setIt({...it, material:v})} />
          <Field label="样品类型" value={it.sample_type} onChange={v=>setIt({...it, sample_type:v})} />
          <Field label="原始编号" value={it.original_no} onChange={v=>setIt({...it, original_no:v})} />
          <Field label="代码" value={it.test_code} onChange={v=>setIt({...it, test_code:v})} />
          <Field label="标准号" value={it.standard_code} onChange={v=>setIt({...it, standard_code:v})} />
          <Field label="执行部门ID" value={it.department_id} onChange={v=>setIt({...it, department_id:v})} />
          <Field label="执行小组ID" value={it.group_id} onChange={v=>setIt({...it, group_id:v})} />
          <Field label="数量" value={it.quantity} onChange={v=>setIt({...it, quantity:v})} />
          <Field label="单价" value={it.unit_price} onChange={v=>setIt({...it, unit_price:v})} />
          <Field label="折扣率%" value={it.discount_rate} onChange={v=>setIt({...it, discount_rate:v})} />
          <Field label="折后单价" value={it.final_unit_price} onChange={v=>setIt({...it, final_unit_price:v})} />
          <Field label="行小计" value={it.line_total} onChange={v=>setIt({...it, line_total:v})} />
          <Field label="机时" value={it.machine_hours} onChange={v=>setIt({...it, machine_hours:v})} />
          <Field label="工时" value={it.work_hours} onChange={v=>setIt({...it, work_hours:v})} />
          <div>
            <label>是否加测</label>
            <select className="input" value={it.is_add_on ?? 0} onChange={e=>setIt({...it, is_add_on:Number(e.target.value)})}>
              <option value={0}>否</option>
              <option value={1}>是</option>
            </select>
          </div>
          <div>
            <label>是否委外</label>
            <select className="input" value={it.is_outsourced ?? 0} onChange={e=>setIt({...it, is_outsourced:Number(e.target.value)})}>
              <option value={0}>否</option>
              <option value={1}>是</option>
            </select>
          </div>
          <Field label="顺序号" value={it.seq_no} onChange={v=>setIt({...it, seq_no:v})} />
          <div>
            <label>状态</label>
            <select className="input" value={it.status || 'new'} onChange={e=>setIt({...it, status:e.target.value})}>
              <option value="new">新建</option>
              <option value="assigned">已分配</option>
              <option value="running">进行中</option>
              <option value="waiting_review">待审核</option>
              <option value="report_uploaded">已传报告</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </div>
          <Field label="当前执行人工号" value={it.current_assignee} onChange={v=>setIt({...it, current_assignee:v})} />
        </div>
        <div>
          <label>样品预处理</label>
          <textarea className="input" rows="2" value={it.sample_preparation||''} onChange={e=>setIt({...it, sample_preparation:e.target.value})}></textarea>
        </div>
        <div>
          <label>备注</label>
          <textarea className="input" rows="2" value={it.note||''} onChange={e=>setIt({...it, note:e.target.value})}></textarea>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn" type="submit">保存</button>
          <button className="btn" type="button" onClick={()=>navigate('/test-items')}>取消</button>
        </div>
      </form>
    </div>
  )
}


