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

export default function PriceEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const [it, setIt] = useState({ is_active: 1, is_outsourced: 0 });
  const navigate = useNavigate();

  useEffect(()=>{
    if (!isNew) api.getPrice(id).then(setIt).catch(e=>alert(e.message));
  }, [id]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!it.category_name) return alert('大类必填');
    if (!it.detail_name) return alert('细项必填');
    if (it.unit_price == null || it.unit_price === '') return alert('单价必填');
    const payload = { ...it, unit_price: Number(it.unit_price) };
    if (isNew) await api.createPrice(payload);
    else await api.updatePrice(id, payload);
    navigate('/price');
  }

  return (
    <div style={{maxWidth: 900}}>
      <h2>{isNew ? '新增检测项目' : `编辑检测项目 #${id}`}</h2>
      <form onSubmit={onSubmit}>
        <div className="grid-3">
          <Field label="大类 *" value={it.category_name} onChange={v=>setIt({...it, category_name:v})} />
          <Field label="细项 *" value={it.detail_name} onChange={v=>setIt({...it, detail_name:v})} />
          <Field label="单价 *" value={it.unit_price} onChange={v=>setIt({...it, unit_price:v})} />
          <Field label="检测代码" value={it.test_code} onChange={v=>setIt({...it, test_code:v})} />
          <Field label="标准号" value={it.standard_code} onChange={v=>setIt({...it, standard_code:v})} />
          <Field label="部门ID" value={it.department_id} onChange={v=>setIt({...it, department_id:v})} />
          <Field label="小组ID" value={it.group_id} onChange={v=>setIt({...it, group_id:v})} />
          <div>
            <label>是否委外</label>
            <select className="input" value={it.is_outsourced ?? 0} onChange={e=>setIt({...it, is_outsourced:Number(e.target.value)})}>
              <option value={0}>否</option>
              <option value={1}>是</option>
            </select>
          </div>
          <div>
            <label>状态</label>
            <select className="input" value={it.is_active ?? 1} onChange={e=>setIt({...it, is_active:Number(e.target.value)})}>
              <option value={1}>启用</option>
              <option value={0}>禁用</option>
            </select>
          </div>
        </div>
        <div>
          <label>备注</label>
          <textarea className="input" rows="2" value={it.note||''} onChange={e=>setIt({...it, note:e.target.value})}></textarea>
        </div>
        <div className="grid-3">
          <Field label="生效开始" value={it.active_from} onChange={v=>setIt({...it, active_from:v})} type="date" />
          <Field label="生效结束" value={it.active_to} onChange={v=>setIt({...it, active_to:v})} type="date" />
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn" type="submit">保存</button>
          <button className="btn" type="button" onClick={()=>navigate('/price')}>取消</button>
        </div>
      </form>
    </div>
  )
}


