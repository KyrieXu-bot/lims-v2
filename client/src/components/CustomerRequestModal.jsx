import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import './CustomerRequestModal.css';

const EMPTY_FORM = {
  applicant_customer_name: '', applicant_contact: '', applicant_address: '', applicant_tel: '', report_email: '',
  payer_name: '', payer_address: '', payer_tel: '', deposit_bank: '', tax_no: '', bank_account: '',
  payer_contact: '', payer_contact_tel: '', payer_email: '', payment_term_days: '', discount_rate: ''
};

export default function CustomerRequestModal({ requestId = null, onClose, onSubmitted }) {
  const readOnly = Boolean(requestId);
  const [form, setForm] = useState(EMPTY_FORM);
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(readOnly);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!requestId) return;
    setLoading(true);
    api.getCustomerRequest(requestId)
      .then((data) => {
        setRequest(data);
        setForm({ ...EMPTY_FORM, ...(data.payload || {}) });
      })
      .catch((error) => {
        alert(error.message);
        onClose();
      })
      .finally(() => setLoading(false));
  }, [requestId]);

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.createCustomerRequest(form);
      alert(result.message);
      onSubmitted?.(result);
      onClose();
    } catch (error) {
      alert(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (key, label, required = false, className = '') => (
    <label className={`customer-request-field-cell ${className}`} htmlFor={`customer-request-${key}`}>
      <span>{required && <b>★</b>}{label}</span>
      <input
        id={`customer-request-${key}`}
        className={`customer-request-input ${className}`}
        value={form[key] ?? ''}
        onChange={(event) => setValue(key, event.target.value)}
        required={required}
        readOnly={readOnly}
      />
    </label>
  );

  return (
    <div className="customer-request-mask" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="customer-request-modal" role="dialog" aria-modal="true" aria-labelledby="customer-request-title">
        <div className="customer-request-header">
          <button type="button" className="customer-request-close" onClick={onClose} aria-label="关闭">×</button>
        </div>
        {loading ? <div className="customer-request-loading">加载中...</div> : (
          <form onSubmit={submit}>
            <h2 id="customer-request-title" className="customer-request-title">客户信息表</h2>
            {readOnly && request && <p className="customer-request-meta">申请 #{request.request_id}　申请人：{request.applicant_name || request.applicant_id}</p>}
            <p className="customer-request-tip">加★内容为必填项 <span>（预付款客户委托方信息可不填）</span></p>
            <div className="customer-request-table">
              <h3>委托方信息 <strong>Applicant Information</strong></h3>
              <div className="customer-request-row two-pairs">{renderField('applicant_customer_name', '委托方名称 Customer Name', true)}{renderField('applicant_contact', '联系人 Contact', true)}</div>
              <div className="customer-request-row applicant-detail-row">
                {renderField('applicant_address', '地址 Address', true, 'two-row-cell')}
                {renderField('applicant_tel', '联系电话 Tel', true)}
                {renderField('report_email', '报告接收邮箱 E-mail')}
              </div>
              <h3>付款方信息 <strong>Payer Information</strong></h3>
              <div className="customer-request-row two-pairs">{renderField('payer_name', '名称 Name', true)}{renderField('payer_address', '地址 Address', true)}</div>
              <div className="customer-request-row two-pairs">{renderField('payer_tel', '电话 Tel')}{renderField('deposit_bank', '开户银行 Deposit Bank')}</div>
              <div className="customer-request-row two-pairs">{renderField('tax_no', '税号 Tax No', true)}{renderField('bank_account', '银行账号 Bank Account')}</div>
              <div className="customer-request-row three-pairs">{renderField('payer_contact', '付款联系人 Payer', true)}{renderField('payer_contact_tel', '联系电话 Tel', true)}{renderField('payer_email', '邮箱 Email')}</div>
              <div className="customer-request-row two-pairs bottom-row">
                {renderField('payment_term_days', '付款周期（天）')}
                <label className="customer-request-field-cell" htmlFor="customer-request-discount_rate">
                  <span>折扣（%）<small>特殊折扣请提前审批</small></span>
                  <input id="customer-request-discount_rate" className="customer-request-input" value={form.discount_rate} onChange={(event) => setValue('discount_rate', event.target.value)} readOnly={readOnly} />
                </label>
              </div>
            </div>
            <div className="customer-request-actions">
              {!readOnly && <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? '提交中...' : '提交审批'}</button>}
              <button className="btn" type="button" onClick={onClose} disabled={submitting}>{readOnly ? '关闭' : '取消'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
