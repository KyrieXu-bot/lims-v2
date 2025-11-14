import React, { useEffect, useState } from 'react';
import './CustomerDetailModal.css';
import { api } from '../../api.js';

const Section = ({ title, children }) => (
  <div className="info-section">
    <h3>{title}</h3>
    <div className="info-grid">
      {children}
    </div>
  </div>
);

const Item = ({ label, value, full }) => (
  <div className={`info-item${full ? ' full-width' : ''}`}>
    <label>{label}:</label>
    <span>{value ?? '-'}</span>
  </div>
);

export default function OrderPartyDetailModal({ isOpen, onClose, orderId }) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [payer, setPayer] = useState(null);
  const [commissioner, setCommissioner] = useState(null);

  // 结算状态映射
  const getSettlementStatusText = (status) => {
    const statusMap = {
      'unpaid': '未付款',
      'paid': '已付款',
      'partial': '部分付款'
    };
    return statusMap[status] || status;
  };


  useEffect(() => {
    if (!isOpen || !orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ord = await api.getOrder(orderId);
        if (cancelled) return;
        setOrder(ord);
        const tasks = [];
        if (ord.customer_id) tasks.push(api.getCustomer(ord.customer_id));
        else tasks.push(Promise.resolve(null));
        if (ord.payer_id) tasks.push(api.getPayer(ord.payer_id));
        else tasks.push(Promise.resolve(null));
        if (ord.commissioner_id) tasks.push(api.getCommissioner(ord.commissioner_id));
        else tasks.push(Promise.resolve(null));
        const [cust, pay, comm] = await Promise.all(tasks);
        if (cancelled) return;
        setCustomer(cust);
        setPayer(pay);
        setCommissioner(comm);
      } catch (e) {
        console.error('加载委托单关联信息失败', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true };
  }, [isOpen, orderId]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>委托单关联信息</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ padding: '12px' }}>加载中...</div>
          ) : (
            <div className="customer-info">
              <Section title="委托单信息">
                <Item label="委托单号" value={order?.order_id} />
                <Item label="结算状态" value={getSettlementStatusText(order?.settlement_status)} />
                <Item label="创建时间" value={order?.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : '-'} />
                <Item label="总金额" value={order?.total_price} />
              </Section>

              <Section title="客户信息">
                <Item label="客户ID" value={customer?.customer_id} />
                <Item label="客户名称" value={customer?.customer_name} />
                <Item label="税号" value={customer?.tax_id} />
                <Item label="电话" value={customer?.phone} />
                <Item label="省份" value={customer?.province} />
                <Item label="企业性质" value={customer?.nature} />
                <Item label="企业规模" value={customer?.scale} />
                <Item label="企业等级" value={customer?.grade} />
                <Item label="详细地址" value={customer?.address} full />
                <Item label="开户银行" value={customer?.bank_name} />
                <Item label="银行账号" value={customer?.bank_account} />
              </Section>

              <Section title="付款方信息">
                <Item label="付款方ID" value={payer?.payer_id} />
                <Item label="付款联系人" value={payer?.contact_name} />
                <Item label="联系电话" value={payer?.contact_phone} />
                <Item label="账期(天)" value={payer?.payment_term_days} />
                <Item label="折扣率" value={payer?.discount_rate ? `${payer.discount_rate}%` : ''} />
                <Item label="归属销售" value={payer?.owner_name} />
              </Section>

              <Section title="委托方信息">
                <Item label="委托方ID" value={commissioner?.commissioner_id} />
                <Item label="委托方名称" value={commissioner?.commissioner_name} />
                <Item label="联系人" value={commissioner?.contact_name} />
                <Item label="联系电话" value={commissioner?.contact_phone} />
                <Item label="Email" value={commissioner?.email} />
                <Item label="地址" value={commissioner?.address} full />
              </Section>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}


