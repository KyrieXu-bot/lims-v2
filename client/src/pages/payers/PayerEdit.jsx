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

export default function PayerEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const [it, setIt] = useState({ is_active: 1 });
  const [customerOptions, setCustomerOptions] = useState([]);
  const navigate = useNavigate();

  useEffect(()=>{
    api.customersOptions().then(setCustomerOptions);
    if (!isNew) api.getPayer(id).then(setIt).catch(e=>alert(e.message));
  }, [id]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!it.customer_id) return alert('Customer is required');
    if (!it.contact_name) return alert('Payer contact name is required');
    if (isNew) await api.createPayer(it);
    else await api.updatePayer(id, it);
    navigate('/payers');
  }

  return (
    <div style={{maxWidth: 900}}>
      <h2>{isNew ? '新付款人' : `编辑付款人 #${id}`}</h2>
      <form onSubmit={onSubmit}>
        <div className="grid-3">
          <div>
              <label>客户 *</label>
            <select className="input" value={it.customer_id||''} onChange={e=>setIt({...it, customer_id:Number(e.target.value)})}>
              <option value="">选择一个客户</option>
              {customerOptions.map(o => (
                <option key={o.customer_id} value={o.customer_id}>{o.customer_name} ({o.tax_id})</option>
              ))}
            </select>
          </div>
            <Field label="付款人联系人 *" value={it.contact_name} onChange={v=>setIt({...it, contact_name:v})} />
          <Field label="电话号码" value={it.contact_phone} onChange={v=>setIt({...it, contact_phone:v})} />
          <Field label="付款期限 (天)" value={it.payment_term_days} onChange={v=>setIt({...it, payment_term_days:v})} />
          <Field label="折扣 (%)" value={it.discount_rate} onChange={v=>setIt({...it, discount_rate:v})} />
        </div>
        <div>
          <label>状态</label>
          <select className="input" value={it.is_active ?? 1} onChange={e=>setIt({...it, is_active:Number(e.target.value)})}>
            <option value={1}>启用</option>
            <option value={0}>禁用</option>
          </select>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn" type="submit">保存</button>
          <button className="btn" type="button" onClick={()=>navigate('/payers')}>取消</button>
        </div>
      </form>
    </div>
  )
}
