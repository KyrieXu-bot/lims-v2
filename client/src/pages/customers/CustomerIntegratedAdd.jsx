import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { regions } from '../../utils/china_regions.js';
import './CustomerIntegratedAdd.css';

function Field({label, value, onChange, type='text', required=false, placeholder=''}) {
  return (
    <div className="form-field">
      <label>{label}{required && <span className="required">*</span>}</label>
      <input 
        className="input" 
        type={type} 
        value={value||''} 
        onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

function SelectField({label, value, onChange, options, required=false, placeholder='请选择'}) {
  return (
    <div className="form-field">
      <label>{label}{required && <span className="required">*</span>}</label>
      <select className="input" value={value||''} onChange={e=>onChange(e.target.value)} required={required}>
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function AutocompleteField({label, value, onChange, options, onCreate, required=false, placeholder='输入以搜索...', disabled=false, onPreFill, onClear}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);

  useEffect(() => {
    if (searchTerm) {
      const filtered = options.filter(opt => 
        (opt.label && opt.label.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (opt.value && String(opt.value).toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredOptions(filtered);
      setShowOptions(true);
    } else {
      setFilteredOptions([]);
      setShowOptions(false);
    }
  }, [searchTerm, options]);

  // 当value改变时，尝试匹配选项并设置selectedOption
  useEffect(() => {
    if (typeof value === 'object' && value !== null) {
      // value是option对象
      setSelectedOption(value);
      setSearchTerm(value.contact_name || value.label || '');
    } else if (value) {
      // value是字符串
      setSearchTerm(value);
      const matchedOption = options.find(opt => opt.contact_name === value || opt.label === value);
      setSelectedOption(matchedOption || null);
    } else {
      setSearchTerm('');
      setSelectedOption(null);
    }
  }, [value, options]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    // 清空已选择项
    setSelectedOption(null);
    onChange(val);
  };

  const handleSelect = (option) => {
    // 传递完整的option对象
    setSelectedOption(option);
    setSearchTerm(option.contact_name || option.label || '');
    onChange(option);
    setShowOptions(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && filteredOptions.length === 0 && searchTerm.trim()) {
      // 没有匹配的选项，创建新的
      if (onCreate) {
        onCreate(searchTerm);
      }
    }
  };

  const handlePreFill = () => {
    if (onPreFill && selectedOption) {
      onPreFill(selectedOption);
    }
  };

  const handleClear = () => {
    setSearchTerm('');
    setSelectedOption(null);
    if (onClear) {
      onClear();
    }
  };

  const hasActions = onPreFill && onClear;

  return (
    <div className="form-field autocomplete-field">
      <label>{label}{required && <span className="required">*</span>}</label>
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
        <input 
          className="input" 
          type="text"
          value={searchTerm} 
          onChange={handleInputChange}
          onFocus={() => !disabled && setShowOptions(true)}
          onBlur={() => setTimeout(() => setShowOptions(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          disabled={disabled}
          style={{ flex: 1 }}
        />
        {hasActions && (
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              type="button"
              onClick={handlePreFill}
              disabled={!selectedOption || disabled}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                backgroundColor: '#28a745',
                color: 'white',
                border: '1px solid #28a745',
                borderRadius: '4px',
                cursor: !selectedOption || disabled ? 'not-allowed' : 'pointer',
                opacity: !selectedOption || disabled ? 0.6 : 1,
                whiteSpace: 'nowrap'
              }}
              title="预填"
            >
              预填
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={!searchTerm || disabled}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: '1px solid #dc3545',
                borderRadius: '4px',
                cursor: !searchTerm || disabled ? 'not-allowed' : 'pointer',
                opacity: !searchTerm || disabled ? 0.6 : 1,
                whiteSpace: 'nowrap'
              }}
              title="清空"
            >
              清空
            </button>
          </div>
        )}
      </div>
      {showOptions && filteredOptions.length > 0 && (
        <div className="autocomplete-options">
          {filteredOptions.map((opt, idx) => (
            <div 
              key={idx} 
              className="autocomplete-option"
              onMouseDown={() => handleSelect(opt)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomerIntegratedAdd() {
  const navigate = useNavigate();
  
  // 客户信息
  const [customer, setCustomer] = useState({
    customer_name: '',
    tax_id: '',
    address: '',
    phone: '',
    bank_name: '',
    bank_account: '',
    nature: '',
    scale: '',
    cooperation_time: '',
    is_active: 1
  });
  
  // 付款人信息
  const [payer, setPayer] = useState({
    payer_id: null,
    contact_name: '',
    contact_phone: '',
    payment_term_days: '',
    discount_rate: '',
    owner_user_id: '',
    is_active: 1
  });
  
  // 存储当前选中的客户选项（用于显示）
  const [selectedCustomerOption, setSelectedCustomerOption] = useState(null);
  // 存储当前选中的付款人选项（用于显示）
  const [selectedPayerOption, setSelectedPayerOption] = useState(null);
  
  // 委托人信息
  const [commissioner, setCommissioner] = useState({
    contact_name: '',
    contact_phone: '',
    email: '',
    is_active: 1
  });

  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  
  const [customers, setCustomers] = useState([]);
  const [payers, setPayers] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCustomers();
    loadSales();
  }, []);

  const loadCustomers = async () => {
    try {
      const res = await api.listCustomers({ q: '', page: 1, pageSize: 1000 });
      setCustomers(res.data.map(c => ({ value: c.customer_id, label: c.customer_name })));
    } catch (e) {
      console.error('加载客户列表失败:', e);
    }
  };

  const loadPayers = async (customerId) => {
    try {
      const res = await api.listPayers({ q: '', page: 1, pageSize: 1000, customer_id: customerId });
      // 付款人显示格式：姓名（客户名称-手机号）
      setPayers(res.data.map(p => ({ 
        value: p.payer_id, 
        label: `${p.contact_name}（${p.customer_name}-${p.contact_phone}）`,
        contact_name: p.contact_name,
        contact_phone: p.contact_phone,
        payment_term_days: p.payment_term_days,
        discount_rate: p.discount_rate,
        owner_user_id: p.owner_user_id,
        is_active: p.is_active
      })));
    } catch (e) {
      console.error('加载付款人列表失败:', e);
    }
  };

  const loadSales = async () => {
    try {
      const options = await api.salesOptions();
      setSales(options);
    } catch (e) {
      console.error('加载业务员列表失败:', e);
    }
  };

  const handleProvinceChange = (e) => {
    const p = e.target.value;
    setProvince(p);
    setCity('');
    setDistrict('');
    setCustomer({ ...customer, province: p });
  };

  const handleCityChange = (e) => {
    const c = e.target.value;
    setCity(c);
    setDistrict('');
    setCustomer({ ...customer, province: `${province}${c}` });
  };

  const handleDistrictChange = (e) => {
    const d = e.target.value;
    setDistrict(d);
    setCustomer({ ...customer, province: `${province}${city}${d}` });
  };

  const handleCustomerSelect = async (nameOrOption) => {
    // 只是设置客户名称，不自动预填
    let name;
    
    if (typeof nameOrOption === 'string') {
      name = nameOrOption;
      if (!name || name.trim() === '') {
        setCustomer({ ...customer, customer_name: '', customer_id: null });
        setSelectedCustomerOption(null);
        return;
      }
    } else if (nameOrOption) {
      name = nameOrOption.label;
    } else {
      setCustomer({ ...customer, customer_name: '', customer_id: null });
      setSelectedCustomerOption(null);
      return;
    }
    
    // 只更新名称
    setCustomer({ ...customer, customer_name: name, customer_id: null });
    // 查找并设置对应的option（用于显示和预填判断）
    const existingCustomer = customers.find(c => c.label === name);
    setSelectedCustomerOption(existingCustomer || null);
  };

  const handleCustomerPreFill = async (option) => {
    if (!option || !option.value) return;
    
    // 客户已存在，预填所有信息
    const customerData = await api.getCustomer(option.value);
    setCustomer({
      customer_id: customerData.customer_id,
      customer_name: customerData.customer_name,
      tax_id: customerData.tax_id,
      address: customerData.address || '',
      phone: customerData.phone || '',
      bank_name: customerData.bank_name || '',
      bank_account: customerData.bank_account || '',
      nature: customerData.nature || '',
      scale: customerData.scale || '',
      cooperation_time: customerData.cooperation_time || '',
      is_active: customerData.is_active
    });
    
    // 处理地址
    if (customerData.province) {
      const provinceNames = Object.keys(regions);
      const matchedProvince = provinceNames.find(p => customerData.province.startsWith(p));
      if (matchedProvince) {
        setProvince(matchedProvince);
        if (customerData.province.length > matchedProvince.length) {
          const rest = customerData.province.substring(matchedProvince.length);
          const cityNames = Object.keys(regions[matchedProvince] || {});
          const matchedCity = cityNames.find(c => rest.startsWith(c));
          if (matchedCity) {
            setCity(matchedCity);
            if (rest.length > matchedCity.length) {
              const districtNames = regions[matchedProvince][matchedCity] || [];
              const matchedDistrict = districtNames.find(d => rest.substring(matchedCity.length).startsWith(d));
              if (matchedDistrict) {
                setDistrict(matchedDistrict);
              }
            }
          }
        }
      }
    }
    
    // 更新selectedCustomerOption
    setSelectedCustomerOption(option);
    
    await loadPayers(customerData.customer_id);
  };

  const handleCustomerClear = () => {
    setCustomer({ 
      customer_name: '', 
      customer_id: null, 
      tax_id: '',
      address: '',
      phone: '',
      bank_name: '',
      bank_account: '',
      nature: '',
      scale: '',
      cooperation_time: '',
      is_active: 1
    });
    setProvince('');
    setCity('');
    setDistrict('');
    setSelectedCustomerOption(null);
    setPayers([]);
    setPayer({ ...payer, contact_name: '', payer_id: null });
    setSelectedPayerOption(null);
    setCommissioner({ ...commissioner, contact_name: '', commissioner_id: null });
  };

  const handlePayerSelect = async (nameOrOption) => {
    // 只设置名称，不自动预填
    let name;
    
    if (typeof nameOrOption === 'string') {
      name = nameOrOption;
      if (!name || name.trim() === '') {
        setPayer({ ...payer, contact_name: '', payer_id: null });
        setSelectedPayerOption(null);
        return;
      }
    } else if (nameOrOption) {
      name = nameOrOption.contact_name || nameOrOption.label;
    } else {
      setPayer({ ...payer, contact_name: '', payer_id: null });
      setSelectedPayerOption(null);
      return;
    }
    
    // 只更新名称
    setPayer({ ...payer, contact_name: name, payer_id: null });
    // 查找并设置对应的option（用于显示和预填判断）
    const existingPayer = payers.find(p => p.contact_name === name);
    setSelectedPayerOption(existingPayer || null);
  };

  const handlePayerPreFill = async (option) => {
    if (!option || !option.value) return;
    
    // 付款人已存在，预填所有信息
    if (option.contact_name && option.contact_phone) {
      // 如果选项中已经有完整信息，直接使用
      setPayer({
        payer_id: option.value,
        contact_name: option.contact_name,
        contact_phone: option.contact_phone,
        payment_term_days: option.payment_term_days || '',
        discount_rate: option.discount_rate || '',
        owner_user_id: option.owner_user_id || '',
        is_active: option.is_active || 1
      });
      setSelectedPayerOption(option);
    } else {
      // 从API获取完整信息
      const payerData = await api.getPayer(option.value);
      setPayer({
        payer_id: payerData.payer_id,
        contact_name: payerData.contact_name,
        contact_phone: payerData.contact_phone || '',
        payment_term_days: payerData.payment_term_days || '',
        discount_rate: payerData.discount_rate || '',
        owner_user_id: payerData.owner_user_id || '',
        is_active: payerData.is_active
      });
      const fullOption = payers.find(p => p.value === option.value);
      setSelectedPayerOption(fullOption || option);
    }
  };

  const handlePayerClear = () => {
    setPayer({ 
      payer_id: null, 
      contact_name: '', 
      contact_phone: '', 
      payment_term_days: '', 
      discount_rate: '', 
      owner_user_id: '', 
      is_active: 1 
    });
    setSelectedPayerOption(null);
    setCommissioner({ ...commissioner, contact_name: '', commissioner_id: null });
  };

  const handleCommissionerChange = (val) => {
    setCommissioner({ ...commissioner, contact_name: val, commissioner_id: null });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!customer.customer_name) {
      alert('请输入客户名称');
      return;
    }
    if (!customer.tax_id) {
      alert('请输入税号');
      return;
    }

    setLoading(true);
    
    try {
      // 1. 创建或更新客户
      let customerId;
      if (customer.customer_id) {
        await api.updateCustomer(customer.customer_id, customer);
        customerId = customer.customer_id;
      } else {
        const newCustomer = await api.createCustomer(customer);
        customerId = newCustomer.customer_id;
      }

      // 2. 创建或更新付款人
      let payerId;
      if (!payer.contact_name) {
        // 如果没有输入付款人，创建默认的
        const defaultPayer = await api.createPayer({
          customer_id: customerId,
          contact_name: customer.customer_name,
          contact_phone: customer.phone,
          is_active: 1
        });
        payerId = defaultPayer.payer_id;
      } else if (payer.payer_id) {
        await api.updatePayer(payer.payer_id, { ...payer, customer_id: customerId });
        payerId = payer.payer_id;
      } else {
        const newPayer = await api.createPayer({ ...payer, customer_id: customerId });
        payerId = newPayer.payer_id;
      }

      // 3. 创建或更新委托人
      if (commissioner.contact_name) {
        if (commissioner.commissioner_id) {
          await api.updateCommissioner(commissioner.commissioner_id, { ...commissioner, payer_id: payerId });
        } else {
          await api.createCommissioner({ ...commissioner, payer_id: payerId });
        }
      }

      alert('保存成功！');
      navigate('/customers');
    } catch (error) {
      console.error('保存失败:', error);
      alert(`保存失败: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="integrated-add-container">
      <h2>新增客户/付款人/委托人</h2>
      
      <form onSubmit={handleSubmit} className="integrated-form">
        {/* 客户信息区域 */}
        <div className="form-section">
          <div className="section-header">
            <h3>客户信息</h3>
            <div className="section-divider"></div>
          </div>
          
          <div className="section-content">
            <AutocompleteField
              label="客户名称"
              value={selectedCustomerOption || customer.customer_name}
              onChange={handleCustomerSelect}
              options={customers}
              onCreate={(name) => setCustomer({...customer, customer_name: name})}
              onPreFill={handleCustomerPreFill}
              onClear={handleCustomerClear}
              required
              placeholder="输入客户名称进行搜索..."
            />
            
            <Field
              label="税号"
              value={customer.tax_id}
              onChange={(val) => setCustomer({...customer, tax_id: val})}
              required
              placeholder="输入税号"
            />
            
            <div className="form-row">
              <div className="form-group">
                <label>省份</label>
                <select className="input" value={province} onChange={handleProvinceChange}>
                  <option value="">请选择省份</option>
                  {Object.keys(regions).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>城市</label>
                <select className="input" value={city} onChange={handleCityChange} disabled={!province}>
                  <option value="">请选择城市</option>
                  {province && Object.keys(regions[province]).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>区县</label>
                <select className="input" value={district} onChange={handleDistrictChange} disabled={!city}>
                  <option value="">请选择区县</option>
                  {province && city && regions[province][city].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <Field label="电话号码" value={customer.phone} onChange={(val) => setCustomer({...customer, phone: val})} placeholder="输入电话号码" />
            <Field label="地址" value={customer.address} onChange={(val) => setCustomer({...customer, address: val})} placeholder="输入地址" />
            <Field label="银行名称" value={customer.bank_name} onChange={(val) => setCustomer({...customer, bank_name: val})} placeholder="输入银行名称" />
            <Field label="银行账户" value={customer.bank_account} onChange={(val) => setCustomer({...customer, bank_account: val})} placeholder="输入银行账户" />
            
            <SelectField
              label="性质"
              value={customer.nature}
              onChange={(val) => setCustomer({...customer, nature: val})}
              options={[
                { value: '集萃体系', label: '集萃体系' },
                { value: '高校', label: '高校' },
                { value: '第三方检测机构', label: '第三方检测机构' },
                { value: '其他企业', label: '其他企业' },
                { value: '个人', label: '个人' },
                { value: '研究所', label: '研究所' }
              ]}
            />
            
            <SelectField
              label="规模"
              value={customer.scale}
              onChange={(val) => setCustomer({...customer, scale: val})}
              options={[
                { value: '0-50', label: '0-50' },
                { value: '50-100', label: '50-100' },
                { value: '100-500', label: '100-500' },
                { value: '500-1000', label: '500-1000' },
                { value: '1000以上', label: '1000以上' }
              ]}
            />
            
            <Field label="合作时间" type="month" value={customer.cooperation_time} onChange={(val) => setCustomer({...customer, cooperation_time: val})} placeholder="选择合作时间" />
            
            <SelectField
              label="状态"
              value={customer.is_active}
              onChange={(val) => setCustomer({...customer, is_active: Number(val)})}
              options={[
                { value: 1, label: '启用' },
                { value: 0, label: '禁用' }
              ]}
            />
          </div>
        </div>

        {/* 付款人信息区域 */}
        <div className="form-section">
          <div className="section-header">
            <h3>付款人信息</h3>
            <div className="section-divider"></div>
          </div>
          
          <div className="section-content">
            <AutocompleteField
              label="付款人"
              value={selectedPayerOption || payer.contact_name}
              onChange={handlePayerSelect}
              options={payers}
              onCreate={(name) => setPayer({...payer, contact_name: name})}
              onPreFill={handlePayerPreFill}
              onClear={handlePayerClear}
              placeholder="输入付款人姓名进行搜索..."
            />
            
            <Field label="联系电话" value={payer.contact_phone} onChange={(val) => setPayer({...payer, contact_phone: val})} placeholder="输入联系电话" />
            <Field label="付款期限(天)" type="number" value={payer.payment_term_days} onChange={(val) => setPayer({...payer, payment_term_days: val})} placeholder="输入付款期限" />
            <Field label="折扣(%)" type="number" value={payer.discount_rate} onChange={(val) => setPayer({...payer, discount_rate: val})} placeholder="输入折扣率" />
            
            <SelectField
              label="业务负责人"
              value={payer.owner_user_id}
              onChange={(val) => setPayer({...payer, owner_user_id: val})}
              options={[{value: '', label: '未分配'}, ...sales.map(s => ({value: s.user_id, label: `${s.name}（${s.user_id}）`}))]}
              placeholder="选择业务负责人"
            />
            
            <SelectField
              label="状态"
              value={payer.is_active}
              onChange={(val) => setPayer({...payer, is_active: Number(val)})}
              options={[
                { value: 1, label: '启用' },
                { value: 0, label: '禁用' }
              ]}
            />
          </div>
        </div>

        {/* 委托人信息区域 */}
        <div className="form-section">
          <div className="section-header">
            <h3>委托人信息</h3>
            <div className="section-divider"></div>
          </div>
          
          <div className="section-content">
            <Field
              label="委托人"
              value={commissioner.contact_name}
              onChange={handleCommissionerChange}
              placeholder="输入委托人姓名"
            />
            
            <Field label="联系电话" value={commissioner.contact_phone} onChange={(val) => setCommissioner({...commissioner, contact_phone: val})} placeholder="输入联系电话" />
            <Field label="邮箱" type="email" value={commissioner.email} onChange={(val) => setCommissioner({...commissioner, email: val})} placeholder="输入邮箱地址" />
            
            <SelectField
              label="状态"
              value={commissioner.is_active}
              onChange={(val) => setCommissioner({...commissioner, is_active: Number(val)})}
              options={[
                { value: 1, label: '启用' },
                { value: 0, label: '禁用' }
              ]}
            />
          </div>
        </div>

        {/* 提交按钮 */}
        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </button>
          <button className="btn" type="button" onClick={() => navigate('/customers')} disabled={loading}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
}

