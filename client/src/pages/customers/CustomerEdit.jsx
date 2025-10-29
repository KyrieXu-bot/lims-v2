import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { regions } from '../../utils/china_regions.js';

function Field({label, value, onChange, type='text'}) {
  return (
    <div>
      <label>{label}</label>
      <input className="input" value={value||''} type={type} onChange={e=>onChange(e.target.value)} />
    </div>
  )
}

export default function CustomerEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const [it, setIt] = useState({ is_active: 1 });
  const navigate = useNavigate();

  useEffect(()=>{
    if (!isNew) api.getCustomer(id).then(setIt).catch(e=>alert(e.message));
  }, [id]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!it.customer_name) return alert('Name is required');
    if (!it.tax_id) return alert('Tax ID is required');
    if (isNew) await api.createCustomer(it);
    else await api.updateCustomer(id, it);
    navigate('/customers');
  }

  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');

  const handleProvinceChange = (e) => {
    const p = e.target.value;
    setProvince(p);
    setCity('');
    setDistrict('');
    setIt({ ...it, province: p }); // 初始值就是省
  };

  const handleCityChange = (e) => {
    const c = e.target.value;
    setCity(c);
    setDistrict('');
    setIt({ ...it, province: `${province}${c}` }); // 拼接省市
  };

  const handleDistrictChange = (e) => {
    const d = e.target.value;
    setDistrict(d);
    setIt({ ...it, province: `${province}${city}${d}` }); // 拼接省市区
  };

  return (
    <div style={{maxWidth: 900}}>
      <h2>{isNew ? '新客户' : `编辑客户 #${id}`}</h2>
      <form onSubmit={onSubmit}>
        <div className="grid-3">
          <Field label="姓名 *" value={it.customer_name} onChange={v=>setIt({...it, customer_name:v})} />
          <Field label="税号 *" value={it.tax_id} onChange={v=>setIt({...it, tax_id:v})} />
          <div className="grid-3">
      {/* 省 */}
      <div>
        <label>省份</label>
        <select className="input" value={province} onChange={handleProvinceChange}>
          <option value="">请选择省份</option>
          {Object.keys(regions).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* 市 */}
      <div>
        <label>城市</label>
        <select
          className="input"
          value={city}
          onChange={handleCityChange}
          disabled={!province}
        >
          <option value="">请选择城市</option>
          {province && Object.keys(regions[province]).map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* 区县 */}
      <div>
        <label>区县</label>
        <select
          className="input"
          value={district}
          onChange={handleDistrictChange}
          disabled={!city}
        >
          <option value="">请选择区县</option>
          {province && city && regions[province][city].map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
    </div>
          <Field label="电话号码" value={it.phone} onChange={v=>setIt({...it, phone:v})} />
          <Field label="银行名称" value={it.bank_name} onChange={v=>setIt({...it, bank_name:v})} />
          <Field label="银行账户" value={it.bank_account} onChange={v=>setIt({...it, bank_account:v})} />
          {/* 性质 */}
            <div>
              <label>性质</label>
              <select
                className="input"
                value={it.nature || ''}
                onChange={e=>setIt({...it, nature:e.target.value})}
              >
                <option value="">请选择</option>
                <option value="集萃体系">集萃体系</option>
                <option value="高校">高校</option>
                <option value="第三方检测机构">第三方检测机构</option>
                <option value="其他企业">其他企业</option>
                <option value="个人">个人</option>
                <option value="研究所">研究所</option>
              </select>
            </div>

            {/* 规模 */}
            <div>
              <label>规模</label>
              <select
                className="input"
                value={it.scale || ''}
                onChange={e=>setIt({...it, scale:e.target.value})}
              >
                <option value="">请选择</option>
                <option value="0-50">0-50</option>
                <option value="50-100">50-100</option>
                <option value="100-500">100-500</option>
                <option value="500-1000">500-1000</option>
                <option value="1000以上">1000以上</option>
              </select>
            </div>

            {/* 合作时间 */}
            <div>
              <label>合作时间</label>
              <input
                className="input"
                type="month"
                value={it.cooperation_time || ''}
                onChange={e=>setIt({...it, cooperation_time:e.target.value})}
              />
            </div>
        </div>
        <div>
          <label>地址</label>
          <textarea className="input" rows="2" value={it.address||''} onChange={e=>setIt({...it, address:e.target.value})}></textarea>
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
          <button className="btn" type="button" onClick={()=>navigate('/customers')}>取消</button>
        </div>
      </form>
    </div>
  )
}
