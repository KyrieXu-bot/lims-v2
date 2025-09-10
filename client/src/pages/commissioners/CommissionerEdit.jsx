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

export default function CommissionerEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const [it, setIt] = useState({ is_active: 1 });
  const [payerOptions, setPayerOptions] = useState([]);
  const navigate = useNavigate();

  useEffect(()=>{
    api.payersOptions().then(setPayerOptions);
    if (!isNew) api.getCommissioner(id).then(setIt).catch(e=>alert(e.message));
  }, [id]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!it.payer_id) return alert('Payer is required');
    if (!it.contact_name) return alert('Commissioner contact name is required');
    if (isNew) await api.createCommissioner(it);
    else await api.updateCommissioner(id, it);
    navigate('/commissioners');
  }

  return (
    <div style={{maxWidth: 900}}>
      <h2>{isNew ? '新委托人' : `编辑委托人 #${id}`}</h2>
      <form onSubmit={onSubmit}>
        <div className="grid-3">
          <div>
            <label>付款人 *</label>
            <select className="input" value={it.payer_id||''} onChange={e=>setIt({...it, payer_id:Number(e.target.value)})}>
              <option value="">选择一个付款人</option>
              {payerOptions.map(o => (
                <option key={o.payer_id} value={o.payer_id}>{o.label}</option>
              ))}
            </select>
          </div>
          <Field label="委托人联系人 *" value={it.contact_name} onChange={v=>setIt({...it, contact_name:v})} />
          <Field label="电话号码" value={it.contact_phone} onChange={v=>setIt({...it, contact_phone:v})} />
          <Field label="Email" value={it.email} onChange={v=>setIt({...it, email:v})} />
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
          <button className="btn" type="button" onClick={()=>navigate('/commissioners')}>取消</button>
        </div>
      </form>
    </div>
  )
}
